const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/rules');
const S = require('../lib/season');

const today = '2026-10-04';

test('ids match the webapp (fieldData.ts)', () => {
  assert.equal(R.cropCountId({ treeId: 'A1', season: '2026-08-01', stage: 'kept', date: '2026-10-04' }), 'A1_2026-08-01_kept_2026-10-04');
  assert.equal(R.seasonTaskId('A', '2026-08-01', 'fruit_thinning'), 'A_2026-08-01_fruit_thinning');
  const h = (t, c) => R.harvestIdFromToken(t, c);
  assert.equal(h('tree:A1:628:1', { fruits: 5 }), h('tree:A1:628:1', { fruits: 5 })); // a retry maps to the same document
  assert.notEqual(h('tree:A1:628:1', { fruits: 5 }), h('tree:A1:628:1', { fruits: 6 })); // a new report from an old message does not
  assert.notEqual(h('a', {}), h('b', {}));
  assert.ok(h('t', {}).startsWith('wa') && h('t', {}).length === 20);
  assert.equal(R.idFromToken('t', { a: 1 }).length, 20);
});

test('choices match the webapp', () => {
  assert.deepEqual(R.GRADES, ['extra', 'class1', 'class2', 'reject']);
  assert.deepEqual(R.HARVEST_PROBLEMS, ['wet_core', 'uneven', 'rot', 'crack', 'borer']);
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

test('count: hard range and soft cross-checks', () => {
  assert.match(R.checkCount('clusters', { count: '2001' }).error, /antara 0 dan 2000/);
  assert.match(R.checkCount('onTree', { count: '501' }).error, /antara 0 dan 500/);
  assert.match(R.checkCount('set', { count: '501' }).error, /antara 0 dan 500/); // same cap as the webapp
  assert.equal(R.checkCount('clusters', { count: '0' }).ok.count, 0);
  assert.ok(R.checkCount('set', { count: '400' }, { clusters: 10 }).warning);
  assert.equal(R.checkCount('set', { count: '200' }, { clusters: 10 }).warning, undefined);
  assert.ok(R.checkCount('kept', { count: '90' }, { set: 80 }).warning);
  assert.ok(R.checkCount('onTree', { count: '70' }, { kept: 60 }).warning);
  assert.ok(R.checkCount('onTree', { count: '70' }, { set: 60 }).warning);
  assert.equal(R.checkCount('onTree', { count: '50' }, { kept: 60 }).warning, undefined);
});

test('bloom: future, too old, part, near duplicate', () => {
  const c = (d, p = 'whole', existing = []) => R.checkBloom({ date: d, part: p }, { today, existing });
  assert.match(c('2026-10-05').error, /masa depan/);
  assert.match(c('2026-07-01').error, /terlalu lama/i);
  assert.match(c(null).error, /Pilih tanggal/);
  assert.match(R.checkBloom({ date: today, part: 'x' }, { today }).error, /bagian/);
  assert.equal(c('2026-09-20').ok.date, '2026-09-20');
  assert.ok(c('2026-09-20', 'lower', [{ date: '2026-09-17', part: 'lower' }]).warning);
  assert.equal(c('2026-09-20', 'upper', [{ date: '2026-09-17', part: 'lower' }]).warning, undefined);
});

test('harvest basics and quality', () => {
  const b = (o, f) => R.checkHarvestBasics(o, { today, floweredOn: f });
  assert.match(b({ date: today, fruits: '0' }).error, /antara 1 dan 500/);
  assert.match(b({ date: '2026-10-05', fruits: '3' }).error, /masa depan/);
  assert.match(b({ date: '2026-07-01', fruits: '3' }, '2026-08-01').error, /sebelum bunga/);
  assert.match(b({ date: today, fruits: '3', weight: '0.1' }).error, /antara 0.5/);
  assert.ok(b({ date: today, fruits: '10', weight: '200' }).warning); // 20 kg/fruit
  assert.ok(b({ date: '2026-09-20', fruits: '3' }, '2026-09-01').warning); // 19 days after bloom
  assert.equal(b({ date: today, fruits: '10', weight: '25' }, '2026-06-01').warning, undefined);

  const q = (g, p, pf, n = 10) => R.checkHarvestQuality({ grades: g, problems: p, problemFruits: pf }, n);
  assert.match(q({ extra: '6', class1: '5' }).error, /lebih banyak/);
  assert.deepEqual(q({ extra: '6', class1: '2' }).ok.grades, { extra: 6, class1: 2 });
  assert.equal(q({ extra: '6', class1: '2' }).ok.ungraded, 2);
  assert.equal(q({}).ok.grades, undefined);
  assert.match(q({}, ['rot'], '').error, /berapa buah/i);
  assert.match(q({}, [], '3').error, /jenis masalah/i);
  assert.match(q({}, ['rot'], '11').error, /tidak boleh lebih banyak/);
  assert.deepEqual(q({}, ['rot', 'zzz'], '2').ok.problems, ['rot']);
});

test('season tasks, rain, text', () => {
  const t = (o) => R.checkSeasonTasks(o, { today, blocks: ['A', 'B'] });
  assert.match(t({ block: 'Z', tasks: ['bagging'], date: today }).error, /blok/i);
  assert.match(t({ block: 'A', tasks: [], date: today }).error, /minimal satu/);
  assert.match(t({ block: 'A', tasks: ['bagging'], date: '2026-08-01' }).error, /terlalu lama/);
  assert.deepEqual(t({ block: 'A', tasks: 'bagging', date: today }).ok.tasks, ['bagging']);
  assert.match(R.checkRain({ date: today, mm: '401' }, { today }).error, /antara 0 dan 400/);
  assert.equal(R.checkRain({ date: today, mm: '0' }, { today }).ok.rainMm, 0);
  assert.ok(R.checkRain({ date: today, mm: '150' }, { today }).warning);
  assert.equal(R.describeWithTypes(['leaf', 'pest'], ' daun kuning '), '[Daun / tunas, Hama] daun kuning');
  assert.equal(R.describeWithTypes([], 'x'), 'x');
});

test('season: stages and next step (port of guide.ts / crop.ts)', () => {
  assert.equal(S.stageOf(-1, 120, 120), 'preflower');
  assert.equal(S.stageOf(5, 120, 120), 'bloom');
  assert.equal(S.stageOf(20, 120, 120), 'set');
  assert.equal(S.stageOf(40, 120, 120), 'thin');
  assert.equal(S.stageOf(80, 120, 120), 'grow');
  assert.equal(S.stageOf(100, 120, 120), 'mature');
  assert.equal(S.stageOf(125, 120, 120), 'harvest');
  assert.equal(S.stageOf(200, 120, 120), 'recovery');

  const base = { blockDate: '2026-09-01', blooms: [], counts: [], ripeMin: 120, ripeMax: 120 }; // day 33 -> thin
  assert.equal(S.treeSeason(base, today).next.kind, 'kept');
  const have = { ...base, counts: [{ season: '2026-09-01', stage: 'kept', count: 50, date: '2026-10-01' }] };
  assert.equal(S.treeSeason(have, today).next, null);
  // fruit on the tree is stale after 14 days
  const grow = { ...base, blockDate: '2026-07-20', counts: [{ season: '2026-07-20', stage: 'onTree', count: 50, date: '2026-09-18' }] };
  const n = S.treeSeason(grow, today).next;
  assert.equal(n.kind, 'onTree');
  assert.equal(n.sinceDays, 16);
  // a whole-tree own bloom replaces the block date; a partial one adds a wave
  assert.deepEqual(S.treeWaves('2026-09-01', [{ date: '2026-09-10', part: 'whole' }], 150, today).map((w) => w.date), ['2026-09-10']);
  assert.deepEqual(S.treeWaves('2026-09-01', [{ date: '2026-09-10', part: 'lower' }], 150, today).map((w) => w.date), ['2026-09-01', '2026-09-10']);
  assert.deepEqual(S.treeWaves(undefined, [], 150, today), []);
});

test('tree limits equal the webapp TREE_LIMITS (src/lib/trees.ts)', () => {
  const L = R.TREE_LIMITS;
  assert.deepEqual([L.trunkSize.min, L.trunkSize.max], [1, 600]);
  assert.deepEqual([L.canopySize.min, L.canopySize.max], [50, 2500]);
  assert.deepEqual([L.floweringClusters.min, L.floweringClusters.max], [0, 2000]);
  assert.deepEqual([L.estimatedFruitCount.min, L.estimatedFruitCount.max], [0, 500]);
});
