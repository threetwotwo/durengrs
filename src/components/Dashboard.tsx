import React, { useState, useMemo, useEffect } from 'react';
import { useFarm, formatDateTime, formatTimeAgo, normalizeTimestamp } from '../context/FarmContext';
import { ConditionBadge } from './ConditionBadge';
import { ReportDate } from './ReportDate';
import { Link } from './Link';
import { navigate, treeUrl, treesUrl } from '../lib/router';
import { followUpOf, waitingLabel } from '../lib/insights';
import { PhotoAlbum } from './PhotoAlbum';
import { PhotoLightbox, photoItems, type GalleryItem } from './PhotoLightbox';
import { TaskRow } from './TaskRow';
import { MarkDoneSheet, UndoToast, undoLogged, useUndoToast } from './TreatmentSheets';
import { ScheduleTask, relativeDue } from '../lib/treatments';
import { useT } from '../i18n';
import { DashboardSeasonCard } from './GuideWidgets';
import { ReportPhoto, TreeCondition, TreeReport, DurianTree } from '../types';
import {
  db,
  parseReportDoc,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import {
  TreeDeciduous,
  Check,
  AlertTriangle,
  AlertOctagon,
  Minus,
  Clock,
  ArrowRight,
  ArrowUpDown,
  User,
  Calendar,
  CalendarCheck,
  Layers,
  Image as ImageIcon,
  ExternalLink,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const {
    trees,
    variants,
    totalFruits,
    totalReportsCount,
    loading: treesLoading,
    plans,
    scheduleTasks,
  } = useFarm();
  const { t, locale } = useT();
  const [doneTask, setDoneTask] = useState<ScheduleTask | null>(null);
  const { toast, show: showToast, clear: clearToast } = useUndoToast();

  const [latestReports, setLatestReports] = useState<TreeReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [blockSortField, setBlockSortField] = useState<'block' | 'healthy' | 'minor' | 'emergency' | 'not_assessed' | 'total' | 'fruits'>('block');
  const [blockSortAsc, setBlockSortAsc] = useState(true);
  const [gallery, setGallery] = useState<{ items: GalleryItem[]; index: number } | null>(null);

  // Targeted live subscription for ONLY the latest 8 reports
  useEffect(() => {
    setReportsLoading(true);
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(8));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map(parseReportDoc);
        setLatestReports(list);
        setReportsLoading(false);
      },
      (err) => {
        console.error('Failed to stream latest reports:', err);
        setReportsLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'reports');
        } catch {}
      }
    );

    return () => unsubscribe();
  }, []);

  // Condition counts including Not assessed and No report in 7+ days
  const counts = useMemo(() => {
    let healthy = 0;
    let minor = 0;
    let emergency = 0;
    let notAssessed = 0;
    let noReport7d = 0;
    let reportedToday = 0;

    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

    trees.forEach((tr) => {
      if (tr.condition === 'healthy') healthy++;
      else if (tr.condition === 'minor') minor++;
      else if (tr.condition === 'emergency') emergency++;
      else notAssessed++;

      const repTime = normalizeTimestamp(tr.lastReportAt);
      if (!repTime || repTime < sevenDaysAgoMs) {
        noReport7d++;
      }
      if (repTime && repTime > Date.now() - 24 * 60 * 60 * 1000) reportedToday++;
    });

    const total = trees.length;
    return {
      healthy,
      minor,
      emergency,
      notAssessed,
      noReport7d,
      reportedToday,
      reported7d: total - noReport7d,
      total,
      healthyPct: total ? Math.round((healthy / total) * 100) : 0,
      minorPct: total ? Math.round((minor / total) * 100) : 0,
      emergencyPct: total ? Math.round((emergency / total) * 100) : 0,
      notAssessedPct: total ? Math.round((notAssessed / total) * 100) : 0,
    };
  }, [trees]);

  const dueSoon = useMemo(() => scheduleTasks.filter((x) => x.status !== 'upcoming'), [scheduleTasks]);
  const overdueCount = useMemo(() => scheduleTasks.filter((x) => x.status === 'overdue').length, [scheduleTasks]);
  const nextTask = scheduleTasks.find((x) => x.status === 'upcoming');
  const hour = new Date().getHours();
  const greeting = t(
    hour < 11 ? 'dash.greet.morning' : hour < 15 ? 'dash.greet.noon' : hour < 17 ? 'dash.greet.afternoon' : hour < 18 ? 'dash.greet.late' : 'dash.greet.evening'
  );
  const todayLabel = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  // Needs attention: trees overdue for a re-check come first (emergency before minor, longest wait first).
  const attentionItems = useMemo(() => {
    const now = Date.now();
    const items = trees
      .filter((tr) => tr.condition === 'emergency' || tr.condition === 'minor')
      .map((tree) => ({ tree, fu: followUpOf(tree, normalizeTimestamp(tree.lastReportAt), now) }));
    items.sort((a, b) => {
      if (a.fu.needs !== b.fu.needs) return a.fu.needs ? -1 : 1;
      if (a.tree.condition !== b.tree.condition) return a.tree.condition === 'emergency' ? -1 : 1;
      return (b.fu.waitingDays ?? 9999) - (a.fu.waitingDays ?? 9999);
    });
    return items;
  }, [trees]);
  const attentionTrees = attentionItems.map((i) => i.tree);
  const followUpCount = attentionItems.filter((i) => i.fu.needs).length;

  // Per-block breakdown, sorted A to E by default
  const blockStats = useMemo(() => {
    const map = new Map<
      string,
      { block: string; healthy: number; minor: number; emergency: number; not_assessed: number; total: number; fruits: number }
    >();

    trees.forEach((tr) => {
      const b = tr.block || 'Unassigned';
      if (!map.has(b)) {
        map.set(b, { block: b, healthy: 0, minor: 0, emergency: 0, not_assessed: 0, total: 0, fruits: 0 });
      }
      const entry = map.get(b)!;
      entry.total++;
      entry.fruits += tr.estimatedFruitCount || 0;
      if (tr.condition === 'healthy') entry.healthy++;
      else if (tr.condition === 'minor') entry.minor++;
      else if (tr.condition === 'emergency') entry.emergency++;
      else entry.not_assessed++;
    });

    const list = Array.from(map.values());

    list.sort((a, b) => {
      const valA = a[blockSortField];
      const valB = b[blockSortField];
      if (typeof valA === 'string') {
        return blockSortAsc
          ? valA.localeCompare(valB as string)
          : (valB as string).localeCompare(valA);
      }
      return blockSortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    return list;
  }, [trees, blockSortField, blockSortAsc]);

  const handleBlockSort = (field: 'block' | 'healthy' | 'minor' | 'emergency' | 'not_assessed' | 'total' | 'fruits') => {
    if (blockSortField === field) {
      setBlockSortAsc(!blockSortAsc);
    } else {
      setBlockSortField(field);
      setBlockSortAsc(field === 'block' ? true : false);
    }
  };

  const handleInspectTree = (treeId: string) => {
    navigate(treeUrl(treeId));
  };

  const handleConditionTileClick = (cond: string) => {
    navigate(treesUrl({ condition: cond }));
  };

  const handleNoReportClick = () => {
    navigate('/reports');
  };

  const maskPhone = (phone?: string): string => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 4) {
      return `••••${digits.slice(-4)}`;
    }
    return phone;
  };

  if (treesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 p-4 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 h-96 bg-white rounded-xl border border-slate-200 p-6 animate-pulse" />
          <div className="lg:col-span-5 h-96 bg-white rounded-xl border border-slate-200 p-6 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Lightbox Modal */}
      {gallery && <PhotoLightbox items={gallery.items} index={gallery.index} onClose={() => setGallery(null)} />}

      {/* Today strip: the question this screen answers */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{greeting}</h1>
          <p className="text-sm text-slate-600">
            {todayLabel} ·{' '}
            {counts.emergency + overdueCount === 0
              ? t('dash.nothingUrgent')
              : t(counts.emergency + overdueCount === 1 ? 'dash.attention.one' : 'dash.attention.other', { n: counts.emergency + overdueCount })}
          </p>
        </div>
      </div>

      {/* 4 KPI tiles. Hue is reserved for status. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          onClick={() => handleConditionTileClick('emergency')}
          className={`text-left p-4 rounded-xl border bg-white shadow-xs hover:shadow-sm transition-shadow focus-visible:outline-2 focus-visible:outline-emerald-500 ${
            counts.emergency > 0 ? 'border-rose-300' : 'border-slate-200'
          }`}
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <AlertOctagon className={`w-4 h-4 ${counts.emergency > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
            {t('cond.emergency')}
          </span>
          <span className={`block mt-2 text-3xl font-bold tabular ${counts.emergency > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
            {counts.emergency}
          </span>
          <span className="block text-xs text-slate-600 mt-0.5">{counts.emergency === 0 ? t('dash.kpi.emergency.none') : t('dash.kpi.emergency.some')}</span>
        </button>

        <button
          onClick={() => handleConditionTileClick('minor')}
          className="text-left p-4 rounded-xl border border-slate-200 bg-white shadow-xs hover:shadow-sm transition-shadow focus-visible:outline-2 focus-visible:outline-emerald-500"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <AlertTriangle className={`w-4 h-4 ${counts.minor > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
            {t('dash.kpi.watch')}
          </span>
          <span className="block mt-2 text-3xl font-bold tabular text-slate-900">{counts.minor}</span>
          <span className="block text-xs text-slate-600 mt-0.5">{t('dash.kpi.watch.sub')}</span>
        </button>

        <button
          onClick={handleNoReportClick}
          className="text-left p-4 rounded-xl border border-slate-200 bg-white shadow-xs hover:shadow-sm transition-shadow focus-visible:outline-2 focus-visible:outline-emerald-500"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <Clock className="w-4 h-4 text-slate-400" />
            {t('dash.kpi.today')}
          </span>
          <span className="block mt-2 text-3xl font-bold tabular text-slate-900">{counts.reportedToday}</span>
          <span className="block text-xs text-slate-600 mt-0.5 tabular">
            {t('dash.kpi.today.sub', { a: counts.reported7d, b: counts.total })}
          </span>
        </button>

        <button
          onClick={() => navigate('/schedule')}
          className={`text-left p-4 rounded-xl border bg-white shadow-xs hover:shadow-sm transition-shadow focus-visible:outline-2 focus-visible:outline-emerald-500 ${
            overdueCount > 0 ? 'border-rose-300' : 'border-slate-200'
          }`}
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <CalendarCheck className={`w-4 h-4 ${overdueCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
            {t('dash.kpi.routine')}
          </span>
          <span className={`block mt-2 text-3xl font-bold tabular ${overdueCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
            {dueSoon.length}
          </span>
          <span className="block text-xs text-slate-600 mt-0.5 tabular">
            {overdueCount > 0 ? t('dash.kpi.routine.overdue', { n: overdueCount }) : t('dash.kpi.routine.sub')}
          </span>
        </button>
      </div>

      {/* Attention (trees) + Routine work (schedule) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden" aria-labelledby="att-h">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <h2 id="att-h" className="text-sm font-bold text-slate-900">
              {t('dash.att.title')} <span className="text-slate-500 font-medium tabular">({attentionTrees.length})</span>
              {followUpCount > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                  {t('dash.att.overdue', { n: followUpCount })}
                </span>
              )}
            </h2>
            {attentionTrees.length > 6 && (
              <button
                onClick={() => {
                  navigate(followUpCount > 0 ? treesUrl({ followup: '1' }) : treesUrl({ condition: counts.emergency > 0 ? 'emergency' : 'minor' }));
                }}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 min-h-8"
              >
                {t('dash.att.viewAll', { n: followUpCount > 0 ? followUpCount : attentionTrees.length })}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {attentionTrees.length === 0 ? (
            <div className="p-8 text-center">
              <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800">{t('dash.att.clear')}</p>
              <p className="text-xs text-slate-600 mt-0.5">{t('dash.att.clear.sub')}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {attentionItems.slice(0, 6).map(({ tree, fu }) => (
                <button
                  key={tree.id}
                  onClick={() => handleInspectTree(tree.id)}
                  className="w-full text-left p-3.5 min-h-14 hover:bg-slate-50 flex items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-bold font-mono text-slate-900 bg-slate-100 px-2 py-1 rounded shrink-0 min-w-12 text-center">{tree.id}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">
                        {tree.variant} · {t('common.blockN', { n: tree.block || '—' })}
                      </span>
                      <span className="block text-xs text-slate-600 truncate">
                        {tree.conditionNotes || tree.notes || t('dash.att.noNotes')}
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1 shrink-0">
                    <ConditionBadge condition={tree.condition} size="sm" />
                    <span className={`text-xs tabular ${fu.needs ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>
                      {waitingLabel(fu)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden" aria-labelledby="wk-h">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <h2 id="wk-h" className="text-sm font-bold text-slate-900">{t('dash.wk.title')}</h2>
            <button
              onClick={() => navigate('/schedule')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 min-h-8"
            >
              {t('dash.wk.open')}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {plans.length === 0 ? (
            <div className="p-6 text-center">
              <CalendarCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800">{t('dash.wk.empty')}</p>
              <p className="text-xs text-slate-600 mt-0.5 mb-3">{t('dash.wk.empty.sub')}</p>
              <button
                onClick={() => navigate('/schedule')}
                className="min-h-11 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
              >
                {t('dash.wk.setup')}
              </button>
            </div>
          ) : dueSoon.length === 0 ? (
            <div className="p-6 text-center">
              <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800">{t('dash.wk.none')}</p>
              {nextTask && (
                <p className="text-xs text-slate-600 mt-0.5">
                  {t('dash.wk.next', { name: nextTask.plan.name, when: relativeDue(nextTask.days).toLowerCase() })}
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {dueSoon.slice(0, 5).map((task) => (
                <TaskRow key={task.plan.id} task={task} compact onDone={setDoneTask} />
              ))}
              {dueSoon.length > 5 && (
                <button onClick={() => navigate('/schedule')} className="w-full p-3 text-xs font-semibold text-emerald-700 hover:bg-slate-50 min-h-11">
                  {t('dash.wk.more', { n: dueSoon.length - 5 })}
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Where each block is in its fruiting cycle, and what the Guide says to do now */}
      <DashboardSeasonCard />

      {/* Orchard health: one stacked bar instead of five tiles */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3" aria-labelledby="oh-h">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="oh-h" className="text-sm font-bold text-slate-900">{t('dash.health.title')}</h2>
          <span className="text-xs text-slate-600 tabular">{t('dash.health.total', { n: counts.total })}</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden bg-slate-100" role="img" aria-label={t('dash.health.aria', { h: counts.healthy, m: counts.minor, e: counts.emergency, n: counts.notAssessed })}>
          {[
            { n: counts.healthy, cls: 'bg-emerald-500' },
            { n: counts.minor, cls: 'bg-amber-400' },
            { n: counts.emergency, cls: 'bg-rose-500' },
            { n: counts.notAssessed, cls: 'bg-slate-300' },
          ].map((s, i) =>
            s.n > 0 ? <div key={i} className={s.cls} style={{ width: `${(s.n / Math.max(counts.total, 1)) * 100}%` }} /> : null
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { key: 'healthy', label: t('cond.healthy'), n: counts.healthy, dot: 'bg-emerald-500' },
            { key: 'minor', label: t('dash.health.minor'), n: counts.minor, dot: 'bg-amber-400' },
            { key: 'emergency', label: t('cond.emergency'), n: counts.emergency, dot: 'bg-rose-500' },
            { key: 'not_assessed', label: t('cond.not_assessed'), n: counts.notAssessed, dot: 'bg-slate-300' },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => handleConditionTileClick(s.key)}
              className="flex items-center gap-2 min-h-11 px-2 rounded-lg hover:bg-slate-50 text-left"
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
              <span className="text-sm text-slate-700">{s.label}</span>
              <span className="ml-auto text-sm font-semibold text-slate-900 tabular">{s.n}</span>
              <span className="text-xs text-slate-500 tabular w-9 text-right">
                {counts.total ? Math.round((s.n / counts.total) * 100) : 0}%
              </span>
            </button>
          ))}
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-600 mb-1">
            <span>{t('dash.health.coverage')}</span>
            <span className="tabular">{t('dash.ofTotal', { a: counts.reported7d, b: counts.total })}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-slate-700" style={{ width: `${counts.total ? (counts.reported7d / counts.total) * 100 : 0}%` }} />
          </div>
        </div>
      </section>

      {doneTask && (
        <MarkDoneSheet
          task={doneTask}
          onClose={() => setDoneTask(null)}
          onSaved={(id, message) => showToast({ message, undo: () => undoLogged(id) })}
        />
      )}
      <UndoToast toast={toast} onClear={clearToast} />

      {/* Main Grid: Block Breakdown (Left 7 cols) & Latest Field Reports (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Block Distribution (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">{t('dash.blocks.title')}</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {t('dash.blocks.sub')}
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-600">
              {t('dash.blocks.count', { n: blockStats.length })}
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wide">
                <tr>
                  <th
                    onClick={() => handleBlockSort('block')}
                    className="py-3 px-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>{t('common.block')}</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleBlockSort('total')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>{t('common.trees')}</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleBlockSort('healthy')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right text-emerald-800"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>{t('cond.healthy')}</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleBlockSort('minor')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right text-amber-800"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>{t('dash.health.minor')}</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleBlockSort('emergency')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right text-rose-800"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>{t('dash.col.emerg')}</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleBlockSort('not_assessed')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right text-slate-700"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>{t('dash.col.notAssessed')}</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleBlockSort('fruits')}
                    className="py-3 px-3.5 cursor-pointer hover:bg-slate-100 transition-colors text-right text-emerald-800"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>{t('dash.col.fruits')}</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {blockStats.map((row) => (
                  <tr
                    key={row.block}
                    onClick={() => {
                      navigate(treesUrl({ block: row.block }));
                    }}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 font-sans">
                      <Link to={treesUrl({ block: row.block })} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        {t('common.blockN', { n: row.block })}
                      </Link>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-800">
                      {row.total}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-medium">
                      {row.healthy}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700 font-medium">
                      {row.minor}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-700 font-bold">
                      {row.emergency}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 font-medium">
                      {row.not_assessed}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-bold text-emerald-800">
                      {row.fruits.toLocaleString(locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Latest Field Reports (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-sm font-bold text-slate-900">{t('dash.latest.title')}</h2>
              <span className="text-xs text-slate-600 font-medium">{t('dash.latest.live')}</span>
            </div>
            <button
              onClick={() => navigate('/reports')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors"
            >
              <span>{t('dash.latest.all', { n: totalReportsCount })}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[600px] pr-0.5">
            {reportsLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-28 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : latestReports.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">{t('dash.latest.empty')}</p>
                <p className="text-xs text-slate-500 mt-1">{t('dash.latest.empty.sub')}</p>
              </div>
            ) : (
              latestReports.map((report) => {
                const photos = report.photos || [];
                const tree = trees.find((tr) => tr.id === report.treeId);
                const workerMasked = maskPhone(report.workerPhone);

                return (
                  <div
                    key={report.id}
                    onClick={() => handleInspectTree(report.treeId)}
                    className="rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition-all cursor-pointer overflow-hidden"
                  >
                    {photos.length > 0 && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <PhotoAlbum
                          photos={photos}
                          onOpen={(i) => setGallery({ items: photoItems(photos, report.treeId, report.createdAt), index: i })}
                          className="aspect-[4/3] w-full"
                        />
                      </div>
                    )}
                    <div className="p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <ReportDate value={report.createdAt} />
                        {report.conditionAfter && <ConditionBadge condition={report.conditionAfter} size="sm" />}
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="text-sm font-bold text-slate-900">{t('dash.latest.tree', { id: report.treeId })}</h4>
                        <span className="text-xs text-slate-600">
                          {[tree?.variant, t('common.blockN', { n: report.block || tree?.block || '—' })].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      {report.conditionChanged && report.conditionBefore && report.conditionBefore !== report.conditionAfter && (
                        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
                          {t('dash.latest.was')} <ConditionBadge condition={report.conditionBefore} size="sm" />
                        </p>
                      )}
                      {report.description && /[\p{L}\p{N}]/u.test(report.description) && (
                        <p className="text-xs text-slate-700 leading-relaxed line-clamp-3">{report.description}</p>
                      )}
                      {workerMasked && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 font-mono">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{workerMasked}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
