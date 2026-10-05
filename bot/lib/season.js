// lib/season.js — where a tree is in the season. A port of the webapp's guide.ts (stageOf, treeWaves) and
// crop.ts (next step), kept pure so it can be tested. Keep it in step with those files.
const { diffDays, RECOUNT_DAYS } = require('./rules');

const DEFAULT_RIPENING_DAYS = 120;

function stageOf(day, ripeMin, ripeMax) {
  if (day < 0) return 'preflower';
  if (day <= 7) return 'bloom';
  if (day <= 27) return 'set';
  if (day <= 60) return 'thin';
  if (day < ripeMin - 30) return 'grow';
  if (day < ripeMin - 7) return 'mature';
  if (day <= ripeMax + 14) return 'harvest';
  if (day <= ripeMax + 90) return 'recovery';
  return 'preflower';
}

// Which count each stage of the season calls for.
const STAGE_COUNT = { bloom: 'clusters', set: 'set', thin: 'kept', grow: 'onTree', mature: 'onTree', harvest: 'harvest' };

// The flowerings that count for one tree this season: its own records, plus the block date
// unless the tree flowered whole on another date.
function treeWaves(blockDate, blooms, horizonDays, today) {
  const own = blooms
    .filter((b) => b.date <= today && diffDays(today, b.date) <= horizonDays)
    .map((b) => ({ date: b.date, part: b.part, fromBlock: false }));
  const hasWhole = own.some((b) => b.part === 'whole');
  const blockCurrent = blockDate && diffDays(today, blockDate) <= 365;
  const all = !hasWhole && blockCurrent ? [{ date: blockDate, part: 'whole', fromBlock: true }, ...own] : own;
  // one entry per date: a "whole" outranks a partial
  const byDate = new Map();
  for (const w of all) {
    const prev = byDate.get(w.date);
    if (!prev || (w.part === 'whole' && prev.part !== 'whole')) byDate.set(w.date, w);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * ctx = { blockDate, blooms[], counts[], ripeMin, ripeMax }  (counts: cropCounts docs of this tree)
 * Returns { waves[{date, part, day, stage}], next: {kind, season, overdue} | null, latest(season, stage) }
 */
function treeSeason(ctx, today) {
  const ripeMin = ctx.ripeMin ?? DEFAULT_RIPENING_DAYS;
  const ripeMax = ctx.ripeMax ?? DEFAULT_RIPENING_DAYS;
  const waves = treeWaves(ctx.blockDate, ctx.blooms || [], ripeMax + 90, today).map((w) => {
    const day = diffDays(today, w.date);
    return { ...w, day, stage: stageOf(day, ripeMin, ripeMax) };
  });

  const latestMap = new Map();
  for (const c of ctx.counts || []) {
    const key = `${c.season}|${c.stage}`;
    const prev = latestMap.get(key);
    if (!prev || c.date > prev.date) latestMap.set(key, c);
  }
  const latest = (season, stage) => latestMap.get(`${season}|${stage}`);

  let next = null;
  for (const w of waves) {
    const kind = STAGE_COUNT[w.stage];
    if (!kind) continue;
    if (kind === 'harvest') {
      next = next || { kind, season: w.date, overdue: false };
      continue;
    }
    const have = latest(w.date, kind);
    const stale = kind === 'onTree' && have && diffDays(today, have.date) >= RECOUNT_DAYS;
    if (!have || stale) {
      next = { kind, season: w.date, overdue: true, sinceDays: have ? diffDays(today, have.date) : null };
      break;
    }
  }
  return { waves, next, latest, ripeMin, ripeMax };
}

module.exports = { stageOf, treeWaves, treeSeason, DEFAULT_RIPENING_DAYS, STAGE_COUNT };
