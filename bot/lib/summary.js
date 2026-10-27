// lib/summary.js — the daily summary sent to workers on WhatsApp (GET /daily-summary, called at 17:00 WIB by Cloud
// Scheduler; the word RINGKASAN in chat asks for it any time). Indonesian, like everything a worker reads.
// Its point: workers who never see the webapp see that what they sent was recorded. So it opens with their own day:
//
//   📋 Ringkasan Kebun Cilowong · Selasa, 27 Okt 2026
//   Terima kasih, Udin! Yang Anda catat hari ini, semua sudah tersimpan: ✅ reports (trees), problems filed from them,
//     harvest (fruit, kg, fruit codes), fruit counts, rain, season work
//   Seluruh kebun hari ini: reports (trees, workers), harvest, counts, rain, new problems
//   Perlu dicek: problems due for their re-check, trees nobody reported on for a week
//
// Who gets it: everyone on the webapp's Workers page (workers/{phone}) unless their switch is off (`daily: false`). A day's sends are kept
// in farmMeta/dailySummary, so a retried call never sends twice; `to` sends to one number (a test) regardless.
// WhatsApp only lets a business start a chat with a free text within 24 hours of the worker's last message; outside
// that, the approved template SUMMARY_TEMPLATE carries a one-line version ("Balas RINGKASAN untuk lengkapnya").
const { admin, db } = require('./firestore');
const R = require('./rules');
const S = require('./shared');

const STALE_DAYS = 7;
const LIST_MAX = 6;

const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : t && t._seconds ? t._seconds * 1000 : Number(t) || 0);
const num = (n, d = 1) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: d });
const digits = (p) => String(p || '').replace(/\D/g, '');
const idOrder = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const list = (ids, max = LIST_MAX) => {
  const u = [...new Set(ids.filter(Boolean))].sort(idOrder);
  return u.length > max ? `${u.slice(0, max).join(', ')} (+${u.length - max})` : u.join(', ');
};
const issueName = (c) => c.name || S.ISSUE_INFO[c.issue]?.label.id || c.issue;

/** "Selasa, 27 Okt 2026" */
function dayTitle(date) {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${weekday}, ${R.dateLabel(date)}`;
}

/** Everything the summary reads for `date` (Jakarta day). */
async function loadDay(date) {
  const start = admin.firestore.Timestamp.fromDate(new Date(`${date}T00:00:00+07:00`));
  const all = (q) => q.get().then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));
  const [reports, harvests, counts, rain, tasks, cases, trees, workers] = await Promise.all([
    all(db.collection('reports').where('createdAt', '>=', start)),
    all(db.collection('harvests').where('date', '==', date)),
    all(db.collection('cropCounts').where('date', '==', date)),
    db.collection('weather').doc(date).get().then((s) => (s.exists ? s.data() : null)),
    all(db.collection('seasonTasks').where('date', '==', date)),
    all(db.collection('cases')),
    all(db.collection('trees')),
    all(db.collection('workers')),
  ]);
  return { reports, harvests, counts, rain, tasks, cases, trees: trees.filter((t) => t.active !== false), workers };
}

/** The day in numbers (pure). `now` decides which trees count as not checked for a week. */
function digest(data, date, now = Date.now()) {
  const reports = data.reports || [];
  const harvests = data.harvests || [];
  const fruits = harvests.reduce((n, h) => n + (Number(h.fruits) || 0), 0);
  const kg = harvests.reduce((n, h) => n + (Number(h.weightKg) || 0), 0);
  const fruitCounts = (data.counts || []).filter((c) => c.stage !== 'clusters');
  const open = (data.cases || []).filter((c) => c.status !== 'resolved');
  const fresh = open.filter((c) => c.openedOn === date);
  const due = open.filter((c) => c.nextCheck && c.nextCheck <= date && c.openedOn !== date);
  const cutoff = now - STALE_DAYS * 86400e3;
  const reportedToday = new Set(reports.map((r) => r.treeId));
  const stale = (data.trees || []).filter((t) => ms(t.lastReportAt) < cutoff && !reportedToday.has(t.id)).map((t) => t.id);
  return {
    reports: reports.length,
    reportTrees: new Set(reports.map((r) => r.treeId).filter(Boolean)).size,
    reporters: new Set(reports.map((r) => digits(r.workerPhone)).filter(Boolean)).size,
    fruits,
    kg: Math.round(kg * 10) / 10,
    harvestTrees: new Set(harvests.map((h) => h.treeId).filter(Boolean)).size,
    countTrees: new Set(fruitCounts.map((c) => c.treeId)).size,
    rainMm: data.rain ? data.rain.rainMm : undefined,
    fresh,
    due,
    stale,
  };
}

/** What one worker recorded on the day (pure): their reports, the problems filed from them, harvests, counts, rain, season work. */
function mine(data, phone) {
  const me = digits(phone);
  const by = (x) => digits(x.workerPhone || x.by) === me;
  const reports = (data.reports || []).filter(by);
  const ids = new Set(reports.map((r) => r.id));
  return {
    reports,
    problems: (data.cases || []).filter((c) => ids.has(c.openedReportId)),
    harvests: (data.harvests || []).filter(by),
    counts: (data.counts || []).filter((c) => c.stage !== 'clusters' && by(c)),
    clusters: (data.counts || []).filter((c) => c.stage === 'clusters' && by(c)),
    rain: data.rain && by(data.rain) ? data.rain : null,
    tasks: (data.tasks || []).filter(by),
  };
}

const fruitCodes = (items) => {
  const codes = (items || []).map((f) => f && f.code).filter(Boolean);
  return codes.length > 1 ? `${codes[0]} s/d ${codes[codes.length - 1].split('-').pop()}` : codes[0] || '';
};

/** The full message for one worker (`phone`, `name`), or for nobody in particular. */
function buildSummary(data, date, phone, now = Date.now(), name = '') {
  const d = digest(data, date, now);
  const lines = [`📋 *Ringkasan Kebun Cilowong*`, dayTitle(date), ''];

  if (digits(phone)) {
    const m = mine(data, phone);
    const any = m.reports.length || m.harvests.length || m.counts.length || m.clusters.length || m.rain || m.tasks.length;
    if (any) {
      lines.push(`Terima kasih${name ? `, ${name}` : ''}! 🙏 Yang Anda catat hari ini, semua sudah tersimpan:`);
      if (m.reports.length) lines.push(`✅ ${m.reports.length} laporan pohon: ${list(m.reports.map((r) => r.treeId), 12)}`);
      if (m.problems.length) lines.push(`✅ Masalah tercatat: ${m.problems.slice(0, LIST_MAX).map((c) => `${c.treeId} ${issueName(c)}`).join(', ')}`);
      for (const h of m.harvests.slice(0, LIST_MAX)) {
        const codes = fruitCodes(h.items);
        lines.push(`✅ Panen ${h.treeId || `Blok ${h.block}`}: ${num(h.fruits, 0)} buah${h.weightKg ? `, ${num(h.weightKg, 2)} kg` : ''}${codes ? ` (${codes})` : ''}`);
      }
      if (m.harvests.length > LIST_MAX) lines.push(`✅ Panen ${m.harvests.length - LIST_MAX} pohon lainnya`);
      if (m.counts.length) lines.push(`✅ Hitung buah: ${m.counts.length} pohon (${list(m.counts.map((c) => c.treeId))})`);
      if (m.clusters.length) lines.push(`✅ Hitung tandan bunga: ${m.clusters.length} pohon`);
      if (m.rain) lines.push(`✅ Curah hujan: ${num(m.rain.rainMm)} mm`);
      if (m.tasks.length) lines.push(`✅ Pekerjaan: ${m.tasks.map((t) => `${R.SEASON_TASK_LABELS[t.task] || t.task} blok ${t.block}`).join(', ')}`);
    } else {
      lines.push(`Halo${name ? ` ${name}` : ''}! Belum ada catatan dari Anda hari ini. Kirim ID pohon (contoh: *A1*) untuk lapor.`);
    }
    lines.push('');
  }

  lines.push('*Seluruh kebun hari ini*');
  lines.push(d.reports ? `• ${d.reports} laporan dari ${d.reportTrees} pohon, oleh ${d.reporters} pekerja` : '• Belum ada laporan pohon');
  if (d.fruits) lines.push(`• Panen: ${num(d.fruits, 0)} buah${d.kg ? `, ${num(d.kg)} kg` : ''} dari ${d.harvestTrees} pohon`);
  if (d.countTrees) lines.push(`• Hitung buah: ${d.countTrees} pohon`);
  if (d.rainMm !== undefined) lines.push(`• Hujan: ${num(d.rainMm)} mm`);
  if (d.fresh.length) lines.push(`• Masalah baru: ${d.fresh.slice(0, LIST_MAX).map((c) => `${c.treeId} ${issueName(c)}`).join(', ')}${d.fresh.length > LIST_MAX ? ` (+${d.fresh.length - LIST_MAX})` : ''}`);

  if (d.due.length || d.stale.length) {
    lines.push('', '*Perlu dicek*');
    if (d.due.length) lines.push(`• Cek ulang masalah: ${list(d.due.map((c) => c.treeId))}`);
    if (d.stale.length) lines.push(`• Belum dilaporkan ${STALE_DAYS} hari: ${d.stale.length} pohon (${list(d.stale)})`);
  }
  lines.push('', 'Kirim ID pohon untuk lapor. Kirim *RINGKASAN* untuk melihat ringkasan ini lagi.');
  return lines.join('\n');
}

/** One line for the template (no line breaks allowed in a template's values): the worker's own day, then the farm's. */
function summaryLine(data, date, phone, now = Date.now()) {
  const d = digest(data, date, now);
  const m = digits(phone) ? mine(data, phone) : null;
  const own = m ? [m.reports.length ? `${m.reports.length} laporan` : '', m.harvests.length ? `panen ${num(m.harvests.reduce((n, h) => n + (Number(h.fruits) || 0), 0), 0)} buah` : '', m.counts.length ? `hitung ${m.counts.length} pohon` : ''].filter(Boolean) : [];
  const parts = [own.length ? `Anda: ${own.join(', ')}, semua tersimpan ✅. Kebun` : 'Kebun', `${d.reports} laporan dari ${d.reportTrees} pohon`];
  if (d.fruits) parts.push(`panen ${num(d.fruits, 0)} buah${d.kg ? ` (${num(d.kg)} kg)` : ''}`);
  if (d.fresh.length) parts.push(`${d.fresh.length} masalah baru`);
  if (d.due.length) parts.push(`${d.due.length} pohon perlu cek ulang`);
  return parts.join(', ').replace('. Kebun, ', '. Kebun: ').replace(/^Kebun, /, 'Kebun: ');
}

const SENT_REF = () => db.collection('farmMeta').doc('dailySummary');

/**
 * Sends the day's summary. `send(to, text, line)` delivers one message (index.js: free text, else the template) and
 * resolves to { ok, via, error? }. `to`: one number only (a test; not recorded). `dry`: nothing is sent, the texts
 * come back. Returns who got what.
 */
async function sendDailySummary({ date = R.todayStr(), to, dry = false, send }) {
  const data = await loadDay(date);
  const named = new Map(data.workers.map((w) => [digits(w.phone || w.id), w.name]));
  const recipients = to
    ? [{ phone: digits(to), name: named.get(digits(to)) || '' }]
    : data.workers.filter((w) => w.daily !== false).map((w) => ({ phone: digits(w.phone || w.id), name: w.name }));
  const sentDoc = to || dry ? null : await SENT_REF().get();
  const already = new Set(sentDoc && sentDoc.exists && sentDoc.data().date === date ? sentDoc.data().sentTo || [] : []);
  const out = [];
  for (const r of recipients) {
    if (!r.phone) continue;
    const text = buildSummary(data, date, r.phone, Date.now(), r.name);
    const line = summaryLine(data, date, r.phone);
    if (dry) {
      out.push({ to: r.phone, name: r.name, text, line });
      continue;
    }
    if (already.has(r.phone)) {
      out.push({ to: r.phone, name: r.name, skipped: 'already sent today' });
      continue;
    }
    const res = await send(r.phone, text, line);
    out.push({ to: r.phone, name: r.name, ...res });
    if (res.ok && !to) {
      already.add(r.phone);
      await SENT_REF().set({ date, sentTo: [...already], at: admin.firestore.FieldValue.serverTimestamp() });
    }
  }
  if (!recipients.length && !to) return { date, sent: [], note: 'No workers on the Workers page (or all switched off).' };
  return { date, sent: out };
}

module.exports = { loadDay, digest, mine, buildSummary, summaryLine, sendDailySummary, dayTitle };
