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
import { cropFunnel, fruitOnTree } from '../lib/crop';
import { ScoreBars, harvestTotals } from './HarvestBits';
import { fruitsUrl, reportUrl } from '../lib/router';
import { useGuideData, StagePill } from './GuideWidgets';
import { ProblemsByTree } from './Problems';
import { RecordCard, RecordGrid, reportEntry } from './Record';
import { Link } from './Link';

/**
 * Today: one screen that answers "what needs me now?".
 *   1. Needs you: problems getting worse or due for a photo check, trees to pick, routines due, trees nobody reported
 *      on this week (only what isn't zero)
 *   2. Problems on the farm, most urgent first
 *   3. Panen: picked today, in 7 days and this season (fruit, kg, trees), the average scores, the latest harvests
 *   4. The season per block: stages, harvest window, fruit on the trees, rain
 *   5. The latest reports, photos first
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
/** The day `n` days before `date` (YYYY-MM-DD). */
const diffDaysBack = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
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
  const { trees, cases, scheduleTasks, rain, recordsError, loading, harvests, archivedHarvestTrees, workerLabel } = useFarm();
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
  // The last day it rained (the bot files every day, dry ones as 0 mm).
  const lastRain = [...rain30].filter((r) => r.rainMm > 0).sort((a, b) => b.date.localeCompare(a.date))[0];

  // Panen: today, the last 7 days, this season (same totals as the Harvest page), and the latest harvests.
  const panen = useMemo(() => {
    const weekFrom = diffDaysBack(today, 6);
    const season = cropFunnel(crops, seasons, harvests, archivedHarvestTrees).harvested;
    const latest = [...harvests].sort((a, b) => b.date.localeCompare(a.date) || normalizeTimestamp((b as any).createdAt) - normalizeTimestamp((a as any).createdAt)).slice(0, 4);
    const week = harvests.filter((h) => h.date >= weekFrom);
    return { today: harvestTotals(harvests.filter((h) => h.date === today)), week: harvestTotals(week), season, latest, scores: harvestTotals(week.length ? week : harvests).scores, scoresWeek: week.some((h) => h.items?.length) };
  }, [harvests, crops, seasons, archivedHarvestTrees, today]);
  const kgFmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 });

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
              <div className="p-3">
                <ProblemsByTree cases={openCases} maxTrees={4} oneColumn />
              </div>
            )}
          </section>
        </div>

        <div className="min-w-0 lg:col-span-5 space-y-5">
          <section className={card} aria-labelledby="panen-h">
            <SectionHead id="panen-h" title={t('today.panen')} to={panen.season.entries ? fruitsUrl() : '/harvest'} more={t(panen.season.entries ? 'fr.open' : 'hh.open')} />
            {panen.season.entries === 0 ? (
              <p className="p-5 text-sm text-slate-600">{t('hv2.none')}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                <dl className="grid grid-cols-3 divide-x divide-slate-100">
                  {(
                    [
                      [t('today.panen.today'), panen.today.fruits, panen.today.kg],
                      [t('today.panen.week'), panen.week.fruits, panen.week.kg],
                      [t('today.panen.season'), panen.season.fruits, panen.season.weightKg],
                    ] as Array<[string, number, number]>
                  ).map(([label, n, kg]) => (
                    <div key={label} className="px-3 py-3 text-center">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                      <dd className="text-2xl font-bold tabular text-slate-900 leading-tight">{n.toLocaleString(locale)}</dd>
                      <dd className="text-xs text-slate-600 tabular">
                        {t('hv2.fruit')}
                        {kg > 0 ? ` · ${kgFmt(kg)} kg` : ''}
                      </dd>
                    </div>
                  ))}
                </dl>
                {panen.scores && (
                  <div className="px-4 py-3 space-y-1.5 bg-emerald-50/50">
                    <p className="text-xs font-semibold text-slate-700">{t(panen.scoresWeek ? 'today.panen.scores.week' : 'today.panen.scores')}</p>
                    <ScoreBars scores={panen.scores} compact />
                  </div>
                )}
                <ul className="divide-y divide-slate-100">
                  {panen.latest.map((h) => (
                    <li key={h.id}>
                      <Link to={reportUrl(`harvest:${h.id}`)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-sm">
                        <span className="w-14 shrink-0 text-xs text-slate-500 tabular">{h.date === today ? t('feed.today') : formatShortDate(h.date)}</span>
                        <span className="font-mono font-bold text-slate-900 w-12 shrink-0">{h.treeId || h.block}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-700 tabular">
                          {h.fruits} {t('hv2.fruit')}
                          {h.weightKg ? ` · ${kgFmt(h.weightKg)} kg` : ''}
                        </span>
                        {h.workerPhone && <span className="text-xs text-slate-500 truncate max-w-24">{workerLabel(h.workerPhone)}</span>}
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

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
