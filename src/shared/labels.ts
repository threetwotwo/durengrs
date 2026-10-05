/**
 * The owner's size and fruit labels and the fertiliser dose they lead to, as found in his tree sheet (Sep 2026).
 * The values are editable: the web app stores them in `farmMeta/labelRules` and both sides read them through
 * `mergeLabelRules()`. Until the owner confirms them (`confirmed`), they are shown as suggestions; never applied.
 */
export type Label = 'low' | 'mid' | 'high' | 'skip';

export interface LabelRules {
  /** Trunk girth, cm; ≤ skipMax = seedling ("skip"). */
  batang: { skipMax: number; lowMax: number; midMax: number };
  /** Canopy spread, cm. */
  tajuk: { lowMax: number; midMax: number };
  /** Estimated fruit (flowering branches × clusters per branch); ≤ skipMax = skip. */
  est: { skipMax: number; lowMax: number; midMax: number };
  /** Fruit on the tree (latest count); 0 = skip. */
  fruitset: { lowMax: number; midMax: number };
  /** Dose per tree, in `unit` (unit not confirmed yet). */
  dose: { fruiting: { low: number; mid: number; high: number }; vegetative: { high: number; other: number }; young: number; unit: string };
  products: { fruiting: string; vegetative: string; young: string };
  /** The owner has checked these values. */
  confirmed: boolean;
}

/** Values found in the owner's sheet (Sep 2026). */
export const DEFAULT_LABEL_RULES: LabelRules = {
  batang: { skipMax: 20, lowMax: 37, midMax: 55 },
  tajuk: { lowMax: 339, midMax: 549 },
  est: { skipMax: 1, lowMax: 14, midMax: 47 },
  fruitset: { lowMax: 5, midMax: 11 },
  dose: { fruiting: { low: 0.5, mid: 0.75, high: 1.0 }, vegetative: { high: 1.0, other: 0.5 }, young: 1.0, unit: '' },
  products: { fruiting: 'NPK Perfect', vegetative: 'YM Winner', young: 'YM Winner' },
  confirmed: false,
};
/** @deprecated use DEFAULT_LABEL_RULES or the stored rules */
export const LABEL_RULES = DEFAULT_LABEL_RULES;

const band = (v: number | undefined, lowMax: number, midMax: number): Label | undefined =>
  v === undefined || !Number.isFinite(v) ? undefined : v <= lowMax ? 'low' : v <= midMax ? 'mid' : 'high';

export function labelBatang(girth?: number, r: LabelRules = DEFAULT_LABEL_RULES): Label | undefined {
  if (girth === undefined || !Number.isFinite(girth)) return undefined;
  return girth <= r.batang.skipMax ? 'skip' : band(girth, r.batang.lowMax, r.batang.midMax);
}
export const labelTajuk = (canopy?: number, r: LabelRules = DEFAULT_LABEL_RULES): Label | undefined => band(canopy, r.tajuk.lowMax, r.tajuk.midMax);
export function labelEst(est?: number, r: LabelRules = DEFAULT_LABEL_RULES): Label | undefined {
  if (est === undefined || !Number.isFinite(est)) return undefined;
  return est <= r.est.skipMax ? 'skip' : band(est, r.est.lowMax, r.est.midMax);
}
export function labelFruitset(fruit?: number, r: LabelRules = DEFAULT_LABEL_RULES): Label | undefined {
  if (fruit === undefined || !Number.isFinite(fruit)) return undefined;
  return fruit <= 0 ? 'skip' : band(fruit, r.fruitset.lowMax, r.fruitset.midMax);
}

/**
 * Suggested product and dose for one tree, from its labels (pattern in the sheet): a tree with fruit gets the
 * fruiting product by fruit load; a seedling (trunk "skip") the young-tree dose; any other tree without fruit
 * the vegetative product by canopy size.
 */
export function doseSuggestion(
  x: { batang?: Label; tajuk?: Label; fruitset?: Label },
  r: LabelRules = DEFAULT_LABEL_RULES
): { product: string; dose: number } | undefined {
  if (x.fruitset && x.fruitset !== 'skip') return { product: r.products.fruiting, dose: r.dose.fruiting[x.fruitset] };
  if (x.batang === 'skip') return { product: r.products.young, dose: r.dose.young };
  if (x.tajuk) return { product: r.products.vegetative, dose: x.tajuk === 'high' ? r.dose.vegetative.high : r.dose.vegetative.other };
  return undefined;
}

/** Stored rules (any shape, e.g. a Firestore document) over the defaults: only sane numbers and text are taken. */
export function mergeLabelRules(stored: unknown): LabelRules {
  const d = DEFAULT_LABEL_RULES;
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, any>;
  const n = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v.trim().slice(0, 60) : fallback);
  const pick = <T extends Record<string, number>>(src: unknown, def: T): T => {
    const o = (src && typeof src === 'object' ? src : {}) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(def).map(([k, v]) => [k, n(o[k], v)])) as T;
  };
  const dose = (s.dose && typeof s.dose === 'object' ? s.dose : {}) as Record<string, any>;
  const products = (s.products && typeof s.products === 'object' ? s.products : {}) as Record<string, unknown>;
  return {
    batang: pick(s.batang, d.batang),
    tajuk: pick(s.tajuk, d.tajuk),
    est: pick(s.est, d.est),
    fruitset: pick(s.fruitset, d.fruitset),
    dose: {
      fruiting: pick(dose.fruiting, d.dose.fruiting),
      vegetative: pick(dose.vegetative, d.dose.vegetative),
      young: n(dose.young, d.dose.young),
      unit: str(dose.unit, d.dose.unit),
    },
    products: {
      fruiting: str(products.fruiting, d.products.fruiting) || d.products.fruiting,
      vegetative: str(products.vegetative, d.products.vegetative) || d.products.vegetative,
      young: str(products.young, d.products.young) || d.products.young,
    },
    confirmed: s.confirmed === true,
  };
}

/** Problems that would make the labels meaningless (thresholds out of order, absurd doses). Empty = fine. */
export function checkLabelRules(r: LabelRules): Array<{ key: string; vars?: Record<string, string | number> }> {
  const out: Array<{ key: string; vars?: Record<string, string | number> }> = [];
  const order = (name: string, ...v: number[]) => {
    for (let i = 1; i < v.length; i++) if (!(v[i] > v[i - 1])) return out.push({ key: 'rules.err.order', vars: { name } });
  };
  order('batang', r.batang.skipMax, r.batang.lowMax, r.batang.midMax);
  order('tajuk', r.tajuk.lowMax, r.tajuk.midMax);
  order('est', r.est.skipMax, r.est.lowMax, r.est.midMax);
  order('fruitset', 0, r.fruitset.lowMax, r.fruitset.midMax);
  const doses = [r.dose.fruiting.low, r.dose.fruiting.mid, r.dose.fruiting.high, r.dose.vegetative.high, r.dose.vegetative.other, r.dose.young];
  if (doses.some((x) => !Number.isFinite(x) || x < 0 || x > 100)) out.push({ key: 'rules.err.dose' });
  if (!r.products.fruiting.trim() || !r.products.vegetative.trim() || !r.products.young.trim()) out.push({ key: 'rules.err.product' });
  // A confirmed dose is sent to workers (bot), so it needs its unit: "1" alone could be kg, cups or scoops.
  if (r.confirmed && !r.dose.unit.trim()) out.push({ key: 'rules.err.unit' });
  return out;
}
