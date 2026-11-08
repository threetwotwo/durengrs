import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortBox, yields } from '../src/lib/kupas';
import { parseHash } from '../src/lib/router';

test('kupas box codes and the yield of a tree\'s picking', () => {
  assert.equal(shortBox('K-A6-20261105-01'), 'K-A6-1105-01');
  const y = yields(
    [
      { id: '1', code: 'K-A6-20261105-01', treeId: 'A6', fruitDate: '2026-11-05', date: '2026-11-07', weightG: 400 },
      { id: '2', code: 'K-A6-20261105-02', treeId: 'A6', fruitDate: '2026-11-05', date: '2026-11-07', weightG: 460 },
    ],
    () => 2860
  );
  assert.equal(y.get('A6|2026-11-05')?.kupasG, 860);
  assert.equal(y.get('A6|2026-11-05')?.pct, 30.1);
});

test('#/harvest/kupas is a page', () => {
  const r = parseHash('#/harvest/kupas');
  assert.equal(r.kupas, true);
  assert.equal(r.known, true);
});
