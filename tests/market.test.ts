// Market prices: other vendors' prices per variety, the suggested store price, typed Rupiah.
import test from 'node:test';
import assert from 'node:assert/strict';
import { marketByVariety, parseRupiah, priceDays, suggestPrice } from '../src/lib/market';

const p = (x: any) => ({ id: Math.random().toString(36), date: '2026-11-02', unit: 'kg', ...x });

test('per variety: range, median and sellers per kg; per-fruit prices without a weight kept apart; the store price beside', () => {
  const rows = marketByVariety(
    [
      p({ varietyCode: 'MK', price: 150000, pricePerKg: 150000, vendor: 'Toko Jaya' }),
      p({ varietyCode: 'MK', price: 120000, pricePerKg: 120000, vendor: 'pak ali' }),
      p({ varietyCode: 'MK', price: 131000, pricePerKg: 131000, vendor: 'Pak Ali' }),
      p({ varietyCode: 'MK', form: 'kupas', price: 140000, unit: 'pack', fruitKg: 0.4, pricePerKg: 350000, vendor: 'Pak Ali' }),
      p({ variety: 'Bawor', price: 200000, unit: 'buah' }),
    ],
    (c) => (c === 'MK' ? 'Musang King' : c),
    new Map([['MK', { utuh: 125000, kupas: 330000 }]])
  );
  assert.deepEqual(rows.map((r) => [r.name, r.form, r.low, r.high, r.median, r.sellers, r.suggested, r.store, r.perFruit]), [
    ['Musang King', 'utuh', 120000, 150000, 131000, 2, 130000, 125000, []],
    ['Musang King', 'kupas', 350000, 350000, 350000, 1, 350000, 330000, []],
    ['Bawor', 'utuh', undefined, undefined, undefined, 0, undefined, undefined, [200000]],
  ]);
  const mk = marketByVariety(
    [
      p({ varietyCode: 'MK', price: 455000, pricePerKg: 455000, origin: 'Malaysia', available: false }),
      p({ varietyCode: 'MK', price: 275000, pricePerKg: 275000, origin: 'Lokal' }),
      p({ varietyCode: 'MK', form: 'kupas', unit: 'pack', price: 250000, pricePerKg: 625000, origin: 'Malaysia', condition: 'frozen' }),
    ],
    (c) => (c === 'MK' ? 'Musang King' : c),
    new Map([['MK', { utuh: 260000 }]])
  );
  assert.deepEqual(mk.map((r) => [r.name, r.form, r.median, r.store]), [
    ['Musang King', 'utuh', 275000, 260000],
    ['Musang King (Malaysia)', 'utuh', 455000, undefined],
    ['Musang King (Malaysia, frozen)', 'kupas', 625000, undefined],
  ]);
  assert.equal(suggestPrice([100000, 110000]), 105000);
  assert.deepEqual(priceDays([p({ date: '2026-11-01' }), p({}), p({})]), [{ date: '2026-11-02', n: 2 }, { date: '2026-11-01', n: 1 }]);
});

test('typed Rupiah', () => {
  assert.equal(parseRupiah('150000'), 150000);
  assert.equal(parseRupiah('Rp 150.000'), 150000);
  assert.equal(parseRupiah('150rb'), 150000);
  assert.equal(parseRupiah('150k'), 150000);
  assert.equal(parseRupiah('1,2jt'), 1200000);
  assert.equal(parseRupiah('abc'), null);
  assert.equal(parseRupiah(''), null);
});
