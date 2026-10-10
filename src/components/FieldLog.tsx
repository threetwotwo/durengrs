import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query, Timestamp, where, type QueryConstraint } from 'firebase/firestore';
import { Search, X } from 'lucide-react';
import { normalizeTimestamp, useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { db, parseReportDoc } from '../lib/firebase';
import { useQueryParams } from '../lib/router';
import { LOG_KINDS, LogKind, TreeEdit, buildFieldLog, byDay, filterLog } from '../lib/fieldLog';
import { foldFiledRecords, reportValues } from '../lib/feed';
import { TOPICS, isTopicId, pick, topicsForText } from '../lib/guide';
import { HEALTH_INFO } from '../shared';
import type { TreeReport } from '../types';
import { inputCls } from './PageHeader';
import { RecordCard, RecordGrid } from './Record';

const PERIODS = [7, 30, 90, 365] as const;
/** Reports read at a time; "Show more" reads the next ones. Other records come from the farm data already loaded. */
const PAGE = 48;
const DEEP_PAGE = 300;

/** Condition filter values (#/reports?condition=minor): the health the report stands for. */
const CONDITIONS = ['healthy', 'minor', 'emergency'] as const;
const conditionOf = (r: TreeReport) => {
  const h = reportValues(r).health;
  return h ? HEALTH_INFO[h].condition : 'not_assessed';
};

/** Tree data changes are the owner's edits, not field records: listed only when asked for. */
const LISTED_KINDS = LOG_KINDS.filter((k) => k !== 'treeData');

/**
 * Reports: every record from the field, newest first, grouped by day, as photo-first cards. Worker reports,
 * harvests, counts, flowerings, season work and rain; a record the bot filed from a report shows on that report.
 * Filters live in the URL (#/reports?type=harvest&block=A&q=A12...). Reports are read a page at a time.
 */
export const FieldLog: React.FC = () => {
  const { t, lang, locale } = useT();
  const { allTrees, treeBlooms, cropCounts, harvests, seasonTasksDone, rain, workers, workerLabel } = useFarm();
  const [params, setParams] = useQueryParams();
  const [reports, setReports] = useState<TreeReport[]>([]);
  const [moreReports, setMoreReports] = useState(false);
  const [edits, setEdits] = useState<TreeEdit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pages, setPages] = useState(1);

  const daysParam = Number(params.get('days'));
  const days = (PERIODS as readonly number[]).includes(daysParam) ? daysParam : 30;
  const kind = (LOG_KINDS as readonly string[]).includes(params.get('type') || '') ? (params.get('type') as LogKind) : null;
  const block = params.get('block') && params.get('block') !== 'all' ? params.get('block')! : '';
  const tree = (params.get('tree') || '').trim().toUpperCase();
  const who = params.get('who') || '';
  const text = params.get('q') || '';
  const source = params.get('src') === 'whatsapp' || params.get('src') === 'webapp' ? (params.get('src') as 'whatsapp' | 'webapp') : undefined;
  const condition = (CONDITIONS as readonly string[]).includes(params.get('condition') || '') ? params.get('condition')! : '';
  const topicParam = params.get('topic');
  const topic = isTopicId(topicParam) ? topicParam : null;
  const changed = params.get('changed') === '1';
  const since = useMemo(() => Date.now() - days * 86400e3, [days]);
  // Filters that look inside the reports read more at a time, so a search doesn't stop at the newest page.
  const deep = !!(text || who || topic || condition || changed || block);
  const pageSize = (deep ? DEEP_PAGE : PAGE) * pages;

  // Reports, live (a new WhatsApp report appears at once), one page at a time; one tree's only when filtered to it.
  useEffect(() => {
    // A list of another kind (rain, harvests...) needs no reports.
    if (kind && kind !== 'issue') {
      setReports([]);
      setMoreReports(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const cons: QueryConstraint[] = [];
    if (tree) cons.push(where('treeId', '==', tree));
    cons.push(where('createdAt', '>=', Timestamp.fromMillis(since)), orderBy('createdAt', 'desc'), limit(pageSize + 1));
    return onSnapshot(
      query(collection(db, 'reports'), ...cons),
      (snap) => {
        const docs = snap.docs.map(parseReportDoc);
        setMoreReports(docs.length > pageSize);
        setReports(docs.slice(0, pageSize));
        setLoadError(false);
        setLoading(false);
      },
      (err) => {
        console.error('Reports load failed:', err);
        setLoadError(true);
        setLoading(false);
      }
    );
  }, [since, tree, pageSize, kind]);

  // The owner's tree data changes: only read when that kind is asked for.
  useEffect(() => {
    if (kind !== 'treeData') return;
    let cancelled = false;
    getDocs(query(collection(db, 'treeEdits'), where('at', '>=', Timestamp.fromMillis(since)), orderBy('at', 'desc'), limit(300)))
      .then((snap) => !cancelled && setEdits(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as TreeEdit)))
      .catch((err) => {
        console.error('Tree edits load failed:', err);
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, since]);

  const blockOfTree = useMemo(() => new Map(allTrees.map((x) => [x.id, x.block])), [allTrees]);
  // While older reports are still unread, a list that has reports in it stops where the reports read so far stop, so
  // it is in order and nothing between is missing. A list of another kind (rain, harvests...) shows its whole period.
  const withReports = !kind || kind === 'issue';
  const cutoff = withReports && moreReports && reports.length ? reports[reports.length - 1] : null;
  const from = cutoff ? Math.max(since, normalizeTimestamp(cutoff.createdAt)) : since;
  const all = useMemo(
    () =>
      buildFieldLog({
        reports,
        blooms: treeBlooms,
        counts: cropCounts,
        harvests,
        tasks: seasonTasksDone,
        rain,
        edits: kind === 'treeData' ? edits : [],
        blockOf: (id) => blockOfTree.get(id),
      }),
    [reports, treeBlooms, cropCounts, harvests, seasonTasksDone, rain, edits, kind, blockOfTree]
  );
  const inPeriod = useMemo(() => filterLog(all, { since: from }), [all, from]);
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
  const { list, filed } = useMemo(() => {
    const kinds = kind ? [kind] : LISTED_KINDS;
    const matched = filterLog(inPeriod, { ...common, kinds });
    // All records: what the bot filed from a report sits on the report. One kind: every record of it.
    return kind ? { list: matched, filed: new Map() } : (({ entries, filed }) => ({ list: entries, filed }))(foldFiledRecords(matched));
  }, [inPeriod, kind, block, tree, who, source, text, report]);
  const blocks = useMemo(() => Array.from(new Set(allTrees.map((x) => x.block).filter(Boolean))).sort(), [allTrees]);
  // Everyone who sent something in the period (named workers first).
  const senders = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of inPeriod) if (e.who) seen.set(e.who.replace(/\D/g, '') || e.who, workerLabel(e.who));
    for (const w of workers) if (!seen.has(w.phone)) seen.set(w.phone, w.name);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [inPeriod, workers, workerLabel]);
  const filtered = !!(kind || block || tree || who || source || text || condition || topic || changed);

  const set = (patch: Record<string, string | null>) => {
    setPages(1);
    setParams(patch);
  };

  const groups = byDay(list);
  const today = new Date();
  const dayTitle = (day: string) => {
    const d = new Date(`${day}T12:00:00`);
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (same(d, today)) return t('feed.today');
    if (same(d, y)) return t('feed.yesterday');
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
  };
  const chip = (on: boolean) =>
    `min-h-9 px-3 rounded-full border text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`;
  const tag = 'min-h-8 pl-3 pr-1.5 rounded-full bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1';
  let shownCount = 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={text}
            onChange={(e) => set({ q: e.target.value || null })}
            placeholder={t('rep.search.placeholder')}
            aria-label={t('rep.search.aria')}
            className={`${inputCls} pl-9 bg-white`}
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap [scrollbar-width:none]" role="group" aria-label={t('log.type')}>
          <button type="button" aria-pressed={!kind} onClick={() => set({ type: null })} className={chip(!kind)}>
            {t('log.all')}
          </button>
          {LOG_KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => set({ type: kind === k ? null : k })} className={chip(kind === k)}>
              {t(k === 'issue' ? 'feed.kind.reports' : `log.kind.${k}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <select value={String(days)} onChange={(e) => set({ days: e.target.value === '30' ? null : e.target.value })} aria-label={t('log.period')} className={`${inputCls} bg-white`}>
            {PERIODS.map((d) => (
              <option key={d} value={d}>{t('log.days', { n: d })}</option>
            ))}
          </select>
          <select value={block} onChange={(e) => set({ block: e.target.value || null })} aria-label={t('common.block')} className={`${inputCls} bg-white`}>
            <option value="">{t('common.allBlocks')}</option>
            {blocks.map((b) => (
              <option key={b} value={b}>{t('common.blockN', { n: b })}</option>
            ))}
          </select>
          <select value={condition} onChange={(e) => set({ condition: e.target.value || null })} aria-label={t('rep.filter.condition')} className={`${inputCls} bg-white`}>
            <option value="">{t('common.allConditions')}</option>
            <option value="healthy">{t('cond.healthy')}</option>
            <option value="minor">{t('rep.cond.minor')}</option>
            <option value="emergency">{t('cond.emergency')}</option>
          </select>
          <select value={who} onChange={(e) => set({ who: e.target.value || null })} aria-label={t('log.who')} className={`${inputCls} bg-white`}>
            <option value="">{t('log.who.all')}</option>
            {senders.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>
        {(tree || topic || changed || source || filtered) && (
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
            {source && (
              <button type="button" onClick={() => set({ src: null })} className={tag}>
                {source === 'whatsapp' ? 'WhatsApp' : t('log.source.webapp')} <X className="w-3.5 h-3.5" aria-label={t('common.clear')} />
              </button>
            )}
            {filtered && (
              <button
                type="button"
                onClick={() => set({ type: null, block: null, tree: null, who: null, src: null, q: null, condition: null, topic: null, changed: null })}
                className="ml-auto text-xs font-semibold text-rose-700 min-h-8"
              >
                {t('log.reset')}
              </button>
            )}
          </div>
        )}
      </div>

      {loadError && <p role="alert" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">{t('log.loadError')}</p>}

      {loading && list.length === 0 ? (
        <RecordGrid>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-72 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </RecordGrid>
      ) : (
        <div className="space-y-6">
          {list.length === 0 && <p className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-600">{t('log.empty')}</p>}
          {groups.map((g) => (
            <section key={g.day} aria-label={dayTitle(g.day)} className="space-y-2.5">
              <h3 className="text-sm font-bold text-slate-900">
                {dayTitle(g.day)} <span className="font-medium text-slate-500 tabular">{g.items.length}</span>
              </h3>
              <RecordGrid>
                {g.items.map((e) => (
                  <RecordCard key={e.key} entry={e} filed={filed.get(e.key)} timeOnly eager={shownCount++ < 6} />
                ))}
              </RecordGrid>
            </section>
          ))}
          {moreReports && withReports && (
            <button
              type="button"
              onClick={() => setPages((n) => n + 1)}
              className="w-full min-h-11 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t('feed.older')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
