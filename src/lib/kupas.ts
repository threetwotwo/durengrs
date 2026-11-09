/**
 * The farm kupas station's boxes (bot/lib/kupas.js). A box holds flesh of one variety, from one or more trees, so
 * its code follows the variety and peeling day: K-MK-20261109-01 (shown K-MK-1109-01). It is the farm's own lot
 * code for traceability, apart from the store's product SKUs in its POS.
 */
import type { Grade } from './grading';

export interface KupasBox {
  id: string;
  code: string;
  variety?: string;
  /** The trees whose fruit went in (older boxes: treeId). */
  treeIds?: string[];
  treeId?: string;
  /** The fruits that went in: the same list on every box of one peeling. */
  fruitCodes?: string[];
  /** Those fruits' weight in grams, when saved. */
  fruitG?: number;
  /** The day it was peeled and recorded. */
  date: string;
  weightG: number;
  /** Each tree's grade when it was peeled (older boxes: grade). */
  grades?: Record<string, Grade>;
  grade?: Grade;
  workerPhone?: string;
  /** Older boxes: the day their one tree's fruit was picked. */
  fruitDate?: string;
}

/** K-MK-20261109-01 -> K-MK-1109-01. */
export const shortBox = (code: string) => String(code).replace(/-\d{4}(\d{4})-/, '-$1-');

export const boxTrees = (b: KupasBox): string[] => b.treeIds || (b.treeId ? [b.treeId] : []);
export const boxGrade = (b: KupasBox, tree: string): Grade | undefined => b.grades?.[tree] || (b.treeId === tree ? b.grade : undefined);

/** One peeling: the boxes made from the same fruits (key: their codes). */
export const peelingKey = (b: KupasBox) => (b.fruitCodes?.length ? [...b.fruitCodes].sort().join(',') : `${b.treeId}|${b.fruitDate}`);

/** Each peeling's yield: kupas grams ÷ the fruit's grams (from the box, else from the fruits' codes). */
export function yields(boxes: KupasBox[], fruitG: (codes: string[]) => number) {
  const out = new Map<string, { kupasG: number; fruitG: number; pct?: number }>();
  for (const b of boxes) {
    const k = peelingKey(b);
    const y = out.get(k) || { kupasG: 0, fruitG: Number(b.fruitG) || fruitG(b.fruitCodes || []) };
    y.kupasG += Number(b.weightG) || 0;
    out.set(k, y);
  }
  for (const y of out.values()) if (y.fruitG > 0) y.pct = Math.round((y.kupasG / y.fruitG) * 1000) / 10;
  return out;
}
