import type { L } from './text';
import type { Issue } from './issues';

/**
 * What workers do on a tree, and how a problem on a tree is followed over time ("cases"). Shared by the bot, which
 * writes them after Gemini reads a report (bot/lib/cases.js), and the web app, which shows them. Codes are stored
 * in Firestore: changing one is a migration, not a rename. See docs/data-contract.md.
 */

/** Work done on a tree, as read from a worker's report (`reports.triage.actions[].type`). */
export const ACTIONS = [
  'canker_treatment',
  'fungicide',
  'insecticide',
  'trunk_injection',
  'fertilizer',
  'foliar_feed',
  'drench',
  'pruning',
  'sanitation',
  'bagging',
  'fruit_thinning',
  'pollination',
  'fruit_tying',
  'weeding',
  'irrigation',
  'mulching',
  'harvest',
  'other',
] as const;
export type Action = (typeof ACTIONS)[number];
export const isAction = (s: unknown): s is Action => typeof s === 'string' && (ACTIONS as readonly string[]).includes(s);

/** `treatment` = work against a problem; `care` = routine work. */
export const ACTION_INFO: Record<Action, { label: L; kind: 'treatment' | 'care' }> = {
  canker_treatment: { label: { id: 'Kerok & oles batang', en: 'Scrape & paint canker' }, kind: 'treatment' },
  fungicide: { label: { id: 'Semprot fungisida', en: 'Fungicide spray' }, kind: 'treatment' },
  insecticide: { label: { id: 'Semprot insektisida', en: 'Insecticide spray' }, kind: 'treatment' },
  trunk_injection: { label: { id: 'Infus batang', en: 'Trunk injection' }, kind: 'treatment' },
  fertilizer: { label: { id: 'Pemupukan', en: 'Fertiliser' }, kind: 'care' },
  foliar_feed: { label: { id: 'Pupuk daun', en: 'Foliar feed' }, kind: 'care' },
  drench: { label: { id: 'Kocor', en: 'Soil drench' }, kind: 'care' },
  pruning: { label: { id: 'Pemangkasan', en: 'Pruning' }, kind: 'care' },
  sanitation: { label: { id: 'Buang bagian sakit / buah busuk', en: 'Removed diseased parts / rotten fruit' }, kind: 'treatment' },
  bagging: { label: { id: 'Brongsong buah', en: 'Fruit bagging' }, kind: 'care' },
  fruit_thinning: { label: { id: 'Buang buah berlebih', en: 'Fruit thinning' }, kind: 'care' },
  pollination: { label: { id: 'Penyerbukan tangan', en: 'Hand pollination' }, kind: 'care' },
  fruit_tying: { label: { id: 'Ikat tangkai buah', en: 'Fruit tying' }, kind: 'care' },
  weeding: { label: { id: 'Penyiangan', en: 'Weeding' }, kind: 'care' },
  irrigation: { label: { id: 'Penyiraman', en: 'Watering' }, kind: 'care' },
  mulching: { label: { id: 'Mulsa / bahan organik', en: 'Mulch / organic matter' }, kind: 'care' },
  harvest: { label: { id: 'Panen', en: 'Harvest' }, kind: 'care' },
  other: { label: { id: 'Pekerjaan lain', en: 'Other work' }, kind: 'care' },
};

/**
 * Words a worker (or Gemini, describing a photo) uses for treatment done on a tree, for reading a report without
 * Gemini's list of actions (`treatmentsInText`). Each form is listed: a keyword matches a whole word ("oles" is not
 * found in "dioles").
 */
export const TREATMENT_WORDS: Partial<Record<Action, string[]>> = {
  canker_treatment: ['kerok', 'dikerok', 'dikeroki', 'kerokan', 'mengerok', 'kikis', 'dikikis', 'mengikis', 'oles', 'dioles', 'diolesi', 'olesi', 'mengoles', 'mengolesi', 'pengolesan', 'pasta', 'bubur bordo', 'bordo', 'labur', 'dilabur'],
  fungicide: ['fungisida', 'ridomil', 'antracol', 'dithane', 'mankozeb', 'mancozeb', 'metalaksil', 'aliette', 'fosetil', 'amistar', 'nordox', 'kocide', 'agrifos', 'fosfit'],
  insecticide: ['insektisida', 'confidor', 'imidakloprid', 'imidacloprid', 'abamektin', 'abamectin', 'decis', 'curacron', 'regent', 'furadan', 'karbofuran', 'lannate', 'marshal'],
  trunk_injection: ['injeksi', 'diinjeksi', 'infus', 'diinfus', 'suntik', 'disuntik'],
  sanitation: ['dipotong', 'dipangkas', 'dibuang', 'dibakar', 'dimusnahkan'],
};
/** Product names among those words, shown as the product used. */
export const TREATMENT_PRODUCTS = ['ridomil', 'antracol', 'dithane', 'aliette', 'amistar', 'nordox', 'kocide', 'agrifos', 'confidor', 'decis', 'curacron', 'regent', 'furadan', 'lannate', 'marshal'];
/** The problems each treatment is done against (a treatment for none of the report's problems is left out). */
export const TREATS: Partial<Record<Action, Issue[]>> = {
  canker_treatment: ['phytophthora_canker', 'stem_fungus'],
  fungicide: ['phytophthora_canker', 'stem_fungus', 'leaf_blight', 'fruit_drop'],
  insecticide: ['whitefly', 'borer'],
  trunk_injection: ['phytophthora_canker', 'stem_fungus', 'borer'],
  sanitation: ['stem_fungus', 'leaf_blight', 'phytophthora_canker', 'borer'],
};

/** Work that is also a season job of the block (`seasonTasks`). */
export const SEASON_TASK_OF: Partial<Record<Action, string>> = {
  pollination: 'hand_pollination',
  fruit_thinning: 'fruit_thinning',
  bagging: 'bagging',
  fruit_tying: 'fruit_tying',
};

/**
 * Where a problem on a tree stands (`cases.status`):
 *   open ──treated──▶ treated ──▶ improving ──▶ resolved, or ──▶ worse (needs attention again)
 */
export const CASE_STATUSES = ['open', 'treated', 'improving', 'worse', 'resolved'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const CASE_STATUS_INFO: Record<CaseStatus, { label: L; tone: 'danger' | 'warn' | 'info' | 'good' | 'done' }> = {
  open: { label: { id: 'Belum ditangani', en: 'Not treated yet' }, tone: 'warn' },
  treated: { label: { id: 'Sudah dirawat', en: 'Treated' }, tone: 'info' },
  improving: { label: { id: 'Membaik', en: 'Improving' }, tone: 'good' },
  worse: { label: { id: 'Memburuk', en: 'Getting worse' }, tone: 'danger' },
  resolved: { label: { id: 'Selesai', en: 'Solved' }, tone: 'done' },
};

/** One step in a case (`cases.events[].type`). */
export const CASE_EVENTS = ['seen', 'treated', 'checked', 'improving', 'worse', 'resolved', 'reopened'] as const;
export type CaseEventType = (typeof CASE_EVENTS)[number];
export const CASE_EVENT_INFO: Record<CaseEventType, { label: L }> = {
  seen: { label: { id: 'Terlihat', en: 'Seen' } },
  treated: { label: { id: 'Dirawat', en: 'Treated' } },
  checked: { label: { id: 'Dicek, sama', en: 'Checked, same' } },
  improving: { label: { id: 'Membaik', en: 'Improving' } },
  worse: { label: { id: 'Memburuk', en: 'Worse' } },
  resolved: { label: { id: 'Selesai', en: 'Solved' } },
  reopened: { label: { id: 'Dibuka lagi', en: 'Reopened' } },
};

/** How a report updates a case Gemini was told about (`reports.triage.caseUpdates[].status`). */
export const CASE_UPDATES = ['treated', 'improving', 'same', 'worse', 'resolved'] as const;
export type CaseUpdate = (typeof CASE_UPDATES)[number];

/** A problem that is not resolved is photographed again this many days after its last report. */
export const RECHECK_DAYS = 7;
