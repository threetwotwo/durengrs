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
const { route } = require('../lib/flowScreens');
const { check } = require('./contract');

const today = R.todayStr();
const TOKEN = 'tree:A1:628111886551:1000';
const FARM_TOKEN = 'farm:628111886551:2000';
const base = { flowToken: TOKEN, treeId: 'A1', workerPhone: '628111886551' };

// `screen` is the screen the worker was on when pressing the button
const send = async (screen, data, token = TOKEN) =>
  check('tree', screen, await route({ ...base, kind: 'tree', flowToken: token, action: 'data_exchange', screen, data }));
const sendFarm = async (screen, data) =>
  check('farm', screen, await route({ kind: 'farm', flowToken: FARM_TOKEN, workerPhone: '628111886551', action: 'data_exchange', screen, data }));
const open = async () => check('tree', null, await route({ ...base, kind: 'tree', action: 'INIT' }));
const openFarm = async () => check('farm', null, await route({ kind: 'farm', flowToken: FARM_TOKEN, workerPhone: '628111886551', action: 'INIT' }));

function seed({ blockBloomDaysAgo = 33 } = {}) {
  fake.reset();
  fake.seed('trees', 'A1', { id: 'A1', variant: 'MK', block: 'A', condition: 'healthy' });
  fake.seed('trees', 'A2', { id: 'A2', variant: 'MK', block: 'A', condition: 'healthy' });
  fake.seed('trees', 'B1', { id: 'B1', variant: 'MK', block: 'B', condition: 'healthy' });
  fake.seed('variants', 'MK', { ripeningDays: '120' });
  if (blockBloomDaysAgo !== null) fake.seed('harvestCycles', 'A', { block: 'A', floweredOn: R.addDays(today, -blockBloomDaysAgo) });
}

test('opening the tree Flow shows the tree, a real menu title and a suggestion', async () => {
  seed();
  const r = await open();
  assert.equal(r.screen, 'TREE_LOOKUP');
  assert.match(r.data.title, /A1/);
  assert.equal(r.data.menu_title, 'Pohon A1 · MK · Blok A');
  assert.equal(r.data.has_suggestion, true);
  assert.match(r.data.suggestion, /disisakan/); // day 33 = after removing extra fruit
});

test('nothing due: no suggestion text is shown at all', async () => {
  seed();
  const season = R.addDays(today, -33);
  fake.seed('cropCounts', `A1_${season}_kept_${today}`, { treeId: 'A1', season, stage: 'kept', count: 40, date: today });
  const r = await open();
  assert.equal(r.data.has_suggestion, false);
  assert.doesNotMatch(JSON.stringify(r.data), /mendesak/);
  const menu = await send('MENU', { choice: 'harvest' });
  assert.equal(menu.data.has_hint, false);
  const err = await send('MENU', {});
  assert.equal(err.data.has_suggestion, false);
  assert.equal(err.data.menu_title, 'Pohon A1 · MK · Blok A');
});

test('no bloom date: suggestion explains, and only options that work are listed', async () => {
  seed({ blockBloomDaysAgo: null });
  assert.match((await open()).data.suggestion, /Mulai berbunga/);
  const pm = await send('MENU', { choice: 'harvest' });
  assert.deepEqual(pm.data.stage_options.map((o) => o.id), ['bloom', 'harvest', 'tree']);
  // a stale client that still sends a count anyway gets a friendly message
  const stale = await send('PANEN_MENU', { stage: 'kept' });
  assert.equal(stale.screen, 'PANEN_MENU');
  assert.match(stale.data.error_message, /belum punya tanggal bunga/);
});

test('top menu holds the issue report and harvest; tree data lives under harvest', async () => {
  seed();
  assert.equal((await send('MENU', { choice: 'issue' })).screen, 'REPORT');
  const pm = await send('MENU', { choice: 'harvest' });
  assert.equal(pm.screen, 'PANEN_MENU');
  assert.deepEqual(pm.data.stage_options.map((o) => o.id), ['bloom', 'clusters', 'set', 'kept', 'onTree', 'harvest', 'tree']);
  const kept = pm.data.stage_options.find((o) => o.id === 'kept');
  assert.match(kept.description, /^Disarankan sekarang/); // the recommended step is said in words
  // no emoji on any report option: either every option has a fitting one, or none does
  assert.equal(pm.data.stage_options.some((o) => /\p{Extended_Pictographic}/u.test(o.title)), false);
  assert.equal((await send('PANEN_MENU', { stage: 'tree' })).screen, 'EDIT_TREE');
  // rain and tasks are not tree reports any more
  assert.equal((await send('MENU', { choice: 'rain' })).data.error_message.length > 0, true);
  const empty = await send('MENU', {});
  assert.equal(empty.screen, 'MENU');
  assert.match(empty.data.error_message, /Pilih salah satu/);
});

test('count: validation, save, same-day replace, tree record follows', async () => {
  seed();
  const season = R.addDays(today, -33);
  const sel = await send('PANEN_MENU', { stage: 'kept' });
  assert.equal(sel.screen, 'COUNT');
  assert.equal(sel.data.init_values.wave, season);

  for (const [count, re] of [['abc', /bukan angka/], ['501', /antara 0 dan 500/], ['', /wajib/], ['3,5', /bulat/]]) {
    const r = await send('COUNT', { stage: 'kept', wave: season, count });
    assert.equal(r.screen, 'COUNT');
    assert.match(r.data.error_message, re);
    assert.equal(r.data.stage, 'kept');
  }
  assert.equal(fake.all('cropCounts').length, 0);

  const ok = await send('COUNT', { stage: 'kept', wave: season, count: '50' });
  assert.equal(ok.screen, 'DONE');
  const id = `A1_${season}_kept_${today}`;
  const doc = fake.get('cropCounts', id);
  assert.equal(doc.count, 50);
  assert.equal(doc.source, 'whatsapp');
  assert.equal(doc.block, 'A');
  assert.equal(fake.get('trees', 'A1').estimatedFruitCount, 50);
  assert.equal(fake.all('treeEdits').length, 1);

  await send('COUNT', { stage: 'kept', wave: season, count: '45' });
  assert.equal(fake.all('cropCounts').length, 1);
  assert.equal(fake.get('cropCounts', id).count, 45);
  assert.equal(fake.get('trees', 'A1').estimatedFruitCount, 45);

  assert.equal((await send('COUNT', { stage: 'kept', wave: '1999-01-01', count: '5' })).data.error_message.length > 0, true);
});

test('count: soft warning needs "Ya, sudah benar" and an unchanged number', async () => {
  seed();
  const season = R.addDays(today, -33);
  fake.seed('cropCounts', `A1_${season}_set_${R.addDays(today, -5)}`, { treeId: 'A1', season, stage: 'set', count: 80, date: R.addDays(today, -5) });
  const first = await send('COUNT', { stage: 'kept', wave: season, count: '90' });
  assert.equal(first.screen, 'COUNT');
  assert.equal(first.data.needs_confirm, true);
  assert.match(first.data.error_message, /Periksa lagi/);
  assert.equal(fake.all('cropCounts').length, 1);

  const ticked = { stage: 'kept', wave: season, count: '90', confirm: true, warned: first.data.warned };
  assert.equal((await send('COUNT', { ...ticked, count: '95' })).data.needs_confirm, true); // changed number -> asked again
  assert.equal((await send('COUNT', ticked)).screen, 'DONE');
  assert.equal(fake.get('cropCounts', `A1_${season}_kept_${today}`).count, 90);
});

test('bloom: errors, save, duplicate, partial waves create a second wave', async () => {
  seed();
  assert.match((await send('BLOOM', { date: R.addDays(today, 1), part: 'whole' })).data.error_message, /masa depan/);
  assert.match((await send('BLOOM', { date: R.addDays(today, -90), part: 'whole' })).data.error_message, /terlalu lama/i);
  assert.match((await send('BLOOM', { date: today })).data.error_message, /bagian/);
  const d = R.addDays(today, -3);
  const ok = await send('BLOOM', { date: d, part: 'lower', note: 'dahan kiri' });
  assert.equal(ok.screen, 'DONE');
  assert.equal(fake.get('bloomWaves', `A1_${d}_lower`).block, 'A');
  assert.match((await send('BLOOM', { date: d, part: 'lower' })).data.message, /sudah tercatat/);
  assert.equal(fake.all('bloomWaves').length, 1);
  const sel = await send('PANEN_MENU', { stage: 'clusters' });
  assert.equal(sel.data.wave_options.length, 2);
});

test('harvest: two steps, grades, retry does not duplicate', async () => {
  seed({ blockBloomDaysAgo: 125 });
  const a = await send('PANEN_MENU', { stage: 'harvest' });
  assert.equal(a.screen, 'HARVEST_A');
  assert.match((await send('HARVEST_A', { date: today, fruits: '0' })).data.error_message, /antara 1 dan 500/);
  assert.match((await send('HARVEST_A', { date: R.addDays(today, 1), fruits: '4' })).data.error_message, /masa depan/);
  const b = await send('HARVEST_A', { date: today, fruits: '12', weight: '24,5' });
  assert.equal(b.screen, 'HARVEST_B');
  assert.equal(b.data.fruits, '12');
  assert.match(b.data.harvest_summary, /12 buah · 24.5 kg/);
  assert.match(b.data.grade_help, /melebihi 12 buah/);

  const carry = { date: b.data.date, fruits: b.data.fruits, weight: b.data.weight };
  assert.match((await send('HARVEST_B', { ...carry, extra: '10', class1: '5' })).data.error_message, /lebih banyak/);
  assert.match((await send('HARVEST_B', { ...carry, problems: ['rot'] })).data.error_message, /berapa buah/i);
  assert.equal(fake.all('harvests').length, 0);

  const full = { ...carry, extra: '6', class1: '4', problems: ['rot', 'crack'], problem_fruits: '3', note: 'ok' };
  const ok = await send('HARVEST_B', full);
  assert.equal(ok.screen, 'DONE');
  const [h] = fake.all('harvests');
  assert.deepEqual(
    { block: h.block, treeId: h.treeId, variant: h.variant, fruits: h.fruits, weightKg: h.weightKg, grades: h.grades, problems: h.problems, problemFruits: h.problemFruits, source: h.source, floweredOn: h.floweredOn, daysFromBloom: h.daysFromBloom },
    { block: 'A', treeId: 'A1', variant: 'MK', fruits: 12, weightKg: 24.5, grades: { extra: 6, class1: 4 }, problems: ['rot', 'crack'], problemFruits: 3, source: 'whatsapp', floweredOn: R.addDays(today, -125), daysFromBloom: 125 }
  );
  assert.match(ok.data.message, /2 buah belum dikelompokkan/);
  await send('HARVEST_B', full); // network retry: identical data
  assert.equal(fake.all('harvests').length, 1);
});

test('a Flow message opened again later still saves a NEW harvest and a NEW report', async () => {
  seed({ blockBloomDaysAgo: 125 });
  const h1 = { date: today, fruits: '5', weight: '10' };
  await send('HARVEST_B', h1);
  await send('HARVEST_B', { ...h1, fruits: '7', weight: '14' }); // same flow token, different harvest
  assert.equal(fake.all('harvests').length, 2);

  const photo = [{ cdn_url: 'p1' }];
  await send('REPORT', { description: 'daun kuning', photos: photo });
  const second = await send('REPORT', { description: 'ada getah di batang', photos: photo });
  assert.match(second.data.message, /tersimpan/);
  assert.doesNotMatch(second.data.message, /sudah tersimpan sebelumnya/);
  assert.equal(fake.all('reports').length, 2);
  await send('REPORT', { description: 'ada getah di batang', photos: photo }); // retry of the second one
  assert.equal(fake.all('reports').length, 2);
});

test('harvest: photos are stored on the harvest and a retry does not upload again', async () => {
  seed({ blockBloomDaysAgo: 125 });
  photoCalls = [];
  const carry = { date: today, fruits: '5', weight: '10' };
  const photos = [{ cdn_url: 'a' }, { cdn_url: 'b' }];
  const ok = await send('HARVEST_B', { ...carry, photos }, 'tree:A1:628:77');
  assert.match(ok.data.message, /2 foto terlampir/);
  const [h] = fake.all('harvests');
  assert.equal(h.photos.length, 2);
  assert.match(h.photos[0].path, /^report-photos\/A1\/wa/);
  assert.equal(photoCalls.length, 1);
  await send('HARVEST_B', { ...carry, photos }, 'tree:A1:628:77');
  assert.equal(photoCalls.length, 1);
  assert.equal(fake.all('harvests').length, 1);
});

test('harvest: odd weight asks for confirmation on step 1', async () => {
  seed({ blockBloomDaysAgo: 125 });
  const first = await send('HARVEST_A', { date: today, fruits: '10', weight: '300' });
  assert.equal(first.screen, 'HARVEST_A');
  assert.equal(first.data.needs_confirm, true);
  const again = await send('HARVEST_A', { date: today, fruits: '10', weight: '300', confirm: true, warned: first.data.warned });
  assert.equal(again.screen, 'HARVEST_B');
});

test('issue report: photo and words both required, no lists to choose from', async () => {
  seed();
  assert.match((await send('REPORT', {})).data.error_message, /foto dan tulis/);
  assert.match((await send('REPORT', { description: 'daun kuning' })).data.error_message, /minimal satu foto/);
  assert.match((await send('REPORT', { description: '👍', photos: [{ cdn_url: 'a' }] })).data.error_message, /Tulis apa yang Anda lihat/);
  assert.equal(fake.all('reports').length, 0);
});

test('issue report: the system reads the words, replies at once, and only urgent words change the tree', async () => {
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

test('issue report: words with no stage or health in them still save (no undefined fields), a retry does not re-upload', async () => {
  seed();
  photoCalls = [];
  const ok = await send('REPORT', { description: 'daun kuning di dahan bawah', photos: [{ cdn_url: 'x' }] });
  assert.equal(ok.screen, 'DONE');
  assert.equal(ok.data.saved, true);
  const again = await send('REPORT', { description: 'daun kuning di dahan bawah', photos: [{ cdn_url: 'x' }] });
  assert.match(again.data.message, /sudah tersimpan sebelumnya/);
  assert.equal(photoCalls.length, 1);
  assert.equal(fake.all('reports').length, 1);
});

test('older Flow: a report with only a photo, or only words, still saves', async () => {
  seed();
  assert.equal((await send('REPORT', { condition: 'healthy', photos: [{ cdn_url: 'p' }], description: '' })).screen, 'DONE');
  assert.equal((await send('REPORT', { condition: 'minor', description: 'daun menguning' })).screen, 'DONE');
  assert.equal(fake.all('reports').length, 2);
  // The worker's choice is recorded even when it matches the tree already (the review then proposes it as is).
  const same = fake.all('reports').find((r) => !r.description);
  assert.equal(same.conditionChanged, false);
  assert.equal(same.conditionSource, 'worker');
});

test('a step that ends without saving says so to the chat (saved: false)', async () => {
  seed();
  const r = await route({ kind: 'tree', action: 'data_exchange', screen: 'MENU', flowToken: 'tree:Z9:628111886551:9', treeId: 'Z9', workerPhone: '628111886551', data: { choice: 'issue' } });
  assert.equal(r.screen, 'DONE');
  assert.equal(r.data.saved, false);
});

test('issue report from the older Flow (condition and type lists) still saves, in the new words', async () => {
  seed();
  const ok = await send('REPORT', { condition: 'minor', problem_types: ['leaf', 'pest'], description: 'daun kuning', photos: [{ cdn_url: 'a' }] });
  assert.equal(ok.screen, 'DONE');
  const [r] = fake.all('reports');
  assert.equal(r.description, '[Daun / tunas, Hama] daun kuning');
  assert.equal(r.conditionSource, 'worker');
  assert.equal(fake.get('trees', 'A1').condition, 'minor');
  assert.match(ok.data.message, /Hijau → Kuning/);
});

test('the tree view shows the owner\'s dose, from the rules edited in the webapp', async () => {
  seed();
  require('../lib/cropData').resetLabelRulesCache();
  fake.seed('trees', 'A1', { id: 'A1', variant: 'MK', block: 'A', condition: 'healthy', trunkSize: 60, canopySize: 600, estimatedFruitCount: 8 });
  // Not shown to workers until the owner has confirmed the rules and given a unit.
  assert.doesNotMatch((await open()).data.measurements, /Dosis/);
  require('../lib/cropData').resetLabelRulesCache();
  fake.seed('farmMeta', 'labelRules', { dose: { fruiting: { mid: 0.8 } }, confirmed: true });
  assert.doesNotMatch((await open()).data.measurements, /Dosis/);
  require('../lib/cropData').resetLabelRulesCache();
  fake.seed('farmMeta', 'labelRules', { dose: { fruiting: { mid: 0.8 }, unit: 'kg' }, confirmed: true });
  assert.match((await open()).data.measurements, /Dosis pupuk: \*\*0\.8 kg NPK Perfect\*\*$/m);
});

test('tree data: same limits as the webapp, with clear messages', async () => {
  seed();
  const ok = await send('EDIT_TREE', { trunk: '45', notes: 'ok' });
  assert.equal(ok.screen, 'DONE');
  assert.equal(fake.get('trees', 'A1').trunkSize, 45);
  assert.match((await send('EDIT_TREE', { trunk: '9999' })).data.error_message, /Lingkar batang \(cm\) harus antara 1 dan 600/);
  assert.match((await send('EDIT_TREE', { canopy: '10' })).data.error_message, /antara 50 dan 2500/);
  assert.match((await send('EDIT_TREE', { branches: '2.5' })).data.error_message, /bulat/);
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
  // a farm token never reaches tree screens
  assert.equal((await route({ kind: 'farm', flowToken: FARM_TOKEN, action: 'data_exchange', screen: 'REPORT', data: {} })).screen, 'FARM_HOME');
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
});

test('bloom and count reports keep their photos; a retry does not upload again', async () => {
  seed();
  const pics = [{ cdn_url: 'u1', file_name: 'a.jpg' }, { cdn_url: 'u2', file_name: 'b.jpg' }];
  const d = R.addDays(today, -2);
  photoCalls = [];
  const ok = await send('BLOOM', { date: d, part: 'whole', photos: pics });
  assert.match(ok.data.message, /2 foto/);
  assert.equal(fake.get('bloomWaves', `A1_${d}_whole`).photos.length, 2);
  await send('BLOOM', { date: d, part: 'whole', photos: pics });
  assert.equal(photoCalls.length, 1);

  const season = d; // the whole-tree bloom just saved replaces the block date
  photoCalls = [];
  const c = await send('COUNT', { stage: 'clusters', wave: season, count: '40', photos: pics });
  assert.match(c.data.message, /2 foto/);
  const saved = fake.all('cropCounts').find((x) => x.stage === 'clusters');
  assert.equal(saved.photos.length, 2);
  const none = await send('COUNT', { stage: 'set', wave: season, count: '10' });
  assert.equal(none.screen, 'DONE');
});

test('an archived tree is closed to reports, and its block disappears when it was the only tree', async () => {
  seed();
  fake.seed('trees', 'T1', { id: 'T1', variant: 'MK', block: 'T', condition: 'not_assessed', active: false });
  const trees = require('../lib/trees');
  assert.equal(await trees.getTreeById('T1'), null);
  assert.equal(trees.isArchived(await trees.getTreeRecord('T1')), true);
  assert.equal(trees.isArchived(await trees.getTreeRecord('A1')), false); // no `active` field = active
  assert.deepEqual(await require('../lib/cropData').listBlocks(), ['A', 'B']);

  const r = await route({ kind: 'tree', action: 'data_exchange', screen: 'REPORT', flowToken: 'tree:T1:628111886551:5', treeId: 'T1', workerPhone: '628111886551', data: { description: 'daun kuning', condition: 'minor' } });
  assert.equal(r.screen, 'DONE');
  assert.match(r.data.message, /tidak aktif/);
  assert.equal(fake.all('reports').length, 0);
  assert.equal(fake.get('trees', 'T1').condition, 'not_assessed');
});

test('a flowering already recorded in the webapp under another id is not saved twice', async () => {
  seed();
  const d = R.addDays(today, -4);
  fake.seed('bloomWaves', 'xyz-webapp-random', { treeId: 'A1', block: 'A', date: d, part: 'lower', source: 'webapp' });
  const r = await send('BLOOM', { date: d, part: 'lower' });
  assert.match(r.data.message, /sudah tercatat/);
  assert.equal(fake.all('bloomWaves').length, 1);
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

test('harvest: the flowering it came from is chosen with the tree variety ripening time', async () => {
  seed({ blockBloomDaysAgo: 100 });
  fake.seed('variants', 'ST', { ripeningDays: 100 });
  fake.seed('trees', 'A3', { id: 'A3', variant: 'ST', block: 'A', condition: 'healthy' });
  fake.seed('bloomWaves', 'A3_l', { treeId: 'A3', block: 'A', date: R.addDays(today, -112), part: 'lower' });
  const carry = { date: today, fruits: '3' };
  const ok = await route({ ...base, treeId: 'A3', flowToken: 'tree:A3:628111886551:77', kind: 'tree', action: 'data_exchange', screen: 'HARVEST_B', data: carry });
  assert.equal(ok.screen, 'DONE');
  const h = fake.all('harvests').find((x) => x.treeId === 'A3');
  assert.equal(h.floweredOn, R.addDays(today, -100)); // ST ripens in 100 days: the block flowering, not the one 112 days ago
  assert.equal(h.daysFromBloom, 100);
});

test('archived trees do not change a block ripening range or season', async () => {
  seed();
  fake.seed('variants', 'ST', { ripeningDays: 90 });
  fake.seed('trees', 'A9', { id: 'A9', variant: 'ST', block: 'A', condition: 'healthy', active: false });
  const C = require('../lib/cropData');
  const s = await C.loadTreeSeason({ id: 'A1', block: 'A', variant: 'MK' }, today);
  assert.equal(s.ripeMin, 120);
});

test('Ubah data pohon no longer edits flower clusters or the fruit estimate', async () => {
  seed();
  fake.seed('trees', 'A1', { id: 'A1', variant: 'MK', block: 'A', condition: 'healthy', floweringClusters: 5, estimatedFruitCount: 9 });
  const r = await send('EDIT_TREE', { canopy: '600', clusters: '50', fruits: '70' });
  assert.equal(r.screen, 'DONE');
  const t = fake.get('trees', 'A1');
  assert.equal(t.canopySize, 600);
  assert.equal(t.floweringClusters, 5);
  assert.equal(t.estimatedFruitCount, 9);
  const flow = require('../flows/flow.json');
  const edit = JSON.stringify(flow.screens.find((x) => x.id === 'EDIT_TREE'));
  assert.ok(!edit.includes('form.clusters') && !edit.includes('form.fruits'));
});

test('photos of a flowering that was already recorded under an older id are not uploaded again', async () => {
  seed();
  const d = R.addDays(today, -4);
  fake.seed('bloomWaves', 'old-webapp-id', { treeId: 'A1', block: 'A', date: d, part: 'upper' });
  photoCalls = [];
  await send('BLOOM', { date: d, part: 'upper', photos: [{ cdn_url: 'u1', file_name: 'a.jpg' }] });
  assert.equal(photoCalls.length, 0);
});
