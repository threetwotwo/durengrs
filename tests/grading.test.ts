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

test('grades: A3 at 74% high (sellable), D29 at 71% not up to standard, D8 at 40% low', () => {
  assert.equal(GRADE_FROM.high, 72);
  assert.equal(gradeOf(74), 'high');
  assert.equal(gradeOf(71), 'mid');
  assert.equal(gradeOf(50), 'mid');
  assert.equal(gradeOf(40), 'low');
});
