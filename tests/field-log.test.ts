import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFieldLog, byDay, filterLog } from '../src/lib/fieldLog';

const ts = (iso: string) => ({ seconds: Date.parse(iso) / 1000, nanoseconds: 0 });
const P = '628111886551';
const log = buildFieldLog({
  reports: [{ id: 'r1', treeId: 'A1', workerPhone: P, description: 'Daun kuning', createdAt: ts('2026-10-05T03:00:00Z'), photos: [] } as any],
  blooms: [{ id: 'A1_2026-09-15_middle', treeId: 'A1', block: 'A', date: '2026-09-15', part: 'middle', source: 'whatsapp', workerPhone: P, createdAt: ts('2026-09-16T02:00:00Z') } as any],
  counts: [
    { id: 'c1', treeId: 'A1', block: 'A', season: '2026-09-15', stage: 'clusters', count: 40, date: '2026-10-05', by: P, source: 'whatsapp', createdAt: ts('2026-10-05T04:00:00Z') } as any,
    { id: 'c2', treeId: 'A12', block: 'A', season: '2026-07-20', stage: 'onTree', count: 30, date: '2026-10-01', by: 'Pak Budi', source: 'webapp' } as any,
  ],
  harvests: [{ id: 'h1', block: 'B', treeId: 'B1', variant: 'MK', date: '2026-10-02', fruits: 12, problems: [], source: 'whatsapp', workerPhone: '628122223333', createdAt: ts('2026-10-02T05:00:00Z') } as any],
  tasks: [{ id: 'B_2026-09-15_bagging', block: 'B', season: '2026-09-15', task: 'bagging', date: '2026-10-03', source: 'whatsapp', workerPhone: P } as any],
  rain: [{ date: '2026-10-04', rainMm: 12, source: 'whatsapp', workerPhone: P, updatedAt: ts('2026-10-04T10:00:00Z') } as any],
  edits: [
    { id: 'e1', treeId: 'A1', changes: { trunkSize: { from: 40, to: 43 } }, source: 'whatsapp', workerPhone: P, at: ts('2026-10-03T01:00:00Z') },
    { id: 'e2', treeId: 'A1', changes: { floweringClusters: { from: 5, to: 40 } }, source: 'whatsapp', workerPhone: P, at: ts('2026-10-05T04:00:01Z') }, // written by the count
    { id: 'e3', treeId: 'A1', changes: { estimatedFruitCount: { from: 5, to: 9 } }, source: 'webapp', at: ts('2026-10-01T01:00:00Z') }, // typed in the tree form
  ],
  blockOf: (id) => (id.startsWith('A') ? 'A' : 'B'),
});

test('every kind of record is in one list, newest first', () => {
  assert.deepEqual(log.map((e) => e.key), ['count:c1', 'issue:r1', 'rain:2026-10-04', 'task:B_2026-09-15_bagging', 'edit:e1', 'harvest:h1', 'count:c2', 'edit:e3', 'bloom:A1_2026-09-15_middle']);
});

test('a count is not listed twice through the tree edit it caused', () => {
  assert.equal(log.some((e) => e.key === 'edit:e2'), false);
  assert.equal(log.some((e) => e.key === 'edit:e3'), true); // a hand edit in the webapp stays
});

test('records without a timestamp sit on their own date and say so', () => {
  const c2 = log.find((e) => e.key === 'count:c2')!;
  assert.equal(c2.timed, false);
  const t2 = log.find((e) => e.key === 'task:B_2026-09-15_bagging')!;
  assert.equal(t2.timed, false);
  assert.equal(log.find((e) => e.key === 'count:c1')!.timed, true);
});

test('filters: kind, tree (exact), block, sender, source, period', () => {
  assert.equal(filterLog(log, { kinds: ['count'] }).length, 2);
  assert.deepEqual(filterLog(log, { tree: 'a1' }).map((e) => e.kind).sort(), ['bloom', 'count', 'issue', 'treeData', 'treeData']);
  assert.equal(filterLog(log, { block: 'B' }).length, 2); // harvest B1 + task in block B
  assert.equal(filterLog(log, { who: '0811-188-6551'.replace(/^0/, '62') }).length, 6);
  assert.equal(filterLog(log, { who: 'Pak Budi' }).length, 1);
  assert.equal(filterLog(log, { source: 'webapp' }).length, 2);
  assert.equal(filterLog(log, { since: Date.parse('2026-10-04T00:00:00Z') }).length, 3);
});

test('grouped by day', () => {
  const days = byDay(log);
  assert.equal(days[0].items[0].key, 'count:c1');
  assert.equal(days.reduce((n, d) => n + d.items.length, 0), log.length);
});
