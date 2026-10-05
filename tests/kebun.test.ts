import test from 'node:test';
import assert from 'node:assert/strict';
import { changesByTree, checkCell, countDates, countGrid, parsePaste, pasteDiff, toCsv, treeDraft } from '../src/lib/kebun';

const trees = [
  { id: 'A1', block: 'A', variant: 'MK', condition: 'healthy', canopySize: '400', trunkSize: 60, floweringBranches: 2, notes: 'Pp', datePlanted: { seconds: 1, nanoseconds: 0 } },
  { id: 'A2', block: 'A', variant: 'MK', condition: 'minor', canopySize: 520, trunkSize: 41 },
] as any[];

test('cells are checked like the tree form; empty clears', () => {
  assert.deepEqual(checkCell('trunkSize', ' 55,5 '), { ok: true, value: 55.5 });
  assert.deepEqual(checkCell('floweringBranches', '2.5'), { ok: false, error: { key: 'tree.v.whole' } });
  assert.deepEqual(checkCell('canopySize', '9000'), { ok: false, error: { key: 'tree.v.range', vars: { min: 50, max: 2500 } } });
  assert.deepEqual(checkCell('trunkSize', 'abc'), { ok: false, error: { key: 'tree.v.number' } });
  assert.deepEqual(checkCell('notes', ''), { ok: true, value: null });
  assert.deepEqual(checkCell('notes', ' Pp, telor '), { ok: true, value: 'Pp, telor' });
});

test('the tree draft keeps every field but the planting date, and clears text with ""', () => {
  const d = treeDraft(trees[0], { trunkSize: 62, notes: null }) as any;
  assert.equal(d.trunkSize, 62);
  assert.equal(d.notes, '');
  assert.equal(d.variant, 'MK');
  assert.equal(d.condition, 'healthy');
  assert.equal('datePlanted' in d, false);
});

test('a paste from Google Sheets shows only the cells that change', () => {
  const text = 'Pohon\tTajuk\tBatang\tDahan\tBonggol\tWarna\tCatatan\nA1\t400\t62\t3\t4\tHijau\tPp\nA2\t520\t\t1\t2\t\tTelor\nZ9\t300\t\t\t\t\t\nA3x\t\t\t\t\t\t';
  const p = parsePaste(text);
  assert.ok(!('error' in p));
  const d = pasteDiff(p as any, trees);
  assert.deepEqual(d.ignored, ['Warna']);
  assert.deepEqual(d.unknown, ['Z9', 'A3X']);
  // A1: canopy "400" = 400 and notes "Pp" unchanged; A2: canopy same, empty trunk skipped.
  assert.equal(d.same, 3);
  assert.deepEqual(
    d.changes.map((c) => `${c.treeId}.${c.field}:${c.from}->${c.to}`),
    ['A1.trunkSize:60->62', 'A1.floweringBranches:2->3', 'A1.floweringClusters:->12', 'A2.floweringBranches:->1', 'A2.notes:->Telor', 'A2.floweringClusters:->2']
  );
  const byTree = changesByTree(d.changes);
  assert.deepEqual(byTree.get('A1'), { trunkSize: 62, floweringBranches: 3, floweringClusters: 12 });
});

test('paste errors are listed, not applied; a paste without a tree column is refused', () => {
  const d = pasteDiff(parsePaste('ID;Batang\nA1;900') as any, trees);
  assert.equal(d.changes.length, 0);
  assert.equal(d.errors[0].field, 'trunkSize');
  assert.deepEqual(parsePaste('Tajuk\tBatang\n1\t2'), { error: 'noId' });
  assert.deepEqual(parsePaste('ID'), { error: 'empty' });
});

test('CSV quotes what needs quoting', () => {
  assert.equal(toCsv([['A1', 'Pp, telor', 'say "hi"', null, 3]]), 'A1,"Pp, telor","say ""hi""",,3');
});

test('dated count columns: latest days, fruit counts before flower counts', () => {
  const counts = [
    { treeId: 'A1', date: '2026-09-02', stage: 'clusters', count: 40 },
    { treeId: 'A1', date: '2026-09-16', stage: 'set', count: 20 },
    { treeId: 'A1', date: '2026-09-16', stage: 'clusters', count: 41 },
    { treeId: 'A2', date: '2026-09-28', stage: 'onTree', count: 6 },
    { treeId: 'A2', date: '2026-01-01', stage: 'onTree', count: 9 },
  ] as any[];
  assert.deepEqual(countDates(counts, 4, 150, '2026-10-05'), ['2026-09-02', '2026-09-16', '2026-09-28']);
  assert.deepEqual(countDates(counts, 2, 150, '2026-10-05'), ['2026-09-16', '2026-09-28']);
  assert.deepEqual(countGrid(counts).get('A1')?.get('2026-09-16'), { count: 20, stage: 'set' });
});

test('numbers the Indonesian or the English way, thousands included', async () => {
  const { parseNum } = await import('../src/lib/num');
  assert.equal(parseNum('12,5'), 12.5);
  assert.equal(parseNum('12.5'), 12.5);
  assert.equal(parseNum('1.000'), 1000);
  assert.equal(parseNum('1,000'), 1000);
  assert.equal(parseNum('1 200'), 1200);
  assert.equal(parseNum('1.234,5'), 1234.5);
  assert.equal(parseNum('1,234.5'), 1234.5);
  assert.equal(parseNum('0,750'), 0.75); // a lone 0 before the separator is a decimal
  assert.equal(parseNum('1.50'), 1.5);
  assert.ok(Number.isNaN(parseNum('')));
  assert.ok(Number.isNaN(parseNum('4 m')));
  assert.ok(Number.isNaN(parseNum('1.2.3,4')));
  assert.ok(Number.isNaN(parseNum('0x10')));
  assert.deepEqual(checkCell('canopySize', '1.200'), { ok: true, value: 1200 });
});

test('a blank Dahan does not turn Bonggol into 0 clusters', () => {
  const d = pasteDiff(parsePaste('ID\tDahan\tBonggol\nA2\t\t4') as any, trees);
  assert.equal(d.changes.length, 0);
});

test('a quoted cell may hold the separator, a line break or a quote', () => {
  const p = parsePaste('ID\tCatatan\tBatang\nA1\t"Pp\tlalu\ntelor ""besar"""\t61\nA2\t\t42') as any;
  assert.deepEqual(p.rows, [['A1', 'Pp\tlalu\ntelor "besar"', '61'], ['A2', '', '42']]);
  const c = parsePaste('ID;Catatan\r\nA1;"a; b"\r\n') as any;
  assert.deepEqual(c.rows, [['A1', 'a; b']]);
});

test('CSV never hands a formula to the spreadsheet', () => {
  assert.equal(toCsv([['=HYPERLINK("x")', '+1', '@a', -3, 'ok']]), `"'=HYPERLINK(""x"")",'+1,'@a,-3,ok`);
  assert.equal(toCsv([['a\r\nb']]), '"a\r\nb"');
});
