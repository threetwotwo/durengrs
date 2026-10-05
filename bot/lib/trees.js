// lib/trees.js
const { admin, db } = require('./firestore');

// The tree document as stored, archived or not (the webapp sets active: false to archive; missing = active).
async function getTreeRecord(treeId) {
  const doc = await db.collection('trees').doc(treeId).get();
  return doc.exists ? doc.data() : null;
}

const isArchived = (tree) => !!tree && tree.active === false;

// An archived tree is closed for reports, so everything that works on a tree treats it as absent.
async function getTreeById(treeId) {
  const tree = await getTreeRecord(treeId);
  return tree && !isArchived(tree) ? tree : null;
}

// The tree's most recent report (tree.lastReportId is set on every report).
async function getLastReport(tree) {
  if (!tree || !tree.lastReportId) return null;
  const doc = await db.collection('reports').doc(tree.lastReportId).get();
  return doc.exists ? doc.data() : null;
}

const R = require('./rules');

// Measurement fields a worker may update, with the same limits as the webapp (rules.js TREE_LIMITS).
const MEASUREMENTS = R.TREE_LIMITS;

const MAX_NOTES_LENGTH = 500;

// Updates only the fields that actually changed and records an audit entry in
// `treeEdits`. `values` holds the raw form strings; an empty value means
// "leave as is". Throws Error with a `.userMessage` for invalid input.
async function updateTreeMeasurements(treeId, values, workerPhone) {
  const ref = db.collection('trees').doc(treeId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      const err = new Error('Tree not found');
      err.userMessage = `Pohon ${treeId} tidak ditemukan.`;
      throw err;
    }
    const tree = snap.data();
    const changes = {};

    for (const [field, rule] of Object.entries(MEASUREMENTS)) {
      const raw = String(values[field] ?? '').trim().replace(',', '.');
      if (raw === '') continue;

      const parsed = R.parseNumber(raw, { label: rule.label, min: rule.min, max: rule.max, integer: rule.integer });
      if (parsed.error) {
        const err = new Error(`Invalid ${field}: ${raw}`);
        err.userMessage = parsed.error;
        err.field = field;
        throw err;
      }
      const value = parsed.value;

      const rounded = Math.round(value * 100) / 100;
      if (tree[field] !== rounded) changes[field] = { from: tree[field] ?? null, to: rounded };
    }

    // Notes are free text and pre-filled in the form, so an empty value means
    // the worker cleared them.
    if (values.notes !== undefined) {
      const notes = String(values.notes ?? '').trim().slice(0, MAX_NOTES_LENGTH);
      if (notes !== String(tree.notes ?? '').trim()) {
        changes.notes = { from: tree.notes ?? null, to: notes || null };
      }
    }

    if (Object.keys(changes).length === 0) return { changes };

    const update = { dateUpdated: admin.firestore.FieldValue.serverTimestamp() };
    for (const [field, change] of Object.entries(changes)) {
      update[field] = change.to === null ? admin.firestore.FieldValue.delete() : change.to;
    }
    tx.update(ref, update);

    tx.set(db.collection('treeEdits').doc(), {
      treeId,
      changes,
      workerPhone: workerPhone || null,
      source: 'whatsapp',
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { changes };
  });
}

module.exports = { getTreeRecord, isArchived, getTreeById, getLastReport, updateTreeMeasurements };
