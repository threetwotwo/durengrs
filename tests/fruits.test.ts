// The fruits table: every fruit from Laporan PANEN as its own row, sorted, summed, checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { byVariety, checkFruit, cleanDeliverTo, fruitRows, fruitsSheet, sortFruits, summarizeFruits, withDeliveries } from '../src/lib/fruits';
import { parseHash } from '../src/lib/router';

const h = (id: string, treeId: string, date: string, variant: string | undefined, items: any[]): any => ({ id, treeId, block: treeId[0], date, variant, fruits: items.length, items });
const f = (code: string | undefined, weightG: number, aroma = 3, skin = 3, shape = 3) => ({ code, weightG, aroma, skin, shape });

test('one row per fruit; a fruit without a code is addressed by its harvest and place; variety from the tree when missing', () => {
  const rows = fruitRows(
    [h('wap_1', 'A3', '2026-10-21', 'ST', [f('A3-20261021-01', 1400), f('A3-20261021-02', 2300)]), h('old', 'B1', '2026-10-20', undefined, [f(undefined, 2000)]), h('wa_x', 'A1', '2026-10-20', 'MK', [])],
    (id) => (id === 'B1' ? 'MK' : undefined)
  );
  assert.deepEqual(rows.map((r) => [r.key, r.variant, r.index]), [['A3-20261021-01', 'ST', 0], ['A3-20261021-02', 'ST', 1], ['old~1', 'MK', 0]]);
});

test('sorting: newest first by default; by weight or variety either way', () => {
  const rows = fruitRows([h('a', 'A1', '2026-10-20', 'MK', [f('A1-1', 2000, 5)]), h('b', 'A2', '2026-10-21', 'ST', [f('A2-1', 1500, 2), f('A2-2', 2600, 4)])]);
  assert.deepEqual(sortFruits(rows, null, false).map((r) => r.key), ['A2-1', 'A2-2', 'A1-1']);
  assert.deepEqual(sortFruits(rows, 'weight', true).map((r) => r.key), ['A2-2', 'A1-1', 'A2-1']);
  assert.deepEqual(sortFruits(rows, 'variant', false).map((r) => r.variant), ['MK', 'ST', 'ST']);
  assert.deepEqual(sortFruits(rows, 'aroma', false).map((r) => r.aroma), [2, 4, 5]);
  const s = summarizeFruits(rows)!;
  assert.deepEqual([s.n, s.kg, s.avgG, s.aroma], [3, 6.1, 2033, 3.7]);
  assert.deepEqual(byVariety(rows).map((v) => [v.variant, v.summary.n]), [['ST', 2], ['MK', 1]]);
});

test('a corrected fruit: grams 300-9000 (a thousands dot is fine), scores whole 1-5; the code is kept', () => {
  assert.deepEqual(checkFruit({ weightG: '2.350', aroma: '4', skin: '5', shape: '3' }, 'A3-1'), { ok: true, value: { code: 'A3-1', weightG: 2350, aroma: 4, skin: 5, shape: 3 } });
  assert.deepEqual(checkFruit({ weightG: '2,5', aroma: '4', skin: '5', shape: '3' }), { ok: false, field: 'weightG' });
  assert.deepEqual(checkFruit({ weightG: '2000', aroma: '6', skin: '5', shape: '3' }), { ok: false, field: 'aroma' });
  assert.deepEqual(checkFruit({ weightG: '2000', aroma: '4', skin: '', shape: '3' }), { ok: false, field: 'skin' });
});

test('addresses: the fruits table and one fruit live under Harvest', () => {
  const list = parseHash('#/harvest/fruits?variant=MK');
  assert.deepEqual([list.tab, list.fruits, list.fruitCode, list.known, list.params.get('variant')], ['harvest', true, null, true, 'MK']);
  const one = parseHash('#/harvest/fruits/A3-20261021-01');
  assert.deepEqual([one.tab, one.fruitCode, one.pageKey], ['harvest', 'A3-20261021-01', 'fruits:A3-20261021-01']);
  assert.equal(parseHash('#/harvest/other').known, false);
});

test('deliver to: typed text tidied; set or taken away per fruit, the rest of the fruit kept; sorted with the empty ones last', () => {
  assert.equal(cleanDeliverTo('  Toko   Jaya  '), 'Toko Jaya');
  assert.equal(cleanDeliverTo('x'.repeat(80)).length, 60);
  const items = [f('A1-1', 2000), { ...f('A1-2', 1500), deliverTo: 'Pak Ali' }, f('A1-3', 1800)];
  const next = withDeliveries(items, [{ index: 0, value: ' Toko Jaya ' }, { index: 1, value: '' }, { index: 9, value: 'nobody' }]);
  assert.deepEqual(next[0], { ...items[0], deliverTo: 'Toko Jaya' });
  assert.deepEqual(next[1], f('A1-2', 1500), 'emptied: no deliverTo field at all');
  assert.equal(next[2], items[2]);
  assert.equal(next.length, 3);
  const rows = fruitRows([h('a', 'A1', '2026-10-20', 'MK', [{ ...f('A1-1', 2000), deliverTo: 'budi' }, f('A1-2', 1500), { ...f('A1-3', 1800), deliverTo: 'Ani' }])]);
  assert.deepEqual(sortFruits(rows, 'deliver', false).map((r) => r.deliverTo || ''), ['Ani', 'budi', '']);
  assert.deepEqual(sortFruits(rows, 'deliver', true).map((r) => r.deliverTo || ''), ['budi', 'Ani', '']);
});

test('CSV: the fruits shown, one row each, weight in kilos, variety code and name', () => {
  const rows = fruitRows([h('a', 'A1', '2026-10-20', 'MK', [{ ...f('A1-20261020-01', 1290, 2, 3, 4), deliverTo: 'Toko Jaya' }])]);
  assert.deepEqual(fruitsSheet(rows, ['Code'], (c) => (c === 'MK' ? 'Musang King' : '')), [
    ['Code'],
    ['A1-20261020-01', 'A1', 'A', 'MK', 'Musang King', '2026-10-20', 1.29, 2, 3, 4, 'Toko Jaya'],
  ]);
});
