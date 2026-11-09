'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../lib/kupas');

test('KUPAS with one or more trees, and box weights', () => {
  assert.deepEqual(K.parseKupas('KUPAS A6'), { trees: ['A6'] });
  assert.deepEqual(K.parseKupas('kupas a6, a 7 A6'), { trees: ['A6', 'A7'] });
  assert.equal(K.parseKupas('kupas'), null);
  assert.equal(K.parseKupas('kupas besok ya'), null);
  assert.equal(K.parseKupas('A6'), null);
  assert.deepEqual(K.parseWeights('400 410 395'), [400, 410, 395]);
  assert.deepEqual(K.parseWeights('400, 410; 395 g'), [400, 410, 395]);
  assert.equal(K.parseWeights('MK 150rb'), null);
});

test('one variety per box; several trees allowed', () => {
  assert.deepEqual(K.oneVariety([{ id: 'A6', variant: 'MK' }, { id: 'A7', variant: 'MK' }]), { variety: 'MK' });
  assert.match(K.oneVariety([{ id: 'A6', variant: 'MK' }, { id: 'D29', variant: 'OC' }]).error, /satu varietas[\s\S]*MK: A6; OC: D29/);
});

test('the fruits going in: the trees\' recent fruits not yet in a box', () => {
  const harvests = [
    { treeId: 'A6', date: '2026-11-05', items: [{ code: 'A6-20261105-01', weightG: 1170 }, { code: 'A6-20261105-02', weightG: 1690 }] },
    { treeId: 'A7', date: '2026-11-08', items: [{ code: 'A7-20261108-01', weightG: 1500 }] },
    { treeId: 'A6', date: '2026-10-01', items: [{ code: 'A6-20261001-01', weightG: 1400 }] }, // too old
  ];
  const fruits = K.pool(harvests, [{ fruitCodes: ['A6-20261105-01'] }], '2026-11-09');
  assert.deepEqual(fruits.map((f) => f.code), ['A6-20261105-02', 'A7-20261108-01']);
  const boxes = K.makeBoxes({
    variety: 'MK',
    treeIds: ['A6', 'A7'],
    fruitCodes: fruits.map((f) => f.code),
    weights: [400, 410],
    grades: { A6: 'midhigh', A7: 'high' },
    today: '2026-11-09',
    existing: [{ code: 'K-MK-20261109-01' }],
  });
  assert.deepEqual(boxes.map((b) => b.code), ['K-MK-20261109-02', 'K-MK-20261109-03']);
  assert.deepEqual(boxes[0].treeIds, ['A6', 'A7']);
  assert.equal(K.shortCode(boxes[0].code), 'K-MK-1109-02');
  assert.match(K.savedReply(boxes, 3190), /rendemen 25,4%[\s\S]*K-MK-1109-02\* 400 g/);
  assert.match(K.startReply('MK', [{ id: 'A6' }, { id: 'A7' }], fruits, { A6: 'midhigh', A7: 'high' }), /A6\* \(MID-HIGH\)[\s\S]*A7 grade HIGH/);
  assert.match(K.checkWeights([400, 9]).error, /tidak masuk akal/);
});
