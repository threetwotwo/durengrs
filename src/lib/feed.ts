import { ACTION_INFO, FARM_STAGE_INFO, HEALTH_INFO, ISSUE_INFO, healthOf, isAction, isFarmStage, isIssue, type Action, type FarmStage, type Health, type Issue } from '../shared';
import type { TreeReport } from '../types';
import type { LogEntry } from './fieldLog';
import { reportTriage } from './review';

/**
 * What a record says, the same on every list (Reports, Today, the tree's history, a problem's history): one model so
 * a value read from a report, a record entered in the app and a record the bot filed from a report never disagree or
 * show twice. Pure functions; components translate the codes.
 */

/** True when a note has letters or digits (not only "🙏😎"). */
export const hasWords = (text?: string): boolean => !!text && /[\p{L}\p{N}]/u.test(text);

/** What a report stands for: the owner's change when there is one, else the reading (every report is taken as read). */
export interface ReportValues {
  stage?: FarmStage;
  issues: Array<{ code: Issue; name?: string }>;
  health?: Health;
  improving: boolean;
  actions: Array<{ type: Action; product?: string }>;
  /** Fruit picked, as the worker wrote it (filed as a harvest record). */
  harvest?: { fruits: number; weightKg?: number };
}

export function reportValues(r: TreeReport): ReportValues {
  const reading = reportTriage(r);
  const named = (code: Issue) => reading.issues.find((i) => i.code === code)?.name;
  const actions = (reading.actions || [])
    .filter((a) => isAction(a.type))
    .map((a) => (a.product ? { type: a.type, product: a.product } : { type: a.type }));
  const harvest = reading.harvest && reading.harvest.fruits > 0 ? { fruits: reading.harvest.fruits, weightKg: reading.harvest.weightKg } : undefined;
  if (r.review && r.review.decision !== 'dismissed') {
    const issues = (r.issues || []).filter(isIssue).map((code) => ({ code, name: named(code) }));
    return {
      stage: r.stage && isFarmStage(r.stage) ? r.stage : undefined,
      issues,
      health: r.health,
      improving: !!r.improving,
      actions,
      harvest,
    };
  }
  if (r.review?.decision === 'dismissed') return { issues: [], improving: false, actions: [] };
  return {
    stage: reading.stage?.code,
    issues: reading.issues.map((i) => ({ code: i.code, name: i.name })),
    // A report with no reading of the tree's health keeps the condition it found.
    health: reading.health || healthOf(r.conditionAfter) || undefined,
    improving: !!reading.improving,
    actions,
    harvest,
  };
}

/** A problem's everyday name: Gemini's name without the scientific part ("Kanker batang (Phytophthora…)" -> "Kanker batang"). */
export function shortProblem(code: Issue, name: string | undefined, lang: 'id' | 'en'): string {
  const n = (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  return n || ISSUE_INFO[code].label[lang];
}

export type TagTone = 'green' | 'yellow' | 'red' | 'problem' | 'work' | 'plain';
export interface Tag {
  key: string;
  label: string;
  tone: TagTone;
}

const HEALTH_TONE: Record<Health, TagTone> = { hijau: 'green', kuning: 'yellow', merah: 'red' };

/** The tags of a report: health, stage, problems, work done (no duplicates, in that order). */
export function reportTags(v: ReportValues, lang: 'id' | 'en', improvingLabel: string): Tag[] {
  const tags: Tag[] = [];
  if (v.health) tags.push({ key: 'h', label: `${HEALTH_INFO[v.health].label[lang]}${v.improving ? `, ${improvingLabel}` : ''}`, tone: HEALTH_TONE[v.health] });
  if (v.stage) tags.push({ key: 's', label: FARM_STAGE_INFO[v.stage].label[lang], tone: 'plain' });
  const seen = new Set<string>();
  for (const i of v.issues) {
    const label = shortProblem(i.code, i.name, lang);
    if (seen.has(label)) continue;
    seen.add(label);
    tags.push({ key: `i:${i.code}:${label}`, label, tone: 'problem' });
  }
  for (const a of v.actions) {
    if (a.type === 'harvest') continue; // the harvest has its own line
    const label = ACTION_INFO[a.type].label[lang];
    if (seen.has(label)) continue;
    seen.add(label);
    tags.push({ key: `a:${a.type}`, label, tone: 'work' });
  }
  return tags;
}

/** `harvests/wa_x` (a report's ai.recorded path) -> the log key of that record. */
const RECORDED_KIND: Record<string, LogEntry['kind']> = { harvests: 'harvest', bloomWaves: 'bloom', cropCounts: 'count' };
function recordedKeys(r: TreeReport): string[] {
  const paths = r.ai?.recorded;
  if (!Array.isArray(paths)) return [];
  return paths
    .filter((p) => p.includes('/'))
    .map((p) => {
      const [col, ...rest] = p.split('/');
      const kind = RECORDED_KIND[col];
      return kind ? `${kind}:${rest.join('/')}` : '';
    })
    .filter(Boolean);
}

/**
 * Records the bot filed from a report (a harvest, a flowering, a count) belong to that report: they are taken out of
 * the list and shown on the report's card, so one report is one card and nothing is counted twice at a glance.
 * Returns the list without them, and per report key the records it filed.
 */
export function foldFiledRecords(entries: LogEntry[]): { entries: LogEntry[]; filed: Map<string, LogEntry[]> } {
  const owner = new Map<string, string>(); // record key -> report entry key
  const reportKeys = new Map<string, string>(); // report id -> entry key
  for (const e of entries) {
    if (e.kind !== 'issue') continue;
    reportKeys.set(e.rec.id, e.key);
    for (const k of recordedKeys(e.rec)) owner.set(k, e.key);
  }
  for (const e of entries) {
    if (e.kind === 'issue') continue;
    const rid = (e.rec as { reportId?: unknown }).reportId;
    if (typeof rid === 'string' && reportKeys.has(rid)) owner.set(e.key, reportKeys.get(rid)!);
  }
  const filed = new Map<string, LogEntry[]>();
  const out: LogEntry[] = [];
  for (const e of entries) {
    const by = e.kind === 'issue' ? undefined : owner.get(e.key);
    if (by) {
      const list = filed.get(by) || [];
      list.push(e);
      filed.set(by, list);
    } else out.push(e);
  }
  return { entries: out, filed };
}
