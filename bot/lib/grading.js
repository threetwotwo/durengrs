// lib/grading.js — a tree's grade for the harvest Flow, the same as the webapp's (src/lib/grading.ts): management
// grades a tree from one sampled fruit (treeGrades), 14 criteria with weights (points = weight × score / 5), High
// from 70%, Mid from 50%, Low below; management's own call (the QC sheet's MGMT QC) stands over the total; the tree's
// grade is its newest sampling that has one. What the grade means at the packing house:
//   High      -> red band when the fruit is over 1.5 kg, round, perfect skin (else yellow): sold fresh, whole
//   Mid-High  -> yellow band: durian kupas, 400 g boxes (frozen)
//   Mid, Low  -> no band: paste, 250 g ziplock
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

/** Which fruit was picked last: its day and number from the fruit code, else the sampling's day (as the webapp). */
function sampleOrder(s) {
  const m = String(s.fruitCode || '').match(/-(\d{4})(\d{2})(\d{2})-(\d+)$/);
  return m ? [`${m[1]}-${m[2]}-${m[3]}`, Number(m[4]), String(s.at || '')] : [String(s.date || ''), 0, String(s.at || '')];
}

/** The tree's grade: its latest graded fruit's (the most like its fruit now): { grade, pct?, date? }, 'ungraded' when none. */
function treeGrade(samples = []) {
  const sorted = [...samples].sort((a, b) => {
    const [x, y] = [sampleOrder(a), sampleOrder(b)];
    return y[0].localeCompare(x[0]) || y[1] - x[1] || y[2].localeCompare(x[2]);
  });
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

/**
 * A High tree's fruit gets the red band only when the fruit itself is up to it (Panduan Sortir & Label): over
 * 1.5 kg, round (shape 4-5), perfect skin (skin 4-5); otherwise yellow. Segments (juring 4-5) aren't in Laporan
 * PANEN, so the packer checks those.
 */
const RED = { minG: 1500, minShape: 4, minSkin: 4 };

/** One fruit's band from its tree's grade and, for a High tree, the fruit's weight, shape and skin. */
function fruitBand(grade, f = {}) {
  if (grade !== 'high') return { band: grade === 'mid' || grade === 'low' ? 'mid' : grade || 'ungraded', why: [] };
  const why = [];
  if (!(Number(f.weightG) > RED.minG)) why.push('≤ 1,5 kg');
  if (!(Number(f.shape) >= RED.minShape)) why.push('bentuk peyang');
  if (!(Number(f.skin) >= RED.minSkin)) why.push('kulit kurang');
  return { band: why.length ? 'midhigh' : 'high', why };
}

/** The worker's lines: the tree's band (workers know the sorting), and for a High tree each fruit's band. */
function gradeLines(treeId, g, { items } = {}) {
  const band = BAND[g.grade] || BAND.ungraded;
  if (g.grade === 'ungraded') return [`${band.emoji} Pohon ${treeId}: *${band.name}* (belum dinilai, untuk QC).`];
  const label = { high: 'HIGH', midhigh: 'MID-HIGH', mid: 'MID', low: 'LOW' }[g.grade];
  const pct = g.pct !== undefined ? `, ${String(g.pct).replace('.', ',')}%` : '';
  if (g.grade !== 'high') return [`${band.emoji} Pohon ${treeId}: *${band.name}* (${label}${pct}).`];
  const head = `${band.emoji} Pohon ${treeId}: HIGH${pct}.`;
  if (!items || !items.length) return [head];
  return [
    head,
    ...items.map((f) => {
      const { band: b, why } = fruitBand('high', f);
      return `${BAND[b].emoji} ${f.code ? f.code.replace(/-\d{4}(\d{4})-/, '-$1-') : 'buah'} ${Math.round(f.weightG).toLocaleString('id-ID')} g → *${BAND[b].name}*${why.length ? ` (${why.join(', ')})` : ''}`;
    }),
  ];
}

/** Loads the tree's samplings (treeGrades) and gives its lines; a failed read says nothing rather than a wrong instruction. */
async function treeGradeLines(byTree, treeId, items) {
  try {
    return gradeLines(treeId, treeGrade(await byTree('treeGrades', treeId)), { items });
  } catch (err) {
    console.error('Tree grade read failed:', err.message);
    return [];
  }
}

module.exports = { sampleTotal, treeGrade, gradeLines, treeGradeLines, fruitBand, GRADE_FROM, BAND, RED };
