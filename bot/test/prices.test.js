// Other vendors' prices (lib/prices.js): HARGA in a message, each read price as a record, the summary's lines.
const test = require('node:test');
const assert = require('node:assert/strict');
const fake = require('./fakeFirestore');
fake.install();
const { priceText, parseCommand, looksLikePrices } = require('../lib/commands');
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
    vendor: 'Toko Jaya', variety: 'Musang King', varietyCode: 'MK', category: 'buah', form: 'utuh', grade: 'A', price: 150000, unit: 'kg', pricePerKg: 150000,
  });
  const fruit = toPrice({ variety: 'Bawor', variety_code: 'BW', price: 250000, unit: 'buah', fruit_kg: 2.5, confidence: 0.8 }, { vendor: 'Pak Ali', varieties });
  assert.equal(fruit.pricePerKg, 100000);
  assert.equal(fruit.varietyCode, undefined, 'BW is not on the list: left unmatched');
  const box = toPrice({ variety: 'Musang King', variety_code: 'MK', form: 'utuh', price: 140000, unit: 'pack', fruit_kg: 0.4, confidence: 0.9 }, { varieties });
  assert.deepEqual([box.form, box.pricePerKg], ['kupas', 350000], 'a box is peeled flesh, per kg over its weight');
  const short = toPrice({ variety: 'Musang King', variety_code: 'MK', price: 455, unit: 'kg', origin: 'Malaysia', available: 'no', confidence: 0.9 }, { varieties });
  assert.deepEqual([short.price, short.pricePerKg, short.origin, short.available], [455000, 455000, 'Malaysia', false], '"455/kg": the thousands left out; sold out');
  const frozen = toPrice({ variety: 'Musang King', price: 250, unit: 'pack', fruit_kg: 0.4, condition: 'frozen', available: 'yes', confidence: 0.9 }, { varieties });
  assert.deepEqual([frozen.form, frozen.condition, frozen.pricePerKg, frozen.available], ['kupas', 'frozen', 625000, true]);
  assert.equal(toPrice({ variety: 'X', price: 5, unit: 'kg', confidence: 0.9 }, { varieties }), null, 'not a Rupiah price');
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
      { date: '2026-10-30', varietyCode: 'MK', price: 99000, unit: 'kg', pricePerKg: 99000, vendor: 'Toko Jaya' },
    ],
  };
  assert.deepEqual(priceLines(data, '2026-11-01'), {
    day: '2026-11-01',
    lines: ['• Musang King: utuh Rp120.000–Rp150.000/kg, kupas Rp300.000/kg (2 penjual) · toko kita utuh Rp130.000, kupas Rp320.000', '• Bawor: Rp200.000/buah (1 penjual)'],
  });
  assert.equal(priceLines(data, '2026-11-02').lines.length, 2, 'the week up to the day');
  assert.deepEqual(priceLines(data, '2026-11-20'), { day: null, lines: [] }, 'nothing in the last 7 days');
  assert.deepEqual(priceLines({ prices: [] }, '2026-11-01'), { day: null, lines: [] });
});

test('olahan (processed products) kept apart: type, size, price; the recap only counts them', () => {
  const o = toPrice({ category: 'olahan', product: 'Pancake Durian Musang King', size: '1 box isi 4', price: 65, unit: 'other', confidence: 0.9 }, { vendor: 'Good Durian', varieties: [] });
  assert.deepEqual(o, { category: 'olahan', vendor: 'Good Durian', product: 'Pancake Durian Musang King', size: '1 box isi 4', price: 65000, unit: 'other' });
  const lines = priceLines({ prices: [{ date: '2026-11-03', ...o }, { date: '2026-11-03', variety: 'Bawor', form: 'utuh', price: 165000, unit: 'kg', pricePerKg: 165000, vendor: 'Batavia' }] }, '2026-11-03').lines;
  assert.deepEqual(lines, ['• Bawor: utuh Rp165.000/kg (1 penjual)', '• Olahan: 1 produk dari 1 penjual (lihat webapp)']);
});

test('a price list is noticed without HARGA; tree IDs, words and chatter are not', () => {
  assert.equal(looksLikePrices('Pagi .\nBawor fresh 165rb/kg\nBawor kupas 400gram harga 175rb/pack'), true);
  assert.equal(looksLikePrices('Musangking lokal 275/kg ✅'), true);
  assert.equal(looksLikePrices('Pancake Durian Montong 1box *60.000* (4pcs)'), true);
  assert.equal(looksLikePrices('MK Rp 150000'), true);
  for (const no of ['A1', 'ringkasan', 'kebun', 'pohon A12 daunnya kuning', 'ok siap', 'jam 7 ke blok B']) assert.equal(looksLikePrices(no), false, no);
});
