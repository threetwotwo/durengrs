// Records in one look: what a report stands for, and records the bot filed from a report shown on it, never twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { foldFiledRecords, reportTags, reportValues, shortProblem } from '../src/lib/feed';
import { buildFieldLog } from '../src/lib/fieldLog';

const ts = (iso: string) => ({ seconds: Date.parse(iso) / 1000, nanoseconds: 0 });
const ai = (over: object = {}) => ({ source: 'ai', version: 'x', issues: [], improving: false, numbers: [], needsReview: false, ...over }) as any;

test('a report stands for its reading, or for the owner\'s change when there is one', () => {
  const r: any = {
    id: 'r1',
    treeId: 'A1',
    createdAt: ts('2026-10-09T08:00:00+07:00'),
    triage: ai({ health: 'kuning', stage: { code: 'pingpong', confidence: 0.9, evidence: '' }, issues: [{ code: 'phytophthora_canker', name: 'Kanker batang (Phytophthora palmivora)', confidence: 0.9, evidence: '' }], actions: [{ type: 'canker_treatment', issue: 'phytophthora_canker', product: 'Ridomil', evidence: '' }] }),
  };
  const v = reportValues(r);
  assert.equal(v.health, 'kuning');
  assert.equal(v.stage, 'pingpong');
  assert.equal(v.issues[0].name, 'Kanker batang (Phytophthora palmivora)');
  assert.deepEqual(reportTags(v, 'id', 'membaik').map((x) => x.label), ['Kuning', 'Ping pong', 'Kanker batang', 'Kerok & oles batang']);

  const changed = reportValues({ ...r, review: { decision: 'corrected' }, health: 'merah', issues: ['phytophthora_canker'], stage: undefined });
  assert.equal(changed.health, 'merah');
  assert.equal(changed.stage, undefined);
  assert.equal(changed.issues[0].name, 'Kanker batang (Phytophthora palmivora)'); // the name still comes from the reading
  assert.deepEqual(reportValues({ ...r, review: { decision: 'dismissed' } }).issues, []);
  // No reading of its health: the condition it found.
  assert.equal(reportValues({ id: 'r2', treeId: 'A1', description: '', conditionAfter: 'emergency' } as any).health, 'merah');
});

test('problem names lose their scientific part on cards', () => {
  assert.equal(shortProblem('phytophthora_canker', 'Kanker batang (Phytophthora palmivora)', 'id'), 'Kanker batang');
  assert.equal(shortProblem('leaf_blight', undefined, 'en'), 'Leaf blight');
});

test('a harvest, count or flowering filed from a report sits on the report, not beside it', () => {
  const report: any = { id: 'r9', treeId: 'A1', block: 'A', createdAt: ts('2026-10-10T10:00:00+07:00'), ai: { status: 'done', recorded: ['harvests/wa_r9'] }, triage: ai({ harvest: { fruits: 12 } }) };
  const log = buildFieldLog({
    reports: [report],
    harvests: [
      { id: 'wa_r9', block: 'A', treeId: 'A1', variant: 'MK', date: '2026-10-10', fruits: 12, problems: [] } as any,
      { id: 'h2', block: 'A', treeId: 'A2', variant: 'MK', date: '2026-10-10', fruits: 5, problems: [] } as any,
    ],
    counts: [{ id: 'c1', treeId: 'A1', block: 'A', season: '2026-06-22', stage: 'onTree', count: 30, date: '2026-10-10', reportId: 'r9' } as any],
  });
  const { entries, filed } = foldFiledRecords(log);
  assert.deepEqual(entries.map((e) => e.key).sort(), ['harvest:h2', 'issue:r9']);
  assert.deepEqual(filed.get('issue:r9')!.map((e) => e.key).sort(), ['count:c1', 'harvest:wa_r9']);
});
