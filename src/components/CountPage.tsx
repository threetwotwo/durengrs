import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, Loader2, Search } from 'lucide-react';
import { normalizeTimestamp, useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { reportUrl, setNavigationBlocker, treeUrl, treesUrl, useQueryParams } from '../lib/router';
import { type CropCount, type CropStage, type Harvest, addCountPhotos, removeCropCount, saveCropCount } from '../lib/fieldData';
import {
  type CountKind,
  checkCount,
  countTarget,
  dayCounts,
  expectedBefore,
  pastColumns,
  pastCounts,
  pastedColumn,
  planCount,
  roundSummary,
} from '../lib/recount';
import { caseTitle, isDue, isOpen, sortCases } from '../lib/cases';
import { saveHarvestCycle } from '../lib/insights';
import { formatShortDate, toDateStr, todayStr } from '../lib/treatments';
import { CASE_STATUS_INFO, HEALTH_INFO, IMPROVING, dayTotal, healthOf } from '../shared';
import { improvingNow } from '../lib/trees';
import type { DurianTree, ProblemCase, ReportPhoto } from '../types';
import { PageHeader, btnSecondary, inputCls } from './PageHeader';
import { Link } from './Link';
import { readBy, saveBy } from '../lib/by';
import { useCrops } from './useCrops';

/**
 * Count: the Trees sheet with one new column for the day, typed down like a new column in Google Sheets. One number
 * per tree (its fruit, or its flower clusters); the last counts sit in the dated columns to the left, the tree's
 * open problems to the right, totals at the bottom.
 *
 * - Each number saves by itself (Enter, or leaving the box) as that day's count: the same record a count from
 *   WhatsApp makes (cropCounts, see lib/recount.ts for where it is filed). Typing again replaces it; emptying the box
 *   removes it.
 * - A photo can be added once the tree is counted (shrunk on the phone, uploaded to count-photos/).
 * - A column copied from Google Sheets fills the trees from the box it is pasted into, in the sheet's order.
 * - Numbers typed with no signal stay on the phone and are sent later (Firestore); photos need a signal.
 */

interface Row {
  id: string;
  tree: DurianTree;
  waveDates: string[];
  /** Where a new count of this tree is filed; null with no flowering this season. */
  target: { season: string; stage: CropStage } | null;
  /** The tree's counts of this kind on the day (normally one). */
  day: CropCount[];
  now?: number;
  before?: number;
  past: Map<string, number>;
  photos: Array<{ p: ReportPhoto; href: string }>;
  problems: ProblemCase[];
}

interface Upload {
  key: string;
  state: 'up' | 'err';
  refused?: boolean;
  file: File;
  kind: CountKind;
  date: string;
}

const idOrder = (a: DurianTree, b: DurianTree) => a.block.localeCompare(b.block) || a.id.localeCompare(b.id, undefined, { numeric: true });
const omit = <T,>(o: Record<string, T>, k: string) => {
  if (!(k in o)) return o;
  const { [k]: _gone, ...rest } = o;
  return rest;
};
const group = <T,>(list: T[], keyOfItem: (x: T) => string | undefined) => {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = keyOfItem(x);
    if (!k) continue;
    const l = m.get(k);
    if (l) l.push(x);
    else m.set(k, [x]);
  }
  return m;
};
/** Wider than a phone (Tailwind's sm). */
function useWide() {
  const query = '(min-width: 640px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

const keyOf = (kind: CountKind, date: string, tree: string) => `${kind}|${date}|${tree}`;
const parseKey = (k: string) => {
  const [kind, date, tree] = k.split('|');
  return { kind: kind as CountKind, date, tree };
};
const inputFor = (key: string) => document.querySelector<HTMLInputElement>(`input[data-count="${CSS.escape(key)}"]`);
const DOT: Record<string, string> = { danger: 'bg-rose-500', warn: 'bg-amber-400', info: 'bg-sky-500', good: 'bg-emerald-500', done: 'bg-slate-300' };
const HEALTH_DOT: Record<string, string> = { hijau: 'bg-emerald-500', kuning: 'bg-amber-400', merah: 'bg-rose-600' };
const th = 'px-2.5 text-[11px] font-semibold sm:uppercase sm:tracking-wide whitespace-nowrap border-b border-slate-700 bg-slate-900 text-slate-200';
/** Below the app bar (h-14 and its 1px border), and on a phone above the tab bar. */
const TOP = 'top-[57px]';
const BOTTOM = 'bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] md:bottom-0';

export const CountPage: React.FC = () => {
  const { t, lang, locale } = useT();
  const { trees, cropCounts, harvests, cases, loading } = useFarm();
  const { crops } = useCrops();
  const [params, setParams] = useQueryParams();
  const today = todayStr();
  const kind: CountKind = params.get('what') === 'clusters' ? 'clusters' : 'fruit';
  const dateParam = params.get('date') || '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= today ? dateParam : today;
  const block = params.get('block') || '';
  const fmt = (n: number) => n.toLocaleString(locale);

  const [by, setBy] = useState(readBy);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [inflight, setInflight] = useState<Record<string, true>>({});
  const [uploads, setUploads] = useState<Record<string, Upload[]>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [jump, setJump] = useState('');
  /** The last text sent for each box, so Enter followed by leaving the box saves once. */
  const sent = useRef(new Map<string, string>());
  /** Each tree's own estimate as it was when the page opened (a count saved here replaces it on the tree). */
  const estimates = useRef(new Map<string, { count?: unknown; date?: string }>());
  const focusAfter = useRef<string | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);

  const blocks = useMemo(() => Array.from(new Set(trees.map((x) => x.block).filter(Boolean))).sort(), [trees]);
  const countsByTree = useMemo(() => group(cropCounts, (c) => c.treeId), [cropCounts]);
  const harvestsByTree = useMemo(() => group(harvests, (h: Harvest) => h.treeId), [harvests]);
  const casesByTree = useMemo(() => group(sortCases(cases.filter(isOpen)), (c) => c.treeId), [cases]);

  const allRows: Row[] = useMemo(
    () =>
      [...crops]
        .sort((a, b) => idOrder(a.tree, b.tree))
        .map((crop) => {
          const tree = crop.tree;
          const id = tree.id;
          const tc = countsByTree.get(id) || [];
          const waveDates = crop.waves.map((w) => w.date);
          if (!estimates.current.has(id)) {
            const upd = Math.max(normalizeTimestamp(tree.dateUpdated), normalizeTimestamp(tree.lastReportAt));
            estimates.current.set(id, { count: tree.estimatedFruitCount, date: upd ? toDateStr(new Date(upd)) : undefined });
          }
          const day = dayCounts(tc, waveDates, kind, date);
          return {
            id,
            tree,
            waveDates,
            target: countTarget(crop.waves, kind, date),
            day,
            now: day.length ? dayTotal(day) : undefined,
            before: expectedBefore(tc, harvestsByTree.get(id) || [], waveDates, kind, date, kind === 'fruit' ? estimates.current.get(id) : undefined),
            past: pastCounts(tc, waveDates, kind, date),
            photos: day.flatMap((c) => (c.photos || []).map((p) => ({ p, href: reportUrl(`count:${c.id}`) }))),
            problems: casesByTree.get(id) || [],
          };
        }),
    [crops, countsByTree, harvestsByTree, casesByTree, kind, date]
  );

  /** Blocks with no flowering this season: their trees can't be counted until the block has a flowering date. */
  const unflowered = useMemo(
    () => (block ? [block] : blocks).filter((b) => allRows.some((r) => r.tree.block === b) && !allRows.some((r) => r.tree.block === b && r.waveDates.length)),
    [allRows, block, blocks]
  );
  const rows = useMemo(() => allRows.filter((r) => (!block || r.tree.block === block) && !unflowered.includes(r.tree.block)), [allRows, block, unflowered]);
  const countable = useMemo(() => rows.filter((r) => r.target), [rows]);
  const keys = useMemo(() => countable.map((r) => keyOf(kind, date, r.id)), [countable, kind, date]);
  const wide = useWide();
  // On a phone the two latest rounds, so the day's column is in view without scrolling sideways.
  const dates = useMemo(() => pastColumns(rows.map((r) => r.past), wide ? 3 : 2), [rows, wide]);
  const summary = roundSummary(countable);

  // Fresh values for code that runs after a save or an upload.
  const live = useRef({ allRows, crops, cropCounts, drafts, kind, date, by });
  live.current = { allRows, crops, cropCounts, drafts, kind, date, by };

  // ---------- saving ----------

  const track = (key: string, p: Promise<unknown>) => {
    setInflight((s) => ({ ...s, [key]: true }));
    p.catch((e: any) => {
      console.error('Count save failed:', e);
      sent.current.delete(key);
      setErrors((x) => ({ ...x, [key]: e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError') }));
    }).finally(() => setInflight((s) => omit(s, key)));
  };

  /** Saves one box (its draft, or `rawIn`). False when the number is not valid (the box keeps the focus). */
  const commit = (key: string, rawIn?: string): boolean => {
    const raw = rawIn ?? live.current.drafts[key];
    if (raw === undefined) return true;
    const { kind: k, date: d, tree: treeId } = parseKey(key);
    const row = live.current.allRows.find((r) => r.id === treeId);
    if (!row?.target || k !== live.current.kind || d !== live.current.date) return true;
    const check = checkCount(raw, k);
    if (!check.ok) {
      setErrors((x) => ({ ...x, [key]: t('count.e.max', { max: check.max }) }));
      return false;
    }
    setErrors((x) => omit(x, key));
    if (sent.current.get(key) === raw) return true;
    const value = check.value;
    if (value === null) {
      if (!row.day.length) return true;
      if (row.day.some((c) => c.photos?.length) && !window.confirm(t('count.clear.confirm'))) {
        setDrafts((x) => omit(x, key));
        return true;
      }
      sent.current.set(key, raw);
      track(key, Promise.all(row.day.map((c) => removeCropCount(c.id, c.photos))));
      return true;
    }
    if (row.day.length === 1 && row.now === value) return true;
    const crop = live.current.crops.find((c) => c.tree.id === treeId);
    const plan = crop && planCount({ tree: row.tree, waves: crop.waves, counts: live.current.cropCounts, kind: k, date: d, value, by: live.current.by.trim() });
    if (!plan) return true;
    sent.current.set(key, raw);
    track(key, saveCropCount(plan.count, plan.treeField, plan.replaces));
    return true;
  };

  // ---------- photos ----------

  const setUpload = (tree: string, key: string, patch: Partial<Upload> | null) =>
    setUploads((u) => ({
      ...u,
      [tree]: (u[tree] || []).flatMap((x) => (x.key !== key ? [x] : patch === null ? [] : [{ ...x, ...patch }])),
    }));

  const upload = (tree: string, item: Upload) => {
    setUpload(tree, item.key, { state: 'up', refused: false });
    import('../lib/photoUpload')
      .then((m) => m.uploadTreePhoto(item.file, tree, `${item.date}-${item.key}`))
      .then(async (photo) => {
        const day = live.current.cropCounts.filter((c) => c.treeId === tree && c.date === item.date && (item.kind === 'clusters') === (c.stage === 'clusters'));
        if (!day.length) {
          setMsg(t('count.photo.noCount', { id: tree }));
          return setUpload(tree, item.key, null);
        }
        await addCountPhotos(day[0].id, [photo]);
        setUpload(tree, item.key, null);
      })
      .catch((e) => {
        console.error('Photo upload failed:', e);
        setUpload(tree, item.key, { state: 'err', refused: e?.code === 'storage/unauthorized' });
      });
  };

  const addPhotos = (tree: string, files: FileList | null) => {
    if (!files?.length) return;
    const items: Upload[] = Array.from(files).map((file) => ({ key: Math.random().toString(36).slice(2, 10), state: 'up', file, kind, date }));
    setUploads((u) => ({ ...u, [tree]: [...(u[tree] || []), ...items] }));
    items.forEach((it) => upload(tree, it));
  };

  const sending = Object.values(uploads).some((l) => l.some((x) => x.state === 'up'));
  useEffect(() => {
    if (!sending) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    setNavigationBlocker(() => window.confirm(t('count.photo.leave')));
    window.addEventListener('beforeunload', onUnload);
    return () => {
      setNavigationBlocker(null);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [sending, t]);

  // ---------- moving around ----------

  const focusKey = (key: string | undefined) => {
    const el = key ? inputFor(key) : null;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
    el.scrollIntoView({ block: 'center' });
  };

  const go = () => {
    const raw = jump.trim().toUpperCase().replace(/\s+/g, '');
    if (!raw) return;
    const id = /^\d+$/.test(raw) && block ? `${block}${raw}` : raw;
    const row = allRows.find((r) => r.id.toUpperCase() === id);
    if (!row?.target || unflowered.includes(row.tree.block)) return setMsg(t('count.go.none', { id }));
    setJump('');
    setMsg(null);
    if (rows.includes(row)) return focusKey(keyOf(kind, date, row.id));
    focusAfter.current = row.id;
    setParams({ block: row.tree.block }, { replace: true });
  };
  useEffect(() => {
    const id = focusAfter.current;
    if (id && rows.some((r) => r.id === id)) {
      focusAfter.current = null;
      requestAnimationFrame(() => focusKey(keyOf(kind, date, id)));
    }
  });

  /** A column pasted from Google Sheets: one cell per tree from this box down the sheet; blank cells are skipped. */
  const paste = (key: string, text: string): boolean => {
    const col = pastedColumn(text);
    if (!col) return false;
    const start = rows.findIndex((r) => r.id === parseKey(key).tree);
    const targets = rows.slice(start, start + col.length);
    const next: Record<string, string> = {};
    targets.forEach((r, i) => {
      if (r.target && col[i] !== '') next[keyOf(kind, date, r.id)] = col[i];
    });
    setDrafts((d) => ({ ...d, ...next }));
    Object.entries(next).forEach(([k, v]) => commit(k, v));
    const filled = Object.keys(next).map((k) => parseKey(k).tree);
    setMsg(
      [
        filled.length ? t('count.pasted', { n: filled.length, from: filled[0], to: filled[filled.length - 1] }) : '',
        col.length > targets.length ? t('count.pasted.cut', { n: col.length - targets.length }) : '',
      ]
        .filter(Boolean)
        .join(' ')
    );
    return true;
  };

  // ---------- page ----------

  if (loading && !trees.length) return <div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" />;

  const firstError = Object.entries(errors)[0];
  const refused = Object.values(uploads).some((l) => l.some((x) => x.refused));
  const failed = Object.entries(uploads).find(([, l]) => l.some((x) => x.state === 'err' && !x.refused));
  const saving = Object.keys(inflight).length;
  const total = (d: string) => rows.reduce((s, r) => s + (r.past.get(d) || 0), 0);
  // The three parts of the sheet (header row, rows, totals) share one set of column widths, so they line up while the
  // rows scroll sideways under the header.
  const W = wide ? { id: 84, date: 76, now: 104, photo: 92, status: 76, problems: 280 } : { id: 72, date: 60, now: 88, photo: 88, status: 64, problems: 240 };
  const tableStyle = { width: '100%', minWidth: W.id + dates.length * W.date + W.now + W.photo + W.status + W.problems };
  const table = 'table-fixed text-sm border-separate border-spacing-0';
  const cols = (
    <colgroup>
      <col style={{ width: W.id }} />
      {dates.map((d) => (
        <col key={d} style={{ width: W.date }} />
      ))}
      <col style={{ width: W.now }} />
      <col style={{ width: W.photo }} />
      <col style={{ width: W.status }} />
      <col />
    </colgroup>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(kind === 'clusters' ? 'count.title.clusters' : 'count.title.fruit')}
        description={t('count.desc')}
        actions={
          <Link to={treesUrl({ block: block || null })} className={btnSecondary}>
            {t('count.done')}
          </Link>
        }
      />

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs grid grid-cols-2 lg:grid-cols-[auto_9rem_10rem_12rem_minmax(0,14rem)] gap-2">
        <div role="radiogroup" aria-label={t('count.what')} className="col-span-2 lg:col-span-1 grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
          {(['fruit', 'clusters'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setParams({ what: k === 'fruit' ? null : k }, { replace: true })}
              className={`min-h-10 px-4 rounded-md text-sm font-semibold whitespace-nowrap ${kind === k ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {t(`count.kind.${k}`)}
            </button>
          ))}
        </div>
        <select value={block} onChange={(e) => setParams({ block: e.target.value || null }, { replace: true })} aria-label={t('common.block')} className={inputCls}>
          <option value="">{t('common.allBlocks')}</option>
          {blocks.map((b) => (
            <option key={b} value={b}>
              {t('common.blockN', { n: b })}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          max={today}
          aria-label={t('count.date')}
          title={t('count.date')}
          onChange={(e) => e.target.value && setParams({ date: e.target.value === today ? null : e.target.value }, { replace: true })}
          className={inputCls}
        />
        <input value={by} onChange={(e) => setBy(e.target.value)} onBlur={() => saveBy(by)} placeholder={t('count.by')} aria-label={t('count.by')} autoComplete="name" className={inputCls} />
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                go();
              }
            }}
            placeholder={t('count.go')}
            aria-label={t('count.go')}
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="go"
            className={`${inputCls} pl-9`}
          />
        </div>
      </div>

      {unflowered.map((b) => (
        <NoBloom key={b} block={b} today={today} />
      ))}

      {(firstError || msg || saving > 0 || refused || failed) && (
        <div className="space-y-1 text-sm" role="status">
          {firstError && (
            <p role="alert" className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
              <strong>{parseKey(firstError[0]).tree}</strong> · {firstError[1]}
            </p>
          )}
          {refused && <p className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">{t('count.photo.rules')}</p>}
          {failed && <p className="text-rose-700">{t('count.photo.failed', { id: failed[0] })}</p>}
          {saving > 0 && <p className="text-amber-800">{t('count.sending', { n: saving })}</p>}
          {msg && <p className="text-slate-700">{msg}</p>}
        </div>
      )}

      {rows.length > 0 && (
        // One vertical scroll, the page's. The sheet scrolls sideways on its own; its header row (under the app bar) and
        // totals (above the tab bar) are strips of their own that stay in view and follow it sideways.
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs">
          <div ref={headRef} className={`sticky ${TOP} z-20 overflow-hidden rounded-t-xl`}>
            <table className={table} style={tableStyle}>
              {cols}
              <thead>
                <tr className="h-11">
                  <th scope="col" className={`${th} text-left sticky left-0 z-10 border-r`}>
                    ID
                  </th>
                  {dates.map((d) => (
                    <th key={d} scope="col" className={`${th} text-right`}>
                      {formatShortDate(d)}
                    </th>
                  ))}
                  <th scope="col" className="px-2.5 bg-emerald-700 text-white text-right border-b border-emerald-800 whitespace-nowrap">
                    <span className="block text-[11px] font-bold sm:uppercase sm:tracking-wide">{formatShortDate(date)}</span>
                    <span className="block text-[11px] font-medium text-emerald-100 tabular">
                      {summary.counted}/{countable.length}
                    </span>
                  </th>
                  <th scope="col" className={`${th} text-left`}>
                    <span className="sr-only">{t('count.col.photo')}</span>
                    <Camera className="w-3.5 h-3.5" aria-hidden />
                  </th>
                  <th scope="col" className={`${th} text-center`}>
                    {t('count.col.status')}
                  </th>
                  <th scope="col" className={`${th} text-left`}>
                    {t('count.col.problems')}
                  </th>
                </tr>
              </thead>
            </table>
          </div>

          <div
            ref={bodyRef}
            onScroll={(e) => {
              const x = e.currentTarget.scrollLeft;
              if (headRef.current) headRef.current.scrollLeft = x;
              if (footRef.current) footRef.current.scrollLeft = x;
            }}
            // relative: hidden labels (sr-only) and the photo inputs stay inside the scrolling part instead of widening the page
            className="relative overflow-x-auto overflow-y-hidden overscroll-x-contain"
          >
            <table className={table} style={tableStyle}>
              {cols}
              <tbody>
                {rows.map((r) => {
                  const key = keyOf(kind, date, r.id);
                  const value = drafts[key] ?? (r.now !== undefined ? String(r.now) : '');
                  const bad = !!errors[key];
                  const busy = !!inflight[key];
                  const ups = uploads[r.id] || [];
                  const first = r.problems[0];
                  const tone = first ? (r.problems.some((c) => c.status === 'worse' || isDue(c)) ? 'danger' : CASE_STATUS_INFO[first.status].tone) : null;
                  const health = healthOf(r.tree.condition);
                  const healthText = health ? `${HEALTH_INFO[health].label[lang]}${improvingNow(r.tree) ? ` · ${IMPROVING[lang]}` : ''}` : t('cond.not_assessed');
                  return (
                    <tr key={r.id} className="group">
                      <th scope="row" className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-2.5 py-1.5 text-left border-b border-r border-slate-200 whitespace-nowrap">
                        <Link to={treeUrl(r.id)} className="font-mono font-bold text-emerald-800 hover:underline inline-flex items-center gap-1.5">
                          {r.id}
                          {r.problems.length > 0 && (
                            <span
                              className={`min-w-4 h-4 px-1 rounded-full text-[10px] leading-4 text-center font-sans font-bold ${tone === 'danger' ? 'bg-rose-600 text-white' : 'bg-amber-400 text-slate-900'}`}
                              title={t('trees.problemsN', { n: r.problems.length })}
                            >
                              {r.problems.length}
                            </span>
                          )}
                        </Link>
                      </th>
                      {dates.map((d) => (
                        <td key={d} className="px-2.5 py-1.5 text-right tabular text-slate-600 border-b border-r border-slate-200 group-hover:bg-slate-50">
                          {r.past.get(d) ?? ''}
                        </td>
                      ))}
                      <td className={`p-0 border-b border-x-2 border-b-slate-200 border-x-emerald-600/70 ${r.now !== undefined ? 'bg-emerald-50' : 'bg-white'}`}>
                        {r.target ? (
                          <span className="relative block">
                            <input
                              type="text"
                              inputMode="numeric"
                              enterKeyHint="next"
                              autoComplete="off"
                              data-count={key}
                              value={value}
                              aria-label={`${r.id} · ${formatShortDate(date)}`}
                              aria-invalid={bad || undefined}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => {
                                setDrafts((x) => ({ ...x, [key]: e.target.value }));
                                if (bad) setErrors((x) => omit(x, key));
                              }}
                              onBlur={() => commit(key)}
                              onPaste={(e) => {
                                if (paste(key, e.clipboardData.getData('text'))) e.preventDefault();
                              }}
                              onKeyDown={(e) => {
                                const up = e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey);
                                if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  if (commit(key)) focusKey(keys[keys.indexOf(key) + (up ? -1 : 1)]);
                                } else if (e.key === 'Escape') {
                                  setDrafts((x) => omit(x, key));
                                  setErrors((x) => omit(x, key));
                                }
                              }}
                              className={`w-full h-10 pl-6 pr-2.5 scroll-mt-32 scroll-mb-36 bg-transparent text-right text-base font-bold tabular outline-none focus:bg-white focus:outline-2 focus:-outline-offset-2 ${
                                bad ? 'outline-2 -outline-offset-2 outline-rose-500 text-rose-700' : 'focus:outline-emerald-600 text-slate-900'
                              }`}
                            />
                            {busy && <Loader2 className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" aria-hidden />}
                          </span>
                        ) : (
                          <span className="block px-2.5 text-right text-slate-300" title={t('count.noWave')}>
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-1.5 py-1 border-b border-r border-slate-200 group-hover:bg-slate-50">
                        <span className="flex items-center gap-1">
                          {r.photos[0] && (
                            <Link to={r.photos[0].href} className="relative block w-8 h-8 rounded overflow-hidden bg-slate-200 shrink-0">
                              <img src={r.photos[0].p.thumb || r.photos[0].p.medium || r.photos[0].p.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                              {r.photos.length > 1 && <span className="absolute bottom-0 right-0 px-1 rounded-tl bg-black/60 text-white text-[10px] leading-4">{r.photos.length}</span>}
                            </Link>
                          )}
                          {ups.some((x) => x.state === 'up') && <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" aria-hidden />}
                          {ups
                            .filter((x) => x.state === 'err')
                            .map((x) => (
                              <button key={x.key} type="button" onClick={() => upload(r.id, x)} aria-label={t('count.photo.retry')} className="p-1 text-rose-600 shrink-0">
                                <AlertTriangle className="w-4 h-4" />
                              </button>
                            ))}
                          {r.target && (
                            <label
                              title={r.now === undefined ? t('count.photo.first') : t('count.photo.add', { id: r.id })}
                              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                r.now === undefined ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer focus-within:outline-2 focus-within:outline-emerald-600'
                              }`}
                            >
                              <Camera className="w-4 h-4" aria-hidden />
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                disabled={r.now === undefined}
                                className="sr-only"
                                aria-label={t('count.photo.add', { id: r.id })}
                                onChange={(e) => {
                                  addPhotos(r.id, e.target.files);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          )}
                        </span>
                      </td>
                      <td className="px-2.5 text-center border-b border-r border-slate-200 group-hover:bg-slate-50" title={healthText}>
                        <span className={`inline-block w-2.5 h-2.5 rounded-full align-middle ${health ? HEALTH_DOT[health] : 'border border-slate-300'}`} aria-hidden />
                        <span className="sr-only">{healthText}</span>
                      </td>
                      <td className="px-2.5 py-1.5 border-b border-slate-200 group-hover:bg-slate-50">
                        {first && (
                          <Link
                            to={treeUrl(r.id)}
                            className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-900 min-w-0"
                            title={r.problems.map((c) => `${caseTitle(c, lang)} · ${CASE_STATUS_INFO[c.status].label[lang]}`).join('\n')}
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[tone!]}`} aria-hidden />
                            <span className="truncate">{r.problems.map((c) => caseTitle(c, lang)).join(', ')}</span>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div ref={footRef} className={`sticky ${BOTTOM} z-20 overflow-hidden rounded-b-xl`}>
            <table className={table} style={tableStyle}>
              {cols}
              <tfoot>
                <tr className="font-semibold text-slate-700">
                  <th scope="row" className="sticky left-0 z-10 bg-slate-100 px-2.5 py-2 text-left text-xs border-r border-slate-200 whitespace-nowrap">
                    {t('kebun.total')}
                  </th>
                  {dates.map((d) => (
                    <td key={d} className="bg-slate-100 px-2.5 py-2 text-right tabular">
                      {fmt(total(d))}
                    </td>
                  ))}
                  <td className="bg-emerald-100 px-2.5 py-1.5 text-right tabular whitespace-nowrap">
                    <span className="block text-slate-900">{fmt(summary.total)}</span>
                    {summary.change !== null && (
                      <span
                        className={`block text-[11px] ${summary.change < 0 ? 'text-rose-700' : summary.change > 0 ? 'text-emerald-800' : 'text-slate-500'}`}
                        title={t('count.change.title')}
                      >
                        {summary.change > 0 ? '+' : summary.change < 0 ? '−' : '±'}
                        {fmt(Math.abs(summary.change))}
                      </span>
                    )}
                  </td>
                  <td colSpan={3} className="bg-slate-100" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {rows.length === 0 && !unflowered.length && <p className="p-8 text-center text-sm text-slate-600 bg-white rounded-xl border border-slate-200">{t('kebun.empty')}</p>}
    </div>
  );
};

/** A block with no flowering date this season: set it here and its trees can be counted. */
const NoBloom: React.FC<{ block: string; today: string }> = ({ block, today }) => {
  const { t } = useT();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!value || value > today) return setError(t('sched.hv.future'));
    setSaving(true);
    setError(null);
    try {
      await saveHarvestCycle(block, value);
    } catch (e) {
      console.error('Flowering date save failed:', e);
      setError(t('sched.hv.saveError'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="flex-1 min-w-[14rem] text-sm text-amber-900 flex gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
        {t('count.noBloom', { block })}
      </p>
      <span className="flex items-center gap-2">
        <input
          type="date"
          max={today}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={t('hv2.flowered.edit', { block })}
          className="h-10 px-2 rounded-lg border border-amber-300 bg-white text-sm text-slate-900"
        />
        <button type="button" onClick={save} disabled={!value || saving} className="min-h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {saving ? t('rec.saving') : t('count.noBloom.save')}
        </button>
      </span>
      {error && <p role="alert" className="w-full text-xs text-rose-700">{error}</p>}
    </div>
  );
};
