// Review inbox: only a confirmed review changes the tree, never back to an older observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { treeChanges, suggestedValues, needsReview } from '../src/lib/review';
import { triageText } from '../src/shared';

const ts = (iso: string) => ({ seconds: Date.parse(iso) / 1000, nanoseconds: 0 });
const tree: any = { id: 'A3', block: 'A', condition: 'healthy', lastReportId: 'r2', lastReportAt: ts('2026-10-04T08:00:00+07:00') };

test('confirmed stage and health update the tree when this is its latest report', () => {
  const r2: any = { id: 'r2', treeId: 'A3', description: 'Pp, hawar daun', createdAt: ts('2026-10-04T08:00:00+07:00') };
  const ch = treeChanges(tree, r2, suggestedValues(triageText(r2.description)));
  assert.equal(ch.observedStage?.code, 'pingpong');
  assert.equal(ch.observedStage?.date, '2026-10-04');
  assert.equal(ch.condition, 'minor');
});

test('an older report sets neither an older stage nor the condition', () => {
  const t2 = { ...tree, observedStage: { code: 'egg', date: '2026-10-04', reportId: 'r2' } };
  const r1: any = { id: 'r1', treeId: 'A3', description: 'mata ketam, kanker batang', createdAt: ts('2026-09-20T08:00:00+07:00') };
  const ch = treeChanges(t2, r1, suggestedValues(triageText(r1.description)));
  assert.equal(ch.observedStage, undefined);
  assert.equal(ch.condition, undefined);
});

test('plain "aman" reports do not wait in the inbox; reviewed ones never do', () => {
  assert.equal(needsReview({ id: 'x', treeId: 'A1', block: 'A', description: 'Aman 👍' } as any), false);
  assert.equal(needsReview({ id: 'y', treeId: 'A1', block: 'A', description: 'kutu kebul' } as any), true);
  assert.equal(needsReview({ id: 'z', treeId: 'A1', block: 'A', description: 'kutu kebul', review: { decision: 'accepted' } } as any), false);
});
