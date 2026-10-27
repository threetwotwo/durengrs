// The daily summary (lib/summary.js): what a worker reads at 17:00, and who gets it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fake = require('./fakeFirestore');
fake.install();
const R = require('../lib/rules');
const { buildSummary, summaryLine, sendDailySummary } = require('../lib/summary');

const day = '2026-10-27';
const U = '628111886551';
const B = '628122223333';
const OLD = { toMillis: () => Date.parse('2026-10-01T00:00:00Z') };
const NEW = { toMillis: () => Date.parse('2026-10-27T03:00:00Z') };
const NOW = Date.parse('2026-10-27T10:00:00Z');
const data = {
  reports: [
    { id: 'r1', treeId: 'A1', workerPhone: U },
    { id: 'r2', treeId: 'A2', workerPhone: U },
    { id: 'r3', treeId: 'B1', workerPhone: B },
  ],
  cases: [
    { treeId: 'A2', issue: 'phytophthora_canker', status: 'open', openedOn: day, openedReportId: 'r2' },
    { treeId: 'A4', issue: 'leaf_blight', status: 'treated', openedOn: '2026-10-10', nextCheck: '2026-10-26' },
    { treeId: 'A5', issue: 'leaf_blight', status: 'resolved', openedOn: '2026-10-01', nextCheck: null },
  ],
  harvests: [{ treeId: 'A3', block: 'A', fruits: 3, weightKg: 6.1, workerPhone: U, items: [{ code: 'A3-20261027-01' }, { code: 'A3-20261027-02' }, { code: 'A3-20261027-03' }] }],
  counts: [{ treeId: 'A6', stage: 'onTree', by: U }, { treeId: 'B2', stage: 'onTree', by: B }],
  rain: { rainMm: 12, workerPhone: B },
  tasks: [],
  trees: [{ id: 'A1', lastReportAt: NEW }, { id: 'A7', lastReportAt: OLD }, { id: 'A8' }],
  workers: [],
};

test('a worker reads their own day first, everything marked as recorded; then the farm and what to check', () => {
  const text = buildSummary(data, day, U, NOW, 'Udin');
  assert.match(text, /Ringkasan Kebun Cilowong/);
  assert.match(text, /Selasa, 27 Okt 2026/);
  assert.match(text, /Terima kasih, Udin! .* semua sudah tersimpan/);
  assert.match(text, /✅ 2 laporan pohon: A1, A2/);
  assert.match(text, /✅ Masalah tercatat: A2 /);
  assert.match(text, /✅ Panen A3: 3 buah, 6,1 kg \(A3-20261027-01 s\/d 03\)/);
  assert.match(text, /✅ Hitung buah: 1 pohon \(A6\)/);
  assert.doesNotMatch(text, /Curah hujan/, 'the rain was recorded by someone else');
  assert.match(text, /3 laporan dari 3 pohon, oleh 2 pekerja/);
  assert.match(text, /Panen: 3 buah, 6,1 kg dari 1 pohon/);
  assert.match(text, /Hitung buah: 2 pohon/);
  assert.match(text, /Hujan: 12 mm/);
  assert.match(text, /Cek ulang masalah: A4/);
  assert.match(text, /Belum dilaporkan 7 hari: 2 pohon \(A7, A8\)/);
  // Someone with nothing today is nudged, not thanked.
  assert.match(buildSummary(data, day, '6289999', NOW, 'Siti'), /Halo Siti! Belum ada catatan dari Anda hari ini/);
  assert.match(buildSummary(data, day, B, NOW), /✅ Curah hujan: 12 mm/);
});

test('the template line: one line, the worker first', () => {
  const line = summaryLine(data, day, U, NOW);
  assert.equal(line.includes('\n'), false);
  assert.match(line, /^Anda: 2 laporan, panen 3 buah, hitung 1 pohon, semua tersimpan ✅\. Kebun: 3 laporan dari 3 pohon/);
});

test('sending: everyone on the Workers page unless switched off, once a day; a test number gets it regardless', async () => {
  fake.reset();
  const today = R.todayStr();
  fake.seed('workers', U, { phone: U, name: 'Udin' });
  fake.seed('workers', B, { phone: B, name: 'Budi', daily: false });
  fake.seed('reports', 'r1', { treeId: 'A1', workerPhone: U, createdAt: { _ts: true } });
  fake.seed('trees', 'A1', { id: 'A1' });
  const sent = [];
  const send = async (to, text, line) => (sent.push({ to, text, line }), { ok: true, via: 'text' });
  const first = await sendDailySummary({ date: today, send });
  assert.deepEqual(first.sent.map((s) => [s.to, s.ok]), [[U, true]]);
  assert.match(sent[0].text, /Terima kasih, Udin!/);
  assert.match(sent[0].text, /✅ 1 laporan pohon: A1/);
  const again = await sendDailySummary({ date: today, send });
  assert.deepEqual(again.sent.map((s) => s.skipped), ['already sent today']);
  assert.equal(sent.length, 1);
  await sendDailySummary({ date: today, to: B, send });
  assert.equal(sent.length, 2);
  assert.match(sent[1].text, /Halo Budi!/);
  const dry = await sendDailySummary({ date: today, dry: true, send });
  assert.equal(sent.length, 2, 'a dry run sends nothing');
  assert.match(dry.sent[0].text, /Udin/);
});

test('the latest reports from the others, newest first, one short line each', () => {
  const { recentLines, condense } = require('../lib/summary');
  const at = (h, m) => ({ toMillis: () => Date.parse(`2026-10-27T${String(h - 7).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`) });
  const d = {
    workers: [{ phone: U, name: 'Udin' }, { phone: B, name: 'Budi' }],
    reports: [
      { id: 'a', treeId: 'A1', workerPhone: U, createdAt: at(9, 0), description: 'mine' },
      { id: 'b', treeId: 'B1', workerPhone: B, createdAt: at(14, 20), health: 'kuning', description: '  Bunga mulai mekar.  ' },
      { id: 'c', treeId: 'B2', workerPhone: '628155550000', createdAt: at(10, 5), triage: { health: 'merah', issues: [{ code: 'phytophthora_canker' }] }, description: 'getah' },
      { id: 'd', treeId: 'B3', workerPhone: B, createdAt: at(8, 0), description: 'Daun banyak yang kuning di dahan bagian bawah dan ada bercak coklat di beberapa daun muda juga' },
    ],
    harvests: [{ treeId: 'A3', workerPhone: B, fruits: 3, weightKg: 6.1, createdAt: at(15, 2) }],
  };
  const lines = recentLines(d, U).lines;
  assert.deepEqual(lines.slice(0, 2), ['• 14:20 *B1* (Budi) 🟡 Bunga mulai mekar', '• 10:05 *B2* (••0000) 🔴 Kanker batang (getah merah)']);
  assert.match(lines[2], /^• 08:00 \*B3\* \(Budi\) Daun banyak yang kuning di dahan bagian bawah dan ada…$/);
  assert.equal(lines.some((l) => l.includes('mine')), false, "the worker's own reports are above, not here");
  assert.equal(recentLines(d, U, 2).lines.pop(), '• … dan 1 lainnya');
  assert.equal(condense('pendek'), 'pendek');
  assert.match(buildSummary(d, day, U, NOW, 'Udin'), /\*Laporan terbaru dari rekan\*\n• 14:20/);
});

test('a quiet day is not empty: the latest earlier reports, dated, the last report day, the week', () => {
  const at = (iso) => ({ toMillis: () => Date.parse(iso) });
  const d = {
    workers: [{ phone: U, name: 'Udin' }, { phone: B, name: 'Budi' }],
    reports: [],
    harvests: [],
    recentReports: [
      { id: 'x', treeId: 'B1', workerPhone: B, createdAt: at('2026-10-24T07:20:00Z'), health: 'kuning', description: 'Bunga mulai mekar' },
      { id: 'y', treeId: 'A1', workerPhone: U, createdAt: at('2026-10-23T02:00:00Z'), description: 'Buah sebesar telur' },
    ],
    recentHarvests: [{ treeId: 'A3', block: 'A', date: '2026-10-21', fruits: 3, weightKg: 6.1, workerPhone: B, createdAt: at('2026-10-21T08:00:00Z') }],
    cases: [], counts: [], tasks: [], trees: [],
  };
  const text = buildSummary(d, day, U, NOW, 'Udin');
  assert.match(text, /Belum ada catatan dari Anda hari ini\. Laporan terakhir Anda: 23 Okt 2026\./);
  assert.match(text, /\*Laporan terakhir di kebun\*\n• 24 Okt 14:20 \*B1\* \(Budi\) 🟡 Bunga mulai mekar\n• 23 Okt 09:00 \*A1\* \(Udin\) Buah sebesar telur\n/);
  assert.match(text, /🧺 \*Panen terbaru\*\n• 21 Okt \*A3\* \(Budi\): 3 buah, 6,1 kg\n• 7 hari terakhir: 3 buah, 6,1 kg dari 1 pohon/);
  assert.match(text, /Belum ada laporan pohon hari ini \(terakhir 24 Okt 2026\)/);
  assert.match(text, /7 hari terakhir: 2 laporan dari 2 pohon/);
});

test('the latest harvests: today first, with the average scores of the fruits; the total of the week', () => {
  const { harvestLines } = require('../lib/summary');
  const d = {
    workers: [{ phone: B, name: 'Budi' }],
    recentHarvests: [
      { treeId: 'A1', date: '2026-10-15', fruits: 9, weightKg: 20 },
      { treeId: 'A3', date: day, fruits: 3, weightKg: 6.1, workerPhone: B, items: [{ aroma: 3, skin: 4, shape: 5 }, { aroma: 2, skin: 3, shape: 4 }, { aroma: 5, skin: 5, shape: 4 }] },
      { treeId: 'A0', date: '2026-10-21', fruits: 2, weightKg: 4.9 },
    ],
  };
  assert.deepEqual(harvestLines(d, day), [
    '• Hari ini *A3* (Budi): 3 buah, 6,1 kg · aroma 3,3 · kulit 4 · bentuk 4,3',
    '• 21 Okt *A0*: 2 buah, 4,9 kg',
    '• 15 Okt *A1*: 9 buah, 20 kg',
    '• 7 hari terakhir: 5 buah, 11 kg dari 2 pohon',
  ]);
  assert.deepEqual(harvestLines({ recentHarvests: [] }, day), []);
});
