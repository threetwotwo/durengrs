// lib/rules.js — choices, ranges, dates and deterministic ids, plus the checks (and their Indonesian messages) of the
// farm Flow's rain and season-work screens. No database here, so it is easy to test.
//
// Names and ranges mirror the webapp (durengrs: src/lib/fieldData.ts, crop.ts, guide.ts). If one changes there,
// change it here and in test/rules.test.js.

const crypto = require('crypto');

// ---------- choices (same ids as the webapp) ----------

const GRADES = ['extra', 'class1', 'class2', 'reject'];

const BLOOM_PARTS = ['whole', 'lower', 'middle', 'upper', 'some'];

const SEASON_TASKS = ['hand_pollination', 'fruit_thinning', 'bagging', 'ca_mg_spray', 'fruit_tying'];
const SEASON_TASK_LABELS = {
  hand_pollination: 'Penyerbukan tangan',
  fruit_thinning: 'Buang buah berlebih',
  bagging: 'Brongsong buah',
  ca_mg_spray: 'Semprot Ca + Mg',
  fruit_tying: 'Ikat tangkai buah',
};

const CONDITIONS = ['healthy', 'minor', 'emergency'];
// The owner's words (Hijau / Kuning / Merah), same as the webapp; stored codes stay healthy / minor / emergency.
const CONDITION_LABELS = { healthy: 'Hijau', minor: 'Kuning', emergency: 'Merah' };

// ---------- crop count stages ----------

// The count kinds of cropCounts: the label shown to the worker, and the tree field the newest count keeps current.
const COUNT_STAGES = {
  clusters: { label: 'Jumlah tandan bunga', treeField: 'floweringClusters' },
  set: { label: 'Jumlah buah jadi', treeField: 'estimatedFruitCount' },
  kept: { label: 'Buah yang disisakan', treeField: 'estimatedFruitCount' },
  onTree: { label: 'Jumlah buah di pohon', treeField: 'estimatedFruitCount' },
};

// ---------- ranges ----------

const LIMITS = {
  // A harvest read from a report is recorded only within these (one tree, one picking: a typo guard).
  harvestFruits: { min: 1, max: 500 },
  harvestWeightKg: { min: 0.5, max: 2000 },
  rainMm: { min: 0, max: 400 },
  rainSoftMm: 100,
  taskMaxAgeDays: 30,
  rainMaxAgeDays: 7,
  notes: 500,
};

// ---------- dates (Asia/Jakarta) ----------

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
const todayStr = (now = new Date()) => dateFmt.format(now);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const toDateStr = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => toDateStr(new Date(parseDateStr(s).getTime() + n * 86400000));
const diffDays = (a, b) => Math.round((parseDateStr(a).getTime() - parseDateStr(b).getTime()) / 86400000);

// The Flow's DatePicker sends 'YYYY-MM-DD'; older clients may send a millisecond timestamp. Accept both.
function normalizeDate(value) {
  const s = String(value ?? '').trim();
  if (DATE_RE.test(s)) {
    const d = parseDateStr(s);
    return !Number.isNaN(d.getTime()) && toDateStr(d) === s ? s : null;
  }
  if (/^\d{10,13}$/.test(s)) return dateFmt.format(new Date(Number(s.length === 10 ? s * 1000 : s)));
  return null;
}

const dateLabel = (s) =>
  new Date(`${s}T12:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });

// ---------- numbers ----------

// Returns { value } or { error }. Accepts a comma as decimal separator ("2,5").
function parseNumber(raw, { label, min = 0, max, integer = false, required = true }) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (s === '') return required ? { error: `${label} wajib diisi.` } : { value: undefined };
  const n = Number(s);
  if (!Number.isFinite(n)) return { error: `${label}: "${raw}" bukan angka. Tulis angka saja, contoh: 12.` };
  if (integer && !Number.isInteger(n)) return { error: `${label} harus bilangan bulat, tanpa koma. Contoh: 12.` };
  if (n < min || n > max) return { error: `${label} harus antara ${min} dan ${max}. Periksa lagi angkanya.` };
  return { value: integer ? n : Math.round(n * 100) / 100 };
}

const asArray = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const cleanText = (v, max = LIMITS.notes) => String(v ?? '').trim().slice(0, max);

// ---------- ids (deterministic, so a retried submit never duplicates) ----------

const cropCountId = ({ treeId, season, stage, date }) => `${treeId}_${season}_${stage}_${date}`;
const seasonTaskId = (block, season, task) => `${block}_${season}_${task}`;
const bloomWaveId = (treeId, date, part) => `${treeId}_${date}_${part}`;
// A Flow message can be opened again later with the SAME flow token, so the token alone must not decide that a report
// "already exists". The id also depends on what was sent: a network retry (same data) maps to the same document,
// a genuinely new report from the same old message does not.
const idFromToken = (flowToken, content = {}) =>
  crypto.createHash('sha1').update(`${flowToken}|${JSON.stringify(content)}`).digest('hex').slice(0, 20);
// A harvest read from a report: one per report, so reading the report again never adds a second one.
const harvestIdForReport = (reportId) => `wa_${reportId}`;

// ---------- validators (pure) ----------
// Each returns { error } (hard, reject), { warning } (soft, asks the worker to confirm) or { ok: value }.

function checkSeasonTasks({ block, tasks, date }, { today, blocks }) {
  if (!block || !blocks.includes(block)) return { error: 'Pilih blok yang benar.' };
  const list = asArray(tasks).filter((t) => SEASON_TASKS.includes(t));
  if (!list.length) return { error: 'Pilih minimal satu pekerjaan yang sudah selesai.' };
  const d = normalizeDate(date);
  if (!d) return { error: 'Pilih tanggal pekerjaan.' };
  if (d > today) return { error: 'Tanggal pekerjaan tidak boleh di masa depan.' };
  if (diffDays(today, d) > LIMITS.taskMaxAgeDays) return { error: `Tanggal terlalu lama (lebih dari ${LIMITS.taskMaxAgeDays} hari lalu).` };
  return { ok: { block, tasks: list, date: d } };
}

function checkRain({ date, mm }, { today }) {
  const d = normalizeDate(date);
  if (!d) return { error: 'Pilih tanggal.' };
  if (d > today) return { error: 'Tanggal tidak boleh di masa depan.' };
  if (diffDays(today, d) > LIMITS.rainMaxAgeDays) return { error: `Hanya bisa mencatat ${LIMITS.rainMaxAgeDays} hari terakhir.` };
  const r = parseNumber(mm, { label: 'Curah hujan (mm)', min: LIMITS.rainMm.min, max: LIMITS.rainMm.max });
  if (r.error) return { error: r.error };
  const value = { date: d, rainMm: r.value };
  return r.value > LIMITS.rainSoftMm
    ? { warning: `Hujan ${r.value} mm itu sangat deras. Sudah benar?`, ok: value }
    : { ok: value };
}

module.exports = {
  GRADES, BLOOM_PARTS, SEASON_TASKS, SEASON_TASK_LABELS, CONDITIONS, CONDITION_LABELS, COUNT_STAGES, LIMITS,
  todayStr, addDays, diffDays, normalizeDate, dateLabel,
  parseNumber, cleanText,
  cropCountId, seasonTaskId, bloomWaveId, idFromToken, harvestIdForReport,
  checkSeasonTasks, checkRain,
};
