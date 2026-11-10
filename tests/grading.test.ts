// Fruit grading (lib/grading.ts): 14 weighted criteria, 3 from the worker, 11 from management; grade from the total.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CRITERIA, GRADE_FROM, MGMT, gradeOf, qcTotal } from '../src/lib/grading';

const all = (s: number) => Object.fromEntries(MGMT.map((c) => [c.key, s]));

test('the weights make 100%; the worker scores 3 criteria, management 11', () => {
  assert.equal(CRITERIA.reduce((n, c) => n + c.weight, 0), 100);
  assert.equal(MGMT.length, 11);
});

test('total: weight × score / 5; ungraded until all 14 are scored', () => {
  assert.deepEqual(qcTotal({ aroma: 5, skin: 5, shape: 5, qc: all(5) }), { pct: 100, scored: 14, complete: true, grade: 'high' });
  assert.deepEqual(qcTotal({ aroma: 3, skin: 3, shape: 3, qc: all(3) }), { pct: 60, scored: 14, complete: true, grade: 'midhigh' });
  const part = qcTotal({ aroma: 4, skin: 4, shape: 4 });
  assert.deepEqual([part.scored, part.complete, part.grade, part.pct], [3, false, 'ungraded', 12]);
  assert.equal(qcTotal({ aroma: 4, skin: 4, shape: 4, qc: { ...all(4), manis: 9 } }).scored, 13, 'out of range: not a score');
});

test('grades as management graded the first fruits: A3 74%, D29 71% high; A7 53%, D36 50% mid; D8 40% low', () => {
  assert.equal(GRADE_FROM.high, 70);
  assert.equal(gradeOf(74), 'high');
  assert.equal(gradeOf(71), 'high');
  assert.equal(gradeOf(69.9), 'midhigh', 'almost High');
  assert.equal(gradeOf(60), 'midhigh');
  assert.equal(gradeOf(59.9), 'mid');
  assert.equal(gradeOf(53), 'mid');
  assert.equal(gradeOf(50), 'mid');
  assert.equal(gradeOf(40), 'low');
});

test('the QC sheet: exact scores (0 and halves), all 14 by management, and its own grade', () => {
  // A3, 26 Oct: 3 2 2 2 3 | 5 9 9 5 5 | 14 8 3 4 points = 74%
  const pts = { wangi: 3, kulitBersih: 2, kulitTipis: 2, bentuk: 2, juring: 3, biji: 5, dagingTebal: 9, warna: 9, benyek: 5, tekstur: 5, manis: 14, lemak: 8, pahit: 3, unik: 4 };
  const qc = Object.fromEntries(CRITERIA.map((c) => [c.key, Math.round((pts[c.key] / c.weight) * 500) / 100]));
  const q = qcTotal({ aroma: 5, skin: 5, shape: 5, qc });
  assert.equal(Math.round(q.pct), 74);
  assert.equal(q.grade, 'high');
  assert.equal(qcTotal({ aroma: 4, skin: 4, shape: 4, qc: { pahit: 0 } }).scored, 4, 'a 0 from the sheet counts');
  assert.equal(qcTotal({ aroma: 4, skin: 4, shape: 4, qcGrade: 'low' }).grade, 'low', 'B29: LOW with no scores');
  assert.equal(qcTotal({ aroma: 4, skin: 4, shape: 4, qc, qcGrade: 'mid' }).grade, 'mid', "management's call over the total");
});

test('grading lives on the tree: its newest graded sample grades every fruit of it', async () => {
  const { currentGrades } = await import('../src/lib/grading');
  const { fruitGrade, fruitRows, withTreeGrades } = await import('../src/lib/fruits');
  const full = (v: number) => Object.fromEntries(CRITERIA.map((c) => [c.key, v]));
  const g = currentGrades([
    { id: 's1', treeId: 'A6', date: '2026-10-17', qc: full(3) },
    { id: 's2', treeId: 'A6', date: '2026-10-27', grade: 'mid' },
    { id: 's3', treeId: 'A3', date: '2026-10-26', qc: full(4) },
    { id: 's4', treeId: 'A3', date: '2026-11-06', qc: { manis: 5 } }, // newer but not finished: the older one stands
  ]);
  assert.equal(g.get('A6')?.id, 's2');
  assert.equal(g.get('A3')?.id, 's3');
  assert.equal(g.get('A3')?.total.grade, 'high');
  const h = { id: 'h', date: '2026-11-06', treeId: 'A3', block: 'A', items: [{ code: 'A3-20261106-01', weightG: 1195, aroma: 3, skin: 3, shape: 3 }] } as any;
  const rows = withTreeGrades(fruitRows([h, { ...h, id: 'h2', treeId: 'B1' }]), [...g.values()]);
  assert.equal(fruitGrade(rows[0]).grade, 'high', 'a fruit picked after the sampling takes the tree grade');
  assert.equal(fruitGrade(rows[1]).grade, 'ungraded');
});

test("the tree's grade is its latest graded fruit's: the fruit's own day and number, not when it was saved", async () => {
  const { currentGrades } = await import('../src/lib/grading');
  const full = (v: number) => Object.fromEntries(CRITERIA.map((c) => [c.key, v]));
  const g = currentGrades([
    // A7: the sheet's fruit 01 (re-imported later) and the webapp's fruit 02 of the same day: 02 was picked later.
    { id: 'sheet-14', treeId: 'A7', date: '2026-11-04', fruitCode: 'A7-20261104-01', qc: full(2.65), grade: 'midhigh', at: '2026-11-09T11:09' },
    { id: 'w', treeId: 'A7', date: '2026-11-04', fruitCode: 'A7-20261104-02', qc: full(3.6), at: '2026-11-07T04:26' },
    // A3: the sheet's own date (26 Oct) is older than its fruit's (28 Oct).
    { id: 'sheet-3', treeId: 'A3', date: '2026-10-26', fruitCode: 'A3-20261028-03', qc: full(3.7) },
    { id: 'x', treeId: 'A3', date: '2026-10-27', qc: full(2) },
  ]);
  assert.equal(g.get('A7')?.id, 'w');
  assert.equal(g.get('A7')?.total.grade, 'high');
  assert.equal(g.get('A3')?.id, 'sheet-3');
});
