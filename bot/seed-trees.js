// seed-trees.js — run: node seed-trees.js
// Parses the exported tree CSV and seeds the `trees` collection. Anything
// that fails validation is skipped and reported, not guessed at silently.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { admin, db } = require('./lib/firestore');

const CSV_PATH = process.env.TREES_CSV_PATH || './tree-data.csv';
const HEADER_ROW_INDEX = 5; // 0-indexed line in the raw CSV holding the real column names

const KNOWN_VARIANTS = [
  'MK', 'ST', 'ST_LOKAL', 'OC', 'MTG', 'MTH', 'BW', 'NLG', 'LAY', 'PLG',
  'PTK', 'MM', 'KJ', 'UM', 'SB', 'SD24',
];

function parseNumericOrNull(value) {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '?') return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

// Expects "YYYY/MM" — the CSV has no day precision, so this defaults to the 1st.
function parsePlantedDate(value) {
  const match = String(value ?? '').trim().match(/^(\d{4})\/(\d{1,2})$/);
  if (!match) return null;
  const [, year, month] = match;
  return admin.firestore.Timestamp.fromDate(new Date(Number(year), Number(month) - 1, 1));
}

// "A1 MK" or "E 10 OC" -> { block: "A", number: 1, variantRaw: "MK" }
// (Block E uses a space between the letter and number; others don't.)
function parseTreeId(rawTreeId) {
  const match = String(rawTreeId ?? '').trim().match(/^([A-Z]+)\s*(\d+)\s+(.+)$/i);
  if (!match) return null;
  const [, block, number, variantRaw] = match;
  return { block: block.toUpperCase(), number: Number(number), variantRaw: variantRaw.trim() };
}

function mapVariant(variantRaw) {
  const normalized = variantRaw.toUpperCase().replace(/\s+/g, '_');
  if (KNOWN_VARIANTS.includes(normalized)) return normalized;
  if (normalized.startsWith('ST') && normalized.includes('LOKAL')) return 'ST_LOKAL';
  return null; // unrecognized — row gets flagged, never guessed
}

function cleanText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

// Green/Orange/Red (16 Sep snapshot): whichever column is populated sets the
// condition. Green is normally just a "1" flag; Orange/Red normally carry
// the actual disease/issue text, which becomes conditionNotes.
function parseCondition(green, orange, red) {
  const g = cleanText(green);
  const o = cleanText(orange);
  const r = cleanText(red);

  if (g) return { condition: 'healthy', trigger: g };
  if (o) return { condition: 'minor', trigger: o };
  if (r) return { condition: 'emergency', trigger: r };
  return { condition: null, trigger: null };
}

function cleanConditionNotes(trigger) {
  if (!trigger || trigger === '1') return null; // bare flag, no actual note
  return trigger;
}

async function seed() {
  const raw = fs.readFileSync(path.resolve(CSV_PATH), 'utf8');
  const lines = raw.split('\n');
  const dataCsv = lines.slice(HEADER_ROW_INDEX).join('\n');
  const rows = parse(dataCsv, { columns: false, skip_empty_lines: true, relax_column_count: true });
  const [, ...dataRows] = rows; // first row here is the real header row, drop it

  const seenIds = new Set();
  const skipped = [];
  const nullCounts = {
    canopySize: 0,
    trunkSize: 0,
    floweringBranches: 0,
    floweringClusters: 0,
    estimatedFruitCount: 0,
  };
  const conditionCounts = { healthy: 0, minor: 0, emergency: 0, unknown: 0 };
  let seededCount = 0;

  const BATCH_LIMIT = 400; // stay under Firestore's 500-write batch cap
  let batch = db.batch();
  let opsInBatch = 0;

  for (const row of dataRows) {
    const [
      , blok, treeIdRaw, , plantedRaw, supplier, tajuk, batang, dahanBerbunga, bonggol, estButir,
      notesRaw, , green, orange, red,
    ] = row;
    if (!treeIdRaw || !treeIdRaw.trim()) continue; // blank row

    const parsed = parseTreeId(treeIdRaw);
    if (!parsed) {
      skipped.push({ treeId: treeIdRaw, reason: 'Could not parse Tree ID format' });
      continue;
    }

    if (parsed.block !== String(blok ?? '').trim().toUpperCase()) {
      skipped.push({
        treeId: treeIdRaw,
        reason: `BLOK column ("${blok}") doesn't match block parsed from Tree ID ("${parsed.block}")`,
      });
      continue;
    }

    const variant = mapVariant(parsed.variantRaw);
    if (!variant) {
      skipped.push({ treeId: treeIdRaw, reason: `Unrecognized variant "${parsed.variantRaw}" — not in seeded variants` });
      continue;
    }

    const docId = `${parsed.block}${parsed.number}`;
    if (seenIds.has(docId)) {
      skipped.push({ treeId: treeIdRaw, reason: `Duplicate resulting ID "${docId}"` });
      continue;
    }
    seenIds.add(docId);

    const canopySize = parseNumericOrNull(tajuk);
    const trunkSize = parseNumericOrNull(batang);
    const floweringBranches = parseNumericOrNull(dahanBerbunga);
    const floweringClusters = parseNumericOrNull(bonggol);
    const estimatedFruitCount = parseNumericOrNull(estButir);

    if (canopySize === null) nullCounts.canopySize++;
    if (trunkSize === null) nullCounts.trunkSize++;
    if (floweringBranches === null) nullCounts.floweringBranches++;
    if (floweringClusters === null) nullCounts.floweringClusters++;
    if (estimatedFruitCount === null) nullCounts.estimatedFruitCount++;

    const { condition, trigger } = parseCondition(green, orange, red);
    const conditionNotes = cleanConditionNotes(trigger);
    conditionCounts[condition || 'unknown']++;

    const docData = {
      id: docId,
      block: parsed.block,
      treeNumber: parsed.number,
      variant,
      supplier: supplier && supplier.trim() ? supplier.trim() : null,
      datePlanted: parsePlantedDate(plantedRaw),
      canopySize,
      trunkSize,
      floweringBranches,
      floweringClusters,
      estimatedFruitCount,
      notes: cleanText(notesRaw),
      condition,
      conditionNotes,
      active: true,
      dateCreated: admin.firestore.FieldValue.serverTimestamp(),
      dateUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };

    batch.set(db.collection('trees').doc(docId), docData, { merge: true });
    opsInBatch++;
    seededCount++;

    if (opsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) await batch.commit();

  console.log(`Seeded ${seededCount} trees.`);
  console.log('Blank/placeholder values stored as null:', nullCounts);
  console.log('Condition breakdown:', conditionCounts);

  if (skipped.length) {
    console.log(`\n${skipped.length} row(s) skipped — needs manual review:`);
    skipped.forEach((s) => console.log(`  ${s.treeId}: ${s.reason}`));
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
