import type { L } from './text';

/**
 * Tree health in the farm's words: Hijau / Kuning / Merah (the owner's sheet), plus "membaik" (improving).
 * Stored values stay the existing `condition` codes so old records and the bot keep working.
 */
export const HEALTH = ['hijau', 'kuning', 'merah'] as const;
export type Health = (typeof HEALTH)[number];
export type StoredCondition = 'healthy' | 'minor' | 'emergency' | 'not_assessed';

export const HEALTH_INFO: Record<Health, { label: L; condition: StoredCondition; meaning: L }> = {
  hijau: { label: { id: 'Hijau', en: 'Green' }, condition: 'healthy', meaning: { id: 'Sehat', en: 'Healthy' } },
  kuning: { label: { id: 'Kuning', en: 'Yellow' }, condition: 'minor', meaning: { id: 'Ada masalah, pantau', en: 'Has a problem, watch it' } },
  merah: { label: { id: 'Merah', en: 'Red' }, condition: 'emergency', meaning: { id: 'Darurat, tangani segera', en: 'Emergency, act now' } },
};

export const IMPROVING: L = { id: 'Membaik', en: 'Improving' };

export function healthOf(condition: string | undefined): Health | null {
  const c = (condition || '').toLowerCase();
  if (c === 'healthy') return 'hijau';
  if (c === 'minor' || c === 'minor_issue') return 'kuning';
  if (c === 'emergency') return 'merah';
  return null;
}

const RANK: Record<Health, number> = { hijau: 0, kuning: 1, merah: 2 };
export const worstHealth = (a: Health | undefined, b: Health | undefined): Health | undefined =>
  !a ? b : !b ? a : RANK[a] >= RANK[b] ? a : b;
