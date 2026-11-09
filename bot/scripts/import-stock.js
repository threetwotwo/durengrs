// scripts/import-stock.js — the farm's Inventaris Obat & Pupuk sheet (data/stock-opening.tsv) into Firestore: each
// product as stockItems/{A01…} (name, content, kind, method, unit, pack size), and its ENDING BALANCE as the opening
// count (stockMoves/opening-{id}, a stock opname on OPENING_DATE). Where the sheet's latest opname says "Habis" but
// the balance doesn't, both are shown so the warehouse can recount.
//   node scripts/import-stock.js dry     show what would be written
//   node scripts/import-stock.js apply   write it (again safely: the same documents are replaced)
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const OPENING_DATE = '2026-11-09';

function readSheet() {
  const lines = fs.readFileSync(path.join(root, 'data', 'stock-opening.tsv'), 'utf8').split('\n');
  const items = [];
  let section = '';
  for (const line of lines.slice(5)) {
    const c = line.split('\t').map((s) => s.trim());
    if (/^[A-Z]\.\s/.test(c[0])) {
      section = c[0];
      continue;
    }
    if (!c[1]) continue;
    const num = (s) => {
      const v = String(s || '').replace(/,/g, '');
      return v === '' || Number.isNaN(Number(v)) ? undefined : Number(v);
    };
    items.push({
      no: c[0],
      name: c[1].replace(/\s+/g, ' '),
      content: c[2] || undefined,
      kind: c[3] || undefined,
      method: c[4] || undefined,
      unit: c[6] || 'kg',
      packText: c[8] || '',
      opname21Oct: c[9] || '',
      opname10Nov: c[10] || '',
      ending: num(c[11]) ?? 0,
      section,
    });
  }
  return items;
}

async function main() {
  const apply = process.argv[2] === 'apply';
  const { normalizeUnit, packFromName, toItemUnit } = require('../lib/shared');
  const rows = readSheet();
  const out = rows.map((r, i) => {
    const unit = normalizeUnit(r.unit) || 'kg';
    const fromCol = (() => {
      const m = r.packText.match(/^(\d+(?:[.,]\d+)?)\s*([a-z]+)$/i);
      return m ? toItemUnit(Number(m[1].replace(',', '.')), m[2], { unit }) : undefined;
    })();
    // The pack in the name is the product's ("(50kg)"); the sheet's Kemasan column sometimes holds what is left.
    const pack = packFromName(r.name, unit) ?? fromCol;
    const id = `${(r.section[0] || 'X').toUpperCase()}${String(i + 1).padStart(2, '0')}`;
    const habis = /habis/i.test(r.opname10Nov || r.opname21Oct);
    return {
      id,
      item: {
        name: r.name,
        ...(r.content ? { content: r.content } : {}),
        ...(r.kind ? { kind: r.kind } : {}),
        ...(r.method ? { method: r.method } : {}),
        section: r.section,
        unit,
        ...(pack ? { pack } : {}),
        ...((/^buy$/i.test(r.no) || !r.no) && r.ending === 0 ? { status: 'buy' } : {}),
        order: i + 1,
      },
      opening: r.ending,
      check: habis && r.ending > 0 ? `opname says Habis, balance ${r.ending} ${unit}` : '',
    };
  });
  for (const o of out) console.log(`${o.id} ${o.item.name} | ${o.opening} ${o.item.unit}${o.item.pack ? ` | pack ${o.item.pack}` : ''}${o.item.status ? ' | buy' : ''}${o.check ? ` | CHECK: ${o.check}` : ''}`);
  console.log(`${out.length} items${apply ? ', writing' : ' (dry run, nothing written)'}`);
  if (!apply) return;
  for (const line of fs.readFileSync(path.join(root, 'env.yaml'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+):\s*(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = path.join(root, 'service-account.json');
  const { db, admin } = require('../lib/firestore');
  const batch = db.batch();
  const at = new Date().toISOString();
  for (const o of out) {
    batch.set(db.collection('stockItems').doc(o.id), { ...o.item, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    batch.set(db.collection('stockMoves').doc(`opening-${o.id}`), {
      itemId: o.id,
      type: 'count',
      qty: o.opening,
      date: OPENING_DATE,
      note: `Saldo awal dari lembar Inventaris (ENDING BALANCE)${o.check ? `; cek ulang: ${o.check}` : ''}`,
      source: 'sheet',
      at,
    });
  }
  await batch.commit();
  console.log(`${out.length} items and opening balances written`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e.message || e);
    process.exit(1);
  }
);
