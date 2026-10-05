import { collection, deleteField, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeTimestamp } from '../context/FarmContext';
import { toDateStr } from './treatments';
import { HEALTH_INFO, isFarmStage, isIssue, triageText, type FarmStage, type Health, type Issue, type Triage } from '../shared';
import type { DurianTree, TreeReport } from '../types';

/**
 * Review inbox: a person confirms (or corrects) what the system read from a worker's report. Only a review changes
 * the tree: its observed stage, and its condition when this is the tree's latest report. See docs/data-contract.md.
 */

export interface ReviewValues {
  stage?: FarmStage;
  issues: Issue[];
  health?: Health;
  improving?: boolean;
}

/** The report's suggestion: stored triage (bot or photo model) or, if none, the free rule-based reading of its words. */
export function reportTriage(r: TreeReport): Triage {
  return r.triage || triageText(r.description);
}

/** Waiting for a person: not reviewed yet and not a plain "all fine". */
export const needsReview = (r: TreeReport) => !r.review && reportTriage(r).needsReview;

export function suggestedValues(t: Triage): ReviewValues {
  return { stage: t.stage?.code, issues: t.issues.map((i) => i.code), health: t.health, improving: t.improving };
}

const reportDate = (r: TreeReport) => {
  const ms = normalizeTimestamp(r.createdAt);
  return ms ? toDateStr(new Date(ms)) : toDateStr(new Date());
};

/** What a confirmed review changes on the tree. Never moves a tree back to an older observation. */
export function treeChanges(tree: DurianTree, report: TreeReport, v: ReviewValues) {
  const out: { observedStage?: { code: FarmStage; date: string; reportId: string }; condition?: string } = {};
  const date = reportDate(report);
  if (v.stage && (!tree.observedStage || date >= tree.observedStage.date)) out.observedStage = { code: v.stage, date, reportId: report.id };
  const latest = tree.lastReportId === report.id || normalizeTimestamp(report.createdAt) >= normalizeTimestamp(tree.lastReportAt);
  if (v.health && latest) {
    const condition = HEALTH_INFO[v.health].condition;
    if (condition !== tree.condition) out.condition = condition;
  }
  return out;
}

type Batch = ReturnType<typeof writeBatch>;

function addReview(batch: Batch, report: TreeReport, tree: DurianTree | undefined, decision: 'accepted' | 'corrected' | 'dismissed', v: ReviewValues, by?: string) {
  const update: Record<string, unknown> = { review: { decision, ...(by ? { by } : {}), at: serverTimestamp() } };
  if (!report.triage) update.triage = triageText(report.description); // keep what was suggested next to what was decided
  if (decision !== 'dismissed') {
    update.issues = v.issues.filter(isIssue);
    // A correction can also clear a value checked earlier ("tidak yakin").
    if (v.stage && isFarmStage(v.stage)) update.stage = v.stage;
    else if (report.stage) update.stage = deleteField();
    if (v.health) update.health = v.health;
    else if (report.health) update.health = deleteField();
    if (v.improving) update.improving = true;
    else if (report.improving) update.improving = deleteField();
  }
  batch.update(doc(db, 'reports', report.id), update);
  if (!tree || decision === 'dismissed') return;
  const ch = treeChanges(tree, report, v);
  if (!ch.observedStage && !ch.condition) return;
  const treeUpdate: Record<string, unknown> = { dateUpdated: serverTimestamp() };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (ch.observedStage) {
    treeUpdate.observedStage = ch.observedStage;
    changes.observedStage = { from: tree.observedStage?.code ?? null, to: ch.observedStage.code };
  }
  if (ch.condition) {
    treeUpdate.condition = ch.condition;
    treeUpdate.conditionUpdatedAt = serverTimestamp();
    changes.condition = { from: tree.condition, to: ch.condition };
  }
  batch.update(doc(db, 'trees', tree.id), treeUpdate);
  batch.set(doc(collection(db, 'treeEdits')), { treeId: tree.id, changes, at: serverTimestamp(), source: 'webapp', reason: 'review', reportId: report.id, ...(by ? { by } : {}) });
}

export async function saveReview(report: TreeReport, tree: DurianTree | undefined, decision: 'accepted' | 'corrected' | 'dismissed', v: ReviewValues, by?: string) {
  const batch = writeBatch(db);
  addReview(batch, report, tree, decision, v, by);
  await batch.commit();
}

/** Mark many plain "all fine" reports as checked in one go (their suggestion accepted). */
export async function acceptAll(items: Array<{ report: TreeReport; tree?: DurianTree }>, by?: string) {
  // Up to 3 writes per report; Firestore batches hold 500.
  for (let i = 0; i < items.length; i += 150) {
    const batch = writeBatch(db);
    for (const { report, tree } of items.slice(i, i + 150)) addReview(batch, report, tree, 'accepted', suggestedValues(reportTriage(report)), by);
    await batch.commit();
  }
}
