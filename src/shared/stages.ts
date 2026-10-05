import type { L } from './text';

/**
 * The farm's phenological scale: what a worker sees on the tree, in the farm's own words (mata ketam, ping pong,
 * telor). Shared by the web app and the WhatsApp bot.
 *
 * Status: proposed (audit 2026-10 §5), not yet confirmed by the owner. Rename labels here only; codes are stored.
 * Day ranges for ping pong / telor are deliberately absent: they are learned from confirmed reports.
 */
export const FARM_STAGES = ['veg', 'rest', 'bud', 'bloom', 'set', 'pingpong', 'egg', 'grow', 'mature', 'harvest', 'post'] as const;
export type FarmStage = (typeof FARM_STAGES)[number];

/** The season engine's stages (lib/guide.ts StageId), computed from days since bloom. */
export type EngineStage = 'preflower' | 'bloom' | 'set' | 'thin' | 'grow' | 'mature' | 'harvest' | 'recovery';

export interface FarmStageInfo {
  code: FarmStage;
  label: L;
  /** What the worker sees on the tree. */
  sees: L;
  /** The engine stage this falls in, to compare observed with expected. */
  engine: EngineStage;
  /** Words in a worker's description that point to this stage (normalized, Indonesian first). */
  keywords: string[];
}

export const FARM_STAGE_INFO: Record<FarmStage, FarmStageInfo> = {
  veg: {
    code: 'veg',
    label: { id: 'Vegetatif (tunas daun)', en: 'Vegetative (leaf flush)' },
    sees: { id: 'Daun muda baru keluar, warna terang', en: 'New light-coloured young leaves' },
    engine: 'recovery',
    keywords: ['tunas daun', 'daun muda', 'pupus', 'flush', 'vegetatif', 'trubus'],
  },
  rest: {
    code: 'rest',
    label: { id: 'Daun tua, siap bunga', en: 'Mature leaves, ready to flower' },
    sees: { id: 'Daun tua hijau gelap, belum ada kuncup', en: 'Dark mature leaves, no buds yet' },
    engine: 'preflower',
    keywords: ['daun tua', 'siap bunga', 'belum berbunga', 'belum ada bunga', 'tidak berbunga', 'tidak ada bunga', 'no flower', 'istirahat'],
  },
  bud: {
    code: 'bud',
    label: { id: 'Mata ketam', en: 'Crab eye (flower buds)' },
    sees: { id: 'Kuncup bulat kecil di dahan', en: 'Small round buds on the branches' },
    engine: 'preflower',
    keywords: ['mata ketam', 'matketam', 'kuncup', 'bakal bunga', 'calon bunga'],
  },
  bloom: {
    code: 'bloom',
    label: { id: 'Bunga mekar', en: 'Flowers open' },
    sees: { id: 'Bunga terbuka, mekar sore hari', en: 'Open flowers, opening in the evening' },
    engine: 'bloom',
    keywords: ['mekar', 'berbunga', 'bunga', 'kembang'],
  },
  set: {
    code: 'set',
    label: { id: 'Pentil (buah jadi)', en: 'Fruit set' },
    sees: { id: 'Buah kecil setelah kelopak rontok', en: 'Tiny fruit after the petals drop' },
    engine: 'set',
    keywords: ['pentil', 'buah jadi', 'bakal buah', 'buah kecil', 'putik'],
  },
  pingpong: {
    code: 'pingpong',
    label: { id: 'Ping pong', en: 'Ping-pong size' },
    sees: { id: 'Buah sebesar bola pingpong', en: 'Fruit the size of a ping-pong ball' },
    engine: 'thin',
    keywords: ['ping pong', 'pingpong', 'pimpong', '=pp'],
  },
  egg: {
    code: 'egg',
    label: { id: 'Telor', en: 'Egg size' },
    sees: { id: 'Buah sebesar telur', en: 'Fruit the size of an egg' },
    engine: 'thin',
    keywords: ['telor', 'telur'],
  },
  grow: {
    code: 'grow',
    label: { id: 'Buah besar', en: 'Fruit growing' },
    sees: { id: 'Buah membesar cepat', en: 'Fruit growing fast' },
    engine: 'grow',
    keywords: ['buah besar', 'membesar', 'sebesar kepala', 'buah tua'],
  },
  mature: {
    code: 'mature',
    label: { id: 'Menjelang matang', en: 'Maturing' },
    sees: { id: 'Bulan terakhir: duri merenggang, bunyi ketukan nyaring', en: 'Last month: spines spread, hollow sound when tapped' },
    engine: 'mature',
    keywords: ['menjelang matang', 'hampir matang', 'mau matang', 'duri merenggang'],
  },
  harvest: {
    code: 'harvest',
    label: { id: 'Panen', en: 'Harvest' },
    sees: { id: 'Buah jatuh atau dipetik', en: 'Fruit falling or being picked' },
    engine: 'harvest',
    keywords: ['panen', 'dipanen', 'petik', 'dipetik', 'buah jatuh', 'jatuhan', 'matang'],
  },
  post: {
    code: 'post',
    label: { id: 'Pemulihan', en: 'Recovery' },
    sees: { id: 'Setelah panen: pangkas, pupuk, tunggu tunas', en: 'After harvest: prune, feed, wait for the flush' },
    engine: 'recovery',
    keywords: ['habis panen', 'selesai panen', 'sudah panen', 'sudah dipanen', 'pemulihan', 'pasca panen'],
  },
};

/**
 * The stage expected from the bloom date, in the same words as the observed stages (shown side by side), so
 * "Pentil" is never compared with "Bakal buah" or with a task name.
 */
export const ENGINE_STAGE_WORDS: Record<EngineStage, L> = {
  preflower: { id: 'Belum berbunga', en: 'Not flowering yet' },
  bloom: { id: 'Bunga mekar', en: 'In bloom' },
  set: { id: 'Pentil', en: 'Fruitlet (pentil)' },
  thin: { id: 'Ping pong', en: 'Ping pong' },
  grow: { id: 'Telor / buah membesar', en: 'Egg / fruit growing' },
  mature: { id: 'Menjelang matang', en: 'Maturing' },
  harvest: { id: 'Panen', en: 'Harvest' },
  recovery: { id: 'Pemulihan', en: 'Recovery' },
};

export const isFarmStage = (s: unknown): s is FarmStage => typeof s === 'string' && (FARM_STAGES as readonly string[]).includes(s);

/** Engine stages each farm stage may appear in without being a mismatch (bud shows before bloom, post after harvest…). */
const COMPATIBLE: Record<FarmStage, EngineStage[]> = {
  veg: ['recovery', 'preflower'],
  rest: ['preflower', 'recovery'],
  bud: ['preflower'],
  bloom: ['bloom', 'preflower'],
  set: ['set', 'bloom', 'thin'],
  pingpong: ['thin', 'set', 'grow'],
  egg: ['thin', 'grow'],
  grow: ['grow', 'thin', 'mature'],
  mature: ['mature', 'grow', 'harvest'],
  harvest: ['harvest', 'mature'],
  post: ['recovery', 'harvest', 'preflower'],
};

/**
 * True when what was seen on the tree doesn't fit the stage expected from its bloom date: off-season flowering
 * ("2 musim"), or a wrong bloom date. Unknown expected stage is never a mismatch.
 */
export function stageMismatch(observed: FarmStage, expected: EngineStage | undefined): boolean {
  return !!expected && !COMPATIBLE[observed].includes(expected);
}
