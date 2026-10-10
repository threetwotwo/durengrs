// End to end through the Flow router with an in-memory Firestore: what a worker sees and what gets saved.
// Every answer is also checked against the Flow JSON it belongs to (test/contract.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fake = require('./fakeFirestore');
fake.install();
const reports = require('../lib/reports');
// no real photos in tests: pretend each item was stored
let photoCalls = [];
reports.processPhotos = async (items, treeId, id) => {
  photoCalls.push({ n: items.length, treeId, id });
  return { saved: items.slice(0, 3).map((_, i) => ({ path: `report-photos/${treeId}/${id}-${i + 1}.jpg`, url: `https://x/${i}`, thumb: `https://x/t${i}`, medium: `https://x/m${i}` })), failed: Math.max(0, items.length - 3) };
};
const R = require('../lib/rules');
const C = require('../lib/cropData');
const { route, parseFlowToken, makeTreeToken } = require('../lib/flowScreens');
const { analyzeReport, toTriage } = require('../lib/ai');
const { backfillCases } = require('../lib/backfill');
const { applyReading } = require('../lib/treeReading');
const { check } = require('./contract');

const today = R.todayStr();
const PHONE = '628111886551';
const TOKEN = `lapor:A1:${PHONE}:1000`;
const FARM_TOKEN = `farm:${PHONE}:2000`;

// What index.js does with every Flow request: the token says which Flow, tree and worker.
const ask = (flowToken, action, screen, data) => route({ ...parseFlowToken(flowToken), flowToken, action, screen, data });
// `screen` is the screen the worker was on when pressing the button
const send = async (screen, data, token = TOKEN) => check('report', screen, await ask(token, 'data_exchange', screen, data));
const sendFarm = async (screen, data) => check('farm', screen, await ask(FARM_TOKEN, 'data_exchange', screen, data));
const open = async (token = TOKEN) => check('report', null, await ask(token, 'INIT'));
const openFarm = async () => check('farm', null, await ask(FARM_TOKEN, 'INIT'));

function seed({ blockBloomDaysAgo = 33 } = {}) {
  fake.reset();
  fake.seed('trees', 'A1', { id: 'A1', variant: 'MK', block: 'A', condition: 'healthy' });
  fake.seed('trees', 'A2', { id: 'A2', variant: 'MK', block: 'A', condition: 'healthy' });
  fake.seed('trees', 'B1', { id: 'B1', variant: 'MK', block: 'B', condition: 'healthy' });
  fake.seed('variants', 'MK', { ripeningDays: '120' });
  if (blockBloomDaysAgo !== null) fake.seed('harvestCycles', 'A', { block: 'A', floweredOn: R.addDays(today, -blockBloomDaysAgo) });
}

// Gemini stubbed: each call answers the next item of `answers` (the base below plus its fields). Photos download as 4 bytes.
const BASE_ANSWER = { stages: [], bloom_part: 'none', actions: [], case_updates: [], issues: [], summary: '', health: 'hijau', urgent: false, improving: false, counts: [], photo_ok: true, photo_request: '', photos_seen: [] };
async function withGemini(answers, fn) {
  process.env.GEMINI_API_KEY = 'test';
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    if (String(url).includes('generativelanguage')) {
      calls.push(JSON.parse(opts.body).contents[0].parts[0].text);
      const next = answers.shift(); // an answer, or a function that also acts while Gemini "reads"
      const answer = typeof next === 'function' ? next() : next;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...BASE_ANSWER, ...answer }) }] } }] }) };
    }
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  };
  try {
    return await fn(calls);
  } finally {
    global.fetch = realFetch;
    delete process.env.GEMINI_API_KEY;
  }
}

// One report sent through the Flow, then read by Gemini as the chat does when the Flow completes.
async function reportAndRead(words, n, treeId = 'A1') {
  const r = await send('REPORT', { description: words, photos: [{ cdn_url: words }] }, `lapor:${treeId}:${PHONE}:${n}`);
  return { id: r.data.report_id, msg: await analyzeReport(r.data.report_id, { tree: fake.get('trees', treeId), workerPhone: PHONE }) };
}

// ---------- tree report Flow ----------

test('tree tokens: new messages use lapor:, and old tree: messages are handled as the same report', async () => {
  assert.match(makeTreeToken('A1', PHONE), new RegExp(`^lapor:A1:${PHONE}:\\d+$`));
  for (const t of ['lapor:A1:628:1', 'tree:A1:628:1']) assert.deepEqual(parseFlowToken(t), { kind: 'report', treeId: 'A1', workerPhone: '628' });
  assert.deepEqual(parseFlowToken('farm:628:1'), { kind: 'farm', treeId: '', workerPhone: '628' });
  assert.deepEqual(parseFlowToken(''), { kind: 'report', treeId: '', workerPhone: '' });

  seed();
  const old = `tree:A1:${PHONE}:500`;
  const first = await open(old);
  assert.equal(first.screen, 'REPORT');
  assert.equal(first.data.report_title, 'Laporan untuk A1 · MK · Blok A');
  const r = await send('REPORT', { description: 'daun kuning di dahan bawah', photos: [{ cdn_url: 'o' }] }, old);
  assert.equal(r.screen, 'DONE');
  assert.equal(r.data.saved, true);
  assert.equal(fake.get('reports', r.data.report_id).treeId, 'A1');
  // any other screen an older Flow might send lands on the report screen, never an error
  assert.equal((await ask(old, 'data_exchange', 'MENU', { choice: 'issue' })).screen, 'REPORT');
});

test('report: opens on photo + words, saves, and hands the report id to the chat', async () => {
  seed();
  const first = await open();
  assert.equal(first.screen, 'REPORT');
  assert.equal(first.data.condition_caption, 'Kondisi saat ini: Hijau');
  const r = await send('REPORT', { description: 'bunga mulai mekar', photos: [{ cdn_url: 'z' }] });
  assert.equal(r.screen, 'DONE');
  assert.equal(r.data.saved, true);
  const rep = fake.get('reports', r.data.report_id);
  assert.equal(rep.description, 'bunga mulai mekar');
  assert.equal(rep.photos.length, 1);
  assert.equal(fake.get('trees', 'A1').lastReportId, r.data.report_id);
});

test('report: photo and words both required', async () => {
  seed();
  assert.match((await send('REPORT', {})).data.error_message, /foto dan tulis/);
  assert.match((await send('REPORT', { description: 'daun kuning' })).data.error_message, /minimal satu foto/);
  assert.match((await send('REPORT', { description: '👍', photos: [{ cdn_url: 'a' }] })).data.error_message, /Tulis apa yang Anda lihat/);
  assert.equal(fake.all('reports').length, 0);
});

test('report: an older Flow\'s condition and problem-type fields are ignored; photos and words still save', async () => {
  seed();
  const ok = await send('REPORT', { condition: 'minor', problem_types: ['leaf', 'pest'], description: 'daun kuning', photos: [{ cdn_url: 'a' }] });
  assert.equal(ok.screen, 'DONE');
  const [r] = fake.all('reports');
  assert.equal(r.description, 'daun kuning');
  assert.equal(r.conditionChanged, false);
  assert.equal(r.conditionSource, undefined);
  assert.equal(fake.get('trees', 'A1').condition, 'healthy');
});

test('report: the system reads the words, replies at once, and only urgent words change the tree', async () => {
  seed();
  const ok = await send('REPORT', { description: 'Pp, hawar daun sedikit', photos: [{ cdn_url: 'a' }, { cdn_url: 'b' }] });
  assert.equal(ok.screen, 'DONE');
  assert.match(ok.data.message, /tersimpan dengan 2 foto/);
  assert.match(ok.data.message, /Tahap: Ping pong/);
  assert.match(ok.data.message, /Hawar daun/);
  assert.match(ok.data.message, /Admin akan cek/);
  const [r] = fake.all('reports');
  assert.equal(r.triage.source, 'rules');
  assert.equal(r.triage.stage.code, 'pingpong');
  assert.deepEqual(r.triage.issues.map((i) => i.code), ['leaf_blight']);
  assert.equal(fake.get('trees', 'A1').condition, 'healthy'); // kuning waits for the owner's check

  // A disease name is a strong suggestion, but waits for the owner's check: the tree doesn't change by itself.
  const canker = await send('REPORT', { description: 'ada getah merah keluar dari batang, kulit basah', photos: [{ cdn_url: 'c' }] });
  assert.equal(canker.screen, 'DONE');
  assert.equal(fake.get('trees', 'A1').condition, 'healthy');
  assert.equal(fake.all('reports').find((x) => x.description.startsWith('ada getah')).triage.health, 'merah');

  // Words that say the tree is in danger now do change it at once.
  const urgent = await send('REPORT', { description: 'pohon hampir mati, getah merah banyak', photos: [{ cdn_url: 'd' }] });
  assert.match(urgent.data.message, /Kondisi pohon: Hijau → Merah/);
  assert.equal(fake.get('trees', 'A1').condition, 'emergency');
  const red = fake.all('reports').find((x) => x.conditionChanged);
  assert.equal(red.conditionSource, 'triage');

  // Harmless words that only look alarming inside longer words never do.
  seed();
  for (const d of ['sudah diamati, ada kutu', 'tanaman tidak sehat', 'ranting mati satu', 'kemarin hampir mati, sekarang membaik']) {
    await send('REPORT', { description: d, photos: [{ cdn_url: d }] });
  }
  assert.equal(fake.get('trees', 'A1').condition, 'healthy');
});

test('report: a retry does not save or upload again; a new report from the same old message does', async () => {
  seed();
  photoCalls = [];
  const photo = [{ cdn_url: 'x' }];
  const ok = await send('REPORT', { description: 'daun kuning di dahan bawah', photos: photo });
  assert.equal(ok.data.saved, true);
  const again = await send('REPORT', { description: 'daun kuning di dahan bawah', photos: photo }); // network retry
  assert.match(again.data.message, /sudah tersimpan sebelumnya/);
  assert.equal(photoCalls.length, 1);
  const second = await send('REPORT', { description: 'ada getah di batang', photos: photo }); // same token, new report
  assert.doesNotMatch(second.data.message, /sudah tersimpan sebelumnya/);
  assert.equal(fake.all('reports').length, 2);
});

test('report: an unknown or archived tree ends without saving (saved: false)', async () => {
  seed();
  fake.seed('trees', 'T1', { id: 'T1', variant: 'MK', block: 'T', condition: 'not_assessed', active: false });
  const trees = require('../lib/trees');
  assert.equal(await trees.getTreeById('T1'), null);
  assert.equal(trees.isArchived(await trees.getTreeRecord('T1')), true);
  assert.equal(trees.isArchived(await trees.getTreeRecord('A1')), false); // no `active` field = active
  assert.deepEqual(await C.listBlocks(), ['A', 'B']); // its block disappears: T1 was the only tree there

  for (const token of [`lapor:T1:${PHONE}:5`, `lapor:Z9:${PHONE}:5`, '']) {
    const opened = await open(token);
    assert.equal(opened.screen, 'DONE');
    assert.equal(opened.data.saved, false);
    const r = await send('REPORT', { description: 'daun kuning', photos: [{ cdn_url: 'q' }] }, token);
    assert.equal(r.data.saved, false);
    assert.match(r.data.message, /tidak aktif/);
  }
  assert.equal(fake.all('reports').length, 0);
  assert.equal(fake.get('trees', 'T1').condition, 'not_assessed');
});

// ---------- farm Flow ----------

test('farm Flow: opens on its own menu, no tree needed', async () => {
  seed();
  const r = await openFarm();
  assert.equal(r.screen, 'FARM_HOME');
  assert.match((await sendFarm('FARM_HOME', {})).data.error_message, /Pilih salah satu/);
  const work = await sendFarm('FARM_HOME', { choice: 'work' });
  assert.equal(work.screen, 'KERJA');
  assert.deepEqual(work.data.block_options.map((b) => b.id), ['A', 'B']);
  assert.equal((await sendFarm('FARM_HOME', { choice: 'rain' })).screen, 'HUJAN');
  // a farm token never reaches the tree report
  assert.equal((await ask(FARM_TOKEN, 'data_exchange', 'REPORT', {})).screen, 'FARM_HOME');
});

test('farm Flow: season tasks are filed against the block season; a second report keeps the date', async () => {
  seed();
  const season = R.addDays(today, -33);
  assert.match((await sendFarm('KERJA', { block: 'Z', tasks: ['bagging'], date: today })).data.error_message, /blok/i);
  assert.match((await sendFarm('KERJA', { block: 'A', tasks: [], date: today })).data.error_message, /minimal satu/);
  const ok = await sendFarm('KERJA', { block: 'A', tasks: ['fruit_thinning', 'bagging'], date: today });
  assert.equal(ok.screen, 'DONE');
  assert.equal(fake.get('seasonTasks', `A_${season}_fruit_thinning`).date, today);
  assert.equal(fake.get('seasonTasks', `A_${season}_bagging`).source, 'whatsapp');
  const again = await sendFarm('KERJA', { block: 'A', tasks: ['fruit_thinning'], date: R.addDays(today, -1) });
  assert.match(again.data.message, /Sudah tercatat sebelumnya/);
  assert.equal(fake.get('seasonTasks', `A_${season}_fruit_thinning`).date, today);
  assert.match((await sendFarm('KERJA', { block: 'B', tasks: ['bagging'], date: today })).data.error_message, /belum punya tanggal bunga/);
});

test('farm Flow: rain range, soft limit, replaces the day', async () => {
  seed();
  assert.match((await sendFarm('HUJAN', { date: today, mm: '401' })).data.error_message, /antara 0 dan 400/);
  assert.match((await sendFarm('HUJAN', { date: R.addDays(today, -9), mm: '5' })).data.error_message, /7 hari/);
  assert.equal((await sendFarm('HUJAN', { date: today, mm: '12,5' })).screen, 'DONE');
  assert.equal(fake.get('weather', today).rainMm, 12.5);
  await sendFarm('HUJAN', { date: today, mm: '0' });
  assert.equal(fake.get('weather', today).rainMm, 0);
  const odd = await sendFarm('HUJAN', { date: today, mm: '150' });
  assert.equal(odd.data.needs_confirm, true);
  assert.equal(fake.get('weather', today).rainMm, 0);
  const ticked = await sendFarm('HUJAN', { date: today, mm: '150', confirm: true, warned: odd.data.warned });
  assert.equal(ticked.screen, 'DONE');
  assert.equal(fake.get('weather', today).rainMm, 150);
});

test('season task: when every tree flowered on its own date, the task is filed under that flowering (as the webapp reads it)', async () => {
  seed();
  // block A date stays in harvestCycles, but A1 and A2 both flowered whole 5 days later
  const own = R.addDays(today, -28);
  fake.seed('bloomWaves', 'A1_o', { treeId: 'A1', block: 'A', date: own, part: 'whole' });
  fake.seed('bloomWaves', 'A2_o', { treeId: 'A2', block: 'A', date: own, part: 'whole' });
  await sendFarm('KERJA', { block: 'A', tasks: ['hand_pollination'], date: today });
  assert.equal(fake.all('seasonTasks')[0].season, own);
  // block B: its date is still followed, so tasks stay on it
  fake.seed('harvestCycles', 'B', { block: 'B', floweredOn: R.addDays(today, -20) });
  await sendFarm('KERJA', { block: 'B', tasks: ['hand_pollination'], date: today });
  assert.equal(fake.all('seasonTasks').find((t) => t.block === 'B').season, R.addDays(today, -20));
});

// ---------- season records (written after Gemini reads a report) ----------

test('archived trees do not change a block ripening range', async () => {
  seed();
  fake.seed('variants', 'ST', { ripeningDays: 90 });
  fake.seed('trees', 'A9', { id: 'A9', variant: 'ST', block: 'A', condition: 'healthy', active: false });
  const s = await C.loadTreeSeason({ id: 'A1', block: 'A', variant: 'MK' }, today);
  assert.equal(s.ripeMin, 120);
  assert.equal(s.treeRipening, 120);
  assert.deepEqual(s.waves.map((w) => w.date), [R.addDays(today, -33)]);
});

test('a flowering already recorded in the webapp under another id is not saved twice', async () => {
  seed();
  const d = R.addDays(today, -4);
  fake.seed('bloomWaves', 'xyz-webapp-random', { treeId: 'A1', block: 'A', date: d, part: 'lower', source: 'webapp' });
  const r = await C.saveBloom({ treeId: 'A1', block: 'A', date: d, part: 'lower' });
  assert.equal(r.duplicate, true);
  assert.equal(fake.all('bloomWaves').length, 1);
});

test('a count replaces the same day\'s count, and the tree record follows the newest one', async () => {
  seed();
  const season = R.addDays(today, -33);
  const tree = fake.get('trees', 'A1');
  await C.saveCount({ tree, season, stage: 'kept', count: 50, date: today, workerPhone: PHONE, wavesCount: 1, existing: [] });
  const id = `A1_${season}_kept_${today}`;
  assert.deepEqual([fake.get('cropCounts', id).count, fake.get('cropCounts', id).source], [50, 'whatsapp']);
  assert.equal(fake.get('trees', 'A1').estimatedFruitCount, 50);
  assert.equal(fake.all('treeEdits').length, 1);
  await C.saveCount({ tree: fake.get('trees', 'A1'), season, stage: 'kept', count: 45, date: today, wavesCount: 1, existing: [{ id, stage: 'kept', date: today }] });
  assert.equal(fake.all('cropCounts').length, 1);
  assert.equal(fake.get('trees', 'A1').estimatedFruitCount, 45);
  // an older count, or a tree with two flowerings, leaves the tree record alone
  await C.saveCount({ tree: fake.get('trees', 'A1'), season, stage: 'onTree', count: 30, date: R.addDays(today, -3), wavesCount: 1, existing: [{ id, stage: 'kept', date: today }] });
  await C.saveCount({ tree: fake.get('trees', 'A1'), season, stage: 'onTree', count: 20, date: today, wavesCount: 2, existing: [] });
  assert.equal(fake.get('trees', 'A1').estimatedFruitCount, 45);
});

// ---------- Gemini reading ----------

test('Gemini reading: replaces the suggestion, records the flowering and a written count, asks for a better photo, once', async () => {
  seed({ blockBloomDaysAgo: null });
  const answer = { stages: [{ code: 'bloom', confidence: 0.9, evidence: 'bunga mekar' }], bloom_part: 'lower', counts: [{ kind: 'clusters', value: 30, evidence: '30 tandan' }], photo_ok: false, photo_request: 'Foto lebih dekat ke bunga.' };
  await withGemini([answer], async (calls) => {
    const r = await send('REPORT', { description: 'bunga mulai mekar, 30 tandan', photos: [{ cdn_url: 'q' }] }, `lapor:A1:${PHONE}:4000`);
    assert.match(r.data.message, /sedang memeriksa/);
    const msg = await analyzeReport(r.data.report_id, { tree: fake.get('trees', 'A1'), workerPhone: PHONE });
    assert.match(msg, /Tanggal bunga mekar dicatat/);
    assert.match(msg, /Jumlah tandan bunga: 30 dicatat/);
    assert.match(msg, /Foto lebih dekat ke bunga/);
    const rep = fake.get('reports', r.data.report_id);
    assert.equal(rep.triage.source, 'ai');
    assert.equal(rep.triage.stage.code, 'bloom');
    assert.equal(rep.triageRules.source, 'rules');
    assert.equal(rep.ai.status, 'done');
    assert.ok(fake.all('bloomWaves').some((b) => b.date === today && b.part === 'lower'));
    assert.ok(fake.all('cropCounts').some((c) => c.stage === 'clusters' && c.count === 30));
    assert.equal(await analyzeReport(r.data.report_id, { tree: fake.get('trees', 'A1') }), null);
    assert.equal(calls.length, 1);
  });
});

test('Gemini reading: a harvest the worker wrote is recorded once, filed under its flowering', async () => {
  seed({ blockBloomDaysAgo: 125 });
  const harvest = { fruits: 12, weight_kg: 30, grades: { extra: 6, class1: 4, class2: 0, reject: 0 } };
  const answer = {
    stages: [{ code: 'harvest', confidence: 0.9, evidence: 'buah dipanen' }],
    actions: [{ type: 'harvest', product: '', issue: 'none', target: '', case: 0, evidence: 'panen 12 buah' }],
    harvest,
  };
  await withGemini([answer, answer], async (calls) => {
    const { id, msg } = await reportAndRead('panen 12 buah, 30 kg, extra 6, kelas 1 ada 4', 1);
    assert.match(calls[0], /harvest: ONLY if the worker reports picking fruit/);
    // Recorded silently: the worker's reply is the one they know (what was seen, the status).
    assert.doesNotMatch(msg, /Panen dicatat|Dicatat:/);
    const rep = fake.get('reports', id);
    assert.deepEqual(rep.triage.harvest, { fruits: 12, weightKg: 30, grades: { extra: 6, class1: 4 } });
    assert.ok(!('harvestedFruits' in rep.triage));
    assert.ok(rep.ai.recorded.includes(`harvests/wa_${id}`));
    const h = fake.get('harvests', `wa_${id}`);
    assert.deepEqual(
      { block: h.block, treeId: h.treeId, variant: h.variant, date: h.date, fruits: h.fruits, weightKg: h.weightKg, grades: h.grades, problems: h.problems, floweredOn: h.floweredOn, daysFromBloom: h.daysFromBloom, source: h.source, workerPhone: h.workerPhone, reportId: h.reportId },
      { block: 'A', treeId: 'A1', variant: 'MK', date: today, fruits: 12, weightKg: 30, grades: { extra: 6, class1: 4 }, problems: [], floweredOn: R.addDays(today, -125), daysFromBloom: 125, source: 'whatsapp', workerPhone: PHONE, reportId: id }
    );
    // the fruit picked is not mistaken for a count of fruit on the tree
    assert.equal(fake.all('cropCounts').length, 0);
    // read again (say, after a failed run was reset): still one harvest
    delete fake.get('reports', id).ai;
    const again = await analyzeReport(id, { tree: fake.get('trees', 'A1'), workerPhone: PHONE });
    assert.doesNotMatch(again, /Panen dicatat/);
    assert.equal(fake.all('harvests').length, 1);
  });
});

test('Gemini reading: a harvest uses the tree variety ripening time; no weight written, no weight saved', async () => {
  seed({ blockBloomDaysAgo: 100 });
  fake.seed('variants', 'ST', { ripeningDays: 100 });
  fake.seed('trees', 'A3', { id: 'A3', variant: 'ST', block: 'A', condition: 'healthy' });
  fake.seed('bloomWaves', 'A3_l', { treeId: 'A3', block: 'A', date: R.addDays(today, -112), part: 'lower' });
  await withGemini([{ harvest: { fruits: 3, weight_kg: 0, grades: { extra: 0, class1: 0, class2: 0, reject: 0 } } }], async () => {
    const { id, msg } = await reportAndRead('dipetik 3 buah', 1, 'A3');
    assert.doesNotMatch(msg, /Panen dicatat/);
    const h = fake.get('harvests', `wa_${id}`);
    assert.equal(h.floweredOn, R.addDays(today, -100)); // ST ripens in 100 days: the block flowering, not the one 112 days ago
    assert.equal(h.daysFromBloom, 100);
    assert.ok(!('weightKg' in h) && !('grades' in h));
  });
});

test('Gemini answer is cleaned: unknown codes and weak guesses dropped, no undefined fields', () => {
  const named = toTriage({ stages: [], issues: [{ code: 'other', name: 'Kutu loncat durian (Allocaridara malayensis)', confidence: 0.9, evidence: 'lilin putih', photo: 2, action: 'Potong tunas yang terserang.' }, { code: 'other', name: 'Kutu putih', confidence: 0.7, evidence: 'x', action: '' }], photos_seen: [{ photo: 1, seen: 'batang' }, { photo: 2, seen: 'daun' }], summary: 'Ada hama di daun.', health: 'kuning', counts: [], photo_ok: true }, 'm');
  assert.deepEqual(named.issues.map((i) => i.name), ['Kutu loncat durian (Allocaridara malayensis)', 'Kutu putih']); // both "other", both kept
  assert.equal(named.issues[0].photo, 2);
  assert.equal(named.photosSeen.length, 2);
  assert.equal(named.summary, 'Ada hama di daun.');
  const t = toTriage({ stages: [{ code: 'xx', confidence: 1 }, { code: 'egg', confidence: 0.2 }], issues: [{ code: 'borer', confidence: 0.8, evidence: 'lubang' }], health: 'kuning', urgent: true, improving: true, counts: [{ kind: 'fruit', value: 12, evidence: '12 buah' }], photo_ok: true, photo_request: '' }, 'm');
  assert.equal(t.stage, undefined);
  assert.deepEqual(t.issues.map((i) => i.code), ['borer']);
  assert.equal(t.urgent, false); // "membaik" wins
  assert.deepEqual(t.numbers, [{ value: 12, kind: 'fruit', evidence: '12 buah' }]);
  assert.equal(t.harvest, undefined);
  assert.ok(!JSON.stringify(t).includes('undefined') && Object.values(t).every((v) => v !== undefined));
});

test('Gemini harvest is cleaned: nothing picked or out of range is no harvest; grades over the fruit count are dropped', () => {
  const h = (harvest) => toTriage({ ...BASE_ANSWER, harvest }, 'm').harvest;
  const g = (extra, class1 = 0, class2 = 0, reject = 0) => ({ extra, class1, class2, reject });
  assert.equal(h(undefined), undefined);
  assert.equal(h({ fruits: 0, weight_kg: 10, grades: g(0) }), undefined);
  assert.equal(h({ fruits: 501, weight_kg: 0, grades: g(0) }), undefined);
  assert.equal(h({ fruits: 2.5, weight_kg: 0, grades: g(0) }), undefined);
  assert.deepEqual(h({ fruits: 10, weight_kg: 24.456, grades: g(2, 0, 1) }), { fruits: 10, weightKg: 24.46, grades: { extra: 2, class2: 1 } });
  assert.deepEqual(h({ fruits: 10, weight_kg: 0.1, grades: g(8, 5) }), { fruits: 10 }); // 13 graded of 10, weight below range
  assert.deepEqual(h({ fruits: 4, weight_kg: -1, grades: g(-2, 1.5) }), { fruits: 4 });
});

test('treatment reports join the problem they treat, so progress can be followed', async () => {
  seed();
  const answers = [];
  await withGemini(answers, async (calls) => {
    // 1. A canker is seen: a new case.
    answers.push({ health: 'merah', issues: [{ code: 'phytophthora_canker', name: 'Kanker batang (Phytophthora palmivora)', confidence: 0.9, evidence: 'getah merah', action: 'Kerok dan oles.' }] });
    const r1 = await reportAndRead('getah merah di batang', 1);
    const caseId = fake.get('reports', r1.id).caseIds[0];
    assert.equal(fake.get('cases', caseId).status, 'open');
    assert.doesNotMatch(r1.msg, /masalah baru dicatat|Foto lagi/); // filed silently
    assert.equal(fake.get('reports', r1.id).triage.needsReview, true);

    // 2. "Sudah ditangani": treated. Same case, no new problem, nothing for the owner to decide.
    answers.push({ health: 'kuning', actions: [{ type: 'canker_treatment', product: 'pasta tembaga', issue: 'phytophthora_canker', target: 'Kanker batang', case: 1, evidence: 'kulit dikerok dan dioles' }], case_updates: [{ case: 1, status: 'treated', evidence: 'dioles' }] });
    const r2 = await reportAndRead('sudah ditangani', 2);
    assert.match(calls[calls.length - 1], /1\. Kanker batang \(Phytophthora palmivora\) \[code phytophthora_canker\]/); // Gemini was told what is open
    assert.equal(fake.all('cases').length, 1);
    assert.deepEqual(fake.get('reports', r2.id).caseIds, [caseId]);
    const c = fake.get('cases', caseId);
    assert.equal(c.status, 'treated');
    assert.deepEqual(c.events.map((e) => e.type), ['seen', 'treated']);
    assert.equal(c.lastAction, 'Kerok & oles batang · pasta tembaga');
    assert.equal(c.nextCheck, R.addDays(today, 7));
    assert.equal(fake.get('reports', r2.id).triage.needsReview, false);
    assert.equal(fake.get('trees', 'A1').condition, 'minor'); // the latest reading: a canker being treated is Kuning
    assert.doesNotMatch(r2.msg, /Dicatat:|Foto lagi tgl/); // filed silently

    // 3. Healed: the case closes and drops off the open list.
    answers.push({ case_updates: [{ case: 1, status: 'resolved', evidence: 'luka kering' }] });
    await reportAndRead('luka sudah kering', 3);
    assert.equal(fake.get('cases', caseId).status, 'resolved');
    assert.equal(fake.get('cases', caseId).closedOn, today);
    assert.equal(fake.get('cases', caseId).nextCheck, null);

    // 4. Routine work: bagging is the block's season job, not a problem.
    answers.push({ actions: [{ type: 'bagging', product: '', issue: 'none', target: '', case: 0, evidence: 'buah dibrongsong' }] });
    const r4 = await reportAndRead('buah sudah dibrongsong', 4);
    assert.match(calls[calls.length - 1], /Open problems on this tree from earlier reports \(numbered\):\nnone/);
    assert.equal(fake.all('cases').length, 1);
    assert.ok(fake.all('seasonTasks').some((t) => t.task === 'bagging' && t.block === 'A'));
    assert.doesNotMatch(r4.msg, /Dicatat:/);
  });
});

test('a case closed in the web app while Gemini reads stays closed, and a new case never replaces a solved one', async () => {
  seed();
  const answers = [];
  await withGemini(answers, async () => {
    answers.push({ health: 'kuning', issues: [{ code: 'leaf_blight', name: 'Hawar daun', confidence: 0.8, evidence: 'bercak', action: 'Pangkas daun sakit.' }] });
    const r1 = await reportAndRead('bercak di daun', 11);
    const caseId = fake.get('reports', r1.id).caseIds[0];

    // While Gemini reads the next report, the owner marks the problem solved in the web app.
    answers.push(() => {
      const c = fake.get('cases', caseId);
      fake.seed('cases', caseId, { ...c, status: 'resolved', closedOn: today, nextCheck: null, events: [...c.events, { date: today, type: 'resolved', by: 'Gary' }] });
      return { case_updates: [{ case: 1, status: 'same', evidence: 'bercak masih ada' }] };
    });
    await reportAndRead('cek bercak', 12);
    const c = fake.get('cases', caseId);
    assert.equal(c.status, 'resolved');
    assert.equal(c.nextCheck, null);
    assert.deepEqual(c.events.map((e) => e.type), ['seen', 'resolved', 'checked']);

    // The same problem seen again today opens a new case beside the solved one.
    answers.push({ health: 'kuning', issues: [{ code: 'leaf_blight', name: 'Hawar daun', confidence: 0.8, evidence: 'bercak baru' }] });
    const r3 = await reportAndRead('bercak baru', 13);
    const id2 = fake.get('reports', r3.id).caseIds[0];
    assert.equal(id2, `${caseId}_2`);
    assert.equal(fake.get('cases', caseId).status, 'resolved');
    assert.equal(fake.get('cases', id2).status, 'open');
    assert.equal(fake.get('cases', id2).nextCheck, R.addDays(today, 7));

    // A case deleted in the web app ("not a problem") is not brought back by a later report on it.
    answers.push(() => {
      fake.store.get('cases').delete(id2);
      return { case_updates: [{ case: 1, status: 'treated', evidence: 'dipangkas' }] };
    });
    const r4 = await reportAndRead('sudah dipangkas', 14);
    assert.equal(fake.get('cases', id2), undefined);
    assert.deepEqual(fake.get('reports', r4.id).caseIds || [], []);
  });
});

test('when Gemini fails, the problems the words show still become cases', async () => {
  seed();
  await withGemini([() => { throw new Error('402 billing'); }], async () => {
    const r = await reportAndRead('batang keluar getah merah', 21);
    const rep = fake.get('reports', r.id);
    assert.equal(rep.ai.status, 'failed');
    assert.equal(r.msg, null);
    assert.equal(rep.caseIds.length, 1);
    const c = fake.get('cases', rep.caseIds[0]);
    assert.equal(c.issue, 'phytophthora_canker');
    assert.equal(c.status, 'open');
    assert.deepEqual(c.events.map((e) => e.type), ['seen']);
  });
});

test('backfill: older reports file their problems once, the owner\'s check wins, and a dry run writes nothing', async () => {
  seed();
  const at = (daysAgo) => ({ seconds: Math.floor((Date.now() - daysAgo * 86400e3) / 1000) });
  const words = (issues) => ({ source: 'rules', version: 'rules-1', issues: issues.map((code) => ({ code, confidence: 0.7, evidence: code })), improving: false, numbers: [], needsReview: true });
  fake.seed('reports', 'old1', { treeId: 'A1', block: 'A', description: 'getah merah', createdAt: at(10), triage: words(['phytophthora_canker']) });
  fake.seed('reports', 'old2', { treeId: 'A1', block: 'A', description: 'dioles', createdAt: at(8),
    triage: { ...words([]), source: 'ai', needsReview: false, actions: [{ type: 'canker_treatment', issue: 'phytophthora_canker', product: 'Ridomil', case: 3, evidence: 'dioles' }] } });
  fake.seed('reports', 'old3', { treeId: 'A2', block: 'A', description: 'daun kuning', createdAt: at(5), triage: words(['nutrient']), review: { decision: 'dismissed' } });
  fake.seed('reports', 'old4', { treeId: 'B1', block: 'B', description: 'hawar?', createdAt: at(4), triage: words(['nutrient']), review: { decision: 'corrected' }, issues: ['leaf_blight'] });
  fake.seed('reports', 'old5', { treeId: 'B1', block: 'B', description: 'bunga mekar', createdAt: at(3), triage: words([]) });
  fake.seed('reports', 'old6', { treeId: 'A1', block: 'A', description: 'jauh', createdAt: at(90), triage: words(['borer']) });

  const dry = await backfillCases({ days: 30 });
  assert.equal(dry.applied, false);
  assert.equal(dry.reports, 5);
  assert.deepEqual(dry.toFile.map((x) => x.report), ['old1', 'old2', 'old4']);
  assert.equal(dry.dismissed, 1);
  assert.equal(dry.noProblem, 1);
  assert.equal(dry.gemini.none, 5);
  assert.equal(fake.all('cases').length, 0);

  const done = await backfillCases({ days: 30, apply: true });
  assert.equal(done.casesAfter, 2);
  const cankerId = fake.get('reports', 'old1').caseIds[0];
  const canker = fake.get('cases', cankerId);
  assert.equal(canker.status, 'treated');
  assert.equal(canker.openedOn, R.todayStr(new Date(Date.now() - 10 * 86400e3)));
  assert.deepEqual(canker.events.map((e) => [e.type, e.reportId]), [['seen', 'old1'], ['treated', 'old2']]);
  assert.equal(canker.nextCheck, R.addDays(R.todayStr(new Date(Date.now() - 8 * 86400e3)), 7));
  assert.deepEqual(fake.get('reports', 'old2').caseIds, [cankerId]);
  assert.equal(fake.get('cases', fake.get('reports', 'old4').caseIds[0]).issue, 'leaf_blight'); // the owner's correction
  assert.equal(fake.all('seasonTasks').length, 0);

  const again = await backfillCases({ days: 30, apply: true });
  assert.equal(again.toFile.length, 0);
  assert.equal(again.alreadyFiled, 3);
  assert.equal(again.casesAfter, 2);
});

test('backfill: treatments in older readings are recognised, also on problems filed before, without going back in time', async () => {
  seed();
  const at = (daysAgo) => ({ seconds: Math.floor((Date.now() - daysAgo * 86400e3) / 1000) });
  const dayAgo = (n) => R.todayStr(new Date(Date.now() - n * 86400e3));
  // Gemini readings from before it was asked for actions: no `actions` list at all.
  const olderAi = (code, name, evidence) => ({ source: 'ai', version: 'gemini-p2', issues: [{ code, name, confidence: 0.9, evidence }], improving: false, numbers: [], needsReview: true });
  fake.seed('reports', 'p1', { treeId: 'A1', block: 'A', description: 'B36 sudah dikerok, dioles Ridomil', createdAt: at(3),
    triage: olderAi('phytophthora_canker', 'Kanker batang (Phytophthora palmivora)', 'Batang dikerok hingga jaringan kayu') });
  fake.seed('reports', 'p2', { treeId: 'A2', block: 'A', description: 'getah merah, perlu dioles', createdAt: at(3),
    triage: olderAi('phytophthora_canker', 'Kanker batang (Phytophthora palmivora)', 'Getah merah keluar dari batang') });

  // A problem filed earlier from a later report (day 1), whose older report (day 2, already linked) said it was treated.
  fake.seed('reports', 'q1', { treeId: 'B1', block: 'B', description: 'jamur batang, sudah dikikis', createdAt: at(2), caseIds: ['B1_stem_fungus_x'],
    triage: olderAi('stem_fungus', 'Jamur upas', 'kulit dikikis') });
  fake.seed('reports', 'q2', { treeId: 'B1', block: 'B', description: 'jamur batang', createdAt: at(1), caseIds: ['B1_stem_fungus_x'],
    triage: olderAi('stem_fungus', 'Jamur upas', 'kulit pecah') });
  fake.seed('cases', 'B1_stem_fungus_x', { treeId: 'B1', block: 'B', issue: 'stem_fungus', name: 'Jamur upas', status: 'open', openedOn: dayAgo(2),
    events: [{ date: dayAgo(2), reportId: 'q1', type: 'seen' }, { date: dayAgo(1), reportId: 'q2', type: 'seen' }], lastOn: dayAgo(1), lastReportId: 'q2', nextCheck: R.addDays(dayAgo(1), 7) });

  const dry = await backfillCases({ days: 30 });
  assert.deepEqual(dry.toFile.map((x) => [x.report, x.actions]), [['p1', ['canker_treatment']], ['p2', []]]);
  assert.deepEqual(dry.toTreat.map((x) => x.report), ['q1']);
  assert.equal(dry.alreadyFiled, 1);

  await backfillCases({ days: 30, apply: true });
  const p1 = fake.get('cases', fake.get('reports', 'p1').caseIds[0]);
  assert.equal(p1.status, 'treated');
  assert.equal(p1.lastAction, 'Kerok & oles batang · Ridomil');
  assert.deepEqual(p1.events.map((e) => e.type), ['seen', 'treated']);
  assert.equal(fake.get('cases', fake.get('reports', 'p2').caseIds[0]).status, 'open'); // "perlu dioles": not done yet

  const b1 = fake.get('cases', 'B1_stem_fungus_x');
  assert.equal(b1.status, 'treated');
  assert.deepEqual(b1.events.map((e) => [e.reportId, e.type]), [['q1', 'seen'], ['q1', 'treated'], ['q2', 'seen']]);
  assert.equal(b1.lastOn, dayAgo(1)); // the later report stays the last one
  assert.equal(b1.lastReportId, 'q2');
  assert.equal(b1.nextCheck, R.addDays(dayAgo(1), 7));

  const again = await backfillCases({ days: 30, apply: true });
  assert.equal(again.toFile.length + again.toTreat.length, 0);
});

test('every report is taken as read: its stage and health move the tree on, the latest report has the last word', async () => {
  seed();
  const answers = [];
  await withGemini(answers, async () => {
    answers.push({ stages: [{ code: 'pingpong', confidence: 0.9, evidence: 'buah kecil' }], health: 'kuning', issues: [{ code: 'leaf_blight', name: 'Hawar daun', confidence: 0.8, evidence: 'bercak' }] });
    const r1 = await reportAndRead('buah kecil, daun bercak', 31);
    const tree = fake.get('trees', 'A1');
    assert.equal(tree.condition, 'minor');
    assert.equal(tree.observedStage.code, 'pingpong');
    assert.equal(tree.observedStage.reportId, r1.id);
    const rep = fake.get('reports', r1.id);
    assert.deepEqual([rep.conditionBefore, rep.conditionAfter, rep.conditionChanged, rep.conditionSource], ['healthy', 'minor', true, 'triage']);
    assert.ok(fake.all('treeEdits').some((e) => e.reason === 'report' && e.changes.condition && e.changes.condition.to === 'minor'));
    assert.equal(rep.review, undefined); // nothing waits for a check

    // A later report: healthy and improving.
    answers.push({ health: 'hijau', improving: true });
    const r2 = await reportAndRead('sudah membaik', 32);
    assert.equal(fake.get('trees', 'A1').condition, 'healthy');
    assert.equal(fake.get('trees', 'A1').improving.reportId, r2.id);
    assert.equal(fake.get('trees', 'A1').observedStage.code, 'pingpong'); // no stage seen: the last one stays

    // An older report read again never moves the tree back.
    assert.equal((await applyReading(r1.id)).changed, false);
    assert.equal(fake.get('trees', 'A1').condition, 'healthy');

    // A report the owner already changed in the web app is left as the owner set it.
    fake.seed('reports', r2.id, { ...fake.get('reports', r2.id), review: { decision: 'corrected' } });
    fake.seed('trees', 'A1', { ...fake.get('trees', 'A1'), condition: 'emergency' });
    assert.equal((await applyReading(r2.id)).changed, false);
    assert.equal(fake.get('trees', 'A1').condition, 'emergency');
  });
});

test('backfill: readings nobody checked move their trees on (dry run first)', async () => {
  seed();
  const at = (daysAgo) => ({ seconds: Math.floor((Date.now() - daysAgo * 86400e3) / 1000) });
  const reading = (stage, health) => ({ source: 'ai', version: 'gemini-p2', stage: { code: stage, confidence: 0.9, evidence: stage }, issues: [], health, improving: false, numbers: [], needsReview: true });
  fake.seed('reports', 's1', { treeId: 'A2', block: 'A', description: 'bunga', createdAt: at(6), triage: reading('bloom', 'hijau') });
  fake.seed('reports', 's2', { treeId: 'A2', block: 'A', description: 'pentil', createdAt: at(2), triage: reading('set', 'kuning') });
  fake.seed('trees', 'A2', { ...fake.get('trees', 'A2'), lastReportId: 's2' });
  const dry = await backfillCases({ days: 30 });
  assert.deepEqual(dry.trees, [{ tree: 'A2', stage: 'set', condition: 'minor', report: 's2' }]);
  assert.equal(fake.get('trees', 'A2').condition, 'healthy');
  await backfillCases({ days: 30, apply: true });
  assert.equal(fake.get('trees', 'A2').condition, 'minor');
  assert.equal(fake.get('trees', 'A2').observedStage.code, 'set');
  assert.equal(fake.get('trees', 'A2').observedStage.reportId, 's2');
});

test('urgent words keep the tree Merah, an unclear photo never makes it look better, a later same-day stage stands', async () => {
  seed();
  const answers = [];
  await withGemini(answers, async () => {
    // "hampir mati" made it Merah at once; Gemini reads the photo more calmly: still Merah.
    answers.push({ health: 'kuning' });
    await reportAndRead('pohon hampir mati, getah merah banyak', 41);
    assert.equal(fake.get('trees', 'A1').condition, 'emergency');

    // A blurry photo read as Hijau does not clear the Merah.
    answers.push({ health: 'hijau', photo_ok: false, photo_request: 'foto lebih dekat' });
    await reportAndRead('cek pohon', 42);
    assert.equal(fake.get('trees', 'A1').condition, 'emergency');

    // A clear photo that shows it better does.
    answers.push({ health: 'kuning' });
    await reportAndRead('sudah lebih baik', 43);
    assert.equal(fake.get('trees', 'A1').condition, 'minor');
  });

  // Two reports the same day: the later one's stage stays, even when the earlier one is read again.
  const at = (h) => ({ seconds: Math.floor(Date.parse(`${today}T${h}:00+07:00`) / 1000) });
  const reading = (code) => ({ source: 'ai', version: 'x', stage: { code, confidence: 0.9, evidence: code }, issues: [], health: 'hijau', improving: false, numbers: [], needsReview: false });
  fake.seed('reports', 'early', { treeId: 'A2', createdAt: at('08:00'), triage: reading('bloom') });
  fake.seed('reports', 'late', { treeId: 'A2', createdAt: at('09:00'), triage: reading('set') });
  fake.seed('trees', 'A2', { ...fake.get('trees', 'A2'), lastReportId: 'late', observedStage: { code: 'set', date: today, reportId: 'late' } });
  assert.equal((await applyReading('early')).changed, false);
  assert.equal(fake.get('trees', 'A2').observedStage.code, 'set');

  // A condition a worker chose in the older Flow is left as they chose it.
  fake.seed('reports', 'old', { treeId: 'B1', createdAt: at('10:00'), conditionSource: 'worker', conditionChanged: true, conditionBefore: 'healthy', conditionAfter: 'emergency', triage: reading('bloom') });
  fake.seed('trees', 'B1', { ...fake.get('trees', 'B1'), condition: 'emergency', lastReportId: 'old' });
  await applyReading('old');
  assert.equal(fake.get('trees', 'B1').condition, 'emergency');
  assert.equal(fake.get('trees', 'B1').observedStage.code, 'bloom');
});
