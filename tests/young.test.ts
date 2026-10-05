// Newly planted blocks (every tree under YOUNG_YEARS) have no season to record yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blockSeasons, isYoungTree, YOUNG_YEARS } from '../src/lib/guide';

const today = '2026-10-05';
const now = Date.parse(`${today}T12:00:00`);

test('a tree planted less than YOUNG_YEARS ago is young; an unknown planting date is not', () => {
  assert.equal(YOUNG_YEARS, 4);
  assert.equal(isYoungTree({ id: 'E1', block: 'E', datePlanted: '2024-09-01' } as any, now), true);
  assert.equal(isYoungTree({ id: 'A1', block: 'A', datePlanted: '2018-08-01' } as any, now), false);
  assert.equal(isYoungTree({ id: 'X1', block: 'X' } as any, now), false);
});

test('a block is young only when every tree in it is young', () => {
  const trees: any[] = [
    { id: 'E1', block: 'E', variant: 'MK', datePlanted: '2025-01-10' },
    { id: 'E2', block: 'E', variant: 'MK', datePlanted: '2024-09-01' },
    { id: 'C23', block: 'C', variant: 'MK', datePlanted: '2024-09-01' },
    { id: 'C1', block: 'C', variant: 'MK', datePlanted: '2018-08-01' },
  ];
  const seasons = blockSeasons(trees, [], [], [], today);
  assert.equal(seasons.find((s) => s.block === 'E')!.young, true);
  assert.equal(seasons.find((s) => s.block === 'C')!.young, false);
});
