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
  [p.varietyCode ? `code:${p.varietyCode}` : `name:${(p.variety || 'Durian').trim().toLowerCase()}`, isLocal(p) ? '' : (p.origin || '').trim().toLowerCase(), p.condition === 'frozen' ? 'frozen' : '']
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
      const local = isLocal(list[0]) && list[0].condition !== 'frozen';
      const code = local ? list[0].varietyCode : undefined;
      const extra = [isLocal(list[0]) ? '' : list[0].origin, list[0].condition === 'frozen' ? 'frozen' : ''].filter(Boolean).join(', ');
      const perKg = list.map((p) => p.pricePerKg).filter((x): x is number => !!x);
      const perFruit = list.filter((p) => !p.pricePerKg && p.unit === 'buah').map((p) => p.price);
      const form = formOf(list[0]);
      return {
        key,
        code,
        form,
        name: `${list[0].varietyCode ? names(list[0].varietyCode) : list[0].variety || 'Durian'}${extra ? ` (${extra})` : ''}`,
        matched: !!list[0].varietyCode,
        perKg,
        perFruit,
        low: perKg.length ? Math.min(...perKg) : undefined,
        high: perKg.length ? Math.max(...perKg) : undefined,
        median: perKg.length ? median(perKg) : undefined,
        sellers: new Set(list.map((p) => (p.vendor || '').toLowerCase()).filter(Boolean)).size,
        suggested: suggestPrice(perKg),
        store: code ? store.get(code)?.[form] : undefined,
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
