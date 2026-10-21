import type { Harvest, HarvestFruit } from './fieldData';

/**
 * Every fruit from WhatsApp's Laporan PANEN, one row each: a harvest record keeps its fruits in `items`, each with its
 * own code ("A3-20261021-01": tree, day, the tree's fruit number that day). Pure helpers, no database.
 */

export interface FruitRow extends HarvestFruit {
  /** The fruit's address: its code, or (a fruit saved before codes) the harvest id and its place. */
  key: string;
  harvest: Harvest;
  /** Place in the harvest's items. */
  index: number;
  treeId?: string;
  block: string;
  variant?: string;
  date: string;
}

export const fruitKey = (h: Harvest, f: HarvestFruit, i: number) => f.code || `${h.id}~${i + 1}`;

export function fruitRows(harvests: Harvest[], variantOfTree: (id: string) => string | undefined = () => undefined): FruitRow[] {
  const out: FruitRow[] = [];
  for (const h of harvests) {
    (h.items || []).forEach((f, i) => {
      if (!f || !Number.isFinite(f.weightG)) return;
      out.push({
        ...f,
        key: fruitKey(h, f, i),
        harvest: h,
        index: i,
        treeId: h.treeId,
        block: h.block,
        variant: h.variant || (h.treeId ? variantOfTree(h.treeId) : undefined),
        date: h.date,
      });
    });
  }
  return out;
}

export type FruitSort = 'code' | 'tree' | 'variant' | 'date' | 'weight' | 'aroma' | 'skin' | 'shape';
export const FRUIT_SORTS: FruitSort[] = ['code', 'tree', 'variant', 'date', 'weight', 'aroma', 'skin', 'shape'];

const treeOrder = (a?: string, b?: string) => (a || '').localeCompare(b || '', undefined, { numeric: true });

/** Newest first by default; any column either way. Ties: newest day, then the code. */
export function sortFruits(rows: FruitRow[], sort: FruitSort | null, desc: boolean): FruitRow[] {
  const base = (a: FruitRow, b: FruitRow) => b.date.localeCompare(a.date) || treeOrder(a.key, b.key);
  if (!sort) return [...rows].sort(base);
  const val = (r: FruitRow): number | string =>
    sort === 'weight' ? r.weightG : sort === 'aroma' ? r.aroma : sort === 'skin' ? r.skin : sort === 'shape' ? r.shape
      : sort === 'tree' ? r.treeId || '' : sort === 'variant' ? r.variant || '' : sort === 'date' ? r.date : r.key;
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : treeOrder(String(x), String(y));
    return (desc ? -c : c) || base(a, b);
  });
}

export interface FruitSummary {
  n: number;
  kg: number;
  avgG: number;
  aroma: number;
  skin: number;
  shape: number;
}

/** Count, total and average weight, average scores (one decimal). */
export function summarizeFruits(rows: FruitRow[]): FruitSummary | null {
  if (!rows.length) return null;
  const sum = (f: (r: FruitRow) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);
  const avg = (f: (r: FruitRow) => number) => Math.round((sum(f) / rows.length) * 10) / 10;
  const g = sum((r) => r.weightG);
  return { n: rows.length, kg: Math.round(g / 10) / 100, avgG: Math.round(g / rows.length), aroma: avg((r) => r.aroma), skin: avg((r) => r.skin), shape: avg((r) => r.shape) };
}

/** Per variety (most fruits first), for the comparison above the table. */
export function byVariety(rows: FruitRow[]): Array<{ variant: string; summary: FruitSummary }> {
  const m = new Map<string, FruitRow[]>();
  for (const r of rows) {
    const v = r.variant || '';
    m.set(v, [...(m.get(v) || []), r]);
  }
  return [...m.entries()].map(([variant, list]) => ({ variant, summary: summarizeFruits(list)! })).sort((a, b) => b.summary.n - a.summary.n || a.variant.localeCompare(b.variant));
}

export type FruitCheck = { ok: true; value: HarvestFruit } | { ok: false; field: 'weightG' | 'aroma' | 'skin' | 'shape' };

/** A fruit as corrected on its page: weight 300-9000 g, scores whole 1-5 (the same limits as the WhatsApp form). */
export function checkFruit(f: { weightG: string; aroma: string; skin: string; shape: string }, code?: string): FruitCheck {
  const w = Number(f.weightG.replace(/[.\s]/g, '').replace(',', '.'));
  if (!Number.isFinite(w) || w < 300 || w > 9000) return { ok: false, field: 'weightG' };
  const out: HarvestFruit = { ...(code ? { code } : {}), weightG: Math.round(w), aroma: 0, skin: 0, shape: 0 };
  for (const k of ['aroma', 'skin', 'shape'] as const) {
    const v = Number(f[k].trim());
    if (!Number.isInteger(v) || v < 1 || v > 5) return { ok: false, field: k };
    out[k] = v;
  }
  return { ok: true, value: out };
}
