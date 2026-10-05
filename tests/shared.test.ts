// Shared contract (src/shared): triage of worker words and the owner's label/dose rule, checked on real rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { triageText, workerReply, labelBatang, labelTajuk, labelEst, labelFruitset, doseSuggestion, stageMismatch, healthOf, FARM_STAGES, ISSUES } from '../src/shared';

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
