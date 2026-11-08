/**
 * The kupas station's boxes (bot/lib/kupas.js): each holds the flesh of fruits from one tree picked on one day, so
 * its code follows the fruits': K-A6-20261105-01 (shown K-A6-1105-01).
 */
import type { Grade } from './grading';

export interface KupasBox {
  id: string;
  code: string;
  treeId: string;
  block?: string;
  variant?: string;
  /** The day its fruits were picked. */
  fruitDate: string;
  /** The day it was peeled and recorded. */
  date: string;
  weightG: number;
  /** That tree's fruits of that day. */
  fruitCodes?: string[];
  /** The tree's grade when it was peeled. */
  grade?: Grade;
  workerPhone?: string;
}

/** K-A6-20261105-01 -> K-A6-1105-01. */
export const shortBox = (code: string) => String(code).replace(/-\d{4}(\d{4})-/, '-$1-');

/** Each tree and picking day: kupas grams ÷ the fruit's grams (key "A6|2026-11-05"). */
export function yields(boxes: KupasBox[], fruitG: (treeId: string, date: string) => number) {
  const out = new Map<string, { kupasG: number; fruitG: number; pct?: number }>();
  for (const b of boxes) {
    const k = `${b.treeId}|${b.fruitDate}`;
    const y = out.get(k) || { kupasG: 0, fruitG: fruitG(b.treeId, b.fruitDate) };
    y.kupasG += Number(b.weightG) || 0;
    out.set(k, y);
  }
  for (const y of out.values()) if (y.fruitG > 0) y.pct = Math.round((y.kupasG / y.fruitG) * 1000) / 10;
  return out;
}
