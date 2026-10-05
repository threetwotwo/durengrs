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

export interface LogFilter {
  kinds?: LogKind[];
  since?: number;
  block?: string;
  /** Tree id, case-insensitive, exact match ("A1" does not match "A12"). */
  tree?: string;
  /** Digits of a phone number, or a typed name. */
  who?: string;
  source?: 'whatsapp' | 'webapp';
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
