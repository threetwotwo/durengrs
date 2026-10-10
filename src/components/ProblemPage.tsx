import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, parseReportDoc } from '../lib/firebase';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { goBack, navigate, treeUrl } from '../lib/router';
import { caseTitle, isOpen, lastActionLabel, sortCases } from '../lib/cases';
import { cachedReport, rememberReport } from '../lib/reportCache';
import { ACTION_INFO, CASE_EVENT_INFO, ISSUE_INFO, isAction, isIssue } from '../shared';
import { formatShortDate } from '../lib/treatments';
import type { CaseEvent, TreeReport } from '../types';
import type { TagTone } from '../lib/feed';
import { Link } from './Link';
import { CaseActions, CaseRow, CaseStatusPill, NextCheck } from './Problems';
import { HistoryItem, PhotoGrid, reportEntry } from './Record';

const EVENT_TONE: Record<CaseEvent['type'], TagTone> = {
  seen: 'yellow',
  treated: 'work',
  checked: 'plain',
  improving: 'green',
  worse: 'red',
  resolved: 'green',
  reopened: 'yellow',
};

/**
 * One problem on one tree, from the first report that showed it until it is solved: where it stands, the latest
 * photo, every step with the photos of its report, and the buttons to close, reopen or delete it.
 */
export const ProblemPage: React.FC<{ caseId: string }> = ({ caseId }) => {
  const { t, lang } = useT();
  const { cases, allTrees, loading } = useFarm();
  const c = cases.find((x) => x.id === caseId);
  const tree = c ? allTrees.find((x) => x.id === c.treeId) : undefined;

  // A deep link on a slow signal: the problems arrive after the trees, so wait a moment before saying it is gone.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  // The reports of its steps (a problem has a handful), read once each.
  const ids = useMemo(() => [...new Set((c?.events || []).map((e) => e.reportId).filter((x): x is string => !!x))], [c?.events]);
  const [reports, setReports] = useState<Map<string, TreeReport>>(() => new Map(ids.map((id) => [id, cachedReport(id)]).filter((x): x is [string, TreeReport] => !!x[1])));
  useEffect(() => {
    let cancelled = false;
    const missing = ids.filter((id) => !reports.has(id));
    if (!missing.length) return;
    Promise.all(
      missing.map((id) =>
        getDoc(doc(db, 'reports', id))
          .then((s) => (s.exists() ? parseReportDoc(s) : null))
          .catch(() => null)
      )
    ).then((list) => {
      if (cancelled) return;
      setReports((prev) => {
        const next = new Map(prev);
        for (const r of list) if (r) next.set(r.id, (rememberReport(r), r));
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ids.join(',')]);

  if (!c) {
    if (loading || !settled) return <div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" />;
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-3">
        <p className="text-sm text-slate-700">{t('case.page.missing')}</p>
        <Link to="/problems" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline">
          <ArrowLeft className="w-4 h-4" />
          {t('case.page.all')}
        </Link>
      </div>
    );
  }

  const latestPhoto = [...c.events]
    .reverse()
    .map((e) => (e.reportId ? reports.get(e.reportId) : undefined))
    .find((r) => r && r.photos && r.photos.length);
  const fullName = c.name && c.name !== caseTitle(c, lang) ? c.name : '';
  const others = sortCases(cases.filter((x) => x.treeId === c.treeId && x.id !== c.id && isOpen(x)));
  const lastAction = lastActionLabel(c, lang);
  const steps = [...c.events].reverse(); // newest first

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => goBack('/problems')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 min-h-9">
        <ArrowLeft className="w-4 h-4" />
        {t('case.page.all')}
      </button>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
        <article className={`min-w-0 lg:col-span-7 bg-white rounded-xl border overflow-hidden ${c.status === 'worse' ? 'border-rose-300' : 'border-slate-200'}`}>
          {latestPhoto && <PhotoGrid photos={latestPhoto.photos!} caption={`${c.treeId}: ${caseTitle(c, lang)}`} eager className="aspect-[4/3]" />}
          <div className="p-4 sm:p-5 space-y-3">
            <header className="space-y-1">
              <p className="text-sm text-slate-600">
                <Link to={treeUrl(c.treeId)} className="font-mono font-bold text-slate-900 hover:text-emerald-700 hover:underline">
                  {c.treeId}
                </Link>
                {tree?.block && <span className="ml-2">{t('common.blockN', { n: tree.block })}</span>}
              </p>
              <h1 className="text-xl font-bold text-slate-900 flex flex-wrap items-center gap-2">
                {caseTitle(c, lang)}
                <CaseStatusPill status={c.status} />
              </h1>
              {fullName && <p className="text-sm text-slate-600">{fullName}</p>}
            </header>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">{t('case.page.since')}</dt>
                <dd className="font-semibold text-slate-900 tabular">{formatShortDate(c.openedOn)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{t('case.page.next')}</dt>
                <dd>{isOpen(c) ? <NextCheck c={c} /> : <span className="font-semibold text-slate-900 tabular">{c.closedOn ? t('case.closedOn', { date: formatShortDate(c.closedOn) }) : '—'}</span>}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">{t('case.page.lastDone')}</dt>
                <dd className="font-semibold text-slate-900">{lastAction || t('case.page.nothingDone')}</dd>
              </div>
            </dl>
            {isIssue(c.issue) && isOpen(c) && <p className="text-sm text-slate-700">{ISSUE_INFO[c.issue].nextStep[lang]}</p>}
            <div className="pt-3 border-t border-slate-100">
              <CaseActions c={c} onDeleted={() => navigate('/problems', { replace: true })} />
            </div>
          </div>
        </article>

        <section className="min-w-0 lg:col-span-5 bg-white rounded-xl border border-slate-200 p-4 space-y-3" aria-labelledby="pp-hist">
          <h2 id="pp-hist" className="text-sm font-bold text-slate-900">
            {t('case.page.history')} <span className="font-medium text-slate-500 tabular">{c.events.length}</span>
          </h2>
          <ol>
            {steps.map((e, i) => {
              const r = e.reportId ? reports.get(e.reportId) : undefined;
              const what = e.type === 'treated' && e.action && isAction(e.action) ? ACTION_INFO[e.action].label[lang] : CASE_EVENT_INFO[e.type].label[lang];
              return (
                <HistoryItem
                  key={`${e.reportId || 'app'}-${e.type}-${i}`}
                  entry={r ? reportEntry(r) : undefined}
                  date={e.date}
                  title={`${what}${e.product ? `: ${e.product}` : ''}`}
                  note={e.note || (!e.reportId && e.by ? t('case.byHand', { by: e.by }) : undefined)}
                  tone={EVENT_TONE[e.type]}
                  plain
                  last={i === steps.length - 1}
                />
              );
            })}
          </ol>
        </section>
      </div>

      {others.length > 0 && (
        <section className="space-y-2" aria-labelledby="pp-others">
          <h2 id="pp-others" className="text-sm font-bold text-slate-900">{t('case.report.others', { id: c.treeId })}</h2>
          <div className="grid gap-2 lg:grid-cols-2">
            {others.map((x) => (
              <CaseRow key={x.id} c={x} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
