import React, { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronRight, RotateCcw, Trash2 } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { ACTION_INFO, CASE_EVENT_INFO, CASE_STATUS_INFO, isAction, type CaseStatus } from '../shared';
import { caseTitle, deleteCase, isDue, isOpen, lastActionLabel, setCaseStatus, sortCases } from '../lib/cases';
import { diffDays, formatShortDate, todayStr } from '../lib/treatments';
import { caseUrl, treeUrl, useQueryParams } from '../lib/router';
import type { ProblemCase } from '../types';
import { Link } from './Link';
import { PageHeader } from './PageHeader';
import { ConditionBadge } from './ConditionBadge';
import { readBy } from './ReportChange';

/**
 * Problems on trees, followed from first sighting to solved: one row per problem (the Problems page, Today, the tree
 * page, the report page), each opening the problem's own page (ProblemPage.tsx) with its history and buttons.
 */

const TONE_CLS: Record<string, string> = {
  danger: 'bg-rose-50 text-rose-800 border-rose-300',
  warn: 'bg-amber-50 text-amber-900 border-amber-300',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  good: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  done: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const CaseStatusPill: React.FC<{ status: CaseStatus; className?: string }> = ({ status, className = '' }) => {
  const { lang } = useT();
  const info = CASE_STATUS_INFO[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${TONE_CLS[info.tone]} ${className}`}>
      {info.label[lang]}
    </span>
  );
};

/** When the next photo check is, in words; overdue in red. */
export const NextCheck: React.FC<{ c: ProblemCase }> = ({ c }) => {
  const { t } = useT();
  if (!isOpen(c) || !c.nextCheck) return null;
  const days = diffDays(c.nextCheck, todayStr());
  const late = days < 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs tabular ${late ? 'text-rose-700 font-semibold' : days === 0 ? 'text-amber-800 font-semibold' : 'text-slate-600'}`}>
      <CalendarClock className="w-3.5 h-3.5" aria-hidden />
      {late
        ? t(days === -1 ? 'case.check.late.one' : 'case.check.late', { n: -days })
        : days === 0
          ? t('case.check.today')
          : t(days === 1 ? 'case.check.on.one' : 'case.check.on', { date: formatShortDate(c.nextCheck), n: days })}
    </span>
  );
};

/**
 * One problem as a row: tree, name, where it stands, when to check again. Opens the problem's page.
 * `plain`: inside a tree's group (no card of its own).
 */
export const CaseRow: React.FC<{ c: ProblemCase; showTree?: boolean; note?: string; plain?: boolean }> = ({ c, showTree, note, plain }) => {
  const { t, lang } = useT();
  const due = isDue(c);
  const lastAction = lastActionLabel(c, lang);
  const last = c.events[c.events.length - 1];
  const frame = plain
    ? 'hover:bg-slate-50'
    : `rounded-xl border bg-white hover:border-slate-400 ${c.status === 'worse' || due ? 'border-rose-300' : 'border-slate-200'} ${c.status === 'resolved' ? 'bg-slate-50/60' : ''}`;
  return (
    <Link to={caseUrl(c.id)} className={`group flex items-start gap-3 p-3 ${frame}`}>
      {showTree && <span className="text-sm font-bold font-mono text-slate-900 bg-slate-100 px-2 py-1 rounded shrink-0 min-w-12 text-center">{c.treeId}</span>}
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-bold text-slate-900">{caseTitle(c, lang)}</span>
          <CaseStatusPill status={c.status} />
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
          <span className="tabular">{t('case.since', { date: formatShortDate(c.openedOn) })}</span>
          {lastAction && <span>{t('case.lastAction', { what: lastAction })}</span>}
          {c.status === 'resolved' && c.closedOn && <span className="tabular">{t('case.closedOn', { date: formatShortDate(c.closedOn) })}</span>}
          <NextCheck c={c} />
        </span>
        {(note || last?.note) && <span className="block text-xs text-slate-500 line-clamp-1">{note || last?.note}</span>}
      </span>
      <ChevronRight className="w-4 h-4 mt-1 text-slate-400 group-hover:text-slate-700 shrink-0" aria-hidden />
    </Link>
  );
};

/**
 * Problems grouped by tree, the tree with the most urgent problem first: the tree (its ID, block and condition), then
 * each of its problems. `maxTrees` cuts the list (Today).
 */
export const ProblemsByTree: React.FC<{ cases: ProblemCase[]; maxTrees?: number; oneColumn?: boolean }> = ({ cases, maxTrees, oneColumn }) => {
  const { t } = useT();
  const { allTrees } = useFarm();
  const groups = useMemo(() => {
    const byTree = new Map<string, ProblemCase[]>();
    for (const c of cases) byTree.set(c.treeId, [...(byTree.get(c.treeId) || []), c]); // cases come most urgent first
    return [...byTree.entries()];
  }, [cases]);
  const shown = maxTrees ? groups.slice(0, maxTrees) : groups;
  return (
    <div className={`grid gap-3 items-start ${oneColumn ? '' : 'lg:grid-cols-2'}`}>
      {shown.map(([treeId, list]) => {
        const tree = allTrees.find((x) => x.id === treeId);
        const alert = list.some((c) => c.status === 'worse' || isDue(c));
        return (
          <section key={treeId} className={`bg-white rounded-xl border overflow-hidden ${alert ? 'border-rose-300' : 'border-slate-200'}`} aria-label={treeId}>
            <header className="px-3 py-2.5 flex items-center gap-2 border-b border-slate-100 bg-slate-50/60">
              <Link to={treeUrl(treeId)} className="font-mono font-bold text-slate-900 hover:text-emerald-700 hover:underline">
                {treeId}
              </Link>
              {tree?.block && <span className="text-xs text-slate-500">{t('common.blockN', { n: tree.block })}</span>}
              {tree && <ConditionBadge condition={tree.condition} size="sm" />}
              <span className="ml-auto text-xs text-slate-500 tabular">{t(list.length === 1 ? 'case.tree.count.one' : 'case.tree.count', { n: list.length })}</span>
            </header>
            <div className="divide-y divide-slate-100">
              {list.map((c) => (
                <CaseRow key={c.id} c={c} plain />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

/** Close a problem, reopen it, or delete it when it was never a real problem (its reports are kept). */
export const CaseActions: React.FC<{ c: ProblemCase; onDeleted?: () => void }> = ({ c, onDeleted }) => {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      console.error('Case update failed:', e);
      setError(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {isOpen(c) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => setCaseStatus(c, 'resolved', undefined, readBy()))}
            className="min-h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <CheckCircle2 className="w-4 h-4" />
            {t('case.markSolved')}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => setCaseStatus(c, 'open', undefined, readBy()))}
            className="min-h-10 px-4 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <RotateCcw className="w-4 h-4" />
            {t('case.reopen')}
          </button>
        )}
        {confirmDelete ? (
          <span className="inline-flex flex-wrap items-center gap-2 text-sm text-slate-700">
            {t('case.delete.confirm')}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await deleteCase(c);
                  onDeleted?.();
                })
              }
              className="min-h-10 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-60"
            >
              {t('case.delete.yes')}
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-10 px-2 font-semibold text-slate-600">
              {t('common.cancel')}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="min-h-10 px-3 rounded-lg text-sm font-semibold text-slate-500 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            {t('case.delete')}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
};

/** The tree's problems: open ones, and the solved ones behind a toggle. */
export const TreeProblems: React.FC<{ treeId: string }> = ({ treeId }) => {
  const { t } = useT();
  const { cases } = useFarm();
  const [showSolved, setShowSolved] = useState(false);
  const mine = useMemo(() => sortCases(cases.filter((c) => c.treeId === treeId)), [cases, treeId]);
  const open = mine.filter(isOpen);
  const solved = mine.filter((c) => !isOpen(c));
  if (!open.length && !solved.length) return null;
  return (
    <section className="space-y-2" aria-labelledby="tp-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tp-h" className="text-sm font-bold text-slate-900">
          {t('case.tree.title')} {open.length > 0 && <span className="text-slate-500 font-medium tabular">{open.length}</span>}
        </h2>
        {solved.length > 0 && (
          <button type="button" onClick={() => setShowSolved((v) => !v)} className="text-xs font-semibold text-emerald-700 hover:underline min-h-8">
            {showSolved ? t('case.solved.hide') : t('case.solved.show', { n: solved.length })}
          </button>
        )}
      </div>
      {open.length === 0 && (
        <p className="text-sm text-slate-600 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {t('case.tree.none')}
        </p>
      )}
      {open.map((c) => (
        <CaseRow key={c.id} c={c} />
      ))}
      {showSolved && solved.map((c) => <CaseRow key={c.id} c={c} />)}
    </section>
  );
};

/** On a report page: the problems this report touched, and the tree's other open ones. */
export const ReportProblems: React.FC<{ treeId: string; reportId: string; caseIds?: string[] }> = ({ treeId, reportId, caseIds }) => {
  const { t, lang } = useT();
  const { cases } = useFarm();
  const touched = useMemo(() => cases.filter((c) => caseIds?.includes(c.id) || c.events.some((e) => e.reportId === reportId)), [cases, caseIds, reportId]);
  const others = useMemo(() => sortCases(cases.filter((c) => c.treeId === treeId && isOpen(c) && !touched.includes(c))), [cases, treeId, touched]);
  if (!touched.length && !others.length) return null;
  const here = (c: ProblemCase) => {
    const e = c.events.find((x) => x.reportId === reportId);
    if (!e) return undefined;
    const what = e.type === 'treated' && e.action && isAction(e.action) ? ACTION_INFO[e.action].label[lang] : CASE_EVENT_INFO[e.type].label[lang];
    return t('case.here', { what });
  };
  return (
    <section className="space-y-2" aria-labelledby="rp-h">
      <h2 id="rp-h" className="text-sm font-bold text-slate-900">{t('case.report.title')}</h2>
      {touched.map((c) => (
        <CaseRow key={c.id} c={c} note={here(c)} />
      ))}
      {others.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-500 pt-1">{t('case.report.others', { id: treeId })}</p>
          {others.map((c) => (
            <CaseRow key={c.id} c={c} />
          ))}
        </>
      )}
    </section>
  );
};

type ProblemFilter = 'open' | 'due' | 'solved';

/** Problems: every problem on the farm, the most urgent first. */
export const ProblemsPage: React.FC = () => {
  const { t } = useT();
  const { cases, blocks } = useFarm();
  const [params, setParams] = useQueryParams();
  const filter: ProblemFilter = params.get('show') === 'due' ? 'due' : params.get('show') === 'solved' ? 'solved' : 'open';
  const block = params.get('block') || '';
  const today = todayStr();

  const inBlock = useMemo(() => cases.filter((c) => !block || c.block === block || (!c.block && c.treeId.startsWith(block))), [cases, block]);
  const solvedRecently = (c: ProblemCase) => !isOpen(c) && !!c.closedOn && diffDays(today, c.closedOn) <= 90;
  const counts = {
    open: inBlock.filter(isOpen).length,
    due: inBlock.filter((c) => isDue(c, today)).length,
    solved: inBlock.filter(solvedRecently).length,
  };
  const list = useMemo(() => {
    const keep = filter === 'due' ? (c: ProblemCase) => isDue(c, today) : filter === 'solved' ? solvedRecently : isOpen;
    return sortCases(inBlock.filter(keep), today);
  }, [inBlock, filter, today]);

  const chip = (id: ProblemFilter, label: string, n: number) => {
    const on = filter === id;
    return (
      <button
        key={id}
        type="button"
        aria-pressed={on}
        onClick={() => setParams({ show: id === 'open' ? null : id })}
        className={`min-h-10 px-3.5 rounded-full border text-sm font-semibold inline-flex items-center gap-2 ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
      >
        {label}
        <span className={`tabular text-xs ${on ? 'text-slate-300' : id === 'due' && n > 0 ? 'text-rose-700 font-bold' : 'text-slate-500'}`}>{n}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.problems')} description={t('rep.desc.problems')} />
      <div className="flex flex-wrap items-center gap-2">
        {chip('open', t('case.f.open'), counts.open)}
        {chip('due', t('case.f.due'), counts.due)}
        {chip('solved', t('case.f.solved'), counts.solved)}
        {blocks.length > 1 && (
          <select
            value={block}
            onChange={(e) => setParams({ block: e.target.value || null })}
            aria-label={t('common.block')}
            className="min-h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm ml-auto"
          >
            <option value="">{t('common.allBlocks')}</option>
            {blocks.map((b) => (
              <option key={b} value={b}>
                {t('common.blockN', { n: b })}
              </option>
            ))}
          </select>
        )}
      </div>
      {list.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-800">{filter === 'solved' ? t('case.empty.solved') : t('case.empty.open')}</p>
          <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">{t('case.empty.how')}</p>
        </div>
      ) : (
        <ProblemsByTree cases={list} />
      )}
    </div>
  );
};
