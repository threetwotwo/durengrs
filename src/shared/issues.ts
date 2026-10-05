import type { L } from './text';
import type { Health } from './health';

/**
 * What can be wrong with a tree, in the farm's words. Workers never pick these: the system suggests them from the
 * photo and words, a person confirms. `topic` is the Guide topic (lib/guide.ts TopicId) with the advice.
 * Order matters for text matching: more specific issues first ("rontok daun" before "rontok").
 */
export const ISSUES = [
  'phytophthora_canker',
  'stem_fungus',
  'leaf_blight',
  'whitefly',
  'borer',
  'leaf_drop',
  'fruit_drop',
  'nutrient',
  'water',
  'other',
] as const;
export type Issue = (typeof ISSUES)[number];

export interface IssueInfo {
  code: Issue;
  label: L;
  /** Guide topic with the care advice. */
  topic: string;
  /** Health this usually means until a person decides otherwise. */
  health: Health;
  /** One plain next step for the worker (reply text). */
  nextStep: L;
  keywords: string[];
}

export const ISSUE_INFO: Record<Issue, IssueInfo> = {
  phytophthora_canker: {
    code: 'phytophthora_canker',
    label: { id: 'Kanker batang (getah merah)', en: 'Stem canker (Phytophthora)' },
    topic: 'phytophthora',
    health: 'merah',
    nextStep: { id: 'Foto dekat bagian batang yang basah/bergetah. Jangan dilukai dulu; admin akan cek hari ini.', en: 'Take a close photo of the wet/oozing bark. Don\'t cut yet; the admin will check today.' },
    keywords: ['kanker', 'getah merah', 'getah', 'blendok', 'busuk batang', 'kulit basah', 'batang basah', 'kulit busuk', 'phytophthora', 'fitoftora'],
  },
  stem_fungus: {
    code: 'stem_fungus',
    label: { id: 'Jamur batang / dahan', en: 'Stem or branch fungus' },
    topic: 'diseases',
    health: 'kuning',
    nextStep: { id: 'Foto dekat jamurnya. Tandai dahan yang kena.', en: 'Take a close photo of the fungus. Mark the affected branch.' },
    keywords: ['jamur upas', 'jamur batang', 'jamur dahan', 'jamur', 'cendawan', 'lumut kerak'],
  },
  leaf_blight: {
    code: 'leaf_blight',
    label: { id: 'Hawar daun', en: 'Leaf blight' },
    topic: 'diseases',
    health: 'kuning',
    nextStep: { id: 'Foto daun yang kena dari dekat dan satu foto seluruh tajuk.', en: 'Take a close photo of the leaves and one of the whole canopy.' },
    keywords: ['hawar', 'daun gosong', 'daun terbakar', 'bercak daun', 'daun bercak', 'ujung daun kering', 'daun kering'],
  },
  whitefly: {
    code: 'whitefly',
    label: { id: 'Kutu kebul', en: 'Whitefly' },
    topic: 'pests',
    health: 'kuning',
    nextStep: { id: 'Foto bagian bawah daun. Lihat apakah ada di pohon sebelah juga.', en: 'Photograph the underside of the leaves. Check the neighbouring trees too.' },
    keywords: ['kutu kebul', 'kebul', 'kutu putih', 'kutu daun', 'kutu'],
  },
  borer: {
    code: 'borer',
    label: { id: 'Penggerek', en: 'Borer' },
    topic: 'pests',
    health: 'kuning',
    nextStep: { id: 'Foto lubangnya dari dekat. Pisahkan buah yang berlubang.', en: 'Close photo of the holes. Separate the bored fruit.' },
    keywords: ['penggerek', 'ulat', 'lubang', 'larva', 'berlubang'],
  },
  leaf_drop: {
    code: 'leaf_drop',
    label: { id: 'Rontok daun', en: 'Leaf drop' },
    topic: 'water',
    health: 'kuning',
    nextStep: { id: 'Foto seluruh pohon dan tanah di bawahnya (kering atau tergenang?).', en: 'Photograph the whole tree and the soil under it (dry or waterlogged?).' },
    keywords: ['rontok daun', 'daun rontok', 'daun gugur', 'meranggas', 'daun jatuh'],
  },
  fruit_drop: {
    code: 'fruit_drop',
    label: { id: 'Rontok bunga / buah', en: 'Flower or fruit drop' },
    topic: 'fruit',
    health: 'kuning',
    nextStep: { id: 'Hitung kira-kira berapa buah yang jatuh dan foto buahnya.', en: 'Roughly count the fallen fruit and photograph them.' },
    keywords: ['buah rontok', 'rontok buah', 'bunga rontok', 'rontok bunga', 'buah gugur', 'rontok'],
  },
  nutrient: {
    code: 'nutrient',
    label: { id: 'Kurang hara (daun kuning / sedikit)', en: 'Nutrient problem (yellow or few leaves)' },
    topic: 'nutrition',
    health: 'kuning',
    nextStep: { id: 'Foto daun tua dan daun muda berdampingan.', en: 'Photograph old and young leaves side by side.' },
    keywords: ['daun kuning', 'menguning', 'kurang daun', 'daun kurang', 'daun pucat', 'pucat'],
  },
  water: {
    code: 'water',
    label: { id: 'Air (kering / tergenang)', en: 'Water (dry / waterlogged)' },
    topic: 'water',
    health: 'kuning',
    nextStep: { id: 'Foto tanah di bawah tajuk.', en: 'Photograph the soil under the canopy.' },
    keywords: ['tergenang', 'genangan', 'banjir', 'becek', 'kekeringan', 'layu', 'tanah kering'],
  },
  other: {
    code: 'other',
    label: { id: 'Lainnya', en: 'Other' },
    topic: 'diseases',
    health: 'kuning',
    nextStep: { id: 'Admin akan cek fotonya.', en: 'The admin will check the photo.' },
    keywords: [],
  },
};

export const isIssue = (s: unknown): s is Issue => typeof s === 'string' && (ISSUES as readonly string[]).includes(s);
