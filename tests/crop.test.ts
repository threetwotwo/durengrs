// Harvest engine rules shared with the WhatsApp bot (see the bot's lib/season.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { treeCrops, cropFunnel } from '../src/lib/crop';
import { blockSeasons } from '../src/lib/guide';

const today = '2026-10-05';
const trees: any[] = [
  { id: 'B1', block: 'B', variant: 'MK', condition: 'healthy' },
  { id: 'B2', block: 'B', variant: 'MK', condition: 'healthy' },
];
const variants: any[] = [{ code: 'MK', name: 'Musang King', ripeningDays: 120 }];
const cycles: any[] = [{ block: 'B', floweredOn: '2026-09-15' }];

test('a flowering recorded on the block date counts once (one crop per date, as on WhatsApp)', () => {
  const blooms: any[] = [{ id: 'B1_2026-09-15_lower', treeId: 'B1', block: 'B', date: '2026-09-15', part: 'lower' }];
  const seasons = blockSeasons(trees, variants, cycles, blooms, today);
  const crops = treeCrops(trees, seasons, cycles, blooms, [], [], today);
  const b1 = crops.find((c) => c.tree.id === 'B1')!;
  assert.equal(b1.waves.length, 1);
  assert.equal(b1.waves[0].partial, false); // the whole-tree block flowering outranks the partial record
});

test('an archived tree keeps its harvest in the season total; whole-block entries still count', () => {
  const seasons = blockSeasons(trees, variants, cycles, [], today);
  const harvests: any[] = [
    { id: 'h1', block: 'B', treeId: 'B1', variant: 'MK', date: '2026-10-01', fruits: 12, problems: [] },
    { id: 'h2', block: 'B', treeId: 'B9', variant: 'MK', date: '2026-10-01', fruits: 5, problems: [] }, // B9 archived
    { id: 'h3', block: 'B', variant: 'MK', date: '2026-10-02', fruits: 3, problems: [] }, // whole block
    { id: 'h4', block: 'B', treeId: 'B8', variant: 'MK', date: '2026-10-01', fruits: 7, problems: [] }, // unknown tree
  ];
  const crops = treeCrops(trees, seasons, cycles, [], [], harvests, today);
  assert.equal(cropFunnel(crops, seasons, harvests, new Set(['B9'])).harvested.fruits, 12 + 5 + 3);
  assert.equal(cropFunnel(crops, seasons, harvests).harvested.fruits, 12 + 3);
});
