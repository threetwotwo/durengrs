// lib/trees.js — reads a tree and its latest report. The bot never edits tree data directly: reports, counts and
// Gemini readings update it through lib/reports.js, lib/cropData.js and lib/ai.js.
const { db } = require('./firestore');

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

module.exports = { getTreeRecord, isArchived, getTreeById, getLastReport };
