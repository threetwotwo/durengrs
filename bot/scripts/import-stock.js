// scripts/import-stock.js — the farm's Inventaris Obat & Pupuk sheet (data/stock-opening.tsv) into Firestore: each
// product as stockItems/{A01…F05} (section letter and the sheet's number: name, producer, pack, unit, content, type,
// method), and its stock opname of OPENING_DATE as the opening count (stockMoves/opening-{id}); the sheet's ENDING
// BALANCE only when no count is written. Products already in Firestore keep their history: their moves follow them
// to the new id (matched by name), and their old opening count is replaced.
//   node scripts/import-stock.js dry     show what would be written
//   node scripts/import-stock.js apply   write it (again safely: the same documents are replaced)
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const OPENING_DATE = '2026-11-10';

const num = (s) => {
  const v = String(s || '').replace(/,/g, '').trim();
  return v === '' || Number.isNaN(Number(v)) ? undefined : Number(v);
};

function readSheet() {
  const lines = fs.readFileSync(path.join(root, 'data', 'stock-opening.tsv'), 'utf8').split('\n');
  const items = [];
  let section = '';
  for (const line of lines.slice(5)) {
    const c = line.split('\t').map((x) => x.trim());
    if (/^[A-Z]\.\s/.test(c[0])) {
      section = c[0].replace(/\s+/g, ' ').trim();
      continue;
    }
    if (!c[1] || !/^\d+$/.test(c[0])) continue;
    items.push({
      no: Number(c[0]),
      info: c[1].replace(/\s+/g, ' '),
      producer: c[2] && c[2] !== '?' ? c[2] : undefined,
      packN: num(c[3]),
      unit: c[4] || '',
      content: c[5] || undefined,
      kind: c[6] || undefined,
      method: c[7] || undefined,
      count: num(c[11]),
      countText: c[11],
      ending: num(c[12]),
      section,
    });
  }
  return items;
}

/** "TSP 46% Cap Kuda by Santani (50kg)" and "TSP 46% Cap Kuda" alike: lower case, no producer, no pack, letters and digits. */
const norm = (s) => String(s || '').toLowerCase().replace(/\s+by\s+.*$/, '').replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '');

async function main() {
  const apply = process.argv[2] === 'apply';
  const { normalizeUnit } = require('../lib/shared');
  const rows = readSheet();
  // Two products of one name (VITA4 50 kg and 2 kg): the pack goes in the name so workers' messages can tell them apart.
  const seen = rows.reduce((m, r) => m.set(r.info, (m.get(r.info) || 0) + 1), new Map());
  const out = rows.map((r) => {
    const unit = normalizeUnit(r.unit) || 'gr';
    const id = `${r.section[0]}${String(r.no).padStart(2, '0')}`;
    const name = seen.get(r.info) > 1 && r.packN ? `${r.info} (${r.packN} ${unit})` : r.info;
    const opening = r.count ?? r.ending ?? 0;
    return {
      id,
      item: {
        no: r.no,
        name,
        ...(r.producer ? { producer: r.producer } : {}),
        ...(r.content ? { content: r.content } : {}),
        ...(r.kind ? { kind: r.kind } : {}),
        ...(r.method ? { method: r.method } : {}),
        section: r.section,
        unit,
        ...(r.packN ? { pack: r.packN } : {}),
        order: Number(`${r.section.charCodeAt(0)}${String(r.no).padStart(3, '0')}`),
      },
      opening,
      packN: r.packN,
      fromEnding: r.count === undefined,
      norm: norm(r.info),
    };
  });
  for (const o of out) console.log(`${o.id} ${o.item.name} | ${o.opening} ${o.item.unit}${o.item.pack ? ` | pack ${o.item.pack}` : ''}${o.fromEnding ? ' | from ENDING BALANCE' : ''}`);
  console.log(`${out.length} items, ${out.filter((o) => o.opening <= 0).length} out of stock${apply ? ', writing' : ' (dry run, nothing written)'}`);
  for (const line of fs.readFileSync(path.join(root, 'env.yaml'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+):\s*(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = path.join(root, 'service-account.json');
  const { db, admin } = require('../lib/firestore');

  // The products already there: matched by name (and pack when two share it) to the new ids.
  const old = (await db.collection('stockItems').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const used = new Set();
  const map = new Map();
  for (const o of old) {
    const n = norm(o.name);
    const cands = out.filter((x) => !used.has(x.id) && n && (x.norm.startsWith(n) || n.startsWith(x.norm)));
    const hit = cands.find((x) => x.packN && o.pack && x.packN === o.pack) || cands[0];
    if (hit) {
      used.add(hit.id);
      map.set(o.id, hit.id);
      if (o.id !== hit.id) console.log(`  ${o.id} ${o.name} -> ${hit.id}`);
    } else console.log(`  ${o.id} ${o.name}: not in the new sheet, removed`);
  }
  const moves = (await db.collection('stockMoves').get()).docs;
  const moving = moves.filter((d) => !d.id.startsWith('opening-') && map.has(d.data().itemId) && map.get(d.data().itemId) !== d.data().itemId);
  console.log(`${moving.length} recorded moves follow their product; ${moves.filter((d) => d.id.startsWith('opening-')).length} old opening counts replaced`);
  if (!apply) return;

  const at = `${OPENING_DATE}T00:00:00.000Z`;
  const ops = [];
  for (const d of moves) if (d.id.startsWith('opening-')) ops.push((b) => b.delete(d.ref));
  for (const d of moving) ops.push((b) => b.update(d.ref, { itemId: map.get(d.data().itemId) }));
  for (const o of old) if (!out.some((x) => x.id === o.id)) ops.push((b) => b.delete(db.collection('stockItems').doc(o.id)));
  for (const o of out) {
    ops.push((b) => b.set(db.collection('stockItems').doc(o.id), { ...o.item, updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
    ops.push((b) =>
      b.set(db.collection('stockMoves').doc(`opening-${o.id}`), {
        itemId: o.id,
        type: 'count',
        qty: o.opening,
        date: OPENING_DATE,
        note: o.fromEnding ? 'Saldo awal dari lembar Inventaris (ENDING BALANCE)' : 'Stok opname 10 Nov (lembar Inventaris)',
        source: 'sheet',
        at,
      })
    );
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((f) => f(batch));
    await batch.commit();
  }
  console.log(`${out.length} items and opening counts written`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e.message || e);
    process.exit(1);
  }
);
