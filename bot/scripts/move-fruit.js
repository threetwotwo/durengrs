// scripts/move-fruit.js — puts a fruit on the tree it really came from (a worker picked the wrong tree in Laporan
// PANEN), as the webapp's "Change tree" on the fruit's page (src/lib/fieldData.ts moveHarvestFruit): the fruit
// leaves its harvest for a harvest of its own on the right tree, same day and reporter, with that tree's next code
// of the day; the old code is kept as movedFrom; samplings pointing at it, or at fruits after it, follow.
//   node scripts/move-fruit.js A4-20261104-02 A7 [apply]     without apply: show what would change
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
for (const line of fs.readFileSync(path.join(root, 'env.yaml'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+):\s*(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = path.join(root, 'service-account.json');
const admin = require('firebase-admin');
const { db } = require('../lib/firestore');

async function main() {
  const [code, to, apply] = process.argv.slice(2);
  if (!code || !to) throw new Error('usage: move-fruit.js <fruit code> <tree> [apply]');
  const date = `${code.split('-')[1].slice(0, 4)}-${code.split('-')[1].slice(4, 6)}-${code.split('-')[1].slice(6, 8)}`;
  const day = await db.collection('harvests').where('date', '==', date).get();
  let src;
  let index = -1;
  for (const d of day.docs) {
    const i = (d.data().items || []).findIndex((f) => f.code === code);
    if (i >= 0) [src, index] = [d, i];
  }
  if (!src) throw new Error(`no fruit ${code} on ${date}`);
  const tree = await db.collection('trees').doc(to.toUpperCase()).get();
  if (!tree.exists) throw new Error(`no tree ${to}`);
  const t = tree.data();
  const taken = day.docs.flatMap((d) => (d.data().items || []).map((f) => f.code));
  const stem = `${tree.id}-${date.replace(/-/g, '')}-`;
  let n = 1;
  while (taken.includes(`${stem}${String(n).padStart(2, '0')}`)) n++;
  const newCode = `${stem}${String(n).padStart(2, '0')}`;
  const h = src.data();
  const item = h.items[index];
  console.log(`${code} (${item.weightG} g, harvest ${src.id} of ${h.treeId}, fruit ${index + 1} of ${h.items.length}) -> ${newCode} on ${tree.id}`);
  if (apply !== 'apply') return console.log('dry run, nothing written');
  const ref = db.collection('harvests').doc();
  const rest = h.items.filter((_, i) => i !== index);
  const kg = (list) => Math.round(list.reduce((s, f) => s + (Number(f.weightG) || 0), 0) / 10) / 100;
  await db.runTransaction(async (tx) => {
    tx.set(ref, {
      block: t.block,
      treeId: tree.id,
      variant: t.variant,
      date,
      fruits: 1,
      weightKg: kg([item]),
      problems: [],
      items: [{ ...item, code: newCode, movedFrom: code }],
      ...(h.source ? { source: h.source } : {}),
      ...(h.workerPhone ? { workerPhone: h.workerPhone } : {}),
      notes: `Moved from ${h.treeId} (${code})`,
      movedFromHarvest: src.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (rest.length) tx.update(src.ref, { items: rest, fruits: rest.length, weightKg: kg(rest), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    else tx.delete(src.ref);
  });
  const samples = await db.collection('treeGrades').where('fruitKey', '>=', `${src.id}/`).where('fruitKey', '<', `${src.id}0`).get();
  for (const d of samples.docs) {
    const at = Number(String(d.data().fruitKey).split('/')[1]);
    if (at === index) await d.ref.update({ fruitKey: `${ref.id}/0`, fruitCode: newCode, treeId: tree.id });
    else if (at > index) await d.ref.update({ fruitKey: `${src.id}/${at - 1}` });
  }
  console.log(`moved: ${newCode} in harvest ${ref.id}; ${samples.size} samplings checked`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e.message || e);
    process.exit(1);
  }
);
