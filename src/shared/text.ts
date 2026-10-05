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

/**
 * Whether `kw` occurs in `text` (both normalized). Keywords of 3 letters or less, and any keyword marked with a
 * leading "=", match whole words only (so "pp" doesn't match inside "suppl").
 */
export function hasWord(text: string, kw: string): boolean {
  const whole = kw.startsWith('=') || kw.replace(/\s/g, '').length <= 3;
  const k = kw.replace(/^=/, '');
  if (!whole) return text.includes(k);
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, 'u').test(text);
}
