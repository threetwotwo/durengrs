/**
 * Fruit on a tree, the same way on both sides (the web app's crop engine and the WhatsApp bot).
 *
 * A fruit count (fruit set, after thinning, on the tree) is the WHOLE tree's fruit, whichever flowering it was filed
 * under: a worker or the admin counts one number per tree. So the tree's fruit is its newest count day (one figure per
 * flowering that day, the later stage, added up: normally a single count), and it replaces every earlier count.
 */
export interface CountLike {
  season: string;
  stage: string;
  count: number;
  date: string;
}

export const FRUIT_STAGES = ['set', 'kept', 'onTree'];
const RANK: Record<string, number> = { clusters: 0, set: 1, kept: 2, onTree: 3 };

/** One day's figure for a tree: per flowering the later stage counted that day, added up over its flowerings. */
export function dayTotal(counts: CountLike[]): number {
  const perSeason = new Map<string, CountLike>();
  for (const c of counts) {
    const p = perSeason.get(c.season);
    if (!p || (RANK[c.stage] ?? 0) > (RANK[p.stage] ?? 0)) perSeason.set(c.season, c);
  }
  let n = 0;
  perSeason.forEach((c) => (n += c.count));
  return n;
}

/** The tree's newest fruit count this season (`waveDates`: its current flowerings), or undefined. */
export function lastFruitCount(counts: CountLike[], waveDates: string[]): { count: number; date: string } | undefined {
  const waves = new Set(waveDates);
  const fruit = counts.filter((c) => waves.has(c.season) && FRUIT_STAGES.includes(c.stage));
  if (!fruit.length) return undefined;
  const date = fruit.reduce((d, c) => (c.date > d ? c.date : d), '');
  return { date, count: dayTotal(fruit.filter((c) => c.date === date)) };
}

/**
 * Fruit still on the tree: its newest fruit count minus the fruit picked after that day. With no fruit count this
 * season, the tree's own fruit estimate stands in when it was updated after the season began. Undefined when there
 * is neither.
 */
export function fruitRemaining(
  counts: CountLike[],
  harvests: Array<{ date: string; fruits?: number }>,
  waveDates: string[],
  /** The tree record's fruit estimate and the day (YYYY-MM-DD) the tree was last updated. */
  treeEstimate?: { count?: unknown; date?: string }
): number | undefined {
  let last = lastFruitCount(counts, waveDates);
  if (!last && treeEstimate?.date && waveDates.length) {
    const start = [...waveDates].sort()[0];
    const n = Number(treeEstimate.count);
    if (treeEstimate.date >= start && Number.isFinite(n) && n > 0) last = { count: n, date: treeEstimate.date };
  }
  if (!last) return undefined;
  const from = last.date;
  const picked = harvests.filter((h) => h.date > from).reduce((n, h) => n + (h.fruits || 0), 0);
  return Math.max(0, last.count - picked);
}
