#!/usr/bin/env node
/**
 * Seed the Harvest page with the Sept 2026 tree sheet (scripts/sheet-2026.txt).
 *
 * For each flowering tree that exists in Firestore it writes three crop counts, stored against its block's bloom date:
 *   clusters  2 Sep   flowering branches × clusters per branch ("Est. Butir")
 *   set       16 Sep  fruit status 16 Sep
 *   onTree    28 Sep  fruit status 28 Sep (note: Pp, rontok, mata ketam...)
 * It also sets each block's bloom date (harvestCycles) and the tree's fruit estimate to the 28 Sep count (with a
 * treeEdits log entry). Count ids are fixed, so running it again overwrites instead of duplicating.
 *
 * Usage (from the repo root, after `npm install`):
 *   node scripts/seed-harvest-2026.mjs --bloom A=2026-07-20 B=2026-08-01 C=2026-08-01 D=2026-08-10            # dry run
 *   node scripts/seed-harvest-2026.mjs --bloom A=2026-07-20 B=2026-08-01 C=2026-08-01 D=2026-08-10 --write    # write
 *
 * The bloom dates are when flowers opened in each block (fruit was ping-pong size on 2 Sep, so before that; a week
 * off is fine). Needs the published firestore.rules that allow cropCounts.
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { collection, doc, getDocs, getFirestore, serverTimestamp, writeBatch } from 'firebase/firestore';

const root = new URL('..', import.meta.url);
const config = JSON.parse(readFileSync(new URL('firebase-applet-config.json', root), 'utf8'));
const DATES = { clusters: '2026-09-02', set: '2026-09-16', onTree: '2026-09-28' };

// ---- arguments ----
const args = process.argv.slice(2);
const write = args.includes('--write');
const bloom = {};
for (const a of args) {
  const m = /^([A-Z])=(\d{4}-\d{2}-\d{2})$/.exec(a);
  if (m) bloom[m[1]] = m[2];
}

// ---- sheet ----
const rows = readFileSync(new URL('scripts/sheet-2026.txt', root), 'utf8')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => {
    const [id, branches, perBranch, est, sep16, sep28, note] = l.split('|');
    return { id, block: id.replace(/\d+$/, ''), branches: +branches, perBranch: +perBranch, est: +est, sep16: +sep16, sep28: +sep28, note: (note || '').trim() };
  });
const blocks = [...new Set(rows.map((r) => r.block))].sort();
const bad = blocks.filter((b) => !bloom[b] || bloom[b] > DATES.clusters || bloom[b] < '2026-03-01');
if (bad.length) {
  console.error(`Give a bloom date (2026-03-01 .. ${DATES.clusters}) for block(s) ${bad.join(', ')}, e.g. --bloom ${blocks.map((b) => `${b}=2026-08-01`).join(' ')}`);
  process.exit(1);
}

// ---- Firestore ----
const app = initializeApp(config);
const db = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)' ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);
const snap = await getDocs(collection(db, 'trees'));
const trees = new Map(snap.docs.map((d) => [d.id, d.data()]));
console.log(`Firestore project ${config.projectId}: ${trees.size} trees. Sheet: ${rows.length} flowering trees.`);

const ops = [];
for (const b of blocks) ops.push((batch) => batch.set(doc(db, 'harvestCycles', b), { block: b, floweredOn: bloom[b], updatedAt: serverTimestamp() }));
const missing = [];
let seeded = 0;
let estChanged = 0;
for (const r of rows) {
  const tree = trees.get(r.id);
  if (!tree) {
    missing.push(r.id);
    continue;
  }
  seeded++;
  const season = bloom[r.block];
  for (const [stage, count, note] of [
    ['clusters', r.est, `${r.branches} × ${r.perBranch}`],
    ['set', r.sep16, ''],
    ['onTree', r.sep28, r.note],
  ]) {
    const date = DATES[stage];
    const data = { treeId: r.id, block: r.block, season, stage, count, date, by: 'Sheet Sep 2026', source: 'sheet', createdAt: serverTimestamp() };
    if (note) data.note = note;
    ops.push((batch) => batch.set(doc(db, 'cropCounts', `${r.id}_${season}_${stage}_${date}`), data));
  }
  if (tree.estimatedFruitCount !== r.sep28) {
    estChanged++;
    ops.push((batch) => batch.update(doc(db, 'trees', r.id), { estimatedFruitCount: r.sep28, dateUpdated: serverTimestamp() }));
    ops.push((batch) =>
      batch.set(doc(collection(db, 'treeEdits')), {
        treeId: r.id,
        changes: { estimatedFruitCount: { from: tree.estimatedFruitCount ?? null, to: r.sep28 } },
        at: serverTimestamp(),
        source: 'sheet-import',
      })
    );
  }
}
ops.push((batch) => batch.set(doc(db, 'farmMeta', 'import_2026_09'), { at: serverTimestamp(), trees: seeded, bloom, missing }));

console.log(`Bloom dates: ${blocks.map((b) => `${b} ${bloom[b]}`).join(', ')}`);
console.log(`Trees to seed: ${seeded} (${seeded * 3} counts); fruit estimates changing: ${estChanged}; writes: ${ops.length}`);
if (missing.length) console.log(`Not in Firestore, skipped (${missing.length}): ${missing.join(', ')}`);

if (!write) {
  console.log('\nDry run: nothing written. Add --write to save.');
  process.exit(0);
}
for (let i = 0; i < ops.length; i += 450) {
  const batch = writeBatch(db);
  ops.slice(i, i + 450).forEach((op) => op(batch));
  await batch.commit();
  console.log(`Saved ${Math.min(i + 450, ops.length)} / ${ops.length}`);
}
console.log('Done. Open the Harvest page to check.');
process.exit(0);
