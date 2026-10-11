import type { CropCount, CropStage } from './fieldData';
import { TREE_LIMITS } from './trees';
import { fruitRemaining } from '../shared';

/**
 * Counting the farm in one walk (the Count page): one number per tree, typed tree after tree, each saved as a dated
 * count like a count sent from WhatsApp. Pure helpers, no database: what a tree was before this count, checking a
 * typed number, and a column pasted from Google Sheets.
 */

const RANK: Record<CropStage, number> = { clusters: 0, set: 1, kept: 2, onTree: 3 };

/** Fruit counts (set, kept, on the tree) follow one number down the season; flower clusters are their own kind. */
export const sameKind = (a: CropStage, b: CropStage) => (a === 'clusters') === (b === 'clusters');

/** The largest number a count of this stage can be (same limits as the tree form). */
export const countMax = (stage: CropStage) => (stage === 'clusters' ? TREE_LIMITS.floweringClusters.max : TREE_LIMITS.estimatedFruitCount.max);

export interface PastCount {
  date: string;
  count: number;
  stage: CropStage;
}

/**
 * A tree's earlier counts of the same kind as `stage`, before `date`, newest first: one figure per day, added up
 * over the tree's current flowerings (`waveDates`). Counts of an earlier season are left out.
 */
export function pastCounts(counts: CropCount[], waveDates: string[], stage: CropStage, date: string, n = 3): PastCount[] {
  const waves = new Set(waveDates);
  const byDay = new Map<string, Map<string, CropCount>>();
  for (const c of counts) {
    if (!waves.has(c.season) || !sameKind(c.stage, stage) || c.date >= date) continue;
    const day = byDay.get(c.date) || new Map<string, CropCount>();
    const cur = day.get(c.season);
    if (!cur || RANK[c.stage] > RANK[cur.stage]) day.set(c.season, c);
    byDay.set(c.date, day);
  }
  return [...byDay]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, n)
    .map(([d, day]) => {
      const list = [...day.values()];
      return {
        date: d,
        count: list.reduce((s, c) => s + c.count, 0),
        stage: list.reduce((top, c) => (RANK[c.stage] > RANK[top] ? c.stage : top), list[0].stage),
      };
    });
}

/**
 * What the tree should hold just before a count on `date`: for fruit, the last fruit count minus the fruit picked
 * since (the same rule as everywhere else, see shared/crop.ts), else the tree's own estimate; for flower clusters,
 * the last cluster count of each flowering added up. Undefined when nothing is known.
 */
export function expectedBefore(
  counts: CropCount[],
  harvests: Array<{ date: string; fruits?: number }>,
  waveDates: string[],
  stage: CropStage,
  date: string,
  treeEstimate?: { count?: unknown; date?: string }
): number | undefined {
  const earlier = counts.filter((c) => c.date < date);
  if (stage !== 'clusters') {
    const estimate = treeEstimate?.date && treeEstimate.date < date ? treeEstimate : undefined;
    return fruitRemaining(earlier, harvests.filter((h) => h.date <= date), waveDates, estimate);
  }
  const waves = new Set(waveDates);
  const latest = new Map<string, CropCount>();
  for (const c of earlier) {
    if (!waves.has(c.season) || c.stage !== 'clusters') continue;
    const prev = latest.get(c.season);
    if (!prev || c.date > prev.date) latest.set(c.season, c);
  }
  if (!latest.size) return undefined;
  return [...latest.values()].reduce((s, c) => s + c.count, 0);
}

export type CountCheck = { ok: true; value: number | null } | { ok: false; max: number };

/** A typed count: a whole number from 0 to the stage's limit; empty means "no count". */
export function checkCount(raw: string, stage: CropStage): CountCheck {
  const t = raw.replace(/\s/g, '');
  // "1.200" or "1,200": a thousands separator. "4.5" is not a count.
  const s = /^\d{1,3}([.,]\d{3})+$/.test(t) ? t.replace(/[.,]/g, '') : t;
  const max = countMax(stage);
  if (!s) return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false, max };
  const n = Number(s);
  return n <= max ? { ok: true, value: n } : { ok: false, max };
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

export interface RoundRow {
  /** Counted on the round's date (added up over the tree's flowerings). */
  now?: number;
  /** What the tree held before (expectedBefore). */
  before?: number;
}

/** Progress of a walk: trees counted, their total, and how that total compares with what those trees held before. */
export function roundSummary(rows: RoundRow[]) {
  let counted = 0;
  let total = 0;
  let compared = 0;
  let before = 0;
  for (const r of rows) {
    if (r.now === undefined) continue;
    counted++;
    total += r.now;
    if (r.before !== undefined) {
      compared++;
      before += r.before;
    }
  }
  const comparedNow = rows.reduce((s, r) => s + (r.now !== undefined && r.before !== undefined ? r.now : 0), 0);
  return { trees: rows.length, counted, total, compared, change: compared ? comparedNow - before : null };
}

/** Is this count the tree's newest of its kind? Only then does it also become the tree's own figure. */
export function isNewestOfKind(counts: CropCount[], treeId: string, stage: CropStage, date: string): boolean {
  return !counts.some((c) => c.treeId === treeId && sameKind(c.stage, stage) && c.date > date);
}
