import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { Search, X } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { reportCondition } from '../lib/review';
import { useT } from '../i18n';
import { db, parseReportDoc } from '../lib/firebase';
import { useQueryParams } from '../lib/router';
import { LOG_KINDS, LogEntry, LogKind, TreeEdit, buildFieldLog, byDay, filterLog } from '../lib/fieldLog';
import { TOPICS, isTopicId, pick, topicsForText } from '../lib/guide';
import { useGuideOn } from '../lib/guideMode';
import type { TreeReport } from '../types';
import { inputCls } from './PageHeader';
import { Link } from './Link';
import { KIND_ICON, LogRow, canDelete, deleteRecord } from './LogParts';

const PERIODS = [7, 30, 90] as const;
const PAGE = 60;
/** Most reports read for one period; the list says so when there are more. */
const MAX_REPORTS = 1500;

/** Condition filter values, as in the old report feed (#/reports?condition=minor). */
const CONDITIONS = ['healthy', 'minor', 'emergency', 'not_assessed'] as const;
const conditionOf = (r: TreeReport) => reportCondition(r);

/**
 * Laporan: every record from the field in one list, newest first, grouped by day. Worker reports, flowerings, counts,
 * harvests, season tasks, rain and tree data edits; each row opens its own page. Filters live in the URL
 * (#/reports?type=count&block=A&q=A12 ...), like the rest of the app.
 */
export const FieldLog: React.FC = () => {
  const { t, lang, locale } = useT();
  const guideOn = useGuideOn();
  const { allTrees, treeBlooms, cropCounts, harvests, seasonTasksDone, rain, workers, workerLabel } = useFarm();
  const [params, setParams] = useQueryParams();
  const [reports, setReports] = useState<TreeReport[]>([]);
  const [edits, setEdits] = useState<TreeEdit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const daysParam = Number(params.get('days'));
  const days = (PERIODS as readonly number[]).includes(daysParam) ? daysParam : 30;
  const kind = (LOG_KINDS as readonly string[]).includes(params.get('type') || '') ? (params.get('type') as LogKind) : null;
  const block = params.get('block') && params.get('block') !== 'all' ? params.get('block')! : '';
  const tree = params.get('tree') || '';
  const who = params.get('who') || '';
  const text = params.get('q') || '';
  const source = params.get('src') === 'whatsapp' || params.get('src') === 'webapp' ? (params.get('src') as 'whatsapp' | 'webapp') : undefined;
  const condition = (CONDITIONS as readonly string[]).includes(params.get('condition') || '') ? params.get('condition')! : '';
  const topicParam = params.get('topic');
  const topic = isTopicId(topicParam) ? topicParam : null;
  const changed = params.get('changed') === '1';

  // Worker reports live (new WhatsApp reports appear at once); tree edits once per period.
  useEffect(() => {
    setLoading(true);
    const since = Timestamp.fromMillis(Date.now() - days * 86400e3);
    const unsub = onSnapshot(
      query(collection(db, 'reports'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(MAX_REPORTS)),
      (snap) => {
        setReports(snap.docs.map(parseReportDoc));
        setLoading(false);
      },
      (err) => {
        console.error('Reports load failed:', err);
        setLoadError(true);
        setLoading(false);
      }
    );
    let cancelled = false;
    getDocs(query(collection(db, 'treeEdits'), where('at', '>=', since), orderBy('at', 'desc'), limit(1000)))
      .then((snap) => !cancelled && setEdits(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as TreeEdit)))
      .catch((err) => {
        console.error('Tree edits load failed:', err);
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [days]);

  const blockOfTree = useMemo(() => new Map(allTrees.map((x) => [x.id, x.block])), [allTrees]);
  const all = useMemo(
    () =>
      buildFieldLog({
        reports,
        blooms: treeBlooms,
        counts: cropCounts,
        harvests,
        tasks: seasonTasksDone,
        rain,
        edits,
        blockOf: (id) => blockOfTree.get(id),
      }),
    [reports, treeBlooms, cropCounts, harvests, seasonTasksDone, rain, edits, blockOfTree]
  );
  // Recomputed when the period or the data changes, not on every render (Date.now() would change it each time).
  const since = useMemo(() => Date.now() - days * 86400e3, [days, all]);
  const inPeriod = useMemo(() => filterLog(all, { since }), [all, since]);
  // Report-only filters (condition, Guide topic, condition changed) keep only worker reports.
  const report = useMemo(
    () =>
      condition || topic || changed
        ? (r: TreeReport) =>
            (!condition || conditionOf(r) === condition) && (!topic || topicsForText(r.description).includes(topic)) && (!changed || !!r.conditionChanged)
        : undefined,
    [condition, topic, changed]
  );
  const common = { block: block || undefined, tree: tree || undefined, who: who || undefined, source, text: text || undefined, report };
  const list = useMemo(() => filterLog(inPeriod, { ...common, kinds: kind ? [kind] : undefined }), [inPeriod, kind, block, tree, who, source, text, report]);
  const kindCounts = useMemo(() => {
    const m = new Map<LogKind, number>();
    for (const e of filterLog(inPeriod, common)) m.set(e.kind, (m.get(e.kind) || 0) + 1);
    return m;
  }, [inPeriod, block, tree, who, source, text, report]);
  const blocks = useMemo(() => Array.from(new Set(allTrees.map((x) => x.block).filter(Boolean))).sort(), [allTrees]);
  // Everyone who sent something in the period (named workers first).
  const senders = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of inPeriod) if (e.who) seen.set(e.who.replace(/\D/g, '') || e.who, workerLabel(e.who));
    for (const w of workers) if (!seen.has(w.phone)) seen.set(w.phone, w.name);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [inPeriod, workers, workerLabel]);
  const fromWhatsApp = list.filter((e) => e.source === 'whatsapp').length;
  const filtered = !!(kind || block || tree || who || source || text || condition || topic || changed);

  const set = (patch: Record<string, string | null>) => {
    setShown(PAGE);
    setParams(patch);
  };

  const remove = async (e: LogEntry) => {
    if (!window.confirm(t('log.delete.confirm'))) return;
    setBusy(e.key);
    setError(null);
    try {
      await deleteRecord(e);
    } catch (err: any) {
      console.error('Delete failed:', err);
      setError(err?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
    } finally {
      setBusy(null);
    }
  };

  const groups = byDay(list.slice(0, shown));
  const chip = (on: boolean) =>
    `min-h-9 px-3 rounded-full border text-sm font-semibold inline-flex items-center gap-1.5 ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`;
  const tag = 'min-h-8 pl-3 pr-1.5 rounded-full bg-sky-50 border border-sky-200 text-xs font-semibold text-sky-900 inline-flex items-center gap-1';

  return (
    <div className="space-y-4">
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={text}
            onChange={(e) => set({ q: e.target.value || null })}
            placeholder={t('rep.search.placeholder')}
            aria-label={t('rep.search.aria')}
            className={`${inputCls} pl-9`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('log.type')}>
          <button type="button" aria-pressed={!kind} onClick={() => set({ type: null })} className={chip(!kind)}>
            {t('log.all')}
          </button>
          {LOG_KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => set({ type: kind === k ? null : k })} className={chip(kind === k)}>
                <Icon className="w-4 h-4" />
                {t(`log.kind.${k}`)}
                <span className={`tabular text-xs ${kind === k ? 'opacity-90' : 'text-slate-500'}`}>{kindCounts.get(k) || 0}</span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <select value={String(days)} onChange={(e) => set({ days: e.target.value === '30' ? null : e.target.value })} aria-label={t('log.period')} className={inputCls}>
            {PERIODS.map((d) => (
              <option key={d} value={d}>{t('log.days', { n: d })}</option>
            ))}
          </select>
          <select value={block} onChange={(e) => set({ block: e.target.value || null })} aria-label={t('common.block')} className={inputCls}>
            <option value="">{t('common.allBlocks')}</option>
            {blocks.map((b) => (
              <option key={b} value={b}>{t('common.blockN', { n: b })}</option>
            ))}
          </select>
          <select value={condition} onChange={(e) => set({ condition: e.target.value || null })} aria-label={t('rep.filter.condition')} className={inputCls}>
            <option value="">{t('common.allConditions')}</option>
            <option value="healthy">{t('cond.healthy')}</option>
            <option value="minor">{t('rep.cond.minor')}</option>
            <option value="emergency">{t('cond.emergency')}</option>
            <option value="not_assessed">{t('cond.not_assessed')}</option>
          </select>
          <select value={who} onChange={(e) => set({ who: e.target.value || null })} aria-label={t('log.who')} className={inputCls}>
            <option value="">{t('log.who.all')}</option>
            {senders.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select value={source || ''} onChange={(e) => set({ src: e.target.value || null })} aria-label={t('log.source')} className={`${inputCls} col-span-2 lg:col-span-1`}>
            <option value="">{t('log.source.all')}</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="webapp">{t('log.source.webapp')}</option>
          </select>
        </div>
        {(tree || topic || changed) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {tree && (
              <button type="button" onClick={() => set({ tree: null })} className={tag}>
                {t('rep.treeN', { id: tree })} <X className="w-3.5 h-3.5" aria-label={t('common.clear')} />
              </button>
            )}
            {topic && (
              <button type="button" onClick={() => set({ topic: null })} className={tag}>
                {pick(TOPICS.find((tp) => tp.id === topic)!.title, lang)} <X className="w-3.5 h-3.5" aria-label={t('common.clear')} />
              </button>
            )}
            {changed && (
              <button type="button" onClick={() => set({ changed: null })} className={tag}>
                {t('rep.filter.changed')} <X className="w-3.5 h-3.5" aria-label={t('common.clear')} />
              </button>
            )}
            {topic && guideOn && (
              <Link to={`/guide/${topic}`} className="text-xs font-semibold text-emerald-700 hover:underline">
                {t('rep.topic.read', { topic: pick(TOPICS.find((tp) => tp.id === topic)!.title, lang) })}
              </Link>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span className="tabular">{t('log.summary', { n: list.length, wa: fromWhatsApp })}</span>
          {filtered && (
            <button
              type="button"
              onClick={() => set({ type: null, block: null, tree: null, who: null, src: null, q: null, condition: null, topic: null, changed: null })}
              className="font-semibold text-rose-700 min-h-8"
            >
              {t('log.reset')}
            </button>
          )}
        </div>
      </div>

      {loadError && <p role="alert" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">{t('log.loadError')}</p>}
      {error && <p role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">{error}</p>}
      {reports.length >= MAX_REPORTS && <p role="status" className="text-xs text-slate-600">{t('log.capped', { n: MAX_REPORTS })}</p>}

      {loading && list.length === 0 ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-600">{t('log.empty')}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.day} className="bg-white rounded-xl border border-slate-200 overflow-hidden" aria-label={g.day}>
              <h3 className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-600">
                {new Date(`${g.day}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <ul className="divide-y divide-slate-100">
                {g.items.map((e) => (
                  <LogRow key={e.key} entry={e} busy={busy === e.key} onDelete={canDelete(e.kind) ? () => remove(e) : undefined} />
                ))}
              </ul>
            </section>
          ))}
          {list.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="w-full min-h-11 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {t('log.more', { n: Math.min(PAGE, list.length - shown) })}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
