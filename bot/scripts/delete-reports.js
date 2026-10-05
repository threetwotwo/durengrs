// Deletes all reports submitted by one worker phone number, plus their photo files, and repairs the
// trees that pointed at them (last report + condition).
//
//   node scripts/delete-reports.js 628111886551          # DRY RUN: only prints what would happen
//   node scripts/delete-reports.js 628111886551 --yes    # really deletes
//
// Needs the same credentials/env as the bot (STORAGE_BUCKET, GOOGLE_SERVICE_ACCOUNT_KEY_FILE).
require('dotenv').config();
const { admin, db, getBucket } = require('../lib/firestore');

const digits = (v) => String(v || '').replace(/\D/g, '');
const target = digits(process.argv[2]);
const really = process.argv.includes('--yes');
if (!target) {
  console.error('Usage: node scripts/delete-reports.js <phone digits> [--yes]');
  process.exit(1);
}
const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);

(async () => {
  const bucket = getBucket();
  const snap = await db.collection('reports').get();
  const mine = snap.docs.filter((d) => digits(d.data().workerPhone) === target);
  const others = snap.docs.filter((d) => digits(d.data().workerPhone) !== target);
  console.log(`${really ? 'DELETING' : 'DRY RUN'}: ${mine.length} of ${snap.size} reports are from ${target}.`);
  if (!mine.length) return;

  // 1. photo files
  const files = new Set();
  for (const d of mine) {
    const { treeId, photos } = d.data();
    files.add(`report-photos/${treeId}/${d.id}-collage.jpg`);
    (photos || []).forEach((p, i) => {
      if (p && p.path) files.add(p.path);
      files.add(`report-photos/${treeId}/thumbs/${d.id}-${i + 1}.jpg`);
      files.add(`report-photos/${treeId}/medium/${d.id}-${i + 1}.jpg`);
    });
  }
  console.log(`Photo files to remove (missing ones are skipped): ${files.size}`);

  // 2. trees that pointed at a deleted report
  const goneIds = new Set(mine.map((d) => d.id));
  const treeIds = [...new Set(mine.map((d) => d.data().treeId))];
  const fixes = [];
  for (const treeId of treeIds) {
    const treeRef = db.collection('trees').doc(treeId);
    const tree = await treeRef.get();
    if (!tree.exists || !goneIds.has(tree.data().lastReportId)) continue;
    const remaining = others
      .filter((d) => d.data().treeId === treeId)
      .sort((a, b) => ms(b.data().createdAt) - ms(a.data().createdAt));
    const deletedOldestFirst = mine
      .filter((d) => d.data().treeId === treeId)
      .sort((a, b) => ms(a.data().createdAt) - ms(b.data().createdAt));
    const latest = remaining[0];
    const update = latest
      ? { lastReportId: latest.id, lastReportAt: latest.data().createdAt }
      : {
          lastReportId: admin.firestore.FieldValue.delete(),
          lastReportAt: admin.firestore.FieldValue.delete(),
        };
    const restored = latest ? latest.data().conditionAfter : deletedOldestFirst[0].data().conditionBefore;
    if (restored && restored !== tree.data().condition) {
      update.condition = restored;
      update.conditionNotes = null; // the note was replaced by the test report and cannot be recovered
      update.conditionUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    fixes.push({ treeRef, update, treeId, from: tree.data().condition, to: update.condition });
    console.log(
      `  tree ${treeId}: last report -> ${latest ? latest.id : '(none)'}` +
        (update.condition ? `, condition ${tree.data().condition} -> ${update.condition}` : '')
    );
  }

  if (!really) {
    console.log('\nNothing was changed. Run again with --yes to apply.');
    return;
  }

  for (const f of files) await bucket.file(f).delete({ ignoreNotFound: true });
  for (const fix of fixes) await fix.treeRef.update(fix.update);
  let batch = db.batch();
  let n = 0;
  for (const d of mine) {
    batch.delete(d.ref);
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`Done. Deleted ${mine.length} reports, ${fixes.length} trees repaired.`);
})();
