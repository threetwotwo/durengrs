import { arrayUnion, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { addDays, todayStr } from './treatments';
import { ACTION_INFO, CASE_EVENTS, CASE_STATUSES, RECHECK_DAYS, isAction, isIssue, type CaseStatus } from '../shared';
import type { Lang } from '../i18n';
import { shortProblem } from './feed';
import type { CaseEvent, ProblemCase } from '../types';

/**
 * Problems on trees ("cases"): one per problem per tree, from the first report that shows it until it is solved.
 * The bot writes them after Gemini reads a report (bot/lib/cases.js); the web app shows them and lets the owner close
 * or reopen one by hand. See docs/data-contract.md.
 */

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** A `cases/{id}` document, defensively (missing or odd fields never break a page). */
export function parseCase(id: string, data: unknown): ProblemCase {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const events: CaseEvent[] = (Array.isArray(d.events) ? d.events : [])
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && (CASE_EVENTS as readonly string[]).includes(String((e as any).type)))
    .map((e) => ({
      date: str(e.date) || '',
      reportId: str(e.reportId),
      type: e.type as CaseEvent['type'],
      action: str(e.action),
      product: str(e.product),
      note: str(e.note),
      photo: typeof e.photo === 'number' ? e.photo : undefined,
      by: str(e.by),
    }));
  const status = (CASE_STATUSES as readonly string[]).includes(String(d.status)) ? (d.status as CaseStatus) : 'open';
  return {
    id,
    treeId: str(d.treeId) || '',
    block: str(d.block),
    issue: str(d.issue) || 'other',
    name: str(d.name),
    status,
    openedOn: str(d.openedOn) || events[0]?.date || '',
    openedReportId: str(d.openedReportId),
    lastOn: str(d.lastOn) || events[events.length - 1]?.date,
    lastReportId: str(d.lastReportId),
    lastAction: str(d.lastAction),
    nextCheck: str(d.nextCheck) || null,
    closedOn: str(d.closedOn),
    events,
  };
}

/** The problem in words: Gemini's specific name without its scientific part, else the farm's issue label. */
export function caseTitle(c: Pick<ProblemCase, 'issue' | 'name'>, lang: Lang): string {
  return isIssue(c.issue) ? shortProblem(c.issue, c.name, lang) : c.name || c.issue;
}

/** The last thing done for it, in the reader's language (the bot stores `lastAction` in Indonesian). */
export function lastActionLabel(c: Pick<ProblemCase, 'events' | 'lastAction'>, lang: Lang): string | undefined {
  const done = [...c.events].reverse().find((e) => e.action && isAction(e.action));
  return done?.action && isAction(done.action) ? ACTION_INFO[done.action].label[lang] : c.lastAction;
}

export const isOpen = (c: ProblemCase) => c.status !== 'resolved';
/** Open and its photo check date has come. */
export const isDue = (c: ProblemCase, today = todayStr()) => isOpen(c) && !!c.nextCheck && c.nextCheck <= today;

/** Most urgent first: getting worse, then due for a check (longest overdue first), then not treated, then the rest. */
export function sortCases(list: ProblemCase[], today = todayStr()): ProblemCase[] {
  const rank = (c: ProblemCase) => (c.status === 'resolved' ? 5 : c.status === 'worse' ? 0 : isDue(c, today) ? 1 : c.status === 'open' ? 2 : c.status === 'treated' ? 3 : 4);
  return [...list].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.status === 'resolved' ? (b.closedOn || '').localeCompare(a.closedOn || '') : (a.nextCheck || '9').localeCompare(b.nextCheck || '9')) ||
      a.treeId.localeCompare(b.treeId, undefined, { numeric: true })
  );
}

/** The change when the owner closes a problem by hand (they checked it) or reopens one closed too early. */
export function closeOrReopen(status: 'resolved' | 'open', today: string, note?: string, by?: string) {
  const event: CaseEvent = { date: today, type: status === 'resolved' ? 'resolved' : 'reopened' };
  if (note?.trim()) event.note = note.trim().slice(0, 200);
  if (by?.trim()) event.by = by.trim().slice(0, 60);
  return {
    status,
    event,
    lastOn: today,
    closedOn: status === 'resolved' ? today : null,
    nextCheck: status === 'resolved' ? null : addDays(today, RECHECK_DAYS),
  };
}

/**
 * Close or reopen a problem by hand; logged as a case event. The event is added to the stored list (not a rewrite
 * of this page's copy), so an event the bot writes at the same moment is kept.
 */
export async function setCaseStatus(c: ProblemCase, status: 'resolved' | 'open', note?: string, by?: string) {
  const { event, ...fields } = closeOrReopen(status, todayStr(), note, by);
  await updateDoc(doc(db, 'cases', c.id), { ...fields, events: arrayUnion(event), updatedAt: serverTimestamp() });
}

/** Remove a case that was never a real problem (a misreading). The reports themselves are kept. */
export async function deleteCase(c: ProblemCase) {
  await deleteDoc(doc(db, 'cases', c.id));
}
