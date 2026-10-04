import React, { useState, useMemo, useEffect } from 'react';
import { useFarm, normalizeTimestamp } from '../context/FarmContext';
import { ConditionBadge } from './ConditionBadge';
import { ReportCard } from './ReportCard';
import { Link } from './Link';
import { treeUrl, treesUrl } from '../lib/router';
import { followUpOf, waitingLabel } from '../lib/insights';
import { TaskRow } from './TaskRow';
import { MarkDoneSheet, UndoToast, undoLogged, useUndoToast } from './TreatmentSheets';
import { ScheduleTask, formatShortDate, relativeDue } from '../lib/treatments';
import { useT } from '../i18n';
import { DashboardSeasonCard, StagePill, TOPIC_ICON, topicUrl, useGuideData } from './GuideWidgets';
import { RainCard, WeeklyReview } from './FieldRecords';
import { STAGES, TOPIC_BY_ID, pick, topicsForText } from '../lib/guide';
import { TreeReport } from '../types';
import { db, parseReportDoc } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { Check, AlertTriangle, AlertOctagon, ArrowRight, ArrowUpDown, Calendar, CalendarCheck, ClipboardCheck } from 'lucide-react';

/**
 * Daily view: what needs doing today to keep the trees in ideal condition.
 *   1. KPIs: emergencies, watch list, routine work due, Guide farm check
 *   2. Trees needing attention (with the Guide topic their notes point to) + routine work
 *   3. This season per block (Guide stages, one-tap bloom dates and season tasks)
 *   4. Blocks (health, stage, harvest window, fruit, inspection coverage) + rain
 *   5. Latest field reports (compact; photos live on the Reports page)
 */

type BlockSort = 'block' | 'total' | 'attention' | 'fruits';
const WEEK = 7 * 24 * 60 * 60 * 1000;

export const Dashboard: React.FC = () => {
  const { trees, totalReportsCount, loading: treesLoading, plans, scheduleTasks, recordsError } = useFarm();
  const { t, locale, lang } = useT();
  const { seasons, checks } = useGuideData();
  const [doneTask, setDoneTask] = useState<ScheduleTask | null>(null);
  const { toast, show: showToast, clear: clearToast } = useUndoToast();
  const [latestReports, setLatestReports] = useState<TreeReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [sort, setSort] = useState<{ field: BlockSort; asc: boolean }>({ field: 'block', asc: true });

  // Six newest reports, live. Small: the Reports page has the full feed with photos.
  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(6));
    return onSnapshot(
      q,
      (snapshot) => {
        setLatestReports(snapshot.docs.map(parseReportDoc));
        setReportsLoading(false);
      },
      (err) => {
        console.error('Failed to stream latest reports:', err);
        setReportsLoading(false);
      }
    );
  }, []);

  const treeById = useMemo(() => new Map(trees.map((tr) => [tr.id, tr])), [trees]);

  // One pass over the trees for every count on this page.
  const { counts, blockStats } = useMemo(() => {
    const weekAgo = Date.now() - WEEK;
    const c = { healthy: 0, minor: 0, emergency: 0, notAssessed: 0, reported7d: 0, total: trees.length };
    const blocks = new Map<string, { block: string; total: number; healthy: number; minor: number; emergency: number; notAssessed: number; fruits: number; reported7d: number }>();
    for (const tr of trees) {
      const key = tr.condition === 'healthy' ? 'healthy' : tr.condition === 'minor' ? 'minor' : tr.condition === 'emergency' ? 'emergency' : 'notAssessed';
      c[key]++;
      const recent = normalizeTimestamp(tr.lastReportAt) >= weekAgo;
      if (recent) c.reported7d++;
      const b = tr.block || '—';
      const row = blocks.get(b) || { block: b, total: 0, healthy: 0, minor: 0, emergency: 0, notAssessed: 0, fruits: 0, reported7d: 0 };
      row.total++;
      row[key]++;
      row.fruits += tr.estimatedFruitCount || 0;
      if (recent) row.reported7d++;
      blocks.set(b, row);
    }
    return { counts: c, blockStats: Array.from(blocks.values()) };
  }, [trees]);

  const seasonByBlock = useMemo(() => new Map(seasons.map((s) => [s.block, s])), [seasons]);
  const sortedBlocks = useMemo(() => {
    const val = (r: (typeof blockStats)[number]) =>
      sort.field === 'attention' ? r.emergency * 1000 + r.minor : sort.field === 'block' ? 0 : r[sort.field];
    return [...blockStats].sort((a, b) => {
      const d = sort.field === 'block' ? a.block.localeCompare(b.block, undefined, { numeric: true }) : val(a) - val(b);
      return sort.asc ? d : -d;
    });
  }, [blockStats, sort]);
  const sortBy = (field: BlockSort) =>
    setSort((s) => (s.field === field ? { field, asc: !s.asc } : { field, asc: field === 'block' }));

  const dueSoon = useMemo(() => scheduleTasks.filter((x) => x.status !== 'upcoming'), [scheduleTasks]);
  const overdueCount = dueSoon.filter((x) => x.status === 'overdue').length;
  const nextTask = scheduleTasks.find((x) => x.status === 'upcoming');
  const checkGaps = checks.filter((c) => c.status === 'gap').length;
  const checkWarn = checks.filter((c) => c.status === 'warn').length;

  // Needs attention: trees overdue for a re-check first (emergency before minor, longest wait first).
  const attentionItems = useMemo(() => {
    const now = Date.now();
    const items = trees
      .filter((tr) => tr.condition === 'emergency' || tr.condition === 'minor')
      .map((tree) => ({ tree, fu: followUpOf(tree, normalizeTimestamp(tree.lastReportAt), now), topics: topicsForText(tree.conditionNotes).slice(0, 2) }));
    items.sort((a, b) => {
      if (a.fu.needs !== b.fu.needs) return a.fu.needs ? -1 : 1;
      if (a.tree.condition !== b.tree.condition) return a.tree.condition === 'emergency' ? -1 : 1;
      return (b.fu.waitingDays ?? 9999) - (a.fu.waitingDays ?? 9999);
    });
    return items;
  }, [trees]);
  const followUpCount = attentionItems.filter((i) => i.fu.needs).length;

  const hour = new Date().getHours();
  const greeting = t(
    hour < 11 ? 'dash.greet.morning' : hour < 15 ? 'dash.greet.noon' : hour < 17 ? 'dash.greet.afternoon' : hour < 18 ? 'dash.greet.late' : 'dash.greet.evening'
  );
  const todayLabel = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const urgent = counts.emergency + overdueCount + checkGaps;

  if (treesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 p-4 animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-white rounded-xl border border-slate-200 animate-pulse" />
      </div>
    );
  }

  const tile = 'text-left p-4 rounded-xl border bg-white shadow-xs hover:shadow-sm transition-shadow focus-visible:outline-2 focus-visible:outline-emerald-500 block';
  const th = 'py-2.5 px-3 font-semibold';
  const sortTh = (field: BlockSort, label: string, align = 'text-right') => (
    <th className={`${th} ${align}`} aria-sort={sort.field === field ? (sort.asc ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => sortBy(field)} className={`inline-flex items-center gap-1 ${align === 'text-right' ? 'flex-row-reverse' : ''}`}>
        <ArrowUpDown className="w-3 h-3 text-slate-400" />
        <span>{label}</span>
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* Today: the question this screen answers */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">{greeting}</h1>
        <p className="text-sm text-slate-600">
          {todayLabel} · {urgent === 0 ? t('dash.nothingUrgent') : t(urgent === 1 ? 'dash.attention.one' : 'dash.attention.other', { n: urgent })}
        </p>
      </div>

      {recordsError && (
        <p role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {recordsError}
        </p>
      )}

      {/* KPIs. Hue is reserved for status. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Link to={treesUrl({ condition: 'emergency' })} className={`${tile} ${counts.emergency > 0 ? 'border-rose-300' : 'border-slate-200'}`}>
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <AlertOctagon className={`w-4 h-4 ${counts.emergency > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
            {t('cond.emergency')}
          </span>
          <span className={`block mt-2 text-3xl font-bold tabular ${counts.emergency > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{counts.emergency}</span>
          <span className="block text-xs text-slate-600 mt-0.5">{counts.emergency === 0 ? t('dash.kpi.emergency.none') : t('dash.kpi.emergency.some')}</span>
        </Link>

        <Link to={treesUrl({ condition: 'minor' })} className={`${tile} border-slate-200`}>
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <AlertTriangle className={`w-4 h-4 ${counts.minor > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
            {t('dash.kpi.watch')}
          </span>
          <span className="block mt-2 text-3xl font-bold tabular text-slate-900">{counts.minor}</span>
          <span className="block text-xs text-slate-600 mt-0.5">{t('dash.kpi.watch.sub')}</span>
        </Link>

        <Link to="/schedule" className={`${tile} ${overdueCount > 0 ? 'border-rose-300' : 'border-slate-200'}`}>
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <CalendarCheck className={`w-4 h-4 ${overdueCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
            {t('dash.kpi.routine')}
          </span>
          <span className={`block mt-2 text-3xl font-bold tabular ${overdueCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{dueSoon.length}</span>
          <span className="block text-xs text-slate-600 mt-0.5 tabular">
            {overdueCount > 0 ? t('dash.kpi.routine.overdue', { n: overdueCount }) : t('dash.kpi.routine.sub')}
          </span>
        </Link>

        {/* The Guide's farm check: best practice vs this farm. Opening it weekly is the A7 habit. */}
        <div className={`${tile} ${checkGaps > 0 ? 'border-rose-300' : 'border-slate-200'}`}>
          <Link to="/guide" className="block">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <ClipboardCheck className={`w-4 h-4 ${checkGaps > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
              {t('dash.kpi.check')}
            </span>
            <span className={`block mt-2 text-3xl font-bold tabular ${checkGaps > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{checkGaps}</span>
            <span className="block text-xs text-slate-600 mt-0.5 tabular">{t('dash.kpi.check.sub', { warn: checkWarn })}</span>
          </Link>
          <span className="block mt-1.5">
            <WeeklyReview compact />
          </span>
        </div>
      </div>

      {/* Attention (trees) + Routine work (schedule) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden" aria-labelledby="att-h">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <h2 id="att-h" className="text-sm font-bold text-slate-900">
              {t('dash.att.title')} <span className="text-slate-500 font-medium tabular">({attentionItems.length})</span>
              {followUpCount > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                  {t('dash.att.overdue', { n: followUpCount })}
                </span>
              )}
            </h2>
            {attentionItems.length > 6 && (
              <Link
                to={followUpCount > 0 ? treesUrl({ followup: '1' }) : treesUrl({ condition: counts.emergency > 0 ? 'emergency' : 'minor' })}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 min-h-8"
              >
                {t('dash.att.viewAll', { n: followUpCount > 0 ? followUpCount : attentionItems.length })}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
          {attentionItems.length === 0 ? (
            <div className="p-8 text-center">
              <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800">{t('dash.att.clear')}</p>
              <p className="text-xs text-slate-600 mt-0.5">{t('dash.att.clear.sub')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {attentionItems.slice(0, 6).map(({ tree, fu, topics }) => (
                <li key={tree.id} className="p-3.5 hover:bg-slate-50 flex items-start justify-between gap-3">
                  <Link to={treeUrl(tree.id)} className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-sm font-bold font-mono text-slate-900 bg-slate-100 px-2 py-1 rounded shrink-0 min-w-12 text-center">{tree.id}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">
                        {tree.variant} · {t('common.blockN', { n: tree.block || '—' })}
                      </span>
                      <span className="block text-xs text-slate-600 truncate">{tree.conditionNotes || tree.notes || t('dash.att.noNotes')}</span>
                    </span>
                  </Link>
                  <span className="flex flex-col items-end gap-1 shrink-0">
                    <ConditionBadge condition={tree.condition} size="sm" />
                    <span className={`text-xs tabular ${fu.needs ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>{waitingLabel(fu)}</span>
                    {/* What the notes point to in the Guide (e.g. "getah" -> Phytophthora). */}
                    {topics.map((id) => {
                      const Icon = TOPIC_ICON[id];
                      return (
                        <Link key={id} to={topicUrl(id)} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                          <Icon className="w-3.5 h-3.5" />
                          {pick(TOPIC_BY_ID.get(id)!.title, lang)}
                        </Link>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden" aria-labelledby="wk-h">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <h2 id="wk-h" className="text-sm font-bold text-slate-900">{t('dash.wk.title')}</h2>
            <Link to="/schedule" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 min-h-8">
              {t('dash.wk.open')}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {plans.length === 0 ? (
            <div className="p-6 text-center">
              <CalendarCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800">{t('dash.wk.empty')}</p>
              <p className="text-xs text-slate-600 mt-0.5 mb-3">{t('dash.wk.empty.sub')}</p>
              <Link to="/schedule?view=routines" className="inline-flex items-center min-h-11 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">
                {t('dash.wk.setup')}
              </Link>
            </div>
          ) : dueSoon.length === 0 ? (
            <div className="p-6 text-center">
              <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800">{t('dash.wk.none')}</p>
              {nextTask && (
                <p className="text-xs text-slate-600 mt-0.5">{t('dash.wk.next', { name: nextTask.plan.name, when: relativeDue(nextTask.days).toLowerCase() })}</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {dueSoon.slice(0, 5).map((task) => (
                <TaskRow key={task.plan.id} task={task} compact onDone={setDoneTask} seasons={seasons} />
              ))}
              {dueSoon.length > 5 && (
                <Link to="/schedule" className="block w-full p-3 text-center text-xs font-semibold text-emerald-700 hover:bg-slate-50 min-h-11">
                  {t('dash.wk.more', { n: dueSoon.length - 5 })}
                </Link>
              )}
            </div>
          )}
        </section>
      </div>

      {/* This season per block: Guide stages, one-tap bloom dates and season tasks */}
      <DashboardSeasonCard />

      {doneTask && (
        <MarkDoneSheet task={doneTask} onClose={() => setDoneTask(null)} onSaved={(id, message) => showToast({ message, undo: () => undoLogged(id) })} />
      )}
      <UndoToast toast={toast} onClear={clearToast} />

      {/* Blocks (health + season + harvest + coverage in one table) and rain */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden" aria-labelledby="blk-h">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 id="blk-h" className="text-sm font-bold text-slate-900">{t('dash.blocks.title')}</h2>
              <p className="text-xs text-slate-600 mt-0.5">{t('dash.blocks.sub')}</p>
            </div>
            <span className="text-xs text-slate-600 tabular">
              {t('dash.health.total', { n: counts.total })} · {t('dash.blocks.coverage', { a: counts.reported7d, b: counts.total })}
            </span>
          </div>
          <div className="px-4 pt-3">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100" role="img" aria-label={t('dash.health.aria', { h: counts.healthy, m: counts.minor, e: counts.emergency, n: counts.notAssessed })}>
              {[
                { n: counts.healthy, cls: 'bg-emerald-500' },
                { n: counts.minor, cls: 'bg-amber-400' },
                { n: counts.emergency, cls: 'bg-rose-500' },
                { n: counts.notAssessed, cls: 'bg-slate-300' },
              ].map((s, i) => (s.n > 0 ? <div key={i} className={s.cls} style={{ width: `${(s.n / Math.max(counts.total, 1)) * 100}%` }} /> : null))}
            </div>
            <p className="mt-1.5 text-xs text-slate-600 tabular flex flex-wrap gap-x-3">
              <Link to={treesUrl({ condition: 'healthy' })} className="hover:underline">{t('cond.healthy')} {counts.healthy}</Link>
              <Link to={treesUrl({ condition: 'minor' })} className="hover:underline">{t('dash.health.minor')} {counts.minor}</Link>
              <Link to={treesUrl({ condition: 'emergency' })} className="hover:underline">{t('cond.emergency')} {counts.emergency}</Link>
              <Link to={treesUrl({ condition: 'not_assessed' })} className="hover:underline">{t('cond.not_assessed')} {counts.notAssessed}</Link>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs mt-2">
              <thead className="bg-slate-50 text-slate-700 border-y border-slate-200 uppercase tracking-wide">
                <tr>
                  {sortTh('block', t('common.block'), 'text-left')}
                  {sortTh('total', t('common.trees'))}
                  {sortTh('attention', t('dash.col.health'))}
                  <th className={th}>{t('dash.col.season')}</th>
                  <th className={th}>{t('dash.col.harvest')}</th>
                  {sortTh('fruits', t('dash.col.fruits'))}
                  <th className={`${th} text-right`}>{t('dash.col.checked')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedBlocks.map((row) => {
                  const s = seasonByBlock.get(row.block);
                  const pct = row.total ? Math.round((row.reported7d / row.total) * 100) : 0;
                  return (
                    <tr key={row.block} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        <Link to={treesUrl({ block: row.block })} className="hover:underline">{t('common.blockN', { n: row.block })}</Link>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular font-semibold text-slate-800">{row.total}</td>
                      <td className="py-2.5 px-3 text-right tabular">
                        {row.emergency > 0 && <span className="text-rose-700 font-bold">{row.emergency} {t('dash.col.emergShort')} </span>}
                        {row.minor > 0 && <span className="text-amber-700 font-semibold">{row.minor} {t('dash.col.minorShort')} </span>}
                        {row.emergency + row.minor === 0 &&
                          (row.notAssessed > 0 ? (
                            <span className="text-slate-500">{t('dash.col.notAssessedN', { n: row.notAssessed })}</span>
                          ) : (
                            <span className="text-emerald-700">{t('dash.col.allHealthy')}</span>
                          ))}
                      </td>
                      <td className="py-2.5 px-3">
                        {s?.floweredOn ? (
                          <Link to="/guide" className="inline-flex flex-wrap items-center gap-1.5">
                            {/* Every stage the block's trees are in: trees and branches can flower apart. */}
                            {(s.stages.length ? s.stages : [s.stage]).map((st) => (
                              <StagePill key={st} stage={st} />
                            ))}
                            {s.stages.some((st) => st !== 'preflower') && s.dayMax !== undefined && s.dayMin !== undefined && (
                              <span className="text-slate-500 tabular">
                                {s.dayMax === s.dayMin ? t('guide.season.day', { n: s.dayMax }) : t('guide.season.days', { a: s.dayMin, b: s.dayMax })}
                              </span>
                            )}
                          </Link>
                        ) : (
                          <Link to="/guide" className="text-amber-800 font-semibold hover:underline">{t('dash.col.noBloom')}</Link>
                        )}
                      </td>
                      <td className="py-2.5 px-3 tabular text-slate-700">
                        {s?.harvestFrom && s.harvestTo && s.stages.some((st) => st !== 'preflower' && st !== 'recovery')
                          ? s.harvestFrom === s.harvestTo
                            ? formatShortDate(s.harvestFrom)
                            : `${formatShortDate(s.harvestFrom)} - ${formatShortDate(s.harvestTo)}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular font-bold text-emerald-800">{row.fruits.toLocaleString(locale)}</td>
                      <td className={`py-2.5 px-3 text-right tabular ${pct < 50 ? 'text-amber-800 font-semibold' : 'text-slate-600'}`}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <RainCard className="lg:col-span-4" />
      </div>

      {/* Latest field reports: the shared report card, small; each opens its report page */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden" aria-labelledby="rep-h">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <div>
            <h2 id="rep-h" className="text-sm font-bold text-slate-900">{t('dash.latest.title')}</h2>
            <span className="text-xs text-slate-600">{t('dash.latest.live')}</span>
          </div>
          <Link to="/reports" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
            {t('dash.latest.all', { n: totalReportsCount })}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {reportsLoading ? (
          <div className="p-4 grid md:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : latestReports.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">{t('dash.latest.empty')}</p>
            <p className="text-xs text-slate-500 mt-1">{t('dash.latest.empty.sub')}</p>
          </div>
        ) : (
          <div className="p-4 grid md:grid-cols-2 gap-3">
            {latestReports.map((report) => (
              <ReportCard key={report.id} report={report} tree={treeById.get(report.treeId)} size="sm" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

/** Exported for tests and other pages that want the stage label without the full card. */
export const stageLabel = (stage: keyof typeof STAGES, lang: 'id' | 'en') => pick(STAGES[stage].title, lang);
