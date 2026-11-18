// scripts/regrade-preview.js — read only: every tree grading (treeGrades) scored the old way (14 criteria) and the
// new way (9 criteria: bentuk, warna kulit, aroma 5% each from Laporan PANEN; manis, tekstur creamy, ketebalan daging
// 20%, warna terang 15%, kulit tipis, pahit 5%), with the old scores mapped two ways:
//   direct  each new criterion takes its old namesake (tekstur creamy = lemak)
//   blend   tekstur creamy = mean(lemak, tekstur, kering); ketebalan daging = mean(daging tebal, biji, juring)
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

const W2 = { bentuk: 5, kulitBersih: 5, wangi: 5, manis: 20, creamy: 20, daging: 20, warna: 15, kulitTipis: 5, pahit: 5 };
const mean = (...v) => (v.some((x) => typeof x !== 'number') ? undefined : v.reduce((a, b) => a + b, 0) / v.length);
const MAP = {
  direct: (q) => ({ bentuk: q.bentuk, kulitBersih: q.kulitBersih, wangi: q.wangi, manis: q.manis, creamy: q.lemak, daging: q.dagingTebal, warna: q.warna, kulitTipis: q.kulitTipis, pahit: q.pahit }),
  blend: (q) => ({ ...MAP.direct(q), creamy: mean(q.lemak, q.tekstur, q.benyek), daging: mean(q.dagingTebal, q.biji, q.juring) }),
};
const grade = (p) => (p >= 70 ? 'high' : p >= 60 ? 'midhigh' : p >= 50 ? 'mid' : 'low');
function total(q) {
  let pts = 0;
  for (const [k, w] of Object.entries(W2)) {
    if (typeof q[k] !== 'number') return null;
    pts += (w * q[k]) / 5;
  }
  return Math.round(pts * 10) / 10;
}

async function main() {
  const snap = await db.collection('treeGrades').get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.qc && Object.keys(s.qc).length);
  rows.sort((a, b) => String(a.treeId).localeCompare(String(b.treeId), 'en', { numeric: true }) || String(a.fruitCode || a.date).localeCompare(String(b.fruitCode || b.date)));
  const count = { direct: {}, blend: {} };
  console.log('tree | fruit | old % grade (set) | direct % grade | blend % grade');
  for (const s of rows) {
    const old = G.sampleTotal(s);
    const d = total(MAP.direct(s.qc));
    const b = total(MAP.blend(s.qc));
    const set = s.grade ? ` set:${s.grade}` : '';
    const ch = (x) => (x === null ? '-' : `${x} ${grade(x)}${old.complete && grade(x) !== old.grade ? ' *' : ''}`);
    for (const [k, x] of [['direct', d], ['blend', b]]) if (x !== null && old.complete) count[k][`${old.grade}->${grade(x)}`] = (count[k][`${old.grade}->${grade(x)}`] || 0) + 1;
    console.log(`ROW ${s.treeId} | ${s.fruitCode || s.date} | ${old.complete ? `${old.pct} ${old.grade}` : 'incomplete'}${set} | ${ch(d)} | ${ch(b)}`);
  }
  console.log('MOVES', JSON.stringify(count));
}
main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
