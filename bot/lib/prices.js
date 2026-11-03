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
- origin: where the fruit is from, as written, in short: "Malaysia" for "malay", "Malaysia", "import"; "Lokal" for "lokal"; a region when named ("Medan", "Palu", "Sulawesi", "Bangka"); else "". The same variety from two origins is two entries (Musang King malay and Musang King lokal differ a lot).
- condition: "frozen" for frozen, "chilled" for chilled (dingin), else "fresh".
- available: "no" when marked sold out (❌, "habis", "sold out", "kosong"), "yes" when marked in stock (✅, "ready", "ada"), else "unknown".
- form: "kupas" for peeled flesh ("kupas", "daging", "isi", in a box, mika or tray); "utuh" for the whole fruit (the default, also "fresh", "gelondong", "butiran"). Most sellers price each variety both ways: give each its own entry.
- unit: "kg" for a price per kilo ("/kg"); "buah" for a price per whole fruit ("/buah", "per biji", "per pcs"); "pack" for a box, mika or tray ("per box 400gr"); "other" for anything else.
- fruit_kg: the weight in kg of the fruit (unit buah, "±2kg") or of the pack (unit pack, "400gr" is 0.4) when it is written, else 0.
- variety: as written (e.g. "Musang King", "Bawor", "Black Thorn", "Montong"). variety_code: the matching code from the farm's list, else "". The farm's varieties: ${list}. Treat "MK" and "Musangking" as Musang King, "Ochee", "Black Thorn" and "Blackthorn" as the same, "Queen", "Durian Queen" and "Musang Queen" as "Musang Queen".
- grade: as written ("A", "B", "Super", "Kupas", "Jumbo"), else "".
- vendor: the seller (shop or account name shown), else "". The top-level vendor is the seller of the whole list.${hint ? `\nThe person sending it wrote: "${hint}" (it may name the vendor).` : ''}
- note: anything that changes the price (e.g. "kupas", "frozen", "promo hari ini"), short; else "".
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
function toPrice(p, { vendor, varieties }) {
  if (p.category === 'olahan') {
    let price = Math.round(Number(p.price) || 0);
    if (price >= 10 && price < 10000) price *= 1000;
    if (!(price >= 1000 && price <= 20000000) || (Number(p.confidence) || 0) < 0.4) return null;
    const code = varieties.find((v) => v.code === p.variety_code) ? p.variety_code : undefined;
    return strip({
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
  const code = varieties.find((v) => v.code === p.variety_code) ? p.variety_code : undefined;
  return strip({
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
async function readAndSavePrices({ text, image, hint, workerPhone, vendorPhone, vendorName, today = R.todayStr(), dry = false }) {
  const varieties = await loadVarieties();
  const parts = [{ text: prompt(varieties, hint) }];
  if (image) parts.push({ inlineData: { mimeType: image.mime, data: image.buffer.toString('base64') } });
  if (text) parts.push({ text: `The price list:\n${text}` });
  const answer = await callGemini(parts, { schema: SCHEMA });
  const prices = (answer?.prices || []).map((p) => toPrice(p, { vendor: answer.vendor || vendorName, varieties })).filter(Boolean);
  if (!prices.length || dry) return prices;
  const photo = image ? await keepImage(image.buffer, today).catch((e) => (console.error('Price photo not kept:', e.message), null)) : null;
  const batchId = crypto.randomUUID().slice(0, 8);
  const batch = db.batch();
  const saved = prices.map((p) => {
    const ref = db.collection('marketPrices').doc();
    const rec = strip({ ...p, date: today, batchId, source: vendorPhone ? 'vendor' : 'whatsapp', workerPhone, vendorPhone, photo: photo || undefined, raw: text ? text.slice(0, 500) : undefined, createdAt: admin.firestore.FieldValue.serverTimestamp() });
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

module.exports = { readAndSavePrices, pricesReply, toPrice, fetchWhatsAppMedia, startPriceMode, inPriceMode, prompt, SCHEMA };
