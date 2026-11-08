// lib/grading.js — a tree's grade for the harvest Flow, the same as the webapp's (src/lib/grading.ts): management
// grades a tree from one sampled fruit (treeGrades), 14 criteria with weights (points = weight × score / 5), High
// from 70%, Mid from 50%, Low below; management's own call (the QC sheet's MGMT QC) stands over the total; the tree's
// grade is its newest sampling that has one. What the grade means at the packing house:
//   High      -> as now: wrapped in banana leaves
//   Mid, Low  -> kupas station
//   ungraded  -> packed for management's QC
'use strict';
const R = require('./rules');

const WEIGHTS = {
  wangi: 5, kulitBersih: 5, kulitTipis: 5, bentuk: 5, juring: 5, biji: 10, dagingTebal: 10,
  warna: 10, benyek: 5, tekstur: 5, manis: 15, lemak: 10, pahit: 5, unik: 5,
};
const GRADE_FROM = { high: 70, mid: 50 };

/** A sampling's total (out of 100) and grade: 'high' | 'mid' | 'low' | 'ungraded'. */
function sampleTotal(s = {}) {
  let points = 0;
  let scored = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    const v = s.qc?.[k];
    if (typeof v !== 'number' || v < 0 || v > 5) continue;
    scored++;
    points += (w * v) / 5;
  }
  const pct = Math.round(points * 10) / 10;
  const complete = scored === Object.keys(WEIGHTS).length;
  const set = ['high', 'mid', 'low'].includes(s.grade) ? s.grade : null;
  return { pct, complete, grade: set || (complete ? (pct >= GRADE_FROM.high ? 'high' : pct >= GRADE_FROM.mid ? 'mid' : 'low') : 'ungraded') };
}

/** The tree's current grade from its samplings: { grade, pct?, date? } (grade 'ungraded' when none has one). */
function treeGrade(samples = []) {
  const sorted = [...samples].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.at || '').localeCompare(String(a.at || '')));
  for (const s of sorted) {
    const t = sampleTotal(s);
    if (t.grade !== 'ungraded') return { grade: t.grade, pct: t.complete ? t.pct : undefined, date: s.date };
  }
  return { grade: 'ungraded' };
}

/** The lines for the worker: the tree's grade and what to do with its fruit. */
function gradeLines(treeId, g) {
  if (g.grade === 'ungraded')
    return [`🔍 Pohon ${treeId} *belum punya grade*.`, '👉 Kemas buahnya untuk *QC manajemen*: sisihkan dan serahkan ke manajemen untuk dinilai.'];
  const what = `${g.pct !== undefined ? `${String(g.pct).replace('.', ',')}%, ` : ''}${g.date ? `dinilai ${R.dateLabel(g.date)}` : ''}`.replace(/, $/, '');
  const head = `${g.grade === 'high' ? '⭐' : '🔸'} Grade pohon ${treeId}: *${g.grade.toUpperCase()}*${what ? ` (${what})` : ''}.`;
  return g.grade === 'high'
    ? [head, '👉 Proses seperti biasa: *bungkus daun pisang*.']
    : [head, '👉 *KUPAS*: bawa buahnya ke *stasiun kupas*.'];
}

/** Loads the tree's samplings (treeGrades) and gives its lines; a failed read says nothing rather than a wrong instruction. */
async function treeGradeLines(byTree, treeId) {
  try {
    return gradeLines(treeId, treeGrade(await byTree('treeGrades', treeId)));
  } catch (err) {
    console.error('Tree grade read failed:', err.message);
    return [];
  }
}

module.exports = { sampleTotal, treeGrade, gradeLines, treeGradeLines, GRADE_FROM };
