// lib/commands.js — what a chat message asks for. Case, spaces and small typos don't matter: "a 1" is A1,
// "ringkasan", "Ringakasan" and "RINGKASN" are RINGKASAN, "kebon" is KEBUN.
const TREE_ID_PATTERN = /^[A-Z]{1,3}\d{1,3}$/;

const COMMANDS = {
  farm: ['KEBUN', 'HUJAN', 'CURAHHUJAN', 'KERJA', 'PEKERJAAN', 'CATATANKEBUN'],
  summary: ['RINGKASAN', 'REKAP', 'LAPORANHARIINI'],
};

/** Letters to add, drop, swap or change to turn a into b (Damerau-Levenshtein, restricted). */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** Typos allowed for a word: none for short ones (KERJA vs KERJA is exact), 1 from 5 letters, 2 from 8. */
const allowed = (word) => (word.length >= 8 ? 2 : word.length >= 5 ? 1 : 0);

/** The message, compact: no spaces, upper case, letters and digits only ("a 1" -> "A1", "Ringkasan!" -> "RINGKASAN"). */
const compactText = (text) => String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * { kind: 'tree', id } | { kind: 'farm' } | { kind: 'summary' } | { kind: 'help' }.
 * A tree ID is checked first, so "A1" is never read as a word.
 */
function parseCommand(text) {
  const c = compactText(text);
  if (TREE_ID_PATTERN.test(c)) return { kind: 'tree', id: c };
  let best = null;
  for (const [kind, words] of Object.entries(COMMANDS))
    for (const w of words) {
      const dist = distance(c, w);
      if (dist <= allowed(w) && (!best || dist < best.dist)) best = { kind, dist };
    }
  return best ? { kind: best.kind } : { kind: 'help' };
}

module.exports = { parseCommand, compactText, distance, TREE_ID_PATTERN };
