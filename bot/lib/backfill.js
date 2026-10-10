// lib/backfill.js — files problems from reports saved before cases existed (or whose reading never filed them), so
// Reports › Problems starts with the farm's recent history. One-off and safe to run again: a report that already
// points at cases (`caseIds`) is left alone. Open in a browser (GET /cases-backfill, see index.js):
//   ?token=<VERIFY_TOKEN>              what it would file (nothing is written)
//   ?token=<VERIFY_TOKEN>&apply=1      file it
//   &days=60                          how far back (default 30, at most 365)
const { db } = require('./firestore');
const R = require('./rules');
const K = require('./cases');

const DAY = 24 * 60 * 60 * 1000;
const ms = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return typeof ts.toDate === 'function' ? ts.toDate().getTime() : 0;
};

async function backfillCases({ days = 30, apply = false } = {}) {
  days = Math.min(365, Math.max(1, Math.round(Number(days) || 30)));
  const since = Date.now() - days * DAY;
  const [reportsSnap, treesSnap, casesSnap] = await Promise.all([db.collection('reports').get(), db.collection('trees').get(), db.collection('cases').get()]);
  const trees = new Map(treesSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  const filedReports = new Set();
  for (const d of casesSnap.docs) for (const e of d.data().events || []) if (e && e.reportId) filedReports.add(e.reportId);

  const reports = reportsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => ms(r.createdAt) >= since)
    .sort((a, b) => ms(a.createdAt) - ms(b.createdAt));

  const out = {
    applied: apply,
    days,
    casesBefore: casesSnap.docs.length,
    reports: reports.length,
    // How the bot read them: "done" means Gemini read it; "none" means it never ran (no key, or an older bot).
    gemini: { done: 0, failed: 0, running: 0, none: 0 },
    alreadyFiled: 0,
    noProblem: 0,
    dismissed: 0,
    treeGone: 0,
    toFile: [],
    // Reports filed before whose treatment was missed: it is added to their problems now.
    toTreat: [],
  };
  for (const r of reports) {
    const st = r.ai && r.ai.status;
    out.gemini[st === 'done' || st === 'failed' || st === 'running' ? st : 'none']++;
  }

  for (const r of reports) {
    const tree = trees.get(r.treeId);
    if (!tree || tree.active === false) { out.treeGone++; continue; }
    const triage = K.problemsOf(r);
    if (!triage) { out.dismissed++; continue; }
    const date = R.todayStr(new Date(ms(r.createdAt)));
    const workerPhone = r.workerPhone || null;
    const filed = (Array.isArray(r.caseIds) && r.caseIds.length > 0) || filedReports.has(r.id);

    if (!filed) {
      if (!triage.issues.length && !triage.actions.length) { out.noProblem++; continue; }
      const row = { report: r.id, tree: tree.id, date, issues: triage.issues.map((i) => i.name || i.code), actions: triage.actions.map((a) => a.type) };
      if (apply) {
        const open = await K.openCases(tree.id);
        // Season jobs are not filed from old reports: the season they belonged to may be over.
        const { caseIds } = await K.applyToCases({ tree, reportId: r.id, triage, today: date, workerPhone, open, seasonTasks: false });
        if (caseIds.length) await db.collection('reports').doc(r.id).update({ caseIds });
        row.cases = caseIds;
      }
      out.toFile.push(row);
      continue;
    }

    // Already filed: only the treatments its filing missed (it was read before treatments were recognised), on the
    // problems still open. A problem deleted or solved since is left alone.
    const open = await K.openCases(tree.id);
    const missed = triage.actions.filter((a) => {
      const c = open.find((x) => x.issue === a.issue);
      return c && !(c.events || []).some((e) => e.reportId === r.id && e.type === 'treated');
    });
    if (!missed.length) { out.alreadyFiled++; continue; }
    const row = { report: r.id, tree: tree.id, date, treated: missed.map((a) => `${a.type} (${a.issue})${a.product ? ` ${a.product}` : ''}`) };
    if (apply) {
      const { caseIds } = await K.applyToCases({ tree, reportId: r.id, triage: { issues: [], actions: missed }, today: date, workerPhone, open, seasonTasks: false });
      const all = [...new Set([...(Array.isArray(r.caseIds) ? r.caseIds : []), ...caseIds])];
      await db.collection('reports').doc(r.id).update({ caseIds: all });
      row.cases = caseIds;
    }
    out.toTreat.push(row);
  }
  if (apply) out.casesAfter = (await db.collection('cases').get()).docs.length;
  return out;
}

module.exports = { backfillCases };
