// lib/flowScreens.js — the screens of the two Flows, and what happens when a worker presses a button.
// The Flow JSON files only draw (scripts/build-flow.js); rules live in rules.js and the endpoint answers each button
// with the next screen, or the same screen plus an error_message.
//
//  Flow "Laporan Pohon" (kind 'report', opened by sending a tree ID, flows/flow.json):
//    REPORT (1-3 photos + the worker's words) -> DONE. Gemini reads the saved report once the Flow completes
//    (index.js reopenAfterCompletion -> lib/ai.js analyzeReport).
//
//  Flow "Catatan Kebun" (kind 'farm', opened with the Hujan & Pekerjaan button or the word KEBUN, flows/flow-farm.json):
//    FARM_HOME -> KERJA (Pekerjaan Selesai) | HUJAN (Curah Hujan) -> DONE
//
// RULE FOR the Flow JSON: a dynamic property is always the WHOLE value ("${data.title}"), never text mixed with a
// variable ("Pohon ${data.title}" shows up literally on the phone). Build such strings here.
//
// A "soft" problem (a number that looks odd but could be true) comes back as error_message + an
// "Ya, sudah benar" checkbox; sending again with the box ticked (and the value unchanged) saves it.
const R = require('./rules');
const { getTreeById } = require('./trees');
const { processPhotos, createReport, reportExists } = require('./reports');
const C = require('./cropData');
const S = require('./shared'); // generated from the webapp's src/shared: triage, labels, health words

// ---------- flow tokens ----------
// The flow token is echoed back on every Flow endpoint request, so it carries what the endpoint needs:
//   lapor:<treeId>:<workerPhone>:<time>  the tree report Flow (which tree, which worker)
//   farm:<workerPhone>:<time>            the farm Flow (rain and finished work)
//   tree:<treeId>:<workerPhone>:<time>   chat messages of the older multi-screen tree Flow: handled as a report,
//                                        so an old button still opens the report screen and saves
const makeTreeToken = (treeId, workerPhone) => `lapor:${treeId}:${workerPhone}:${Date.now()}`;
const makeFarmToken = (workerPhone) => `farm:${workerPhone}:${Date.now()}`;

function parseFlowToken(flowToken) {
  const parts = String(flowToken || '').split(':');
  if (parts[0] === 'farm') return { kind: 'farm', treeId: '', workerPhone: parts[1] || '' };
  if (parts[0] === 'lapor' || parts[0] === 'tree') return { kind: 'report', treeId: parts[1] || '', workerPhone: parts[2] || '' };
  return { kind: 'report', treeId: '', workerPhone: '' }; // no tree: ends on DONE without saving
}

// ---------- shared screen helpers ----------

const conditionLabel = (c) => R.CONDITION_LABELS[c] || 'Belum dinilai';
const treeLabel = (id, tree) => [id, tree?.variant, tree?.block ? `Blok ${tree.block}` : null].filter(Boolean).join(' · ');
const isYes = (v) => v === true || v === 'true';

const screen = (name, data) => ({ version: '3.0', screen: name, data });
const withError = (res, message) => ({ ...res, data: { ...res.data, error_message: message } });
// `saved` goes back to WhatsApp with the completion, so the chat message after the Flow can say what really happened;
// `report_id` too, so the bot can read the report's photos (lib/ai.js) and reply.
const done = (message, title = '✅ Laporan tersimpan', reportId = '') => screen('DONE', { title, message, saved: true, report_id: reportId });
const notSaved = (message) => screen('DONE', { title: '⚠️ Gagal', message, saved: false, report_id: '' });
const treeGone = (treeId) => notSaved(`Pohon ${treeId || ''} tidak ditemukan atau sudah tidak aktif, tidak ada yang disimpan.`);

// ---------- the "Ya, sudah benar" mechanism ----------

const confirmData = (extra = {}) => ({ needs_confirm: false, warned: '', ...extra });

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

// ---------- tree report (photos + words) ----------

const reportScreen = (treeId, tree) =>
  screen('REPORT', {
    report_title: `Laporan untuk ${treeLabel(treeId, tree)}`,
    condition_caption: `Kondisi saat ini: ${conditionLabel(tree?.condition)}`,
  });

// Saves one report. Both a photo and words are required; nothing else is asked (an older Flow's extra fields, such as
// a condition or problem-type list, are ignored). Gemini reads it after the Flow completes.
async function handleReport({ data = {}, flowToken, treeId, workerPhone }) {
  const tree = await getTreeById(treeId);
  if (!tree) return treeGone(treeId);
  const res = reportScreen(treeId, tree);

  const description = R.cleanText(data.description, 600);
  const photoItems = Array.isArray(data.photos) ? data.photos : [];
  const hasWords = /\p{L}{2,}/u.test(description);
  if (!photoItems.length && !hasWords) return withError(res, 'Tambahkan foto dan tulis apa yang Anda lihat.');
  if (!photoItems.length) return withError(res, 'Tambahkan minimal satu foto: dari dekat dan seluruh pohon.');
  if (!hasWords) return withError(res, 'Tulis apa yang Anda lihat, misalnya: daun menguning di dahan bawah.');

  // What the words say (stage, issue, health): a suggestion for the owner to check, and the worker's instant reply
  // when Gemini is not set up. Never lets a report fail: without it the report still saves and waits in "Perlu dicek".
  let triage = null;
  try {
    triage = S.triageText(description);
  } catch (err) {
    console.error('Triage failed:', err);
  }
  // One automatic change only: words that say the tree is in danger now ("darurat", "hampir mati", "tumbang") make it
  // Merah at once. A disease name alone waits for the owner's check.
  const condition = triage?.urgent && tree.condition !== 'emergency' ? 'emergency' : null;

  try {
    // Content-aware id: see rules.js idFromToken (an old Flow message reopened later must still save a new report).
    // `condition: ''` stays in the hashed content so ids match those of the earlier Flow (a retry is still a retry).
    const reportId = R.idFromToken(flowToken, { description, condition: '', photos: photoItems.map((p) => p?.cdn_url || p?.file_name || '') });
    // A retry of the same report: answer before touching the photos (uploading again would replace their links).
    if (await reportExists(reportId)) return done(`Laporan untuk ${treeId} sudah tersimpan sebelumnya.`, '✅ Sudah tercatat');
    const { saved, failed } = await processPhotos(photoItems, treeId, reportId);
    if (saved.length === 0) return withError(res, 'Foto tidak dapat diproses. Coba kirim lagi.');
    const result = await createReport({ reportId, treeId, workerPhone, condition, description, photos: saved, triage });
    console.log(`Report ${reportId} for ${treeId}: duplicate=${!!result.duplicate} changed=${!!result.changed} photos=${saved.length} failedPhotos=${failed} health=${(triage && triage.health) || '-'}`);
    return done(reportSummary(treeId, result, failed, triage), undefined, result.duplicate ? '' : reportId);
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
  if (process.env.GEMINI_API_KEY) parts.push('', 'Sistem sedang memeriksa foto Anda. Hasilnya dikirim lewat chat sebentar lagi.');
  else if (triage) parts.push('', S.workerReply(triage));
  return parts.join('\n');
}

// ---------- farm Flow (no tree involved) ----------

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

const FARM_HANDLERS = { FARM_HOME: handleFarmHome, KERJA: handleWork, HUJAN: handleRain };

// kind: 'report' | 'farm' (from the flow token, see parseFlowToken)
async function route({ kind, action, screen: name, data, flowToken, treeId, workerPhone }) {
  if (kind === 'farm') {
    if (action === 'data_exchange' && FARM_HANDLERS[name]) return FARM_HANDLERS[name]({ data, flowToken, workerPhone });
    return farmHomeScreen();
  }
  // The tree report: INIT (or anything else an older Flow sends) opens the report screen.
  if (action === 'data_exchange' && name === 'REPORT') return handleReport({ data, flowToken, treeId, workerPhone });
  const tree = treeId ? await getTreeById(treeId) : null;
  return tree ? reportScreen(treeId, tree) : treeGone(treeId);
}

module.exports = { route, parseFlowToken, makeTreeToken, makeFarmToken };
