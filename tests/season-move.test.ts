import test from 'node:test';
import assert from 'node:assert/strict';
import { isBloomCorrection, seasonMovePlan } from '../src/lib/insights';

const X = '2026-06-17', Y = '2026-06-19';
const count = (treeId: string, season: string, stage = 'onTree', date = '2026-10-05', extra = {}) => ({ id: `${treeId}_${season}_${stage}_${date}`, treeId, block: 'A', season, stage, date, count: 10, ...extra });
const task = (season: string, t = 'bagging') => ({ id: `A_${season}_${t}`, block: 'A', season, task: t, date: '2026-08-01' });

test('a correction is a nearby date; a new season is not', () => {
  assert.equal(isBloomCorrection(X, Y), true);
  assert.equal(isBloomCorrection(X, X), false);
  assert.equal(isBloomCorrection(undefined, Y), false);
  assert.equal(isBloomCorrection('2025-11-20', '2026-10-05'), false); // next season: last season's records stay put
});

test('correcting a block bloom date moves its counts and tasks', () => {
  const plan = seasonMovePlan('A', X, Y, [count('A2', X, 'onTree', '2026-10-05', { source: 'whatsapp' }), count('B1', X, 'onTree', '2026-10-05', { block: 'B' })], [task(X)], []);
  assert.deepEqual(plan.map((m) => [m.collection, m.from, m.to]), [
    ['cropCounts', `A2_${X}_onTree_2026-10-05`, `A2_${Y}_onTree_2026-10-05`],
    ['seasonTasks', `A_${X}_bagging`, `A_${Y}_bagging`],
  ]);
  assert.equal(plan[0].data.season, Y);
  assert.equal(plan[0].data.source, 'whatsapp');
  assert.equal('id' in plan[0].data, false);
});

test('a tree that flowered whole on the old date keeps its counts, and the block tasks stay', () => {
  const blooms = [{ id: `A3_${X}_whole`, treeId: 'A3', block: 'A', date: X, part: 'whole' }];
  const plan = seasonMovePlan('A', X, Y, [count('A2', X), count('A3', X)], [task(X)], blooms);
  assert.deepEqual(plan.map((m) => m.from), [`A2_${X}_onTree_2026-10-05`]);
});

test('a branches-only record on the old date does not hold the tree back', () => {
  const blooms = [{ id: `A2_${X}_lower`, treeId: 'A2', block: 'A', date: X, part: 'lower' }];
  assert.equal(seasonMovePlan('A', X, Y, [count('A2', X)], [], blooms).length, 1);
});

test('a record already at the new date is never overwritten', () => {
  const plan = seasonMovePlan('A', X, Y, [count('A2', X), count('A2', Y)], [task(X), task(Y)], []);
  assert.equal(plan.length, 0);
});
