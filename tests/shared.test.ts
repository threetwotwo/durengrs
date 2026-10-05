// Shared contract (src/shared): triage of worker words and the owner's label/dose rule, checked on real rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { triageText, workerReply, labelBatang, labelTajuk, labelEst, labelFruitset, doseSuggestion, stageMismatch, healthOf, FARM_STAGES, ISSUES, DEFAULT_LABEL_RULES, mergeLabelRules, checkLabelRules } from '../src/shared';

const t = (s: string) => triageText(s);
const issues = (s: string) => t(s).issues.map((i) => i.code).sort();

test('codes are stable (stored in Firestore and used by the bot)', () => {
  assert.deepEqual([...FARM_STAGES], ['veg', 'rest', 'bud', 'bloom', 'set', 'pingpong', 'egg', 'grow', 'mature', 'harvest', 'post']);
  assert.deepEqual([...ISSUES], ['phytophthora_canker', 'stem_fungus', 'leaf_blight', 'whitefly', 'borer', 'leaf_drop', 'fruit_drop', 'nutrient', 'water', 'other']);
});

test('stage words from the sheet', () => {
  assert.equal(t('0 (mata ketam)').stage?.code, 'bud');
  assert.equal(t('Pp').stage?.code, 'pingpong');
  assert.equal(t('Oct W2 All Telor').stage?.code, 'egg');
  assert.equal(t('No Flower, banyak faktor. Tidak berbunga').stage?.code, 'rest');
  assert.equal(t('Bunga banyak, mulai mekar sore').stage?.code, 'bloom');
  assert.equal(t('kuncup bunga sudah keluar').stage?.code, 'bud');
  assert.equal(t('aman').stage, undefined);
});

test('issue words from the sheet and reports', () => {
  assert.deepEqual(issues('Hawar Daun. Kutu kebul'), ['leaf_blight', 'whitefly']);
  assert.deepEqual(issues('Kanker Batang'), ['phytophthora_canker']);
  assert.deepEqual(issues('Ada getah merah keluar dari batang bawah, kulit basah'), ['phytophthora_canker']);
  assert.deepEqual(issues('Jamur Batang'), ['stem_fungus']);
  assert.deepEqual(issues('Rontok Daun'), ['leaf_drop']);
  assert.deepEqual(issues('0 (rontok)'), ['fruit_drop']);
  assert.deepEqual(issues('Daun kurang'), ['nutrient']);
  assert.deepEqual(issues('Ada ulat penggerek di buah, lubang kecil'), ['borer']);
  assert.deepEqual(issues('tidak ada kutu, aman'), []);
  assert.deepEqual(issues('Pp, hawar daun sedikit, membaik'), ['leaf_blight']);
});

test('health and review', () => {
  assert.equal(t('Kanker batang').health, 'merah');
  assert.equal(t('Hawar daun').health, 'kuning');
  assert.equal(t('Aman 👍').health, 'hijau');
  assert.equal(t('Aman 👍').needsReview, false);
  assert.equal(t('Hawar daun').needsReview, true);
  assert.equal(t('Hawar daun, membaik').improving, true);
  assert.equal(t('pohon hampir mati').health, 'merah');
  assert.equal(healthOf('minor_issue'), 'kuning');
});

test('numbers with their kind', () => {
  const n = t('buah 12, bonggol 7, 3 dahan berbunga').numbers;
  assert.deepEqual(n.map((x) => [x.value, x.kind]), [[12, 'fruit'], [7, 'clusters'], [3, 'branches']]);
  assert.equal(t('hujan 12,5 mm').numbers[0].value, 12.5);
  assert.equal(t('hujan 12,5 mm').numbers[0].kind, 'mm');
});

test('worker reply names the issue and one step', () => {
  const r = workerReply(t('getah merah di batang'));
  assert.match(r, /Kanker batang/);
  assert.match(r, /Merah/);
});

test('observed vs expected stage', () => {
  assert.equal(stageMismatch('bud', 'grow'), true); // flowering again while fruit grows: "2 musim"
  assert.equal(stageMismatch('pingpong', 'thin'), false);
  assert.equal(stageMismatch('egg', undefined), false);
});

// Rows from the owner's sheet (girth, canopy, est. butir, fruit 28 Sep) -> his labels and dose.
const rows: Array<[string, number, number, number, number, [string, string, string, string], [string, number]]> = [
  ['A1', 43, 520, 4, 0, ['mid', 'mid', 'low', 'skip'], ['YM Winner', 0.5]],
  ['A2', 62, 720, 6, 6, ['high', 'high', 'low', 'mid'], ['NPK Perfect', 0.75]],
  ['A3', 60, 740, 32, 32, ['high', 'high', 'mid', 'high'], ['NPK Perfect', 1.0]],
  ['A5', 55, 550, 14, 0, ['mid', 'high', 'low', 'skip'], ['YM Winner', 1.0]],
  ['A11', 50, 580, 16, 0, ['mid', 'high', 'mid', 'skip'], ['YM Winner', 1.0]],
  ['A12', 37, 340, 0, 0, ['low', 'mid', 'skip', 'skip'], ['YM Winner', 0.5]],
  ['A22', 56, 700, 91, 12, ['high', 'high', 'high', 'high'], ['NPK Perfect', 1.0]],
  ['B35', 20, 270, 0, 0, ['skip', 'low', 'skip', 'skip'], ['YM Winner', 1.0]],
  ['B74', 34, 570, 0, 0, ['low', 'high', 'skip', 'skip'], ['YM Winner', 1.0]],
  ['C5', 56, 520, 15, 10, ['high', 'mid', 'mid', 'mid'], ['NPK Perfect', 0.75]],
  ['D1', 30, 310, 0, 0, ['low', 'low', 'skip', 'skip'], ['YM Winner', 0.5]],
  ['D3', 50, 450, 6, 4, ['mid', 'mid', 'low', 'low'], ['NPK Perfect', 0.5]],
];
test('label and dose rule reproduces the sheet', () => {
  for (const [id, girth, canopy, est, fruit, labels, [product, dose]] of rows) {
    const got = [labelBatang(girth), labelTajuk(canopy), labelEst(est), labelFruitset(fruit)] as const;
    assert.deepEqual(got, labels, id);
    assert.deepEqual(doseSuggestion({ batang: got[0], tajuk: got[1], fruitset: got[3] }), { product, dose }, id);
  }
});

test('label rules are editable: stored values override the defaults, bad ones are ignored', () => {
  const r = mergeLabelRules({ batang: { midMax: 60, lowMax: 'x' }, dose: { fruiting: { high: 1.5 }, unit: 'kg' }, products: { fruiting: '' }, confirmed: true, extra: 1 });
  assert.equal(r.batang.midMax, 60);
  assert.equal(r.batang.lowMax, DEFAULT_LABEL_RULES.batang.lowMax);
  assert.equal(r.dose.fruiting.high, 1.5);
  assert.equal(r.dose.unit, 'kg');
  assert.equal(r.products.fruiting, 'NPK Perfect'); // empty text keeps the default
  assert.equal(r.confirmed, true);
  assert.equal(labelBatang(58, r), 'mid'); // 58 was "high" with the sheet's 55
  assert.deepEqual(doseSuggestion({ fruitset: 'high' }, r), { product: 'NPK Perfect', dose: 1.5 });
  assert.deepEqual(mergeLabelRules(null), DEFAULT_LABEL_RULES);
});

test('label rules with thresholds out of order are refused', () => {
  assert.deepEqual(checkLabelRules(DEFAULT_LABEL_RULES), []);
  const bad = mergeLabelRules({ tajuk: { lowMax: 600, midMax: 549 }, dose: { young: 500 } });
  assert.deepEqual(checkLabelRules(bad).map((e) => e.key), ['rules.err.order', 'rules.err.dose']);
});

test('words inside longer words do not count (Indonesian prefixes)', () => {
  assert.notEqual(t('Tanaman tidak sehat').health, 'hijau'); // "aman" in "tanaman", "sehat" negated
  assert.equal(t('Tanaman tidak sehat').needsReview, true);
  assert.notEqual(t('kurang bagus').health, 'hijau');
  assert.notEqual(t('saya amati daun kuning').health, 'merah'); // "mati" in "amati"
  assert.equal(t('Sudah diamati, ada kutu').urgent, false);
  assert.equal(t('mematikan jamur').urgent, false);
  assert.equal(t('ranting mati satu').urgent, false); // a dead twig is not an emergency
  assert.notEqual(t('buah berkembang').stage?.code, 'bloom'); // "kembang" in "berkembang"
  assert.deepEqual(issues('kuncup bulat'), []); // "ulat" in "bulat"
  assert.deepEqual(issues('getahnya merah'), ['phytophthora_canker']); // suffix -nya still counts
});

test('negations, also short forms and a few words back', () => {
  assert.deepEqual(issues('tdk ada getah'), []);
  assert.deepEqual(issues('tidak terlihat getah'), []);
  assert.deepEqual(issues('gk ada kutu'), []);
  assert.deepEqual(issues('tidak berbunga. ada kutu'), ['whitefly']); // a full stop ends the negation
});

test('only danger words are urgent (the bot turns a tree Merah by itself only then)', () => {
  assert.equal(t('pohon hampir mati').urgent, true);
  assert.equal(t('darurat, batang roboh').urgent, true);
  assert.equal(t('Kanker batang').urgent, false); // a disease name waits for a person
  assert.equal(t('Kanker batang').health, 'merah'); // ...but is still suggested as Merah
  assert.equal(t('getah sudah berkurang, membaik').urgent, false);
  assert.equal(t('tidak parah').urgent, false);
  assert.equal(t('bukan darurat').urgent, false);
});

test('a triage never holds undefined (Firestore refuses it)', () => {
  for (const s of ['daun kuning di dahan bawah', 'aman', '12', 'buah 3', '', 'pohon hampir mati']) {
    const json = JSON.stringify(t(s));
    assert.deepEqual(JSON.parse(json), t(s), s);
    const walk = (o: unknown): void => {
      if (o && typeof o === 'object') for (const v of Object.values(o)) { assert.notEqual(v, undefined, s); walk(v); }
    };
    walk(t(s));
  }
});

test('cases from the review: "no" is a number, line breaks end a phrase, bad news is not "better"', () => {
  assert.equal(t('pohon no 12 tumbang').urgent, true);
  assert.equal(t('pohon no 5 sehat').health, 'hijau');
  assert.deepEqual(issues('belum berbunga\nada kutu putih'), ['whitefly']);
  assert.deepEqual(issues('Tidak ada kutu! Daun kuning'), ['nutrient']);
  assert.deepEqual(issues('tidak ada kutu daun kuning'), ['nutrient']); // "daun kuning" is not what "tidak" negates
  assert.deepEqual(issues('tidak ada lagi kutu'), []);
  assert.equal(t('pohon hampir mati, daun berkurang').urgent, true);
  assert.equal(t('daun sudah hilang semua').improving, false);
  // Worker says it's getting better: still suggested Merah, but the bot waits for a person.
  assert.equal(t('kemarin hampir mati, sekarang membaik').health, 'merah');
  assert.equal(t('kemarin hampir mati, sekarang membaik').urgent, false);
});

test('common word forms with a prefix are known', () => {
  assert.deepEqual(issues('batang bergetah'), ['phytophthora_canker']);
  assert.deepEqual(issues('kebun kebanjiran'), ['water']);
  assert.deepEqual(issues('daun melayu'), ['water']);
  assert.deepEqual(issues('dahan jamuran'), ['stem_fungus']);
  assert.deepEqual(issues('buah berjatuhan'), ['fruit_drop']);
  assert.deepEqual(issues('daun berguguran'), ['leaf_drop']);
  assert.equal(t('sudah dipanen').stage?.code, 'post');
  assert.equal(t('buah dipanen').stage?.code, 'harvest');
});

test('fruit on the tree: last count minus fruit picked since, else this season\'s tree estimate', async () => {
  const { fruitRemaining } = await import('../src/shared');
  const waves = ['2026-06-01'];
  const counts = [
    { season: '2026-06-01', stage: 'set', count: 40, date: '2026-07-01' },
    { season: '2026-06-01', stage: 'onTree', count: 25, date: '2026-08-15' },
    { season: '2025-06-01', stage: 'onTree', count: 99, date: '2025-08-15' }, // last season: ignored
  ];
  assert.equal(fruitRemaining(counts, [{ date: '2026-09-20', fruits: 5 }, { date: '2026-08-01', fruits: 9 }], waves), 20);
  // No count: the tree's estimate if updated after the flowers opened, minus fruit picked after that day.
  assert.equal(fruitRemaining([], [{ date: '2026-09-20', fruits: 5 }], waves, { count: 30, date: '2026-09-01' }), 25);
  assert.equal(fruitRemaining([], [], waves, { count: 30, date: '2026-05-01' }), undefined);
  assert.equal(fruitRemaining([], [], [], { count: 30, date: '2026-09-01' }), undefined);
});
