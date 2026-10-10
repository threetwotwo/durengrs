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
const RECHECK_DAYS = 7;

const ACTION_TYPES = [
  'canker_treatment', 'fungicide', 'insecticide', 'trunk_injection', 'fertilizer', 'foliar_feed', 'drench', 'pruning',
  'sanitation', 'bagging', 'fruit_thinning', 'pollination', 'fruit_tying', 'weeding', 'irrigation', 'mulching', 'harvest', 'other',
];
const ACTION_LABELS = {
  canker_treatment: 'Kerok & oles batang', fungicide: 'Semprot fungisida', insecticide: 'Semprot insektisida',
  trunk_injection: 'Infus batang', fertilizer: 'Pemupukan', foliar_feed: 'Pupuk daun', drench: 'Kocor',
  pruning: 'Pemangkasan', sanitation: 'Buang bagian sakit / buah busuk', bagging: 'Brongsong buah',
  fruit_thinning: 'Buang buah berlebih', pollination: 'Penyerbukan tangan', fruit_tying: 'Ikat tangkai buah',
  weeding: 'Penyiangan', irrigation: 'Penyiraman', mulching: 'Mulsa / bahan organik', harvest: 'Panen', other: 'Pekerjaan lain',
};
// Work that is also a season job of the block (seasonTasks, first record wins).
const SEASON_TASK_OF = { pollination: 'hand_pollination', fruit_thinning: 'fruit_thinning', bagging: 'bagging', fruit_tying: 'fruit_tying' };

const UPDATE_STATUSES = ['treated', 'improving', 'same', 'worse', 'resolved'];
const STATUS_LABELS = { open: 'Belum ditangani', treated: 'Sudah dirawat', improving: 'Membaik', worse: 'Memburuk', resolved: 'Selesai' };

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

const sameProblem = (c, code, name) =>
  c.issue === code && (code !== 'other' || !c.name || !name || c.name.toLowerCase() === String(name).toLowerCase());

/**
 * Files one Gemini reading into the tree's cases and season jobs.
 * `open` is the list given to the prompt, so `case: n` in Gemini's answer means open[n - 1].
 * Returns { caseIds, lines } — lines are for the worker's reply.
 */
async function applyToCases({ tree, reportId, triage, today, workerPhone, open }) {
  const touched = new Map(); // id -> case (with pending changes)
  const created = [];
  const lines = [];

  const nextStatus = { treated: 'treated', improving: 'improving', worse: 'worse', resolved: 'resolved' };
  const addEvent = (c, type, extra = {}) => {
    const events = c.events || [];
    if (events.some((e) => e.reportId === reportId && e.type === type)) return;
    const ev = { date: today, reportId, type };
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== '') ev[k] = v;
    c.events = [...events, ev];
    if (nextStatus[type]) c.status = nextStatus[type];
    if (type === 'resolved') c.closedOn = today;
    if (type === 'treated') c.lastAction = [ACTION_LABELS[extra.action] || 'Dirawat', extra.product].filter(Boolean).join(' · ');
    c.lastOn = today;
    c.lastReportId = reportId;
    c.nextCheck = c.status === 'resolved' ? null : R.addDays(today, RECHECK_DAYS);
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

  for (const c of touched.values()) {
    const { id, ...data } = c;
    await db.collection('cases').doc(id).set({ ...data, updatedAt: now() });
    const isNew = created.includes(c);
    const tail = c.status === 'resolved' ? '' : ` Foto lagi tgl ${R.dateLabel(c.nextCheck)} untuk cek perkembangan.`;
    lines.push(`📈 ${caseName(c)}: ${isNew && c.status === 'open' ? 'masalah baru dicatat' : STATUS_LABELS[c.status]}.${tail}`);
  }

  // Work done on the tree, and season jobs of the block.
  const tasks = [...new Set((triage.actions || []).map((a) => SEASON_TASK_OF[a.type]).filter(Boolean))];
  for (const a of triage.actions || []) {
    lines.unshift(`🧴 Dicatat: ${ACTION_LABELS[a.type] || a.type}${a.product ? ` (${a.product})` : ''}.`);
  }
  if (tasks.length && tree.block) {
    try {
      const season = await C.blockSeasonDate(tree.block, today);
      if (season) await C.saveSeasonTasks({ block: tree.block, season, tasks, date: today, workerPhone });
    } catch (err) {
      console.error('Season tasks from report failed:', err);
    }
  }
  return { caseIds: [...touched.keys()], lines: [...new Set(lines)] };
}

module.exports = { openCases, casesForPrompt, applyToCases, ACTION_TYPES, ACTION_LABELS, UPDATE_STATUSES, STATUS_LABELS, RECHECK_DAYS };
