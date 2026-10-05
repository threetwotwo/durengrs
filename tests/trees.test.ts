// Run: npm test   (pure rules only; no Firebase)
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNewTree, checkArchive, nextTreeNumber, normalizeBlock } from '../src/lib/trees';

const trees = [
  { id: 'A1', block: 'A' },
  { id: 'A2', block: 'A' },
  { id: 'A10', block: 'A', active: false }, // archived: its ID is still taken
  { id: 'B1', block: 'B' },
];
const V = ['MK', 'ST'];
const ok = { block: 'A', number: '3', variant: 'MK', datePlanted: '' };
const today = '2026-10-05';

test('a valid tree gets its ID and no messages', () => {
  const c = checkNewTree(ok, trees, V, today);
  assert.equal(c.id, 'A3');
  assert.deepEqual(c.errors, {});
  assert.deepEqual(c.warnings, []);
});

test('block and number formats', () => {
  assert.ok(checkNewTree({ ...ok, block: '' }, trees, V, today).errors.block);
  assert.ok(checkNewTree({ ...ok, block: 'ABCD' }, trees, V, today).errors.block);
  assert.ok(checkNewTree({ ...ok, block: 'A1' }, trees, V, today).errors.block);
  assert.ok(checkNewTree({ ...ok, number: '' }, trees, V, today).errors.number);
  assert.ok(checkNewTree({ ...ok, number: '0' }, trees, V, today).errors.number);
  assert.ok(checkNewTree({ ...ok, number: '1000' }, trees, V, today).errors.number);
  assert.ok(checkNewTree({ ...ok, number: '2.5' }, trees, V, today).errors.number);
  assert.ok(checkNewTree({ ...ok, number: '-3' }, trees, V, today).errors.number);
  assert.equal(checkNewTree({ ...ok, block: ' a ', number: '007' }, trees, V, today).id, 'A7');
});

test('an existing ID is refused, in any letter case', () => {
  const c = checkNewTree({ ...ok, block: 'a', number: '1' }, trees, V, today);
  assert.equal(c.errors.number?.key, 'tree.new.e.exists');
  assert.equal(c.id, undefined);
});

test('an archived tree keeps its ID reserved', () => {
  const c = checkNewTree({ ...ok, number: '10' }, trees, V, today);
  assert.equal(c.errors.number?.key, 'tree.new.e.archived');
  assert.equal(c.id, undefined);
});

test('next free number counts archived trees', () => {
  assert.equal(nextTreeNumber(trees, 'A'), 11);
  assert.equal(nextTreeNumber(trees, 'B'), 2);
  assert.equal(nextTreeNumber(trees, 'Z'), 1);
});

test('warnings: a new block and a far-off number need confirmation', () => {
  assert.deepEqual(checkNewTree({ ...ok, block: 'T', number: '1' }, trees, V, today).warnings.map((w) => w.code), ['newBlock']);
  assert.deepEqual(checkNewTree({ ...ok, number: '250' }, trees, V, today).warnings.map((w) => w.code), ['numberGap']);
  assert.deepEqual(checkNewTree({ ...ok, number: '12' }, trees, V, today).warnings, []);
});

test('variety must be one that exists', () => {
  assert.ok(checkNewTree({ ...ok, variant: '' }, trees, V, today).errors.variant);
  assert.ok(checkNewTree({ ...ok, variant: 'XX' }, trees, V, today).errors.variant);
});

test('planting date: optional, not in the future, not before 1990, real date', () => {
  assert.equal(checkNewTree({ ...ok, datePlanted: '2024-05-01' }, trees, V, today).errors.datePlanted, undefined);
  assert.equal(checkNewTree({ ...ok, datePlanted: '2026-10-06' }, trees, V, today).errors.datePlanted?.key, 'tree.v.future');
  assert.ok(checkNewTree({ ...ok, datePlanted: '1980-01-01' }, trees, V, today).errors.datePlanted);
  assert.ok(checkNewTree({ ...ok, datePlanted: '2024-13-45' }, trees, V, today).errors.datePlanted);
});

test('block input keeps only letters, capitalised, at most 3', () => {
  assert.equal(normalizeBlock('a1b'), 'AB');
  assert.equal(normalizeBlock('abcdef'), 'ABC');
});

test('archiving needs a reason, and a note for "other"', () => {
  assert.ok(checkArchive({ reason: '', note: '' }).errors.reason);
  assert.ok(checkArchive({ reason: 'bogus', note: '' }).errors.reason);
  assert.equal(Object.keys(checkArchive({ reason: 'died', note: '' }).errors).length, 0);
  assert.ok(checkArchive({ reason: 'other', note: '  ' }).errors.note);
  assert.equal(Object.keys(checkArchive({ reason: 'other', note: 'moved to nursery' }).errors).length, 0);
  assert.ok(checkArchive({ reason: 'died', note: 'x'.repeat(201) }).errors.note);
});
