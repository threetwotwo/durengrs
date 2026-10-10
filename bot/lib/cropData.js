// lib/cropData.js — reads and writes the season records the webapp already shows:
//   bloomWaves, cropCounts, harvests (written after Gemini reads a report, lib/ai.js),
//   seasonTasks, weather (the farm Flow, and season jobs seen in a report)   (see durengrs src/lib/fieldData.ts)
// All writes use deterministic ids, so a retry overwrites or skips instead of duplicating.
const { admin, db } = require('./firestore');
const R = require('./rules');
const { treeSeason, treeWaves, DEFAULT_RIPENING_DAYS } = require('./season');

const now = () => admin.firestore.FieldValue.serverTimestamp();
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

// ---------- reads ----------

async function listBlocks() {
  const snap = await db.collection('trees').get();
  const blocks = new Set();
  snap.forEach((d) => d.data().block && d.data().active !== false && blocks.add(String(d.data().block)));
  return [...blocks].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function blockBloomDate(block, today) {
  const doc = await db.collection('harvestCycles').doc(String(block)).get();
  const d = doc.exists ? doc.data().floweredOn : undefined;
  return d && R.diffDays(today, d) <= 365 ? d : undefined;
}

const activeTreesOf = async (block) =>
  (await db.collection('trees').where('block', '==', block).get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.active !== false);

async function variantRipening(code) {
  if (!code) return undefined;
  const v = await db.collection('variants').doc(code).get();
  const n = Number(v.exists ? v.data().ripeningDays : undefined);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Ripening range across the block's varieties (archived trees left out, as in the webapp).
async function blockRipening(block) {
  const trees = await activeTreesOf(block);
  const codes = [...new Set(trees.map((t) => t.variant).filter(Boolean))];
  const days = (await Promise.all(codes.map(variantRipening))).filter(Boolean);
  return days.length ? { ripeMin: Math.min(...days), ripeMax: Math.max(...days) } : { ripeMin: DEFAULT_RIPENING_DAYS, ripeMax: DEFAULT_RIPENING_DAYS };
}

async function byTree(collection, treeId) {
  const snap = await db.collection(collection).where('treeId', '==', treeId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Everything a report needs about the tree's season: its flowerings (`waves`), its counts, and ripening times
// (`treeRipening` for its own variety, `ripeMin` / `ripeMax` across the block).
async function loadTreeSeason(tree, today) {
  const [blockDate, ripening, blooms, counts, treeRipening] = await Promise.all([
    blockBloomDate(tree.block, today),
    blockRipening(tree.block),
    byTree('bloomWaves', tree.id),
    byTree('cropCounts', tree.id),
    variantRipening(tree.variant),
  ]);
  return { ...treeSeason({ blockDate, blooms, ...ripening }, today), counts, treeRipening };
}

// The season of a block, used to file season tasks. Same rule as the webapp (guide.ts blockSeasons):
// the block's bloom date while at least one tree still follows it, otherwise the block's earliest flowering.
async function blockSeasonDate(block, today) {
  const [cycleDate, { ripeMax }, trees, bloomSnap] = await Promise.all([
    blockBloomDate(block, today),
    blockRipening(block),
    activeTreesOf(block),
    db.collection('bloomWaves').where('block', '==', block).get(),
  ]);
  const blooms = bloomSnap.docs.map((d) => d.data());
  const dates = new Set();
  for (const t of trees) {
    for (const w of treeWaves(cycleDate, blooms.filter((b) => b.treeId === t.id), ripeMax + 90, today)) dates.add(w.date);
  }
  if (cycleDate && dates.has(cycleDate)) return cycleDate;
  return [...dates].sort()[0];
}

// ---------- writes ----------

// The same flowering (tree, date, part) recorded before, under this id or an older webapp id.
async function bloomExists(treeId, date, part) {
  if ((await db.collection('bloomWaves').doc(R.bloomWaveId(treeId, date, part)).get()).exists) return true;
  const sameTree = await db.collection('bloomWaves').where('treeId', '==', treeId).get();
  return sameTree.docs.some((d) => d.data().date === date && d.data().part === part);
}

async function saveBloom({ treeId, block, date, part, note, workerPhone, reportId }) {
  const id = R.bloomWaveId(treeId, date, part);
  if (await bloomExists(treeId, date, part)) return { duplicate: true, id };
  await db.collection('bloomWaves').doc(id).set(strip({ treeId, block, date, part, note, source: 'whatsapp', workerPhone: workerPhone || undefined, reportId, createdAt: now() }));
  return { duplicate: false, id };
}

// Counting again on the same day replaces the count. The tree record is kept current only with the newest
// count of its kind, and only for a tree with a single flowering (same rule as the webapp).
async function saveCount({ tree, season, stage, count, note, date, workerPhone, wavesCount, existing, reportId }) {
  const id = R.cropCountId({ treeId: tree.id, season, stage, date });
  const batch = db.batch();
  batch.set(
    db.collection('cropCounts').doc(id),
    strip({ treeId: tree.id, block: tree.block, season, stage, count, date, by: workerPhone || undefined, note, source: 'whatsapp', reportId, createdAt: now() })
  );

  const field = R.COUNT_STAGES[stage].treeField;
  const isFruit = stage !== 'clusters';
  const sameKind = (existing || []).filter((c) => (isFruit ? c.stage !== 'clusters' : c.stage === 'clusters') && c.id !== id);
  const newest = sameKind.every((c) => date >= c.date);
  let treeUpdated = false;
  if (newest && wavesCount <= 1 && tree[field] !== count) {
    batch.update(db.collection('trees').doc(tree.id), { [field]: count, dateUpdated: now() });
    batch.set(db.collection('treeEdits').doc(), {
      treeId: tree.id,
      changes: { [field]: { from: tree[field] ?? null, to: count } },
      workerPhone: workerPhone || null,
      source: 'whatsapp',
      at: now(),
    });
    treeUpdated = true;
  }
  await batch.commit();
  return { id, treeUpdated };
}

// A harvest the worker wrote in a report. `id` comes from the report (rules.js harvestIdForReport), so reading the
// report again never adds a second harvest. Same shape as the webapp's harvest form; `reportId` links back.
async function saveHarvest({ id, tree, date, fruits, weightKg, grades, floweredOn, note, workerPhone, reportId }) {
  const ref = db.collection('harvests').doc(id);
  if ((await ref.get()).exists) return { duplicate: true, id };
  await ref.set(
    strip({
      block: tree.block,
      treeId: tree.id,
      variant: tree.variant,
      date,
      fruits,
      weightKg,
      problems: [],
      grades,
      floweredOn,
      daysFromBloom: floweredOn ? R.diffDays(date, floweredOn) : undefined,
      notes: note,
      source: 'whatsapp',
      workerPhone: workerPhone || undefined,
      reportId,
      createdAt: now(),
    })
  );
  return { duplicate: false, id };
}

// A task already marked for the season keeps its first date (the webapp would overwrite; here a second worker
// reporting the same job should not move it).
async function saveSeasonTasks({ block, season, tasks, date, workerPhone }) {
  const done = [];
  const already = [];
  for (const task of tasks) {
    const ref = db.collection('seasonTasks').doc(R.seasonTaskId(block, season, task));
    const snap = await ref.get();
    if (snap.exists) {
      already.push({ task, date: snap.data().date });
      continue;
    }
    await ref.set(strip({ block, season, task, date, source: 'whatsapp', workerPhone: workerPhone || undefined, createdAt: now() }));
    done.push(task);
  }
  return { done, already };
}

async function saveRain({ date, rainMm, workerPhone }) {
  const ref = db.collection('weather').doc(date);
  const prev = await ref.get();
  await ref.set(strip({ date, rainMm, source: 'whatsapp', workerPhone: workerPhone || undefined, updatedAt: now() }));
  return { replaced: prev.exists ? prev.data().rainMm : null };
}

module.exports = { listBlocks, blockSeasonDate, loadTreeSeason, saveBloom, saveCount, saveHarvest, saveSeasonTasks, saveRain };
