import type { TreeReport } from '../types';

/**
 * Reports already on screen, so the report page can render instantly when a card is opened while the live
 * document loads. Small and in memory only.
 */
const cache = new Map<string, TreeReport>();

export function rememberReport(r: TreeReport) {
  cache.set(r.id, r);
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
}

export const cachedReport = (id: string) => cache.get(id);
