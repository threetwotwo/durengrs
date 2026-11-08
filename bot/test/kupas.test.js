'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../lib/kupas');

test('KUPAS commands and box weights', () => {
  assert.deepEqual(K.parseKupas('KUPAS A6'), { tree: 'A6' });
  assert.deepEqual(K.parseKupas('kupas a 6 5/11'), { tree: 'A6', day: 5, month: 11 });
  assert.equal(K.parseKupas('kupas'), null);
  assert.equal(K.parseKupas('A6'), null);
  assert.deepEqual(K.parseWeights('400 410 395'), [400, 410, 395]);
  assert.deepEqual(K.parseWeights('400, 410; 395 g'), [400, 410, 395]);
  assert.equal(K.parseWeights('A6'), null);
  assert.equal(K.parseWeights('MK 150rb'), null);
  assert.equal(K.dayToDate(5, 11, '2026-11-08'), '2026-11-05');
  assert.equal(K.dayToDate(28, 12, '2026-01-03'), '2025-12-28');
});

test('a box holds one tree and day: codes number on, carry the fruits and grade', () => {
  const harvests = [
    { date: '2026-11-05', items: [{ code: 'A6-20261105-01', weightG: 1170 }, { code: 'A6-20261105-02', weightG: 1690 }] },
    { date: '2026-10-28', items: [{ code: 'A6-20261028-01', weightG: 1595 }] },
  ];
  const day = K.pickDay(harvests, '2026-11-08');
  assert.equal(day.fruitDate, '2026-11-05', 'the latest picking day');
  assert.equal(day.fruits.length, 2);
  assert.equal(K.pickDay(harvests, '2026-11-08', '2026-10-28').fruits.length, 1);
  const boxes = K.makeBoxes({
    tree: { id: 'A6', block: 'A', variant: 'MK' },
    ...day,
    weights: [400, 410],
    grade: 'mid',
    today: '2026-11-08',
    existing: [{ code: 'K-A6-20261105-01' }],
  });
  assert.deepEqual(boxes.map((b) => b.code), ['K-A6-20261105-02', 'K-A6-20261105-03']);
  assert.deepEqual(boxes[0].fruitCodes, ['A6-20261105-01', 'A6-20261105-02']);
  assert.equal(boxes[0].grade, 'mid');
  assert.equal(K.shortBox('K-A6-20261105-02'), 'K-A6-1105-02');
  assert.match(K.savedReply(boxes, day.fruits), /K-A6-1105-02\* 400 g/);
  assert.match(K.checkWeights([400, 9]).error, /tidak masuk akal/);
});

test('KUPAS with no fruit to peel says so', () => {
  assert.match(K.startReply({ id: 'A9' }, { fruitDate: null, fruits: [] }, [], 0), /Tidak ada buah A9/);
});
