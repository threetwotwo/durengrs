import { collection, deleteDoc, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { BloomPart, TreeBloom } from './guide';
import type { ReportPhoto } from '../types';

/**
 * Farm records the Guide needs, entered in the web app (all writes for them live here).
 *
 *   harvests/{auto}                       what was picked, when, how much, quality problems          (audit A6)
 *   seasonTasks/{block}_{season}_{task}   one-off season work done (thinning, bagging, tying...)     (A11)
 *   weather/{YYYY-MM-DD}                  rain in mm from the farm's rain gauge                       (A15)
 *   labResults/{auto}                     leaf and soil analysis per block                           (A16)
 *   farmMeta/weeklyReview                 when the weekly farm check was last done                   (A7)
 *   bloomWaves/{auto}                     a tree, or some of its branches, flowering apart from its block's bloom date
 *   cropCounts/{tree}_{season}_{stage}_{date}  per-tree crop counts: flower clusters, fruit set, kept after thinning,
 *                                         fruit on the tree (repeated to follow progress)
 *
 * Calendar dates are YYYY-MM-DD in local (Indonesian) time; instants are Firestore timestamps.
 */

export const HARVEST_PROBLEMS = ['wet_core', 'uneven', 'rot', 'crack', 'borer'] as const;
export type HarvestProblem = (typeof HARVEST_PROBLEMS)[number];

/** Grades from the Codex durian standard (CXS 317-2014) and the ASEAN durian standard: Extra, Class I, Class II, reject. */
export const GRADES = ['extra', 'class1', 'class2', 'reject'] as const;
export type Grade = (typeof GRADES)[number];

export interface Harvest {
  id: string;
  block: string;
  /** Picked from one tree (per-tree tracking); absent for a whole-block entry. */
  treeId?: string;
  variant: string;
  date: string;
  fruits: number;
  weightKg?: number;
  problems: HarvestProblem[];
  /** How many of the fruits had any problem. */
  problemFruits?: number;
  /** Fruit per grade; their sum is `fruits`. Older entries have no grades. */
  grades?: Partial<Record<Grade, number>>;
  /** Bloom date of the block's season at the time (copied so later edits don't change history). */
  floweredOn?: string;
  daysFromBloom?: number;
  notes?: string;
  source?: 'webapp' | 'whatsapp';
  /** Photos sent with the harvest report on WhatsApp (same three sizes as report photos). */
  photos?: ReportPhoto[];
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

// ---------- crop counts ----------

/** What is counted on a tree through the season, in order. Fruit on the tree is counted again to follow progress. */
export const CROP_STAGES = ['clusters', 'set', 'kept', 'onTree'] as const;
export type CropStage = (typeof CROP_STAGES)[number];

export interface CropCount {
  id: string;
  treeId: string;
  block: string;
  /** Date the counted flowers opened (the tree's flowering wave): identifies the crop. */
  season: string;
  stage: CropStage;
  count: number;
  date: string;
  by?: string;
  note?: string;
  source?: 'webapp' | 'whatsapp';
  /** Photos sent with the count on WhatsApp. */
  photos?: ReportPhoto[];
}

export const cropCountId = (c: Pick<CropCount, 'treeId' | 'season' | 'stage' | 'date'>) => `${c.treeId}_${c.season}_${c.stage}_${c.date}`;

/**
 * Save a count (counting again on the same day replaces it). `treeField` also keeps the tree record current
 * (flower clusters, or the fruit estimate the harvest forecast uses), with the usual edit-log entry.
 */
export async function saveCropCount(
  c: Omit<CropCount, 'id'>,
  treeField?: { field: 'floweringClusters' | 'estimatedFruitCount'; from: number | undefined }
): Promise<string> {
  const id = cropCountId(c);
  const batch = writeBatch(db);
  batch.set(doc(db, 'cropCounts', id), stripUndefined({ ...c, source: 'webapp', createdAt: serverTimestamp() }));
  if (treeField && treeField.from !== c.count) {
    batch.update(doc(db, 'trees', c.treeId), { [treeField.field]: c.count, dateUpdated: serverTimestamp() });
    batch.set(doc(collection(db, 'treeEdits')), {
      treeId: c.treeId,
      changes: { [treeField.field]: { from: treeField.from ?? null, to: c.count } },
      at: serverTimestamp(),
      source: 'webapp',
    });
  }
  await batch.commit();
  return id;
}

export async function removeCropCount(id: string, photos?: ReportPhoto[]): Promise<void> {
  if (photos?.length) return void (await import('./reportAdmin').then((m) => m.deleteRecordWithPhotos('cropCounts', { id, photos })));
  await deleteDoc(doc(db, 'cropCounts', id));
}

// ---------- tree bloom waves ----------

/** A tree flowered on its own date: the whole tree (replaces the block date for it) or only some branches. */
export async function addTreeBloom(b: { treeId: string; block: string; date: string; part: BloomPart; note?: string }): Promise<string> {
  const ref = doc(collection(db, 'bloomWaves'));
  await setDoc(ref, stripUndefined({ ...b, source: 'webapp', createdAt: serverTimestamp() }));
  return ref.id;
}

export async function removeTreeBloom(id: string, photos?: ReportPhoto[]): Promise<void> {
  if (photos?.length) return void (await import('./reportAdmin').then((m) => m.deleteRecordWithPhotos('bloomWaves', { id, photos })));
  await deleteDoc(doc(db, 'bloomWaves', id));
}

export type { TreeBloom };

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
