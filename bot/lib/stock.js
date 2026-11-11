// lib/stock.js — the warehouse's pupuk and obat on WhatsApp (the balances: src/shared/stock.ts). A message that
// starts with a stock word is a stock report; Gemini matches what is written to the stock list:
//   PAKAI TSP 1 sak blok A          used in the field (out)
//   MASUK Gandasil B 10 bungkus     a delivery (in)
//   OPNAME KCL 30 sak               a count: the balance is what was counted
//   STOK                            the balances (STOK TSP: one product's)
// Several lines in one message are fine; a line without its own word takes the message's. Saved right away as
// stockMoves (mistakes are deleted on the webapp's Stock page); the reply gives each product's new balance.
'use strict';
const S = require('./shared');
const R = require('./rules');

/** The word a stock report starts with, and what it means. */
const WORDS = { pakai: 'out', keluar: 'out', masuk: 'in', beli: 'in', terima: 'in', opname: 'count', stok: 'count', stock: 'count', gudang: null };

/** { type: 'out'|'in'|'count'|null, rest } when the message is a stock report; null otherwise. */
function parseStock(text) {
  const m = String(text || '').trim().match(/^(pakai|keluar|masuk|beli|terima|opname|stok|stock|gudang)\b[:\s]*([\s\S]*)$/i);
  if (!m) return null;
  return { type: WORDS[m[1].toLowerCase()], rest: m[2].trim(), word: m[1].toUpperCase() };
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    moves: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          item_id: { type: 'STRING' },
          written: { type: 'STRING' },
          type: { type: 'STRING', enum: ['in', 'out', 'count', 'unknown'] },
          qty: { type: 'NUMBER' },
          unit: { type: 'STRING' },
          block: { type: 'STRING' },
          note: { type: 'STRING' },
        },
        required: ['written', 'type', 'qty', 'unit'],
      },
    },
  },
  required: ['moves'],
};

function prompt(items, type) {
  const list = items.map((i) => `${i.id} = ${i.name}${i.producer ? ` by ${i.producer}` : ''}${i.content ? ` [${i.content}]` : ''} (kept in ${i.unit}${i.pack ? `, 1 pack = ${i.pack} ${i.unit}` : ''})`).join('\n');
  return `You read a durian farm's warehouse report in Indonesian: pupuk (fertiliser) and obat (pesticide) taken out for the field, delivered, or counted.
The products in the warehouse:
${list}

Return one entry per product and quantity written.
- item_id: the id of the product meant, from the list ("TSP" is the TSP product, "KCL" or "MOP" the MOP/KCL one, "Gandasil merah" Gandasil B - Merah, "Kristalon hijau" Neo Kristalon Hijau). "" when none fits or two fit equally.
- written: the product as written.
- type: "out" for used, taken out, applied ("pakai", "keluar", "dipakai", "ambil", "tabur", "semprot", "kocor"); "in" for delivered or bought ("masuk", "datang", "beli", "terima"); "count" for a stock count ("opname", "stok", "sisa", "tinggal"). ${type ? `The message is a "${type}" report: use it for lines that don't say otherwise.` : 'If a line does not say, "unknown".'}
- qty: the number as written (a plain number; "1,5" is 1.5; "setengah" is 0.5).
- unit: as written: kg, gr, ltr, ml, or the pack word (sak, karung, botol, bungkus, kemasan, pcs). "" when no unit is written.
- block: the block or trees it was used on when written ("blok A", "A1-A20" -> "A"), else "".
- note: anything else written about that line, short, else "".`;
}

/** Saves the moves read from a report and gives the reply. */
async function reportStock(db, { text, type, workerPhone, today = R.todayStr(), read }) {
  // Gemini, loaded only when a report is read (lib/ai pulls in Firestore).
  read = read || require('./ai').callGemini;
  const [itemsSnap, movesSnap] = await Promise.all([db.collection('stockItems').get(), db.collection('stockMoves').get()]);
  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!items.length) return 'Daftar stok gudang belum ada. Minta manajemen memasukkannya dulu.';
  const moves = movesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const answer = await read([{ text: prompt(items, type) }, { text: `The report:\n${text}` }], { schema: SCHEMA });
  const byId = new Map(items.map((i) => [i.id, i]));
  const lines = [];
  const save = [];
  const at = new Date().toISOString();
  for (const m of answer?.moves || []) {
    const item = byId.get(m.item_id);
    const kind = m.type === 'unknown' ? type : m.type;
    if (!item) {
      lines.push(`❓ "${m.written}" tidak ada di daftar stok. Tulis nama produknya seperti di daftar (ketik *STOK* untuk melihat daftarnya).`);
      continue;
    }
    if (!kind) {
      lines.push(`❓ ${item.name}: dipakai, masuk, atau hasil opname? Kirim lagi dengan *PAKAI*, *MASUK*, atau *OPNAME* di depan.`);
      continue;
    }
    const qty = S.toItemUnit(Number(m.qty), m.unit, item);
    if (qty === undefined || !(qty >= 0) || (kind !== 'count' && !(qty > 0))) {
      lines.push(`❓ ${item.name}: jumlah "${m.qty} ${m.unit}" tidak bisa dibaca dalam ${item.unit}. Tulis dengan satuannya, contoh: *2 sak* atau *50 kg*.`);
      continue;
    }
    save.push({ itemId: item.id, type: kind, qty, date: today, ...(m.block ? { block: m.block.toUpperCase() } : {}), ...(m.note ? { note: m.note.slice(0, 200) } : {}), ...(workerPhone ? { workerPhone } : {}), source: 'whatsapp', at, raw: text.slice(0, 300) });
  }
  if (save.length) {
    const batch = db.batch();
    for (const s of save) batch.set(db.collection('stockMoves').doc(), s);
    await batch.commit();
  }
  const after = S.stockBalances([...moves, ...save.map((s, i) => ({ id: `new${i}`, ...s }))]);
  const word = { out: 'dipakai', in: 'masuk', count: 'dihitung' };
  for (const s of save) {
    const item = byId.get(s.itemId);
    const b = after.get(s.itemId)?.balance ?? 0;
    const level = S.stockLevel(item, b);
    lines.push(
      `✅ ${item.name}: ${word[s.type]} ${S.stockQty(s.qty, item)}${s.block ? ` (blok ${s.block})` : ''}. *Sisa ${S.stockQty(b, item)}*${b < 0 ? ' ⚠️ minus: cek dan kirim OPNAME' : level === 'out' ? ' ⚠️ HABIS' : level === 'low' ? ' ⚠️ hampir habis' : ''}`
    );
  }
  if (!lines.length) return 'Laporan stok tidak terbaca. Contoh: *PAKAI TSP 1 sak blok A*, *MASUK Gandasil B 10 bungkus*, *OPNAME KCL 30 sak*.';
  console.log(`Stock report: ${save.length} moves saved, ${lines.length - save.length} not`);
  return lines.join('\n');
}

/** STOK: every balance (what is out or low first), or one product's when named. */
async function stockList(db, query = '') {
  const [itemsSnap, movesSnap] = await Promise.all([db.collection('stockItems').get(), db.collection('stockMoves').get()]);
  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!items.length) return 'Daftar stok gudang belum ada.';
  const bal = S.stockBalances(movesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => i.name.toLowerCase().includes(q) || (i.aliases || []).some((a) => a.toLowerCase() === q)) : items;
  if (!shown.length) return `Tidak ada produk "${query}" di daftar stok. Ketik *STOK* untuk semua.`;
  const line = (i) => {
    const b = bal.get(i.id)?.balance ?? 0;
    const lv = S.stockLevel(i, b);
    return `${lv === 'out' ? '🔴' : lv === 'low' ? '🟡' : '🟢'} ${i.name}: ${S.stockQty(b, i)}`;
  };
  const head = `📦 *Stok gudang* (${R.dateLabel(R.todayStr())})`;
  const body = shown.map(line).join('\n');
  const foot = q ? '' : '\n\n🔴 habis · 🟡 kurang dari 1 kemasan\nLapor: *PAKAI TSP 1 sak blok A*, *MASUK …*, *OPNAME …*';
  return `${head}\n${body}${foot}`.slice(0, 4000);
}

module.exports = { parseStock, reportStock, stockList, prompt, SCHEMA };
