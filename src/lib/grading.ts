/**
 * Fruit grading, 9 criteria with weights (together 100%). The farm team scores three in Laporan PANEN on WhatsApp
 * (bentuk buah, warna kulit, aroma: 1-5, the fruit's own shape, skin, aroma); the shop team opens the fruit and scores
 * the other six on the webapp (#/qc), 1 to 5 in halves. A criterion gives weight × score / 5, so the total runs to
 * 100%; the grade follows the total.
 *
 * Gradings made before (14 criteria) keep their scores; the two new criteria come from the old ones blended:
 * tekstur creamy = mean(lemak, tekstur, kering), ketebalan daging = mean(daging tebal, biji, juring). Juring, biji,
 * kering, tekstur and unik count only through those.
 */
import type { HarvestFruit } from './fieldData';

export type QcKey = 'bentuk' | 'kulitBersih' | 'wangi' | 'manis' | 'creamy' | 'daging' | 'warna' | 'kulitTipis' | 'pahit';
/** Scores of the old 14-criteria grading, kept on the samplings made with it. */
export type OldQcKey = 'juring' | 'biji' | 'dagingTebal' | 'benyek' | 'tekstur' | 'lemak' | 'unik';
export type QcScores = Partial<Record<QcKey | OldQcKey, number>>;

/** Who scores it: the farm team (Laporan PANEN on WhatsApp) or the shop team (the webapp). */
export type QcGroup = 'kebun' | 'toko';

export interface Criterion {
  key: QcKey;
  group: QcGroup;
  /** Its share of the 100%. */
  weight: number;
  /** Scored by the worker in Laporan PANEN (the fruit's own aroma, skin, shape), not on the grading form. */
  from?: 'aroma' | 'skin' | 'shape';
}

export const CRITERIA: Criterion[] = [
  { key: 'bentuk', group: 'kebun', weight: 5, from: 'shape' },
  { key: 'kulitBersih', group: 'kebun', weight: 5, from: 'skin' },
  { key: 'wangi', group: 'kebun', weight: 5, from: 'aroma' },
  { key: 'manis', group: 'toko', weight: 20 },
  { key: 'creamy', group: 'toko', weight: 20 },
  { key: 'daging', group: 'toko', weight: 20 },
  { key: 'warna', group: 'toko', weight: 15 },
  { key: 'kulitTipis', group: 'toko', weight: 5 },
  { key: 'pahit', group: 'toko', weight: 5 },
];
export const GROUPS: QcGroup[] = ['kebun', 'toko'];
/** The criteria the shop team scores. */
export const MGMT = CRITERIA.filter((c) => !c.from);

const okScore = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 5;
const mean = (...v: unknown[]) => (v.every(okScore) ? (v as number[]).reduce((a, b) => a + b, 0) / v.length : undefined);

/** A criterion's score from a sampling's stored scores: its own, or for an old grading the blend of its old ones. */
export function storedScore(qc: QcScores | undefined, key: QcKey): number | undefined {
  if (!qc) return undefined;
  if (okScore(qc[key])) return qc[key];
  if (key === 'creamy') return mean(qc.lemak, qc.tekstur, qc.benyek);
  if (key === 'daging') return mean(qc.dagingTebal, qc.biji, qc.juring);
  return undefined;
}

/** The 9 scores of a sampling (old gradings blended), for the form and the table. */
export function currentScores(qc: QcScores | undefined): Partial<Record<QcKey, number>> {
  const out: Partial<Record<QcKey, number>> = {};
  for (const c of CRITERIA) {
    const v = storedScore(qc, c.key);
    if (v !== undefined) out[c.key] = Math.round(v * 100) / 100;
  }
  return out;
}

export type Grade = 'high' | 'midhigh' | 'mid' | 'low' | 'ungraded';
/**
 * The grade from the total, as management graded the first fruits: High from 70% (A3 74%, the farm's best and
 * sellable; A2 73%, D29 71%), Mid-High from 60% (almost High: A6 "MID otw HIGH"), Mid from 50% (A8 51%, D36 50%),
 * Low below (D8 40%; B29 watery, not up to standard); Ungraded until every criterion has a score.
 */
export const GRADE_FROM = { high: 70, midhigh: 60, mid: 50 } as const;

/**
 * One criterion's score on a fruit, 0-5: the grading's when it has one, else, for aroma, skin and shape, the
 * worker's own.
 */
export function scoreOf(f: Pick<HarvestFruit, 'aroma' | 'skin' | 'shape' | 'qc'>, c: Criterion): number | undefined {
  const m = storedScore(f.qc, c.key);
  if (m !== undefined) return m;
  const w = c.from ? f[c.from] : undefined;
  return okScore(w) && w >= 1 ? w : undefined;
}

const GRADES: Grade[] = ['high', 'midhigh', 'mid', 'low'];

/**
 * A fruit's total: points (weight × score / 5, out of 100) of the criteria scored, how many of the 9 have a score,
 * and the grade (management's own when set, else from the total; Ungraded until all 9 have a score).
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

/** A score set on the form, 1-5 in halves (3.5), or undefined to clear it. */
export const checkQc = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v * 2) && v >= 1 && v <= 5 ? v : undefined;

/**
 * Grading lives on the tree: management samples one fruit (in the sheet's words, "1pc mewakili 1 pohon") and that
 * fruit's scores grade the tree; every fruit of the tree carries its grade. Each sampling is one document in
 * `treeGrades`; the tree's grade is its newest sampling that has a grade, so an older one stays as history.
 */
export interface TreeGrade {
  id: string;
  treeId: string;
  /** The sampled fruit's day (YYYY-MM-DD). */
  date: string;
  /** The 9 criteria, 0-5 (older gradings: the 14 of then, see storedScore). */
  qc?: QcScores;
  /** Who scored it on the shop's grading page (#/qc). */
  by?: string;
  /** Management's own call, over the total (the sheet's MGMT QC). */
  grade?: Grade;
  note?: string;
  photos?: import('../types').ReportPhoto[];
  /** The sampled fruit, when it is in the app: harvest id/index and its code. */
  fruitKey?: string;
  fruitCode?: string;
  weightG?: number;
  from?: 'sheet' | 'webapp' | 'toko' | 'whatsapp-qc';
  at?: string;
}

/** A sampling's total and grade: its own scores (no worker fallback), management's grade over the total. */
export function sampleTotal(s: Pick<TreeGrade, 'qc' | 'grade'>) {
  return qcTotal({ aroma: NaN, skin: NaN, shape: NaN, qc: s.qc, qcGrade: s.grade });
}

/**
 * Which fruit was picked last: the fruit's own day and number from its code (A7-20261104-02 after A7-20261104-01),
 * else the sampling's day; when saved only breaks a tie (a re-import re-saves old samplings).
 */
export function sampleOrder(s: Pick<TreeGrade, 'date' | 'fruitCode' | 'at'>): [string, number, string] {
  const m = String(s.fruitCode || '').match(/-(\d{4})(\d{2})(\d{2})-(\d+)$/);
  return m ? [`${m[1]}-${m[2]}-${m[3]}`, Number(m[4]), String(s.at || '')] : [s.date, 0, String(s.at || '')];
}
/** Newest fruit first. */
export const newestFirst = (a: TreeGrade, b: TreeGrade) => {
  const [x, y] = [sampleOrder(a), sampleOrder(b)];
  return y[0].localeCompare(x[0]) || y[1] - x[1] || y[2].localeCompare(x[2]);
};

/**
 * Each tree's current grading: the grading of its latest graded fruit, the most like the tree's fruit now (a
 * sampling still being scored doesn't count until it has a grade).
 */
export function currentGrades(list: TreeGrade[]): Map<string, TreeGrade & { total: ReturnType<typeof sampleTotal> }> {
  const out = new Map<string, TreeGrade & { total: ReturnType<typeof sampleTotal> }>();
  const sorted = [...list].sort(newestFirst);
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
