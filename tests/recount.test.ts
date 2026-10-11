// The Count sheet: one number per tree for a day, and how a whole-tree count reads in the season.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCount, countTarget, dayCounts, expectedBefore, isNewestOfKind, pastColumns, pastCounts, pastedColumn, roundSummary } from '../src/lib/recount';
import { fruitRemaining, lastFruitCount } from '../src/shared';
import { treeCrops } from '../src/lib/crop';
import { blockSeasons } from '../src/lib/guide';

const W1 = '2026-06-01';
const W2 = '2026-09-01';
const c = (treeId: string, season: string, stage: any, date: string, count: number): any => ({ id: `${treeId}_${season}_${stage}_${date}`, treeId, block: 'A', season, stage, date, count });

test('one number per tree: fruit goes under the main flowering at its stage, flowers under the newest flowering', () => {
  const waves: any[] = [
    { date: '2026-07-20', partial: false, stage: 'grow' },
    { date: '2026-09-15', partial: true, stage: 'set' },
    { date: '2026-10-05', partial: true, stage: 'bloom' },
  ];
  assert.deepEqual(countTarget(waves, 'fruit', '2026-10-11'), { season: '2026-07-20', stage: 'onTree' });
  assert.deepEqual(countTarget(waves, 'clusters', '2026-10-11'), { season: '2026-10-05', stage: 'clusters' });
  // A day before the newest flowering: only the flowerings that had begun.
  assert.deepEqual(countTarget(waves, 'clusters', '2026-10-01'), { season: '2026-09-15', stage: 'clusters' });
  // Fruit set and thinning stages give those counts; only branches flowering: the oldest of them.
  assert.deepEqual(countTarget([{ date: W2, partial: false, stage: 'set' }], 'fruit', '2026-10-11'), { season: W2, stage: 'set' });
  assert.deepEqual(countTarget([{ date: W2, partial: false, stage: 'thin' }], 'fruit', '2026-10-11'), { season: W2, stage: 'kept' });
  assert.deepEqual(countTarget([{ date: W2, partial: true, stage: 'grow' }], 'fruit', '2026-10-11'), { season: W2, stage: 'onTree' });
  assert.equal(countTarget([], 'fruit', '2026-10-11'), null);
  assert.equal(countTarget([{ date: '2026-10-20', partial: false, stage: 'bloom' }], 'fruit', '2026-10-11'), null);
});

test('a fruit count is the whole tree: the newest count day replaces earlier ones, whatever flowering it is under', () => {
  const counts = [
    c('A1', W1, 'onTree', '2026-10-01', 40), // main flowering
    c('A1', W2, 'set', '2026-10-05', 12), // a worker's count filed under the branches' flowering
  ];
  assert.deepEqual(lastFruitCount(counts, [W1, W2]), { date: '2026-10-05', count: 12 });
  assert.equal(fruitRemaining(counts, [{ date: '2026-10-07', fruits: 2 }], [W1, W2]), 10);
  // Two flowerings counted on the same day add up (the later stage of each).
  const sameDay = [c('A1', W1, 'kept', '2026-10-05', 30), c('A1', W1, 'onTree', '2026-10-05', 28), c('A1', W2, 'set', '2026-10-05', 6)];
  assert.deepEqual(lastFruitCount(sameDay, [W1, W2]), { date: '2026-10-05', count: 34 });
});

test('the season engine: fruit by its newest day, branches flowering apart need no fruit count of their own', () => {
  const trees: any[] = [{ id: 'B1', block: 'B', variant: 'MK', condition: 'healthy' }];
  const variants: any[] = [{ code: 'MK', name: 'Musang King', ripeningDays: 120 }];
  const cycles: any[] = [{ block: 'B', floweredOn: '2026-07-20' }];
  const blooms: any[] = [{ id: 'b', treeId: 'B1', block: 'B', date: '2026-09-20', part: 'some' }];
  const today = '2026-10-11';
  const seasons = blockSeasons(trees, variants, cycles, blooms, today);
  const counts = [
    { ...c('B1', '2026-07-20', 'onTree', '2026-09-01', 50), block: 'B' },
    { ...c('B1', '2026-09-20', 'onTree', '2026-10-08', 44), block: 'B' }, // whole tree, filed under the branches
  ];
  const [crop] = treeCrops(trees, seasons, cycles, blooms, counts, [], today);
  assert.equal(crop.waves.length, 2);
  assert.deepEqual(crop.counts.onTree, { count: 44, date: '2026-10-08' });
  assert.equal(crop.remaining, 44);
  assert.equal(crop.next?.kind === 'onTree' || crop.next?.kind === 'set', false, 'fruit counted for the whole tree is not asked again');
});

test('earlier counts per day and the dated columns', () => {
  const counts = [
    c('A1', W1, 'kept', '2026-08-01', 50),
    c('A1', W1, 'onTree', '2026-09-10', 44),
    c('A1', W2, 'set', '2026-09-10', 6),
    c('A1', W1, 'onTree', '2026-10-01', 40),
    c('A1', W1, 'clusters', '2026-06-03', 120),
    c('A1', '2025-06-01', 'onTree', '2025-09-01', 70), // last season
    c('A1', W1, 'onTree', '2026-10-11', 38), // the day itself
  ];
  const past = pastCounts(counts, [W1, W2], 'fruit', '2026-10-11');
  assert.deepEqual([...past], [['2026-08-01', 50], ['2026-09-10', 50], ['2026-10-01', 40]]);
  assert.deepEqual([...pastCounts(counts, [W1, W2], 'clusters', '2026-10-11')], [['2026-06-03', 120]]);
  // Columns are counting rounds: a day one tree was counted on (a WhatsApp count) gets none, unless there is no round.
  const round = (d: string) => new Map([[d, 10]]);
  const sheet = [...Array(8)].map(() => round('2026-09-24')).concat([new Map([['2026-09-24', 9], ['2026-10-05', 22]]), new Map([['2026-10-08', 38]])]);
  assert.deepEqual(pastColumns(sheet, 3), ['2026-09-24']);
  assert.deepEqual(pastColumns([past, new Map([['2026-09-28', 3]])], 3), ['2026-09-10', '2026-09-28', '2026-10-01']);
  assert.deepEqual(dayCounts(counts, [W1, W2], 'fruit', '2026-10-11').map((x) => x.count), [38]);
});

test('what the tree held before: last fruit count minus fruit picked since, else the tree estimate from before the day', () => {
  const counts = [c('A1', W1, 'onTree', '2026-10-01', 40), c('A1', W1, 'onTree', '2026-10-11', 30)];
  const harvests = [
    { date: '2026-09-20', fruits: 9 },
    { date: '2026-10-05', fruits: 4 },
    { date: '2026-10-11', fruits: 1 }, // picked on the day, before counting
    { date: '2026-10-12', fruits: 5 },
  ];
  assert.equal(expectedBefore(counts, harvests, [W1], 'fruit', '2026-10-11'), 35);
  assert.equal(expectedBefore([], [], [W1], 'fruit', '2026-10-11', { count: 45, date: '2026-09-01' }), 45);
  assert.equal(expectedBefore([], [], [W1], 'fruit', '2026-10-11', { count: 45, date: '2026-10-11' }), undefined);
  const clusters = [c('A1', W1, 'clusters', '2026-06-02', 100), c('A1', W1, 'clusters', '2026-06-09', 120), c('A1', W2, 'clusters', '2026-09-03', 15)];
  assert.equal(expectedBefore(clusters, [], [W1, W2], 'clusters', '2026-10-11'), 135);
});

test('a typed count: whole numbers within the limit; empty is no count', () => {
  assert.deepEqual(checkCount(' 42 ', 'fruit'), { ok: true, value: 42 });
  assert.deepEqual(checkCount('', 'fruit'), { ok: true, value: null });
  assert.deepEqual(checkCount('1.200', 'clusters'), { ok: true, value: 1200 });
  assert.deepEqual(checkCount('4.5', 'fruit'), { ok: false, max: 500 });
  assert.deepEqual(checkCount('501', 'fruit'), { ok: false, max: 500 });
  assert.deepEqual(checkCount('abc', 'fruit'), { ok: false, max: 500 });
});

test('a pasted column: one cell per line, blanks kept in place, first column only; one value is an ordinary paste', () => {
  assert.equal(pastedColumn('42'), null);
  assert.equal(pastedColumn('42\n'), null);
  assert.deepEqual(pastedColumn('42\n38\n\n51\n'), ['42', '38', '', '51']);
  assert.deepEqual(pastedColumn('42\tx\r\n38\ty'), ['42', '38']);
});

test('the day\'s totals, and only the newest count becomes the tree figure', () => {
  assert.deepEqual(roundSummary([{ now: 40, before: 45 }, { now: 10 }, { before: 30 }, {}]), { counted: 2, total: 50, change: -5 });
  assert.deepEqual(roundSummary([{ now: 3 }]), { counted: 1, total: 3, change: null });
  const counts = [c('A1', W1, 'onTree', '2026-10-20', 30), c('A2', W1, 'clusters', '2026-10-20', 9)];
  assert.equal(isNewestOfKind(counts, 'A1', 'fruit', '2026-10-11'), false);
  assert.equal(isNewestOfKind(counts, 'A1', 'clusters', '2026-10-11'), true);
  assert.equal(isNewestOfKind(counts, 'A2', 'fruit', '2026-10-11'), true);
});

test('saving one number for a tree: the day\'s counts become one, keeping its report link and photos', async () => {
  const { planCount } = await import('../src/lib/recount');
  const waves: any[] = [
    { date: W1, partial: false, stage: 'grow' },
    { date: W2, partial: true, stage: 'set' },
  ];
  const tree = { id: 'A1', block: 'A', estimatedFruitCount: 40 };
  const photo = { url: 'u', thumb: 't', medium: 'm' };
  const worker = { ...c('A1', W2, 'set', '2026-10-11', 12), source: 'whatsapp', reportId: 'r9', photos: [photo], by: '6281' };
  const counts = [c('A1', W1, 'onTree', '2026-10-01', 40), worker];
  const plan = planCount({ tree, waves, counts, kind: 'fruit', date: '2026-10-11', value: 35, by: 'Budi' })!;
  // No count under the main flowering that day: the worker's count is kept (its flowering, stage, report) and corrected.
  assert.deepEqual(
    [plan.count.season, plan.count.stage, plan.count.count, plan.count.reportId, plan.count.by, plan.count.photos],
    [W2, 'set', 35, 'r9', 'Budi', [photo]]
  );
  assert.deepEqual(plan.replaces, [worker.id]);
  assert.deepEqual(plan.treeField, { field: 'estimatedFruitCount', from: 40 }, 'newest fruit count: the tree figure follows');
  // A new day: filed under the main flowering at its stage; a later count elsewhere keeps the tree figure.
  const fresh = planCount({ tree, waves, counts: [...counts, c('A1', W1, 'onTree', '2026-10-20', 30)], kind: 'fruit', date: '2026-10-12', value: 33 })!;
  assert.deepEqual([fresh.count.season, fresh.count.stage, fresh.replaces, fresh.treeField], [W1, 'onTree', [], undefined]);
  // Flower clusters go under the newest flowering; with two flowerings the tree's cluster figure is left alone.
  const fl = planCount({ tree, waves, counts, kind: 'clusters', date: '2026-10-12', value: 20 })!;
  assert.deepEqual([fl.count.season, fl.count.stage, fl.treeField], [W2, 'clusters', undefined]);
  assert.equal(planCount({ tree, waves: [], counts, kind: 'fruit', date: '2026-10-12', value: 3 }), null);
});
