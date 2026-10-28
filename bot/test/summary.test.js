// The daily summary (lib/summary.js): what a worker reads at 17:00, and who gets it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fake = require('./fakeFirestore');
fake.install();
const R = require('../lib/rules');
const { buildSummary, summaryLine, sendDailySummary, healthLines, harvestLines, condense } = require('../lib/summary');

const day = '2026-10-27';
const U = '628111886551';
const B = '628122223333';
const NOW = Date.parse('2026-10-27T10:00:00Z');
const at = (hhmm, d = day) => ({ toMillis: () => Date.parse(`${d}T${hhmm}:00+07:00`) });

const busy = () => {
  const reports = [
    { id: 'r1', treeId: 'A1', workerPhone: U, createdAt: at('09:00'), health: 'hijau', description: 'Buah sebesar telur, ada 40' },
    { id: 'r2', treeId: 'B1', workerPhone: B, createdAt: at('14:20'), health: 'kuning', description: '  Bunga mulai mekar.  ' },
    { id: 'r3', treeId: 'B2', workerPhone: '628155550000', createdAt: at('10:05'), triage: { health: 'merah', issues: [{ code: 'phytophthora_canker' }] }, description: 'getah' },
  ];
  const harvests = [{ treeId: 'A3', block: 'A', date: day, fruits: 3, weightKg: 6.1, workerPhone: U, createdAt: at('15:02'), items: [{ code: 'A3-20261027-01', aroma: 3, skin: 4, shape: 5 }, { code: 'A3-20261027-02', aroma: 2, skin: 3, shape: 4 }, { code: 'A3-20261027-03', aroma: 5, skin: 5, shape: 4 }] }];
  return {
    workers: [{ phone: U, name: 'Udin' }, { phone: B, name: 'Budi' }],
    reports,
    recentReports: reports,
    harvests,
    recentHarvests: [...harvests, { treeId: 'A0', block: 'A', date: '2026-10-21', fruits: 2, weightKg: 4.9, workerPhone: B }],
    counts: [{ treeId: 'A6', stage: 'onTree', by: U }],
    rain: { rainMm: 12, workerPhone: U },
    tasks: [],
    cases: [],
    trees: [],
  };
};

test('grouped as Laporan KESEHATAN and Laporan PANEN, the worker thanked first; nothing else', () => {
  const text = buildSummary(busy(), day, U, NOW, 'Udin');
  assert.equal(
    text,
    [
      '📋 *Ringkasan Kebun Cilowong*',
      'Selasa, 27 Okt 2026',
      '',
      'Terima kasih, Udin! 🙏 Catatan Anda hari ini sudah tersimpan ✅: 1 laporan KESEHATAN, 1 laporan PANEN (3 buah).',
      'Juga tercatat: hitung buah 1 pohon, curah hujan 12 mm.',
      '',
      '🩺 *Laporan KESEHATAN*',
      '• 14:20 *B1* (Budi) 🟡 Bunga mulai mekar',
      '• 10:05 *B2* (••0000) 🔴 Kanker batang (getah merah)',
      '• 09:00 *A1* (Anda) ✅ 🟢 Buah sebesar telur, ada 40',
      '• 7 hari terakhir: 3 laporan dari 3 pohon',
      '',
      '🧺 *Laporan PANEN*',
      '• Hari ini *A3* (Anda) ✅: 3 buah, 6,1 kg · aroma 3,3 · kulit 4 · bentuk 4,3 (A3-20261027-01 s/d 03)',
      '• 21 Okt *A0* (Budi): 2 buah, 4,9 kg',
      '• 7 hari terakhir: 5 buah, 11 kg dari 2 pohon',
      '',
      'Kirim ID pohon untuk lapor. Kirim *RINGKASAN* untuk melihat ringkasan ini lagi.',
    ].join('\n')
  );
  assert.doesNotMatch(text, /Seluruh kebun|Perlu dicek|Belum dilaporkan/);
});

test('a quiet day is not empty: when the worker last reported, the latest reports of two weeks, dated', () => {
  const recentReports = [
    { id: 'x', treeId: 'C25', workerPhone: B, createdAt: at('09:51', '2026-10-23'), health: 'merah', description: 'Pengobatan ulang masih ada bercak coklat' },
    { id: 'y', treeId: 'A0', workerPhone: U, createdAt: at('18:35', '2026-10-21'), description: 'Daun muda keluar banyak di dahan atas' },
  ];
  const text = buildSummary({ workers: [{ phone: B, name: 'Ujang' }], reports: [], harvests: [], recentReports, recentHarvests: [] }, day, U, NOW, 'Gary');
  assert.match(text, /Halo Gary! Belum ada laporan dari Anda hari ini \(terakhir 21 Okt 2026\)\./);
  assert.match(text, /🩺 \*Laporan KESEHATAN\* \(terakhir\)\n• 23 Okt 09:51 \*C25\* \(Ujang\) 🔴 Pengobatan ulang masih ada bercak coklat\n• 21 Okt 18:35 \*A0\* \(Anda\) ✅ Daun muda keluar banyak di dahan atas\n• 7 hari terakhir: 2 laporan dari 2 pohon/);
  assert.match(text, /🧺 \*Laporan PANEN\*\n• Belum ada panen dalam 14 hari terakhir/);
});

test('long words are cut on a word boundary; many reports end with how many more', () => {
  assert.equal(condense('pendek'), 'pendek');
  assert.equal(condense('Daun banyak yang kuning di dahan bagian bawah dan ada bercak coklat di beberapa daun muda'), 'Daun banyak yang kuning di dahan bagian bawah dan ada…');
  const reports = [...Array(10)].map((_, i) => ({ id: `r${i}`, treeId: `A${i}`, workerPhone: B, createdAt: at(`1${i}:00`), description: 'Sehat semua, daun hijau' }));
  const { lines } = healthLines({ reports, recentReports: reports }, U);
  assert.equal(lines.length, 9);
  assert.equal(lines[8], '• … dan 2 laporan lainnya');
  assert.deepEqual(harvestLines({ recentHarvests: [] }, day), []);
});

test('the template line: one line, KESEHATAN then PANEN', () => {
  const line = summaryLine(busy(), day, U, NOW);
  assert.equal(line, 'KESEHATAN: 3 laporan hari ini. PANEN: 3 buah hari ini, 5 buah dalam 7 hari. Catatan Anda hari ini sudah tersimpan ✅.');
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
  assert.match(sent[0].text, /Terima kasih, Udin! .*1 laporan KESEHATAN/);
  assert.match(sent[0].text, /\*A1\* \(Anda\) ✅/);
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

test('the 06:00 summary is of yesterday: "kemarin" where the day summary says "hari ini"', () => {
  const { dayWord } = require('../lib/summary');
  const morning = Date.parse('2026-10-28T06:00:00+07:00');
  assert.equal(dayWord('2026-10-27', morning), 'kemarin');
  assert.equal(dayWord('2026-10-28', morning), 'hari ini');
  assert.equal(dayWord('2026-10-20', morning), 'pada 20 Okt');
  const text = buildSummary(busy(), day, U, morning, 'Udin');
  assert.match(text, /Catatan Anda kemarin sudah tersimpan ✅/);
  assert.match(text, /• Kemarin \*A3\* \(Anda\) ✅: 3 buah/);
  assert.doesNotMatch(text, /hari ini/i);
  assert.match(summaryLine(busy(), day, U, morning), /^KESEHATAN: 3 laporan kemarin\. PANEN: 3 buah kemarin/);
});
