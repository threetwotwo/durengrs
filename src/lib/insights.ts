import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { DurianTree, DurianVariant, TreeReport } from '../types';
import { addDays, diffDays, todayStr } from './treatments';

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

export function waitingLabel(f: FollowUp): string {
  if (f.waitingDays === null) return 'Never checked';
  if (f.waitingDays < 1) return 'Checked today';
  return `No check for ${f.waitingDays}d`;
}

// ---------- harvest outlook ----------

/** One flowering date per block. Expected harvest = flowering date + the variant's ripening days. */
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

export function buildHarvestRows(
  trees: DurianTree[],
  variants: DurianVariant[],
  cycles: HarvestCycle[],
  today = todayStr()
): HarvestRow[] {
  const cycleByBlock = new Map(cycles.map((c) => [c.block, c.floweredOn]));
  const variantByCode = new Map(variants.map((v) => [v.code, v]));
  const rows = new Map<string, HarvestRow>();

  for (const t of trees) {
    if (!t.block || !t.variant) continue;
    const key = `${t.block}|${t.variant}`;
    let row = rows.get(key);
    if (!row) {
      const v = variantByCode.get(t.variant);
      const ripening = v?.ripeningDays ? Number(v.ripeningDays) : undefined;
      const floweredOn = cycleByBlock.get(t.block);
      const harvestDate = floweredOn && ripening ? addDays(floweredOn, ripening) : undefined;
      row = {
        block: t.block,
        variant: t.variant,
        variantName: v?.name || t.variant,
        trees: 0,
        fruits: 0,
        floweredOn,
        ripeningDays: ripening,
        harvestDate,
        daysToHarvest: harvestDate ? diffDays(harvestDate, today) : undefined,
      };
      rows.set(key, row);
    }
    row.trees++;
    row.fruits += t.estimatedFruitCount || 0;
  }
  return Array.from(rows.values()).sort(
    (a, b) =>
      (a.harvestDate || '9999').localeCompare(b.harvestDate || '9999') ||
      a.block.localeCompare(b.block) ||
      a.variant.localeCompare(b.variant)
  );
}

export function fruitsByMonth(rows: HarvestRow[]): Array<{ month: string; label: string; fruits: number; trees: number }> {
  const map = new Map<string, { fruits: number; trees: number }>();
  for (const r of rows) {
    if (!r.harvestDate) continue;
    const key = r.harvestDate.slice(0, 7);
    const m = map.get(key) || { fruits: 0, trees: 0 };
    m.fruits += r.fruits;
    m.trees += r.trees;
    map.set(key, m);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      label: new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      ...v,
    }));
}

export async function saveHarvestCycle(block: string, floweredOn: string | null) {
  const ref = doc(db, 'harvestCycles', block);
  if (!floweredOn) return deleteDoc(ref);
  await setDoc(ref, { block, floweredOn, updatedAt: serverTimestamp() });
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
    const phone = r.workerPhone || 'Unknown';
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
      label: new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
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

export const maskPhone = (phone?: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : phone;
};
