/** Text helpers shared by the web app and the WhatsApp bot. No React, no Firebase. */

/** Text in both app languages: Indonesian first (the farm's words), English as a translation. */
export type L = { id: string; en: string };

/** Lowercase, collapse spaces, keep letters/digits. "Ping-Pong!" -> "ping pong". */
export function normalize(text: string | undefined): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}.,\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Indonesian endings that may follow a keyword: "getahnya", "busuklah". */
const SUFFIX = '(?:nya|lah|kah|pun)?';

/**
 * Where `kw` occurs in `text` (both normalized), as start indexes. A keyword always starts a word, so "aman" is not
 * found in "tanaman", "mati" not in "diamati", "ulat" not in "bulat". It may end with a common suffix ("getahnya"),
 * except keywords of 3 letters or less and those marked with a leading "=", which must be the whole word.
 */
export function wordHits(text: string, kw: string): number[] {
  const strict = kw.startsWith('=') || kw.replace(/\s/g, '').length <= 3;
  const k = kw.replace(/^=/, '');
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${esc}${strict ? '' : SUFFIX})(?=$|[^\\p{L}\\p{N}])`, 'gu');
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push(m.index + m[1].length);
    re.lastIndex = m.index + m[1].length + 1;
  }
  return out;
}

export const hasWord = (text: string, kw: string): boolean => wordHits(text, kw).length > 0;
