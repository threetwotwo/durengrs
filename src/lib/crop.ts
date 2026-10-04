import type { DurianTree } from '../types';
import { normalizeTimestamp } from '../context/FarmContext';
import type { CropCount, CropStage, Grade, Harvest } from './fieldData';
import { CROP_STAGES, GRADES } from './fieldData';
import { BlockSeason, StageId, TreeBloom, stageOf, treeWaves } from './guide';
import type { HarvestCycle } from './insights';
import { diffDays, toDateStr, todayStr } from './treatments';

/**
 * Harvest engine: each tree's crop through the season, from its own counts and harvests.
 *
 *   flower clusters → fruit set → kept after thinning → fruit on the tree (counted again as it grows)
 *     → harvested, graded Extra / Class I / Class II / reject
 *
 * A crop is identified by the date its flowers opened (the tree's flowering wave, see guide.ts treeWaves), so a tree
 * whose branches flowered apart has one crop per wave. Pure functions, no database.
 */

export interface StageCount {
  count: number;
  date: string;
  /** Taken from the tree record (WhatsApp report or tree form), not a count made here. */
  fromTree?: boolean;
}

export type GradeTotals = Record<Grade | 'ungraded', number>;
const emptyGrades = (): GradeTotals => ({ extra: 0, class1: 0, class2: 0, reject: 0, ungraded: 0 });

export interface HarvestTotals {
  fruits: number;
  weightKg: number;
  grades: GradeTotals;
  entries: number;
  lastDate?: string;
}
const emptyHarvest = (): HarvestTotals => ({ fruits: 0, weightKg: 0, grades: emptyGrades(), entries: 0 });

function addHarvest(t: HarvestTotals, h: Harvest) {
  t.fruits += h.fruits || 0;
  t.weightKg += h.weightKg || 0;
  t.entries++;
  if (!t.lastDate || h.date > t.lastDate) t.lastDate = h.date;
  let graded = 0;
  for (const g of GRADES) {
    const n = h.grades?.[g] || 0;
    t.grades[g] += n;
    graded += n;
  }
  t.grades.ungraded += Math.max(0, (h.fruits || 0) - graded);
}

/** What to record next on a tree, from where its flowers are in the season. */
export type NextStep = { kind: CropStage | 'harvest'; season: string; overdue: boolean };

export interface TreeCrop {
  tree: DurianTree;
  /** Current flowering waves of this tree (oldest first) with their stage. */
  waves: Array<{ date: string; day: number; stage: StageId; partial: boolean }>;
  /** Latest count per stage, added up over the tree's waves. */
  counts: Partial<Record<CropStage, StageCount>>;
  harvested: HarvestTotals;
  /** Fruit still on the tree: the last fruit count minus what was harvested since. */
  remaining?: number;
  next: NextStep | null;
}

/** Which count each stage of the season calls for. */
const STAGE_COUNT: Partial<Record<StageId, CropStage | 'harvest'>> = {
  bloom: 'clusters',
  set: 'set',
  thin: 'kept',
  grow: 'onTree',
  mature: 'onTree',
  harvest: 'harvest',
};
/** Fruit on the tree is counted again after this many days, to follow progress and drop. */
export const RECOUNT_DAYS = 14;

export function treeCrops(
  trees: DurianTree[],
  seasons: BlockSeason[],
  cycles: HarvestCycle[],
  blooms: TreeBloom[],
  counts: CropCount[],
  harvests: Harvest[],
  today = todayStr()
): TreeCrop[] {
  const seasonByBlock = new Map(seasons.map((s) => [s.block, s]));
  const cycleByBlock = new Map(cycles.map((c) => [c.block, c.floweredOn]));
  const countsByTree = new Map<string, CropCount[]>();
  for (const c of counts) {
    const list = countsByTree.get(c.treeId) || [];
    list.push(c);
    countsByTree.set(c.treeId, list);
  }
  const harvestsByTree = new Map<string, Harvest[]>();
  for (const h of harvests) {
    if (!h.treeId) continue;
    const list = harvestsByTree.get(h.treeId) || [];
    list.push(h);
    harvestsByTree.set(h.treeId, list);
  }

  return trees.map((tree) => {
    const season = seasonByBlock.get(tree.block);
    const ripeMin = season?.ripeMin ?? 120;
    const ripeMax = season?.ripeMax ?? 120;
    const tw = season ? treeWaves(tree, cycleByBlock.get(tree.block), blooms, ripeMax + 90, today) : [];
    const waves = tw.map((w) => {
      const day = diffDays(today, w.date);
      return { date: w.date, day, stage: stageOf(day, ripeMin, ripeMax), partial: w.part !== 'whole' };
    });
    const waveDates = new Set(waves.map((w) => w.date));
    const start = waves[0]?.date;

    // Latest count per wave and stage, then added up per stage.
    const latest = new Map<string, CropCount>();
    for (const c of countsByTree.get(tree.id) || []) {
      if (!waveDates.has(c.season)) continue;
      const key = `${c.season}|${c.stage}`;
      const prev = latest.get(key);
      if (!prev || c.date > prev.date) latest.set(key, c);
    }
    const sums: Partial<Record<CropStage, StageCount>> = {};
    latest.forEach((c) => {
      const s = sums[c.stage];
      sums[c.stage] = { count: (s?.count || 0) + c.count, date: s && s.date > c.date ? s.date : c.date };
    });

    // Counts the tree record already holds (from the WhatsApp bot or the tree form) since this season began.
    const updated = Math.max(normalizeTimestamp(tree.dateUpdated), normalizeTimestamp(tree.lastReportAt));
    const recordDate = updated ? toDateStr(new Date(updated)) : undefined;
    const fresh = start && recordDate && recordDate >= start;
    if (fresh && !sums.clusters && (tree.floweringClusters || 0) > 0) {
      sums.clusters = { count: tree.floweringClusters!, date: recordDate!, fromTree: true };
    }
    if (fresh && !sums.set && !sums.kept && !sums.onTree && (tree.estimatedFruitCount || 0) > 0) {
      sums.onTree = { count: tree.estimatedFruitCount!, date: recordDate!, fromTree: true };
    }

    const harvested = emptyHarvest();
    for (const h of harvestsByTree.get(tree.id) || []) if (start && h.date >= start) addHarvest(harvested, h);

    // Fruit still on the tree: newest fruit count minus fruit picked after it.
    const lastFruit = (['onTree', 'kept', 'set'] as CropStage[]).map((st) => sums[st]).filter(Boolean).sort((a, b) => b!.date.localeCompare(a!.date))[0];
    const pickedSince = (harvestsByTree.get(tree.id) || []).filter((h) => lastFruit && h.date > lastFruit.date).reduce((n, h) => n + (h.fruits || 0), 0);
    const remaining = lastFruit ? Math.max(0, lastFruit.count - pickedSince) : undefined;

    // Next step: the first wave whose stage calls for a count that is missing (or, for fruit on the tree, stale).
    let next: NextStep | null = null;
    for (const w of waves) {
      const kind = STAGE_COUNT[w.stage];
      if (!kind) continue;
      if (kind === 'harvest') {
        next = next || { kind, season: w.date, overdue: false };
        continue;
      }
      const have = latest.get(`${w.date}|${kind}`);
      const stale = kind === 'onTree' && have && diffDays(today, have.date) >= RECOUNT_DAYS;
      if (!have || stale) {
        next = { kind, season: w.date, overdue: !have || !!stale };
        break;
      }
    }
    return { tree, waves, counts: sums, harvested, remaining, next };
  });
}

export interface Funnel {
  trees: number;
  /** Per stage: total count and how many trees have it. */
  stages: Record<CropStage, { total: number; trees: number }>;
  harvested: HarvestTotals;
  /** Fruit still on the trees. */
  remaining: number;
  /** Trees with a count due now (missing for their stage, or fruit not recounted for 14 days). */
  toCount: number;
  /**
   * Step-to-step ratios over trees that have both counts (so trees counted at only one step don't skew them):
   * fruit set per flower cluster, share of set fruit kept after thinning, share of kept fruit still on the tree.
   */
  ratios: { setPerCluster: number | null; keptOfSet: number | null; onTreeOfKept: number | null };
}

/**
 * Add up tree crops. `blockHarvests` are whole-block harvest entries (no tree), counted from the start of each
 * block's season.
 */
export function cropFunnel(crops: TreeCrop[], seasons: BlockSeason[], blockHarvests: Harvest[] = []): Funnel {
  const stages = Object.fromEntries(CROP_STAGES.map((s) => [s, { total: 0, trees: 0 }])) as Funnel['stages'];
  const harvested = emptyHarvest();
  let remaining = 0;
  let toCount = 0;
  const blocks = new Set<string>();
  const pairs = { setPerCluster: [0, 0], keptOfSet: [0, 0], onTreeOfKept: [0, 0] };
  const pair = (key: keyof typeof pairs, a?: StageCount, b?: StageCount) => {
    if (a && b && b.count > 0) {
      pairs[key][0] += a.count;
      pairs[key][1] += b.count;
    }
  };
  for (const c of crops) {
    pair('setPerCluster', c.counts.set, c.counts.clusters);
    pair('keptOfSet', c.counts.kept, c.counts.set);
    if (c.remaining !== undefined && c.counts.kept) pair('onTreeOfKept', { count: c.remaining, date: '' }, c.counts.kept);
    blocks.add(c.tree.block);
    for (const st of CROP_STAGES) {
      const v = c.counts[st];
      if (v) {
        stages[st].total += v.count;
        stages[st].trees++;
      }
    }
    for (const g of [...GRADES, 'ungraded'] as const) harvested.grades[g] += c.harvested.grades[g];
    harvested.fruits += c.harvested.fruits;
    harvested.weightKg += c.harvested.weightKg;
    harvested.entries += c.harvested.entries;
    if (c.harvested.lastDate && (!harvested.lastDate || c.harvested.lastDate > harvested.lastDate)) harvested.lastDate = c.harvested.lastDate;
    remaining += c.remaining || 0;
    if (c.next && c.next.kind !== 'harvest' && c.next.overdue) toCount++;
  }
  const startOf = new Map(seasons.map((s) => [s.block, s.waves[0]?.date]));
  for (const h of blockHarvests) {
    const start = startOf.get(h.block);
    if (h.treeId || !blocks.has(h.block) || !start || h.date < start) continue;
    addHarvest(harvested, h);
  }
  const ratio = (k: keyof typeof pairs) => (pairs[k][1] ? pairs[k][0] / pairs[k][1] : null);
  return {
    trees: crops.length,
    stages,
    harvested,
    remaining,
    toCount,
    ratios: { setPerCluster: ratio('setPerCluster'), keptOfSet: ratio('keptOfSet'), onTreeOfKept: ratio('onTreeOfKept') },
  };
}

/** Share of graded fruit in the top two grades (Extra + Class I), or null with nothing graded. */
export function topGradeShare(g: GradeTotals): number | null {
  const graded = g.extra + g.class1 + g.class2 + g.reject;
  return graded ? (g.extra + g.class1) / graded : null;
}
