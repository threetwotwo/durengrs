/**
 * Other vendors' durian prices (marketPrices, written by the WhatsApp bot from a screenshot or text sent with HARGA,
 * bot/lib/prices.js) and the store's own price per variety (storePrices/{variety code}). Pure helpers first, then
 * the few writes the market prices page makes.
 */

export interface MarketPrice {
  id: string;
  date: string;
  vendor?: string;
  /** As written by the vendor ("Musang King", "Black Thorn"). */
  variety?: string;
  /** The farm's variety code when it was matched (variants/{code}). */
  varietyCode?: string;
  /** Fruit (buah, the default) or a processed product made from durian (olahan: cakes, pancakes, desserts). */
  category?: 'buah' | 'olahan';
  /** Olahan: the product as written ("Pancake Durian Musang King") and its size ("1 box isi 4", "L"). */
  product?: string;
  size?: string;
  /** Whole fruit (utuh, the default) or peeled flesh (kupas: by the kg, or a box of it). */
  form?: Form;
  /** Where the fruit is from, as the vendor wrote it ("Malaysia", "Lokal", "Medan"). */
  origin?: string;
  /** Not fresh: chilled or frozen. */
  condition?: 'chilled' | 'frozen';
  /** Marked in stock (✅) or sold out (❌) by the vendor. */
  available?: boolean;
  grade?: string;
  price: number;
  unit: 'kg' | 'buah' | 'pack' | 'other';
  /** The weight of the fruit (unit buah) or of the box (unit pack), when written. */
  fruitKg?: number;
  /** Per kg: the price itself (unit kg), or a per-fruit price over the fruit's weight. */
  pricePerKg?: number;
  note?: string;
  photo?: { path: string; url: string };
  raw?: string;
  workerPhone?: string;
  /** Sent by the vendor to the prices number (their WhatsApp number). */
  vendorPhone?: string;
  source?: string;
  batchId?: string;
  createdAt?: unknown;
}

export type Form = 'utuh' | 'kupas';
/** Kupas is quoted per box of about 400 g (the trade's unit); prices are kept per kg and shown per box. */
export const KUPAS_BOX_KG = 0.4;
/** A per-kg price in the unit a form is shown in: whole fruit per kg, kupas per 400 g box. */
export const shownPrice = (form: Form, perKg: number) => (form === 'kupas' ? Math.round(perKg * KUPAS_BOX_KG) : perKg);

/**
 * A price per kg: as saved, else for a kupas pack whose weight wasn't written, the pack taken as the usual 400 g box
 * (Matahari frozen 175.000/pack shows as 175.000 per 400 g).
 */
export const perKgOf = (p: Pick<MarketPrice, 'pricePerKg' | 'unit' | 'form' | 'price'>): number | undefined =>
  p.pricePerKg || (p.unit === 'pack' && p.form === 'kupas' && p.price > 0 ? Math.round(p.price / KUPAS_BOX_KG) : undefined);
export const FORMS: Form[] = ['utuh', 'kupas'];
export const formOf = (p: Pick<MarketPrice, 'form'>): Form => (p.form === 'kupas' ? 'kupas' : 'utuh');

/** storePrices/{code}: the store's own price per kg, whole fruit and peeled flesh. */
export interface StorePrice {
  utuh?: number;
  kupas?: number;
}

/** Grown here (no origin written, or "lokal") rather than brought in (Malaysia, another island). */
export const isLocal = (p: Pick<MarketPrice, 'origin'>) => !p.origin || /^lokal$/i.test(p.origin.trim());

/**
 * The variety a price is about, as a group key: the farm's code, else the vendor's name for it; with its origin when
 * it is not local (Musang King from Malaysia is another product) and frozen apart from fresh.
 */
export const varietyKey = (p: Pick<MarketPrice, 'varietyCode' | 'variety' | 'origin' | 'condition'>) =>
  [p.varietyCode ? `code:${p.varietyCode}` : `name:${(p.variety || 'Durian').trim().toLowerCase()}`, isLocal(p) ? '' : (p.origin || '').trim().toLowerCase(), p.condition || '']
    .filter(Boolean)
    .join('~');

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** A price to suggest: the market's middle (median) per kg, rounded to Rp5.000. */
export const suggestPrice = (perKg: number[]) => (perKg.length ? Math.round(median(perKg) / 5000) * 5000 : undefined);

export interface VarietyMarket {
  key: string;
  /** Matched to one of the farm's varieties. */
  matched: boolean;
  code?: string;
  form: Form;
  name: string;
  /** Per-kg prices (per kg, or per fruit with its weight). */
  perKg: number[];
  /** Per-fruit prices with no weight. */
  perFruit: number[];
  /** Packs whose weight wasn't written: their price as quoted (can't be put per kg or per 400 g). */
  perPack: number[];
  low?: number;
  high?: number;
  median?: number;
  sellers: number;
  suggested?: number;
  store?: number;
}

/** The day's prices per variety, whole fruit then peeled flesh for each, the most quoted varieties first. */
export function marketByVariety(prices: MarketPrice[], names: (code: string) => string, store: Map<string, StorePrice>): VarietyMarket[] {
  const groups = new Map<string, { list: MarketPrice[] }>();
  const quoted = new Map<string, number>();
  for (const p of prices) {
    const k = `${varietyKey(p)}|${formOf(p)}`;
    groups.set(k, { list: [...(groups.get(k)?.list || []), p] });
    quoted.set(varietyKey(p), (quoted.get(varietyKey(p)) || 0) + 1);
  }
  return [...groups.entries()]
    .map(([key, { list }]) => {
      // The store's own price sits beside local, not frozen fruit only (what the farm sells).
      const local = isLocal(list[0]) && !list[0].condition;
      const code = local ? list[0].varietyCode : undefined;
      const extra = [isLocal(list[0]) ? '' : list[0].origin, list[0].condition || ''].filter(Boolean).join(', ');
      // In the unit the form is shown in: whole per kg, kupas per 400 g box.
      const form0 = formOf(list[0]);
      const perKg = list.map(perKgOf).filter((x): x is number => !!x).map((v) => shownPrice(form0, v));
      const perFruit = list.filter((p) => !perKgOf(p) && p.unit === 'buah').map((p) => p.price);
      const perPack = list.filter((p) => !perKgOf(p) && p.unit === 'pack').map((p) => p.price);
      const form = formOf(list[0]);
      return {
        key,
        code,
        form,
        name: `${list[0].varietyCode ? names(list[0].varietyCode) : list[0].variety || 'Durian'}${extra ? ` (${extra})` : ''}`,
        matched: !!list[0].varietyCode,
        perKg,
        perFruit,
        perPack,
        low: perKg.length ? Math.min(...perKg) : undefined,
        high: perKg.length ? Math.max(...perKg) : undefined,
        median: perKg.length ? median(perKg) : undefined,
        sellers: new Set(list.map((p) => (p.vendor || '').toLowerCase()).filter(Boolean)).size,
        // A suggestion only where our own price goes: local fresh fruit of one of the farm's varieties.
        suggested: code ? suggestPrice(perKg) : undefined,
        store: code && store.get(code)?.[form] ? shownPrice(form, store.get(code)![form]!) : undefined,
      };
    })
    .sort((a, b) => {
      const va = a.key.split('|')[0];
      const vb = b.key.split('|')[0];
      return (quoted.get(vb) || 0) - (quoted.get(va) || 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || va.localeCompare(vb) || FORMS.indexOf(a.form) - FORMS.indexOf(b.form);
    });
}

/** The days with prices, newest first, with how many prices each. */
export function priceDays(prices: MarketPrice[]): Array<{ date: string; n: number }> {
  const m = new Map<string, number>();
  for (const p of prices) m.set(p.date, (m.get(p.date) || 0) + 1);
  return [...m].map(([date, n]) => ({ date, n })).sort((a, b) => b.date.localeCompare(a.date));
}

/** A typed Rupiah amount: "150000", "150.000", "150rb", "150k", "1,2jt"; null when it is not one. */
export function parseRupiah(raw: string): number | null {
  const s = raw.toLowerCase().replace(/rp|\s/g, '');
  if (!s) return null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)(rb|k|jt)?$/);
  if (m && m[2]) {
    const n = Number(m[1].replace(',', '.'));
    return Math.round(n * (m[2] === 'jt' ? 1e6 : 1e3));
  }
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(s)) return null;
  return Number(s.replace(/[.,]/g, ''));
}

export const isOlahan = (p: Pick<MarketPrice, 'category'>) => p.category === 'olahan';

/** One variety (and origin) with its whole-fruit and kupas figures side by side: the Buah grid. */
export interface FruitGridRow {
  key: string;
  name: string;
  matched: boolean;
  sellers: number;
  utuh?: VarietyMarket;
  kupas?: VarietyMarket;
}

/** The per-form rows of marketByVariety, one line per variety: whole and kupas in their own columns. */
export function fruitGrid(rows: VarietyMarket[]): FruitGridRow[] {
  const out = new Map<string, FruitGridRow>();
  for (const r of rows) {
    const k = r.key.split('|')[0];
    const g = out.get(k) || { key: k, name: r.name, matched: r.matched, sellers: 0, utuh: undefined, kupas: undefined };
    g[r.form] = r;
    g.sellers = Math.max(g.sellers, r.sellers);
    out.set(k, g);
  }
  // The farm's varieties first, each with its own rows together: local fresh, then from elsewhere or frozen
  // (Matahari, then Matahari (frozen)); varieties not matched to the farm's last.
  const base = (g: FruitGridRow) => g.name.split(' (')[0];
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...out.values()].sort(
    (a, b) => Number(!a.matched) - Number(!b.matched) || cmp(base(a), base(b)) || Number(a.name.includes('(')) - Number(b.name.includes('(')) || cmp(a.name, b.name)
  );
}

/** Olahan by product, then size, then price. */
export const sortOlahan = (list: MarketPrice[]) =>
  [...list].sort((a, b) => (a.product || '').localeCompare(b.product || '') || (a.size || '').localeCompare(b.size || '') || a.price - b.price);

// ---------- by week ----------

/** The Monday a day's week starts on (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

/** A week as the farm says it: its Monday's place in the month and the month, "W1 Nov" (1-7: W1, 8-14: W2...). */
export function weekLabel(monday: string, locale: string): string {
  const [y, m, d] = monday.split('-').map(Number);
  return `W${Math.ceil(d / 7)} ${new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'short' })}`;
}

/**
 * Each vendor's latest price per product in a set (a week): a vendor who posts every day counts once, with the
 * newest price. A product is the variety (and origin, condition), form, grade, unit and, for olahan, type and size.
 */
export function latestPerVendor(prices: MarketPrice[]): MarketPrice[] {
  const out = new Map<string, MarketPrice>();
  for (const p of prices) {
    const k = [(p.vendor || p.vendorPhone || p.id).toLowerCase(), varietyKey(p), formOf(p), (p.grade || '').toLowerCase(), p.unit, p.category || '', (p.product || '').toLowerCase(), (p.size || '').toLowerCase()].join('|');
    const prev = out.get(k);
    if (!prev || p.date > prev.date) out.set(k, p);
  }
  return [...out.values()];
}

/** The weeks with prices, newest first, with how many prices each (each vendor's latest per product). */
export function priceWeeks(prices: MarketPrice[]): Array<{ week: string; n: number }> {
  const m = new Map<string, MarketPrice[]>();
  for (const p of prices) {
    const w = weekStart(p.date);
    m.set(w, [...(m.get(w) || []), p]);
  }
  return [...m].map(([week, list]) => ({ week, n: latestPerVendor(list).length })).sort((a, b) => b.week.localeCompare(a.week));
}

export interface WeeklySeries {
  code: string;
  name: string;
  /** The middle price per kg of each week (undefined: no price that week). */
  values: Array<number | undefined>;
}

/**
 * The weekly chart: for the farm's own varieties grown here (local, fresh), the middle price per kg of each week, in
 * one form (utuh or kupas); the last `weeks` weeks that have prices, oldest first; the `max` most quoted varieties.
 * The series keep the farm's variety order (their colours follow the variety, not its rank).
 */
export function weeklySeries(prices: MarketPrice[], form: Form, order: string[], names: (code: string) => string, weeks = 8, max = 4): { weeks: string[]; series: WeeklySeries[] } {
  const local = prices.filter((p) => !isOlahan(p) && p.varietyCode && isLocal(p) && !p.condition && formOf(p) === form && perKgOf(p));
  const byWeek = new Map<string, MarketPrice[]>();
  for (const p of local) {
    const w = weekStart(p.date);
    byWeek.set(w, [...(byWeek.get(w) || []), p]);
  }
  const ws = [...byWeek.keys()].sort().slice(-weeks);
  const quoted = new Map<string, number>();
  for (const p of local) quoted.set(p.varietyCode!, (quoted.get(p.varietyCode!) || 0) + 1);
  const codes = [...quoted.keys()]
    .sort((a, b) => (quoted.get(b) || 0) - (quoted.get(a) || 0))
    .slice(0, max)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b) || a.localeCompare(b));
  const series = codes.map((code) => ({
    code,
    name: names(code),
    values: ws.map((w) => {
      const xs = latestPerVendor(byWeek.get(w) || [])
        .filter((p) => p.varietyCode === code)
        .map((p) => perKgOf(p)!);
      return xs.length ? shownPrice(form, median(xs)) : undefined;
    }),
  }));
  return { weeks: ws, series };
}
