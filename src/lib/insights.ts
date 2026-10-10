import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { DurianTree, TreeReport } from '../types';
import { locale, translate } from '../i18n';
import { diffDays } from './treatments';

const DAY = 24 * 60 * 60 * 1000;

// ---------- follow-up ----------

/** An emergency tree should be re-checked within 2 days, a minor one within 7. */
export const FOLLOW_UP_LIMIT_DAYS = { emergency: 2, minor: 7 } as const;

export interface FollowUp {
  needs: boolean;
  /** Days since the last report; null when the tree has never been reported. */
  waitingDays: number | null;
  limitDays: number;
}

export function followUpOf(tree: DurianTree, lastReportMs: number, now = Date.now()): FollowUp {
  const limit =
    tree.condition === 'emergency'
      ? FOLLOW_UP_LIMIT_DAYS.emergency
      : tree.condition === 'minor'
      ? FOLLOW_UP_LIMIT_DAYS.minor
      : 0;
  if (!limit) return { needs: false, waitingDays: null, limitDays: 0 };
  if (!lastReportMs) return { needs: true, waitingDays: null, limitDays: limit };
  const waiting = (now - lastReportMs) / DAY;
  return { needs: waiting > limit, waitingDays: Math.floor(waiting), limitDays: limit };
}

// ---------- harvest outlook ----------

/** The block's bloom date. Expected harvest = flowering date + the variant's ripening days. Trees can flower apart (bloomWaves). */
export interface HarvestCycle {
  block: string;
  floweredOn: string; // YYYY-MM-DD
}

export interface HarvestRow {
  block: string;
  variant: string;
  variantName: string;
  trees: number;
  fruits: number;
  floweredOn?: string;
  ripeningDays?: number;
  harvestDate?: string;
  daysToHarvest?: number;
}

/** A new date this close to the old one is a correction of the same flowering; further apart, it is a new season. */
export const BLOOM_CORRECTION_DAYS = 45;
export const isBloomCorrection = (old: string | undefined, next: string) =>
  !!old && old !== next && Math.abs(diffDays(next, old)) <= BLOOM_CORRECTION_DAYS;

/**
 * Set (or clear) a block's bloom date. Correcting the date (within BLOOM_CORRECTION_DAYS) moves what was recorded against
 * the old one (fruit counts and season tasks, from WhatsApp or here) to the new date, so nothing drops off the harvest
 * page. A new season's date moves nothing: last season's records stay with last season. Returns how many records moved.
 */
export async function saveHarvestCycle(block: string, floweredOn: string | null): Promise<number> {
  const ref = doc(db, 'harvestCycles', block);
  if (!floweredOn) {
    await deleteDoc(ref);
    return 0;
  }
  const before = await getDoc(ref);
  const old: string | undefined = before.exists() ? before.data().floweredOn : undefined;
  const moved = isBloomCorrection(old, floweredOn) ? await moveSeason(block, old!, floweredOn) : 0;
  await setDoc(ref, { block, floweredOn, updatedAt: serverTimestamp() });
  return moved;
}

type Rec = { id: string; [k: string]: any };

/**
 * What a block-date correction moves: counts and season tasks recorded against the old date, re-keyed to the new one.
 * Pure, so it can be tested.
 * - A tree that flowered WHOLE on its own exactly on the old date keeps its counts there (they belong to that flowering),
 *   and then the block's season tasks stay too, since that date is still a flowering of the block.
 * - A record that already exists at the new id is never overwritten (the first record stands); the old one stays.
 */
export function seasonMovePlan(block: string, from: string, to: string, counts: Rec[], tasks: Rec[], blooms: Rec[]) {
  const wholeOnOldDate = new Set(blooms.filter((b) => b.block === block && b.date === from && b.part === 'whole').map((b) => b.treeId as string));
  const taken = new Set([...counts, ...tasks].map((r) => r.id));
  const moves: Array<{ collection: 'cropCounts' | 'seasonTasks'; from: string; to: string; data: Record<string, any> }> = [];
  for (const { id, ...c } of counts) {
    if (c.block !== block || c.season !== from || wholeOnOldDate.has(c.treeId)) continue;
    const target = `${c.treeId}_${to}_${c.stage}_${c.date}`;
    if (!taken.has(target)) moves.push({ collection: 'cropCounts', from: id, to: target, data: { ...c, season: to } });
  }
  if (!wholeOnOldDate.size) {
    for (const { id, ...s } of tasks) {
      if (s.block !== block || s.season !== from) continue;
      const target = `${block}_${to}_${s.task}`;
      if (!taken.has(target)) moves.push({ collection: 'seasonTasks', from: id, to: target, data: { ...s, season: to } });
    }
  }
  return moves;
}

async function moveSeason(block: string, from: string, to: string): Promise<number> {
  const [counts, tasks, blooms] = await Promise.all(
    ['cropCounts', 'seasonTasks', 'bloomWaves'].map((c) => getDocs(query(collection(db, c), where('block', '==', block))))
  );
  const rows = (snap: Awaited<ReturnType<typeof getDocs>>) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const moves = seasonMovePlan(block, from, to, rows(counts), rows(tasks), rows(blooms));
  // Firestore allows 500 writes per batch; each move is 2 (write the new record, delete the old).
  for (let i = 0; i < moves.length; i += 200) {
    const batch = writeBatch(db);
    for (const m of moves.slice(i, i + 200)) {
      batch.set(doc(db, m.collection, m.to), m.data);
      batch.delete(doc(db, m.collection, m.from));
    }
    await batch.commit();
  }
  return moves.length;
}

// ---------- activity ----------

export interface ActivitySummary {
  perDay: Array<{ date: string; label: string; count: number }>;
  perWorker: Array<{ phone: string; reports: number; trees: number; lastAt: number }>;
  perBlock: Array<{ block: string; total: number; reported: number }>;
  total: number;
}

export function summariseActivity(reports: TreeReport[], trees: DurianTree[], days: number, now = Date.now()): ActivitySummary {
  const since = now - days * DAY;
  const inRange = reports.filter((r) => {
    const ms = tsMs(r.createdAt);
    return ms >= since;
  });

  const dayCounts = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    dayCounts.set(localDate(now - i * DAY), 0);
  }
  const workers = new Map<string, { reports: number; trees: Set<string>; lastAt: number }>();
  const reportedTrees = new Set<string>();

  for (const r of inRange) {
    const ms = tsMs(r.createdAt);
    const d = localDate(ms);
    if (dayCounts.has(d)) dayCounts.set(d, (dayCounts.get(d) || 0) + 1);
    const phone = r.workerPhone || translate('common.unknown');
    const w = workers.get(phone) || { reports: 0, trees: new Set<string>(), lastAt: 0 };
    w.reports++;
    w.trees.add(r.treeId);
    w.lastAt = Math.max(w.lastAt, ms);
    workers.set(phone, w);
    reportedTrees.add(r.treeId);
  }

  const blockTotals = new Map<string, { total: number; reported: number }>();
  for (const t of trees) {
    if (!t.block) continue;
    const b = blockTotals.get(t.block) || { total: 0, reported: 0 };
    b.total++;
    if (reportedTrees.has(t.id)) b.reported++;
    blockTotals.set(t.block, b);
  }

  return {
    perDay: Array.from(dayCounts.entries()).map(([date, count]) => ({
      date,
      label: new Date(date + 'T00:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' }),
      count,
    })),
    perWorker: Array.from(workers.entries())
      .map(([phone, w]) => ({ phone, reports: w.reports, trees: w.trees.size, lastAt: w.lastAt }))
      .sort((a, b) => b.reports - a.reports),
    perBlock: Array.from(blockTotals.entries())
      .map(([block, v]) => ({ block, ...v }))
      .sort((a, b) => a.block.localeCompare(b.block)),
    total: inRange.length,
  };
}

function tsMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v.seconds) return v.seconds * 1000;
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
