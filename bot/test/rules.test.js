const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/rules');
const S = require('../lib/season');

const today = '2026-10-04';

test('ids match the webapp (fieldData.ts)', () => {
  assert.equal(R.cropCountId({ treeId: 'A1', season: '2026-08-01', stage: 'kept', date: '2026-10-04' }), 'A1_2026-08-01_kept_2026-10-04');
  assert.equal(R.seasonTaskId('A', '2026-08-01', 'fruit_thinning'), 'A_2026-08-01_fruit_thinning');
  assert.equal(R.bloomWaveId('A1', '2026-08-01', 'lower'), 'A1_2026-08-01_lower');
  const id = (t, c) => R.idFromToken(t, c);
  assert.equal(id('lapor:A1:628:1', { description: 'x' }), id('lapor:A1:628:1', { description: 'x' })); // a retry maps to the same document
  assert.notEqual(id('lapor:A1:628:1', { description: 'x' }), id('lapor:A1:628:1', { description: 'y' })); // a new report from an old message does not
  assert.notEqual(id('a', {}), id('b', {}));
  assert.equal(id('t', { a: 1 }).length, 20);
  assert.equal(R.harvestIdForReport('abc'), 'wa_abc'); // one harvest per report
});

test('choices match the webapp', () => {
  assert.deepEqual(R.GRADES, ['extra', 'class1', 'class2', 'reject']);
  assert.deepEqual(R.SEASON_TASKS, ['hand_pollination', 'fruit_thinning', 'bagging', 'ca_mg_spray', 'fruit_tying']);
  assert.deepEqual(R.BLOOM_PARTS, ['whole', 'lower', 'middle', 'upper', 'some']);
  assert.deepEqual(Object.keys(R.COUNT_STAGES), ['clusters', 'set', 'kept', 'onTree']);
});

test('dates: Jakarta day, both DatePicker formats', () => {
  assert.equal(R.todayStr(new Date('2026-10-04T18:00:00Z')), '2026-10-05'); // 01:00 in Jakarta
  assert.equal(R.normalizeDate('2026-10-04'), '2026-10-04');
  assert.equal(R.normalizeDate('2026-02-30'), null);
  assert.equal(R.normalizeDate(String(Date.UTC(2026, 9, 4, 5))), '2026-10-04');
  assert.equal(R.normalizeDate('besok'), null);
  assert.equal(R.diffDays('2026-10-04', '2026-09-04'), 30);
  assert.equal(R.addDays('2026-10-04', -60), '2026-08-05');
});

test('numbers: comma, range, integer, empty', () => {
  const o = { label: 'X', min: 0, max: 500, integer: true };
  assert.equal(R.parseNumber('12', o).value, 12);
  assert.match(R.parseNumber('12,5', o).error, /bulat/);
  assert.match(R.parseNumber('501', o).error, /antara 0 dan 500/);
  assert.match(R.parseNumber('-1', o).error, /antara/);
  assert.match(R.parseNumber('abc', o).error, /bukan angka/);
  assert.match(R.parseNumber('', o).error, /wajib/);
  assert.equal(R.parseNumber('', { ...o, required: false }).value, undefined);
  assert.equal(R.parseNumber('2,5', { label: 'kg', min: 0.5, max: 10 }).value, 2.5);
});

test('season tasks and rain', () => {
  const t = (o) => R.checkSeasonTasks(o, { today, blocks: ['A', 'B'] });
  assert.match(t({ block: 'Z', tasks: ['bagging'], date: today }).error, /blok/i);
  assert.match(t({ block: 'A', tasks: [], date: today }).error, /minimal satu/);
  assert.match(t({ block: 'A', tasks: ['bagging'], date: '2026-08-01' }).error, /terlalu lama/);
  assert.deepEqual(t({ block: 'A', tasks: 'bagging', date: today }).ok.tasks, ['bagging']);
  assert.match(R.checkRain({ date: today, mm: '401' }, { today }).error, /antara 0 dan 400/);
  assert.equal(R.checkRain({ date: today, mm: '0' }, { today }).ok.rainMm, 0);
  assert.ok(R.checkRain({ date: today, mm: '150' }, { today }).warning);
});

test('season: the flowerings of a tree (port of guide.ts treeWaves)', () => {
  // a whole-tree own bloom replaces the block date; a partial one adds a wave
  assert.deepEqual(S.treeWaves('2026-09-01', [{ date: '2026-09-10', part: 'whole' }], 150, today).map((w) => w.date), ['2026-09-10']);
  assert.deepEqual(S.treeWaves('2026-09-01', [{ date: '2026-09-10', part: 'lower' }], 150, today).map((w) => w.date), ['2026-09-01', '2026-09-10']);
  assert.deepEqual(S.treeWaves(undefined, [], 150, today), []);
  // flowerings older than the season horizon, or a block date over a year old, no longer count
  assert.deepEqual(S.treeWaves('2025-09-01', [{ date: '2026-01-01', part: 'lower' }], 150, today), []);
  const s = S.treeSeason({ blockDate: '2026-09-01', blooms: [] }, today);
  assert.deepEqual([s.ripeMin, s.ripeMax, s.waves.length], [S.DEFAULT_RIPENING_DAYS, S.DEFAULT_RIPENING_DAYS, 1]);
});

test('season: a harvest belongs to the flowering nearest its ripening time (tree variety first)', () => {
  const waves = [{ date: '2026-06-14' }, { date: '2026-06-26' }]; // 112 and 100 days before today
  assert.equal(S.floweredOnFor({ waves, ripeMin: 120, treeRipening: 100 }, today), '2026-06-26');
  assert.equal(S.floweredOnFor({ waves, ripeMin: 115 }, today), '2026-06-14'); // no variety time: the block's shortest
  assert.equal(S.floweredOnFor({ waves: [{ date: '2026-10-10' }], ripeMin: 120 }, today), undefined); // none before the harvest
  assert.equal(S.floweredOnFor(null, today), undefined);
});
