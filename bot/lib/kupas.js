// lib/kupas.js — Laporan KUPAS: the kupas station records its boxes, each with its own code (SKU). A box holds the
// flesh of fruits from ONE tree picked on ONE day, so its code follows the fruits': K-A6-20261105-01 is the first box
// of A6's fruits picked 5 Nov (shown short as K-A6-1105-01). In the chat:
//   KUPAS A6          the tree's fruits of its latest picking day (or KUPAS A6 5/11 for another day), its grade
//   400 410 395       within 30 minutes: each box's weight in grams; the bot answers with the box codes
// Saved as kupasBoxes/{code}: treeId, block, variant, fruitDate (picked), date (peeled), weightG, fruitCodes (that
// tree's fruits of that day), grade (the tree's then), workerPhone.
'use strict';
const R = require('./rules');
const G = require('./grading');

const WINDOW_MS = 30 * 60 * 1000;
const LOOK_BACK_DAYS = 14;
const BOX_G = { min: 50, max: 5000 };

/** "KUPAS A6", "kupas a 6 5/11" -> { tree: 'A6', day: 5, month: 11 }; null when not a kupas command. */
function parseKupas(text) {
  const m = String(text || '').trim().match(/^kupa?s\s+([a-z]{1,3})\s*(\d{1,3})(?:\s+(\d{1,2})\s*[/.-]\s*(\d{1,2}))?\s*$/i);
  if (!m) return null;
  return { tree: `${m[1].toUpperCase()}${Number(m[2])}`, ...(m[3] ? { day: Number(m[3]), month: Number(m[4]) } : {}) };
}

/** "400 410 395", "400, 410; 395 g" -> [400, 410, 395]; null when the message isn't only box weights. */
function parseWeights(text) {
  const s = String(text || '').trim().replace(/\s*(gr|g|gram)\b\.?/gi, '');
  if (!/^\d{2,4}([\s,;+]+\d{2,4})*$/.test(s)) return null;
  return s.split(/[\s,;+]+/).map(Number);
}

/** A day typed as 5/11 as a date: this year, or last year when that is still to come. */
function dayToDate(day, month, today) {
  let y = Number(today.slice(0, 4));
  const pad = (n) => String(n).padStart(2, '0');
  if (`${y}-${pad(month)}-${pad(day)}` > today) y--;
  return `${y}-${pad(month)}-${pad(day)}`;
}

const boxCode = (treeId, fruitDate, n) => `K-${R.fruitCode(treeId, fruitDate, n)}`;
const shortBox = (code) => String(code).replace(/-\d{4}(\d{4})-/, '-$1-');
const grams = (n) => `${Math.round(n).toLocaleString('id-ID')} g`;

/**
 * The fruits a box can come from: the tree's fruits of the day asked, or of its latest picking day within two weeks.
 * { fruitDate, fruits: [{ code, weightG }] } or { fruitDate: null }.
 */
function pickDay(harvests, today, asked) {
  const withFruit = harvests.filter((h) => (h.items || []).length && h.date <= today && h.date >= R.addDays(today, -LOOK_BACK_DAYS));
  const fruitDate = asked || withFruit.map((h) => h.date).sort().pop() || null;
  if (!fruitDate) return { fruitDate: null, fruits: [] };
  const fruits = harvests.filter((h) => h.date === fruitDate).flatMap((h) => (h.items || []).map((f) => ({ code: f.code, weightG: f.weightG })));
  return { fruitDate, fruits };
}

/** The message after KUPAS A6: the fruits, the grade, how to send the boxes. */
function startReply(tree, { fruitDate, fruits }, gradeLines, boxesSoFar) {
  const head = `🥡 *Laporan KUPAS ${tree.id}*`;
  if (!fruitDate || !fruits.length)
    return `${head}\nTidak ada buah ${tree.id} yang tercatat${fruitDate ? ` pada ${R.dateLabel(fruitDate)}` : ` dalam ${LOOK_BACK_DAYS} hari terakhir`}. Kirim Laporan PANEN dulu, atau tulis harinya, contoh: *KUPAS ${tree.id} 5/11*.`;
  const total = fruits.reduce((s, f) => s + (Number(f.weightG) || 0), 0);
  const list = fruits.map((f) => `• ${f.code ? shortBox(f.code) : '?'} ${grams(f.weightG || 0)}`).join('\n');
  return [
    head,
    `Buah dipungut ${R.dateLabel(fruitDate)}: ${fruits.length} buah, ${grams(total)}`,
    list,
    gradeLines.join('\n'),
    boxesSoFar ? `Sudah tercatat ${boxesSoFar} kotak dari buah ini.` : '',
    `Kirim *berat tiap kotak* dalam gram, satu pesan, contoh: *400 410 395*. Untuk buah hari lain: *KUPAS ${tree.id} 5/11*.`,
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

/** The boxes to save, numbered on from that tree and day's boxes already saved. */
function makeBoxes({ tree, fruitDate, fruits, weights, grade, today, workerPhone, existing = [] }) {
  const used = Math.max(0, ...existing.map((b) => R.fruitCodeNumber(b.code)));
  return weights.map((weightG, i) => ({
    code: boxCode(tree.id, fruitDate, used + i + 1),
    treeId: tree.id,
    block: tree.block,
    variant: tree.variant,
    fruitDate,
    date: today,
    weightG,
    fruitCodes: fruits.map((f) => f.code).filter(Boolean),
    grade,
    ...(workerPhone ? { workerPhone } : {}),
    source: 'whatsapp',
  }));
}

function savedReply(boxes, fruits) {
  const total = boxes.reduce((s, b) => s + b.weightG, 0);
  const fruitG = fruits.reduce((s, f) => s + (Number(f.weightG) || 0), 0);
  return [
    `✅ ${boxes.length} kotak kupas ${boxes[0].treeId} tersimpan (${grams(total)}):`,
    boxes.map((b) => `• *${shortBox(b.code)}* ${grams(b.weightG)}`).join('\n'),
    'Tulis kode di setiap kotak.',
  ].join('\n');
}

// ---------- Firestore ----------

function kupasStore(db, byTree) {
  const modeRef = (phone) => db.collection('kupasMode').doc(String(phone));
  return {
    async start(phone, tree, cmd) {
      const today = R.todayStr();
      const [harvests, gradeSamples] = await Promise.all([byTree('harvests', tree.id), byTree('treeGrades', tree.id).catch(() => [])]);
      const asked = cmd.day ? dayToDate(cmd.day, cmd.month, today) : null;
      const day = pickDay(harvests, today, asked);
      const g = G.treeGrade(gradeSamples);
      const lines = G.gradeLines(tree.id, g);
      if (g.grade === 'high') lines.push('⚠️ Grade HIGH biasanya *tidak dikupas*. Catat kotaknya hanya jika memang sudah dikupas.');
      let soFar = 0;
      if (day.fruitDate && day.fruits.length) {
        soFar = (await byTree('kupasBoxes', tree.id).catch(() => [])).filter((b) => b.fruitDate === day.fruitDate).length;
        await modeRef(phone).set({ treeId: tree.id, fruitDate: day.fruitDate, until: Date.now() + WINDOW_MS });
      }
      return startReply(tree, day, lines, soFar);
    },
    /** The open KUPAS of this number, or null. */
    async open(phone) {
      const snap = await modeRef(phone).get().catch(() => null);
      const m = snap && snap.exists ? snap.data() : null;
      return m && Number(m.until) > Date.now() ? m : null;
    },
    async saveWeights(phone, mode, weights, tree) {
      const check = checkWeights(weights);
      if (check.error) return check.error;
      const today = R.todayStr();
      const [harvests, gradeSamples, existing] = await Promise.all([
        byTree('harvests', tree.id),
        byTree('treeGrades', tree.id).catch(() => []),
        byTree('kupasBoxes', tree.id).catch(() => []),
      ]);
      const day = pickDay(harvests, today, mode.fruitDate);
      const boxes = makeBoxes({
        tree,
        fruitDate: mode.fruitDate,
        fruits: day.fruits,
        weights: check.ok,
        grade: G.treeGrade(gradeSamples).grade,
        today,
        workerPhone: phone,
        existing: existing.filter((b) => b.fruitDate === mode.fruitDate),
      });
      const batch = db.batch();
      const admin = require('firebase-admin');
      for (const b of boxes) batch.set(db.collection('kupasBoxes').doc(b.code), { ...b, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      batch.delete(modeRef(phone));
      await batch.commit();
      console.log(`Kupas ${tree.id} ${mode.fruitDate}: ${boxes.length} boxes`);
      return savedReply(boxes, day.fruits);
    },
  };
}

module.exports = { parseKupas, parseWeights, dayToDate, pickDay, startReply, checkWeights, makeBoxes, savedReply, shortBox, boxCode, kupasStore, WINDOW_MS };
