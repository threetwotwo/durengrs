import type { CropCount, CropStage } from './fieldData';
import type { ReportPhoto } from '../types';
import type { StageId } from './guide';
import { TREE_LIMITS } from './trees';
import { FRUIT_STAGES, dayTotal, fruitRemaining } from '../shared';

/**
 * The Count sheet: one number per tree for a day, typed down a new column like in Google Sheets. A count is the
 * whole tree's (fruit, or flower clusters); the same record a count from WhatsApp makes. Pure helpers, no database.
 */

/** What is counted: the tree's fruit, or its flower clusters. */
export type CountKind = 'fruit' | 'clusters';

export const isKind = (stage: CropStage, kind: CountKind) => (kind === 'clusters' ? stage === 'clusters' : FRUIT_STAGES.includes(stage));

/** The largest number a count of this kind can be (same limits as the tree form). */
export const countMax = (kind: CountKind) => (kind === 'clusters' ? TREE_LIMITS.floweringClusters.max : TREE_LIMITS.estimatedFruitCount.max);

export interface Wave {
  date: string;
  partial: boolean;
  stage: StageId;
}

/** Which fruit count a tree's flowering calls for at its stage: fruit set, after thinning, or fruit on the tree. */
export function fruitStage(stage: StageId): CropStage {
  if (stage === 'preflower' || stage === 'bloom' || stage === 'set') return 'set';
  if (stage === 'thin') return 'kept';
  return 'onTree';
}

/**
 * Where a new count of the tree is filed: fruit under its main flowering (the oldest whole-tree one, else the oldest),
 * at the stage that flowering is in; flower clusters under its newest flowering. Only flowerings that had begun by
 * `date` count. Null when the tree has none (no flowering date this season).
 */
export function countTarget(waves: Wave[], kind: CountKind, date: string): { season: string; stage: CropStage } | null {
  const open = waves.filter((w) => w.date <= date);
  if (!open.length) return null;
  if (kind === 'clusters') return { season: open[open.length - 1].date, stage: 'clusters' };
  const main = open.find((w) => !w.partial) || open[0];
  return { season: main.date, stage: fruitStage(main.stage) };
}

/** The tree's counts of this kind on one day, in its current flowerings. */
export const dayCounts = (counts: CropCount[], waveDates: string[], kind: CountKind, date: string) =>
  counts.filter((c) => c.date === date && waveDates.includes(c.season) && isKind(c.stage, kind));

/**
 * A tree's earlier counts of this kind before `date`: date -> that day's figure (see shared/crop.ts dayTotal).
 * Counts of an earlier season are left out.
 */
export function pastCounts(counts: CropCount[], waveDates: string[], kind: CountKind, date: string): Map<string, number> {
  const byDay = new Map<string, CropCount[]>();
  for (const c of counts) {
    if (c.date >= date || !waveDates.includes(c.season) || !isKind(c.stage, kind)) continue;
    byDay.set(c.date, [...(byDay.get(c.date) || []), c]);
  }
  const out = new Map<string, number>();
  byDay.forEach((list, d) => out.set(d, dayTotal(list)));
  return out;
}

/**
 * The sheet's dated columns, oldest first: the latest `n` counting rounds among these trees, a round being a day on
 * which a fair part of them was counted (at least 2 trees and a fifth of them). A day only a tree or two were counted
 * on (a single count from WhatsApp) gets no column of its own, unless there was no round at all.
 */
export function pastColumns(rows: Array<Map<string, number>>, n = 3): string[] {
  const trees = new Map<string, number>();
  for (const r of rows) r.forEach((_v, d) => trees.set(d, (trees.get(d) || 0) + 1));
  const need = Math.max(2, Math.ceil(rows.length / 5));
  const all = [...trees.keys()].sort();
  const rounds = all.filter((d) => trees.get(d)! >= need);
  return (rounds.length ? rounds : all).slice(-n);
}

/**
 * What the tree held just before a count on `date`: for fruit, its newest fruit count minus the fruit picked since
 * (the same rule as everywhere else), else the tree's own estimate; for flower clusters, each flowering's last count
 * added up. Undefined when nothing is known.
 */
export function expectedBefore(
  counts: CropCount[],
  harvests: Array<{ date: string; fruits?: number }>,
  waveDates: string[],
  kind: CountKind,
  date: string,
  treeEstimate?: { count?: unknown; date?: string }
): number | undefined {
  const earlier = counts.filter((c) => c.date < date);
  if (kind === 'fruit') {
    const estimate = treeEstimate?.date && treeEstimate.date < date ? treeEstimate : undefined;
    return fruitRemaining(earlier, harvests.filter((h) => h.date <= date), waveDates, estimate);
  }
  const latest = new Map<string, CropCount>();
  for (const c of earlier) {
    if (!waveDates.includes(c.season) || c.stage !== 'clusters') continue;
    const prev = latest.get(c.season);
    if (!prev || c.date > prev.date) latest.set(c.season, c);
  }
  if (!latest.size) return undefined;
  return [...latest.values()].reduce((s, c) => s + c.count, 0);
}

export type CountCheck = { ok: true; value: number | null } | { ok: false; max: number };

/** A typed count: a whole number from 0 to the kind's limit; empty means "no count". */
export function checkCount(raw: string, kind: CountKind): CountCheck {
  const t = raw.replace(/\s/g, '');
  // "1.200" or "1,200": a thousands separator. "4.5" is not a count.
  const s = /^\d{1,3}([.,]\d{3})+$/.test(t) ? t.replace(/[.,]/g, '') : t;
  const max = countMax(kind);
  if (!s) return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false, max };
  const n = Number(s);
  return n <= max ? { ok: true, value: n } : { ok: false, max };
}

// ---------- grade A ----------

/** A typed grade-A share: a whole percent from 0 to 100 ("50" or "50%"); empty means none. */
export function checkPct(raw: string): { ok: true; value: number | null } | { ok: false } {
  const s = raw.replace(/\s/g, '').replace(/%$/, '');
  if (!s) return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false };
  const n = Number(s);
  return n <= 100 ? { ok: true, value: n } : { ok: false };
}

/** A tree's grade-A share on a day: the one set on its counts of that day (normally a single count). */
export const dayPct = (day: Array<Pick<CropCount, 'gradeAPct'>>): number | undefined =>
  day.find((c) => typeof c.gradeAPct === 'number' && Number.isFinite(c.gradeAPct))?.gradeAPct;

/** The grade-A fruit a count is expected to give: 30 fruit at 50% are 15. Whole fruit. */
export const gradeAFruit = (count: number, pct: number) => Math.round((count * pct) / 100);

/**
 * The grade-A totals of a day's sheet, over the trees counted that have a share: how many, their fruit, their
 * grade-A fruit (each tree's rounded, added up) and the share that makes of their fruit.
 */
export function gradeASummary(rows: Array<{ now?: number; pct?: number }>) {
  let trees = 0;
  let fruit = 0;
  let gradeA = 0;
  for (const r of rows) {
    if (r.now === undefined || r.pct === undefined) continue;
    trees++;
    fruit += r.now;
    gradeA += gradeAFruit(r.now, r.pct);
  }
  return { trees, fruit, gradeA, pct: fruit ? Math.round((gradeA / fruit) * 100) : null };
}

/**
 * A column copied from Google Sheets (or typed on several lines): its cells in order, a blank cell kept as '' so
 * the trees stay lined up. Null for a single value (an ordinary paste into one box). Only the first column of a
 * wider selection is used.
 */
export function pastedColumn(text: string): string[] | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.length < 2) return null;
  return lines.map((l) => l.split('\t')[0].trim());
}

/** Is a count on `date` the tree's newest of its kind? Only then does it also become the tree's own figure. */
export function isNewestOfKind(counts: CropCount[], treeId: string, kind: CountKind, date: string): boolean {
  return !counts.some((c) => c.treeId === treeId && isKind(c.stage, kind) && c.date > date);
}

/** The day's totals: trees counted, their total, and the change against what those same trees held before. */
export function roundSummary(rows: Array<{ now?: number; before?: number }>) {
  let counted = 0;
  let total = 0;
  let compared = 0;
  let change = 0;
  for (const r of rows) {
    if (r.now === undefined) continue;
    counted++;
    total += r.now;
    if (r.before !== undefined) {
      compared++;
      change += r.now - r.before;
    }
  }
  return { counted, total, change: compared ? change : null };
}

/**
 * Saving one number for a whole tree on a day (the Count sheet and the tree page): the record to write, the tree
 * figure to keep current, and that day's other counts of the kind it stands for (removed in the same write; their
 * photos move into it). The day's count already there keeps its flowering, stage and report link. Null when the tree
 * has no flowering to file it under.
 */
export function planCount(p: {
  tree: { id: string; block: string; floweringClusters?: number; estimatedFruitCount?: number };
  waves: Wave[];
  /** Counts of the farm (or at least of this tree). */
  counts: CropCount[];
  kind: CountKind;
  date: string;
  value: number;
  by?: string;
  note?: string;
}): {
  count: Omit<CropCount, 'id'>;
  treeField?: { field: 'floweringClusters' | 'estimatedFruitCount'; from: number | undefined };
  replaces: string[];
} | null {
  const target = countTarget(p.waves, p.kind, p.date);
  if (!target) return null;
  const waveDates = p.waves.map((w) => w.date);
  const day = dayCounts(
    p.counts.filter((c) => c.treeId === p.tree.id),
    waveDates,
    p.kind,
    p.date
  );
  const keep = day.find((c) => c.season === target.season) || day[0];
  const photos: ReportPhoto[] = day.flatMap((c) => c.photos || []);
  const field = p.kind === 'clusters' ? 'floweringClusters' : 'estimatedFruitCount';
  const toTree = isNewestOfKind(p.counts, p.tree.id, p.kind, p.date) && (p.kind === 'fruit' || p.waves.length <= 1);
  return {
    count: {
      treeId: p.tree.id,
      block: p.tree.block,
      season: keep?.season ?? target.season,
      stage: keep?.stage ?? target.stage,
      count: p.value,
      date: p.date,
      by: p.by || keep?.by,
      note: p.note || keep?.note,
      photos: photos.length ? photos : undefined,
      reportId: keep?.reportId,
      // Typing the count again keeps the day's grade-A share.
      gradeAPct: p.kind === 'fruit' ? dayPct(day) : undefined,
    },
    treeField: toTree ? { field, from: p.tree[field] } : undefined,
    replaces: day.map((c) => c.id),
  };
}
