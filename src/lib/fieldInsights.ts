import type { BlockSeason, BloomWave, L, TopicId } from './guide';
import type { Harvest, HarvestProblem, LabKey, LabResult, RainDay, SeasonTaskDone, SeasonTaskId } from './fieldData';
import { addDays, diffDays, todayStr } from './treatments';

/**
 * What the farm's own records say, measured against the Guide (pure functions, no database).
 */

// ---------- season tasks (A11) ----------

export interface SeasonTaskDef {
  title: L;
  topic: TopicId;
  /** Optional practice: offered while due, never reported as late. */
  optional?: boolean;
  /** Days after bloom when the task should be done. `to` may depend on the block's earliest ripening days. */
  from: number;
  to: number | ((ripeMin: number) => number);
}

/** Windows from the Guide research: pollinate in bloom week, thin in rounds days 28-60, bag by week 6 after fruit set. */
export const SEASON_TASKS: Record<SeasonTaskId, SeasonTaskDef> = {
  hand_pollination: { title: { id: 'Penyerbukan tangan', en: 'Hand pollination' }, topic: 'pollination', from: 0, to: 7, optional: true },
  fruit_thinning: { title: { id: 'Penjarangan buah', en: 'Fruit thinning' }, topic: 'fruit', from: 28, to: 60 },
  bagging: { title: { id: 'Brongsong buah', en: 'Bagging fruit' }, topic: 'pests', from: 28, to: 49 },
  ca_mg_spray: { title: { id: 'Semprot Ca + Mg', en: 'Ca + Mg spray' }, topic: 'nutrition', from: 45, to: 60 },
  fruit_tying: { title: { id: 'Ikat tangkai buah', en: 'Tie fruit stalks' }, topic: 'harvest', from: 61, to: (ripeMin) => Math.max(75, ripeMin - 14) },
};

export const SEASON_TASK_ORDER: SeasonTaskId[] = ['hand_pollination', 'fruit_thinning', 'bagging', 'ca_mg_spray', 'fruit_tying'];

export function taskWindow(task: SeasonTaskId, ripeMin: number): [number, number] {
  const d = SEASON_TASKS[task];
  return [d.from, typeof d.to === 'function' ? d.to(ripeMin) : d.to];
}

/** late = window passed recently (still worth doing or noting); missed = long past, no longer reported. */
export type TaskStatus = 'done' | 'due' | 'late' | 'missed' | 'upcoming';

/** How long after its window a task still counts as late rather than missed. */
export const LATE_GRACE_DAYS = 14;

export interface BlockTask {
  task: SeasonTaskId;
  status: TaskStatus;
  doneDate?: string;
  window: [number, number];
  /** The flowering this applies to; its date is the season key the Done record is stored under. */
  wave: BloomWave;
}

/**
 * Status of every season task for each flowering in a block's current season (empty when there is none).
 * Trees or branches that flowered apart are a separate wave with their own windows and their own Done records,
 * stored against the wave's date (the main wave uses the block's bloom date, as before).
 */
export function blockTasks(season: BlockSeason, done: SeasonTaskDone[]): BlockTask[] {
  if (!season.floweredOn || season.outdated) return [];
  const out: BlockTask[] = [];
  for (const wave of season.waves) {
    // After its harvest window a wave's season is over; its tasks no longer count as late.
    if (wave.day > season.ripeMax + 14) continue;
    const mine = done.filter((d) => d.block === season.block && d.season === wave.date);
    for (const task of SEASON_TASK_ORDER) {
      const window = taskWindow(task, season.ripeMin);
      const rec = mine.find((d) => d.task === task);
      const status: TaskStatus = rec
        ? 'done'
        : wave.day > window[1]
        ? SEASON_TASKS[task].optional || wave.day > window[1] + LATE_GRACE_DAYS
          ? 'missed'
          : 'late'
        : wave.day >= window[0]
        ? 'due'
        : 'upcoming';
      out.push({ task, status, doneDate: rec?.date, window, wave });
    }
  }
  return out;
}

// ---------- rain (A15) ----------

export interface RainSummary {
  /** Last 14 days, oldest first; null = not recorded. */
  last14: Array<{ date: string; mm: number | null }>;
  /** Days with a reading in the last 15. */
  recorded15: number;
  mean15: number | null;
  /** The Guide's flowering trigger: 15-day average below 1 mm/day (needs at least 12 readings). */
  dry: boolean;
  /** Day the 15-day average first fell below 1 mm in the current dry spell, when `dry`. */
  drySince?: string;
  /** About 50 days after the dry spell set in (Int. J. Biometeorology, 2024). */
  expectedBloom?: string;
  total30: number;
  lastDate?: string;
  daysSinceLast: number | null;
}

export function rainSummary(days: RainDay[], today = todayStr()): RainSummary {
  const byDate = new Map(days.map((d) => [d.date, d.rainMm]));
  const windowMean = (end: string) => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 15; i++) {
      const v = byDate.get(addDays(end, -i));
      if (typeof v === 'number') {
        sum += v;
        n++;
      }
    }
    return { mean: n ? sum / n : null, n };
  };
  const isDry = (end: string) => {
    const w = windowMean(end);
    return w.n >= 12 && w.mean !== null && w.mean < 1;
  };

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i - 13);
    return { date, mm: byDate.has(date) ? byDate.get(date)! : null };
  });
  const w = windowMean(today);
  const dry = isDry(today);
  let drySince: string | undefined;
  if (dry) {
    // Walk back to the first day the 15-day average dropped below 1 mm (up to 90 days).
    let d = today;
    for (let i = 0; i < 90 && isDry(addDays(d, -1)); i++) d = addDays(d, -1);
    drySince = d;
  }
  let total30 = 0;
  for (let i = 0; i < 30; i++) total30 += byDate.get(addDays(today, -i)) || 0;
  const recorded = days.filter((d) => d.date <= today).map((d) => d.date).sort();
  const lastDate = recorded[recorded.length - 1];
  return {
    last14,
    recorded15: w.n,
    mean15: w.mean,
    dry,
    drySince,
    expectedBloom: drySince ? addDays(drySince, 50) : undefined,
    total30,
    lastDate,
    daysSinceLast: lastDate ? diffDays(today, lastDate) : null,
  };
}

/** Total recorded rain between two dates (inclusive). */
export function rainBetween(days: RainDay[], from: string, to: string): number {
  return days.filter((d) => d.date >= from && d.date <= to).reduce((s, d) => s + d.rainMm, 0);
}

// ---------- harvests (A6, A10) ----------

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Real bloom-to-harvest days per variety from logged harvests (fruit-weighted entries, plausible range only). */
export function actualRipening(harvests: Harvest[]): Map<string, { days: number; harvests: number }> {
  const by = new Map<string, number[]>();
  for (const h of harvests) {
    if (!h.variant || typeof h.daysFromBloom !== 'number' || h.daysFromBloom < 60 || h.daysFromBloom > 200) continue;
    const list = by.get(h.variant) || [];
    list.push(h.daysFromBloom);
    by.set(h.variant, list);
  }
  const out = new Map<string, { days: number; harvests: number }>();
  by.forEach((list, v) => out.set(v, { days: median(list), harvests: list.length }));
  return out;
}

export interface HarvestQuality {
  fruits: number;
  weightKg: number;
  problemFruits: number;
  problems: Partial<Record<HarvestProblem, number>>;
  entries: number;
}

export function harvestQuality(harvests: Harvest[], key: (h: Harvest) => string): Map<string, HarvestQuality> {
  const out = new Map<string, HarvestQuality>();
  for (const h of harvests) {
    const k = key(h);
    const q = out.get(k) || { fruits: 0, weightKg: 0, problemFruits: 0, problems: {}, entries: 0 };
    q.fruits += h.fruits || 0;
    q.weightKg += h.weightKg || 0;
    q.problemFruits += h.problemFruits || 0;
    q.entries++;
    for (const p of h.problems || []) q.problems[p] = (q.problems[p] || 0) + 1;
    out.set(k, q);
  }
  return out;
}

// ---------- lab results (A16) ----------

/** Targets from the Guide's nutrition topic. om has no target: shown for the record. */
export const LAB_RANGES: Record<LabKey, { min?: number; max?: number; unit: string; entryMin: number; entryMax: number }> = {
  ph: { min: 5.5, max: 6.5, unit: '', entryMin: 3, entryMax: 9 },
  om: { unit: '%', entryMin: 0, entryMax: 20 },
  n: { min: 2.0, max: 2.4, unit: '%', entryMin: 0.5, entryMax: 5 },
  p: { min: 0.15, max: 0.25, unit: '%', entryMin: 0.01, entryMax: 1 },
  k: { min: 1.5, max: 2.5, unit: '%', entryMin: 0.1, entryMax: 5 },
  ca: { min: 1.7, max: 2.5, unit: '%', entryMin: 0.1, entryMax: 5 },
  mg: { min: 0.25, max: 0.5, unit: '%', entryMin: 0.01, entryMax: 2 },
  b: { min: 40, max: 60, unit: 'mg/kg', entryMin: 1, entryMax: 300 },
  zn: { min: 10, max: 30, unit: 'mg/kg', entryMin: 1, entryMax: 300 },
};

export type LabLevel = 'low' | 'ok' | 'high' | 'none';

export function labLevel(key: LabKey, v: number | undefined): LabLevel {
  const r = LAB_RANGES[key];
  if (typeof v !== 'number') return 'none';
  if (r.min !== undefined && v < r.min) return 'low';
  if (r.max !== undefined && v > r.max) return 'high';
  return 'ok';
}

/** Newest result per block. */
export function latestLabByBlock(results: LabResult[]): Map<string, LabResult> {
  const out = new Map<string, LabResult>();
  for (const r of results) {
    const prev = out.get(r.block);
    if (!prev || r.date > prev.date) out.set(r.block, r);
  }
  return out;
}
