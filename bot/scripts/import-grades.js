// scripts/import-grades.js — management's first grading, kept in a sheet (data/qc-sheet.tsv, the Kb. AVINA harvest
// report), onto the fruits in Firestore: each sheet row is matched to a fruit of the same tree, picked the same day
// (else within 3 days) and of about the same weight; its scores go into the fruit's `qc` (1-5, as the webapp's
// grading, src/lib/grading.ts), its MGMT QC and note into `qcNote`.
//   node scripts/import-grades.js dry     show the matches, write nothing
//   node scripts/import-grades.js apply   write them (a fruit already graded in the webapp is left alone)
// Needs env.yaml and service-account.json beside it, as the deploy writes them.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
for (const line of fs.readFileSync(path.join(root, 'env.yaml'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+):\s*(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = path.join(root, 'service-account.json');
const { db } = require('../lib/firestore');

// The sheet's 14 criteria, in its column order (from column 6), with their weights. All 14 are management's own
// scores here, aroma, kulit bersih and bentuk too (they stand over the worker's in the webapp).
const COLUMNS = [
  ['wangi', 5],
  ['kulitBersih', 5],
  ['kulitTipis', 5],
  ['bentuk', 5],
  ['juring', 5],
  ['biji', 10],
  ['dagingTebal', 10],
  ['warna', 10],
  ['benyek', 5],
  ['tekstur', 5],
  ['manis', 15],
  ['lemak', 10],
  ['pahit', 5],
  ['unik', 5],
];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12 };

function sheetDate(s) {
  const m = String(s).trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{2,4})$/);
  if (!m || !MONTHS[m[2].toLowerCase()]) return '';
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** The sheet's points for a criterion (out of its weight) as the webapp's 0-5 score, exactly: 9 of 10 is 4.5. */
const toScore = (points, weight) => Math.min(5, Math.max(0, Math.round((points / weight) * 5 * 100) / 100));

/** MGMT QC as a grade: "HIGH", "MID otw HIGH", "Mid-low" -> the first word; else a note starting "Low - …". */
function gradeOf(mgmt, note) {
  for (const s of [mgmt, note]) {
    const m = String(s || '').trim().match(/^(high|mid|low)\b/i);
    if (m) return m[1].toLowerCase();
  }
  return undefined;
}

function readSheet() {
  const rows = [];
  for (const line of fs.readFileSync(path.join(root, 'data', 'qc-sheet.tsv'), 'utf8').split('\n')) {
    const c = line.split('\t');
    const date = sheetDate(c[1] || '');
    if (!date || !(c[2] || '').trim()) continue;
    const qc = {};
    COLUMNS.forEach(([key, w], i) => {
      const v = String(c[5 + i] || '').replace('%', '').trim();
      if (v !== '' && !Number.isNaN(Number(v))) qc[key] = toScore(Number(v), w);
    });
    rows.push({
      n: c[0].trim(),
      date,
      tree: c[2].trim().toUpperCase(),
      weightG: Number(c[4]) || 0,
      sheetPct: (c[19] || '').trim(),
      qc,
      grade: gradeOf(c[20], c[21]),
      note: [(c[20] || '').trim(), (c[21] || '').trim()].filter(Boolean).join(' · '),
    });
  }
  return rows;
}

const days = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 864e5);

async function run(apply) {
  const rows = readSheet();
  const snap = await db.collection('harvests').where('date', '>=', '2026-10-01').get();
  const fruits = [];
  for (const d of snap.docs) {
    const h = d.data();
    (h.items || []).forEach((f, i) => f && fruits.push({ harvestId: d.id, index: i, tree: String(h.treeId || '').toUpperCase(), date: h.date, f }));
  }
  const used = new Set();
  const changes = new Map(); // harvestId -> [{index, qc, note}]
  let matched = 0;
  for (const r of rows) {
    const near = (maxDays, maxG) =>
      fruits
        .filter((x) => x.tree === r.tree && !used.has(`${x.harvestId}/${x.index}`) && days(x.date, r.date) <= maxDays && Math.abs(x.f.weightG - r.weightG) <= maxG)
        .sort((a, b) => days(a.date, r.date) - days(b.date, r.date) || Math.abs(a.f.weightG - r.weightG) - Math.abs(b.f.weightG - r.weightG))[0];
    const hit = near(0, 150) || near(3, 60);
    const what = `#${r.n} ${r.tree} ${r.date} ${r.weightG}g (${Object.keys(r.qc).length}/14 scores, sheet ${r.sheetPct}${r.grade ? ` ${r.grade.toUpperCase()}` : ''})`;
    if (!r.grade && !Object.keys(r.qc).length) {
      console.log(`empty      ${what} (no scores, no grade in the sheet)`);
      continue;
    }
    if (!hit) {
      const close = fruits
        .filter((x) => x.tree === r.tree && days(x.date, r.date) <= 10)
        .map((x) => `${x.f.code || x.index + 1} ${x.date} ${x.f.weightG}g${used.has(`${x.harvestId}/${x.index}`) ? ' (taken)' : ''}`);
      console.log(`not found  ${what}; ${r.tree} in the app ±10 days: ${close.join(', ') || 'none'}`);
      continue;
    }
    used.add(`${hit.harvestId}/${hit.index}`);
    const code = hit.f.code || `${hit.tree} #${hit.index + 1}`;
    if (hit.f.qc && Object.keys(hit.f.qc).length && hit.f.qcFrom !== 'sheet') {
      console.log(`kept       ${what} -> ${code} (already graded in the webapp)`);
      continue;
    }
    matched++;
    const pts = COLUMNS.reduce((n, [k, w]) => n + (r.qc[k] !== undefined ? (w * r.qc[k]) / 5 : 0), 0);
    console.log(`match      ${what} -> ${code} ${hit.date} ${hit.f.weightG}g, ${Math.round(pts)}% in the app`);
    changes.set(hit.harvestId, [...(changes.get(hit.harvestId) || []), { index: hit.index, qc: r.qc, grade: r.grade, note: r.note }]);
  }
  console.log(`${matched} of ${rows.length} sheet rows matched${apply ? ', writing' : ' (dry run, nothing written)'}`);
  if (!apply) return;
  for (const [id, list] of changes) {
    const ref = db.collection('harvests').doc(id);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const items = [...(doc.data().items || [])];
      for (const c of list) {
        const { qcGrade: _g, ...was } = items[c.index];
        items[c.index] = {
          ...was,
          qc: c.qc,
          qcFrom: 'sheet',
          qcAt: new Date().toISOString(),
          ...(c.grade ? { qcGrade: c.grade } : {}),
          ...(c.note ? { qcNote: c.note.slice(0, 300) } : {}),
        };
      }
      tx.update(ref, { items });
    });
  }
  console.log(`${changes.size} harvests updated`);
}

const action = process.argv[2];
(action === 'dry' ? run(false) : action === 'apply' ? run(true) : Promise.reject(new Error('dry or apply')))
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
