import { normalizeTimestamp } from '../context/FarmContext';
import { toDateStr, todayStr } from './treatments';
import { typicalMaxFruit } from './guide';

/**
 * Limits for tree measurements, shared by the tree form (and later the WhatsApp bot).
 * Generous on purpose: they catch typos and wrong units, not unusual trees.
 */
export const TREE_LIMITS = {
  trunkSize: { min: 1, max: 600, integer: false }, // girth, cm
  canopySize: { min: 50, max: 2500, integer: false }, // spread, cm
  floweringClusters: { min: 0, max: 2000, integer: true },
  estimatedFruitCount: { min: 0, max: 500, integer: true },
} as const;

export type MeasureField = keyof typeof TREE_LIMITS;
export const EARLIEST_PLANTING = '1990-01-01';

/** `datePlanted` in any stored form (Timestamp, ISO string, YYYY-MM-DD) as YYYY-MM-DD, or ''. */
export function plantedDateStr(v: unknown): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const ms = normalizeTimestamp(v);
  return ms ? toDateStr(new Date(ms)) : '';
}

export interface TreeFormValues {
  trunkSize: string;
  canopySize: string;
  floweringClusters: string;
  estimatedFruitCount: string;
  datePlanted: string;
}

export interface TreeFormCheck {
  /** i18n key + vars per field; any error blocks saving. */
  errors: Partial<Record<MeasureField | 'datePlanted', { key: string; vars?: Record<string, string | number> }>>;
  /** Shown but does not block saving. */
  fruitWarning?: { key: string; vars: Record<string, string | number> };
}

/**
 * Checks only the fields that changed from `initial`, so an odd old value (e.g. canopy saved as "4 m")
 * never blocks saving something else.
 */
export function checkTreeForm(values: TreeFormValues, initial: TreeFormValues, today = todayStr()): TreeFormCheck {
  const errors: TreeFormCheck['errors'] = {};
  (Object.keys(TREE_LIMITS) as MeasureField[]).forEach((f) => {
    const raw = values[f].trim();
    if (raw === '' || raw === initial[f].trim()) return;
    const n = Number(raw.replace(',', '.'));
    const lim = TREE_LIMITS[f];
    if (!Number.isFinite(n)) errors[f] = { key: 'tree.v.number' };
    else if (lim.integer && !Number.isInteger(n)) errors[f] = { key: 'tree.v.whole' };
    else if (n < lim.min || n > lim.max) errors[f] = { key: 'tree.v.range', vars: { min: lim.min, max: lim.max } };
  });

  const d = values.datePlanted;
  if (d && d !== initial.datePlanted) {
    if (d > today) errors.datePlanted = { key: 'tree.v.future' };
    else if (d < EARLIEST_PLANTING) errors.datePlanted = { key: 'tree.v.tooOld' };
  }

  let fruitWarning: TreeFormCheck['fruitWarning'];
  const fruit = Number(values.estimatedFruitCount);
  if (values.estimatedFruitCount.trim() && Number.isFinite(fruit) && d) {
    const age = (Date.parse(today) - Date.parse(d)) / (365.25 * 24 * 60 * 60 * 1000);
    const max = typicalMaxFruit(age);
    if (max !== null && fruit > max) fruitWarning = { key: 'tree.v.fruitHigh', vars: { n: fruit, max, age: Math.floor(age) } };
  }
  return { errors, fruitWarning };
}
