// lib/grading.js — a tree's grade for the harvest Flow, the same as the webapp's (src/lib/grading.ts): management
// grades a tree from one sampled fruit (treeGrades), 14 criteria with weights (points = weight × score / 5), High
// from 70%, Mid from 50%, Low below; management's own call (the QC sheet's MGMT QC) stands over the total; the tree's
// grade is its newest sampling that has one. What the grade means at the packing house:
//   High      -> as now: wrapped in banana leaves
//   Mid-High, Mid, Low -> kupas station (only High is wrapped whole)
//   ungraded  -> packed for management's QC
'use strict';
const R = require('./rules');

const WEIGHTS = {
  wangi: 5, kulitBersih: 5, kulitTipis: 5, bentuk: 5, juring: 5, biji: 10, dagingTebal: 10,
  warna: 10, benyek: 5, tekstur: 5, manis: 15, lemak: 10, pahit: 5, unik: 5,
};
const GRADE_FROM = { high: 70, midhigh: 60, mid: 50 };

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
  const set = ['high', 'midhigh', 'mid', 'low'].includes(s.grade) ? s.grade : null;
  const from = (p) => (p >= GRADE_FROM.high ? 'high' : p >= GRADE_FROM.midhigh ? 'midhigh' : p >= GRADE_FROM.mid ? 'mid' : 'low');
  return { pct, complete, grade: set || (complete ? from(pct) : 'ungraded') };
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
/**
 * The rubber band each grade gets at the packing house, as on the farm's board (Panduan Sortir & Label):
 * High red, Mid-High yellow, Mid and Low none, not yet graded green.
 */
const BAND = {
  high: { emoji: '🔴', name: 'KARET MERAH' },
  midhigh: { emoji: '🟡', name: 'KARET KUNING' },
  mid: { emoji: '⚪', name: 'TANPA KARET' },
  low: { emoji: '⚪', name: 'TANPA KARET' },
  ungraded: { emoji: '🟢', name: 'KARET HIJAU' },
};

function gradeLines(treeId, g, { kupasHint = false } = {}) {
  const band = BAND[g.grade] || BAND.ungraded;
  if (g.grade === 'ungraded')
    return [
      `${band.emoji} Pohon ${treeId}: *${band.name}* (belum punya grade).`,
      '👉 Pasang karet hijau dan kemas buahnya untuk *QC manajemen*: serahkan ke manajemen untuk dinilai.',
    ];
  const what = `${g.pct !== undefined ? `${String(g.pct).replace('.', ',')}%, ` : ''}${g.date ? `dinilai ${R.dateLabel(g.date)}` : ''}`.replace(/, $/, '');
  const label = { high: 'HIGH', midhigh: 'MID-HIGH', mid: 'MID', low: 'LOW' }[g.grade];
  const head = `${band.emoji} Pohon ${treeId}: *${band.name}* (grade ${label}${what ? `, ${what}` : ''}).`;
  if (g.grade === 'high') return [head, '👉 Pasang karet merah. Proses seperti biasa: *bungkus daun pisang*.'];
  const put = g.grade === 'midhigh' ? '👉 Pasang karet kuning. ' : '👉 Tanpa karet. ';
  return [
    head,
    `${put}*KUPAS*: bawa buahnya ke *stasiun kupas*.`,
    ...(kupasHint ? [`Jika dikupas di kebun, kirim *KUPAS ${treeId}* (boleh beberapa pohon satu varietas) untuk mencatat kotaknya.`] : []),
  ];
}

/** Loads the tree's samplings (treeGrades) and gives its lines; a failed read says nothing rather than a wrong instruction. */
async function treeGradeLines(byTree, treeId) {
  try {
    return gradeLines(treeId, treeGrade(await byTree('treeGrades', treeId)), { kupasHint: true });
  } catch (err) {
    console.error('Tree grade read failed:', err.message);
    return [];
  }
}

module.exports = { sampleTotal, treeGrade, gradeLines, treeGradeLines, GRADE_FROM, BAND };
