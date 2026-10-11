// The Count page: what a tree held before a count, a typed count, a column pasted from Google Sheets, progress.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCount, expectedBefore, isNewestOfKind, pastCounts, pastedColumn, roundSummary } from '../src/lib/recount';

const W1 = '2026-06-01';
const W2 = '2026-09-01';
const c = (treeId: string, season: string, stage: any, date: string, count: number): any => ({ id: `${treeId}_${season}_${stage}_${date}`, treeId, block: 'A', season, stage, date, count });

test('earlier counts: newest first, one figure per day added up over flowerings, other kinds and seasons left out', () => {
  const counts = [
    c('A1', W1, 'kept', '2026-08-01', 50),
    c('A1', W1, 'onTree', '2026-09-10', 44),
    c('A1', W2, 'set', '2026-09-10', 6),
    c('A1', W1, 'onTree', '2026-10-01', 40),
    c('A1', W1, 'clusters', '2026-06-03', 120), // flower clusters: another kind
    c('A1', '2025-06-01', 'onTree', '2025-09-01', 70), // last season
    c('A1', W1, 'onTree', '2026-10-11', 38), // the round's own day: not "earlier"
  ];
  assert.deepEqual(pastCounts(counts, [W1, W2], 'onTree', '2026-10-11'), [
    { date: '2026-10-01', count: 40, stage: 'onTree' },
    { date: '2026-09-10', count: 50, stage: 'onTree' },
    { date: '2026-08-01', count: 50, stage: 'kept' },
  ]);
  assert.deepEqual(pastCounts(counts, [W1, W2], 'clusters', '2026-10-11'), [{ date: '2026-06-03', count: 120, stage: 'clusters' }]);
  // Same day, two stages of one flowering: the later stage stands.
  assert.deepEqual(pastCounts([c('A1', W1, 'set', '2026-07-01', 80), c('A1', W1, 'kept', '2026-07-01', 60)], [W1], 'onTree', '2026-10-11'), [
    { date: '2026-07-01', count: 60, stage: 'kept' },
  ]);
});

test('what the tree held before: last fruit count minus fruit picked since, else the tree estimate from before the day', () => {
  const counts = [c('A1', W1, 'onTree', '2026-10-01', 40), c('A1', W1, 'onTree', '2026-10-11', 30)];
  const harvests = [
    { date: '2026-09-20', fruits: 9 }, // before the last count: already left out of it
    { date: '2026-10-05', fruits: 4 },
    { date: '2026-10-11', fruits: 1 }, // picked on the day, before counting
    { date: '2026-10-12', fruits: 5 }, // after
  ];
  assert.equal(expectedBefore(counts, harvests, [W1], 'onTree', '2026-10-11'), 35);
  // No count yet: the tree's estimate (from the sheet or WhatsApp) if it was set before the day.
  assert.equal(expectedBefore([], [], [W1], 'onTree', '2026-10-11', { count: 45, date: '2026-09-01' }), 45);
  assert.equal(expectedBefore([], [], [W1], 'onTree', '2026-10-11', { count: 45, date: '2026-10-11' }), undefined);
  assert.equal(expectedBefore([], [], [], 'onTree', '2026-10-11', { count: 45, date: '2026-09-01' }), undefined, 'no flowering this season');
  // Flower clusters: the last count of each flowering, added up.
  const clusters = [c('A1', W1, 'clusters', '2026-06-02', 100), c('A1', W1, 'clusters', '2026-06-09', 120), c('A1', W2, 'clusters', '2026-09-03', 15)];
  assert.equal(expectedBefore(clusters, [], [W1, W2], 'clusters', '2026-10-11'), 135);
  assert.equal(expectedBefore([], [], [W1], 'clusters', '2026-10-11'), undefined);
});

test('a typed count: whole numbers within the limit; empty is no count', () => {
  assert.deepEqual(checkCount(' 42 ', 'onTree'), { ok: true, value: 42 });
  assert.deepEqual(checkCount('', 'onTree'), { ok: true, value: null });
  assert.deepEqual(checkCount('1.200', 'clusters'), { ok: true, value: 1200 }, 'thousands separator');
  assert.deepEqual(checkCount('4.5', 'onTree'), { ok: false, max: 500 }, 'not a whole number');
  assert.deepEqual(checkCount('501', 'onTree'), { ok: false, max: 500 });
  assert.deepEqual(checkCount('-3', 'onTree'), { ok: false, max: 500 });
  assert.deepEqual(checkCount('abc', 'set'), { ok: false, max: 500 });
});

test('a pasted column: one cell per line, blanks kept in place, first column only; one value is an ordinary paste', () => {
  assert.equal(pastedColumn('42'), null);
  assert.equal(pastedColumn('42\n'), null);
  assert.deepEqual(pastedColumn('42\n38\n\n51\n'), ['42', '38', '', '51']);
  assert.deepEqual(pastedColumn('42\tx\r\n38\ty'), ['42', '38']);
});

test('progress: trees counted, their total, and the change against what those trees held before', () => {
  assert.deepEqual(roundSummary([{ now: 40, before: 45 }, { now: 10 }, { before: 30 }, {}]), { trees: 4, counted: 2, total: 50, compared: 1, change: -5 });
  assert.deepEqual(roundSummary([{ now: 3 }]), { trees: 1, counted: 1, total: 3, compared: 0, change: null });
});

test('only the newest count of its kind becomes the tree figure', () => {
  const counts = [c('A1', W1, 'onTree', '2026-10-20', 30), c('A2', W1, 'clusters', '2026-10-20', 9)];
  assert.equal(isNewestOfKind(counts, 'A1', 'kept', '2026-10-11'), false);
  assert.equal(isNewestOfKind(counts, 'A1', 'clusters', '2026-10-11'), true);
  assert.equal(isNewestOfKind(counts, 'A2', 'onTree', '2026-10-11'), true);
});
