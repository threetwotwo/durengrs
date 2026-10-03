import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export type TreatmentType = 'fertilizer' | 'spray' | 'pruning' | 'irrigation' | 'other';

export const TREATMENT_TYPE_LABELS: Record<TreatmentType, string> = {
  fertilizer: 'Fertilizer',
  spray: 'Spray',
  pruning: 'Pruning',
  irrigation: 'Irrigation',
  other: 'Other',
};

/** A recurring routine, e.g. "Fruit-set potassium feed, every 35 days, Blocks A-C". */
export interface TreatmentPlan {
  id: string;
  name: string;
  type: TreatmentType;
  product?: string;
  dose?: string;
  /** all=true means every block that exists in the trees collection. */
  allBlocks: boolean;
  blocks: string[];
  everyDays: number;
  /** Optional season window (1-12). Wraps over new year, e.g. 11 -> 2. */
  startMonth?: number;
  endMonth?: number;
  /** Pre-harvest interval for sprays, shown as a reminder. */
  phiDays?: number;
  stage?: string;
  notes?: string;
  /** First due date (YYYY-MM-DD) for blocks never treated. Defaults to the day it was created. */
  firstDue?: string;
  active: boolean;
}

/** One application that was actually done. */
export interface Treatment {
  id: string;
  planId?: string;
  planName: string;
  type: TreatmentType;
  date: string; // YYYY-MM-DD
  blocks: string[];
  product?: string;
  dose?: string;
  doneBy?: string;
  notes?: string;
  source?: 'webapp' | 'whatsapp';
}

export type TaskStatus = 'overdue' | 'soon' | 'upcoming';

export interface BlockDue {
  block: string;
  due: string; // YYYY-MM-DD
  days: number; // negative = overdue
  lastDone?: string;
}

export interface ScheduleTask {
  plan: TreatmentPlan;
  blocks: BlockDue[]; // sorted by due date
  nextDue: string;
  days: number;
  status: TaskStatus;
  /** Blocks that are overdue or due within 7 days; the default selection when marking done. */
  dueBlocks: string[];
}

// ---------- date helpers (local calendar dates as YYYY-MM-DD strings) ----------

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(s: string, days: number): string {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function diffDays(a: string, b: string): number {
  const ms = parseDateStr(a).getTime() - parseDateStr(b).getTime();
  return Math.round(ms / 86400000);
}

function monthInWindow(month: number, start?: number, end?: number): boolean {
  if (!start || !end) return true;
  return start <= end ? month >= start && month <= end : month >= start || month <= end;
}

/** Moves a date forward to the next day inside the plan's season window. */
function applyWindow(dateStr: string, plan: TreatmentPlan): string {
  if (!plan.startMonth || !plan.endMonth) return dateStr;
  let d = parseDateStr(dateStr);
  for (let i = 0; i < 13; i++) {
    if (monthInWindow(d.getMonth() + 1, plan.startMonth, plan.endMonth)) return toDateStr(d);
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return dateStr;
}

export function relativeDue(days: number): string {
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days}d`;
}

export function formatShortDate(s: string): string {
  return parseDateStr(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// ---------- schedule computation ----------

export function computeTasks(
  plans: TreatmentPlan[],
  treatments: Treatment[],
  allBlocks: string[],
  today: string = todayStr()
): ScheduleTask[] {
  // last application date per plan + block
  const last = new Map<string, string>();
  for (const t of treatments) {
    if (!t.planId) continue;
    for (const b of t.blocks || []) {
      const key = `${t.planId}|${b}`;
      const prev = last.get(key);
      if (!prev || t.date > prev) last.set(key, t.date);
    }
  }

  const tasks: ScheduleTask[] = [];
  for (const plan of plans) {
    if (!plan.active || !plan.everyDays || plan.everyDays < 1) continue;
    const blocks = plan.allBlocks ? allBlocks : plan.blocks;
    if (blocks.length === 0) continue;

    const rows: BlockDue[] = blocks.map((block) => {
      const lastDone = last.get(`${plan.id}|${block}`);
      const raw = lastDone ? addDays(lastDone, plan.everyDays) : plan.firstDue || today;
      const due = applyWindow(raw, plan);
      return { block, due, days: diffDays(due, today), lastDone };
    });
    rows.sort((a, b) => a.due.localeCompare(b.due) || a.block.localeCompare(b.block));

    const first = rows[0];
    const status: TaskStatus = first.days < 0 ? 'overdue' : first.days <= 7 ? 'soon' : 'upcoming';
    tasks.push({
      plan,
      blocks: rows,
      nextDue: first.due,
      days: first.days,
      status,
      dueBlocks: rows.filter((r) => r.days <= 7).map((r) => r.block),
    });
  }
  tasks.sort((a, b) => a.nextDue.localeCompare(b.nextDue) || a.plan.name.localeCompare(b.plan.name));
  return tasks;
}

// ---------- starting-point templates ----------
// Based on a published durian fertilizer calendar (Malaysia). Seasons in Indonesia differ,
// so months are only suggestions; the owner edits them in the routine.

export type PlanTemplate = Omit<TreatmentPlan, 'id' | 'active' | 'allBlocks' | 'blocks'>;

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    name: 'Leaf-flush feed (high nitrogen)',
    type: 'fertilizer',
    product: 'NPK high N (e.g. 15:5:20) + Mg, Zn',
    dose: 'Split into 2-3 doses',
    everyDays: 30,
    startMonth: 1,
    endMonth: 3,
    stage: 'Vegetative growth',
    notes: 'Supports new leaves and branches. Magnesium and zinc help chlorophyll formation.',
  },
  {
    name: 'Flowering soil feed (P + K)',
    type: 'fertilizer',
    product: 'Balanced NPK with higher P and K, moderate N',
    everyDays: 30,
    startMonth: 4,
    endMonth: 6,
    stage: 'Flowering',
    notes: 'Supports flower bud initiation.',
  },
  {
    name: 'Flowering foliar spray (boron + calcium)',
    type: 'fertilizer',
    product: 'Foliar boron + calcium',
    dose: 'Early morning or late afternoon',
    everyDays: 14,
    startMonth: 4,
    endMonth: 6,
    stage: 'Flowering',
    notes: 'Helps reduce flower drop. Spray when it is cool, not in midday sun.',
  },
  {
    name: 'Fruit-development potassium feed',
    type: 'fertilizer',
    product: 'High potassium, moderate nitrogen',
    dose: 'Small doses; water in',
    everyDays: 35,
    startMonth: 7,
    endMonth: 9,
    stage: 'Fruit development',
    notes: 'Fruit size, taste and shelf life. Combine with irrigation.',
  },
  {
    name: 'Post-harvest recovery feed',
    type: 'fertilizer',
    product: 'Balanced N and K, deep soil application',
    everyDays: 45,
    startMonth: 10,
    endMonth: 12,
    stage: 'Post-harvest recovery',
    notes: 'Rebuilds tree reserves. Add mulch to hold soil moisture.',
  },
  {
    name: 'Preventive fungicide spray',
    type: 'spray',
    product: 'Your fungicide',
    everyDays: 14,
    notes: 'Mainly for the rainy season. Check the label for dose and pre-harvest interval (PHI).',
  },
  {
    name: 'Pest control spray',
    type: 'spray',
    product: 'Your insecticide',
    everyDays: 21,
    notes: 'Check the label for dose and pre-harvest interval (PHI). Do not spray during flowering without advice.',
  },
  {
    name: 'Canopy pruning',
    type: 'pruning',
    everyDays: 365,
    notes: 'Remove dead and crossing branches, usually after harvest.',
  },
];

// ---------- Firestore writes ----------

function clean<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') out[k] = v;
  }
  return out as T;
}

export async function savePlan(plan: Omit<TreatmentPlan, 'id'> & { id?: string }): Promise<string> {
  const { id, ...rest } = plan;
  const data = clean(rest as any);
  if (id) {
    // setDoc without merge so cleared optional fields really disappear
    await setDoc(doc(db, 'treatmentPlans', id), { ...data, updatedAt: serverTimestamp() });
    return id;
  }
  const ref = await addDoc(collection(db, 'treatmentPlans'), {
    ...data,
    firstDue: data.firstDue || todayStr(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function setPlanActive(id: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'treatmentPlans', id), { active, updatedAt: serverTimestamp() });
}

export async function removePlan(id: string): Promise<void> {
  await deleteDoc(doc(db, 'treatmentPlans', id));
}

export async function logTreatment(t: Omit<Treatment, 'id'>): Promise<string> {
  const ref = await addDoc(
    collection(db, 'treatments'),
    clean({ ...t, source: t.source || 'webapp', createdAt: serverTimestamp() } as any)
  );
  return ref.id;
}

export async function removeTreatment(id: string): Promise<void> {
  await deleteDoc(doc(db, 'treatments', id));
}
