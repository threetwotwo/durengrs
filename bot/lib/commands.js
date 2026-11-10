// lib/commands.js — what a chat message asks for. Case, spaces and small typos don't matter: "a 1" is A1,
// "ringkasan", "Ringakasan" and "RINGKASN" are RINGKASAN, "kebon" is KEBUN.
const TREE_ID_PATTERN = /^[A-Z]{1,3}\d{1,3}$/;

const COMMANDS = {
  farm: ['KEBUN', 'HUJAN', 'CURAHHUJAN', 'KERJA', 'PEKERJAAN', 'CATATANKEBUN'],
  summary: ['RINGKASAN', 'REKAP', 'LAPORANHARIINI'],
  prices: ['HARGA', 'HARGAPASAR'],
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
  // "PANEN A0" (a typo allowed in PANEN): only the harvest report for that tree.
  const panen = String(text || '').trim().match(/^(\S+)\s+([a-z]{1,3}\s*\d{1,3})$/i);
  if (panen && distance(compactText(panen[1]), 'PANEN') <= 1) {
    const id = compactText(panen[2]);
    if (TREE_ID_PATTERN.test(id)) return { kind: 'harvest', id };
  }
  let best = null;
  for (const [kind, words] of Object.entries(COMMANDS))
    for (const w of words) {
      const dist = distance(c, w);
      if (dist <= allowed(w) && (!best || dist < best.dist)) best = { kind, dist };
    }
  return best ? { kind: best.kind } : { kind: 'help' };
}

/**
 * A message that starts with the word HARGA (a typo allowed) followed by more: the rest ("HARGA Toko Jaya MK 150rb"
 * -> "Toko Jaya MK 150rb"). Null otherwise, or for HARGA alone.
 */
function priceText(text) {
  const m = String(text || '').trim().match(/^(\S+)\s+([\s\S]+)$/);
  if (!m) return null;
  const w = compactText(m[1]);
  return w && distance(w, 'HARGA') <= 1 ? m[2].trim() : null;
}

/**
 * A message that reads like a price list (no command word needed): a price in it ("165rb", "150k", "Rp175.000",
 * "175.000", "275/kg", "210/pack") and enough words around it. "A1" or "ringkasan" never are.
 */
function looksLikePrices(text) {
  const s = String(text || '');
  if (s.replace(/\s/g, '').length < 10) return false;
  const price = /\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt)\b|rp\.?\s*\d|\b\d{2,3}[.,]\d{3}\b|\b\d{2,4}\s*\/\s*(?:kg|pack|pak|box|buah|pcs|biji|mika)\b/i;
  return price.test(s);
}

module.exports = { looksLikePrices, parseCommand, priceText, compactText, distance, TREE_ID_PATTERN };
