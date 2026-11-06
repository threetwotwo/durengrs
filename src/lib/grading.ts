/**
 * Fruit grading, the Kb. AVINA harvest report: 14 criteria in five groups, each with its weight (together 100%).
 * Three are scored by the worker in Laporan PANEN (aroma, kulit, bentuk: 1-5); management scores the other 11 on the
 * fruit's page, 1 (the second word: Cacat, Rongga, Pucat…) to 5 (the first: Bersih, Penuh, Terang…). A criterion
 * gives weight × score / 5, so the total runs to 100%; the grade follows the total.
 */
import type { HarvestFruit } from './fieldData';

export type QcKey =
  | 'wangi'
  | 'kulitBersih'
  | 'kulitTipis'
  | 'bentuk'
  | 'juring'
  | 'biji'
  | 'dagingTebal'
  | 'warna'
  | 'benyek'
  | 'tekstur'
  | 'manis'
  | 'lemak'
  | 'pahit'
  | 'unik';

export type QcGroup = 'aroma' | 'kulit' | 'buah' | 'daging' | 'rasa';

export interface Criterion {
  key: QcKey;
  group: QcGroup;
  /** Its share of the 100%. */
  weight: number;
  /** Scored by the worker in Laporan PANEN (the fruit's own aroma, skin, shape), not on the grading form. */
  from?: 'aroma' | 'skin' | 'shape';
}

export const CRITERIA: Criterion[] = [
  { key: 'wangi', group: 'aroma', weight: 5, from: 'aroma' },
  { key: 'kulitBersih', group: 'kulit', weight: 5, from: 'skin' },
  { key: 'kulitTipis', group: 'kulit', weight: 5 },
  { key: 'bentuk', group: 'buah', weight: 5, from: 'shape' },
  { key: 'juring', group: 'buah', weight: 5 },
  { key: 'biji', group: 'buah', weight: 10 },
  { key: 'dagingTebal', group: 'daging', weight: 10 },
  { key: 'warna', group: 'daging', weight: 10 },
  { key: 'benyek', group: 'daging', weight: 5 },
  { key: 'tekstur', group: 'daging', weight: 5 },
  { key: 'manis', group: 'rasa', weight: 15 },
  { key: 'lemak', group: 'rasa', weight: 10 },
  { key: 'pahit', group: 'rasa', weight: 5 },
  { key: 'unik', group: 'rasa', weight: 5 },
];
export const GROUPS: QcGroup[] = ['aroma', 'kulit', 'buah', 'daging', 'rasa'];
/** The criteria management fills in. */
export const MGMT = CRITERIA.filter((c) => !c.from);

export type Grade = 'high' | 'mid' | 'low' | 'ungraded';
/**
 * The grade from the total: High from 72% (A3 at 74% is the farm's best, sellable; D29 at 71% is not up to
 * standard), Mid from 50%, Low below; Ungraded until every criterion has a score.
 */
export const GRADE_FROM = { high: 72, mid: 50 } as const;

/** One criterion's 1-5 score on a fruit: the worker's for aroma, skin, shape; management's for the rest. */
export function scoreOf(f: Pick<HarvestFruit, 'aroma' | 'skin' | 'shape' | 'qc'>, c: Criterion): number | undefined {
  const v = c.from ? f[c.from] : f.qc?.[c.key];
  return typeof v === 'number' && v >= 1 && v <= 5 ? v : undefined;
}

/**
 * A fruit's total: points (weight × score / 5, out of 100) of the criteria scored, how many of the 14 have a score,
 * and the grade (Ungraded until all 14 do).
 */
export function qcTotal(f: Pick<HarvestFruit, 'aroma' | 'skin' | 'shape' | 'qc'>) {
  let points = 0;
  let scored = 0;
  for (const c of CRITERIA) {
    const s = scoreOf(f, c);
    if (s === undefined) continue;
    scored++;
    points += (c.weight * s) / 5;
  }
  const complete = scored === CRITERIA.length;
  const pct = Math.round(points * 10) / 10;
  return { pct, scored, complete, grade: complete ? gradeOf(pct) : ('ungraded' as Grade) };
}

export const gradeOf = (pct: number): Grade => (pct >= GRADE_FROM.high ? 'high' : pct >= GRADE_FROM.mid ? 'mid' : 'low');

/** A typed 1-5 score, or undefined to clear it. */
export const checkQc = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : undefined);
