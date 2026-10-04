import { collection, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Farm records the Guide needs, entered in the web app (all writes for them live here).
 *
 *   harvests/{auto}                       what was picked, when, how much, quality problems          (audit A6)
 *   seasonTasks/{block}_{season}_{task}   one-off season work done (thinning, bagging, tying...)     (A11)
 *   weather/{YYYY-MM-DD}                  rain in mm from the farm's rain gauge                       (A15)
 *   labResults/{auto}                     leaf and soil analysis per block                           (A16)
 *   farmMeta/weeklyReview                 when the weekly farm check was last done                   (A7)
 *
 * Calendar dates are YYYY-MM-DD in local (Indonesian) time; instants are Firestore timestamps.
 */

export const HARVEST_PROBLEMS = ['wet_core', 'uneven', 'rot', 'crack', 'borer'] as const;
export type HarvestProblem = (typeof HARVEST_PROBLEMS)[number];

export interface Harvest {
  id: string;
  block: string;
  variant: string;
  date: string;
  fruits: number;
  weightKg?: number;
  problems: HarvestProblem[];
  /** How many of the fruits had any problem. */
  problemFruits?: number;
  /** Bloom date of the block's season at the time (copied so later edits don't change history). */
  floweredOn?: string;
  daysFromBloom?: number;
  notes?: string;
  source?: 'webapp' | 'whatsapp';
}

export type SeasonTaskId = 'hand_pollination' | 'fruit_thinning' | 'bagging' | 'ca_mg_spray' | 'fruit_tying';

export interface SeasonTaskDone {
  id: string;
  block: string;
  task: SeasonTaskId;
  /** The block's bloom date: identifies the season. */
  season: string;
  date: string;
}

export interface RainDay {
  date: string;
  rainMm: number;
}

export const LAB_KEYS = ['ph', 'om', 'n', 'p', 'k', 'ca', 'mg', 'b', 'zn'] as const;
export type LabKey = (typeof LAB_KEYS)[number];

export interface LabResult {
  id: string;
  block: string;
  date: string;
  lab?: string;
  values: Partial<Record<LabKey, number>>;
  notes?: string;
}

const stripUndefined = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T;

// ---------- harvests ----------

export async function addHarvest(h: Omit<Harvest, 'id'>): Promise<string> {
  const ref = doc(collection(db, 'harvests'));
  await setDoc(ref, stripUndefined({ ...h, source: h.source || 'webapp', createdAt: serverTimestamp() }));
  return ref.id;
}

export async function removeHarvest(id: string): Promise<void> {
  await deleteDoc(doc(db, 'harvests', id));
}

// ---------- season tasks ----------

export const seasonTaskId = (block: string, season: string, task: SeasonTaskId) => `${block}_${season}_${task}`;

/** One record per block, season and task: tapping Done twice keeps one record. */
export async function markSeasonTask(block: string, season: string, task: SeasonTaskId, date: string): Promise<void> {
  await setDoc(doc(db, 'seasonTasks', seasonTaskId(block, season, task)), {
    block,
    season,
    task,
    date,
    source: 'webapp',
    createdAt: serverTimestamp(),
  });
}

export async function unmarkSeasonTask(block: string, season: string, task: SeasonTaskId): Promise<void> {
  await deleteDoc(doc(db, 'seasonTasks', seasonTaskId(block, season, task)));
}

// ---------- rain ----------

/** One reading per day; saving again replaces it, null removes it. */
export async function saveRain(date: string, rainMm: number | null): Promise<void> {
  const ref = doc(db, 'weather', date);
  if (rainMm === null) return deleteDoc(ref);
  await setDoc(ref, { date, rainMm, source: 'webapp', updatedAt: serverTimestamp() });
}

// ---------- lab results ----------

export async function addLabResult(r: Omit<LabResult, 'id'>): Promise<string> {
  const ref = doc(collection(db, 'labResults'));
  await setDoc(ref, stripUndefined({ ...r, values: stripUndefined(r.values), createdAt: serverTimestamp() }));
  return ref.id;
}

export async function removeLabResult(id: string): Promise<void> {
  await deleteDoc(doc(db, 'labResults', id));
}

// ---------- weekly review ----------

export async function markWeeklyReview(date: string): Promise<void> {
  await setDoc(doc(db, 'farmMeta', 'weeklyReview'), { date, at: serverTimestamp() });
}
