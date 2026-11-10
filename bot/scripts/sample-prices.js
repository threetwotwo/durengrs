// scripts/sample-prices.js — real vendor price lists (test/fixtures/prices-*.txt) read by Gemini and saved into
// marketPrices as test data, marked `sample: true`; `wipe` deletes those (and only those) again.
//   node scripts/sample-prices.js save      read every sample list and save its prices
//   node scripts/sample-prices.js wipe      delete every price marked sample
//   node scripts/sample-prices.js wipe-date 2026-11-03   delete every price of that day (sample or not), with its screenshots
// Needs env.yaml (GEMINI_API_KEY, STORAGE_BUCKET) and service-account.json beside it, as the deploy writes them.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
for (const line of fs.readFileSync(path.join(root, 'env.yaml'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+):\s*(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = path.join(root, 'service-account.json');

const { db } = require('../lib/firestore');
const { readAndSavePrices } = require('../lib/prices');

async function save() {
  const dir = path.join(root, 'test', 'fixtures');
  for (const f of fs.readdirSync(dir).filter((x) => /^prices-.+\.txt$/.test(x))) {
    const done = await db.collection('marketPrices').where('sampleFile', '==', f).limit(1).get();
    if (!done.empty) {
      console.log(`${f}: already saved, skipped`);
      continue;
    }
    const saved = await readAndSavePrices({ text: fs.readFileSync(path.join(dir, f), 'utf8'), tag: { sample: true, sampleFile: f } });
    const vendors = [...new Set(saved.map((p) => p.vendor || '?'))].join(', ');
    console.log(`${f}: ${saved.length} prices saved (${vendors})`);
  }
}

async function wipe() {
  const snap = await db.collection('marketPrices').where('sample', '==', true).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`${snap.size} sample prices deleted`);
}

async function wipeDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('wipe-date YYYY-MM-DD');
  const { getBucket } = require('../lib/firestore');
  const snap = await db.collection('marketPrices').where('date', '==', date).get();
  const photos = new Set(snap.docs.map((d) => d.data().photo?.path).filter(Boolean));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  let gone = 0;
  for (const p of photos) gone += await getBucket().file(p).delete().then(() => 1, () => 0);
  console.log(`${date}: ${snap.size} prices deleted, ${gone} screenshots`);
}

/** Shows the saved prices whose variety, product or note has this word (read only). */
async function find(word) {
  const w = String(word || '').toLowerCase();
  const snap = await db.collection('marketPrices').get();
  const hits = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => `${p.variety} ${p.product} ${p.note} code:${p.varietyCode} ${p.price} ${p.pricePerKg}`.toLowerCase().includes(w));
  for (const p of hits) {
    const { photo, createdAt, vendorPhone, workerPhone, raw, ...rest } = p;
    console.log(JSON.stringify(rest));
  }
  console.log(`${hits.length} prices with "${word}"`);
}

/**
 * Prices whose written variety is one of the farm's by name get that variety's code (lib/prices.js codeByName):
 * a missing code is filled, a wrong one corrected ("Monthong" saved on MTH, Matahari, goes to MTG, Montong).
 */
async function rematch() {
  const { codeByName } = require('../lib/prices');
  const variants = (await db.collection('variants').get()).docs.map((d) => ({ code: d.id, ...d.data() }));
  const snap = await db.collection('marketPrices').get();
  let n = 0;
  for (const d of snap.docs) {
    const p = d.data();
    const code = codeByName(p.variety, variants);
    if (!code || code === p.varietyCode) continue;
    await d.ref.update({ varietyCode: code });
    console.log(`${p.date} ${p.vendor || ''}: ${p.variety} ${p.varietyCode || '(none)'} -> ${code}`);
    n++;
  }
  console.log(`${n} prices matched to the farm's varieties`);
}

/** The farm's varieties, and every saved price whose variety code is one of the given codes (read only). */
async function codes(list) {
  const variants = (await db.collection('variants').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  for (const v of variants) console.log(`variant ${v.id} | name=${v.name || ""} | description=${String(v.description || "").slice(0, 60)}`);
  const want = String(list || '').split(',').filter(Boolean);
  const snap = await db.collection('marketPrices').get();
  for (const d of snap.docs) {
    const { photo, createdAt, vendorPhone, workerPhone, raw, ...rest } = d.data();
    if (want.includes(rest.varietyCode) || /matahari|mthr|mata hari/i.test(`${rest.variety} ${rest.product} ${rest.note}`)) console.log(JSON.stringify({ id: d.id, ...rest }));
  }
}

/** Every tree sampling (read only): tree, the fruit's day, fruit, when saved, from, grade and total. */
async function samplings() {
  const G = require('../lib/grading');
  const snap = await db.collection('treeGrades').get();
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.treeId).localeCompare(String(b.treeId)) || String(a.date).localeCompare(String(b.date)));
  for (const g of list) {
    const t = G.sampleTotal(g);
    console.log(`${g.treeId} | ${g.date} | ${g.fruitCode || '-'} | at ${String(g.at || '').slice(0, 16)} | ${g.from || ''} | set ${g.grade || '-'} | ${t.pct}% ${t.complete ? 'complete' : `partial ${Object.keys(g.qc || {}).length}`} -> ${t.grade}`);
  }
}

const action = process.argv[2];
(action === 'samplings' ? samplings() : action === 'codes' ? codes(process.argv[3]) : action === 'rematch' ? rematch() : action === 'find' ? find(process.argv[3]) : action === 'save' ? save() : action === 'wipe' ? wipe() : action === 'wipe-date' ? wipeDate(process.argv[3]) : Promise.reject(new Error('save, wipe or wipe-date')))
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
