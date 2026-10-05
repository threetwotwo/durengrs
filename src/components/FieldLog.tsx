import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { AlertTriangle, ClipboardList, CloudRain, Flower2, ListChecks, Ruler, Trash2, Wheat } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { db, parseReportDoc } from '../lib/firebase';
import { useQueryParams, reportUrl } from '../lib/router';
import { LOG_KINDS, LogEntry, LogKind, TreeEdit, buildFieldLog, byDay, filterLog } from '../lib/fieldLog';
import { removeCropCount, removeTreeBloom, saveRain, unmarkSeasonTask, GRADES } from '../lib/fieldData';
import { SEASON_TASKS } from '../lib/fieldInsights';
import { pick } from '../lib/guide';
import { formatShortDate } from '../lib/treatments';
import { plantedDateStr } from '../lib/trees';
import { inputCls } from './PageHeader';
import { Link } from './Link';
import { TreeLink } from './CropWidgets';
import { SourceBadge } from './SourceBadge';
import { PhotoStrip } from './PhotoStrip';
import type { TreeReport } from '../types';

const PERIODS = [7, 30, 90] as const;
const MAX_DAYS = 90;
const PAGE = 60;

const KIND_ICON: Record<LogKind, React.ComponentType<{ className?: string }>> = {
  issue: AlertTriangle,
  bloom: Flower2,
  count: ClipboardList,
  harvest: Wheat,
  task: ListChecks,
  rain: CloudRain,
  treeData: Ruler,
};
const KIND_TONE: Record<LogKind, string> = {
  issue: 'bg-rose-50 text-rose-700',
  bloom: 'bg-pink-50 text-pink-700',
  count: 'bg-amber-50 text-amber-800',
  harvest: 'bg-emerald-50 text-emerald-700',
  task: 'bg-teal-50 text-teal-700',
  rain: 'bg-sky-50 text-sky-700',
  treeData: 'bg-slate-100 text-slate-700',
};
const FIELD_KEY: Record<string, string> = {
  canopySize: 'field.canopy',
  trunkSize: 'field.trunk',
  floweringBranches: 'field.branches',
  floweringClusters: 'field.clusters',
  estimatedFruitCount: 'field.fruits',
  notes: 'common.notes',
  conditionNotes: 'tree.conditionNotes',
  condition: 'common.condition',
  variant: 'common.variant',
  block: 'common.block',
  supplier: 'trees.col.supplier',
  datePlanted: 'trees.col.planted',
};
const TEXT_FIELDS = new Set(['notes', 'conditionNotes']);
/** Local calendar day of a time, as YYYY-MM-DD. */
const localDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Every record from the field in one list: issue reports, flowerings, counts, harvests, season tasks, rain and tree
 * data edits. Filters live in the URL (#/reports?view=log&type=count&block=A ...), like the rest of the app.
 */
export const FieldLog: React.FC = () => {
  const { t, lang, locale } = useT();
  const { allTrees, treeBlooms, cropCounts, harvests, seasonTasksDone, rain, workers, workerLabel } = useFarm();
  const [params, setParams] = useQueryParams();
  const [reports, setReports] = useState<TreeReport[]>([]);
  const [edits, setEdits] = useState<TreeEdit[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const daysParam = Number(params.get('days'));
  const days = (PERIODS as readonly number[]).includes(daysParam) ? daysParam : 30;
  const kind = (LOG_KINDS as readonly string[]).includes(params.get('type') || '') ? (params.get('type') as LogKind) : null;
  const block = params.get('block') || '';
  const tree = params.get('tree') || '';
  const who = params.get('who') || '';
  const source = params.get('src') === 'whatsapp' || params.get('src') === 'webapp' ? (params.get('src') as 'whatsapp' | 'webapp') : undefined;

  // Issue reports and tree edits are not kept in memory by the app: one read of the last 90 days when the log opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = Timestamp.fromMillis(Date.now() - MAX_DAYS * 86400e3);
      const [r, e] = await Promise.allSettled([
        getDocs(query(collection(db, 'reports'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(1000))),
        getDocs(query(collection(db, 'treeEdits'), where('at', '>=', since), orderBy('at', 'desc'), limit(1000))),
      ]);
      if (cancelled) return;
      if (r.status === 'fulfilled') setReports(r.value.docs.map(parseReportDoc));
      if (e.status === 'fulfilled') setEdits(e.value.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as TreeEdit));
      if (r.status === 'rejected' || e.status === 'rejected') {
        console.error('Field log load failed:', r.status === 'rejected' ? r.reason : (e as PromiseRejectedResult).reason);
        setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
  const since = Date.now() - days * 86400e3;
  const inPeriod = useMemo(() => filterLog(all, { since }), [all, since]);
  const list = useMemo(
    () => filterLog(inPeriod, { kinds: kind ? [kind] : undefined, block: block || undefined, tree: tree || undefined, who: who || undefined, source }),
    [inPeriod, kind, block, tree, who, source]
  );
  const kindCounts = useMemo(() => {
    const m = new Map<LogKind, number>();
    for (const e of filterLog(inPeriod, { block: block || undefined, tree: tree || undefined, who: who || undefined, source })) m.set(e.kind, (m.get(e.kind) || 0) + 1);
    return m;
  }, [inPeriod, block, tree, who, source]);
  const blocks = useMemo(() => Array.from(new Set(allTrees.map((x) => x.block).filter(Boolean))).sort(), [allTrees]);
  // Everyone who sent something in the period (named workers first).
  const senders = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of inPeriod) if (e.who) seen.set(e.who.replace(/\D/g, '') || e.who, workerLabel(e.who));
    for (const w of workers) if (!seen.has(w.phone)) seen.set(w.phone, w.name);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [inPeriod, workers, workerLabel]);
  const fromWhatsApp = list.filter((e) => e.source === 'whatsapp').length;
  const filtered = !!(kind || block || tree || who || source);

  const set = (patch: Record<string, string | null>) => {
    setShown(PAGE);
    setParams(patch);
  };

  const remove = async (e: LogEntry) => {
    if (!window.confirm(t('log.delete.confirm'))) return;
    setBusy(e.key);
    setError(null);
    try {
      if (e.kind === 'count') await removeCropCount(e.rec.id, e.rec.photos);
      else if (e.kind === 'bloom') await removeTreeBloom(e.rec.id, e.rec.photos);
      else if (e.kind === 'harvest') await import('../lib/reportAdmin').then((m) => m.deleteHarvest(e.rec));
      else if (e.kind === 'task') await unmarkSeasonTask(e.rec.block, e.rec.season, e.rec.task);
      else if (e.kind === 'rain') await saveRain(e.rec.date, null);
    } catch (err: any) {
      console.error('Delete failed:', err);
      setError(err?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
    } finally {
      setBusy(null);
    }
  };

  const summary = (e: LogEntry): React.ReactNode => {
    switch (e.kind) {
      case 'issue': {
        const r = e.rec;
        const changed = r.conditionChanged && r.conditionBefore && r.conditionAfter && r.conditionBefore !== r.conditionAfter;
        return (
          <>
            {changed && <span className="block font-semibold">{t(`cond.${r.conditionBefore}`)} → {t(`cond.${r.conditionAfter}`)}</span>}
            <span className="line-clamp-2">{r.description || t('log.s.noText')}</span>
          </>
        );
      }
      case 'bloom':
        return t('log.s.bloom', { date: formatShortDate(e.rec.date), part: t(`guide.part.${e.rec.part}`) });
      case 'count':
        return (
          <>
            <span className="font-semibold">{t(`crop.stage.${e.rec.stage}`)}: {e.rec.count}</span>
            <span className="text-slate-500"> · {t('log.s.wave', { date: formatShortDate(e.rec.season) })}</span>
            {e.timed && e.rec.date !== localDay(e.at) && <span className="text-slate-500"> · {t('log.s.countedOn', { date: formatShortDate(e.rec.date) })}</span>}
          </>
        );
      case 'harvest': {
        const h = e.rec;
        const grades = GRADES.filter((g) => h.grades?.[g]).map((g) => `${t(`grade.${g}.short`)} ${h.grades![g]}`).join(', ');
        return (
          <>
            <span className="font-semibold">{t('log.s.fruit', { n: h.fruits })}</span>
            {h.weightKg ? ` · ${h.weightKg} kg` : ''}
            {grades ? ` · ${grades}` : ''}
            {h.problems?.length ? ` · ${h.problems.map((p) => t(`rec.hv.p.${p}`)).join(', ')}${h.problemFruits ? ` (${h.problemFruits})` : ''}` : ''}
            {e.timed && h.date !== localDay(e.at) && <span className="text-slate-500"> · {t('log.s.pickedOn', { date: formatShortDate(h.date) })}</span>}
          </>
        );
      }
      case 'task':
        return (
          <>
            <span className="font-semibold">{SEASON_TASKS[e.rec.task] ? pick(SEASON_TASKS[e.rec.task].title, lang) : e.rec.task}</span>
            <span className="text-slate-500"> · {t('log.s.doneOn', { date: formatShortDate(e.rec.date) })}</span>
          </>
        );
      case 'rain':
        return (
          <>
            <span className="font-semibold tabular">{e.rec.rainMm} mm</span>
            <span className="text-slate-500"> · {formatShortDate(e.rec.date)}</span>
          </>
        );
      case 'treeData': {
        const parts = Object.entries(e.rec.changes || {}).map(([f, c]) => {
          if (f === 'active') return c.to === false ? t('log.s.archived') : t('log.s.restored');
          const label = FIELD_KEY[f] ? t(FIELD_KEY[f]) : f;
          if (TEXT_FIELDS.has(f)) return t('log.s.textChanged', { field: label });
          const show = (v: unknown) =>
            v === null || v === undefined || v === '' ? '—' : f === 'condition' ? t(`cond.${v}`) : f === 'datePlanted' ? formatShortDate(plantedDateStr(v)) || '—' : typeof v === 'object' ? '…' : String(v);
          return `${label}: ${show(c.from)} → ${show(c.to)}`;
        });
        return parts.join(' · ');
      }
    }
  };

  const groups = byDay(list.slice(0, shown));
  const chip = (on: boolean) =>
    `min-h-9 px-3 rounded-full border text-sm font-semibold inline-flex items-center gap-1.5 ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`;

  return (
    <div className="space-y-4">
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('log.period')}>
          {PERIODS.map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => set({ days: d === 30 ? null : String(d) })} className={chip(days === d)}>
              {t('log.days', { n: d })}
            </button>
          ))}
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <input
            type="search"
            value={tree}
            onChange={(e) => set({ tree: e.target.value.toUpperCase().replace(/\s+/g, '') || null })}
            placeholder={t('log.tree.placeholder')}
            aria-label={t('log.tree.aria')}
            className={inputCls}
          />
          <select value={block} onChange={(e) => set({ block: e.target.value || null })} aria-label={t('common.block')} className={inputCls}>
            <option value="">{t('common.allBlocks')}</option>
            {blocks.map((b) => (
              <option key={b} value={b}>{t('common.blockN', { n: b })}</option>
            ))}
          </select>
          <select value={who} onChange={(e) => set({ who: e.target.value || null })} aria-label={t('log.who')} className={inputCls}>
            <option value="">{t('log.who.all')}</option>
            {senders.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select value={source || ''} onChange={(e) => set({ src: e.target.value || null })} aria-label={t('log.source')} className={inputCls}>
            <option value="">{t('log.source.all')}</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="webapp">{t('log.source.webapp')}</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span className="tabular">{t('log.summary', { n: list.length, wa: fromWhatsApp })}</span>
          {filtered && (
            <button type="button" onClick={() => set({ type: null, block: null, tree: null, who: null, src: null })} className="font-semibold text-rose-700 min-h-8">
              {t('log.reset')}
            </button>
          )}
        </div>
      </div>

      {loadError && <p role="alert" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">{t('log.loadError')}</p>}
      {error && <p role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">{error}</p>}

      {list.length === 0 ? (
        <p className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-600">{t('log.empty')}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.day} className="bg-white rounded-xl border border-slate-200 overflow-hidden" aria-label={g.day}>
              <h3 className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-600">
                {new Date(`${g.day}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <ul className="divide-y divide-slate-100">
                {g.items.map((e) => {
                  const Icon = KIND_ICON[e.kind];
                  const deletable = e.kind !== 'issue' && e.kind !== 'treeData';
                  return (
                    <li key={e.key} className="flex items-start gap-3 px-4 py-3">
                      <span className={`mt-0.5 w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center ${KIND_TONE[e.kind]}`} title={t(`log.kind.${e.kind}`)}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                          <span className="font-semibold text-slate-900">{t(`log.kind.${e.kind}`)}</span>
                          {e.treeId ? <TreeLink id={e.treeId} /> : e.block ? <span className="text-slate-700">{t('common.blockN', { n: e.block })}</span> : null}
                          {e.treeId && e.block && <span className="text-xs text-slate-500">{t('common.blockN', { n: e.block })}</span>}
                        </p>
                        <div className="text-sm text-slate-800 min-w-0">{summary(e)}</div>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          {e.timed && <span className="tabular">{new Date(e.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>}
                          {e.who && <span>{workerLabel(e.who)}</span>}
                          {e.source === 'whatsapp' ? <SourceBadge source="whatsapp" /> : <span>{t('log.source.webapp')}</span>}
                        </p>
                        <PhotoStrip photos={e.photos} caption={`${t(`log.kind.${e.kind}`)} · ${e.treeId || e.block || ''}`} />
                      </div>
                      {e.kind === 'issue' ? (
                        <Link to={reportUrl(e.rec.id)} className="shrink-0 min-h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 inline-flex items-center hover:bg-slate-50">
                          {t('log.open')}
                        </Link>
                      ) : deletable ? (
                        <button
                          type="button"
                          disabled={busy === e.key}
                          onClick={() => remove(e)}
                          className="shrink-0 p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                          aria-label={t('rec.delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
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
