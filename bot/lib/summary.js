// lib/summary.js — the daily summary sent to workers on WhatsApp: yesterday's, every morning at 06:00 WIB
// (GET /daily-summary?date=yesterday from .github/workflows/daily-summary.yml); the word RINGKASAN in chat asks for
// today's any time. Indonesian, like everything a worker reads.
// Its point: workers who never see the webapp see that what they sent was recorded, and what the others sent:
//
//   📋 Ringkasan Kebun Cilowong · Selasa, 27 Okt 2026
//   Terima kasih, Udin! Catatan Anda hari ini sudah tersimpan ✅: 2 laporan KESEHATAN, 1 laporan PANEN (3 buah).
//     (Nothing today: when they last reported.)
//   🩺 Laporan KESEHATAN: the day's reports, everyone's, one short line each ("14:20 B1 (Budi) 🟡 Bunga mulai
//     mekar", their own marked "(Anda) ✅"); a quiet day shows the latest of the last two weeks, dated; the week
//   🧺 Laporan PANEN: the latest harvests of the last two weeks: fruit, kg, average scores; the week's total
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
const RECENT_MAX = 8;
// A quiet day still shows the team's latest: earlier reports fill the list up to RECENT_MIN, from the last BACK_DAYS.
const RECENT_MIN = 3;
const BACK_DAYS = 14;
const HEALTH_DOT = { hijau: '🟢', kuning: '🟡', merah: '🔴' };
const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });

const ms = (t) =>
  t && typeof t.toMillis === 'function' ? t.toMillis() : t && typeof t.toDate === 'function' ? t.toDate().getTime() : t && t._seconds ? t._seconds * 1000 : Number(t) || 0;
const num = (n, d = 1) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: d });
const digits = (p) => String(p || '').replace(/\D/g, '');
const idOrder = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const list = (ids, max = LIST_MAX) => {
  const u = [...new Set(ids.filter(Boolean))].sort(idOrder);
  return u.length > max ? `${u.slice(0, max).join(', ')} (+${u.length - max})` : u.join(', ');
};
const issueName = (c) => c.name || S.ISSUE_INFO[c.issue]?.label.id || c.issue;

/** The summary's day in words, from where `now` is: "hari ini", "kemarin", or "pada 25 Okt" (a 06:00 send is of yesterday). */
function dayWord(date, now = Date.now()) {
  const today = R.todayStr(new Date(now));
  if (date === today) return 'hari ini';
  if (date === R.addDays(today, -1)) return 'kemarin';
  return `pada ${shortDay(date)}`;
}
const capital = (w) => w.charAt(0).toUpperCase() + w.slice(1);

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
  const back = admin.firestore.Timestamp.fromDate(new Date(`${R.addDays(date, -BACK_DAYS)}T00:00:00+07:00`));
  const [recentReports, recentHarvests, counts, rain, tasks, cases, trees, workers] = await Promise.all([
    all(db.collection('reports').where('createdAt', '>=', back)),
    all(db.collection('harvests').where('date', '>=', R.addDays(date, -BACK_DAYS))),
    all(db.collection('cropCounts').where('date', '==', date)),
    db.collection('weather').doc(date).get().then((s) => (s.exists ? s.data() : null)),
    all(db.collection('seasonTasks').where('date', '==', date)),
    all(db.collection('cases')),
    all(db.collection('trees')),
    all(db.collection('workers')),
  ]);
  const startMs = start.toMillis ? start.toMillis() : start.ms;
  const endMs = startMs + 86400e3;
  // Only what came by the end of the day (a summary of yesterday leaves today out).
  const upTo = recentReports.filter((r) => ms(r.createdAt) < endMs);
  const harvestsUpTo = recentHarvests.filter((h) => h.date <= date);
  const reports = upTo.filter((r) => ms(r.createdAt) >= startMs);
  const harvests = harvestsUpTo.filter((h) => h.date === date);
  return { reports, harvests, recentReports: upTo, recentHarvests: harvestsUpTo, counts, rain, tasks, cases, trees: trees.filter((t) => t.active !== false), workers };
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
  const staleTrees = (data.trees || []).filter((t) => ms(t.lastReportAt) < cutoff && !reportedToday.has(t.id));
  const stale = staleTrees.map((t) => t.id);
  // Many trees: per block ("Blok A 120 dari 130"), which says where to go; a few: their IDs.
  const blockTotal = new Map();
  for (const t of data.trees || []) blockTotal.set(t.block || '?', (blockTotal.get(t.block || '?') || 0) + 1);
  const staleByBlock = new Map();
  for (const t of staleTrees) staleByBlock.set(t.block || '?', (staleByBlock.get(t.block || '?') || 0) + 1);
  const weekFrom = now - 7 * 86400e3;
  const week = data.recentReports ? data.recentReports.filter((r) => ms(r.createdAt) >= weekFrom) : reports;
  const lastAt = Math.max(0, ...(data.recentReports || reports).map((r) => ms(r.createdAt)));
  return {
    weekReports: week.length,
    weekTrees: new Set(week.map((r) => r.treeId).filter(Boolean)).size,
    lastReportAt: lastAt,
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
    staleBlocks: [...staleByBlock.entries()].sort((a, b) => idOrder(a[0], b[0])).map(([block, n]) => ({ block, n, of: blockTotal.get(block) })),
    trees: (data.trees || []).length,
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

/** A worker's words cut to a short line, on a word boundary. */
function condense(text, max = 60) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.,;:!]+$/, '');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : max).trim()}…`;
}

const nameOf = (data) => {
  const names = new Map((data.workers || []).map((w) => [digits(w.phone || w.id), w.name]));
  return (p) => names.get(digits(p)) || (digits(p) ? `••${digits(p).slice(-4)}` : '');
};
const shortDay = (date) => R.dateLabel(date).replace(/ \d{4}$/, '');
const clock = (t) => timeFmt.format(new Date(t)).replace('.', ':');

/**
 * Laporan KESEHATAN: the day's reports, everyone's, newest first, one line each ("14:20 *B1* (Budi) 🟡 Bunga mulai
 * mekar"); the worker's own marked "(Anda) ✅". A quiet day fills up with the latest of the last two weeks, dated.
 * What Gemini read stands in for the words when the worker wrote little.
 */
function healthLines(data, phone, max = RECENT_MAX) {
  const me = digits(phone);
  const who = nameOf(data);
  const line = (r, old) => {
    const health = r.health || r.triage?.health;
    const issues = (r.issues || (r.triage?.issues || []).map((i) => i.code) || []).filter((c) => S.ISSUE_INFO[c]).map((c) => S.ISSUE_INFO[c].label.id);
    const words = condense(r.description);
    const what = words.length >= 12 || !issues.length ? words : issues.join(', ');
    const at = ms(r.createdAt);
    const when = at ? (old ? `${shortDay(R.todayStr(new Date(at)))} ${clock(at)} ` : `${clock(at)} `) : '';
    const mineToo = me && digits(r.workerPhone) === me;
    const w = mineToo ? 'Anda' : who(r.workerPhone);
    return { at, text: `• ${when}*${r.treeId || '-'}*${w ? ` (${w})` : ''}${mineToo ? ' ✅' : ''} ${HEALTH_DOT[health] ? `${HEALTH_DOT[health]} ` : ''}${what || 'Foto pohon'}` };
  };
  const today = (data.reports || []).map((r) => line(r, false)).sort((a, b) => b.at - a.at);
  const todayIds = new Set((data.reports || []).map((r) => r.id));
  const fill = today.length < RECENT_MIN
    ? (data.recentReports || []).filter((r) => !todayIds.has(r.id)).map((r) => line(r, true)).sort((a, b) => b.at - a.at)
    : [];
  const lines = [...today.slice(0, max), ...fill.slice(0, Math.max(0, RECENT_MIN + 2 - today.length))].map((x) => x.text);
  if (today.length > max) lines.push(`• … dan ${today.length - max} laporan lainnya`);
  return { lines, onlyEarlier: !today.length && fill.length > 0 };
}

const HARVEST_MAX = 5;

/**
 * Laporan PANEN: the latest harvests of the last two weeks, everyone's, newest first ("Hari ini *A3* (Budi): 3 buah,
 * 6,1 kg · aroma 3,3 · kulit 4 · bentuk 4,3"; the worker's own today with their fruit codes), and the week's total.
 */
function harvestLines(data, date, phone = '', max = HARVEST_MAX, now = Date.now()) {
  const me = digits(phone);
  const who = nameOf(data);
  const all = [...(data.recentHarvests || data.harvests || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)) || ms(b.createdAt) - ms(a.createdAt));
  if (!all.length) return [];
  const avg = (items, k) => num(items.reduce((n, f) => n + (Number(f[k]) || 0), 0) / items.length);
  const lines = all.slice(0, max).map((h) => {
    const day = h.date === date && dayWord(date, now).indexOf('pada') !== 0 ? capital(dayWord(date, now)) : shortDay(h.date);
    const items = (h.items || []).filter((f) => f && Number.isFinite(f.aroma));
    const scores = items.length ? ` · aroma ${avg(items, 'aroma')} · kulit ${avg(items, 'skin')} · bentuk ${avg(items, 'shape')}` : '';
    const mineToo = me && digits(h.workerPhone) === me;
    const w = mineToo ? 'Anda' : who(h.workerPhone);
    const codes = mineToo && h.date === date ? fruitCodes(h.items) : '';
    return `• ${day} *${h.treeId || `Blok ${h.block}`}*${w ? ` (${w})` : ''}${mineToo ? ' ✅' : ''}: ${num(h.fruits, 0)} buah${h.weightKg ? `, ${num(h.weightKg)} kg` : ''}${scores}${codes ? ` (${codes})` : ''}`;
  });
  if (all.length > max) lines.push(`• … dan ${all.length - max} panen lainnya`);
  const week = all.filter((h) => h.date >= R.addDays(date, -6));
  if (week.length) {
    const fruits = week.reduce((n, h) => n + (Number(h.fruits) || 0), 0);
    const kg = week.reduce((n, h) => n + (Number(h.weightKg) || 0), 0);
    lines.push(`• 7 hari terakhir: ${num(fruits, 0)} buah${kg ? `, ${num(kg)} kg` : ''} dari ${new Set(week.map((h) => h.treeId).filter(Boolean)).size} pohon`);
  }
  return lines;
}

/**
 * The full message for one worker (`phone`, `name`), or for nobody in particular: a line about their own day, then
 * Laporan KESEHATAN and Laporan PANEN.
 */
function buildSummary(data, date, phone, now = Date.now(), name = '') {
  const d = digest(data, date, now);
  const when = dayWord(date, now);
  const lines = [`📋 *Ringkasan Kebun Cilowong*`, dayTitle(date), ''];

  if (digits(phone)) {
    const m = mine(data, phone);
    const done = [
      m.reports.length ? `${m.reports.length} laporan KESEHATAN` : '',
      m.harvests.length ? `${m.harvests.length} laporan PANEN (${num(m.harvests.reduce((n, h) => n + (Number(h.fruits) || 0), 0), 0)} buah)` : '',
    ].filter(Boolean);
    const also = [
      m.counts.length ? `hitung buah ${m.counts.length} pohon` : '',
      m.clusters.length ? `hitung tandan bunga ${m.clusters.length} pohon` : '',
      m.rain ? `curah hujan ${num(m.rain.rainMm)} mm` : '',
      ...m.tasks.map((t) => `${R.SEASON_TASK_LABELS[t.task] || t.task} blok ${t.block}`),
    ].filter(Boolean);
    if (done.length || also.length) {
      lines.push(`Terima kasih${name ? `, ${name}` : ''}! 🙏 Catatan Anda ${when} sudah tersimpan ✅${done.length ? `: ${done.join(', ')}` : ''}.`);
      if (also.length) lines.push(`Juga tercatat: ${also.join(', ')}.`);
    } else {
      const me = digits(phone);
      const last = Math.max(
        0,
        ...(data.recentReports || []).filter((r) => digits(r.workerPhone) === me).map((r) => ms(r.createdAt)),
        ...(data.recentHarvests || []).filter((h) => digits(h.workerPhone) === me).map((h) => Date.parse(`${h.date}T12:00:00+07:00`))
      );
      lines.push(`Halo${name ? ` ${name}` : ''}! Belum ada laporan dari Anda ${when}${last ? ` (terakhir ${R.dateLabel(R.todayStr(new Date(last)))})` : ''}. Kirim ID pohon (contoh: *A1*) untuk lapor.`);
    }
    lines.push('');
  }

  const health = healthLines(data, phone);
  lines.push(`🩺 *Laporan KESEHATAN*${health.onlyEarlier ? ' (terakhir)' : ''}`);
  if (health.lines.length) lines.push(...health.lines);
  else lines.push(`• Belum ada laporan dalam ${BACK_DAYS} hari terakhir`);
  if (data.recentReports) lines.push(`• 7 hari terakhir: ${d.weekReports} laporan dari ${d.weekTrees} pohon`);

  const panen = harvestLines(data, date, phone, HARVEST_MAX, now);
  lines.push('', '🧺 *Laporan PANEN*', ...(panen.length ? panen : [`• Belum ada panen dalam ${BACK_DAYS} hari terakhir`]));

  lines.push('', 'Kirim ID pohon untuk lapor. Kirim *RINGKASAN* untuk melihat ringkasan ini lagi.');
  return lines.join('\n');
}

/** One line for the template (no line breaks allowed in a template's values): KESEHATAN, then PANEN. */
function summaryLine(data, date, phone, now = Date.now()) {
  const d = digest(data, date, now);
  const when = dayWord(date, now);
  const m = digits(phone) ? mine(data, phone) : null;
  const mineNote = m && (m.reports.length || m.harvests.length) ? ` Catatan Anda ${when} sudah tersimpan ✅.` : '';
  const kes = d.reports
    ? `KESEHATAN: ${d.reports} laporan ${when}`
    : `KESEHATAN: belum ada laporan ${when}${d.lastReportAt ? ` (terakhir ${shortDay(R.todayStr(new Date(d.lastReportAt)))})` : ''}`;
  const week = (data.recentHarvests || []).filter((h) => h.date >= R.addDays(date, -6));
  const weekFruits = week.reduce((n, h) => n + (Number(h.fruits) || 0), 0);
  const pan = `PANEN: ${d.fruits ? `${num(d.fruits, 0)} buah ${when}` : `belum ada ${when}`}${weekFruits ? `, ${num(weekFruits, 0)} buah dalam 7 hari` : ''}`;
  return `${kes}. ${pan}.${mineNote}`;
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
    const res = await send(r.phone, text, line, date);
    out.push({ to: r.phone, name: r.name, ...res });
    if (res.ok && !to) {
      already.add(r.phone);
      await SENT_REF().set({ date, sentTo: [...already], at: admin.firestore.FieldValue.serverTimestamp() });
    }
  }
  if (!recipients.length && !to) return { date, sent: [], note: 'No workers on the Workers page (or all switched off).' };
  return { date, sent: out };
}

module.exports = { dayWord, loadDay, digest, mine, healthLines, harvestLines, condense, buildSummary, summaryLine, sendDailySummary, dayTitle };
