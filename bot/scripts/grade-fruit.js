// scripts/grade-fruit.js — management's grading sent outside the webapp (WhatsApp) onto each tree's newest fruit,
// as the webapp's QC section saves it (treeGrades/{harvest id}-{place}). bot/data/qc-manual.json lists, per tree,
// the scores given (criteria keys of lib/grading.js) and a grade; criteria not given are filled in: wangi from the
// worker's aroma in Laporan PANEN (else 2), the rest 3 (unik 1). The grade given stands over the total.
//   node scripts/grade-fruit.js [apply]     without apply: show what would be saved
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
for (const line of fs.readFileSync(path.join(root, 'env.yaml'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+):\s*(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = path.join(root, 'service-account.json');
const { db } = require('../lib/firestore');
const G = require('../lib/grading');

const FILL = { kulitTipis: 3, juring: 3, biji: 3, benyek: 3, tekstur: 3, unik: 1 };

async function main() {
  const apply = process.argv[2] === 'apply';
  const list = JSON.parse(fs.readFileSync(path.join(root, 'data/qc-manual.json'), 'utf8'));
  for (const g of list) {
    const snap = await db.collection('harvests').where('treeId', '==', g.tree).get();
    const fruits = snap.docs
      .flatMap((d) => (d.data().items || []).map((f, i) => ({ id: d.id, i, date: d.data().date, ...f })))
      .filter((f) => f.code)
      .sort((a, b) => b.code.localeCompare(a.code));
    const f = fruits[0];
    if (!f) {
      console.log(`${g.tree}: no fruit found, skipped`);
      continue;
    }
    const qc = { wangi: Number(f.aroma) >= 1 ? Number(f.aroma) : 2, ...FILL, ...g.given };
    const t = G.sampleTotal({ qc });
    const id = `${f.id}-${f.i}`;
    const old = await db.collection('treeGrades').doc(id).get();
    console.log(`${g.tree}: fruit ${f.code} (${f.date}, ${f.weightG} g) -> ${id}${old.exists ? ' (replaces a grading)' : ''}; total ${t.pct}% (${t.grade}), set ${g.grade}; qc ${JSON.stringify(qc)}`);
    if (!apply) continue;
    await db.collection('treeGrades').doc(id).set({
      treeId: g.tree,
      date: f.date,
      qc,
      grade: g.grade,
      note: `${g.by}; not given, filled in: ${Object.keys(qc).filter((k) => !(k in g.given)).join(', ')}`,
      fruitKey: `${f.id}/${f.i}`,
      fruitCode: f.code,
      weightG: Math.round(Number(f.weightG) || 0),
      from: 'whatsapp-qc',
      at: new Date().toISOString(),
    });
    console.log(`  saved`);
  }
}
main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
