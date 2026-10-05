/**
 * Fruit still on a tree, the same way on both sides (the web app's crop engine and the WhatsApp bot's dose line):
 * the newest fruit count (fruit set, after thinning, on the tree; latest per flowering, added up over the tree's
 * flowerings) minus the fruit picked after that count. With no fruit count this season, the tree's own fruit
 * estimate stands in when it was updated after the season began. Undefined when there is neither.
 */
export interface CountLike {
  season: string;
  stage: string;
  count: number;
  date: string;
}

const FRUIT_STAGES = ['set', 'kept', 'onTree'];

export function fruitRemaining(
  counts: CountLike[],
  harvests: Array<{ date: string; fruits?: number }>,
  waveDates: string[],
  /** The tree record's fruit estimate and the day (YYYY-MM-DD) the tree was last updated. */
  treeEstimate?: { count?: unknown; date?: string }
): number | undefined {
  const waves = new Set(waveDates);
  const latest = new Map<string, CountLike>();
  for (const c of counts) {
    if (!waves.has(c.season) || !FRUIT_STAGES.includes(c.stage)) continue;
    const key = `${c.season}|${c.stage}`;
    const prev = latest.get(key);
    if (!prev || c.date > prev.date) latest.set(key, c);
  }
  const sums = new Map<string, { count: number; date: string }>();
  latest.forEach((c) => {
    const s = sums.get(c.stage);
    sums.set(c.stage, { count: (s?.count || 0) + c.count, date: s && s.date > c.date ? s.date : c.date });
  });
  let last = [...sums.values()].sort((a, b) => b.date.localeCompare(a.date))[0];
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
