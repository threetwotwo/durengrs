// scripts/sample-prices.js — real vendor price lists (test/fixtures/prices-*.txt) read by Gemini and saved into
// marketPrices as test data, marked `sample: true`; `wipe` deletes those (and only those) again.
//   node scripts/sample-prices.js save      read every sample list and save its prices
//   node scripts/sample-prices.js wipe      delete every price marked sample
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

const action = process.argv[2];
(action === 'save' ? save() : action === 'wipe' ? wipe() : Promise.reject(new Error('save or wipe')))
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
