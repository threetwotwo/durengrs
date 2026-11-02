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
  grade?: string;
  price: number;
  unit: 'kg' | 'buah' | 'other';
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

export interface StorePrice {
  code: string;
  pricePerKg: number;
}

/** The variety a price is about, as a group key: the farm's code, else the vendor's name for it. */
export const varietyKey = (p: Pick<MarketPrice, 'varietyCode' | 'variety'>) => (p.varietyCode ? `code:${p.varietyCode}` : `name:${(p.variety || 'Durian').trim().toLowerCase()}`);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** A price to suggest: the market's middle (median) per kg, rounded to Rp5.000. */
export const suggestPrice = (perKg: number[]) => (perKg.length ? Math.round(median(perKg) / 5000) * 5000 : undefined);

export interface VarietyMarket {
  key: string;
  code?: string;
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

/** The day's prices per variety, most quoted first. */
export function marketByVariety(prices: MarketPrice[], names: (code: string) => string, store: Map<string, number>): VarietyMarket[] {
  const groups = new Map<string, { list: MarketPrice[] }>();
  for (const p of prices) {
    const k = varietyKey(p);
    groups.set(k, { list: [...(groups.get(k)?.list || []), p] });
  }
  return [...groups.entries()]
    .map(([key, { list }]) => {
      const code = list[0].varietyCode;
      const perKg = list.map((p) => p.pricePerKg).filter((x): x is number => !!x);
      const perFruit = list.filter((p) => !p.pricePerKg && p.unit === 'buah').map((p) => p.price);
      return {
        key,
        code,
        name: code ? names(code) : list[0].variety || 'Durian',
        perKg,
        perFruit,
        low: perKg.length ? Math.min(...perKg) : undefined,
        high: perKg.length ? Math.max(...perKg) : undefined,
        median: perKg.length ? median(perKg) : undefined,
        sellers: new Set(list.map((p) => (p.vendor || '').toLowerCase()).filter(Boolean)).size,
        suggested: suggestPrice(perKg),
        store: code ? store.get(code) : undefined,
      };
    })
    .sort((a, b) => b.perKg.length + b.perFruit.length - (a.perKg.length + a.perFruit.length) || a.name.localeCompare(b.name));
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
