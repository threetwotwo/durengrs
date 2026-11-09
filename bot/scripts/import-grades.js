// scripts/import-grades.js — management's grading, kept in a sheet (data/qc-sheet.tsv, the Kb. AVINA harvest report),
// into Firestore. Grading lives on the tree (one sampled fruit grades its tree): each sheet row becomes one sampling,
// treeGrades/sheet-{#}, with its 14 scores (0-5, as src/lib/grading.ts), MGMT QC grade and note, linked to the fruit
// in the app when one matches (same tree, the same day, else within 3 days, about the same weight). Fruits that got
// the sheet's scores on themselves before (qcFrom 'sheet') have them taken off again.
//   node scripts/import-grades.js dry     show what would be written
//   node scripts/import-grades.js apply   write it (runs again safely: the same documents are replaced)
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
    const t = String(s || '').trim().toLowerCase();
    // "MID otw HIGH", "Mid-High": almost High.
    if (/^mid\b.*\bhigh\b/.test(t)) return 'midhigh';
    const m = t.match(/^(high|mid|low)\b/);
    if (m) return m[1];
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
      console.log(`tree only  ${what} (no fruit in the app: grades the tree without one)`);
      continue;
    }
    used.add(`${hit.harvestId}/${hit.index}`);
    const code = hit.f.code || `${hit.tree} #${hit.index + 1}`;
    matched++;
    const pts = COLUMNS.reduce((n, [k, w]) => n + (r.qc[k] !== undefined ? (w * r.qc[k]) / 5 : 0), 0);
    console.log(`match      ${what} -> ${code} ${hit.date} ${hit.f.weightG}g, ${Math.round(pts)}% in the app`);
    r.fruit = { fruitKey: `${hit.harvestId}/${hit.index}`, ...(hit.f.code ? { fruitCode: hit.f.code } : {}) };
  }
  const samples = rows.filter((r) => r.grade || Object.keys(r.qc).length);
  // Fruits carrying the sheet's scores themselves (the first import): taken off, the tree's sampling replaces them.
  const strip = new Map();
  for (const x of fruits) if (x.f.qcFrom === 'sheet') strip.set(x.harvestId, [...(strip.get(x.harvestId) || []), x.index]);
  const own = fruits.filter((x) => x.f.qc && Object.keys(x.f.qc).length && x.f.qcFrom !== 'sheet');
  for (const x of own) console.log(`fruit-graded ${x.f.code || x.harvestId} in the webapp: becomes a sampling of ${x.tree}`);
  console.log(`${samples.length} samplings (${matched} linked to a fruit); ${[...strip.values()].flat().length} fruits to clear${apply ? ', writing' : ' (dry run, nothing written)'}`);
  if (!apply) return;
  const now = new Date().toISOString();
  const batch = db.batch();
  for (const r of samples) {
    batch.set(db.collection('treeGrades').doc(`sheet-${r.n}`), {
      treeId: r.tree,
      date: r.date,
      qc: r.qc,
      ...(r.grade ? { grade: r.grade } : {}),
      ...(r.note ? { note: r.note.slice(0, 300) } : {}),
      ...(r.weightG ? { weightG: r.weightG } : {}),
      ...(r.fruit || {}),
      from: 'sheet',
      at: now,
    });
  }
  for (const x of own) {
    batch.set(db.collection('treeGrades').doc(`${x.harvestId}-${x.index}`), {
      treeId: x.tree,
      date: x.date,
      qc: { ...(x.f.aroma ? { wangi: x.f.aroma } : {}), ...(x.f.skin ? { kulitBersih: x.f.skin } : {}), ...(x.f.shape ? { bentuk: x.f.shape } : {}), ...x.f.qc },
      ...(x.f.qcNote ? { note: x.f.qcNote } : {}),
      fruitKey: `${x.harvestId}/${x.index}`,
      ...(x.f.code ? { fruitCode: x.f.code } : {}),
      weightG: x.f.weightG,
      from: 'webapp',
      at: x.f.qcAt || now,
    });
  }
  await batch.commit();
  for (const [id, list] of strip) {
    const ref = db.collection('harvests').doc(id);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const items = [...(doc.data().items || [])];
      for (const i of list) {
        if (!items[i]) continue;
        const { qc, qcGrade, qcFrom, qcAt, qcNote, ...rest } = items[i];
        items[i] = rest;
      }
      tx.update(ref, { items });
    });
  }
  console.log(`${samples.length + own.length} samplings written, ${strip.size} harvests cleared`);
}

const action = process.argv[2];
(action === 'dry' ? run(false) : action === 'apply' ? run(true) : Promise.reject(new Error('dry or apply')))
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
