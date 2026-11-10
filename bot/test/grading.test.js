'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../lib/grading');

// A3, 26 Oct on the QC sheet: 74%, HIGH.
const a3 = { wangi: 3, kulitBersih: 2, kulitTipis: 2, bentuk: 2, juring: 3, biji: 2.5, dagingTebal: 4.5, warna: 4.5, benyek: 5, tekstur: 5, manis: 14 / 3, lemak: 4, pahit: 3, unik: 4 };

test('the tree grade is the same as the webapp: totals, management\'s call, newest graded sampling', () => {
  assert.equal(G.sampleTotal({ qc: a3 }).grade, 'high');
  assert.equal(Math.round(G.sampleTotal({ qc: a3 }).pct), 74);
  assert.equal(G.sampleTotal({ grade: 'low' }).grade, 'low', 'B29: LOW with no scores');
  assert.equal(G.sampleTotal({ qc: { manis: 5 } }).grade, 'ungraded');
  const g = G.treeGrade([
    { date: '2026-10-26', qc: a3 },
    { date: '2026-11-06', qc: { manis: 5 } }, // newer, unfinished: the older stands
  ]);
  assert.deepEqual([g.grade, Math.round(g.pct), g.date], ['high', 74, '2026-10-26']);
  assert.equal(G.treeGrade([]).grade, 'ungraded');
});

test('what the worker is told: the board\'s rubber band and what to do with the fruit', () => {
  const t = (g) => G.gradeLines('A3', g).join('\n');
  assert.match(t({ grade: 'high', pct: 74, date: '2026-10-26' }), /KARET MERAH\* \(grade HIGH, 74%, dinilai 26 Okt 2026\)[\s\S]*karet merah[\s\S]*daun pisang/);
  assert.match(t({ grade: 'midhigh' }), /KARET KUNING\* \(grade MID-HIGH\)[\s\S]*karet kuning[\s\S]*stasiun kupas/);
  assert.match(t({ grade: 'mid' }), /TANPA KARET\* \(grade MID\)[\s\S]*stasiun kupas/);
  assert.match(t({ grade: 'low' }), /TANPA KARET\* \(grade LOW\)[\s\S]*stasiun kupas/);
  assert.match(t({ grade: 'ungraded' }), /KARET HIJAU\* \(belum punya grade\)[\s\S]*QC manajemen/);
});

test('a failed read says nothing', async () => {
  assert.deepEqual(await G.treeGradeLines(async () => { throw new Error('down'); }, 'A3'), []);
  assert.match((await G.treeGradeLines(async () => [{ date: '2026-10-27', grade: 'midhigh' }], 'A6')).join(' '), /KARET KUNING/);
});
