'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/shared');
const K = require('../lib/stock');

// A tiny Firestore: collections of docs, get() and batch().set().
function fakeDb(data) {
  const store = JSON.parse(JSON.stringify(data));
  let n = 0;
  const col = (name) => ({
    get: async () => ({ docs: Object.entries(store[name] || {}).map(([id, v]) => ({ id, data: () => v })) }),
    doc: (id = `auto${++n}`) => ({ name, id }),
  });
  return {
    store,
    collection: col,
    batch: () => {
      const ops = [];
      return { set: (ref, v) => ops.push([ref, v]), commit: async () => ops.forEach(([r, v]) => ((store[r.name] ||= {})[r.id] = v)) };
    },
  };
}

const items = {
  A01: { name: 'TSP 46% Cap Kuda by Santani (50kg)', unit: 'kg', pack: 50, order: 1 },
  A21: { name: 'Gandasil B - Merah (500gr)', unit: 'gr', pack: 500, order: 21 },
};
const opening = {
  'opening-A01': { itemId: 'A01', type: 'count', qty: 90, date: '2026-11-09', at: '1' },
  'opening-A21': { itemId: 'A21', type: 'count', qty: 7500, date: '2026-11-09', at: '1' },
};

test('stock words, units and balances', () => {
  assert.deepEqual(K.parseStock('PAKAI TSP 1 sak blok A'), { type: 'out', rest: 'TSP 1 sak blok A', word: 'PAKAI' });
  assert.equal(K.parseStock('stok').type, 'count');
  assert.equal(K.parseStock('A6'), null);
  assert.equal(S.toItemUnit(2, 'sak', { unit: 'kg', pack: 50 }), 100);
  assert.equal(S.toItemUnit(500, 'gr', { unit: 'kg' }), 0.5);
  assert.equal(S.toItemUnit(1, 'ltr', { unit: 'ml' }), 1000);
  assert.equal(S.toItemUnit(1, 'ltr', { unit: 'kg' }), undefined, 'litres of a kg product');
  assert.equal(S.packFromName('Librel RMX 26 by BASF (500gr)', 'gr'), 500);
  const b = S.stockBalances([
    { id: '1', itemId: 'A01', type: 'count', qty: 90, date: '2026-11-09' },
    { id: '2', itemId: 'A01', type: 'out', qty: 50, date: '2026-11-10' },
    { id: '3', itemId: 'A01', type: 'in', qty: 100, date: '2026-11-11' },
    { id: '4', itemId: 'A01', type: 'count', qty: 120, date: '2026-11-12' },
    { id: '5', itemId: 'A01', type: 'out', qty: 20, date: '2026-11-13' },
  ]);
  assert.equal(b.get('A01').balance, 100, 'the last count, then what went out after it');
  assert.equal(S.stockLevel({ pack: 50 }, 30), 'low');
  assert.equal(S.stockLevel({ pack: 50 }, 0), 'out');
  assert.equal(S.stockQty(1600, { unit: 'kg', pack: 50 }), '1.600 kg (32 kemasan)');
});

test('a report saves its moves and answers with the new balance', async () => {
  const db = fakeDb({ stockItems: items, stockMoves: opening });
  const read = async () => ({
    moves: [
      { item_id: 'A01', written: 'TSP', type: 'out', qty: 1, unit: 'sak', block: 'a', note: '' },
      { item_id: 'A21', written: 'gandasil merah', type: 'unknown', qty: 2, unit: 'bungkus', block: '', note: '' },
      { item_id: '', written: 'urea', type: 'out', qty: 1, unit: 'sak', block: '', note: '' },
    ],
  });
  const reply = await K.reportStock(db, { text: 'PAKAI TSP 1 sak blok A\ngandasil merah 2 bungkus\nurea 1 sak', type: 'out', workerPhone: '628', today: '2026-11-10', read });
  assert.match(reply, /TSP[^\n]*dipakai 50 kg \(1 kemasan\) \(blok A\)\. \*Sisa 40 kg[^\n]*hampir habis/);
  assert.match(reply, /Gandasil B[^\n]*dipakai 1\.000 gr \(2 kemasan\)[^\n]*Sisa 6\.500 gr/);
  assert.match(reply, /"urea" tidak ada di daftar stok/);
  const saved = Object.values(db.store.stockMoves).filter((m) => m.source === 'whatsapp');
  assert.equal(saved.length, 2);
  assert.deepEqual(saved.map((m) => [m.itemId, m.type, m.qty, m.block]), [['A01', 'out', 50, 'A'], ['A21', 'out', 1000, undefined]]);
});

test('STOK lists the balances', async () => {
  const db = fakeDb({ stockItems: items, stockMoves: opening });
  const all = await K.stockList(db);
  assert.match(all, /🟢 TSP[^\n]*90 kg/);
  assert.match(await K.stockList(db, 'gandasil'), /Gandasil B[^\n]*7\.500 gr/);
  assert.match(await K.stockList(db, 'urea'), /Tidak ada produk "urea"/);
});
