import test from 'node:test';
import assert from 'node:assert/strict';

test('grading board and prices have their own tabs; their old Harvest addresses still land there', async () => {
  const { parseHash } = await import('../src/lib/router');
  for (const [hash, tab] of [['#/grades', 'grades'], ['#/harvest/grades', 'grades'], ['#/prices', 'prices'], ['#/harvest/prices?week=2026-11-09', 'prices'], ['#/more', 'more'], ['#/schedule', 'schedule'], ['#/harvest/kupas', 'harvest']] as const) {
    const r = parseHash(hash);
    assert.equal(r.tab, tab, hash);
    assert.equal(r.known, true, hash);
  }
  assert.equal(parseHash('#/harvest/prices').prices, true);
  assert.equal(parseHash('#/grades').board, true);
  assert.equal(parseHash('#/harvest/kupas').kupas, true);
});
