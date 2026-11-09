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

export type Grade = 'high' | 'midhigh' | 'mid' | 'low' | 'ungraded';
/**
 * The grade from the total, as management graded the first fruits: High from 70% (A3 74%, the farm's best and
 * sellable; A2 73%, D29 71%), Mid-High from 60% (almost High: A6 "MID otw HIGH"), Mid from 50% (A8 51%, D36 50%),
 * Low below (D8 40%; B29 watery, not up to standard); Ungraded until every criterion has a score.
 */
export const GRADE_FROM = { high: 70, midhigh: 60, mid: 50 } as const;

/**
 * One criterion's score on a fruit, 0-5: management's when it has one (the QC sheet scores all 14, in steps finer
 * than whole numbers: 9 points of 10 is 4.5), else, for aroma, skin and shape, the worker's own.
 */
export function scoreOf(f: Pick<HarvestFruit, 'aroma' | 'skin' | 'shape' | 'qc'>, c: Criterion): number | undefined {
  const ok = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 5;
  const m = f.qc?.[c.key];
  if (ok(m)) return m;
  const w = c.from ? f[c.from] : undefined;
  return ok(w) && w >= 1 ? w : undefined;
}

const GRADES: Grade[] = ['high', 'midhigh', 'mid', 'low'];

/**
 * A fruit's total: points (weight × score / 5, out of 100) of the criteria scored, how many of the 14 have a score,
 * and the grade (management's own when set, else from the total; Ungraded until all 14 have a score).
 */
export function qcTotal(f: Pick<HarvestFruit, 'aroma' | 'skin' | 'shape' | 'qc' | 'qcGrade'>) {
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
  // Management's own call (the sheet's MGMT QC: "LOW" for B29 with no scores) stands over the total.
  const set = f.qcGrade && GRADES.includes(f.qcGrade) ? f.qcGrade : undefined;
  return { pct, scored, complete, grade: set || (complete ? gradeOf(pct) : ('ungraded' as Grade)) };
}

export const gradeOf = (pct: number): Grade =>
  pct >= GRADE_FROM.high ? 'high' : pct >= GRADE_FROM.midhigh ? 'midhigh' : pct >= GRADE_FROM.mid ? 'mid' : 'low';

/** A typed 1-5 score, or undefined to clear it. */
export const checkQc = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : undefined);

/**
 * Grading lives on the tree: management samples one fruit (in the sheet's words, "1pc mewakili 1 pohon") and that
 * fruit's 14 scores grade the tree; every fruit of the tree carries its grade. Each sampling is one document in
 * `treeGrades`; the tree's grade is its newest sampling that has a grade, so an older one stays as history.
 */
export interface TreeGrade {
  id: string;
  treeId: string;
  /** The sampled fruit's day (YYYY-MM-DD). */
  date: string;
  /** All 14 criteria, 0-5 (the sheet's points as scores: 9 of 10 is 4.5). */
  qc?: Partial<Record<QcKey, number>>;
  /** Management's own call, over the total (the sheet's MGMT QC). */
  grade?: Grade;
  note?: string;
  photos?: import('../types').ReportPhoto[];
  /** The sampled fruit, when it is in the app: harvest id/index and its code. */
  fruitKey?: string;
  fruitCode?: string;
  weightG?: number;
  from?: 'sheet' | 'webapp';
  at?: string;
}

/** A sampling's total and grade: its own 14 scores (no worker fallback), management's grade over the total. */
export function sampleTotal(s: Pick<TreeGrade, 'qc' | 'grade'>) {
  return qcTotal({ aroma: NaN, skin: NaN, shape: NaN, qc: s.qc, qcGrade: s.grade });
}

/** Each tree's current grading: its newest sampling with a grade (by day, then when it was saved). */
export function currentGrades(list: TreeGrade[]): Map<string, TreeGrade & { total: ReturnType<typeof sampleTotal> }> {
  const out = new Map<string, TreeGrade & { total: ReturnType<typeof sampleTotal> }>();
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || String(b.at || '').localeCompare(String(a.at || '')));
  for (const s of sorted) {
    const tree = String(s.treeId || '').toUpperCase();
    if (!tree || out.has(tree)) continue;
    const total = sampleTotal(s);
    if (total.grade !== 'ungraded') out.set(tree, { ...s, total });
  }
  return out;
}

/** What a fruit shows: its tree's grade, else Ungraded. */
export const UNGRADED = { pct: 0, scored: 0, complete: false, grade: 'ungraded' as Grade };
