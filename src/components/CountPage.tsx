import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Camera, Check, ListFilter, Loader2, Search, X } from 'lucide-react';
import { normalizeTimestamp, useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { caseUrl, reportUrl, setNavigationBlocker, treeUrl, useQueryParams } from '../lib/router';
import { CROP_STAGES, type CropCount, type CropStage, type Harvest, addCountPhotos, removeCropCount, saveCropCount } from '../lib/fieldData';
import { type PastCount, checkCount, expectedBefore, isNewestOfKind, pastCounts, pastedColumn, roundSummary } from '../lib/recount';
import { caseTitle, isDue, sortCases, isOpen } from '../lib/cases';
import { saveHarvestCycle } from '../lib/insights';
import { formatShortDate, toDateStr, todayStr } from '../lib/treatments';
import type { TreeCrop } from '../lib/crop';
import type { UploadedPhoto } from '../lib/photoUpload';
import { CASE_STATUS_INFO, healthOf } from '../shared';
import type { DurianTree, ProblemCase } from '../types';
import { PageHeader, inputCls } from './PageHeader';
import { Link } from './Link';
import { HealthPill } from './FieldStage';
import { readBy, saveBy } from './ReportChange';
import { useCrops } from './useCrops';

/**
 * Count the trees: the admin walks the farm and types one number per tree (fruit on the tree by default, or flower
 * clusters, fruit set, kept after thinning), tree after tree, the way a new dated column is filled in Google Sheets.
 *
 * - Every number saves by itself (Enter or leaving the box) as that day's count, like a count sent from WhatsApp:
 *   cropCounts/{tree}_{flowering}_{stage}_{date}, and the tree's own figure when it is its newest count.
 * - Each row shows what the tree held before (its last counts, fruit picked since) and its open problems.
 * - A photo can go with each count (shrunk on the phone, uploaded to count-photos/).
 * - A column copied from Google Sheets fills the trees from the box it is pasted into, in the list's order.
 * - Firestore keeps the numbers on the phone with no signal and sends them later; photos need a signal.
 */

interface Wave {
  date: string;
  partial: boolean;
}

interface Row {
  id: string;
  tree: DurianTree;
  waves: Wave[];
  /** Flowerings a count on the round's date can be filed against (flowered on or before that day). */
  open: Wave[];
  /** Counts made on the round's date, per flowering. */
  saved: Map<string, CropCount>;
  now?: number;
  before?: number;
  history: PastCount[];
  /** The tree's own estimate, shown when it was never counted. */
  estimate?: number;
  picked: number;
  problems: ProblemCase[];
}

interface Handlers {
  onDraft: (key: string, v: string) => void;
  onCommit: (key: string) => boolean;
  onMove: (key: string, dir: 1 | -1) => void;
  onFocusRow: (tree: string) => void;
  onPaste: (key: string, text: string) => boolean;
  onPhotos: (tree: string, files: FileList | null) => void;
  onRetry: (tree: string, it: Pending) => void;
  onRemove: (tree: string, it: Pending) => void;
}

interface Pending {
  key: string;
  preview: string;
  state: 'up' | 'wait' | 'err';
  /** Cloud Storage refused the photo: storage.rules has not been published with the count-photos rule. */
  refused?: boolean;
  file: File;
  stage: CropStage;
  date: string;
  photo?: UploadedPhoto;
}

const NONE: Pending[] = [];
/** The recount first (the usual walk), then the season's earlier counts in order. */
const STAGE_ORDER: CropStage[] = ['onTree', ...CROP_STAGES.filter((s) => s !== 'onTree')];
const idOrder = (a: DurianTree, b: DurianTree) => a.block.localeCompare(b.block) || a.id.localeCompare(b.id, undefined, { numeric: true });
const omit = <T,>(o: Record<string, T>, k: string) => {
  if (!(k in o)) return o;
  const { [k]: _gone, ...rest } = o;
  return rest;
};
const keyOf = (stage: CropStage, date: string, tree: string, wave: string) => `${stage}|${date}|${tree}|${wave}`;
const parseKey = (k: string) => {
  const [stage, date, tree, wave] = k.split('|');
  return { stage: stage as CropStage, date, tree, wave };
};
const inputFor = (key: string) => document.querySelector<HTMLInputElement>(`input[data-count="${CSS.escape(key)}"]`);

const TONE: Record<string, string> = {
  danger: 'bg-rose-50 text-rose-800 border-rose-300',
  warn: 'bg-amber-50 text-amber-900 border-amber-300',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  good: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  done: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const CountPage: React.FC = () => {
  const { t, locale } = useT();
  const { trees, cropCounts, harvests, cases, loading } = useFarm();
  const { crops } = useCrops();
  const [params, setParams] = useQueryParams();
  const today = todayStr();
  const what = params.get('what') || '';
  const stage: CropStage = (CROP_STAGES as readonly string[]).includes(what) ? (what as CropStage) : 'onTree';
  const dateParam = params.get('date') || '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= today ? dateParam : today;
  const block = params.get('block') || '';
  const fmt = (n: number) => n.toLocaleString(locale);

  const [by, setBy] = useState(readBy);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [inflight, setInflight] = useState<Record<string, true>>({});
  const [pending, setPending] = useState<Record<string, Pending[]>>({});
  const [todo, setTodo] = useState<Set<string> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [jump, setJump] = useState('');
  const [jumpMiss, setJumpMiss] = useState<string | null>(null);
  /** The last text sent for each box, so Enter followed by leaving the box saves once. */
  const sent = useRef(new Map<string, string>());
  /** Each tree's own estimate as it was when the page opened (a count saved here replaces it on the tree). */
  const estimates = useRef(new Map<string, { count?: unknown; date?: string }>());
  const lastTree = useRef<string | null>(null);
  const focusAfter = useRef<string | null>(null);

  const blocks = useMemo(() => Array.from(new Set(trees.map((x) => x.block).filter(Boolean))).sort(), [trees]);

  const countsByTree = useMemo(() => {
    const m = new Map<string, CropCount[]>();
    for (const c of cropCounts) {
      const list = m.get(c.treeId);
      if (list) list.push(c);
      else m.set(c.treeId, [c]);
    }
    return m;
  }, [cropCounts]);
  const harvestsByTree = useMemo(() => {
    const m = new Map<string, Harvest[]>();
    for (const h of harvests) {
      if (!h.treeId) continue;
      const list = m.get(h.treeId);
      if (list) list.push(h);
      else m.set(h.treeId, [h]);
    }
    return m;
  }, [harvests]);
  const casesByTree = useMemo(() => {
    const m = new Map<string, ProblemCase[]>();
    for (const c of sortCases(cases.filter(isOpen))) {
      const list = m.get(c.treeId);
      if (list) list.push(c);
      else m.set(c.treeId, [c]);
    }
    return m;
  }, [cases]);

  const allRows: Row[] = useMemo(
    () =>
      [...crops]
        .sort((a, b) => idOrder(a.tree, b.tree))
        .map((crop: TreeCrop) => {
          const tree = crop.tree;
          const id = tree.id;
          const tc = countsByTree.get(id) || [];
          const th = harvestsByTree.get(id) || [];
          const waves = crop.waves.map((w) => ({ date: w.date, partial: w.partial }));
          const waveDates = waves.map((w) => w.date);
          if (!estimates.current.has(id)) {
            const upd = Math.max(normalizeTimestamp(tree.dateUpdated), normalizeTimestamp(tree.lastReportAt));
            estimates.current.set(id, { count: tree.estimatedFruitCount, date: upd ? toDateStr(new Date(upd)) : undefined });
          }
          const saved = new Map(tc.filter((c) => c.stage === stage && c.date === date && waveDates.includes(c.season)).map((c) => [c.season, c] as const));
          const now = saved.size ? [...saved.values()].reduce((s, c) => s + c.count, 0) : undefined;
          const fruit = stage !== 'clusters';
          const history = pastCounts(tc, waveDates, stage, date);
          const before = expectedBefore(tc, th, waveDates, stage, date, fruit ? estimates.current.get(id) : undefined);
          const picked = fruit && history[0] ? th.filter((h) => h.date > history[0].date && h.date <= date).reduce((s, h) => s + (h.fruits || 0), 0) : 0;
          return {
            id,
            tree,
            waves,
            open: waves.filter((w) => w.date <= date),
            saved,
            now,
            before,
            history,
            estimate: !history.length && fruit ? before : undefined,
            picked,
            problems: casesByTree.get(id) || [],
          };
        }),
    [crops, countsByTree, harvestsByTree, casesByTree, stage, date]
  );

  const rows = useMemo(() => allRows.filter((r) => (!block || r.tree.block === block) && (!todo || todo.has(r.id))), [allRows, block, todo]);
  const countable = useMemo(() => rows.filter((r) => r.open.length > 0), [rows]);
  const keys = useMemo(() => countable.flatMap((r) => r.open.map((w) => keyOf(stage, date, r.id, w.date))), [countable, stage, date]);
  const summary = roundSummary(countable);
  const perBlock = useMemo(() => {
    const m = new Map<string, { counted: number; total: number }>();
    for (const r of allRows) {
      if (!r.open.length) continue;
      const x = m.get(r.tree.block) || { counted: 0, total: 0 };
      x.total++;
      if (r.now !== undefined) x.counted++;
      m.set(r.tree.block, x);
    }
    return m;
  }, [allRows]);
  /** Blocks whose trees have no flowering this season: one date for the block makes them countable. */
  const unflowered = useMemo(
    () => (block ? [block] : blocks).filter((b) => allRows.some((r) => r.tree.block === b) && !allRows.some((r) => r.tree.block === b && r.waves.length)),
    [allRows, block, blocks]
  );

  // Fresh values for callbacks that run after an upload or a save.
  const live = useRef({ allRows, cropCounts, drafts, stage, date, by });
  live.current = { allRows, cropCounts, drafts, stage, date, by };

  // ---------- photos ----------

  const setItem = (tree: string, key: string, patch: Partial<Pending> | null) =>
    setPending((p) => {
      const list = p[tree] || [];
      const next = patch === null ? list.filter((x) => x.key !== key) : list.map((x) => (x.key === key ? { ...x, ...patch } : x));
      if (patch === null) list.filter((x) => x.key === key).forEach((x) => URL.revokeObjectURL(x.preview));
      return { ...p, [tree]: next };
    });

  /** A count of this tree on the photo's round, if one is saved. */
  const countFor = (tree: string, st: CropStage, d: string) => live.current.cropCounts.find((c) => c.treeId === tree && c.stage === st && c.date === d);

  const upload = (tree: string, item: Pending) => {
    setItem(tree, item.key, { state: 'up' });
    import('../lib/photoUpload')
      .then((m) => m.uploadTreePhoto(item.file, tree, `${item.date}-${item.key}`))
      .then(async (photo) => {
        const c = countFor(tree, item.stage, item.date);
        if (!c) return setItem(tree, item.key, { state: 'wait', photo });
        try {
          await addCountPhotos(c.id, [photo]);
          setItem(tree, item.key, null);
        } catch (e) {
          console.error('Attach photo failed:', e);
          setItem(tree, item.key, { state: 'wait', photo });
        }
      })
      .catch((e) => {
        console.error('Photo upload failed:', e);
        setItem(tree, item.key, { state: 'err', refused: e?.code === 'storage/unauthorized' });
      });
  };

  const addPhotos = (tree: string, files: FileList | null) => {
    if (!files?.length) return;
    const items: Pending[] = Array.from(files).map((file) => ({
      key: Math.random().toString(36).slice(2, 10),
      preview: URL.createObjectURL(file),
      state: 'up',
      file,
      stage,
      date,
    }));
    setPending((p) => ({ ...p, [tree]: [...(p[tree] || []), ...items] }));
    items.forEach((it) => upload(tree, it));
  };

  /** Uploaded photos of this tree waiting for its count on this round: they go with the count being saved. */
  const takeWaiting = (tree: string, st: CropStage, d: string): Pending[] => {
    const list = (pending[tree] || []).filter((x) => x.state === 'wait' && x.photo && x.stage === st && x.date === d);
    if (list.length) setPending((p) => ({ ...p, [tree]: (p[tree] || []).filter((x) => !list.includes(x)) }));
    return list;
  };

  const unsaved = Object.values(pending).reduce((n, l) => n + l.length, 0);
  useEffect(() => {
    if (!unsaved) return;
    const ask = () => window.confirm(t('count.photo.leave'));
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    setNavigationBlocker(ask);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      setNavigationBlocker(null);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [unsaved, t]);

  // ---------- saving ----------

  const track = (key: string, p: Promise<unknown>, onFail?: () => void) => {
    setInflight((s) => ({ ...s, [key]: true }));
    p.catch((e: any) => {
      console.error('Count save failed:', e);
      sent.current.delete(key);
      setErrors((x) => ({ ...x, [key]: e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError') }));
      onFail?.();
    }).finally(() => setInflight((s) => omit(s, key)));
  };

  /** Saves one box (its draft, or `rawIn`). False when the number is not valid (the box keeps the focus). */
  const commit = (key: string, rawIn?: string): boolean => {
    const raw = rawIn ?? live.current.drafts[key];
    if (raw === undefined) return true;
    const { stage: st, date: d, tree: treeId, wave } = parseKey(key);
    const row = live.current.allRows.find((r) => r.id === treeId);
    if (!row || st !== live.current.stage || d !== live.current.date) return true;
    const check = checkCount(raw, st);
    if (!check.ok) {
      setErrors((x) => ({ ...x, [key]: t('count.e.max', { max: check.max }) }));
      return false;
    }
    setErrors((x) => omit(x, key));
    if (sent.current.get(key) === raw) return true;
    const saved = row.saved.get(wave);
    const value = check.value;
    if (value === null) {
      if (!saved) return true;
      if (saved.photos?.length && !window.confirm(t('count.clear.confirm'))) {
        setDrafts((x) => omit(x, key));
        return true;
      }
      sent.current.set(key, raw);
      track(key, removeCropCount(saved.id, saved.photos));
      return true;
    }
    if (saved && saved.count === value) return true;
    const tree = row.tree;
    const field = st === 'clusters' ? 'floweringClusters' : 'estimatedFruitCount';
    const toTree = row.waves.length <= 1 && isNewestOfKind(live.current.cropCounts, tree.id, st, d);
    const waiting = takeWaiting(tree.id, st, d);
    const photos = [...(saved?.photos || []), ...waiting.map((w) => w.photo!)];
    const name = live.current.by.trim();
    sent.current.set(key, raw);
    track(
      key,
      saveCropCount(
        { treeId: tree.id, block: tree.block, season: wave, stage: st, count: value, date: d, by: name || undefined, note: saved?.note, photos: photos.length ? photos : undefined },
        toTree ? { field, from: tree[field] as number | undefined } : undefined
      ).then(() => waiting.forEach((w) => URL.revokeObjectURL(w.preview))),
      () => setPending((p) => ({ ...p, [tree.id]: [...waiting, ...(p[tree.id] || [])] }))
    );
    return true;
  };

  // ---------- moving around ----------

  const focusKey = useCallback((key: string | undefined) => {
    if (!key) return;
    const el = inputFor(key);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const focusRow = (r: Row) => {
    if (r.open.length) return focusKey(keyOf(stage, date, r.id, r.open[0].date));
    document.getElementById(`count-${r.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const nextTodo = () => {
    const list = countable;
    if (!list.length) return;
    const from = Math.max(0, list.findIndex((r) => r.id === lastTree.current) + 1);
    const order = [...list.slice(from), ...list.slice(0, from)];
    const r = order.find((x) => x.now === undefined);
    if (r) focusRow(r);
  };

  const go = () => {
    const raw = jump.trim().toUpperCase().replace(/\s+/g, '');
    if (!raw) return;
    const id = /^\d+$/.test(raw) && block ? `${block}${raw}` : raw;
    const here = rows.find((r) => r.id.toUpperCase() === id);
    if (here) {
      setJump('');
      setJumpMiss(null);
      return focusRow(here);
    }
    const elsewhere = allRows.find((r) => r.id.toUpperCase() === id);
    if (elsewhere) {
      setJump('');
      setJumpMiss(null);
      setTodo(null);
      focusAfter.current = elsewhere.id;
      return setParams({ block: elsewhere.tree.block }, { replace: true });
    }
    setJumpMiss(t('count.go.none', { id }));
  };
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    const r = rows.find((x) => x.id === id);
    if (r) {
      focusAfter.current = null;
      requestAnimationFrame(() => focusRow(r));
    }
  });

  /** A column pasted from Google Sheets: one cell per tree from this box down the list; blank cells are skipped. */
  const paste = (key: string, text: string): boolean => {
    const col = pastedColumn(text);
    if (!col) return false;
    const { tree, wave } = parseKey(key);
    const start = rows.findIndex((r) => r.id === tree);
    const targets = rows.slice(start, start + col.length);
    const next: Record<string, string> = {};
    targets.forEach((r, i) => {
      const w = i === 0 ? wave : r.open[0]?.date;
      if (w && col[i] !== '') next[keyOf(stage, date, r.id, w)] = col[i];
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

  // One set of handlers for every row, calling the latest code: rows only redraw when their own boxes change.
  const latest = useRef<Handlers>(null!);
  latest.current = {
    onDraft: (key, v) => {
      setDrafts((d) => ({ ...d, [key]: v }));
      setErrors((x) => omit(x, key));
    },
    onCommit: commit,
    onMove: (key, dir) => focusKey(keys[keys.indexOf(key) + dir]),
    onFocusRow: (id) => (lastTree.current = id),
    onPaste: paste,
    onPhotos: addPhotos,
    onRetry: upload,
    onRemove: (tree, it) => setItem(tree, it.key, null),
  };
  const handlers = useMemo<Handlers>(
    () => ({
      onDraft: (...a) => latest.current.onDraft(...a),
      onCommit: (...a) => latest.current.onCommit(...a),
      onMove: (...a) => latest.current.onMove(...a),
      onFocusRow: (...a) => latest.current.onFocusRow(...a),
      onPaste: (...a) => latest.current.onPaste(...a),
      onPhotos: (...a) => latest.current.onPhotos(...a),
      onRetry: (...a) => latest.current.onRetry(...a),
      onRemove: (...a) => latest.current.onRemove(...a),
    }),
    []
  );

  // ---------- page ----------

  const sending = Object.keys(inflight).length;
  const pct = summary.trees ? Math.round((summary.counted / countable.length) * 100) : 0;
  const unit = stage === 'clusters' ? '' : ` ${t('hv2.fruit')}`;

  if (loading && !trees.length) return <div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" />;

  return (
    <div className="space-y-4">
      <PageHeader title={t('count.title')} description={t('count.desc')} />

      <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-3">
        <div role="radiogroup" aria-label={t('count.what')} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
          {STAGE_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={stage === s}
              onClick={() => setParams({ what: s === 'onTree' ? null : s }, { replace: true })}
              className={`shrink-0 min-h-10 px-3.5 rounded-full border text-sm font-semibold ${stage === s ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
            >
              {t(`crop.stage.${s}`)}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1" role="group" aria-label={t('common.block')}>
          {['', ...blocks].map((b) => {
            const on = block === b;
            const pb = b ? perBlock.get(b) : null;
            return (
              <button
                key={b || 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setTodo(null);
                  setParams({ block: b || null }, { replace: true });
                }}
                className={`shrink-0 min-h-10 px-3 rounded-full border text-sm font-semibold inline-flex items-center gap-1.5 ${on ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
              >
                {b ? t('common.blockN', { n: b }) : t('common.allBlocks')}
                {pb && (
                  <span className={`text-xs tabular ${on ? 'text-slate-300' : pb.counted === pb.total ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {pb.counted}/{pb.total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-[11rem_14rem] gap-2">
          <label className="text-xs font-semibold text-slate-600 space-y-1">
            <span>{t('count.date')}</span>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setParams({ date: e.target.value === today ? null : e.target.value }, { replace: true })}
              className={inputCls}
            />
          </label>
          <label className="text-xs font-semibold text-slate-600 space-y-1">
            <span>{t('count.by')}</span>
            <input
              value={by}
              onChange={(e) => setBy(e.target.value)}
              onBlur={() => saveBy(by)}
              autoComplete="name"
              className={inputCls}
            />
          </label>
        </div>
      </div>

      {/* Where the walk stands: stays in view while scrolling. */}
      <div className="sticky top-14 z-20 -mx-4 sm:mx-0 px-4 sm:px-3 py-2 bg-slate-100/95 backdrop-blur sm:rounded-xl sm:bg-white/95 sm:border sm:border-slate-200 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-sm font-bold text-slate-900 tabular" aria-live="polite">
            {t('count.progress', { n: summary.counted, total: countable.length })}
            {summary.counted > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-600">
                {t('count.total', { n: fmt(summary.total) })}
                {unit}
                {summary.change !== null && (
                  <span className={summary.change < 0 ? 'text-rose-700 font-semibold' : summary.change > 0 ? 'text-emerald-700 font-semibold' : ''}>
                    {' · '}
                    {summary.change < 0
                      ? t('count.change.down', { n: fmt(-summary.change) })
                      : summary.change > 0
                        ? t('count.change.up', { n: fmt(summary.change) })
                        : t('count.change.same')}
                  </span>
                )}
              </span>
            )}
          </p>
          <span className="w-full sm:w-auto sm:ml-auto flex items-center gap-1.5">
            <span className="relative flex-1 sm:flex-none sm:w-36">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
              <input
                value={jump}
                onChange={(e) => {
                  setJump(e.target.value);
                  setJumpMiss(null);
                }}
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
                className="w-full h-9 pl-8 pr-2 rounded-lg border border-slate-300 bg-white text-sm font-mono placeholder:font-sans placeholder:text-slate-500 focus:outline-2 focus:outline-emerald-500"
              />
            </span>
            <button
              type="button"
              aria-pressed={!!todo}
              title={t('count.todo')}
              aria-label={t('count.todo')}
              onClick={() => setTodo(todo ? null : new Set(allRows.filter((r) => r.open.length && r.now === undefined).map((r) => r.id)))}
              className={`shrink-0 min-h-9 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 ${todo ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-700'}`}
            >
              <ListFilter className="w-3.5 h-3.5" aria-hidden />
              <span className="hidden sm:inline">{t('count.todo')}</span>
            </button>
            {summary.counted < countable.length ? (
              <button type="button" onClick={nextTodo} className="shrink-0 min-h-9 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1">
                <span className="sm:hidden">{t('count.next.short')}</span>
                <span className="hidden sm:inline">{t('count.next')}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden />
              </button>
            ) : countable.length > 0 ? (
              <span className="shrink-0 text-xs font-bold text-emerald-700 inline-flex items-center gap-1">
                <Check className="w-3.5 h-3.5" aria-hidden />
                {t('count.allDone')}
              </span>
            ) : null}
          </span>
        </div>
        {jumpMiss && <p role="alert" className="text-xs text-rose-700 font-medium">{jumpMiss}</p>}
        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden" aria-hidden>
          <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        {sending > 0 && <p className="text-xs text-amber-800">{t('count.sending', { n: sending })}</p>}
        {msg && (
          <p role="status" className="text-xs text-slate-700 flex items-start gap-2">
            <span className="flex-1">{msg}</span>
            <button type="button" onClick={() => setMsg(null)} className="text-slate-500 hover:text-slate-800" aria-label={t('common.close')}>
              <X className="w-3.5 h-3.5" />
            </button>
          </p>
        )}
      </div>

      {unflowered.map((b) => (
        <NoBloom key={b} block={b} today={today} />
      ))}

      {(block ? [block] : blocks).map((b) => {
        const list = rows.filter((r) => r.tree.block === b && r.waves.length > 0);
        if (!list.length) return null;
        const pb = perBlock.get(b);
        return (
          <section key={b} aria-labelledby={`count-b-${b}`} className="space-y-1.5">
            {!block && (
              <h2 id={`count-b-${b}`} className="text-sm font-bold text-slate-900 px-1">
                {t('common.blockN', { n: b })} {pb && <span className="font-medium text-slate-500 tabular">· {t('count.block.line', { n: pb.counted, total: pb.total })}</span>}
              </h2>
            )}
            {block && <h2 id={`count-b-${b}`} className="sr-only">{t('common.blockN', { n: b })}</h2>}
            <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {list.map((r) => (
                <CountRow
                  key={r.id}
                  r={r}
                  stage={stage}
                  date={date}
                  drafts={drafts}
                  errors={errors}
                  inflight={inflight}
                  pending={pending[r.id] || NONE}
                  h={handlers}
                />
              ))}
            </ul>
          </section>
        );
      })}

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
    <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 flex flex-wrap items-end gap-3">
      <p className="flex-1 min-w-[14rem] text-sm text-amber-900 flex gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
        {t('count.noBloom', { block })}
      </p>
      <label className="text-xs font-semibold text-amber-900 space-y-1">
        <span className="block">{t('count.noBloom.set')}</span>
        <input type="date" max={today} value={value} onChange={(e) => setValue(e.target.value)} className="h-10 px-2 rounded-lg border border-amber-300 bg-white text-sm text-slate-900" />
      </label>
      <button type="button" onClick={save} disabled={!value || saving} className="min-h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
        {saving ? t('rec.saving') : t('count.noBloom.save')}
      </button>
      {error && <p role="alert" className="w-full text-xs text-rose-700">{error}</p>}
    </div>
  );
};

/** One tree: what it held before, its open problems, the box for today's count (one per flowering), and photos. */
interface RowProps {
  r: Row;
  stage: CropStage;
  date: string;
  drafts: Record<string, string>;
  errors: Record<string, string>;
  inflight: Record<string, true>;
  pending: Pending[];
  h: Handlers;
}

/** Redraw a row only when its tree's data or one of its own boxes changed. */
const sameRow = (a: RowProps, b: RowProps) =>
  a.r === b.r &&
  a.stage === b.stage &&
  a.date === b.date &&
  a.pending === b.pending &&
  a.h === b.h &&
  a.r.open.every((w) => {
    const k = keyOf(a.stage, a.date, a.r.id, w.date);
    return a.drafts[k] === b.drafts[k] && a.errors[k] === b.errors[k] && a.inflight[k] === b.inflight[k];
  });

const CountRow = React.memo(function CountRow({ r, stage, date, drafts, errors, inflight, pending, h }: RowProps) {
  const { t, lang } = useT();
  const health = healthOf(r.tree.condition);
  const savedPhotos = [...r.saved.values()].flatMap((c) => (c.photos || []).map((p, i) => ({ p, href: reportUrl(`count:${c.id}`), k: `${c.id}-${i}` })));
  const rowErrors = r.open.map((w) => errors[keyOf(stage, date, r.id, w.date)]).filter(Boolean);
  const delta = r.now !== undefined && r.before !== undefined ? r.now - r.before : null;
  const multi = r.waves.length > 1;

  return (
    <li id={`count-${r.id}`} className={`px-3 sm:px-4 py-3 flex gap-3 scroll-mt-32 ${r.now !== undefined ? 'bg-emerald-50/50' : ''}`}>
      <div className="min-w-0 flex-1 space-y-1.5 lg:space-y-0 lg:grid lg:grid-cols-[9rem_minmax(0,16rem)_minmax(0,1fr)] lg:gap-4 lg:items-center">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link to={treeUrl(r.id)} className="font-mono text-lg font-bold text-slate-900 hover:text-emerald-700">
            {r.id}
          </Link>
          <span className="text-xs text-slate-500">{r.tree.variant}</span>
          {health && health !== 'hijau' && <HealthPill health={health} />}
        </div>

        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-xs text-slate-500 tabular" aria-label={t('count.before', { n: r.before ?? '—' })}>
          {r.history.length ? (
            r.history.map((h, i) => (
              <span key={h.date} title={h.stage !== stage ? t(`crop.stage.${h.stage}`) : undefined} className={`whitespace-nowrap ${i === 2 ? 'hidden sm:inline' : ''}`}>
                {formatShortDate(h.date)} <span className={`font-bold ${i === 0 ? 'text-slate-900 text-sm' : 'text-slate-600'}`}>{h.count}</span>
              </span>
            ))
          ) : r.estimate !== undefined ? (
            <span>{t('count.estimate', { n: r.estimate })}</span>
          ) : (
            <span className="text-slate-400">{t('count.none')}</span>
          )}
          {r.picked > 0 && <span className="text-amber-800 whitespace-nowrap">{t('count.picked', { n: r.picked })}</span>}
        </p>

        <div className="min-w-0 space-y-1.5">
          {r.problems.length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label={t('count.problems')}>
              {r.problems.slice(0, 3).map((c) => {
                const info = CASE_STATUS_INFO[c.status];
                const tone = isDue(c) ? 'danger' : info.tone;
                return (
                  <li key={c.id}>
                    <Link to={caseUrl(c.id)} className={`inline-block px-2 py-0.5 rounded-lg border text-xs leading-snug hover:brightness-95 ${TONE[tone]}`}>
                      <span className="font-semibold">{caseTitle(c, lang)}</span> · {info.label[lang]}
                    </Link>
                  </li>
                );
              })}
              {r.problems.length > 3 && <li className="text-xs text-slate-500 self-center">{t('count.problems.more', { n: r.problems.length - 3 })}</li>}
            </ul>
          )}
          {(savedPhotos.length > 0 || pending.length > 0) && (
            <ul className="flex flex-wrap gap-1.5">
              {savedPhotos.map(({ p, href, k }) => (
                <li key={k}>
                  <Link to={href} className="block w-12 h-12 rounded-lg overflow-hidden bg-slate-200">
                    <img src={p.thumb || p.medium || p.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </Link>
                </li>
              ))}
              {pending.map((it) => (
                <li key={it.key} className="relative w-12 h-12">
                  <button
                    type="button"
                    disabled={it.state !== 'err'}
                    onClick={() => h.onRetry(r.id, it)}
                    title={it.state === 'err' ? t('count.photo.failed') : it.state === 'wait' ? t('count.photo.wait') : undefined}
                    className={`block w-12 h-12 rounded-lg overflow-hidden bg-slate-200 ring-2 ${it.state === 'err' ? 'ring-rose-500' : it.state === 'wait' ? 'ring-amber-400' : 'ring-transparent'}`}
                  >
                    <img src={it.preview} alt="" className={`w-full h-full object-cover ${it.state === 'up' ? 'opacity-50' : ''}`} />
                    {it.state === 'up' && <Loader2 className="w-5 h-5 text-white absolute inset-0 m-auto animate-spin" aria-hidden />}
                    {it.state === 'err' && <AlertTriangle className="w-5 h-5 text-rose-600 absolute inset-0 m-auto" aria-hidden />}
                  </button>
                  {it.state !== 'up' && (
                    <button
                      type="button"
                      onClick={() => h.onRemove(r.id, it)}
                      aria-label={t('count.photo.remove')}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </li>
              ))}
              {pending.some((x) => x.state === 'wait') && <li className="text-xs text-amber-800 self-center">{t('count.photo.wait')}</li>}
              {pending.some((x) => x.state === 'err') && (
                <li className="text-xs text-rose-700 self-center">{t(pending.some((x) => x.refused) ? 'count.photo.rules' : 'count.photo.failed')}</li>
              )}
            </ul>
          )}
          {rowErrors.length > 0 && (
            <p role="alert" className="text-xs font-semibold text-rose-700">
              {rowErrors[0]}
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 flex items-start gap-2">
        <div className="space-y-1">
          {r.open.length === 0 && <p className="w-24 text-xs text-slate-500 text-right pt-1">{r.waves.length ? t('count.waveLater') : t('count.noWave')}</p>}
          {r.open.map((w) => {
            const key = keyOf(stage, date, r.id, w.date);
            const saved = r.saved.get(w.date);
            const savedText = saved ? String(saved.count) : '';
            const value = drafts[key] ?? savedText;
            const check = checkCount(value, stage);
            const done = !!saved && check.ok && check.value === saved.count;
            const busy = !!inflight[key];
            const bad = !!errors[key];
            const label = `${r.id}${multi ? ` · ${t('count.wave', { date: formatShortDate(w.date) })}` : ''} · ${t(`crop.stage.${stage}`)}`;
            return (
              <div key={w.date}>
                {multi && (
                  <p className="text-[11px] leading-tight text-slate-500 text-right mb-0.5 whitespace-nowrap">
                    {formatShortDate(w.date)}
                    {w.partial ? ` · ${t('guide.wave.branches')}` : ''}
                  </p>
                )}
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    enterKeyHint="next"
                    autoComplete="off"
                    data-count={key}
                    value={value}
                    aria-label={label}
                    aria-invalid={bad || undefined}
                    onFocus={(e) => {
                      h.onFocusRow(r.id);
                      e.currentTarget.select();
                    }}
                    onChange={(e) => h.onDraft(key, e.target.value)}
                    onBlur={() => h.onCommit(key)}
                    onPaste={(e) => {
                      if (h.onPaste(key, e.clipboardData.getData('text'))) e.preventDefault();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (h.onCommit(key)) h.onMove(key, e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1);
                      } else if (e.key === 'Escape') {
                        h.onDraft(key, savedText);
                      }
                    }}
                    className={`w-24 sm:w-28 h-12 pl-7 pr-3 rounded-xl border-2 text-right text-xl font-bold tabular text-slate-900 bg-white focus:outline-none ${
                      bad ? 'border-rose-500' : done ? 'border-emerald-300 focus:border-emerald-600' : 'border-slate-300 focus:border-emerald-600'
                    }`}
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden>
                    {busy ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" /> : done ? <Check className="w-4 h-4 text-emerald-600" /> : null}
                  </span>
                </div>
              </div>
            );
          })}
          {delta !== null && (
            <p className={`text-xs font-bold tabular text-right ${delta < 0 ? 'text-rose-700' : delta > 0 ? 'text-emerald-700' : 'text-slate-500'}`} title={t('count.before', { n: r.before! })}>
              {delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '='}
            </p>
          )}
        </div>
        {r.open.length > 0 && (
          <label className="h-12 w-12 rounded-xl border-2 border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900 flex items-center justify-center cursor-pointer focus-within:border-emerald-600">
            <Camera className="w-5 h-5" aria-hidden />
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label={t('count.photo.add', { id: r.id })}
              onChange={(e) => {
                h.onPhotos(r.id, e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
    </li>
  );
}, sameRow);
