// lib/prices.js — other vendors' durian prices, for pricing the farm's own store. Sent to the bot as a screenshot
// (WhatsApp status or catalog, Instagram, Facebook) or as text, with the word HARGA; Gemini reads out each price:
// vendor, variety, whole fruit (utuh) or peeled flesh (kupas), grade, and the price per kg (or per fruit or box). Saved in marketPrices, one record per price, shown on
// the webapp's market prices page and in the morning summary of whoever has prices switched on (Workers page).
const crypto = require('crypto');
const { admin, db, getBucket } = require('./firestore');
const R = require('./rules');
const { callGemini } = require('./ai');
const { compressPhoto, downloadUrl } = require('./reports');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    vendor: { type: 'STRING' },
    prices: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          vendor: { type: 'STRING' },
          sent_date: { type: 'STRING' },
          category: { type: 'STRING', enum: ['buah', 'olahan'] },
          product: { type: 'STRING' },
          size: { type: 'STRING' },
          variety: { type: 'STRING' },
          variety_code: { type: 'STRING' },
          form: { type: 'STRING', enum: ['utuh', 'kupas'] },
          origin: { type: 'STRING' },
          condition: { type: 'STRING', enum: ['fresh', 'chilled', 'frozen'] },
          available: { type: 'STRING', enum: ['yes', 'no', 'unknown'] },
          grade: { type: 'STRING' },
          price: { type: 'NUMBER' },
          unit: { type: 'STRING', enum: ['kg', 'buah', 'pack', 'other'] },
          fruit_kg: { type: 'NUMBER' },
          note: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
        },
        required: ['variety', 'price', 'unit', 'confidence'],
      },
    },
  },
  required: ['vendor', 'prices'],
};

function prompt(varieties, hint) {
  const list = varieties.map((v) => `${v.code} = ${v.name || v.code}`).join('; ') || 'none listed';
  return `You read durian price lists from Indonesian sellers (a WhatsApp status or catalog, an Instagram or Facebook post, a chat), for a durian farm that prices its own store from them.
Return every durian price you can read, one entry per variety and grade (and per origin, form and size when priced separately).
- category: "buah" for durian sold as fruit or as flesh (whole or kupas, fresh, chilled or frozen); "olahan" for processed products made from durian (cakes, pancakes, egg rolls, dessert boxes, kapit, ice cream, drinks).
- For "olahan": product = its type as written, short ("Pancake Durian Musang King", "Durian Egg Roll", "Dreamy Musangking Cake"); size = as written ("L", "M", "S", "1 box isi 4", "1 pcs", "can", "box"); price = the price of that item; unit "other"; variety = the durian variety in it if named, else ""; form, origin, fruit_kg as for fruit only when they apply.
- price: in Rupiah as a plain number. "150rb", "150k", "150.000", "Rp150.000" are 150000; "1,2jt" is 1200000. Sellers often leave out the thousands: "275/kg", "425/kg", "210/pack" mean 275000, 425000, 210000.
- A heading applies to the lines under it until the next heading: "Durian utuh Chilled" makes the lines below whole and chilled; "Ready Durian Pack 400 Gram" makes them packs of 0.4 kg; "Mau info stock buah hari ini" is not a heading of any kind.
- origin: where the fruit is from, in short: "Malaysia" for "malay", "Malaysia", "Malaysia Pahang"; "Thailand"; "Lokal" for "lokal", "lokal nusantara"; an Indonesian region when named ("Medan", "Palu", "Sulawesi", "Bangka"); else "". "Import" alone is "Malaysia" only when nothing else says where from. The same variety from two origins is two entries (Musang King malay and Musang King lokal differ a lot).
- condition: "frozen" for frozen, "chilled" for chilled (dingin), else "fresh".
- available: "no" when marked sold out (❌, "habis", "sold out", "kosong"), "yes" when marked in stock (✅, "ready", "ada"), else "unknown".
- form: "kupas" for peeled flesh ("kupas", "daging", "isi", in a box, mika or tray); "utuh" for the whole fruit (the default, also "fresh", "gelondong", "butiran"). Most sellers price each variety both ways: give each its own entry.
- unit: "kg" for a price per kilo ("/kg"); "buah" for a price per whole fruit ("/buah", "per biji", "per pcs"); "pack" for a box, mika or tray ("per box 400gr"); "other" for anything else.
- fruit_kg: the weight in kg of the fruit (unit buah, "±2kg") or of the pack (unit pack, "400gr" is 0.4) when it is written, else 0. A range is its middle: "400-450 Gram" is 0.425, "900 - 1 KG" is 0.95, "500-550 Gram" is 0.525.
- A price written with a weight or a weight range and no "/kg" ("Premium 405.000 (400-450 Gram)", "Premium 320.000" under "(900 - 1 KG)") is the price of that amount of flesh: unit "pack", fruit_kg from the weight, form "kupas" (sellers who sell whole fruit say so: "utuh", "bulatan", "gelondong", or a price "/kg" under a heading like "BUAH BULATAN UTUH").
- Leave out what is not a durian price: packaging (styrofoam, box, ice), delivery, "harga fluktuatif" and other remarks.
- variety: as written (e.g. "Musang King", "Bawor", "Black Thorn", "Montong"). variety_code: the matching code from the farm's list, else "". The farm's varieties: ${list}. Treat "MK" and "Musangking" as Musang King, "Ochee", "Black Thorn" and "Blackthorn" as the same, "Queen", "Durian Queen" and "Musang Queen" as "Musang Queen".
- grade: as written, short ("A", "AA", "A+", "Premium", "Premium AA", "Super", "Jumbo"), else "". Not the form: "kupas" is form, not grade.
- note: the seller's description of the flesh or the cross ("Kuning, daging tebal, biji kecil"; "persilangan bawor + monthong"), short.
- Pasted or forwarded WhatsApp chats start each message with "[11/3, 10:19] Durian Buis JKT:" (or "11/3/26 10.19 - Durian Buis JKT:"): the name after the time is who sent that message (until the next such line), and the date is when it was sent: give it as sent_date exactly as written ("11/3", "11/3/26"), else "". A message with no prices (a question like "hr ini ada pa") gives nothing.
- vendor: the seller of that list. A shop or brand named in the list itself comes first ("MENU DURIAN NYLEKAMIN" is "Durian Nylekamin", "Admin Duree PIK" is "Duree PIK"); only when the list names none, the name of who sent it in the chat (the person forwarding may be staff passing on several shops' lists, each message its own shop). Else "". The top-level vendor: the seller when the whole text is one seller's, else "".
- 🇮🇩 next to a heading or item means origin "Lokal"; a town or region with a local variety ("Bawor ... Banyumas") is its origin. "@400Gram" after a box price is the box's weight.${hint ? `\nThe person sending it wrote: "${hint}" (it may name the vendor).` : ''}
- confidence 0 to 1. Leave out prices you cannot read; never guess a number.`;
}

/** The farm's varieties (code, name), to match what vendors write. */
async function loadVarieties() {
  const snap = await db.collection('variants').get().catch(() => null);
  return snap ? snap.docs.map((d) => ({ code: d.id, ...d.data() })) : [];
}

/**
 * One read price as a record: the price per kg when it can be worked out (per kg, or per fruit with its weight),
 * the variety matched to the farm's own code when Gemini found one on the list.
 */
/**
 * A chat date as written ("11/3", "3/11/26", "11/3/2026") as YYYY-MM-DD: phones write day/month or month/day, so of
 * the two readings the one on or before today and nearest to it (within 60 days). Empty when it is not one.
 */
function resolveDate(raw, today = R.todayStr()) {
  const m = String(raw || '').match(/^\s*(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (!m) return '';
  const a = Number(m[1]);
  const b = Number(m[2]);
  const ty = Number(today.slice(0, 4));
  const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : ty;
  const best = [
    [a, b],
    [b, a],
  ]
    .filter(([mo, d]) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31)
    .flatMap(([mo, d]) => (m[3] ? [y] : [ty, ty - 1]).map((yy) => `${yy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`))
    .filter((s) => s <= today && s >= R.addDays(today, -60))
    .sort()
    .pop();
  return best || '';
}

/**
 * The farm's code for the variety: Gemini's, else the farm's variety of the same name ("Matahari" -> MH), so a name
 * the farm uses itself is never left unmatched.
 */
function varietyCodeOf(p, varieties) {
  if (varieties.find((v) => v.code === p.variety_code)) return p.variety_code;
  const norm = (x) => String(x || '').toLowerCase().replace(/^durian\s+/, '').replace(/[^a-z0-9]/g, '');
  const want = norm(p.variety);
  if (!want) return undefined;
  const hit = varieties.find((v) => norm(v.name) === want || norm(v.code) === want);
  return hit ? hit.code : undefined;
}

function toPrice(p, { vendor, varieties, today = R.todayStr() }) {
  const date = resolveDate(p.sent_date, today) || undefined;
  if (p.category === 'olahan') {
    let price = Math.round(Number(p.price) || 0);
    if (price >= 10 && price < 10000) price *= 1000;
    if (!(price >= 1000 && price <= 20000000) || (Number(p.confidence) || 0) < 0.4) return null;
    const code = varietyCodeOf(p, varieties);
    return strip({
      date,
      category: 'olahan',
      vendor: String(p.vendor || vendor || '').trim().slice(0, 60) || undefined,
      product: String(p.product || p.variety || '').trim().slice(0, 60) || undefined,
      size: String(p.size || '').trim().slice(0, 30) || undefined,
      variety: String(p.variety || '').trim().slice(0, 40) || undefined,
      varietyCode: code,
      price,
      unit: 'other',
      available: p.available === 'no' ? false : p.available === 'yes' ? true : undefined,
      note: String(p.note || '').trim().slice(0, 80) || undefined,
    });
  }
  let price = Math.round(Number(p.price) || 0);
  // "275/kg": the thousands left out (no durian sells for Rp275).
  if (price >= 10 && price < 10000) price *= 1000;
  if (!(price >= 1000 && price <= 20000000) || (Number(p.confidence) || 0) < 0.4) return null;
  const unit = ['kg', 'buah', 'pack', 'other'].includes(p.unit) ? p.unit : 'other';
  const fruitKg = Number(p.fruit_kg) > 0 ? Number(p.fruit_kg) : undefined;
  const perKg = unit === 'kg' ? price : (unit === 'buah' || unit === 'pack') && fruitKg ? Math.round(price / fruitKg) : undefined;
  const form = p.form === 'kupas' || unit === 'pack' ? 'kupas' : 'utuh';
  const origin = String(p.origin || '').trim().slice(0, 30);
  const condition = ['chilled', 'frozen'].includes(p.condition) ? p.condition : undefined;
  const available = p.available === 'no' ? false : p.available === 'yes' ? true : undefined;
  const code = varietyCodeOf(p, varieties);
  return strip({
    date,
    vendor: String(p.vendor || vendor || '').trim().slice(0, 60) || undefined,
    variety: String(p.variety || '').trim().slice(0, 40) || undefined,
    varietyCode: code,
    category: 'buah',
    form,
    origin: origin || undefined,
    condition,
    available,
    grade: String(p.grade || '').trim().slice(0, 30) || undefined,
    price,
    unit,
    fruitKg,
    pricePerKg: perKg,
    note: String(p.note || '').trim().slice(0, 80) || undefined,
  });
}

const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

/** Downloads a WhatsApp image (media id) as a buffer and its type. */
async function fetchWhatsAppMedia(id, token) {
  const meta = await fetch(`https://graph.facebook.com/v21.0/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  if (!meta?.url) throw new Error(`WhatsApp media ${id}: no url`);
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`WhatsApp media ${id}: ${res.status}`);
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: meta.mime_type || 'image/jpeg' };
}

/** Keeps the screenshot (shrunk) so a price can be checked against it later. */
async function keepImage(buffer, date) {
  let out = buffer;
  try {
    out = await compressPhoto(buffer);
  } catch {
    /* keep the original */
  }
  const bucket = getBucket();
  const filePath = `market-prices/${date}/${crypto.randomUUID()}.jpg`;
  const token = crypto.randomUUID();
  await bucket.file(filePath).save(out, { resumable: false, metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: token } } });
  return { path: filePath, url: downloadUrl(bucket, filePath, token) };
}

/**
 * Reads prices from a text or an image and saves them. `hint`: what was written with it (a caption, or the text
 * itself). Returns the saved records (empty when nothing could be read).
 */
async function readAndSavePrices({ text, image, hint, workerPhone, vendorPhone, vendorName, today = R.todayStr(), dry = false, tag = {} }) {
  const varieties = await loadVarieties();
  const parts = [{ text: prompt(varieties, hint) }];
  if (image) parts.push({ inlineData: { mimeType: image.mime, data: image.buffer.toString('base64') } });
  if (text) parts.push({ text: `The price list:\n${text}` });
  // Long price lists (twenty-odd items) take Gemini a while: more time than a report reading.
  const answer = await callGemini(parts, { schema: SCHEMA, timeoutMs: Math.max(Number(process.env.GEMINI_TIMEOUT_MS) || 0, 120000) });
  const prices = (answer?.prices || []).map((p) => toPrice(p, { vendor: answer.vendor || vendorName, varieties, today })).filter(Boolean);
  if (!prices.length || dry) return prices;
  const photo = image ? await keepImage(image.buffer, today).catch((e) => (console.error('Price photo not kept:', e.message), null)) : null;
  const batchId = crypto.randomUUID().slice(0, 8);
  const batch = db.batch();
  const saved = prices.map((p) => {
    const ref = db.collection('marketPrices').doc();
    const rec = strip({ ...p, ...tag, date: p.date || today, batchId, source: vendorPhone ? 'vendor' : 'whatsapp', workerPhone, vendorPhone, photo: photo || undefined, raw: text ? text.slice(0, 500) : undefined, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(ref, rec);
    return { id: ref.id, ...rec };
  });
  await batch.commit();
  return saved;
}

const rupiah = (n) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

/** The reply: each price read, so the sender can see it was read right. */
function pricesReply(saved, { dry = false } = {}) {
  if (!saved.length) return 'Maaf, tidak ada harga durian yang terbaca. Kirim lagi foto yang lebih jelas, atau ketik: *HARGA* nama toko, varietas, harga per kg.';
  const lines = saved.slice(0, 15).map((p) => {
    if (p.category === 'olahan') return `• 🍰 ${[p.product || 'Olahan', p.size].filter(Boolean).join(', ')}: ${rupiah(p.price)}${p.available === false ? ' ❌' : ''}${p.vendor ? ` · ${p.vendor}` : ''}`;
    const what = [p.variety || 'Durian', p.origin, p.form === 'kupas' ? 'kupas' : '', p.condition, p.grade].filter(Boolean).join(' ') + (p.available === false ? ' ❌' : '');
    const per = p.unit === 'buah' ? '/buah' : p.unit === 'pack' ? `/box${p.fruitKg ? ` ${Math.round(p.fruitKg * 1000)}g` : ''}` : '';
    const price = p.unit === 'kg' ? `${rupiah(p.price)}/kg` : `${rupiah(p.price)}${per}${p.pricePerKg ? ` (≈${rupiah(p.pricePerKg)}/kg)` : ''}`;
    return `• ${what}: ${price}${p.vendor ? ` · ${p.vendor}` : ''}`;
  });
  const more = saved.length > 15 ? `\n… dan ${saved.length - 15} lagi` : '';
  return `${dry ? '🧪 TES, tidak disimpan' : '💰 Harga tersimpan'} (${saved.length}):\n${lines.join('\n')}${more}${dry ? '\n\nKirim tanpa TES untuk menyimpan.' : '\n\nBisa diperbaiki di webapp: Panen › Harga pasar.'}`;
}

// ---------- "HARGA" then the screenshots: a short window ----------

const WINDOW_MS = 15 * 60 * 1000;
const modeRef = (phone) => db.collection('priceMode').doc(String(phone));
async function startPriceMode(phone) {
  await modeRef(phone).set({ until: Date.now() + WINDOW_MS });
}
async function inPriceMode(phone) {
  const snap = await modeRef(phone).get().catch(() => null);
  const until = snap && snap.exists ? Number(snap.data().until) : 0;
  if (until > Date.now()) {
    await modeRef(phone).set({ until: Date.now() + WINDOW_MS }); // each price sent keeps the window open
    return true;
  }
  return false;
}

module.exports = { resolveDate, readAndSavePrices, pricesReply, toPrice, fetchWhatsAppMedia, startPriceMode, inPriceMode, prompt, SCHEMA };
