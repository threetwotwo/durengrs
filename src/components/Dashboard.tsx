import React, { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, ArrowRight, CalendarCheck, CalendarClock, Check, ChevronRight, ClipboardCheck, CloudRain, EyeOff, Siren, Stethoscope, Wheat } from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, parseReportDoc } from '../lib/firebase';
import { normalizeTimestamp, useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { isDue, isOpen, sortCases } from '../lib/cases';
import { diffDays, formatShortDate, todayStr } from '../lib/treatments';
import { useGuideOn } from '../lib/guideMode';
import type { TreeReport } from '../types';
import { useCrops } from './useCrops';
import { fruitOnTree } from '../lib/crop';
import { useGuideData, StagePill } from './GuideWidgets';
import { CaseRow } from './Problems';
import { RecordCard, RecordGrid, reportEntry } from './Record';
import { Link } from './Link';

/**
 * Today: one screen that answers "what needs me now?".
 *   1. Needs you: problems getting worse or due for a photo check, trees to pick, routines due, trees nobody reported
 *      on this week (only what isn't zero)
 *   2. Problems on the farm, most urgent first
 *   3. The season per block: stages, harvest window, fruit on the trees, rain
 *   4. The latest reports, photos first
 */

const LATEST = 6;

/** The newest reports, live (a handful of reads). */
function useLatestReports(n = LATEST) {
  const [reports, setReports] = useState<TreeReport[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(n)),
        (snap) => {
          setReports(snap.docs.map(parseReportDoc));
          setLoading(false);
        },
        (err) => {
          console.error('Latest reports failed:', err);
          setLoading(false);
        }
      ),
    [n]
  );
  return { reports, loading };
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
const card = 'bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden';

type Tone = 'danger' | 'warn' | 'good' | 'info';
const TONE: Record<Tone, string> = {
  danger: 'text-rose-700 bg-rose-50',
  warn: 'text-amber-800 bg-amber-50',
  good: 'text-emerald-700 bg-emerald-50',
  info: 'text-sky-800 bg-sky-50',
};

const NeedRow: React.FC<{ icon: React.ComponentType<{ className?: string }>; tone: Tone; n: number; title: string; sub?: string; to: string }> = ({
  icon: Icon,
  tone,
  n,
  title,
  sub,
  to,
}) => (
  <li>
    <Link to={to} className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONE[tone]}`}>
        <Icon className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        {sub && <span className="block text-xs text-slate-600 truncate">{sub}</span>}
      </span>
      <span className="text-2xl font-bold tabular text-slate-900">{n}</span>
      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 shrink-0" />
    </Link>
  </li>
);

const SectionHead: React.FC<{ id: string; title: string; to?: string; more?: string }> = ({ id, title, to, more }) => (
  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
    <h2 id={id} className="text-base font-bold text-slate-900">
      {title}
    </h2>
    {to && more && (
      <Link to={to} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 min-h-8">
        {more}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    )}
  </div>
);

export const Dashboard: React.FC = () => {
  const { t, locale } = useT();
  const { trees, cases, scheduleTasks, rain, recordsError, loading } = useFarm();
  const { reports, loading: reportsLoading } = useLatestReports();
  const { crops, seasons } = useCrops();
  const { checks } = useGuideData();
  const guideOn = useGuideOn();
  const today = todayStr();

  const openCases = useMemo(() => sortCases(cases.filter(isOpen), today), [cases, today]);
  const dueCases = openCases.filter((c) => isDue(c, today));
  const worse = openCases.filter((c) => c.status === 'worse');
  const untreated = openCases.filter((c) => c.status === 'open');
  const toPick = crops.filter((c) => c.next?.kind === 'harvest').length;
  const routinesDue = scheduleTasks.filter((x) => x.status === 'overdue').length;
  // Merah from a report even when no problem was named ("tumbang", "hampir mati").
  const redTrees = trees.filter((x) => x.condition === 'emergency');
  const stale = trees.filter((x) => normalizeTimestamp(x.lastReportAt) < Date.now() - WEEK).length;
  const checkGaps = guideOn ? checks.filter((c) => c.status === 'gap').length : 0;

  const allNeeds: Array<React.ComponentProps<typeof NeedRow> & { key: string }> = [
    { key: 'worse', icon: AlertOctagon, tone: 'danger', n: worse.length, title: t('today.need.worse'), sub: worse.map((c) => c.treeId).join(', '), to: '/problems' },
    { key: 'red', icon: Siren, tone: 'danger', n: redTrees.length, title: t('today.need.red'), sub: redTrees.slice(0, 8).map((x) => x.id).join(', '), to: '/trees?health=merah' },
    { key: 'due', icon: CalendarClock, tone: 'danger', n: dueCases.length, title: t('today.need.due'), sub: dueCases.slice(0, 8).map((c) => c.treeId).join(', '), to: '/problems?show=due' },
    { key: 'untreated', icon: Stethoscope, tone: 'warn', n: untreated.length, title: t('today.need.untreated'), sub: untreated.slice(0, 8).map((c) => c.treeId).join(', '), to: '/problems' },
    { key: 'pick', icon: Wheat, tone: 'good', n: toPick, title: t('today.need.pick'), sub: t('hh.toPick.sub'), to: '/harvest' },
    { key: 'routines', icon: CalendarCheck, tone: 'danger', n: routinesDue, title: t('today.need.routines'), to: '/schedule' },
    { key: 'stale', icon: EyeOff, tone: 'warn', n: stale, title: t('today.need.stale'), sub: t('today.need.stale.sub', { n: trees.length }), to: '/trees?show=stale' },
    { key: 'guide', icon: ClipboardCheck, tone: 'warn', n: checkGaps, title: t('today.need.guide'), to: '/guide' },
  ];
  const needs = allNeeds.filter((x) => x.n > 0);

  const hour = new Date().getHours();
  const greeting = t(hour < 11 ? 'dash.greet.morning' : hour < 15 ? 'dash.greet.noon' : hour < 17 ? 'dash.greet.afternoon' : hour < 18 ? 'dash.greet.late' : 'dash.greet.evening');
  const dateLabel = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  // The season per block: stages now, the harvest window, fruit still on the trees.
  const fruitByBlock = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of crops) m.set(c.tree.block, (m.get(c.tree.block) || 0) + fruitOnTree(c));
    return m;
  }, [crops]);
  const rain30 = rain.filter((r) => diffDays(today, r.date) <= 30);
  const rainTotal = Math.round(rain30.reduce((n, r) => n + r.rainMm, 0));
  const lastRain = [...rain30].sort((a, b) => b.date.localeCompare(a.date))[0];

  if (loading) return <div className="h-96 bg-white rounded-xl border border-slate-200 animate-pulse" />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{greeting}</h1>
        <p className="text-sm text-slate-600">
          {dateLabel} · {needs.length === 0 ? t('today.allClear') : t(needs.length === 1 ? 'today.needs.one' : 'today.needs.other', { n: needs.length })}
        </p>
      </div>

      {recordsError && (
        <p role="alert" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
          {recordsError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
        <div className="min-w-0 lg:col-span-7 space-y-5">
          <section className={card} aria-labelledby="need-h">
            <SectionHead id="need-h" title={t('today.need.title')} />
            {needs.length === 0 ? (
              <p className="p-6 text-center">
                <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <span className="block text-sm font-semibold text-slate-800">{t('today.allClear')}</span>
                <span className="block text-xs text-slate-600 mt-0.5">{t('today.allClear.sub')}</span>
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {needs.map(({ key, ...row }) => (
                  <NeedRow key={key} {...row} />
                ))}
              </ul>
            )}
          </section>

          <section className={card} aria-labelledby="prob-h">
            <SectionHead id="prob-h" title={t('today.problems')} to="/problems" more={t('today.problems.all', { n: openCases.length })} />
            {openCases.length === 0 ? (
              <p className="p-5 text-sm text-slate-600 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                {t('case.empty.open')}
              </p>
            ) : (
              <div className="p-3 space-y-2">
                {openCases.slice(0, 5).map((c) => (
                  <CaseRow key={c.id} c={c} showTree />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="min-w-0 lg:col-span-5 space-y-5">
          <section className={card} aria-labelledby="season-h">
            <SectionHead id="season-h" title={t('today.season')} to="/harvest" more={t('hh.open')} />
            <ul className="divide-y divide-slate-100">
              {seasons.map((s) => (
                <li key={s.block} className="px-4 py-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 min-w-16">{t('common.blockN', { n: s.block })}</span>
                    {s.floweredOn && !s.outdated ? (
                      (s.stages.length ? s.stages : [s.stage]).map((st) => <StagePill key={st} stage={st} />)
                    ) : (
                      <span className="text-xs text-slate-500">{s.young ? t('dash.col.young') : t('dash.col.noBloom')}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 tabular flex flex-wrap gap-x-3">
                    {s.harvestFrom && s.harvestTo && !s.outdated && (
                      <span>
                        {t('today.season.harvest', {
                          when: s.harvestFrom === s.harvestTo ? formatShortDate(s.harvestFrom) : `${formatShortDate(s.harvestFrom)} – ${formatShortDate(s.harvestTo)}`,
                        })}
                      </span>
                    )}
                    {(fruitByBlock.get(s.block) || 0) > 0 && <span>{t('today.season.fruit', { n: (fruitByBlock.get(s.block) || 0).toLocaleString(locale) })}</span>}
                  </p>
                </li>
              ))}
              <li className="px-4 py-3 flex items-center gap-2 text-xs text-slate-600">
                <CloudRain className="w-4 h-4 text-sky-600" aria-hidden />
                {rain30.length
                  ? t('today.rain', { mm: rainTotal, date: lastRain ? formatShortDate(lastRain.date) : '—' })
                  : t('today.rain.none')}
              </li>
            </ul>
          </section>
        </div>
      </div>

      <section aria-labelledby="latest-h" className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 id="latest-h" className="text-base font-bold text-slate-900">{t('dash.latest.title')}</h2>
          <Link to="/reports" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 min-h-8">
            {t('today.latest.all')}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {reportsLoading ? (
          <RecordGrid>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 bg-white rounded-xl border border-slate-200 animate-pulse" />
            ))}
          </RecordGrid>
        ) : reports.length === 0 ? (
          <p className="p-5 text-sm text-slate-600 bg-white rounded-xl border border-slate-200">{t('dash.latest.empty')}</p>
        ) : (
          <RecordGrid>
            {reports.map((r, i) => (
              <RecordCard key={r.id} entry={reportEntry(r)} eager={i < 3} />
            ))}
          </RecordGrid>
        )}
      </section>
    </div>
  );
};
