import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxTrees, shortBox, yields } from '../src/lib/kupas';
import { parseHash } from '../src/lib/router';

test('kupas box codes and the yield of a peeling (one variety, several trees)', () => {
  assert.equal(shortBox('K-MK-20261109-01'), 'K-MK-1109-01');
  const fruitCodes = ['A6-20261105-02', 'A7-20261108-01'];
  const boxes = [
    { id: '1', code: 'K-MK-20261109-01', variety: 'MK', treeIds: ['A6', 'A7'], fruitCodes, date: '2026-11-09', weightG: 400 },
    { id: '2', code: 'K-MK-20261109-02', variety: 'MK', treeIds: ['A6', 'A7'], fruitCodes, date: '2026-11-09', weightG: 410, fruitG: 3190 },
  ];
  const y = yields(boxes, () => 3190);
  assert.equal(y.get(fruitCodes.join(','))?.kupasG, 810);
  assert.equal(y.get(fruitCodes.join(','))?.pct, 25.4);
  assert.deepEqual(boxTrees({ id: 'x', code: 'K-A6-20261105-01', treeId: 'A6', date: '2026-11-07', weightG: 400 }), ['A6'], 'older boxes');
});

test('#/harvest/kupas is a page', () => {
  const r = parseHash('#/harvest/kupas');
  assert.equal(r.kupas, true);
  assert.equal(r.known, true);
});
