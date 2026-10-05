/**
 * The owner's size and fruit labels and the fertiliser dose they lead to, as found in his tree sheet (Sep 2026).
 * Status: inferred from the sheet, NOT confirmed (audit 2026-10 §3). Shown as suggestions only; never applied.
 */
export type Label = 'low' | 'mid' | 'high' | 'skip';

export const LABEL_RULES = {
  /** Trunk girth, cm; ≤ skipMax = seedling ("skip"). */
  batang: { skipMax: 20, lowMax: 37, midMax: 55 },
  /** Canopy spread, cm. */
  tajuk: { lowMax: 339, midMax: 549 },
  /** Estimated fruit (flowering branches × clusters per branch); ≤ skipMax = skip. */
  est: { skipMax: 1, lowMax: 14, midMax: 47 },
  /** Fruit on the tree (latest count); 0 = skip. */
  fruitset: { lowMax: 5, midMax: 11 },
  /** Dose per tree; unit not confirmed (kg?). */
  dose: { fruiting: { low: 0.5, mid: 0.75, high: 1.0 }, vegetative: { high: 1.0, other: 0.5 }, young: 1.0 },
  products: { fruiting: 'NPK Perfect', vegetative: 'YM Winner' },
} as const;

const band = (v: number | undefined, lowMax: number, midMax: number): Label | undefined =>
  v === undefined || !Number.isFinite(v) ? undefined : v <= lowMax ? 'low' : v <= midMax ? 'mid' : 'high';

export function labelBatang(girth?: number): Label | undefined {
  if (girth === undefined || !Number.isFinite(girth)) return undefined;
  return girth <= LABEL_RULES.batang.skipMax ? 'skip' : band(girth, LABEL_RULES.batang.lowMax, LABEL_RULES.batang.midMax);
}
export const labelTajuk = (canopy?: number): Label | undefined => band(canopy, LABEL_RULES.tajuk.lowMax, LABEL_RULES.tajuk.midMax);
export function labelEst(est?: number): Label | undefined {
  if (est === undefined || !Number.isFinite(est)) return undefined;
  return est <= LABEL_RULES.est.skipMax ? 'skip' : band(est, LABEL_RULES.est.lowMax, LABEL_RULES.est.midMax);
}
export function labelFruitset(fruit?: number): Label | undefined {
  if (fruit === undefined || !Number.isFinite(fruit)) return undefined;
  return fruit <= 0 ? 'skip' : band(fruit, LABEL_RULES.fruitset.lowMax, LABEL_RULES.fruitset.midMax);
}

/**
 * Suggested product and dose for one tree, from its labels (pattern in the sheet): a tree with fruit gets the
 * fruiting product by fruit load; a seedling (trunk "skip") the full vegetative dose; any other tree without fruit
 * the vegetative product by canopy size.
 */
export function doseSuggestion(x: { batang?: Label; tajuk?: Label; fruitset?: Label }): { product: string; dose: number } | undefined {
  const r = LABEL_RULES;
  if (x.fruitset && x.fruitset !== 'skip') return { product: r.products.fruiting, dose: r.dose.fruiting[x.fruitset] };
  if (x.batang === 'skip') return { product: r.products.vegetative, dose: r.dose.young };
  if (x.tajuk) return { product: r.products.vegetative, dose: x.tajuk === 'high' ? r.dose.vegetative.high : r.dose.vegetative.other };
  return undefined;
}
