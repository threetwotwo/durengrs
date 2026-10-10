// lib/season.js — the flowerings that count for one tree this season, and which of them a harvest came from.
// A port of the webapp's guide.ts (treeWaves) and its harvest form (flowering by ripening time), kept pure so it can
// be tested. Keep it in step with those files.
const { diffDays } = require('./rules');

const DEFAULT_RIPENING_DAYS = 120;

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
 * ctx = { blockDate, blooms[], ripeMin, ripeMax }  (blooms: bloomWaves docs of this tree)
 * Returns { waves[{date, part, fromBlock}] oldest first, ripeMin, ripeMax }.
 */
function treeSeason(ctx, today) {
  const ripeMin = ctx.ripeMin ?? DEFAULT_RIPENING_DAYS;
  const ripeMax = ctx.ripeMax ?? DEFAULT_RIPENING_DAYS;
  return { waves: treeWaves(ctx.blockDate, ctx.blooms || [], ripeMax + 90, today), ripeMin, ripeMax };
}

// The flowering a harvest came from: the one whose ripening time (the tree's own variety, else the block's
// shortest) is nearest the harvest day. Same rule as the webapp's harvest form, so both agree on days from bloom.
// `season` is what cropData.loadTreeSeason returns; undefined when no flowering came before the harvest.
function floweredOnFor(season, date) {
  if (!season) return undefined;
  const ripening = season.treeRipening || season.ripeMin;
  const earlier = (season.waves || []).filter((w) => w.date <= date);
  if (!earlier.length) return undefined;
  return earlier.sort((a, b) => Math.abs(diffDays(date, a.date) - ripening) - Math.abs(diffDays(date, b.date) - ripening))[0].date;
}

module.exports = { treeWaves, treeSeason, floweredOnFor, DEFAULT_RIPENING_DAYS };
