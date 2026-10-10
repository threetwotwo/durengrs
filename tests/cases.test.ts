// Problems on trees (cases): reading the bot's documents, what is due, and the order they are shown in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { caseTitle, closeOrReopen, isDue, isOpen, parseCase, sortCases } from '../src/lib/cases';
import { treatmentsInText } from '../src/shared';
import { parseHash } from '../src/lib/router';
import type { ProblemCase } from '../src/types';

const base = (over: Partial<ProblemCase>): ProblemCase => ({
  id: 'x',
  treeId: 'A1',
  issue: 'whitefly',
  status: 'open',
  openedOn: '2026-10-01',
  events: [],
  ...over,
});

test('a case document is read defensively', () => {
  const c = parseCase('A3_whitefly_2026-10-01', {
    treeId: 'A3',
    issue: 'whitefly',
    name: 'Kutu loncat (psyllid)',
    status: 'nonsense',
    events: [{ date: '2026-10-01', type: 'seen', reportId: 'r1', photo: 2 }, { type: 'bogus' }, null, 'x'],
    nextCheck: '2026-10-08',
  });
  assert.equal(c.status, 'open');
  assert.equal(c.events.length, 1);
  assert.equal(c.events[0].photo, 2);
  assert.equal(c.openedOn, '2026-10-01');
  assert.equal(c.lastOn, '2026-10-01');
  assert.equal(c.nextCheck, '2026-10-08');
  assert.equal(parseCase('y', undefined).issue, 'other');
});

test('the title is the name Gemini gave, else the issue label', () => {
  assert.equal(caseTitle({ issue: 'whitefly', name: 'Kutu loncat' }, 'id'), 'Kutu loncat');
  assert.equal(caseTitle({ issue: 'leaf_blight' }, 'en'), 'Leaf blight');
  assert.equal(caseTitle({ issue: 'unknown-code' }, 'en'), 'unknown-code');
});

test('due means open and the check date has come', () => {
  const today = '2026-10-10';
  assert.equal(isDue(base({ nextCheck: '2026-10-10' }), today), true);
  assert.equal(isDue(base({ nextCheck: '2026-10-11' }), today), false);
  assert.equal(isDue(base({ nextCheck: null }), today), false);
  assert.equal(isDue(base({ status: 'resolved', nextCheck: '2026-10-01' }), today), false);
  assert.equal(isOpen(base({ status: 'improving' })), true);
});

test('worse first, then due (most overdue first), then untreated, then treated, improving, solved', () => {
  const today = '2026-10-10';
  const list = [
    base({ id: 'solved', status: 'resolved', closedOn: '2026-10-05' }),
    base({ id: 'improving', status: 'improving', nextCheck: '2026-10-15' }),
    base({ id: 'treated', status: 'treated', nextCheck: '2026-10-14' }),
    base({ id: 'open', status: 'open', nextCheck: '2026-10-12' }),
    base({ id: 'due-late', status: 'treated', nextCheck: '2026-10-02' }),
    base({ id: 'due', status: 'improving', nextCheck: '2026-10-09' }),
    base({ id: 'worse', status: 'worse', nextCheck: '2026-10-20' }),
  ];
  assert.deepEqual(sortCases(list, today).map((c) => c.id), ['worse', 'due-late', 'due', 'open', 'treated', 'improving', 'solved']);
});

test('closing by hand logs an event and clears the check; reopening sets a new one', () => {
  const closed = closeOrReopen('resolved', '2026-10-10', '  sudah sembuh ', 'Gary');
  assert.equal(closed.status, 'resolved');
  assert.equal(closed.closedOn, '2026-10-10');
  assert.equal(closed.nextCheck, null);
  assert.deepEqual(closed.event, { date: '2026-10-10', type: 'resolved', note: 'sudah sembuh', by: 'Gary' });
  const reopened = closeOrReopen('open', '2026-10-10');
  assert.equal(reopened.closedOn, null);
  assert.equal(reopened.nextCheck, '2026-10-17');
  assert.deepEqual(reopened.event, { date: '2026-10-10', type: 'reopened' }, 'no undefined fields (Firestore rejects them)');
});

test('old addresses still open the right page', () => {
  assert.equal(parseHash('#/kebun').tab, 'trees');
  assert.equal(parseHash('#/kebun?show=due').params.get('show'), 'due');
  assert.equal(parseHash('#/trees/A12').treeId, 'A12');
  assert.equal(parseHash('#/reports/abc').reportId, 'abc');
  assert.equal(parseHash('#/nope').known, false);
});

test('treatment done is read from words, never from what still needs doing', () => {
  const kinds = (text: string, issues: Parameters<typeof treatmentsInText>[1]) => treatmentsInText(text, issues).map((a) => `${a.type}:${a.issue}${a.product ? `:${a.product}` : ''}`);
  // Scrape and paint with a fungicide paste is one treatment, not also a spray.
  assert.deepEqual(kinds('Batang dikerok hingga jaringan kayu dan diolesi pasta fungisida', ['phytophthora_canker']), ['canker_treatment:phytophthora_canker']);
  assert.deepEqual(kinds('Luka pada batang pohon sedang dioles fungisida Ridomil', ['phytophthora_canker']), ['canker_treatment:phytophthora_canker:Ridomil']);
  assert.deepEqual(kinds('Luka memanjang pada kulit batang, dikikis pisau', ['stem_fungus']), ['canker_treatment:stem_fungus']);
  assert.deepEqual(kinds('disemprot Confidor di pucuk', ['whitefly']), ['insecticide:whitefly:Confidor']);
  assert.deepEqual(kinds('daun disemprot fungisida', ['leaf_blight']), ['fungicide:leaf_blight']);
  // Not done yet, or a treatment for none of the report's problems.
  assert.deepEqual(kinds('perlu dikerok dan dioles', ['phytophthora_canker']), []);
  assert.deepEqual(kinds('belum disemprot insektisida', ['whitefly']), []);
  assert.deepEqual(kinds('Getah merah. Harus segera dioles', ['phytophthora_canker']), []);
  assert.deepEqual(kinds('dioles pasta', ['whitefly']), []);
  assert.deepEqual(kinds('getah merah di batang', ['phytophthora_canker']), []);
  // A new phrase starts after a full stop or comma.
  assert.deepEqual(kinds('Belum ada jamur lain, sudah dioles', ['phytophthora_canker']), ['canker_treatment:phytophthora_canker']);
});
