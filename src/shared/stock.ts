/**
 * The farm warehouse's stock of pupuk and obat (Inventaris Obat & Pupuk): each product (`stockItems`) with its unit,
 * and every change to it (`stockMoves`): in (a delivery), out (used in the field), or count (stock opname: the
 * balance is what was counted, whatever was recorded before). The balance is the last count plus what came in
 * minus what went out since.
 */

/** The units products are kept in; a quantity in another unit of the same kind is converted. */
export const STOCK_UNITS = ['kg', 'gr', 'ltr', 'ml'] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

export interface StockItem {
  id: string;
  /** As the warehouse names it: "TSP 46% Cap Kuda by Santani (50kg)". */
  name: string;
  /** Short names workers use ("TSP", "KCL"), for reading their messages. */
  aliases?: string[];
  /** Kandungan / bahan aktif. */
  content?: string;
  /** Tipe: "Pupuk Makro Tunggal - P". */
  kind?: string;
  /** Cara kerja: Tabur, Semprot, Kocor. */
  method?: string;
  /** The section of the list: A. Crop nutrition, … */
  section?: string;
  unit: StockUnit;
  /** One pack (sak, botol, bungkus) in the item's unit: 50 for a 50 kg sack kept in kg. */
  pack?: number;
  /** "buy": on the shopping list. */
  status?: string;
  /** Warn below this balance (item's unit); default: less than one pack. */
  min?: number;
  order?: number;
}

export type StockMoveType = 'in' | 'out' | 'count';

export interface StockMove {
  id: string;
  itemId: string;
  type: StockMoveType;
  /** In the item's unit: what came in, went out, or was counted. */
  qty: number;
  date: string;
  /** Where it was used. */
  block?: string;
  note?: string;
  workerPhone?: string;
  source?: string;
  /** ISO time it was recorded: orders moves of one day. */
  at?: string;
}

const KIND: Record<StockUnit, { base: StockUnit; factor: number }> = {
  kg: { base: 'gr', factor: 1000 },
  gr: { base: 'gr', factor: 1 },
  ltr: { base: 'ml', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
};

/** "kg", "Kg", "kilo" -> kg; "g", "gram" -> gr; "l", "liter" -> ltr; "cc" -> ml; packs -> 'pack'. */
export function normalizeUnit(u: string | undefined): StockUnit | 'pack' | undefined {
  const s = String(u || '').trim().toLowerCase().replace(/\.$/, '');
  if (!s) return undefined;
  if (['kg', 'kilo', 'kilogram', 'kgs'].includes(s)) return 'kg';
  if (['g', 'gr', 'gram', 'grm', 'grams'].includes(s)) return 'gr';
  if (['l', 'lt', 'ltr', 'liter', 'litre', 'liters'].includes(s)) return 'ltr';
  if (['ml', 'cc', 'mili', 'mililiter'].includes(s)) return 'ml';
  if (['sak', 'karung', 'zak', 'bag', 'botol', 'bungkus', 'bks', 'pack', 'pak', 'kemasan', 'pcs', 'pc', 'buah', 'kaleng', 'dus', 'box', 'jerigen', 'sachet', 'saset'].includes(s)) return 'pack';
  return undefined;
}

/**
 * A quantity in the item's own unit: 2 sak of a 50 kg item kept in kg is 100; 500 gr of an item kept in kg is 0.5.
 * Undefined when it can't be converted (litres of an item kept in kg, packs of an item with no pack size).
 */
export function toItemUnit(qty: number, unit: string | undefined, item: Pick<StockItem, 'unit' | 'pack'>): number | undefined {
  if (!(qty >= 0)) return undefined;
  const u = normalizeUnit(unit) || item.unit;
  if (u === 'pack') return item.pack ? round(qty * item.pack) : undefined;
  const from = KIND[u];
  const to = KIND[item.unit];
  if (!from || !to || from.base !== to.base) return undefined;
  return round((qty * from.factor) / to.factor);
}

/** A pack size from the name: "(50kg)" -> 50 in kg; "(500gr)" -> 500 in gr, or 0.5 when kept in kg. */
export function packFromName(name: string, unit: StockUnit): number | undefined {
  const m = String(name).match(/\((\d+(?:[.,]\d+)?)\s*(kg|gr|g|ltr|l|ml)\)/i);
  if (!m) return undefined;
  return toItemUnit(Number(m[1].replace(',', '.')), m[2], { unit });
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Moves in the order they happened: by day, then when recorded. */
export const byTime = (a: StockMove, b: StockMove) => a.date.localeCompare(b.date) || String(a.at || '').localeCompare(String(b.at || ''));

/**
 * Each item's balance from its moves: the last count, plus in, minus out after it. `since`: the day of the last
 * count (the balance's base); `last`: the newest move.
 */
export function stockBalances(moves: StockMove[]): Map<string, { balance: number; since?: string; last?: StockMove; counted?: number }> {
  const out = new Map<string, { balance: number; since?: string; last?: StockMove; counted?: number }>();
  for (const m of [...moves].sort(byTime)) {
    const b = out.get(m.itemId) || { balance: 0 };
    const q = Number(m.qty) || 0;
    if (m.type === 'count') {
      b.balance = q;
      b.since = m.date;
      b.counted = q;
    } else b.balance += m.type === 'in' ? q : -q;
    b.balance = round(b.balance);
    b.last = m;
    out.set(m.itemId, b);
  }
  return out;
}

/** Where an item stands: 'out' (nothing left), 'low' (below its minimum, default one pack), or 'ok'. */
export function stockLevel(item: Pick<StockItem, 'min' | 'pack'>, balance: number): 'out' | 'low' | 'ok' {
  if (balance <= 0) return 'out';
  const min = item.min ?? item.pack ?? 0;
  return balance < min ? 'low' : 'ok';
}

/** A quantity for people: "1.600 kg (32 sak)", "750 gr", "0,5 ltr". `id` locale for the workers, `en` for the webapp. */
export function stockQty(qty: number, item: Pick<StockItem, 'unit' | 'pack'>, locale: 'id' | 'en' = 'id'): string {
  const f = (n: number) => n.toLocaleString(locale === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: 2 });
  const packs = item.pack && item.pack > 1 && qty > 0 ? qty / item.pack : 0;
  const packWord = locale === 'id' ? 'kemasan' : 'packs';
  return `${f(qty)} ${item.unit}${packs && Math.abs(packs - Math.round(packs * 10) / 10) < 1e-9 ? ` (${f(packs)} ${packWord})` : packs ? ` (${f(Math.round(packs * 10) / 10)} ${packWord})` : ''}`;
}
