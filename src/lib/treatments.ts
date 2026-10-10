import {
  FieldPath,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { getLang, locale, translate } from '../i18n';

export type TreatmentType = 'fertilizer' | 'spray' | 'pruning' | 'irrigation' | 'other';

export function typeLabel(type: TreatmentType): string {
  return translate(`sched.type.${type}`);
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short month name (1-12) in the current language. */
export function monthShort(month: number): string {
  if (getLang() === 'en') return MONTHS_EN[month - 1] || '';
  return new Date(2000, month - 1, 1).toLocaleDateString(locale(), { month: 'short' });
}

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
  /**
   * Last date done per block (YYYY-MM-DD), kept on the plan itself so the schedule is right however long the
   * history grows (the treatments listener only reads the newest 500).
   */
  lastDone?: Record<string, string>;
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
  if (days < 0) return translate('sched.due.overdue', { n: Math.abs(days) });
  if (days === 0) return translate('sched.due.today');
  if (days === 1) return translate('sched.due.tomorrow');
  return translate('sched.due.in', { n: days });
}

export function formatShortDate(s: string): string {
  return parseDateStr(s).toLocaleDateString(locale(), { day: '2-digit', month: 'short' });
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

  // Dates stored on the plan cover history older than the treatments that were loaded.
  for (const plan of plans) {
    for (const [b, d] of Object.entries(plan.lastDone || {})) {
      const key = `${plan.id}|${b}`;
      const prev = last.get(key);
      if (typeof d === 'string' && (!prev || d > prev)) last.set(key, d);
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

type TemplateFields = 'name' | 'product' | 'dose' | 'stage' | 'notes';

/** Template whose text fields are getters, translated when read (not at module load). */
function tpl(
  id: string,
  base: Omit<PlanTemplate, TemplateFields>,
  fields: Partial<Record<TemplateFields, boolean>>
): PlanTemplate {
  const o = { ...base } as PlanTemplate;
  (Object.keys(fields) as TemplateFields[]).forEach((f) => {
    Object.defineProperty(o, f, { enumerable: true, get: () => translate(`sched.tpl.${id}.${f}`) });
  });
  return o;
}

/** Keyed so other pages (the Guide) can offer a specific template. */
export const PLAN_TEMPLATE_BY_ID: Record<string, PlanTemplate> = {
  leaf: tpl('leaf', { type: 'fertilizer', everyDays: 30, startMonth: 1, endMonth: 3 }, { name: true, product: true, dose: true, stage: true, notes: true }),
  flowerSoil: tpl('flowerSoil', { type: 'fertilizer', everyDays: 30, startMonth: 4, endMonth: 6 }, { name: true, product: true, stage: true, notes: true }),
  flowerFoliar: tpl('flowerFoliar', { type: 'fertilizer', everyDays: 14, startMonth: 4, endMonth: 6 }, { name: true, product: true, dose: true, stage: true, notes: true }),
  fruit: tpl('fruit', { type: 'fertilizer', everyDays: 35, startMonth: 7, endMonth: 9 }, { name: true, product: true, dose: true, stage: true, notes: true }),
  post: tpl('post', { type: 'fertilizer', everyDays: 45, startMonth: 10, endMonth: 12 }, { name: true, product: true, stage: true, notes: true }),
  fungicide: tpl('fungicide', { type: 'spray', everyDays: 14 }, { name: true, product: true, notes: true }),
  pest: tpl('pest', { type: 'spray', everyDays: 21 }, { name: true, product: true, notes: true }),
  prune: tpl('prune', { type: 'pruning', everyDays: 365 }, { name: true, notes: true }),
  // From the Guide research (see lib/guideContent.ts for sources).
  phosphonate: tpl('phosphonate', { type: 'other', everyDays: 120 }, { name: true, product: true, dose: true, stage: true, notes: true }),
  skirtPrune: tpl('skirtPrune', { type: 'pruning', everyDays: 180 }, { name: true, notes: true }),
  leafSoil: tpl('leafSoil', { type: 'other', everyDays: 365 }, { name: true, product: true, stage: true, notes: true }),
  dryIrrigation: tpl('dryIrrigation', { type: 'irrigation', everyDays: 7 }, { name: true, dose: true, notes: true }),
};

export const PLAN_TEMPLATES: PlanTemplate[] = Object.values(PLAN_TEMPLATE_BY_ID);

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

/** Logs work done; for a routine, also moves the plan's last-done date forward for those blocks (same batch). */
export async function logTreatment(t: Omit<Treatment, 'id'>, plan?: TreatmentPlan): Promise<string> {
  const ref = doc(collection(db, 'treatments'));
  const batch = writeBatch(db);
  batch.set(ref, clean({ ...t, source: t.source || 'webapp', createdAt: serverTimestamp() } as any));
  if (plan && t.planId) {
    const newer = (t.blocks || []).filter((b) => !plan.lastDone?.[b] || t.date > plan.lastDone[b]);
    if (newer.length) {
      const [first, ...rest] = newer;
      batch.update(
        doc(db, 'treatmentPlans', t.planId),
        new FieldPath('lastDone', first),
        t.date,
        ...rest.flatMap((b) => [new FieldPath('lastDone', b), t.date])
      );
    }
  }
  await batch.commit();
  return ref.id;
}

/** Recomputes a plan's last-done dates from its full history (also used once for plans saved before lastDone). */
export async function rebuildLastDone(planId: string): Promise<Record<string, string>> {
  const snap = await getDocs(query(collection(db, 'treatments'), where('planId', '==', planId)));
  const lastDone: Record<string, string> = {};
  snap.forEach((d) => {
    const x = d.data() as Treatment;
    for (const b of x.blocks || []) if (!lastDone[b] || x.date > lastDone[b]) lastDone[b] = x.date;
  });
  // An empty map (not a missing field) marks the plan as rebuilt, so this runs once per plan.
  await updateDoc(doc(db, 'treatmentPlans', planId), { lastDone });
  return lastDone;
}

export async function removeTreatment(id: string): Promise<void> {
  const snap = await getDoc(doc(db, 'treatments', id));
  const planId = snap.exists() ? (snap.data() as Treatment).planId : undefined;
  await deleteDoc(doc(db, 'treatments', id));
  // Undo / delete must not leave the plan claiming a date that no longer exists.
  if (planId) await rebuildLastDone(planId).catch((e) => console.error('Rebuilding last-done failed:', e));
}
