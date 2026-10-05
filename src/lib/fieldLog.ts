import { normalizeTimestamp } from '../context/FarmContext';
import type { ReportPhoto, TreeReport } from '../types';
import type { CropCount, Harvest, RainDay, SeasonTaskDone } from './fieldData';
import type { TreeBloom } from './guide';

/**
 * Field log: every record sent from the farm (WhatsApp or entered in the webapp), as one list.
 * Pure functions; the page feeds them the live records and the reports / tree edits it loads.
 */
export const LOG_KINDS = ['issue', 'bloom', 'count', 'harvest', 'task', 'rain', 'treeData'] as const;
export type LogKind = (typeof LOG_KINDS)[number];

export interface TreeEdit {
  id: string;
  treeId: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  workerPhone?: string | null;
  source?: string;
  at?: unknown;
  reason?: string;
}

interface Base {
  key: string;
  /** When it was sent (ms). Records without a timestamp use their own date at noon. */
  at: number;
  /** false when `at` is only the record's date (no time known). */
  timed: boolean;
  treeId?: string;
  block?: string;
  source: 'whatsapp' | 'webapp';
  /** Phone number (WhatsApp) or a name typed in the webapp. */
  who?: string;
  photos?: ReportPhoto[];
}
export type LogEntry =
  | (Base & { kind: 'issue'; rec: TreeReport })
  | (Base & { kind: 'bloom'; rec: TreeBloom })
  | (Base & { kind: 'count'; rec: CropCount })
  | (Base & { kind: 'harvest'; rec: Harvest })
  | (Base & { kind: 'task'; rec: SeasonTaskDone & { source?: string; workerPhone?: string; createdAt?: unknown } })
  | (Base & { kind: 'rain'; rec: RainDay & { source?: string; workerPhone?: string; updatedAt?: unknown } })
  | (Base & { kind: 'treeData'; rec: TreeEdit });

const noon = (date?: string) => (date ? Date.parse(`${date}T12:00:00`) : 0);
const when = (ts: unknown, date?: string) => normalizeTimestamp(ts) || noon(date);
const src = (s: unknown): 'whatsapp' | 'webapp' => (s === 'whatsapp' ? 'whatsapp' : 'webapp');

/** Fields a WhatsApp count writes onto the tree record; those edits are the count itself, already in the log. */
const COUNT_FIELDS = new Set(['floweringClusters', 'estimatedFruitCount']);

export function buildFieldLog(input: {
  reports?: TreeReport[];
  blooms?: TreeBloom[];
  counts?: CropCount[];
  harvests?: Harvest[];
  tasks?: SeasonTaskDone[];
  rain?: RainDay[];
  edits?: TreeEdit[];
  /** tree id -> block, for records that only name the tree */
  blockOf?: (treeId: string) => string | undefined;
}): LogEntry[] {
  const out: LogEntry[] = [];
  const blockOf = input.blockOf || (() => undefined);
  for (const r of input.reports || []) {
    out.push({ kind: 'issue', key: `issue:${r.id}`, at: normalizeTimestamp(r.createdAt), timed: true, treeId: r.treeId, block: r.block || blockOf(r.treeId), source: 'whatsapp', who: r.workerPhone, photos: r.photos, rec: r });
  }
  for (const b of input.blooms || []) {
    const x = b as TreeBloom & { createdAt?: unknown; workerPhone?: string };
    out.push({ kind: 'bloom', key: `bloom:${b.id}`, at: when(x.createdAt, b.date), timed: !!normalizeTimestamp(x.createdAt), treeId: b.treeId, block: b.block, source: src(b.source), who: x.workerPhone, photos: b.photos, rec: b });
  }
  for (const c of input.counts || []) {
    const x = c as CropCount & { createdAt?: unknown };
    out.push({ kind: 'count', key: `count:${c.id}`, at: when(x.createdAt, c.date), timed: !!normalizeTimestamp(x.createdAt), treeId: c.treeId, block: c.block, source: src(c.source), who: c.by, photos: c.photos, rec: c });
  }
  for (const h of input.harvests || []) {
    const x = h as Harvest & { createdAt?: unknown };
    out.push({ kind: 'harvest', key: `harvest:${h.id}`, at: when(x.createdAt, h.date), timed: !!normalizeTimestamp(x.createdAt), treeId: h.treeId, block: h.block, source: src(h.source), who: h.workerPhone, photos: h.photos, rec: h });
  }
  for (const s of input.tasks || []) {
    const x = s as SeasonTaskDone & { source?: string; workerPhone?: string; createdAt?: unknown };
    out.push({ kind: 'task', key: `task:${s.id}`, at: when(x.createdAt, s.date), timed: !!normalizeTimestamp(x.createdAt), block: s.block, source: src(x.source), who: x.workerPhone, rec: x });
  }
  for (const d of input.rain || []) {
    const x = d as RainDay & { source?: string; workerPhone?: string; updatedAt?: unknown };
    out.push({ kind: 'rain', key: `rain:${d.date}`, at: when(x.updatedAt, d.date), timed: !!normalizeTimestamp(x.updatedAt), source: src(x.source), who: x.workerPhone, rec: x });
  }
  for (const e of input.edits || []) {
    const fields = Object.keys(e.changes || {});
    if (!fields.length) continue;
    if (e.source === 'whatsapp' && fields.every((f) => COUNT_FIELDS.has(f))) continue;
    out.push({ kind: 'treeData', key: `edit:${e.id}`, at: normalizeTimestamp(e.at), timed: true, treeId: e.treeId, block: blockOf(e.treeId), source: src(e.source), who: e.workerPhone || undefined, rec: e });
  }
  return out.sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
}

/**
 * Where a record opens: a worker report keeps its document id (#/reports/abc123); every other kind is
 * "<kind>:<id>" (#/reports/count:A1_2026-09-01_set_2026-09-20). Rain is keyed by its date.
 */
export function recordKey(e: LogEntry): string {
  if (e.kind === 'issue') return e.rec.id;
  return `${e.kind}:${e.kind === 'rain' ? e.rec.date : e.rec.id}`;
}

/** The kind and id in a record key; null for a plain report id. */
export function parseRecordKey(key: string): { kind: Exclude<LogKind, 'issue'>; id: string } | null {
  const i = key.indexOf(':');
  if (i < 1) return null;
  const kind = key.slice(0, i) as LogKind;
  const id = key.slice(i + 1);
  if (kind === 'issue' || !(LOG_KINDS as readonly string[]).includes(kind) || !id) return null;
  return { kind: kind as Exclude<LogKind, 'issue'>, id };
}

/** Words a record can be found by: tree, block, the worker's words or note, and who sent it. */
export function recordText(e: LogEntry): string {
  const words: Array<string | undefined> = [e.treeId, e.block, e.who];
  if (e.kind === 'issue') words.push(e.rec.description);
  else if (e.kind === 'bloom' || e.kind === 'count') words.push(e.rec.note);
  return words.filter(Boolean).join(' ').toLowerCase();
}

export interface LogFilter {
  kinds?: LogKind[];
  since?: number;
  block?: string;
  /** Tree id, case-insensitive, exact match ("A1" does not match "A12"). */
  tree?: string;
  /** Digits of a phone number, or a typed name. */
  who?: string;
  source?: 'whatsapp' | 'webapp';
  /**
   * Free search: a tree id ("A12" matches that tree only), phone digits (matches the sender), or words in the
   * note. Several words must all match.
   */
  text?: string;
  /** Extra test for worker reports only (condition, Guide topic...); other kinds are left out when it is set. */
  report?: (r: TreeReport) => boolean;
}

const TREE_ID = /^[a-z]{1,2}\d{1,4}$/i;

function matchesText(e: LogEntry, text: string): boolean {
  const hay = recordText(e);
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => {
      if (TREE_ID.test(w)) return (e.treeId || '').toLowerCase() === w;
      const d = w.replace(/\D/g, '');
      if (d && d === w) return digits(e.who).includes(d);
      return hay.includes(w);
    });
}

const digits = (s?: string) => (s || '').replace(/\D/g, '');

export function filterLog(entries: LogEntry[], f: LogFilter): LogEntry[] {
  const tree = f.tree?.trim().toUpperCase();
  const who = f.who ? digits(f.who) || f.who : undefined;
  return entries.filter((e) => {
    if (f.kinds?.length && !f.kinds.includes(e.kind)) return false;
    if (f.since && e.at < f.since) return false;
    if (f.block && e.block !== f.block) return false;
    if (tree && (e.treeId || '').toUpperCase() !== tree) return false;
    if (who && (digits(e.who) || e.who) !== who) return false;
    if (f.source && e.source !== f.source) return false;
    if (f.report && (e.kind !== 'issue' || !f.report(e.rec))) return false;
    if (f.text?.trim() && !matchesText(e, f.text)) return false;
    return true;
  });
}

/** Group by local calendar day, newest first. */
export function byDay(entries: LogEntry[]): Array<{ day: string; items: LogEntry[] }> {
  const groups: Array<{ day: string; items: LogEntry[] }> = [];
  for (const e of entries) {
    const d = new Date(e.at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }
  return groups;
}
