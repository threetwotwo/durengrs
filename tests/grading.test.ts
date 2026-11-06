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
  assert.deepEqual(qcTotal({ aroma: 3, skin: 3, shape: 3, qc: all(3) }), { pct: 60, scored: 14, complete: true, grade: 'mid' });
  const part = qcTotal({ aroma: 4, skin: 4, shape: 4 });
  assert.deepEqual([part.scored, part.complete, part.grade, part.pct], [3, false, 'ungraded', 12]);
  assert.equal(qcTotal({ aroma: 4, skin: 4, shape: 4, qc: { ...all(4), manis: 9 } }).scored, 13, 'out of range: not a score');
});

test('grades as management graded the first fruits: A3 74%, D29 71% high; A7 53%, D36 50% mid; D8 40% low', () => {
  assert.equal(GRADE_FROM.high, 70);
  assert.equal(gradeOf(74), 'high');
  assert.equal(gradeOf(71), 'high');
  assert.equal(gradeOf(69.9), 'mid');
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
