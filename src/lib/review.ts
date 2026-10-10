import { collection, deleteField, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeTimestamp } from '../context/FarmContext';
import { toDateStr } from './treatments';
import { HEALTH_INFO, healthOf, isFarmStage, isIssue, triageText, type FarmStage, type Health, type Issue, type Triage } from '../shared';
import type { DurianTree, TreeReport } from '../types';

/**
 * Review inbox: a person confirms (or corrects) what the system read from a worker's report. Only a review changes
 * the tree: its observed stage, and its condition when this is the tree's latest report. See docs/data-contract.md.
 */

export interface ReviewValues {
  stage?: FarmStage;
  issues: Issue[];
  health?: Health;
  improving?: boolean;
}

/** The report's suggestion: stored triage (bot or photo model) or, if none, the free rule-based reading of its words. */
export function reportTriage(r: TreeReport): Triage {
  return r.triage || triageText(r.description);
}

/** The condition a report stands for: what a review confirmed, else what it set (older 'minor_issue' read as 'minor'). */
export function reportCondition(r: TreeReport): string {
  if (r.review && r.review.decision !== 'dismissed' && r.health) return HEALTH_INFO[r.health].condition;
  const c = String(r.conditionAfter || '').toLowerCase();
  return c === 'minor_issue' ? 'minor' : c || 'not_assessed';
}

/** Waiting for a person: not reviewed yet and not a plain "all fine". */
export const needsReview = (r: TreeReport) => !r.review && reportTriage(r).needsReview;

/**
 * What to propose in the review: the stored suggestion, except that a condition the worker chose themselves (older
 * Flow) is kept rather than replaced by a reading of their words.
 */
export function suggestedValues(t: Triage, report?: TreeReport): ReviewValues {
  const workerHealth = report?.conditionSource === 'worker' ? healthOf(report.conditionAfter) : null;
  const v: ReviewValues = { issues: t.issues.map((i) => i.code), improving: t.improving };
  if (t.stage) v.stage = t.stage.code;
  const health = workerHealth || t.health;
  if (health) v.health = health;
  return v;
}

/** What a person checked earlier (to open "Ubah" on), else the suggestion. */
export function currentValues(report: TreeReport): ReviewValues {
  if (!report.review) return suggestedValues(reportTriage(report), report);
  const v: ReviewValues = { issues: (report.issues || []).filter(isIssue), improving: !!report.improving };
  if (report.stage && isFarmStage(report.stage)) v.stage = report.stage;
  if (report.health) v.health = report.health;
  return v;
}

const reportDate = (r: TreeReport) => {
  const ms = normalizeTimestamp(r.createdAt);
  return ms ? toDateStr(new Date(ms)) : toDateStr(new Date());
};

/** Seconds of slack between server timestamps written in the same save. */
const SAME_SAVE_MS = 5000;

export type Decision = 'accepted' | 'corrected' | 'dismissed';

export interface TreeChange {
  observedStage?: { code: FarmStage; date: string; reportId: string } | null;
  condition?: string;
  /** "Membaik" from this report; null clears an earlier one. */
  improving?: { reportId: string; date: string } | null;
}

/**
 * What a review changes on the tree.
 * - Never moves a tree back to an older observation.
 * - The condition follows only the tree's latest report, and never undoes a condition someone set by hand after the
 *   report (or after its last review).
 * - "Tidak yakin" on the report whose stage the tree shows clears that stage.
 * - Dismissing a report whose urgent words turned the tree Merah by themselves puts the tree back as it was.
 */
export function treeChanges(tree: DurianTree, report: TreeReport, v: ReviewValues, decision: Decision = 'accepted'): TreeChange {
  const out: TreeChange = {};
  const date = reportDate(report);
  const created = normalizeTimestamp(report.createdAt);
  const latest = tree.lastReportId === report.id || created >= normalizeTimestamp(tree.lastReportAt);
  const lastTouch = Math.max(created, normalizeTimestamp(report.review?.at)) + SAME_SAVE_MS;
  const handSetSince = normalizeTimestamp(tree.conditionUpdatedAt) > lastTouch;

  if (decision === 'dismissed') {
    const auto = report.conditionSource === 'triage' && report.conditionChanged && report.conditionBefore;
    if (auto && latest && !handSetSince && tree.condition === report.conditionAfter) out.condition = String(report.conditionBefore);
    if (tree.observedStage?.reportId === report.id) out.observedStage = null;
    if (tree.improving?.reportId === report.id) out.improving = null;
    return out;
  }

  if (v.stage && (!tree.observedStage || date >= tree.observedStage.date)) out.observedStage = { code: v.stage, date, reportId: report.id };
  else if (!v.stage && tree.observedStage?.reportId === report.id) out.observedStage = null;

  if (v.health && latest && !handSetSince) {
    const condition = HEALTH_INFO[v.health].condition;
    if (condition !== tree.condition) out.condition = condition;
  }
  if (latest) {
    if (v.improving) out.improving = { reportId: report.id, date };
    else if (tree.improving) out.improving = null;
  }
  return out;
}

type Writer = ReturnType<typeof writeBatch>;

/** The writes for one review. Returns the tree as it is after them (for the next review of the same tree). */
function writeReview(w: Writer, report: TreeReport, tree: DurianTree | undefined, decision: Decision, v: ReviewValues, by?: string): DurianTree | undefined {
  const update: Record<string, unknown> = { review: { decision, ...(by ? { by } : {}), at: serverTimestamp() } };
  if (!report.triage) update.triage = triageText(report.description); // keep what was suggested next to what was decided
  if (decision !== 'dismissed') {
    update.issues = v.issues.filter(isIssue);
    // A correction can also clear a value checked earlier ("tidak yakin").
    if (v.stage && isFarmStage(v.stage)) update.stage = v.stage;
    else if (report.stage) update.stage = deleteField();
    if (v.health) update.health = v.health;
    else if (report.health) update.health = deleteField();
    if (v.improving) update.improving = true;
    else if (report.improving) update.improving = deleteField();
  }
  w.update(doc(db, 'reports', report.id), update);
  if (!tree || tree.active === false) return tree;

  const ch = treeChanges(tree, report, v, decision);
  if (ch.observedStage === undefined && ch.condition === undefined && ch.improving === undefined) return tree;
  const treeUpdate: Record<string, unknown> = { dateUpdated: serverTimestamp() };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const next: DurianTree = { ...tree };
  if (ch.observedStage !== undefined) {
    treeUpdate.observedStage = ch.observedStage ?? deleteField();
    changes.observedStage = { from: tree.observedStage?.code ?? null, to: ch.observedStage?.code ?? null };
    next.observedStage = ch.observedStage ?? undefined;
  }
  if (ch.condition !== undefined) {
    treeUpdate.condition = ch.condition;
    treeUpdate.conditionUpdatedAt = serverTimestamp();
    changes.condition = { from: tree.condition, to: ch.condition };
    // conditionUpdatedAt is left as it was in the running copy: a review is not a hand-set condition, so the next
    // (newer) report of the same tree in acceptAll still applies.
    next.condition = ch.condition as DurianTree['condition'];
  }
  if (ch.improving !== undefined) {
    treeUpdate.improving = ch.improving ?? deleteField();
    changes.improving = { from: !!tree.improving, to: !!ch.improving };
    next.improving = ch.improving ?? undefined;
  }
  w.update(doc(db, 'trees', tree.id), treeUpdate);
  w.set(doc(collection(db, 'treeEdits')), {
    treeId: tree.id, changes, at: serverTimestamp(), source: 'webapp', reason: decision === 'dismissed' ? 'review-dismissed' : 'review', reportId: report.id, ...(by ? { by } : {}),
  });
  return next;
}

/**
 * The tree as the database has it now (only its stored fields: something cleared on another device stays cleared).
 * Offline, the local copy; if even that is missing, the tree as the screen shows it.
 */
async function freshTree(known: DurianTree): Promise<DurianTree | undefined> {
  try {
    const snap = await getDoc(doc(db, 'trees', known.id));
    return snap.exists() ? ({ ...(snap.data() as DurianTree), id: known.id } as DurianTree) : undefined;
  } catch {
    return known;
  }
}

/**
 * One review, against the tree as it is in the database right now (not as the screen last showed it), so a change
 * made meanwhile by a worker, the bot or another person is not overwritten. A plain batch rather than a transaction,
 * so a review made on a weak signal is kept and sent when the connection comes back.
 */
export async function saveReview(report: TreeReport, tree: DurianTree | undefined, decision: Decision, v: ReviewValues, by?: string) {
  const batch = writeBatch(db);
  writeReview(batch, report, tree ? await freshTree(tree) : undefined, decision, v, by);
  await batch.commit();
}
