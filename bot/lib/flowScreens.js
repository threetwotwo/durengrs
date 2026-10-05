// lib/flowScreens.js — every screen of the two Flows, and what happens when a worker presses a button.
// The Flow JSON files only draw; rules live in rules.js and the endpoint answers each button with the next screen,
// or the same screen plus an error_message.
//
//  Flow "Laporan Pohon" (kind 'tree', opened by sending a tree ID, flow.json):
//    TREE_LOOKUP -> MENU -> REPORT                     (Laporan Masalah)
//                        -> PANEN_MENU -> BLOOM | COUNT | HARVEST_A -> HARVEST_B | EDIT_TREE (ubah data pohon)
//
//  Flow "Catatan Kebun" (kind 'farm', opened with the Hujan & Pekerjaan button or the word KEBUN, flow-farm.json):
//    FARM_HOME -> KERJA (Pekerjaan Selesai) | HUJAN (Curah Hujan)
//
//  Every report ends on DONE.
//
// RULE FOR flow.json: a dynamic property is always the WHOLE value ("${data.title}"), never text mixed with a
// variable ("Pohon ${data.title}" shows up literally on the phone). Build such strings here.
//
// A "soft" problem (a number that looks odd but could be true) comes back as error_message + an
// "Ya, sudah benar" checkbox; sending again with the box ticked (and the value unchanged) saves it.
const R = require('./rules');
const { getTreeById, getLastReport, updateTreeMeasurements } = require('./trees');
const { processPhotos, createReport, reportExists } = require('./reports');
const C = require('./cropData');
const S = require('./shared'); // generated from the webapp's src/shared: triage, labels, health words

const STATUS_ICONS = { healthy: '🟢', minor: '🟡', emergency: '🔴' };
const conditionLabel = (c) => R.CONDITION_LABELS[c] || 'Belum dinilai';
const treeLabel = (id, tree) => [id, tree?.variant, tree?.block ? `Blok ${tree.block}` : null].filter(Boolean).join(' · ');
const s = (v) => (v == null ? '' : String(v));
const isYes = (v) => v === true || v === 'true';
const NONE = '-'; // a hidden text still needs a value

function formatDate(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const screen = (name, data) => ({ version: '3.0', screen: name, data });
const withError = (res, message) => ({ ...res, data: { ...res.data, error_message: message } });
// `saved` goes back to WhatsApp with the completion, so the chat message after the Flow can say what really happened.
const done = (message, title = '✅ Laporan tersimpan') => screen('DONE', { title, message, saved: true });
const notSaved = (message) => screen('DONE', { title: '⚠️ Gagal', message, saved: false });
const treeGone = (treeId) => notSaved(`Pohon ${treeId || ''} tidak ditemukan atau sudah tidak aktif, tidak ada yang disimpan.`);

// ---------- season helpers ----------

async function seasonOf(tree, today) {
  try {
    return await C.loadTreeSeason(tree, today);
  } catch (err) {
    console.error('Could not load season:', err);
    return null;
  }
}

const waveTitle = (w) => `${R.dateLabel(w.date)} · ${R.BLOOM_PART_LABELS[w.part] || ''}`.slice(0, 30);

// What to do next on this tree, or '' when nothing is due (then nothing is shown at all).
function suggestionText(season) {
  if (!season) return '';
  if (!season.waves.length) return 'Pohon ini belum punya tanggal bunga. Mulailah dengan "Mulai berbunga" di Panen & Data Pohon.';
  const n = season.next;
  if (!n) return '';
  if (n.kind === 'harvest') return 'Saran: buah sudah waktunya dipanen. Pilih Panen & Data Pohon, lalu "Catat panen".';
  const label = { clusters: 'hitung tandan bunga', set: 'hitung buah jadi', kept: 'hitung buah yang disisakan', onTree: 'hitung buah di pohon' }[n.kind];
  const since = n.sinceDays != null ? ` (terakhir dihitung ${n.sinceDays} hari lalu)` : '';
  return `Saran: ${label}${since}. Pilih Panen & Data Pohon.`;
}

// Data every screen that shows the suggestion needs (MENU, and TREE_LOOKUP which passes it on).
const suggestionData = (text) => ({ suggestion: text || NONE, has_suggestion: !!text });

// ---------- TREE_LOOKUP ----------

// The owner's dose for this tree (Kebun › Aturan label dan dosis in the webapp), or '' when there's nothing to go on.
// Shown to workers only once the owner has confirmed the rules and given a unit: "0.75 NPK Perfect" alone is not
// something to put on a tree. Fruit on the tree is worked out exactly as the webapp's Kebun sheet does.
/** Milliseconds of a Firestore Timestamp, Date, number or date text; 0 when unknown. */
function msOf(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Date.parse(v) || 0;
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  if (typeof v._seconds === 'number') return v._seconds * 1000;
  return 0;
}

function doseLine(tree, rules, season) {
  if (!rules || !rules.confirmed || !String(rules.dose?.unit || '').trim()) return '';
  const n = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
  // Same reading as the web app's Kebun sheet (src/shared/crop.ts): last fruit count minus fruit picked since, or the
  // tree's estimate when it was updated this season.
  const updated = Math.max(msOf(tree.dateUpdated), msOf(tree.lastReportAt));
  const estimate = { count: tree.estimatedFruitCount, date: updated ? R.todayStr(new Date(updated)) : undefined };
  const fruitNow = season
    ? S.fruitRemaining(season.counts || [], season.harvests || [], (season.waves || []).map((w) => w.date), estimate) ?? n(tree.estimatedFruitCount)
    : n(tree.estimatedFruitCount);
  const labels = {
    batang: S.labelBatang(n(tree.trunkSize), rules),
    tajuk: S.labelTajuk(n(tree.canopySize), rules),
    fruitset: S.labelFruitset(fruitNow, rules),
  };
  const d = S.doseSuggestion(labels, rules);
  if (!d) return '';
  return `- Dosis pupuk: **${d.dose} ${rules.dose.unit} ${d.product}**`;
}

function treeViewData(treeId, tree, lastReport, rules, season) {
  if (!tree) {
    return {
      title: `Pohon ${treeId || ''}`, status: 'Tidak ditemukan', measurements: '- Periksa ID lalu coba lagi', notes: '—',
      last_meta: '—', last_text: '—', last_photos: '—', menu_title: `Pohon ${treeId || ''}`, ...suggestionData(''),
    };
  }
  const status = `${STATUS_ICONS[tree.condition] || '⚪'} ${conditionLabel(tree.condition)}` + (tree.conditionNotes ? ` — ${tree.conditionNotes}` : '');
  const cm = (v) => (v == null ? '—' : `${v} cm`);
  const num = (v) => (v == null ? '—' : v);

  let lastMeta = 'Belum ada laporan';
  let lastText = '—';
  let lastPhotos = '📷 Tidak ada foto';
  if (lastReport) {
    lastMeta = formatDate(lastReport.createdAt) || 'Laporan terakhir';
    if (lastReport.conditionChanged) lastMeta += ` · ${conditionLabel(lastReport.conditionBefore)} → ${conditionLabel(lastReport.conditionAfter)}`;
    lastText = lastReport.description || 'Tanpa keterangan';
    const photos = (lastReport.photos || []).slice(0, 3);
    if (photos.length) lastPhotos = '📷 ' + photos.map((p, i) => `[Foto ${i + 1}](${p.url})`).join(' · ');
  }
  return {
    title: `Pohon ${tree.id} · ${tree.variant}`,
    status,
    measurements: [
      `- Lebar kanopi: **${cm(tree.canopySize)}**`,
      `- Lingkar batang: **${cm(tree.trunkSize)}**`,
      `- Dahan berbunga: **${num(tree.floweringBranches)}**`,
      `- Tandan bunga: **${num(tree.floweringClusters)}**`,
      `- Perkiraan jumlah buah: **${num(tree.estimatedFruitCount)}**`,
      ...(doseLine(tree, rules, season) ? [doseLine(tree, rules, season)] : []),
    ].join('\n'),
    notes: tree.notes || '—',
    last_meta: lastMeta,
    last_text: lastText,
    last_photos: lastPhotos,
    menu_title: `Pohon ${treeLabel(tree.id, tree)}`,
    ...suggestionData(''),
  };
}

async function treeLookupScreen(treeId) {
  const tree = treeId ? await getTreeById(treeId) : null;
  let lastReport = null;
  try {
    lastReport = await getLastReport(tree);
  } catch (err) {
    console.error('Could not load last report:', err);
  }
  let rules = null;
  try {
    rules = tree ? await C.labelRules() : null;
  } catch (err) {
    console.error('Could not load label rules:', err);
  }
  const season = tree ? await seasonOf(tree, R.todayStr()) : null;
  const data = treeViewData(treeId, tree, lastReport, rules, season);
  if (tree) Object.assign(data, suggestionData(suggestionText(season)));
  return screen('TREE_LOOKUP', data);
}

// ---------- screen builders (tree Flow) ----------

const menuScreen = (treeId, tree, season) =>
  screen('MENU', { menu_title: `Pohon ${treeLabel(treeId, tree)}`, ...suggestionData(suggestionText(season)) });

const issueScreen = (treeId, tree) =>
  screen('REPORT', {
    report_title: `Laporan untuk ${treeLabel(treeId, tree)}`,
    condition_caption: `Kondisi saat ini: ${conditionLabel(tree?.condition)}`,
  });

const confirmData = (extra = {}) => ({ needs_confirm: false, warned: '', ...extra });

const editScreen = (treeId, tree) =>
  screen('EDIT_TREE', {
    edit_title: `Ubah data ${treeLabel(treeId, tree)}`,
    init_values: {
      canopy: s(tree?.canopySize), trunk: s(tree?.trunkSize), branches: s(tree?.floweringBranches), notes: s(tree?.notes),
    },
  });

const STAGE_MENU = [
  { id: 'bloom', needsBloom: false, title: 'Mulai berbunga', description: 'Bunga pertama mekar. Tanggalnya menentukan jadwal panen.' },
  { id: 'clusters', needsBloom: true, title: 'Hitung tandan bunga', description: 'Saat berbunga: hitung rangkaian bunga di pohon.' },
  { id: 'set', needsBloom: true, title: 'Hitung buah jadi', description: '1-4 minggu setelah bunga mekar.' },
  { id: 'kept', needsBloom: true, title: 'Hitung buah yang disisakan', description: 'Setelah buah kecil yang berlebih dibuang.' },
  { id: 'onTree', needsBloom: true, title: 'Hitung buah di pohon', description: 'Ulangi tiap 2 minggu sampai panen.' },
  { id: 'harvest', needsBloom: false, title: 'Catat panen', description: 'Jumlah buah, berat, dan kelas mutu.' },
  { id: 'tree', needsBloom: false, title: 'Ubah data pohon', description: 'Kanopi, lingkar batang, dahan berbunga, catatan.' },
];

async function panenMenuScreen(treeId, tree, season) {
  const recommended = season?.next?.kind;
  // Counts need a flowering date to hang on; without one only the options that work are listed.
  const hasBloom = !season || season.waves.length > 0;
  const options = STAGE_MENU.filter((o) => hasBloom || !o.needsBloom).map(({ needsBloom, ...o }) =>
    o.id === recommended ? { ...o, description: `Disarankan sekarang. ${o.description}` } : o
  );
  const hint = suggestionText(season);
  return screen('PANEN_MENU', {
    panen_title: `Panen & Data Pohon · ${treeLabel(treeId, tree)}`,
    panen_hint: hint || NONE,
    has_hint: !!hint,
    stage_options: options,
  });
}

function bloomScreen(treeId, tree, today) {
  return screen('BLOOM', {
    bloom_title: `Mulai berbunga · ${treeLabel(treeId, tree)}`,
    min_date: R.addDays(today, -R.LIMITS.bloomMaxAgeDays),
    max_date: today,
    ...confirmData(),
  });
}

function countScreen(treeId, tree, stage, season) {
  const spec = R.COUNT_STAGES[stage];
  const waves = season.waves;
  const preferred = season.next?.kind === stage ? season.next.season : waves[waves.length - 1].date;
  return screen('COUNT', {
    count_title: `${spec.title} · ${treeLabel(treeId, tree)}`,
    count_help: spec.help,
    count_label: spec.label,
    stage,
    wave_options: waves.map((w) => ({ id: w.date, title: waveTitle(w) })),
    init_values: { wave: preferred },
    ...confirmData(),
  });
}

function harvestAScreen(treeId, tree, today, season) {
  const first = season?.waves?.[0]?.date;
  return screen('HARVEST_A', {
    harvest_title: `Catat panen · ${treeLabel(treeId, tree)}`,
    min_date: first || R.addDays(today, -365),
    max_date: today,
    init_values: { date: today },
    ...confirmData(),
  });
}

function harvestBScreen(treeId, tree, basics) {
  const parts = [`${basics.fruits} buah`];
  if (basics.weightKg !== undefined) parts.push(`${basics.weightKg} kg`);
  parts.push(R.dateLabel(basics.date));
  return screen('HARVEST_B', {
    harvest_b_title: `Mutu panen · ${treeLabel(treeId, tree)}`,
    harvest_summary: `Panen: ${parts.join(' · ')}`,
    grade_help: `Extra = bentuk dan matang sempurna. Kelas I = cacat kecil. Kelas II = cacat sedang. Afkir = tidak layak jual. Jumlah semua kelas tidak boleh melebihi ${basics.fruits} buah.`,
    date: basics.date,
    fruits: String(basics.fruits),
    weight: basics.weightKg === undefined ? '' : String(basics.weightKg),
  });
}

// ---------- screen builders (farm Flow) ----------

const farmHomeScreen = () => screen('FARM_HOME', {});

async function workScreen(today) {
  const blocks = await C.listBlocks();
  return screen('KERJA', {
    work_title: 'Pekerjaan Selesai',
    block_options: blocks.map((b) => ({ id: b, title: `Blok ${b}` })),
    min_date: R.addDays(today, -R.LIMITS.taskMaxAgeDays),
    max_date: today,
    init_values: { date: today },
  });
}

function rainScreen(today) {
  return screen('HUJAN', {
    rain_title: 'Curah Hujan',
    min_date: R.addDays(today, -R.LIMITS.rainMaxAgeDays),
    max_date: today,
    init_values: { date: today },
    ...confirmData(),
  });
}

// ---------- the "Ya, sudah benar" mechanism ----------

// Returns null when the worker may go ahead, or the screen to show again with the warning.
function softGate(res, warning, value, d) {
  if (!warning) return null;
  const signature = JSON.stringify(value);
  if (isYes(d.confirm) && d.warned === signature) return null;
  return withError(
    { ...res, data: { ...res.data, needs_confirm: true, warned: signature } },
    `Periksa lagi: ${warning} Jika sudah benar, centang "Ya, sudah benar" lalu kirim lagi.`
  );
}

// ---------- tree Flow handlers ----------

async function handleMenu({ data = {}, treeId }) {
  const tree = await getTreeById(treeId);
  if (!tree) return treeGone(treeId);
  const today = R.todayStr();
  switch (data.choice) {
    case 'issue': return issueScreen(treeId, tree);
    case 'harvest': return panenMenuScreen(treeId, tree, await seasonOf(tree, today));
    default: return withError(menuScreen(treeId, tree, await seasonOf(tree, today)), 'Pilih salah satu laporan dulu, lalu tekan Lanjut.');
  }
}

async function handlePanenMenu({ data = {}, treeId }) {
  const tree = await getTreeById(treeId);
  if (!tree) return treeGone(treeId);
  const today = R.todayStr();
  const season = await seasonOf(tree, today);
  const stage = data.stage;
  const back = async (msg) => withError(await panenMenuScreen(treeId, tree, season), msg);

  if (stage === 'bloom') return bloomScreen(treeId, tree, today);
  if (stage === 'harvest') return harvestAScreen(treeId, tree, today, season);
  if (stage === 'tree') return editScreen(treeId, tree);
  if (R.COUNT_STAGES[stage]) {
    if (!season) return back('Data musim belum bisa dibuka. Coba lagi sebentar lagi.');
    if (!season.waves.length) return back('Pohon ini belum punya tanggal bunga. Pilih "Mulai berbunga" dulu, atau minta pemilik mengisi tanggal bunga blok.');
    return countScreen(treeId, tree, stage, season);
  }
  return back('Pilih salah satu laporan dulu, lalu tekan Lanjut.');
}

async function handleBloom({ data = {}, treeId, workerPhone }) {
  const tree = await getTreeById(treeId);
  if (!tree) return treeGone(treeId);
  const today = R.todayStr();
  const res = bloomScreen(treeId, tree, today);
  const season = await seasonOf(tree, today);
  const check = R.checkBloom({ date: data.date, part: data.part, note: data.note }, { today, existing: season?.blooms || [] });
  if (check.error) return withError(res, check.error);
  const gate = softGate(res, check.warning, check.ok, data);
  if (gate) return gate;

  const bloomId = R.bloomWaveId(treeId, check.ok.date, check.ok.part);
  const items = Array.isArray(data.photos) ? data.photos : [];
  let photos = [];
  let failed = 0;
  if (items.length && !(await C.bloomExists(treeId, check.ok.date, check.ok.part))) ({ saved: photos, failed } = await processPhotos(items, treeId, bloomId));
  const out = await C.saveBloom({ treeId, block: tree.block, ...check.ok, photos, workerPhone });
  const part = R.BLOOM_PART_LABELS[check.ok.part].toLowerCase();
  return done(
    out.duplicate
      ? `Bunga ${part} pada ${R.dateLabel(check.ok.date)} sudah tercatat sebelumnya.`
      : `Bunga ${part} pohon ${treeId} pada ${R.dateLabel(check.ok.date)} tersimpan${photos.length ? ` dengan ${photos.length} foto` : ''}.${failed ? `\n⚠️ ${failed} foto gagal terkirim.` : ''}\nLangkah berikutnya: hitung tandan bunga saat bunga sedang mekar.`,
    out.duplicate ? '✅ Sudah tercatat' : '🌸 Bunga tercatat'
  );
}

const NEXT_HINT = {
  clusters: 'Langkah berikutnya: hitung buah jadi 1-4 minggu setelah bunga mekar.',
  set: 'Langkah berikutnya: setelah buah berlebih dibuang, hitung buah yang disisakan.',
  kept: 'Langkah berikutnya: hitung buah di pohon tiap 2 minggu.',
  onTree: 'Hitung lagi 2 minggu lagi untuk melihat berapa buah yang rontok.',
};

async function handleCount({ data = {}, treeId, workerPhone }) {
  const tree = await getTreeById(treeId);
  if (!tree) return treeGone(treeId);
  const today = R.todayStr();
  const stage = data.stage;
  if (!R.COUNT_STAGES[stage]) return notSaved('Jenis hitungan tidak dikenal, tidak ada yang disimpan.');
  const season = await seasonOf(tree, today);
  if (!season?.waves.length) return notSaved('Pohon ini belum punya tanggal bunga, tidak ada yang disimpan.');

  const res = countScreen(treeId, tree, stage, season);
  const wave = season.waves.find((w) => w.date === data.wave);
  if (!wave) return withError(res, 'Pilih gelombang bunga yang dihitung.');

  const prev = {};
  for (const st of ['clusters', 'set', 'kept']) prev[st] = season.latest(wave.date, st)?.count;
  const check = R.checkCount(stage, { count: data.count, note: data.note }, prev);
  if (check.error) return withError(res, check.error);
  const gate = softGate(res, check.warning, { ...check.ok, wave: wave.date }, data);
  if (gate) return gate;

  const items = Array.isArray(data.photos) ? data.photos : [];
  const countId = R.cropCountId({ treeId, season: wave.date, stage, date: today });
  const { saved: photos, failed } = items.length ? await processPhotos(items, treeId, countId) : { saved: [], failed: 0 };
  await C.saveCount({
    tree, season: wave.date, stage, count: check.ok.count, note: check.ok.note, photos, date: today, workerPhone,
    wavesCount: season.waves.length, existing: season.counts,
  });
  return done(`${R.COUNT_STAGES[stage].label} pohon ${treeId}: ${check.ok.count}${photos.length ? `, ${photos.length} foto` : ''}.${failed ? `\n⚠️ ${failed} foto gagal terkirim.` : ''}\n${NEXT_HINT[stage]}`, '✅ Hitungan tersimpan');
}

// The wave a harvest belongs to: the flowering whose age at harvest is closest to the usual ripening time.
// The flowering a harvest came from: the one whose ripening time (the tree's own variety, else the block's
// shortest) is nearest the harvest day. Same rule as the webapp's harvest form, so both agree on days from bloom.
function floweredOnFor(season, date) {
  if (!season) return undefined;
  const ripening = season.treeRipening || season.ripeMin;
  const earlier = season.waves.filter((w) => w.date <= date);
  if (!earlier.length) return undefined;
  return earlier.sort((a, b) => Math.abs(R.diffDays(date, a.date) - ripening) - Math.abs(R.diffDays(date, b.date) - ripening))[0].date;
}

async function handleHarvestA({ data = {}, treeId }) {
  const tree = await getTreeById(treeId);
  if (!tree) return treeGone(treeId);
  const today = R.todayStr();
  const season = await seasonOf(tree, today);
  const res = harvestAScreen(treeId, tree, today, season);
  const d = R.normalizeDate(data.date);
  const check = R.checkHarvestBasics(data, { today, floweredOn: d ? floweredOnFor(season, d) : undefined });
  if (check.error) return withError(res, check.error);
  const gate = softGate(res, check.warning, check.ok, data);
  if (gate) return gate;
  return harvestBScreen(treeId, tree, check.ok);
}

async function handleHarvestB({ data = {}, flowToken, treeId, workerPhone }) {
  const tree = await getTreeById(treeId);
  if (!tree) return treeGone(treeId);
  const today = R.todayStr();
  const season = await seasonOf(tree, today);
  const d = R.normalizeDate(data.date);
  const basics = R.checkHarvestBasics(data, { today, floweredOn: d ? floweredOnFor(season, d) : undefined });
  if (basics.error) return withError(harvestAScreen(treeId, tree, today, season), basics.error);

  const res = harvestBScreen(treeId, tree, basics.ok);
  const quality = R.checkHarvestQuality(
    { grades: { extra: data.extra, class1: data.class1, class2: data.class2, reject: data.reject }, problems: data.problems, problemFruits: data.problem_fruits },
    basics.ok.fruits
  );
  if (quality.error) return withError(res, quality.error);

  const photoItems = Array.isArray(data.photos) ? data.photos : [];
  const id = R.harvestIdFromToken(flowToken, {
    ...basics.ok, grades: quality.ok.grades, problems: quality.ok.problems, problemFruits: quality.ok.problemFruits,
    photos: photoItems.map((p) => p?.cdn_url || p?.file_name || ''),
  });
  if (await C.harvestExists(id)) return done(`Panen pohon ${treeId} sudah tersimpan sebelumnya.`, '✅ Sudah tercatat');

  // Photos are best effort: a photo that cannot be processed never loses the harvest numbers.
  const { saved, failed } = photoItems.length ? await processPhotos(photoItems, treeId, id) : { saved: [], failed: 0 };

  const out = await C.saveHarvest({
    id, tree, ...basics.ok, ...quality.ok, photos: saved,
    floweredOn: floweredOnFor(season, basics.ok.date), note: R.cleanText(data.note), workerPhone, flowToken,
  });
  if (out.duplicate) return done(`Panen pohon ${treeId} sudah tersimpan sebelumnya.`, '✅ Sudah tercatat');
  const lines = [`Panen pohon ${treeId} tersimpan: ${basics.ok.fruits} buah` + (basics.ok.weightKg !== undefined ? `, ${basics.ok.weightKg} kg.` : '.')];
  if (quality.ok.ungraded) lines.push(`${quality.ok.ungraded} buah belum dikelompokkan ke kelas.`);
  if (saved.length) lines.push(`${saved.length} foto terlampir.`);
  if (failed) lines.push(`${failed} foto gagal disimpan, tetapi data panen sudah aman.`);
  lines.push('Terima kasih! Hitung buah yang masih tersisa di pohon jika masih ada.');
  return done(lines.join('\n'), '🧺 Panen tersimpan');
}

// ---------- issue report ----------

async function handleReport({ data = {}, flowToken, treeId, workerPhone }) {
  const tree = await getTreeById(treeId);
  if (!tree) return treeGone(treeId);
  const res = issueScreen(treeId, tree);

  // An older published Flow still sends the condition and problem-type lists: keep reading them.
  const legacy = 'condition' in data || 'problem_types' in data;
  const words = R.cleanText(data.description, 600);
  const description = legacy ? R.describeWithTypes(data.problem_types, data.description) : words;
  const photoItems = Array.isArray(data.photos) ? data.photos : [];
  const hasWords = /\p{L}{2,}/u.test(words);
  if (legacy) {
    // The older published Flow promised "foto atau keterangan": keep that promise until FLOW_ID points at the new one.
    if (!photoItems.length && !/\p{L}{2,}/u.test(description)) return withError(res, 'Tambahkan foto atau tulis keterangan.');
  } else {
    if (!photoItems.length && !hasWords) return withError(res, 'Tambahkan foto dan tulis apa yang Anda lihat.');
    if (!photoItems.length) return withError(res, 'Tambahkan minimal satu foto: dari dekat dan seluruh pohon.');
    if (!hasWords) return withError(res, 'Tulis apa yang Anda lihat, misalnya: daun menguning di dahan bawah.');
  }

  // What the words say (stage, issue, health): a suggestion for the owner to check, and the worker's instant reply.
  // Never lets a report fail: without it the report still saves and waits in "Perlu dicek".
  let triage = null;
  try {
    triage = S.triageText(description);
  } catch (err) {
    console.error('Triage failed:', err);
  }
  // The worker's own choice (older Flow), else one automatic change only: words that say the tree is in danger now
  // ("darurat", "hampir mati", "tumbang") make it Merah at once. A disease name alone waits for the owner's check.
  const chosen = legacy && R.CONDITIONS.includes(data.condition) ? data.condition : null;
  const condition = chosen || (triage?.urgent && tree.condition !== 'emergency' ? 'emergency' : null);

  try {
    // Content-aware id: see rules.js idFromToken (an old Flow message reopened later must still save a new report).
    const reportId = R.idFromToken(flowToken, {
      description, condition: data.condition || '', photos: photoItems.map((p) => p?.cdn_url || p?.file_name || ''),
    });
    // A retry of the same report: answer before touching the photos (uploading again would replace their links).
    if (await reportExists(reportId)) return done(`Laporan untuk ${treeId} sudah tersimpan sebelumnya.`, '✅ Sudah tercatat');
    const { saved, failed } = await processPhotos(photoItems, treeId, reportId);
    if (photoItems.length && saved.length === 0) return withError(res, 'Foto tidak dapat diproses. Coba kirim lagi.');
    const result = await createReport({
      reportId, treeId, workerPhone, condition, conditionSource: chosen ? 'worker' : 'triage', description, photos: saved, triage,
    });
    console.log(`Report ${reportId} for ${treeId}: duplicate=${!!result.duplicate} changed=${!!result.changed} photos=${saved.length} failedPhotos=${failed} health=${(triage && triage.health) || '-'}`);
    return done(reportSummary(treeId, result, failed, triage));
  } catch (err) {
    console.error('Saving report failed:', err);
    return withError(res, 'Laporan tidak dapat disimpan. Silakan coba lagi.');
  }
}

function reportSummary(treeId, result, failedPhotos, triage) {
  if (result.duplicate) return `Laporan untuk ${treeId} sudah tersimpan sebelumnya.`;
  const parts = [`Laporan untuk ${treeId} tersimpan${result.photoCount ? ` dengan ${result.photoCount} foto` : ''}.`];
  if (failedPhotos) parts.push(`${failedPhotos} foto gagal disimpan.`);
  if (result.changed) parts.push(`Kondisi pohon: ${conditionLabel(result.before)} → ${conditionLabel(result.after)}.`);
  if (triage) parts.push('', S.workerReply(triage));
  return parts.join('\n');
}

// ---------- tree data ----------

const MEASUREMENT_LABELS = { ...Object.fromEntries(Object.entries(R.TREE_LIMITS).map(([k, v]) => [k, v.label])), notes: 'Catatan' };

async function handleEdit({ data = {}, treeId, workerPhone }) {
  const tree = await getTreeById(treeId);
  if (!tree) return treeGone(treeId);
  try {
    const { changes } = await updateTreeMeasurements(
      treeId,
      // Flower clusters and the fruit estimate are not edited here: they come from the count reports (with history).
      { canopySize: data.canopy, trunkSize: data.trunk, floweringBranches: data.branches, notes: data.notes },
      workerPhone
    );
    if (Object.keys(changes).length === 0) return withError(editScreen(treeId, tree), 'Tidak ada perubahan. Ubah minimal satu nilai atau tekan kembali.');
    const lines = Object.entries(changes).map(([f, c]) => `${MEASUREMENT_LABELS[f]}: ${c.from ?? '—'} → ${c.to}`);
    return done(`Data ${treeId} diperbarui:\n${lines.join('\n')}`, '✅ Data diperbarui');
  } catch (err) {
    if (err.userMessage) return withError(editScreen(treeId, tree), err.userMessage);
    console.error('Updating measurements failed:', err);
    return withError(editScreen(treeId, tree), 'Tidak dapat menyimpan. Silakan coba lagi.');
  }
}

// ---------- farm Flow handlers (no tree involved) ----------

async function handleFarmHome({ data = {} }) {
  const today = R.todayStr();
  if (data.choice === 'work') return workScreen(today);
  if (data.choice === 'rain') return rainScreen(today);
  return withError(farmHomeScreen(), 'Pilih salah satu dulu, lalu tekan Lanjut.');
}

async function handleWork({ data = {}, workerPhone }) {
  const today = R.todayStr();
  const blocks = await C.listBlocks();
  const res = await workScreen(today);
  const check = R.checkSeasonTasks({ block: data.block, tasks: data.tasks, date: data.date }, { today, blocks });
  if (check.error) return withError(res, check.error);

  const season = await C.blockSeasonDate(check.ok.block, today);
  if (!season)
    return withError(res, `Blok ${check.ok.block} belum punya tanggal bunga. Laporkan "Mulai berbunga" dulu di Laporan Pohon, atau minta pemilik mengisinya.`);

  const out = await C.saveSeasonTasks({ block: check.ok.block, season, tasks: check.ok.tasks, date: check.ok.date, workerPhone });
  const lines = [];
  if (out.done.length) lines.push(`Blok ${check.ok.block} tercatat selesai: ${out.done.map((t) => R.SEASON_TASK_LABELS[t]).join(', ')}.`);
  if (out.already.length)
    lines.push(`Sudah tercatat sebelumnya: ${out.already.map((a) => `${R.SEASON_TASK_LABELS[a.task]} (${R.dateLabel(a.date)})`).join(', ')}.`);
  return done(lines.join('\n'), '✅ Pekerjaan tercatat');
}

async function handleRain({ data = {}, workerPhone }) {
  const today = R.todayStr();
  const res = rainScreen(today);
  const check = R.checkRain({ date: data.date, mm: data.mm }, { today });
  if (check.error) return withError(res, check.error);
  const gate = softGate(res, check.warning, check.ok, data);
  if (gate) return gate;
  const out = await C.saveRain({ ...check.ok, workerPhone });
  const extra = out.replaced !== null && out.replaced !== check.ok.rainMm ? `\n(Menggantikan catatan sebelumnya: ${out.replaced} mm.)` : '';
  return done(`Curah hujan ${R.dateLabel(check.ok.date)}: ${check.ok.rainMm} mm.${extra}`, '🌧️ Hujan tercatat');
}

// ---------- router ----------

const TREE_HANDLERS = {
  MENU: handleMenu,
  PANEN_MENU: handlePanenMenu,
  BLOOM: handleBloom,
  COUNT: handleCount,
  HARVEST_A: handleHarvestA,
  HARVEST_B: handleHarvestB,
  REPORT: handleReport,
  EDIT_TREE: handleEdit,
};
const FARM_HANDLERS = { FARM_HOME: handleFarmHome, KERJA: handleWork, HUJAN: handleRain };

// kind: 'tree' | 'farm' (from the flow token, see index.js parseFlowToken)
async function route({ kind = 'tree', action, screen: name, data, flowToken, treeId, workerPhone }) {
  if (kind === 'farm') {
    if (action === 'data_exchange' && FARM_HANDLERS[name]) return FARM_HANDLERS[name]({ data, flowToken, workerPhone });
    return farmHomeScreen();
  }
  if (action === 'data_exchange') {
    const handler = TREE_HANDLERS[name];
    if (handler) return handler({ data, flowToken, treeId, workerPhone });
    // an older client that does not send the screen name: recognise the report by its payload
    if (data && ('condition' in data || 'photos' in data)) return handleReport({ data, flowToken, treeId, workerPhone });
  }
  return treeLookupScreen(treeId);
}

module.exports = { route, floweredOnFor, suggestionText };
