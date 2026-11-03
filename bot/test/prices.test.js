// Other vendors' prices (lib/prices.js): HARGA in a message, each read price as a record, the summary's lines.
const test = require('node:test');
const assert = require('node:assert/strict');
const fake = require('./fakeFirestore');
fake.install();
const { priceText, parseCommand } = require('../lib/commands');
const { toPrice } = require('../lib/prices');
const { priceLines } = require('../lib/summary');

test('HARGA: alone opens the 15 minutes for screenshots; with words after it, those are the prices (a typo allowed)', () => {
  assert.equal(parseCommand('harga').kind, 'prices');
  assert.equal(priceText('HARGA Toko Jaya MK 150rb/kg'), 'Toko Jaya MK 150rb/kg');
  assert.equal(priceText('hargs\nMK 140rb'), 'MK 140rb');
  assert.equal(priceText('HARGA'), null);
  assert.equal(priceText('A1 rusak'), null);
});

test('a read price: per kg kept, per fruit turned into per kg when the weight is written, the variety matched only from the list', () => {
  const varieties = [{ code: 'MK', name: 'Musang King' }];
  assert.deepEqual(toPrice({ vendor: '', variety: 'Musang King', variety_code: 'MK', grade: 'A', price: 150000, unit: 'kg', fruit_kg: 0, note: '', confidence: 0.9 }, { vendor: 'Toko Jaya', varieties }), {
    vendor: 'Toko Jaya', variety: 'Musang King', varietyCode: 'MK', form: 'utuh', grade: 'A', price: 150000, unit: 'kg', pricePerKg: 150000,
  });
  const fruit = toPrice({ variety: 'Bawor', variety_code: 'BW', price: 250000, unit: 'buah', fruit_kg: 2.5, confidence: 0.8 }, { vendor: 'Pak Ali', varieties });
  assert.equal(fruit.pricePerKg, 100000);
  assert.equal(fruit.varietyCode, undefined, 'BW is not on the list: left unmatched');
  const box = toPrice({ variety: 'Musang King', variety_code: 'MK', form: 'utuh', price: 140000, unit: 'pack', fruit_kg: 0.4, confidence: 0.9 }, { varieties });
  assert.deepEqual([box.form, box.pricePerKg], ['kupas', 350000], 'a box is peeled flesh, per kg over its weight');
  assert.equal(toPrice({ variety: 'X', price: 150, unit: 'kg', confidence: 0.9 }, { varieties }), null, 'not a Rupiah price');
  assert.equal(toPrice({ variety: 'X', price: 150000, unit: 'kg', confidence: 0.2 }, { varieties }), null, 'unsure: left out');
});

test('the summary\'s market prices: the day\'s, one line per variety with the range, sellers and the store\'s price; else the latest day', () => {
  const data = {
    variants: [{ id: 'MK', name: 'Musang King' }],
    storePrices: [{ id: 'MK', pricePerKg: 130000, kupasPerKg: 320000 }],
    prices: [
      { date: '2026-11-01', varietyCode: 'MK', variety: 'Musang King', price: 150000, unit: 'kg', pricePerKg: 150000, vendor: 'Toko Jaya' },
      { date: '2026-11-01', varietyCode: 'MK', variety: 'MK', price: 120000, unit: 'kg', pricePerKg: 120000, vendor: 'Pak Ali' },
      { date: '2026-11-01', varietyCode: 'MK', form: 'kupas', price: 300000, unit: 'kg', pricePerKg: 300000, vendor: 'Pak Ali' },
      { date: '2026-11-01', variety: 'Bawor', price: 200000, unit: 'buah', vendor: 'Pak Ali' },
      { date: '2026-10-30', varietyCode: 'MK', price: 99000, unit: 'kg', pricePerKg: 99000 },
    ],
  };
  assert.deepEqual(priceLines(data, '2026-11-01'), {
    day: '2026-11-01',
    lines: ['• Musang King: utuh Rp120.000–Rp150.000/kg, kupas Rp300.000/kg (2 penjual) · toko kita utuh Rp130.000, kupas Rp320.000', '• Bawor: Rp200.000/buah (1 penjual)'],
  });
  assert.equal(priceLines(data, '2026-11-02').day, '2026-11-01');
  assert.deepEqual(priceLines({ prices: [] }, '2026-11-01'), { day: null, lines: [] });
});
