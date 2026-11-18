// Fruit grading (lib/grading.ts): 9 weighted criteria, 3 from the farm team (Laporan PANEN), 6 from the shop team;
// gradings of the old 14 criteria blended in; grade from the total.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CRITERIA, GRADE_FROM, MGMT, gradeOf, qcTotal, sampleTotal, storedScore } from '../src/lib/grading';

const all = (s: number) => Object.fromEntries(MGMT.map((c) => [c.key, s]));

test('the weights make 100%; the worker scores 3 criteria (15%), the shop team 6 (85%)', () => {
  assert.equal(CRITERIA.reduce((n, c) => n + c.weight, 0), 100);
  assert.deepEqual(MGMT.map((c) => [c.key, c.weight]), [['manis', 20], ['creamy', 20], ['daging', 20], ['warna', 15], ['kulitTipis', 5], ['pahit', 5]]);
});

test('total: weight × score / 5; ungraded until all 9 are scored', () => {
  assert.deepEqual(qcTotal({ aroma: 5, skin: 5, shape: 5, qc: all(5) }), { pct: 100, scored: 9, complete: true, grade: 'high' });
  assert.deepEqual(qcTotal({ aroma: 3, skin: 3, shape: 3, qc: all(3) }), { pct: 60, scored: 9, complete: true, grade: 'midhigh' });
  const part = qcTotal({ aroma: 4, skin: 4, shape: 4 });
  assert.deepEqual([part.scored, part.complete, part.grade, part.pct], [3, false, 'ungraded', 12]);
  assert.equal(qcTotal({ aroma: 4, skin: 4, shape: 4, qc: { ...all(4), manis: 9 } }).scored, 8, 'out of range: not a score');
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

test('an old 14-criteria grading: creamy and daging from the old ones blended, the rest as scored (A3 26 Oct)', () => {
  // A3's QC sheet scores (points as 0-5): old total 74%, under the new criteria 76.2%, still High.
  const qc = { wangi: 3, kulitBersih: 2, kulitTipis: 2, bentuk: 2, juring: 3, biji: 2.5, dagingTebal: 4.5, warna: 4.5, benyek: 5, tekstur: 5, manis: 4.67, lemak: 4, pahit: 3, unik: 4 };
  assert.equal(storedScore(qc, 'creamy'), (4 + 5 + 5) / 3);
  assert.equal(storedScore(qc, 'daging'), (4.5 + 2.5 + 3) / 3);
  assert.equal(storedScore({ lemak: 4, tekstur: 5 }, 'creamy'), undefined, 'all three needed');
  assert.equal(storedScore({ ...qc, creamy: 2 }, 'creamy'), 2, 'its own score first');
  const t = sampleTotal({ qc });
  assert.equal(t.complete, true);
  assert.equal(t.grade, 'high');
  assert.equal(Math.round(t.pct), 76);
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

test('scores in halves: 3.5 counts as 3.5 of 5', async () => {
  const { checkQc } = await import('../src/lib/grading');
  assert.equal(checkQc(3.5), 3.5);
  assert.equal(checkQc(3.25), undefined);
  assert.equal(checkQc(0.5), undefined);
  const all = (v: number) => Object.fromEntries(CRITERIA.map((c) => [c.key, v]));
  assert.equal(qcTotal({ aroma: NaN, skin: NaN, shape: NaN, qc: all(3.5) }).pct, 70);
});
