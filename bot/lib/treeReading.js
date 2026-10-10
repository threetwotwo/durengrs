// lib/treeReading.js — every report is taken as read: its reading moves the tree on by itself, nobody has to confirm
// it first. The owner can still change a report's reading in the web app (src/lib/review.ts), which corrects the
// tree when it is the tree's latest report.
const { admin, db } = require('./firestore');
const R = require('./rules');
const S = require('./shared');

const FieldValue = admin.firestore.FieldValue;
const now = () => FieldValue.serverTimestamp();
const ms = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return typeof ts.toDate === 'function' ? ts.toDate().getTime() : 0;
};
/** Server timestamps written in the same save can differ by a moment. */
const SAME_SAVE_MS = 5000;
const RANK = { not_assessed: -1, healthy: 0, minor: 1, emergency: 2 };

/**
 * Applies one report's reading to its tree, against the tree as it is now (one transaction):
 * - the stage seen (`observedStage`), unless the tree already shows a stage seen later;
 * - the condition (Hijau / Kuning / Merah → healthy / minor / emergency; urgent words or danger seen → Merah) and
 *   "membaik", only from the tree's latest report, never over a condition someone set by hand after the report or one
 *   a worker chose in an older Flow, and never better than it was from a photo Gemini could not read well;
 * - nothing when the owner already changed this report's reading in the web app (`review`).
 * A changed condition is written on the report (`conditionBefore/After`, `conditionSource: 'triage'`, so the web app
 * can undo it) and every change in `treeEdits` (reason 'report').
 * `dryRun` only says what would change. Returns { changed, condition, stage }.
 */
async function applyReading(reportId, { workerPhone, dryRun = false } = {}) {
  const reportRef = db.collection('reports').doc(reportId);
  return db.runTransaction(async (tx) => {
    const none = { changed: false, condition: null, stage: null };
    const rep = await tx.get(reportRef);
    if (!rep.exists) return none;
    const r = rep.data();
    if (r.review || !r.treeId) return none;
    const treeRef = db.collection('trees').doc(r.treeId);
    const tr = await tx.get(treeRef);
    if (!tr.exists || tr.data().active === false) return none;
    const tree = tr.data();
    const reading = r.triage || {};
    const created = ms(r.createdAt) || Date.now();
    const date = R.todayStr(new Date(created));
    const latest = tree.lastReportId === reportId;
    const handSet = ms(tree.conditionUpdatedAt) > created + SAME_SAVE_MS;

    const update = {};
    const changes = {};
    const seen = tree.observedStage;
    const stage = reading.stage && S.isFarmStage(reading.stage.code) ? reading.stage.code : null;
    // The stage the tree shows came from a later report (the same day counts by the time it was sent)?
    let seenLater = !!seen && String(seen.date || '') > date;
    if (stage && seen && !seenLater && seen.date === date && seen.reportId && seen.reportId !== reportId) {
      const other = await tx.get(db.collection('reports').doc(seen.reportId));
      seenLater = other.exists && ms(other.data().createdAt) > created;
    }
    if (stage && !seenLater && !(seen && seen.code === stage && seen.reportId === reportId)) {
      update.observedStage = { code: stage, date, reportId };
      if (!seen || seen.code !== stage) changes.observedStage = { from: seen ? seen.code : null, to: stage };
    }

    // The condition before this report: what it found, or (when the words already made it Merah at once) what was
    // there before that. A tree never assessed is 'not_assessed', so setting the reading aside can put it back.
    const before = r.conditionChanged ? (r.conditionBefore ?? 'not_assessed') : (tree.condition ?? 'not_assessed');
    // Urgent words keep the tree Merah even when Gemini reads the photos more calmly (the words' reading is kept as
    // `triageRules` once Gemini's replaces it).
    const words = reading.source === 'ai' ? r.triageRules : reading;
    const health = reading.urgent || (words && words.urgent) ? 'merah' : reading.health;
    // A condition the worker chose (an older Flow) is theirs.
    const workerChose = r.conditionSource === 'worker';
    let condition = null;
    if (latest && !handSet && !workerChose && S.HEALTH_INFO[health]) {
      condition = S.HEALTH_INFO[health].condition;
      // A photo Gemini could not read well never makes the tree look better than it is.
      const unclear = reading.source === 'ai' && reading.photoOk === false;
      if (condition !== tree.condition && !(unclear && RANK[condition] <= (RANK[tree.condition] ?? -1))) {
        update.condition = condition;
        // As of the report, so a correction of this report in the web app still moves the tree.
        update.conditionUpdatedAt = r.createdAt || now();
        // The old note described the old condition.
        update.conditionNotes = r.description || null;
        changes.condition = { from: tree.condition ?? null, to: condition };
      }
    }
    if (latest) {
      if (reading.improving) {
        if (!tree.improving || tree.improving.reportId !== reportId) {
          update.improving = { reportId, date };
          changes.improving = { from: !!tree.improving, to: true };
        }
      } else if (tree.improving && tree.improving.reportId !== reportId) {
        update.improving = FieldValue.delete();
        changes.improving = { from: true, to: false };
      }
    }

    const out = { changed: Object.keys(changes).length > 0, condition: changes.condition ? condition : null, stage: changes.observedStage ? stage : null };
    if (dryRun || !Object.keys(update).length) return out;
    update.dateUpdated = now();
    tx.update(treeRef, update);
    if (changes.condition) {
      tx.update(reportRef, { conditionBefore: before, conditionAfter: condition, conditionChanged: condition !== before, conditionSource: 'triage' });
    }
    if (out.changed) {
      tx.set(db.collection('treeEdits').doc(), {
        treeId: r.treeId, changes, at: now(), source: 'whatsapp', reason: 'report', reportId, workerPhone: workerPhone || r.workerPhone || null,
      });
    }
    return out;
  });
}

module.exports = { applyReading };
