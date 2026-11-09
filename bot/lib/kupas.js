// lib/kupas.js — Laporan KUPAS: the farm's kupas station records its boxes, each with its own farm code (a lot
// code for traceability, not the store's product SKU: the store has its own in its POS). A box holds flesh of ONE
// variety, from one or more trees, so its code follows the variety and the peeling day: K-MK-20261109-01 is the
// first Musang King box peeled 9 Nov (shown short as K-MK-1109-01). In the chat:
//   KUPAS A6 A7       the trees going in (one variety): their fruits not yet in a box, from the last two weeks
//   400 410 395       within 30 minutes: each box's weight in grams; the bot answers with the box codes
// Saved as kupasBoxes/{code}: variety, treeIds, fruitCodes (the fruits that went in), date (peeled), weightG,
// grades (each tree's then), workerPhone.
'use strict';
const R = require('./rules');
const G = require('./grading');

const WINDOW_MS = 30 * 60 * 1000;
const LOOK_BACK_DAYS = 14;
const BOX_G = { min: 50, max: 5000 };
const MAX_TREES = 10;

/** "KUPAS A6 A7", "kupas a6, a 7" -> { trees: ['A6', 'A7'] }; null when not a kupas command. */
function parseKupas(text) {
  const m = String(text || '').trim().match(/^kupa?s\s+(.+)$/i);
  if (!m) return null;
  const rest = m[1].trim();
  if (!/^([a-z]{1,3}\s*\d{1,3}[\s,;&+]*)+$/i.test(rest)) return null;
  const trees = [...new Set([...rest.matchAll(/([a-z]{1,3})\s*(\d{1,3})/gi)].map((x) => `${x[1].toUpperCase()}${Number(x[2])}`))];
  return trees.length ? { trees } : null;
}

/** "400 410 395", "400, 410; 395 g" -> [400, 410, 395]; null when the message isn't only box weights. */
function parseWeights(text) {
  const s = String(text || '').trim().replace(/\s*(gr|g|gram)\b\.?/gi, '');
  if (!/^\d{2,4}([\s,;+]+\d{2,4})*$/.test(s)) return null;
  return s.split(/[\s,;+]+/).map(Number);
}

const boxCode = (variety, date, n) => `K-${variety}-${String(date).replace(/-/g, '')}-${String(n).padStart(2, '0')}`;
/** K-MK-20261109-01 -> K-MK-1109-01; a fruit code A6-20261105-01 -> A6-1105-01. */
const shortCode = (code) => String(code).replace(/-\d{4}(\d{4})-/, '-$1-');
const grams = (n) => `${Math.round(n).toLocaleString('id-ID')} g`;

/**
 * The fruits that can go in: these trees' fruits picked in the last two weeks and not in a box yet.
 * [{ code, treeId, date, weightG }]
 */
function pool(harvests, boxes, today) {
  const used = new Set(boxes.flatMap((b) => b.fruitCodes || []));
  const from = R.addDays(today, -LOOK_BACK_DAYS);
  return harvests
    .filter((h) => h.date >= from && h.date <= today)
    .flatMap((h) => (h.items || []).map((f) => ({ code: f.code, treeId: h.treeId, date: h.date, weightG: Number(f.weightG) || 0 })))
    .filter((f) => f.code && !used.has(f.code))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** The trees must be one variety: { variety } or { error }. */
function oneVariety(trees) {
  const kinds = [...new Set(trees.map((t) => t.variant || '?'))];
  if (kinds.length === 1) return { variety: kinds[0] };
  const list = kinds.map((k) => `${k}: ${trees.filter((t) => (t.variant || '?') === k).map((t) => t.id).join(', ')}`).join('; ');
  return { error: `Satu kotak hanya untuk *satu varietas*. Pohon ini berbeda varietas (${list}). Kirim KUPAS terpisah untuk tiap varietas.` };
}

/** The message after KUPAS A6 A7: the fruits going in by tree, each tree's grade, how to send the boxes. */
function startReply(variety, trees, fruits, grades) {
  const head = `🥡 *Laporan KUPAS ${variety}*: ${trees.map((t) => t.id).join(', ')}`;
  if (!fruits.length)
    return `${head}\nTidak ada buah dari pohon ini dalam ${LOOK_BACK_DAYS} hari terakhir yang belum masuk kotak. Kirim Laporan PANEN dulu, atau cek ID pohonnya.`;
  const total = fruits.reduce((s, f) => s + f.weightG, 0);
  const byTree = trees
    .map((t) => {
      const list = fruits.filter((f) => f.treeId === t.id);
      const g = grades[t.id];
      const tag = g && g !== 'ungraded' ? ` (${g === 'midhigh' ? 'MID-HIGH' : g.toUpperCase()})` : ' (belum dinilai)';
      return list.length ? `*${t.id}*${tag}: ${list.map((f) => `${shortCode(f.code)} ${grams(f.weightG)}`).join(', ')}` : `*${t.id}*: tidak ada buah yang belum dikupas`;
    })
    .join('\n');
  const high = trees.filter((t) => grades[t.id] === 'high').map((t) => t.id);
  return [
    head,
    `Buah masuk: ${fruits.length} buah, ${grams(total)}`,
    byTree,
    high.length ? `⚠️ ${high.join(', ')} grade HIGH: biasanya *tidak dikupas*. Lanjutkan hanya jika memang sudah dikupas.` : '',
    'Kirim *berat tiap kotak* dalam gram, satu pesan, contoh: *400 410 395*.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Checks the weights: { ok: [g] } or { error }. */
function checkWeights(list) {
  if (!list || !list.length) return { error: 'Kirim berat tiap kotak dalam gram, contoh: *400 410 395*.' };
  if (list.length > 30) return { error: 'Paling banyak 30 kotak dalam satu pesan.' };
  const bad = list.find((g) => g < BOX_G.min || g > BOX_G.max);
  if (bad !== undefined) return { error: `Berat ${bad} g tidak masuk akal untuk satu kotak (${BOX_G.min}-${BOX_G.max} g). Kirim lagi semua beratnya.` };
  return { ok: list };
}

/** The boxes to save, numbered on from that variety's boxes already peeled today. */
function makeBoxes({ variety, treeIds, fruitCodes, weights, grades, today, workerPhone, existing = [] }) {
  const used = Math.max(0, ...existing.map((b) => R.fruitCodeNumber(b.code)));
  return weights.map((weightG, i) => ({
    code: boxCode(variety, today, used + i + 1),
    variety,
    treeIds,
    fruitCodes,
    date: today,
    weightG,
    grades,
    ...(workerPhone ? { workerPhone } : {}),
    source: 'whatsapp',
  }));
}

function savedReply(boxes, fruitG) {
  const total = boxes.reduce((s, b) => s + b.weightG, 0);
  return [
    `✅ ${boxes.length} kotak kupas ${boxes[0].variety} tersimpan (${grams(total)}${fruitG ? `, rendemen ${String(Math.round((total / fruitG) * 1000) / 10).replace('.', ',')}%` : ''}):`,
    boxes.map((b) => `• *${shortCode(b.code)}* ${grams(b.weightG)}`).join('\n'),
    'Tulis kode di setiap kotak.',
  ].join('\n');
}

// ---------- Firestore ----------

function kupasStore(db, byTree, getTree) {
  const modeRef = (phone) => db.collection('kupasMode').doc(String(phone));
  const boxesOf = async (variety) => (await db.collection('kupasBoxes').where('variety', '==', variety).get()).docs.map((d) => d.data());
  return {
    async start(phone, cmd) {
      if (cmd.trees.length > MAX_TREES) return `Paling banyak ${MAX_TREES} pohon dalam satu KUPAS.`;
      const trees = [];
      for (const id of cmd.trees) {
        const t = await getTree(id);
        if (!t) return `Pohon ${id} tidak ditemukan atau sudah tidak aktif. Contoh: *KUPAS A6 A7*.`;
        trees.push(t);
      }
      const v = oneVariety(trees);
      if (v.error) return v.error;
      const today = R.todayStr();
      const [harvests, samples, boxes] = await Promise.all([
        Promise.all(trees.map((t) => byTree('harvests', t.id))).then((x) => x.flat()),
        Promise.all(trees.map((t) => byTree('treeGrades', t.id).catch(() => []))),
        boxesOf(v.variety).catch(() => []),
      ]);
      const grades = Object.fromEntries(trees.map((t, i) => [t.id, G.treeGrade(samples[i]).grade]));
      const fruits = pool(harvests, boxes, today);
      if (fruits.length)
        await modeRef(phone).set({ variety: v.variety, treeIds: trees.map((t) => t.id), fruitCodes: fruits.map((f) => f.code), grades, until: Date.now() + WINDOW_MS });
      return startReply(v.variety, trees, fruits, grades);
    },
    /** The open KUPAS of this number, or null. */
    async open(phone) {
      const snap = await modeRef(phone).get().catch(() => null);
      const m = snap && snap.exists ? snap.data() : null;
      return m && Number(m.until) > Date.now() ? m : null;
    },
    async saveWeights(phone, mode, weights) {
      const check = checkWeights(weights);
      if (check.error) return check.error;
      const today = R.todayStr();
      const [existing, harvests] = await Promise.all([
        boxesOf(mode.variety).catch(() => []),
        Promise.all(mode.treeIds.map((id) => byTree('harvests', id))).then((x) => x.flat()),
      ]);
      const codes = new Set(mode.fruitCodes);
      const fruitG = harvests.flatMap((h) => h.items || []).filter((f) => codes.has(f.code)).reduce((s, f) => s + (Number(f.weightG) || 0), 0);
      const boxes = makeBoxes({
        variety: mode.variety,
        treeIds: mode.treeIds,
        fruitCodes: mode.fruitCodes,
        weights: check.ok,
        grades: mode.grades || {},
        today,
        workerPhone: phone,
        existing: existing.filter((b) => b.date === today),
      });
      const admin = require('firebase-admin');
      const batch = db.batch();
      for (const b of boxes) batch.set(db.collection('kupasBoxes').doc(b.code), { ...b, fruitG, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      batch.delete(modeRef(phone));
      await batch.commit();
      console.log(`Kupas ${mode.variety} (${mode.treeIds.join(',')}): ${boxes.length} boxes`);
      return savedReply(boxes, fruitG);
    },
  };
}

module.exports = { parseKupas, parseWeights, pool, oneVariety, startReply, checkWeights, makeBoxes, savedReply, shortCode, boxCode, kupasStore, WINDOW_MS };
