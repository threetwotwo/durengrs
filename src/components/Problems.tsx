import React, { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronDown, CircleDot, RotateCcw, Stethoscope, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { ACTION_INFO, CASE_EVENT_INFO, CASE_STATUS_INFO, isAction, type CaseStatus } from '../shared';
import { caseTitle, deleteCase, isDue, isOpen, lastActionLabel, setCaseStatus, sortCases } from '../lib/cases';
import { diffDays, formatShortDate, todayStr } from '../lib/treatments';
import { reportUrl, treeUrl, useQueryParams } from '../lib/router';
import type { CaseEvent, ProblemCase } from '../types';
import { Link } from './Link';

/**
 * Problems on trees, followed from first sighting to solved. One card per problem, with its history (every report
 * that saw, treated or re-checked it), the next photo check, and buttons to close or reopen it by hand.
 * Used on the Reports page (Problems), the tree page and the report page.
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

const EVENT_ICON: Record<CaseEvent['type'], React.ComponentType<{ className?: string }>> = {
  seen: CircleDot,
  treated: Stethoscope,
  checked: CircleDot,
  improving: TrendingUp,
  worse: TrendingDown,
  resolved: CheckCircle2,
  reopened: RotateCcw,
};
const EVENT_CLS: Record<CaseEvent['type'], string> = {
  seen: 'text-amber-600 bg-amber-50',
  treated: 'text-sky-700 bg-sky-50',
  checked: 'text-slate-500 bg-slate-100',
  improving: 'text-emerald-700 bg-emerald-50',
  worse: 'text-rose-700 bg-rose-50',
  resolved: 'text-emerald-700 bg-emerald-50',
  reopened: 'text-amber-700 bg-amber-50',
};

/** Every step of one problem, oldest first, each linked to the report it came from. */
export const CaseTimeline: React.FC<{ c: ProblemCase; currentReportId?: string }> = ({ c, currentReportId }) => {
  const { t, lang } = useT();
  return (
    <ol className="relative space-y-3 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
      {c.events.map((e, i) => {
        const Icon = EVENT_ICON[e.type];
        const what = e.type === 'treated' && e.action && isAction(e.action) ? ACTION_INFO[e.action].label[lang] : CASE_EVENT_INFO[e.type].label[lang];
        const here = !!currentReportId && e.reportId === currentReportId;
        return (
          <li key={`${e.reportId || 'web'}-${e.type}-${i}`} className="relative flex gap-3">
            <span className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${EVENT_CLS[e.type]}`}>
              <Icon className="w-4 h-4" />
            </span>
            <span className="min-w-0 pt-0.5 text-sm">
              <span className="font-semibold text-slate-900">{what}</span>
              {e.product && <span className="text-slate-700"> · {e.product}</span>}
              <span className="text-slate-500 tabular"> · {formatShortDate(e.date)}</span>
              {e.note && <span className="block text-xs text-slate-600">{e.note}</span>}
              {e.reportId &&
                (here ? (
                  <span className="block text-xs font-semibold text-slate-500">{t('case.thisReport')}</span>
                ) : (
                  <Link to={reportUrl(e.reportId)} className="block text-xs font-semibold text-emerald-700 hover:underline">
                    {t('case.openReport')}
                  </Link>
                ))}
              {!e.reportId && e.by && <span className="block text-xs text-slate-500">{t('case.byHand', { by: e.by })}</span>}
            </span>
          </li>
        );
      })}
    </ol>
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

const readBy = () => {
  try {
    return localStorage.getItem('cilowong.by') || '';
  } catch {
    return '';
  }
};

/**
 * One problem: what it is, where it stands, when to check again, and (opened) its history and the owner's buttons.
 * `showTree` = a farm-wide list (tree ID shown and linked).
 */
export const CaseCard: React.FC<{ c: ProblemCase; showTree?: boolean; defaultOpen?: boolean; currentReportId?: string }> = ({
  c,
  showTree,
  defaultOpen,
  currentReportId,
}) => {
  const { t, lang } = useT();
  const [open, setOpen] = useState(!!defaultOpen);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const due = isDue(c);
  const last = c.events[c.events.length - 1];
  const lastAction = lastActionLabel(c, lang);

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

  const border = c.status === 'worse' || due ? 'border-rose-300' : c.status === 'resolved' ? 'border-slate-200 bg-slate-50/60' : 'border-slate-200';
  return (
    <article className={`bg-white rounded-xl border ${border}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full p-3.5 flex items-start gap-3 text-left rounded-xl hover:bg-slate-50/70 focus-visible:outline-2 focus-visible:outline-emerald-500"
      >
        {showTree && (
          <span className="text-sm font-bold font-mono text-slate-900 bg-slate-100 px-2 py-1 rounded shrink-0 min-w-12 text-center">{c.treeId}</span>
        )}
        <span className="min-w-0 flex-1 space-y-1">
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
          {!open && last?.note && <span className="block text-xs text-slate-500 line-clamp-1">{last.note}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 mt-1 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-slate-100 pt-3">
          <CaseTimeline c={c} currentReportId={currentReportId} />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {showTree && (
              <Link to={treeUrl(c.treeId)} className="min-h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center">
                {t('case.openTree', { id: c.treeId })}
              </Link>
            )}
            {isOpen(c) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setCaseStatus(c, 'resolved', undefined, readBy()))}
                className="min-h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t('case.markSolved')}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setCaseStatus(c, 'open', undefined, readBy()))}
                className="min-h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <RotateCcw className="w-4 h-4" />
                {t('case.reopen')}
              </button>
            )}
            {confirmDelete ? (
              <span className="inline-flex flex-wrap items-center gap-2 text-xs text-slate-700">
                {t('case.delete.confirm')}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => deleteCase(c))}
                  className="min-h-9 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-60"
                >
                  {t('case.delete.yes')}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-9 px-2 font-semibold text-slate-600">
                  {t('common.cancel')}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="min-h-9 px-2.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                {t('case.delete')}
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-xs text-rose-700">
              {error}
            </p>
          )}
        </div>
      )}
    </article>
  );
};

/** The tree's problems: open ones first (opened), solved ones behind a toggle. */
export const TreeProblems: React.FC<{ treeId: string }> = ({ treeId }) => {
  const { t } = useT();
  const { cases } = useFarm();
  const [showSolved, setShowSolved] = useState(false);
  const mine = useMemo(() => sortCases(cases.filter((c) => c.treeId === treeId)), [cases, treeId]);
  const open = mine.filter(isOpen);
  const solved = mine.filter((c) => !isOpen(c));
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3" aria-labelledby="tp-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tp-h" className="text-sm font-bold text-slate-900">
          {t('case.tree.title')} {open.length > 0 && <span className="text-slate-500 font-medium tabular">({open.length})</span>}
        </h2>
        {solved.length > 0 && (
          <button type="button" onClick={() => setShowSolved((v) => !v)} className="text-xs font-semibold text-emerald-700 hover:underline min-h-8">
            {showSolved ? t('case.solved.hide') : t('case.solved.show', { n: solved.length })}
          </button>
        )}
      </div>
      {open.length === 0 ? (
        <p className="text-sm text-slate-600 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {t('case.tree.none')}
        </p>
      ) : (
        <div className="space-y-2">
          {open.map((c, i) => (
            <CaseCard key={c.id} c={c} defaultOpen={i === 0} />
          ))}
        </div>
      )}
      {showSolved && (
        <div className="space-y-2">
          {solved.map((c) => (
            <CaseCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </section>
  );
};

/** On a report page: the problems this report touched (opened), and the tree's other open ones. */
export const ReportProblems: React.FC<{ treeId: string; reportId: string; caseIds?: string[] }> = ({ treeId, reportId, caseIds }) => {
  const { t } = useT();
  const { cases } = useFarm();
  const touched = useMemo(() => cases.filter((c) => caseIds?.includes(c.id) || c.events.some((e) => e.reportId === reportId)), [cases, caseIds, reportId]);
  const others = useMemo(() => sortCases(cases.filter((c) => c.treeId === treeId && isOpen(c) && !touched.includes(c))), [cases, treeId, touched]);
  if (!touched.length && !others.length) return null;
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3" aria-labelledby="rp-h">
      <h2 id="rp-h" className="text-sm font-bold text-slate-900">{t('case.report.title')}</h2>
      {touched.map((c) => (
        <CaseCard key={c.id} c={c} defaultOpen currentReportId={reportId} />
      ))}
      {others.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 pt-1">{t('case.report.others', { id: treeId })}</p>
          {others.map((c) => (
            <CaseCard key={c.id} c={c} currentReportId={reportId} />
          ))}
        </>
      )}
    </section>
  );
};

type ProblemFilter = 'open' | 'due' | 'solved';

/** Reports › Problems: every problem on the farm, the most urgent first. */
export const ProblemsView: React.FC = () => {
  const { t } = useT();
  const { cases, blocks } = useFarm();
  const [params, setParams] = useQueryParams();
  const filter: ProblemFilter = params.get('show') === 'due' ? 'due' : params.get('show') === 'solved' ? 'solved' : 'open';
  const block = params.get('block') || '';
  const today = todayStr();

  const inBlock = useMemo(() => cases.filter((c) => !block || c.block === block || (!c.block && c.treeId.startsWith(block))), [cases, block]);
  const counts = {
    open: inBlock.filter(isOpen).length,
    due: inBlock.filter((c) => isDue(c, today)).length,
    solved: inBlock.filter((c) => !isOpen(c) && c.closedOn && diffDays(today, c.closedOn) <= 90).length,
  };
  const list = useMemo(() => {
    const keep =
      filter === 'due' ? (c: typeof cases[number]) => isDue(c, today) : filter === 'solved' ? (c: typeof cases[number]) => !isOpen(c) && !!c.closedOn && diffDays(today, c.closedOn) <= 90 : isOpen;
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
    <div className="space-y-3">
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
        <div className="space-y-2">
          {list.map((c) => (
            <CaseCard key={c.id} c={c} showTree />
          ))}
        </div>
      )}
    </div>
  );
};
