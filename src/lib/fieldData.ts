import { Timestamp, collection, deleteDoc, deleteField, doc, getDoc, runTransaction, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
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
  /** The WhatsApp number that sent it (shown by name via the Workers list). */
  workerPhone?: string;
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

/** One record per block, season and task. The first record stands (same as WhatsApp): marking it again changes nothing. */
export async function markSeasonTask(block: string, season: string, task: SeasonTaskId, date: string): Promise<void> {
  const ref = doc(db, 'seasonTasks', seasonTaskId(block, season, task));
  if ((await getDoc(ref)).exists()) return;
  await setDoc(ref, {
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
export const bloomWaveId = (treeId: string, date: string, part: BloomPart) => `${treeId}_${date}_${part}`;

/** Same id the WhatsApp bot uses, so one flowering reported in both places stays one record (not a duplicate wave). */
export async function addTreeBloom(b: { treeId: string; block: string; date: string; part: BloomPart; note?: string }): Promise<{ id: string; created: boolean }> {
  const id = bloomWaveId(b.treeId, b.date, b.part);
  const ref = doc(db, 'bloomWaves', id);
  if ((await getDoc(ref)).exists()) return { id, created: false };
  await setDoc(ref, stripUndefined({ ...b, source: 'webapp', createdAt: serverTimestamp() }));
  return { id, created: true };
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

// ---------- new tree, archive, restore ----------

/** Creates trees/{id}. Never overwrites, and an archived tree's ID counts as taken. */
export async function createTree(t: { id: string; block: string; number: number; variant: string; datePlanted?: string }): Promise<'created' | 'exists'> {
  const ref = doc(db, 'trees', t.id);
  return runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) return 'exists' as const;
    tx.set(ref, {
      id: t.id,
      block: t.block,
      treeNumber: t.number,
      variant: t.variant,
      condition: 'not_assessed',
      active: true,
      ...(t.datePlanted ? { datePlanted: Timestamp.fromDate(new Date(`${t.datePlanted}T00:00:00`)) } : {}),
      source: 'webapp',
      dateCreated: serverTimestamp(),
      dateUpdated: serverTimestamp(),
    });
    return 'created' as const;
  });
}

/**
 * Archives a tree instead of deleting it: reports, counts, harvests and photos stay, the ID stays reserved
 * for good, and the tree leaves the lists and closes to WhatsApp. Reversible with restoreTree.
 */
export async function archiveTree(treeId: string, reason: string, note: string): Promise<'archived' | 'already' | 'missing'> {
  const ref = doc(db, 'trees', treeId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return 'missing' as const;
    if (snap.data().active === false) return 'already' as const;
    tx.update(ref, {
      active: false,
      archivedAt: serverTimestamp(),
      archivedReason: reason,
      archivedNote: note.trim() || deleteField(),
      dateUpdated: serverTimestamp(),
    });
    tx.set(doc(collection(db, 'treeEdits')), {
      treeId,
      changes: { active: { from: true, to: false } },
      reason,
      source: 'webapp',
      at: serverTimestamp(),
    });
    return 'archived' as const;
  });
}

export async function restoreTree(treeId: string): Promise<'restored' | 'already' | 'missing'> {
  const ref = doc(db, 'trees', treeId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return 'missing' as const;
    if (snap.data().active !== false) return 'already' as const;
    tx.update(ref, { active: true, archivedAt: deleteField(), archivedReason: deleteField(), archivedNote: deleteField(), dateUpdated: serverTimestamp() });
    tx.set(doc(collection(db, 'treeEdits')), {
      treeId,
      changes: { active: { from: false, to: true } },
      source: 'webapp',
      at: serverTimestamp(),
    });
    return 'restored' as const;
  });
}
