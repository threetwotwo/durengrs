// lib/rules.js — the single place for what counts as a valid report: ranges, choices, dates, ids and the
// Indonesian wording of every message a worker can see. No database here, so it is easy to test.
//
// Names and ranges mirror the webapp (durengrs: src/lib/fieldData.ts, crop.ts, guide.ts). If one changes there,
// change it here and in test/rules.test.js.

const crypto = require('crypto');

// ---------- choices (same ids as the webapp) ----------

const GRADES = ['extra', 'class1', 'class2', 'reject'];
const GRADE_LABELS = { extra: 'Extra', class1: 'Kelas I', class2: 'Kelas II', reject: 'Afkir' };

const HARVEST_PROBLEMS = ['wet_core', 'uneven', 'rot', 'crack', 'borer'];
const PROBLEM_LABELS = {
  wet_core: 'Inti basah',
  uneven: 'Tidak merata',
  rot: 'Busuk',
  crack: 'Retak',
  borer: 'Penggerek',
};

const BLOOM_PARTS = ['whole', 'lower', 'middle', 'upper', 'some'];
const BLOOM_PART_LABELS = {
  whole: 'Seluruh pohon',
  lower: 'Dahan bawah',
  middle: 'Dahan tengah',
  upper: 'Dahan atas',
  some: 'Sebagian dahan',
};

const SEASON_TASKS = ['hand_pollination', 'fruit_thinning', 'bagging', 'ca_mg_spray', 'fruit_tying'];
const SEASON_TASK_LABELS = {
  hand_pollination: 'Penyerbukan tangan',
  fruit_thinning: 'Buang buah berlebih',
  bagging: 'Brongsong buah',
  ca_mg_spray: 'Semprot Ca + Mg',
  fruit_tying: 'Ikat tangkai buah',
};

const CONDITIONS = ['healthy', 'minor', 'emergency'];
const CONDITION_LABELS = { healthy: 'Sehat', minor: 'Masalah ringan', emergency: 'Darurat' };

const PROBLEM_TYPES = ['leaf', 'trunk', 'borer', 'pest', 'fruit', 'other'];
const PROBLEM_TYPE_LABELS = {
  leaf: 'Daun / tunas',
  trunk: 'Batang / getah',
  borer: 'Lubang penggerek',
  pest: 'Hama',
  fruit: 'Buah busuk / rontok',
  other: 'Lainnya',
};

// ---------- crop count stages ----------

const COUNT_STAGES = {
  clusters: {
    max: 2000,
    title: 'Hitung Tandan Bunga',
    label: 'Jumlah tandan bunga',
    help: 'Tandan bunga = rangkaian bunga di satu tempat pada dahan. Hitung dari bawah pohon, lalu jumlahkan semua dahan. Perkiraan boleh. Isi 0 jika belum ada.',
    treeField: 'floweringClusters',
  },
  set: {
    max: 500,
    title: 'Hitung Buah Jadi',
    label: 'Jumlah buah jadi',
    help: 'Buah jadi = bunga yang berhasil menjadi buah kecil, sebesar kelereng atau lebih. Hitung 1 sampai 4 minggu setelah bunga mekar.',
    treeField: 'estimatedFruitCount',
  },
  kept: {
    max: 500,
    title: 'Hitung Buah yang Disisakan',
    label: 'Buah yang disisakan',
    help: 'Setelah buah kecil yang berlebih dibuang (supaya buah yang tersisa tumbuh besar), hitung buah yang masih ada di pohon.',
    treeField: 'estimatedFruitCount',
  },
  onTree: {
    max: 500,
    title: 'Hitung Buah di Pohon',
    label: 'Jumlah buah di pohon',
    help: 'Hitung buah yang masih menggantung di pohon. Ulangi tiap 2 minggu agar kita tahu berapa yang rontok.',
    treeField: 'estimatedFruitCount',
  },
};

// A tree is asked to recount fruit on the tree after this many days (crop.ts RECOUNT_DAYS).
const RECOUNT_DAYS = 14;

// ---------- ranges ----------

// Same limits as the webapp's TREE_LIMITS (src/lib/trees.ts); branches has no webapp limit, 1000 is a typo guard.
const TREE_LIMITS = {
  canopySize: { label: 'Lebar kanopi (cm)', min: 50, max: 2500, integer: false },
  trunkSize: { label: 'Lingkar batang (cm)', min: 1, max: 600, integer: false },
  floweringBranches: { label: 'Dahan berbunga', min: 0, max: 1000, integer: true },
  floweringClusters: { label: 'Tandan bunga', min: 0, max: 2000, integer: true },
  estimatedFruitCount: { label: 'Perkiraan jumlah buah', min: 0, max: 500, integer: true },
};


const LIMITS = {
  harvestFruits: { min: 1, max: 500 },
  harvestWeightKg: { min: 0.5, max: 2000 },
  avgKgPerFruit: { min: 0.5, max: 6 }, // soft
  rainMm: { min: 0, max: 400 },
  rainSoftMm: 100,
  bloomMaxAgeDays: 60,
  bloomNearDays: 7,
  taskMaxAgeDays: 30,
  rainMaxAgeDays: 7,
  harvestMinDaysFromBloom: 60, // soft
  setPerClusterSoft: 30, // soft
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
const idFromToken = (flowToken, content = {}, prefix = '') =>
  prefix + crypto.createHash('sha1').update(`${flowToken}|${JSON.stringify(content)}`).digest('hex').slice(0, 20 - prefix.length);
const harvestIdFromToken = (flowToken, content) => idFromToken(flowToken, content, 'wa');

// ---------- validators (pure) ----------
// Each returns { error } (hard, reject), { warning } (soft, asks the worker to confirm) or { ok: value }.

function checkBloom({ date, part, note }, { today, existing = [] }) {
  const d = normalizeDate(date);
  if (!d) return { error: 'Pilih tanggal bunga mekar.' };
  if (d > today) return { error: 'Tanggal bunga tidak boleh di masa depan. Pilih hari ini atau sebelumnya.' };
  if (diffDays(today, d) > LIMITS.bloomMaxAgeDays)
    return { error: `Tanggal terlalu lama (lebih dari ${LIMITS.bloomMaxAgeDays} hari lalu). Periksa lagi tanggalnya.` };
  if (!BLOOM_PARTS.includes(part)) return { error: 'Pilih bagian pohon yang berbunga.' };
  const near = existing.find((b) => b.part === part && b.date !== d && Math.abs(diffDays(b.date, d)) < LIMITS.bloomNearDays);
  const value = { date: d, part, note: cleanText(note, 200) || undefined };
  if (near) {
    return {
      warning: `Sudah ada catatan bunga ${BLOOM_PART_LABELS[part].toLowerCase()} pada ${dateLabel(near.date)}. Jika ini memang gelombang bunga yang berbeda, centang "Ya, sudah benar" lalu kirim lagi.`,
      ok: value,
    };
  }
  return { ok: value };
}

// prev = { clusters, set, kept, onTree } latest counts for the chosen wave (numbers or undefined).
function checkCount(stage, { count, note }, prev = {}) {
  const spec = COUNT_STAGES[stage];
  if (!spec) return { error: 'Jenis hitungan tidak dikenal.' };
  const n = parseNumber(count, { label: spec.label, min: 0, max: spec.max, integer: true });
  if (n.error) return { error: n.error };
  const value = { count: n.value, note: cleanText(note, 200) || undefined };

  let warning;
  if (stage === 'set' && prev.clusters > 0 && n.value > LIMITS.setPerClusterSoft * prev.clusters) {
    warning = `Angka ${n.value} tinggi dibanding jumlah tandan bunga (${prev.clusters}). Sudah benar?`;
  } else if (stage === 'kept' && prev.set !== undefined && n.value > prev.set) {
    warning = `Angka ${n.value} lebih banyak dari buah jadi (${prev.set}). Biasanya buah berkurang setelah buah berlebih dibuang. Sudah benar?`;
  } else if (stage === 'onTree') {
    const ref = prev.kept !== undefined ? ['yang disisakan', prev.kept] : prev.set !== undefined ? ['jadi', prev.set] : null;
    if (ref && n.value > ref[1]) warning = `Angka ${n.value} lebih banyak dari buah ${ref[0]} (${ref[1]}). Sudah benar?`;
  }
  return warning ? { warning, ok: value } : { ok: value };
}

// Step A of a harvest: date, number of fruit, weight.
function checkHarvestBasics({ date, fruits, weight }, { today, floweredOn }) {
  const d = normalizeDate(date);
  if (!d) return { error: 'Pilih tanggal panen.' };
  if (d > today) return { error: 'Tanggal panen tidak boleh di masa depan.' };
  if (floweredOn && d < floweredOn) return { error: `Tanggal panen tidak boleh sebelum bunga mekar (${dateLabel(floweredOn)}).` };
  const f = parseNumber(fruits, { label: 'Jumlah buah dipanen', min: LIMITS.harvestFruits.min, max: LIMITS.harvestFruits.max, integer: true });
  if (f.error) return { error: f.error };
  const w = parseNumber(weight, { label: 'Berat total (kg)', min: LIMITS.harvestWeightKg.min, max: LIMITS.harvestWeightKg.max, required: false });
  if (w.error) return { error: w.error };
  const value = { date: d, fruits: f.value, weightKg: w.value };

  const warnings = [];
  if (floweredOn && diffDays(d, floweredOn) < LIMITS.harvestMinDaysFromBloom)
    warnings.push(`Panen baru ${diffDays(d, floweredOn)} hari setelah bunga mekar. Biasanya jauh lebih lama.`);
  if (w.value !== undefined) {
    const avg = w.value / f.value;
    if (avg < LIMITS.avgKgPerFruit.min || avg > LIMITS.avgKgPerFruit.max)
      warnings.push(`Rata-rata ${avg.toFixed(1)} kg per buah terlihat tidak biasa (umumnya 1-4 kg).`);
  }
  return warnings.length ? { warning: warnings.join(' '), ok: value } : { ok: value };
}

// Step B of a harvest: grades and quality problems, checked against the fruit count of step A.
function checkHarvestQuality({ grades = {}, problems, problemFruits }, fruits) {
  const out = {};
  let sum = 0;
  for (const g of GRADES) {
    const r = parseNumber(grades[g], { label: `Jumlah ${GRADE_LABELS[g]}`, min: 0, max: LIMITS.harvestFruits.max, integer: true, required: false });
    if (r.error) return { error: r.error };
    if (r.value) out[g] = r.value;
    sum += r.value || 0;
  }
  if (sum > fruits)
    return { error: `Jumlah semua kelas (${sum}) lebih banyak dari buah yang dipanen (${fruits}). Periksa lagi angkanya.` };

  const list = asArray(problems).filter((p) => HARVEST_PROBLEMS.includes(p));
  const pf = parseNumber(problemFruits, { label: 'Jumlah buah bermasalah', min: 0, max: LIMITS.harvestFruits.max, integer: true, required: false });
  if (pf.error) return { error: pf.error };
  if (pf.value > fruits) return { error: `Buah bermasalah (${pf.value}) tidak boleh lebih banyak dari buah yang dipanen (${fruits}).` };
  if (list.length && !pf.value) return { error: 'Anda memilih masalah mutu. Isi juga berapa buah yang bermasalah.' };
  if (!list.length && pf.value) return { error: 'Pilih jenis masalah mutu untuk buah yang bermasalah.' };

  return {
    ok: {
      grades: Object.keys(out).length ? out : undefined,
      problems: list,
      problemFruits: pf.value || undefined,
      ungraded: Object.keys(out).length ? fruits - sum : undefined,
    },
  };
}

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

// "[Daun / tunas, Hama] Daun kuning di dahan bawah" — makes the report card and the Guide topics readable.
function describeWithTypes(types, description) {
  const labels = asArray(types).filter((t) => PROBLEM_TYPES.includes(t)).map((t) => PROBLEM_TYPE_LABELS[t]);
  const text = cleanText(description, 600);
  if (!labels.length) return text;
  return `[${labels.join(', ')}]${text ? ' ' + text : ''}`.slice(0, 600);
}

module.exports = {
  GRADES, GRADE_LABELS, HARVEST_PROBLEMS, PROBLEM_LABELS, BLOOM_PARTS, BLOOM_PART_LABELS,
  SEASON_TASKS, SEASON_TASK_LABELS, CONDITIONS, CONDITION_LABELS, PROBLEM_TYPES, PROBLEM_TYPE_LABELS,
  COUNT_STAGES, RECOUNT_DAYS, LIMITS,
  todayStr, addDays, diffDays, normalizeDate, dateLabel,
  parseNumber, asArray, cleanText,
  cropCountId, seasonTaskId, bloomWaveId, harvestIdFromToken, idFromToken,
  TREE_LIMITS,
  checkBloom, checkCount, checkHarvestBasics, checkHarvestQuality, checkSeasonTasks, checkRain, describeWithTypes,
};
