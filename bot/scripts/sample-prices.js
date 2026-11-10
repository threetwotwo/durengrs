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

const action = process.argv[2];
(action === 'find' ? find(process.argv[3]) : action === 'save' ? save() : action === 'wipe' ? wipe() : action === 'wipe-date' ? wipeDate(process.argv[3]) : Promise.reject(new Error('save, wipe or wipe-date')))
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
