// lib/cases.js — progress tracking. One "case" per problem on a tree, from the first report that shows it to the one
// that closes it. Every report that sees, treats or re-checks the problem adds an event, so the owner (web app) and
// the worker (chat) can follow it:
//
//   open (seen) ──treated──▶ treated ──▶ improving ──▶ resolved
//        ▲                                   │
//        └────────────── worse ◀─────────────┘
//
// Collection `cases/{treeId}_{issue}_{openedOn}[_{name}]` (see docs/data-contract.md). Written by the bot after
// Gemini reads a report (lib/ai.js). Reports get `caseIds` pointing back at the cases they touched.
// Work that is not about a problem (fertilising, bagging, pruning…) stays on the report as `triage.actions`; the
// season jobs (hand pollination, fruit thinning, bagging, fruit tying) are also filed as `seasonTasks`, like the
// Catatan Kebun Flow does.
const { admin, db } = require('./firestore');
const R = require('./rules');
const S = require('./shared');
const C = require('./cropData');

const now = () => admin.firestore.FieldValue.serverTimestamp();
// The words and codes are shared with the web app (src/shared/actions.ts, generated into lib/shared.js).
const { ACTIONS, ACTION_INFO, SEASON_TASK_OF, CASE_UPDATES, RECHECK_DAYS } = S;
const actionLabel = (type) => (ACTION_INFO[type] ? ACTION_INFO[type].label.id : type);

const caseName = (c) => c.name || S.ISSUE_INFO[c.issue]?.label.id || c.issue;
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

/** The tree's problems that are not resolved yet, oldest first (their order is the numbering Gemini sees). */
async function openCases(treeId) {
  const snap = await db.collection('cases').where('treeId', '==', treeId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => c.status !== 'resolved')
    .sort((a, b) => String(a.openedOn).localeCompare(String(b.openedOn)));
}

/** The open problems as numbered lines for the prompt. */
function casesForPrompt(cases) {
  if (!cases.length) return 'none';
  return cases
    .map((c, i) => {
      const last = (c.events || [])[c.events.length - 1];
      return `${i + 1}. ${caseName(c)} [code ${c.issue}] — first seen ${c.openedOn}, status ${c.status}${last ? `, last report ${last.date}: ${last.type}${last.note ? ` (${last.note})` : ''}` : ''}`;
    })
    .join('\n');
}

/**
 * What a report gives to file, when it is not Gemini's fresh answer (a failed reading, or the backfill of older
 * reports): the owner's check when there is one, else the stored reading. Case numbers are dropped, since they
 * pointed at a list of open cases that no longer holds. A reading without a list of actions (words only, or Gemini
 * before it was asked for them) gets the treatments its words and photo notes describe. Null when the owner
 * dismissed the report.
 */
function problemsOf(report) {
  if (report.review && report.review.decision === 'dismissed') return null;
  const tr = report.triage || {};
  const read = (Array.isArray(tr.issues) ? tr.issues : []).filter((i) => i && S.isIssue(i.code));
  const issues = report.review
    ? (Array.isArray(report.issues) ? report.issues : []).filter(S.isIssue).map((code) => read.find((i) => i.code === code) || { code })
    : read;
  let actions;
  if (tr.source === 'ai' && Array.isArray(tr.actions)) {
    actions = tr.actions.filter((a) => a && ACTIONS.includes(a.type)).map(({ case: _n, ...a }) => a);
  } else {
    // What was seen, not what to do: the worker's words, and Gemini's notes on the problems and photos.
    const text = [report.description, ...read.map((i) => i.evidence), ...(Array.isArray(tr.photosSeen) ? tr.photosSeen.map((p) => p && p.seen) : [])]
      .filter((x) => typeof x === 'string' && x.trim())
      .join('. ');
    actions = S.treatmentsInText(text, [...new Set(issues.map((i) => i.code))]);
  }
  return { issues, actions };
}

const sameProblem = (c, code, name) =>
  c.issue === code && (code !== 'other' || !c.name || !name || c.name.toLowerCase() === String(name).toLowerCase());

/**
 * Files one Gemini reading into the tree's cases and season jobs.
 * `open` is the list given to the prompt, so `case: n` in Gemini's answer means open[n - 1].
 * Returns { caseIds }. Silent: nothing here reaches the worker (the reply stays as the worker knows it).
 */
async function applyToCases({ tree, reportId, triage, today, workerPhone, open, seasonTasks = true }) {
  const touched = new Map(); // id -> case (with pending changes)
  const created = [];

  const nextStatus = { treated: 'treated', improving: 'improving', worse: 'worse', resolved: 'resolved' };
  // What this report adds to each case: its new events, written onto the case as it is at write time (the owner may
  // have closed or reopened it meanwhile). `c.status` is kept up to date for the rest of this reading.
  const change = new Map(); // id -> { events: [] }
  const addEvent = (c, type, extra = {}) => {
    const events = c.events || [];
    if (events.some((e) => e.reportId === reportId && e.type === type)) return;
    const ev = { date: today, reportId, type };
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== '') ev[k] = v;
    c.events = [...events, ev];
    const ch = change.get(c.id) || { events: [] };
    ch.events.push(ev);
    if (nextStatus[type]) c.status = nextStatus[type];
    change.set(c.id, ch);
    touched.set(c.id, c);
  };
  const create = (code, name, firstType, extra) => {
    const id = [tree.id, code, today, code === 'other' ? slug(name) : ''].filter(Boolean).join('_');
    const existing = created.find((c) => c.id === id);
    if (existing) return existing;
    const c = { id, treeId: tree.id, block: tree.block || null, issue: code, status: 'open', openedOn: today, openedReportId: reportId, events: [], source: 'whatsapp' };
    if (name) c.name = name;
    created.push(c);
    addEvent(c, firstType, extra);
    return c;
  };
  const findCase = (code, name) => open.find((c) => sameProblem(c, code, name)) || created.find((c) => sameProblem(c, code, name));

  // 1. Treatments first (they carry what was done): they belong to the problem they treat, or open a case if nobody
  //    reported that problem before.
  for (const a of triage.actions || []) {
    if (!a.issue || a.issue === 'none') continue;
    const c = (a.case && open[a.case - 1]) || findCase(a.issue, a.target) || create(a.issue, a.target, 'seen', { note: a.target });
    addEvent(c, 'treated', { action: a.type, product: a.product, note: a.evidence });
  }
  // 2. What happened to the problems already open on this tree ("treated" again here is the same event).
  for (const u of triage.caseUpdates || []) {
    const c = open[u.case - 1];
    if (c) addEvent(c, u.status === 'same' ? 'checked' : u.status, { note: u.evidence });
  }
  // 3. Problems seen in this report: a new case, or one more sighting of an open one.
  for (const i of triage.issues || []) {
    const c = findCase(i.code, i.name);
    if (c) addEvent(c, 'seen', { note: i.evidence });
    else create(i.code, i.name, 'seen', { note: i.evidence, photo: i.photo });
  }

  const caseIds = [];
  for (const c of touched.values()) {
    const isNew = created.includes(c);
    const saved = await saveCase(c, change.get(c.id), isNew);
    if (saved) caseIds.push(saved.id);
  }

  // Season jobs of the block (pollination, thinning, bagging, tying) seen in the report.
  const tasks = [...new Set((triage.actions || []).map((a) => SEASON_TASK_OF[a.type]).filter(Boolean))];
  if (seasonTasks && tasks.length && tree.block) {
    try {
      const season = await C.blockSeasonDate(tree.block, today);
      if (season) await C.saveSeasonTasks({ block: tree.block, season, tasks, date: today, workerPhone });
    } catch (err) {
      console.error('Season tasks from report failed:', err);
    }
  }
  return { caseIds };
}

/** Where a case stands, from its events in date order (the latest one that sets a status wins). */
const STATUS_OF_EVENT = { treated: 'treated', improving: 'improving', worse: 'worse', resolved: 'resolved', reopened: 'open' };
function summarize(events) {
  const sorted = events
    .map((e, i) => [e, i])
    .sort((a, b) => String(a[0].date).localeCompare(String(b[0].date)) || a[1] - b[1])
    .map(([e]) => e);
  let status = 'open';
  let closedOn = null;
  let lastAction;
  for (const e of sorted) {
    if (STATUS_OF_EVENT[e.type]) status = STATUS_OF_EVENT[e.type];
    if (e.type === 'resolved') closedOn = e.date;
    if (e.type === 'treated') lastAction = [ACTION_INFO[e.action] ? actionLabel(e.action) : 'Dirawat', e.product].filter(Boolean).join(' · ');
  }
  const last = sorted[sorted.length - 1];
  const lastReport = [...sorted].reverse().find((e) => e.reportId);
  const out = {
    events: sorted,
    status,
    closedOn: status === 'resolved' ? closedOn : null,
    lastOn: last ? last.date : null,
    nextCheck: status === 'resolved' || !last ? null : R.addDays(last.date, RECHECK_DAYS),
  };
  if (lastReport) out.lastReportId = lastReport.reportId;
  if (lastAction) out.lastAction = lastAction;
  return out;
}

/**
 * Writes one case in a transaction. A new case never replaces another one (a problem solved by hand earlier today
 * keeps its record; this one gets the next free id). An existing case gets this report's events on top of what it
 * holds now, so a close or reopen in the web app while Gemini was reading is kept; one deleted meanwhile stays
 * deleted (null). Status, dates and the last action always follow the events in date order, so filing an older
 * report later (the backfill) never moves a case back in time.
 */
async function saveCase(c, ch, isNew) {
  return db.runTransaction(async (tx) => {
    if (isNew) {
      const { id: wanted, ...data } = c;
      for (let n = 1; n <= 20; n++) {
        const id = n === 1 ? wanted : `${wanted}_${n}`;
        const ref = db.collection('cases').doc(id);
        if ((await tx.get(ref)).exists) continue;
        const sum = summarize(data.events || []);
        tx.set(ref, { ...data, ...sum, updatedAt: now() });
        return { id, status: sum.status, nextCheck: sum.nextCheck };
      }
      throw new Error(`No free case id for ${wanted}`);
    }
    const ref = db.collection('cases').doc(c.id);
    const cur = await tx.get(ref);
    if (!cur.exists) return null; // deleted in the web app meanwhile ("not a problem")
    const fresh = cur.data();
    const events = [...(fresh.events || [])];
    for (const ev of ch.events) if (!events.some((e) => e.reportId === ev.reportId && e.type === ev.type)) events.push(ev);
    const sum = summarize(events);
    tx.set(ref, { ...fresh, ...sum, updatedAt: now() });
    return { id: c.id, status: sum.status, nextCheck: sum.nextCheck };
  });
}

module.exports = { openCases, casesForPrompt, applyToCases, problemsOf, ACTIONS, CASE_UPDATES };
