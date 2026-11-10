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

test('what the worker is told: the band, where the fruit goes', () => {
  const t = (g, o) => G.gradeLines('A3', g, o).join('\n');
  assert.match(t({ grade: 'high', pct: 74, date: '2026-10-26' }), /grade HIGH \(74%, dinilai 26 Okt 2026\)[\s\S]*Karet merah\* hanya untuk buah > 1,5 kg[\s\S]*fresh di toko[\s\S]*Produksi durian kupas/);
  assert.match(t({ grade: 'midhigh' }), /KARET KUNING\* \(grade MID-HIGH\)[\s\S]*karet kuning[\s\S]*kotak 400 g/);
  assert.match(t({ grade: 'mid' }), /TANPA KARET\* \(grade MID\)[\s\S]*Produksi pasta\*: ziplock 250 g/);
  assert.match(t({ grade: 'low' }), /TANPA KARET[\s\S]*pasta/);
  assert.match(t({ grade: 'ungraded' }), /KARET HIJAU\* \(belum punya grade\)[\s\S]*QC manajemen/);
});

test('a High tree\'s fruit: red only when over 1.5 kg, round and with perfect skin; else yellow', () => {
  assert.deepEqual(G.fruitBand('high', { weightG: 1720, shape: 4, skin: 5 }), { band: 'high', why: [] });
  assert.deepEqual(G.fruitBand('high', { weightG: 1320, shape: 4, skin: 4 }), { band: 'midhigh', why: ['≤ 1,5 kg'] });
  assert.deepEqual(G.fruitBand('high', { weightG: 1600, shape: 3, skin: 2 }).why, ['bentuk peyang', 'kulit kurang']);
  assert.equal(G.fruitBand('mid', { weightG: 2000, shape: 5, skin: 5 }).band, 'mid', 'only High trees get red');
  const msg = G.gradeLines('A3', { grade: 'high' }, { items: [
    { code: 'A3-20261110-01', weightG: 1720, shape: 4, skin: 5 },
    { code: 'A3-20261110-02', weightG: 1320, shape: 4, skin: 4 },
  ] }).join('\n');
  assert.match(msg, /🔴 A3-1110-01 1\.720 g → \*KARET MERAH\*/);
  assert.match(msg, /🟡 A3-1110-02 1\.320 g → \*KARET KUNING\* \(≤ 1,5 kg\)/);
  assert.match(msg, /juring/);
});

test('a failed read says nothing', async () => {
  assert.deepEqual(await G.treeGradeLines(async () => { throw new Error('down'); }, 'A3'), []);
  assert.match((await G.treeGradeLines(async () => [{ date: '2026-10-27', grade: 'midhigh' }], 'A6')).join(' '), /KARET KUNING/);
});

test('the bot takes the latest graded fruit too (A7: fruit 02 after the sheet\'s fruit 01)', () => {
  const full = (v) => ({ wangi: v, kulitBersih: v, kulitTipis: v, bentuk: v, juring: v, biji: v, dagingTebal: v, warna: v, benyek: v, tekstur: v, manis: v, lemak: v, pahit: v, unik: v });
  const g = G.treeGrade([
    { date: '2026-11-04', fruitCode: 'A7-20261104-01', qc: full(2.65), grade: 'midhigh', at: '2026-11-09T11:09' },
    { date: '2026-11-04', fruitCode: 'A7-20261104-02', qc: full(3.6), at: '2026-11-07T04:26' },
  ]);
  assert.equal(g.grade, 'high');
});
