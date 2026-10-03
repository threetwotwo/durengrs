import { translate, type Lang } from '../i18n';
import { DurianTree, DurianVariant } from '../types';
import { normalizeTimestamp } from '../context/FarmContext';
import { HarvestCycle, followUpOf } from './insights';
import { ScheduleTask, TreatmentPlan, addDays, diffDays, todayStr } from './treatments';

/**
 * Guide engine: the research in guideContent.ts applied to this farm's live data.
 *
 *   blockSeasons()  where each block is in its fruiting cycle, from the flowering date in harvestCycles
 *   STAGES          what the research says to do in each stage (shown on the Guide, Dashboard and tree pages)
 *   buildChecks()   gaps between best practice and what the farm records or schedules
 *   topicsForText() which guide topics a worker's note or report is about
 *
 * Kept free of the long topic texts so the Dashboard can import it without pulling those in.
 */

/** Text in both app languages. */
export type L = { id: string; en: string };
export const pick = (l: L, lang: Lang) => l[lang];

export type TopicId =
  | 'site'
  | 'planting'
  | 'flowering'
  | 'pollination'
  | 'fruit'
  | 'water'
  | 'nutrition'
  | 'canopy'
  | 'phytophthora'
  | 'diseases'
  | 'pests'
  | 'harvest'
  | 'records';

export interface TopicMeta {
  id: TopicId;
  title: L;
  summary: L;
  /**
   * Lowercase words that link a note or report to this topic. Words of 3 letters or less match whole words only.
   * Indonesian prefixes can drop a stem's first letter (kuning -> menguning, pangkas -> memangkas), so list those forms too.
   */
  keywords: string[];
}

export const TOPICS: TopicMeta[] = [
  {
    id: 'site',
    title: { id: 'Iklim & tanah', en: 'Climate & soil' },
    summary: {
      id: 'Suhu, hujan, pH dan drainase yang paling cocok untuk durian.',
      en: 'The temperature, rain, soil pH and drainage durian does best in.',
    },
    keywords: ['tanah', 'genang', 'banjir', 'angin kencang', 'soil', 'waterlog', 'flood', 'wind'],
  },
  {
    id: 'planting',
    title: { id: 'Penanaman & pohon muda', en: 'Planting & young trees' },
    summary: {
      id: 'Jarak tanam, lubang tanam, naungan, batang bawah, dan merawat pohon sebelum berbuah.',
      en: 'Spacing, planting holes, shade, rootstocks, and caring for trees before they bear.',
    },
    keywords: ['bibit', 'sulam', 'tanam ulang', 'jarak tanam', 'okulasi', 'sambung', 'batang bawah', 'naungan', 'seedling', 'replant', 'graft', 'rootstock', 'spacing'],
  },
  {
    id: 'flowering',
    title: { id: 'Pembungaan', en: 'Flowering' },
    summary: {
      id: 'Apa yang memicu bunga, tahap kuncup sampai mekar, dan kenapa bunga rontok.',
      en: 'What triggers flowers, bud stages to bloom, and why flowers drop.',
    },
    keywords: ['bunga', 'kuncup', 'mata ketam', 'mekar', 'flower', 'bud', 'buds', 'blossom', 'bloom'],
  },
  {
    id: 'pollination',
    title: { id: 'Penyerbukan', en: 'Pollination' },
    summary: {
      id: 'Kelelawar, penyerbukan silang dan penyerbukan tangan untuk menaikkan bakal buah.',
      en: 'Bats, cross-pollination and hand pollination to raise fruit set.',
    },
    keywords: ['serbuk sari', 'penyerbuk', 'serbuki', 'kelelawar', 'pollinat', 'pollen', 'bat', 'bats'],
  },
  {
    id: 'fruit',
    title: { id: 'Bakal buah & penjarangan', en: 'Fruit set & thinning' },
    summary: {
      id: 'Berapa buah yang dipertahankan, kapan menjarangkan, dan kenapa buah rontok.',
      en: 'How many fruit to keep, when to thin, and why fruit drops.',
    },
    keywords: ['buah rontok', 'rontok buah', 'buah gugur', 'pentil', 'buah kecil', 'penjarangan', 'jarangkan', 'retak', 'buah pecah', 'fruit drop', 'fruitlet', 'thinning', 'small fruit', 'crack'],
  },
  {
    id: 'water',
    title: { id: 'Air & pengairan', en: 'Water & irrigation' },
    summary: {
      id: 'Kapan pohon perlu kering, kapan perlu air, dan bahaya tergenang.',
      en: 'When the tree needs a dry spell, when it needs water, and the danger of standing water.',
    },
    keywords: ['kekeringan', 'kemarau', 'layu', 'siram', 'menyiram', 'air', 'genang', 'drought', 'wilt', 'dry', 'irrigat', 'waterlog'],
  },
  {
    id: 'nutrition',
    title: { id: 'Pupuk & hara', en: 'Nutrition' },
    summary: {
      id: 'Kadar hara daun yang ideal dan pupuk yang tepat untuk tiap tahap.',
      en: 'Ideal leaf nutrient levels and the right feed for each stage.',
    },
    keywords: ['kuning', 'menguning', 'pucat', 'klorosis', 'defisiensi', 'kekurangan hara', 'pupuk', 'memupuk', 'ujung daun', 'boron', 'kalsium', 'yellow', 'chlorosis', 'pale', 'deficien', 'fertili', 'tip burn', 'calcium'],
  },
  {
    id: 'canopy',
    title: { id: 'Pemangkasan & tajuk', en: 'Pruning & canopy' },
    summary: {
      id: 'Bentuk tajuk, cabang bawah, dan kapan memangkas.',
      en: 'Canopy shape, lower branches, and when to prune.',
    },
    keywords: ['pangkas', 'memangkas', 'cabang patah', 'dahan patah', 'tunas air', 'tajuk', 'prune', 'pruning', 'broken branch', 'water shoot', 'canopy'],
  },
  {
    id: 'phytophthora',
    title: { id: 'Kanker batang & busuk (Phytophthora)', en: 'Canker & rot (Phytophthora)' },
    summary: {
      id: 'Penyakit paling merusak durian: gejala, pencegahan, injeksi fosfonat.',
      en: "Durian's most damaging disease: symptoms, prevention, phosphonate injection.",
    },
    keywords: ['kanker', 'getah', 'blendok', 'busuk', 'kulit batang', 'luka batang', 'phytophthora', 'fitoftora', 'canker', 'ooze', 'gummosis', 'rot', 'lesion'],
  },
  {
    id: 'diseases',
    title: { id: 'Penyakit lain', en: 'Other diseases' },
    summary: {
      id: 'Jamur upas, antraknosa, hawar dan bercak daun, busuk akar Pythium, bercak alga.',
      en: 'Pink disease, anthracnose, leaf blight and spots, Pythium root rot, algal spot.',
    },
    keywords: ['jamur', 'upas', 'merah muda', 'antraknosa', 'bercak', 'hawar', 'embun jelaga', 'mati pucuk', 'mati ranting', 'lumut', 'pink', 'anthracnose', 'leaf spot', 'blight', 'sooty', 'dieback', 'fungus', 'algae', 'algal'],
  },
  {
    id: 'pests',
    title: { id: 'Hama', en: 'Pests' },
    summary: {
      id: 'Penggerek buah, biji dan batang, kutu loncat, kutu putih, dan membrongsong buah.',
      en: 'Fruit, seed and stem borers, psyllids, mealybugs, and bagging fruit.',
    },
    keywords: ['ulat', 'gerek', 'hama', 'kutu', 'serangga', 'kumbang', 'semut', 'lubang', 'tupai', 'serbuk kayu', 'borer', 'caterpillar', 'pest', 'mealybug', 'psyllid', 'insect', 'beetle', 'ant', 'ants', 'hole', 'frass'],
  },
  {
    id: 'harvest',
    title: { id: 'Panen & kematangan', en: 'Harvest & maturity' },
    summary: {
      id: 'Umur buah per varietas, tanda matang, dan menghindari daging basah.',
      en: 'Days to maturity per variety, ripeness signs, and avoiding wet core.',
    },
    keywords: ['panen', 'memanen', 'matang', 'daging basah', 'harvest', 'ripe', 'maturity', 'wet core'],
  },
  {
    id: 'records',
    title: { id: 'Data yang perlu dicatat', en: 'What to record' },
    summary: {
      id: 'Angka kecil yang membuat keputusan kebun ini lebih tepat tiap musim.',
      en: 'The few numbers that make this farm’s decisions better every season.',
    },
    keywords: [],
  },
];

export const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
export const isTopicId = (s: string | null | undefined): s is TopicId => !!s && TOPIC_BY_ID.has(s as TopicId);

// ---------- matching notes and reports to topics ----------

function hasKeyword(text: string, kw: string): boolean {
  if (kw.length <= 3) return new RegExp(`(^|[^\\p{L}])${kw}($|[^\\p{L}])`, 'u').test(text);
  return text.includes(kw);
}

/** Topics a piece of free text (condition notes, a worker's report) talks about, most matches first. */
export function topicsForText(...texts: Array<string | undefined>): TopicId[] {
  const text = texts.filter(Boolean).join(' \n ').toLowerCase();
  if (!text.trim()) return [];
  const scored: Array<[TopicId, number]> = [];
  for (const t of TOPICS) {
    const n = t.keywords.filter((kw) => hasKeyword(text, kw)).length;
    if (n > 0) scored.push([t.id, n]);
  }
  return scored.sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

// ---------- fruiting cycle per block ----------

export type StageId = 'preflower' | 'bloom' | 'set' | 'thin' | 'grow' | 'mature' | 'harvest' | 'recovery';

/** Used when no variant in a block has ripening days yet (middle of the published 90-150 day range). */
export const DEFAULT_RIPENING_DAYS = 120;

/**
 * Day ranges after flowering. Thinning runs from week 4 to about day 60 (Thai practice: first round at 4-6 weeks,
 * a second around day 45, the last near day 60); maturing = last month before harvest.
 */
export function stageOf(day: number, ripeMin: number, ripeMax: number): StageId {
  if (day < 0) return 'preflower';
  if (day <= 7) return 'bloom';
  if (day <= 27) return 'set';
  if (day <= 60) return 'thin';
  if (day < ripeMin - 30) return 'grow';
  if (day < ripeMin - 7) return 'mature';
  if (day <= ripeMax + 14) return 'harvest';
  if (day <= ripeMax + 90) return 'recovery';
  return 'preflower';
}

export interface BlockSeason {
  block: string;
  variants: string[];
  floweredOn?: string;
  /** Days since the recorded flowering date. */
  day?: number;
  stage: StageId;
  ripeMin: number;
  ripeMax: number;
  /** True when no variant in the block has ripening days, so DEFAULT_RIPENING_DAYS was used. */
  ripeningAssumed: boolean;
  harvestFrom?: string;
  harvestTo?: string;
  /** The last flowering date is more than a year old: a season was probably not recorded. */
  outdated: boolean;
}

export function blockSeasons(
  trees: DurianTree[],
  variants: DurianVariant[],
  cycles: HarvestCycle[],
  today = todayStr()
): BlockSeason[] {
  const variantByCode = new Map(variants.map((v) => [v.code, v]));
  const cycleByBlock = new Map(cycles.map((c) => [c.block, c.floweredOn]));
  const byBlock = new Map<string, Set<string>>();
  for (const t of trees) {
    if (!t.block) continue;
    const set = byBlock.get(t.block) || new Set<string>();
    if (t.variant) set.add(t.variant);
    byBlock.set(t.block, set);
  }

  return Array.from(byBlock.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([block, codes]) => {
      const days = Array.from(codes)
        .map((c) => Number(variantByCode.get(c)?.ripeningDays))
        .filter((n) => Number.isFinite(n) && n > 0);
      const ripeningAssumed = days.length === 0;
      const ripeMin = ripeningAssumed ? DEFAULT_RIPENING_DAYS : Math.min(...days);
      const ripeMax = ripeningAssumed ? DEFAULT_RIPENING_DAYS : Math.max(...days);
      const floweredOn = cycleByBlock.get(block);
      const base = { block, variants: Array.from(codes).sort(), ripeMin, ripeMax, ripeningAssumed };
      if (!floweredOn) return { ...base, stage: 'preflower' as StageId, outdated: false };
      const day = diffDays(today, floweredOn);
      return {
        ...base,
        floweredOn,
        day,
        stage: stageOf(day, ripeMin, ripeMax),
        harvestFrom: addDays(floweredOn, ripeMin),
        harvestTo: addDays(floweredOn, ripeMax),
        outdated: day > 365,
      };
    });
}

export interface StageAction {
  text: L;
  topic: TopicId;
}

export interface StageInfo {
  title: L;
  when: L;
  actions: StageAction[];
}

/** What to do now, per stage. Every line is backed by a source in the linked topic. */
export const STAGES: Record<StageId, StageInfo> = {
  preflower: {
    title: { id: 'Menunggu bunga', en: 'Waiting for flowers' },
    when: { id: 'Sampai bunga mekar', en: 'Until flowers open' },
    actions: [
      {
        text: {
          id: 'Pastikan tunas daun terakhir sudah tua (hijau gelap) sebelum musim kering; daun muda menunda bunga.',
          en: 'Make sure the last leaf flush has hardened (dark green) before the dry season; young leaves delay flowering.',
        },
        topic: 'flowering',
      },
      {
        text: {
          id: 'Sekitar 15 hari hampir tanpa hujan biasanya memicu kuncup; bunga mekar kira-kira 50 hari kemudian.',
          en: 'About 15 days with almost no rain usually triggers buds; flowers open roughly 50 days later.',
        },
        topic: 'flowering',
      },
      {
        text: {
          id: 'Kurangi pupuk nitrogen dan siraman berat selama masa kering itu; siram lagi begitu kuncup terlihat.',
          en: 'Hold back nitrogen and heavy watering during that dry spell; resume watering once buds show.',
        },
        topic: 'water',
      },
      {
        text: {
          id: 'Saat kuncup selebar ±1 cm, petani Thailand menjarangkan kuncup bunga (berapa banyak tergantung varietas) agar buah lebih besar dan seragam.',
          en: 'When buds are about 1 cm across, Thai growers thin the flower buds (how much depends on the variety) for bigger, more even fruit.',
        },
        topic: 'fruit',
      },
      {
        text: {
          id: 'Saat bunga mekar, catat tanggalnya di Jadwal → Panen. Semua tahap berikutnya dihitung dari tanggal itu.',
          en: 'When flowers open, record the date in Schedule → Harvest. Every later stage is counted from it.',
        },
        topic: 'records',
      },
    ],
  },
  bloom: {
    title: { id: 'Bunga mekar', en: 'In bloom' },
    when: { id: 'Hari 0-7 setelah mekar', en: 'Days 0-7 after bloom' },
    actions: [
      {
        text: {
          id: 'Putik terbuka sekitar pukul 16.00 dan serbuk sari keluar sekitar 19.30: mulai saat itu waktu terbaik untuk penyerbukan tangan.',
          en: 'The stigma is exposed around 4 pm and pollen sheds around 7:30 pm: from then is the best time to hand-pollinate.',
        },
        topic: 'pollination',
      },
      {
        text: {
          id: 'Pakai serbuk sari dari varietas lain: 2 bulan setelah penyerbukan, 12,2% bunga yang diserbuki silang dengan tangan masih menjadi buah vs 5,1% secara alami (satu studi).',
          en: 'Use pollen from another variety: 2 months after pollination, 12.2% of hand cross-pollinated flowers were still fruit vs 5.1% open-pollinated (one study).',
        },
        topic: 'pollination',
      },
      {
        text: {
          id: 'Jangan semprot insektisida ke bunga yang mekar; kelelawar dan lebah adalah penyerbuknya.',
          en: "Don't spray insecticide onto open flowers; bats and bees are the pollinators.",
        },
        topic: 'pests',
      },
      {
        text: {
          id: 'Jaga tanah lembap merata: kekurangan air maupun genangan sama-sama membuat bunga rontok.',
          en: 'Keep soil evenly moist: both drought and waterlogging make flowers drop.',
        },
        topic: 'water',
      },
      {
        text: {
          id: 'Semprot daun boron + kalsium dari berbunga sampai bakal buah (praktik di Malaysia dan Thailand); boron beracun bila berlebihan, ikuti label.',
          en: 'Foliar boron + calcium from bloom to fruit set (practice in Malaysia and Thailand); boron is toxic in excess, follow the label.',
        },
        topic: 'nutrition',
      },
      {
        text: {
          id: 'Isi "Kelompok bunga" di data pohon; angka ini membantu menilai bakal buah nanti.',
          en: 'Fill in "Flower clusters" on the tree record; it helps judge fruit set later.',
        },
        topic: 'records',
      },
    ],
  },
  set: {
    title: { id: 'Bakal buah', en: 'Fruit set' },
    when: { id: 'Hari 8-27', en: 'Days 8-27' },
    actions: [
      {
        text: {
          id: 'Bunga yang tidak terserbuki gugur 7-10 hari setelah mekar; sebagian rontok itu normal.',
          en: 'Unpollinated flowers fall 7-10 days after opening; some drop is normal.',
        },
        topic: 'fruit',
      },
      {
        text: {
          id: 'Air secukupnya dan merata. Terlalu banyak air memicu tunas daun baru yang bersaing dengan buah.',
          en: 'Water enough and evenly. Too much water triggers a leaf flush that competes with the fruit.',
        },
        topic: 'water',
      },
      {
        text: {
          id: 'Hindari pupuk nitrogen tinggi sekarang; tunas daun selama buah tumbuh dikaitkan dengan buah rontok dan matang tidak merata.',
          en: 'Avoid high-nitrogen feed now; leaf flushing during fruit growth is linked to fruit drop and uneven ripening.',
        },
        topic: 'nutrition',
      },
      {
        text: {
          id: 'Penjarangan pertama bisa dimulai minggu ke-4: buang buah cacat dan bertangkai kecil lebih dulu.',
          en: 'The first thinning can start in week 4: remove deformed fruit and fruit on thin stalks first.',
        },
        topic: 'fruit',
      },
    ],
  },
  thin: {
    title: { id: 'Penjarangan & brongsong', en: 'Thinning & bagging' },
    when: { id: 'Hari 28-60 (minggu 4 sampai ±9)', en: 'Days 28-60 (week 4 to about 9)' },
    actions: [
      {
        text: {
          id: 'Jarangkan bertahap (minggu 4-6, sekitar hari ke-45, terakhir sekitar hari ke-60) sampai 1 buah (paling banyak 2) per tangkai; buang buah kecil, cacat dan tidak simetris.',
          en: 'Thin in rounds (weeks 4-6, around day 45, last around day 60) down to 1 fruit (at most 2) per cluster; remove small, deformed and lopsided fruit.',
        },
        topic: 'fruit',
      },
      {
        text: {
          id: 'Sisakan buah sebanding daun: kira-kira 150-200 daun untuk satu buah 2 kg.',
          en: 'Keep fruit in proportion to leaves: roughly 150-200 leaves for one 2 kg fruit.',
        },
        topic: 'fruit',
      },
      {
        text: {
          id: 'Brongsong buah sekitar sebulan setelah bakal buah, paling lambat minggu ke-6, untuk mencegah penggerek buah dan biji.',
          en: 'Bag fruit about a month after set, by week 6 at the latest, to keep out fruit and seed borers.',
        },
        topic: 'pests',
      },
      {
        text: {
          id: 'Setelah penjarangan, isi "Perkiraan jumlah buah" per pohon; perkiraan panen memakai angka ini.',
          en: 'After thinning, fill in "Estimated fruit count" per tree; the harvest forecast uses it.',
        },
        topic: 'records',
      },
      {
        text: {
          id: 'Uji Musang King (Vietnam): semprot daun kalsium nitrat 0,4% sekitar 40 hari setelah bakal buah dan magnesium sulfat 0,2% sekitar 50 hari menaikkan hasil 8-12% dan mengurangi kelainan daging buah.',
          en: 'Musang King trial (Vietnam): foliar 0.4% calcium nitrate about 40 days after fruit set and 0.2% magnesium sulfate about 50 days raised yield 8-12% and reduced flesh disorders.',
        },
        topic: 'nutrition',
      },
    ],
  },
  grow: {
    title: { id: 'Buah membesar', en: 'Fruit growing' },
    when: { id: 'Hari 61 sampai sebulan sebelum panen', en: 'Day 61 until a month before harvest' },
    actions: [
      {
        text: {
          id: 'Pupuk kalium tinggi, nitrogen sedang; siram merata saat tidak hujan. Buah tumbuh paling cepat sampai sekitar minggu ke-13.',
          en: 'Potassium-rich feed, moderate nitrogen; water evenly when it does not rain. Fruit grows fastest until about week 13.',
        },
        topic: 'nutrition',
      },
      {
        text: {
          id: 'Cegah tunas daun baru selama buah tumbuh (jangan beri N tinggi atau air berlebihan).',
          en: 'Prevent a new leaf flush while fruit grows (no high N, no excess water).',
        },
        topic: 'nutrition',
      },
      {
        text: {
          id: 'Ikat tangkai buah ke cabang agar tidak patah oleh angin dan tidak jatuh ke tanah.',
          en: 'Tie fruit stalks to branches so wind does not snap them and fruit does not hit the ground.',
        },
        topic: 'harvest',
      },
      {
        text: {
          id: 'Saat musim hujan, periksa batang tiap minggu: bercak basah atau getah merah-cokelat = tanda kanker Phytophthora.',
          en: 'In wet weather, check trunks weekly: wet patches or red-brown ooze = Phytophthora canker.',
        },
        topic: 'phytophthora',
      },
    ],
  },
  mature: {
    title: { id: 'Menjelang matang', en: 'Maturing' },
    when: { id: 'Sebulan terakhir sebelum panen', en: 'Last month before harvest' },
    actions: [
      {
        text: {
          id: 'Periksa jeda sebelum panen (PHI) setiap semprotan; jangan semprot yang jedanya melewati tanggal panen.',
          en: "Check the pre-harvest interval (PHI) of every spray; don't apply one that runs past harvest.",
        },
        topic: 'pests',
      },
      {
        text: {
          id: 'Hujan 200 mm atau lebih saat buah matang menaikkan risiko daging basah dan matang tidak merata: jaga saluran air terbuka, jangan menyiram berlebihan.',
          en: '200 mm or more of rain while fruit matures raises wet-core and uneven-ripening risk: keep drains open, do not over-water.',
        },
        topic: 'water',
      },
      {
        text: {
          id: 'Hentikan pupuk nitrogen.',
          en: 'Stop nitrogen feeding.',
        },
        topic: 'nutrition',
      },
    ],
  },
  harvest: {
    title: { id: 'Panen', en: 'Harvest' },
    when: { id: 'Sekitar umur matang varietas', en: 'Around the variety’s ripening age' },
    actions: [
      {
        text: {
          id: 'Nilai kematangan dari umur buah sejak mekar dan bunyi ketukan (bunyi kopong); dua tanda ini paling andal.',
          en: 'Judge maturity by days since bloom and the tapping sound (hollow); these two signs are the most reliable.',
        },
        topic: 'harvest',
      },
      {
        text: {
          id: 'Kumpulkan buah jatuh setiap hari; jangan biarkan di tanah basah (busuk buah Phytophthora).',
          en: 'Collect dropped fruit daily; never leave it on wet ground (Phytophthora fruit rot).',
        },
        topic: 'phytophthora',
      },
      {
        text: {
          id: 'Untuk disimpan: Musang King jatuh matang tetap layak jual sampai 2 minggu pada 7 °C; pada 10-13 °C muncul busuk jamur dalam 1-2 minggu (MARDI).',
          en: 'For storage: mature-drop Musang King kept marketable quality up to 2 weeks at 7 °C; at 10-13 °C fungal rot appeared within 1-2 weeks (MARDI).',
        },
        topic: 'harvest',
      },
      {
        text: {
          id: 'Catat tanggal panen nyata per varietas lalu perbaiki "lama matang" di halaman Varietas. Angka kebun sendiri lebih tepat dari literatur.',
          en: "Note the real harvest date per variety, then correct 'ripening days' on the Variants page. Your farm's number beats the literature.",
        },
        topic: 'records',
      },
    ],
  },
  recovery: {
    title: { id: 'Pemulihan setelah panen', en: 'Post-harvest recovery' },
    when: { id: '2-3 bulan setelah panen', en: '2-3 months after harvest' },
    actions: [
      {
        text: {
          id: 'Pangkas cabang mati, saling silang, tunas air, dan cabang yang kurang dari 80-100 cm dari tanah.',
          en: 'Prune dead and crossing branches, water shoots, and branches within 80-100 cm of the ground.',
        },
        topic: 'canopy',
      },
      {
        text: {
          id: 'Pupuk untuk tunas daun (N + K), tambah bahan organik dan mulsa di bawah tajuk.',
          en: 'Feed for the leaf flush (N + K), add organic matter and mulch under the canopy.',
        },
        topic: 'nutrition',
      },
      {
        text: {
          id: 'Injeksi fosfonat ke batang saat pohon bertunas daun, pagi hari.',
          en: 'Inject phosphonate into the trunk during the leaf flush, in the morning.',
        },
        topic: 'phytophthora',
      },
      {
        text: {
          id: 'Setelah tunas daun tua dan sebelum berbunga: ambil contoh daun untuk analisis hara dan uji pH tanah.',
          en: 'Once the flush has hardened and before flowering: sample leaves for nutrient analysis and test soil pH.',
        },
        topic: 'nutrition',
      },
    ],
  },
};

export const STAGE_ORDER: StageId[] = ['preflower', 'bloom', 'set', 'thin', 'grow', 'mature', 'harvest', 'recovery'];

// ---------- fruit load (rule of thumb) ----------

/**
 * Typical upper fruit count by tree age for grafted trees: they start bearing at 4-6 years with 10-40 fruit,
 * about 100 by the 6th year of fruiting, up to 200 after the 10th (ITFNet / Rare Fruit Council of Australia).
 * Returns null when the tree is too young to judge or the age is unknown.
 */
export function typicalMaxFruit(ageYears: number): number | null {
  const fruitingYear = ageYears - 4 + 1;
  if (!Number.isFinite(fruitingYear) || fruitingYear < 1) return null;
  if (fruitingYear >= 10) return 200;
  if (fruitingYear >= 6) return Math.round(100 + ((fruitingYear - 6) * 100) / 4);
  return Math.round(40 + ((fruitingYear - 1) * 60) / 5);
}

export function treeAgeYears(tree: DurianTree, now = Date.now()): number | null {
  const planted = normalizeTimestamp(tree.datePlanted);
  if (!planted) return null;
  return (now - planted) / (365.25 * 24 * 60 * 60 * 1000);
}

export function overloadedTrees(trees: DurianTree[], now = Date.now()): Array<{ tree: DurianTree; max: number }> {
  const out: Array<{ tree: DurianTree; max: number }> = [];
  for (const tree of trees) {
    if (!tree.estimatedFruitCount) continue;
    const age = treeAgeYears(tree, now);
    const max = age === null ? null : typicalMaxFruit(age);
    if (max !== null && tree.estimatedFruitCount > max) out.push({ tree, max });
  }
  return out;
}

// ---------- farm checks ----------

export type CheckStatus = 'ok' | 'warn' | 'gap';

export type CheckAction =
  | { kind: 'link'; to: string; label: string }
  | { kind: 'template'; templateId: string; label: string };

export interface FarmCheck {
  id: string;
  topic: TopicId;
  status: CheckStatus;
  title: string;
  detail?: string;
  action?: CheckAction;
}

const planText = (p: TreatmentPlan) => `${p.name} ${p.product || ''} ${p.notes || ''} ${p.stage || ''}`.toLowerCase();
const PHOSPHONATE_RE = /fosfonat|fosfit|phosphon|phosphit|phytophthora|fitoftora/;
// Not "SOP" (sulfate of potash): in Indonesian it usually means a standard procedure.
const POTASSIUM_RE = /kalium|potas|\bkcl\b|k2so4|kno3|\bzk\b|\bmop\b/;
const CALCIUM_BORON_RE = /boron|solubor|borat|borax|kalsium|calcium|ca\(no3\)2/;
const MUSANG_KING_RE = /musang|\bmk\b|d197/i;
const LEAF_TEST_RE = /analisis daun|analisa daun|uji daun|contoh daun|leaf analysis|leaf sampl|leaf test|uji tanah|ph tanah|soil test|soil ph/;

/** Count text: uses the `.one` variant of the key when n is 1 ("1 tree", not "1 trees"). */
export const tn = (key: string, n: number, vars: Record<string, string | number> = {}) =>
  translate(n === 1 ? `${key}.one` : key, { n, ...vars });

const listBlocks = (bs: string[]) => bs.map((b) => translate('common.blockN', { n: b })).join(', ');

export interface CheckInput {
  trees: DurianTree[];
  variants: DurianVariant[];
  plans: TreatmentPlan[];
  scheduleTasks: ScheduleTask[];
  seasons: BlockSeason[];
  now?: number;
}

/** Best practice vs what this farm records and schedules. Most urgent first. */
export function buildChecks({ trees, variants, plans, scheduleTasks, seasons, now = Date.now() }: CheckInput): FarmCheck[] {
  const t = translate;
  const checks: FarmCheck[] = [];
  const active = plans.filter((p) => p.active);

  // 1. Flowering date per block: every stage, harvest date and action on the Guide depends on it.
  const noDate = seasons.filter((s) => !s.floweredOn).map((s) => s.block);
  const outdated = seasons.filter((s) => s.outdated).map((s) => s.block);
  checks.push(
    noDate.length + outdated.length > 0
      ? {
          id: 'flowerDates',
          topic: 'records',
          status: 'gap',
          title: tn('guide.chk.flower.gap', noDate.length + outdated.length),
          detail: [
            noDate.length ? t('guide.chk.flower.none', { blocks: listBlocks(noDate) }) : '',
            outdated.length ? t('guide.chk.flower.old', { blocks: listBlocks(outdated) }) : '',
          ]
            .filter(Boolean)
            .join(' '),
          action: { kind: 'link', to: '/schedule?view=harvest', label: t('guide.act.setFlowering') },
        }
      : { id: 'flowerDates', topic: 'records', status: 'ok', title: t('guide.chk.flower.ok') }
  );

  // 2. Ripening days per variant in use.
  const usedCodes = new Set(trees.map((x) => x.variant).filter(Boolean));
  const noRipening = variants.filter((v) => usedCodes.has(v.code) && !(Number(v.ripeningDays) > 0));
  checks.push(
    noRipening.length
      ? {
          id: 'ripening',
          topic: 'harvest',
          status: 'gap',
          title: tn('guide.chk.ripening.gap', noRipening.length),
          detail: t('guide.chk.ripening.detail', { names: noRipening.map((v) => v.name).join(', '), d: DEFAULT_RIPENING_DAYS }),
          action: {
            kind: 'link',
            // One missing: open that variant's form directly.
            to: noRipening.length === 1 ? `/variants?edit=${encodeURIComponent(noRipening[0].code)}` : '/variants',
            label: t('guide.act.openVariants'),
          },
        }
      : { id: 'ripening', topic: 'harvest', status: 'ok', title: t('guide.chk.ripening.ok') }
  );

  // 2b. Trees whose variant code has no variants/{code} record: no ripening days, harvest date or stage for them.
  const knownCodes = new Set(variants.map((v) => v.code));
  const unknownCodes = Array.from(new Set(trees.map((x) => x.variant).filter((c) => c && !knownCodes.has(c)))).sort();
  if (unknownCodes.length) {
    checks.push({
      id: 'unknownVariants',
      topic: 'records',
      status: 'gap',
      title: tn('guide.chk.unknownVar.gap', unknownCodes.length),
      detail: t('guide.chk.unknownVar.detail', { codes: unknownCodes.join(', ') }),
      action: {
        kind: 'link',
        to: unknownCodes.length === 1 ? `/variants?new=${encodeURIComponent(unknownCodes[0])}` : '/variants',
        label: t('guide.act.openVariants'),
      },
    });
  }

  // 3. Overdue routine work.
  const overdue = scheduleTasks.filter((x) => x.status === 'overdue');
  if (overdue.length) {
    checks.push({
      id: 'overdue',
      topic: 'records',
      status: 'gap',
      title: tn('guide.chk.overdue', overdue.length),
      detail: overdue.slice(0, 3).map((x) => x.plan.name).join(', '),
      action: { kind: 'link', to: '/schedule', label: t('guide.act.openSchedule') },
    });
  }

  // 4. Sick trees waiting too long for a re-check.
  const followUps = trees.filter((x) => followUpOf(x, normalizeTimestamp(x.lastReportAt), now).needs);
  if (followUps.length) {
    checks.push({
      id: 'followUp',
      topic: 'phytophthora',
      status: 'gap',
      title: tn('guide.chk.followUp', followUps.length),
      detail: t('guide.chk.followUp.detail'),
      action: { kind: 'link', to: '/trees?followup=1', label: t('guide.act.showTrees') },
    });
  }

  // 5. Disease prevention routine (phosphonate).
  const hasPhosphonate = active.some((p) => PHOSPHONATE_RE.test(planText(p)));
  checks.push(
    hasPhosphonate
      ? { id: 'phosphonate', topic: 'phytophthora', status: 'ok', title: t('guide.chk.phos.ok') }
      : {
          id: 'phosphonate',
          topic: 'phytophthora',
          status: 'gap',
          title: t('guide.chk.phos.gap'),
          detail: t('guide.chk.phos.detail'),
          action: { kind: 'template', templateId: 'phosphonate', label: t('guide.act.addRoutine') },
        }
  );

  // 6. Feeding routines.
  const fert = active.filter((p) => p.type === 'fertilizer');
  if (fert.length === 0) {
    checks.push({
      id: 'fertilizer',
      topic: 'nutrition',
      status: 'gap',
      title: t('guide.chk.fert.gap'),
      detail: t('guide.chk.fert.detail'),
      action: { kind: 'link', to: '/schedule?view=routines', label: t('guide.act.openRoutines') },
    });
  } else if (!fert.some((p) => POTASSIUM_RE.test(planText(p)))) {
    checks.push({
      id: 'fertilizer',
      topic: 'nutrition',
      status: 'warn',
      title: t('guide.chk.fertK.warn'),
      detail: t('guide.chk.fertK.detail'),
      action: { kind: 'template', templateId: 'fruit', label: t('guide.act.addRoutine') },
    });
  } else {
    checks.push({ id: 'fertilizer', topic: 'nutrition', status: 'ok', title: tn('guide.chk.fert.ok', fert.length) });
  }

  // 7. Measure instead of guess: yearly leaf + soil analysis.
  const hasLeafTest = active.some((p) => LEAF_TEST_RE.test(planText(p)));
  checks.push(
    hasLeafTest
      ? { id: 'leafTest', topic: 'nutrition', status: 'ok', title: t('guide.chk.leaf.ok') }
      : {
          id: 'leafTest',
          topic: 'nutrition',
          status: 'warn',
          title: t('guide.chk.leaf.warn'),
          detail: t('guide.chk.leaf.detail'),
          action: { kind: 'template', templateId: 'leafSoil', label: t('guide.act.addRoutine') },
        }
  );

  // 7b. Calcium + boron sprays around flowering and fruit set (fruit set, flesh disorders).
  const hasCaB = active.some((p) => CALCIUM_BORON_RE.test(planText(p)));
  checks.push(
    hasCaB
      ? { id: 'calciumBoron', topic: 'nutrition', status: 'ok', title: t('guide.chk.cab.ok') }
      : {
          id: 'calciumBoron',
          topic: 'nutrition',
          status: 'warn',
          title: t('guide.chk.cab.warn'),
          detail: t('guide.chk.cab.detail'),
          action: { kind: 'template', templateId: 'flowerFoliar', label: t('guide.act.addRoutine') },
        }
  );

  // 8. Pruning.
  const hasPruning = active.some((p) => p.type === 'pruning');
  checks.push(
    hasPruning
      ? { id: 'pruning', topic: 'canopy', status: 'ok', title: t('guide.chk.prune.ok') }
      : {
          id: 'pruning',
          topic: 'canopy',
          status: 'warn',
          title: t('guide.chk.prune.warn'),
          detail: t('guide.chk.prune.detail'),
          action: { kind: 'template', templateId: 'skirtPrune', label: t('guide.act.addRoutine') },
        }
  );

  // 9. Cross-pollination: a block with a single variety relies on that variety being self-compatible.
  const single = seasons.filter((s) => s.variants.length === 1);
  if (single.length) {
    checks.push({
      id: 'crossPollination',
      topic: 'pollination',
      status: 'warn',
      title: tn('guide.chk.pollin.warn', single.length),
      detail: [
        t('guide.chk.pollin.detail', { blocks: listBlocks(single.map((s) => s.block)) }),
        // Musang King has direct evidence: self-incompatible, best set when crossed with D24.
        single.some((s) => {
          const v = variants.find((x) => x.code === s.variants[0]);
          return MUSANG_KING_RE.test(`${v?.name || ''} ${s.variants[0]}`);
        })
          ? t('guide.chk.pollin.mk')
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      action: { kind: 'link', to: '/guide/pollination', label: t('guide.act.readTopic') },
    });
  }

  // 10. Fruit counts in blocks that are past thinning (the harvest forecast needs them).
  const fruitStages: StageId[] = ['thin', 'grow', 'mature', 'harvest'];
  const fruitBlocks = new Set(seasons.filter((s) => fruitStages.includes(s.stage) && !s.outdated).map((s) => s.block));
  const noCount = trees.filter((x) => fruitBlocks.has(x.block) && x.estimatedFruitCount === undefined);
  if (noCount.length) {
    const blocks = Array.from(new Set(noCount.map((x) => x.block)));
    checks.push({
      id: 'fruitCounts',
      topic: 'fruit',
      status: 'warn',
      title: tn('guide.chk.fruitCount.warn', noCount.length),
      detail: t('guide.chk.fruitCount.detail', { blocks: listBlocks(blocks) }),
      action: {
        kind: 'link',
        to: `/trees?missing=fruit${blocks.length === 1 ? `&block=${encodeURIComponent(blocks[0])}` : ''}`,
        label: t('guide.act.showTrees'),
      },
    });
  }

  // 11. Trees carrying more fruit than is typical for their age.
  const heavy = overloadedTrees(trees, now);
  if (heavy.length) {
    checks.push({
      id: 'fruitLoad',
      topic: 'fruit',
      status: 'warn',
      title: tn('guide.chk.load.warn', heavy.length),
      detail: t('guide.chk.load.detail', { ids: heavy.slice(0, 6).map((h) => h.tree.id).join(', ') }),
      action: { kind: 'link', to: '/guide/fruit', label: t('guide.act.readTopic') },
    });
  }

  // 12. Basic measurements.
  const notAssessed = trees.filter((x) => x.condition === 'not_assessed');
  if (notAssessed.length) {
    checks.push({
      id: 'assessed',
      topic: 'records',
      status: 'warn',
      title: tn('guide.chk.assessed.warn', notAssessed.length),
      action: { kind: 'link', to: '/trees?condition=not_assessed', label: t('guide.act.showTrees') },
    });
  }
  const noSize = trees.filter((x) => x.trunkSize === undefined || x.canopySize === undefined || x.canopySize === '');
  if (noSize.length) {
    checks.push({
      id: 'sizes',
      topic: 'records',
      status: 'warn',
      title: tn('guide.chk.size.warn', noSize.length),
      detail: t('guide.chk.size.detail'),
      action: { kind: 'link', to: '/trees?missing=size', label: t('guide.act.showTrees') },
    });
  }

  // 13. Regular inspection (Phytophthora is cheapest to stop early).
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const unchecked = trees.filter((x) => normalizeTimestamp(x.lastReportAt) < weekAgo);
  if (trees.length && unchecked.length / trees.length > 0.5) {
    checks.push({
      id: 'inspection',
      topic: 'phytophthora',
      status: 'warn',
      title: t('guide.chk.inspect.warn', { n: unchecked.length, total: trees.length }),
      detail: t('guide.chk.inspect.detail'),
      action: { kind: 'link', to: '/trees?stale=1', label: t('guide.act.showTrees') },
    });
  }

  const order: Record<CheckStatus, number> = { gap: 0, warn: 1, ok: 2 };
  return checks.sort((a, b) => order[a.status] - order[b.status]);
}

// ---------- variety references ----------

/** Published days from bloom to maturity. Used to sanity-check the farm's own ripening days. */
export interface RipeningRef {
  match: RegExp;
  min: number;
  max: number;
  note: L;
}

export const RIPENING_REFS: RipeningRef[] = [
  {
    match: MUSANG_KING_RE,
    min: 105,
    max: 120,
    note: {
      id: 'MARDI: hanya buah yang dipetik 15 minggu (±105 hari) setelah mekar yang kadar bahan keringnya setara buah jatuh matang. Univ. Brawijaya: rata-rata 118 hari.',
      en: 'MARDI: only fruit picked 15 weeks (~105 days) after bloom matched the dry matter of naturally dropped fruit. Brawijaya Univ.: 118 days on average.',
    },
  },
  {
    match: /bawor|\bbw\b/i,
    min: 120,
    max: 140,
    note: {
      id: 'Bisa dipanen mulai hari ke-120; matang sempurna 130-140 hari setelah mekar.',
      en: 'Harvestable from day 120; fully ripe at 130-140 days after bloom.',
    },
  },
  {
    match: /mon ?thong|montong/i,
    min: 120,
    max: 130,
    note: {
      id: '115-120 hari dari bakal buah; termasuk varietas lambat.',
      en: '115-120 days from fruit set; a late variety.',
    },
  },
];

export function ripeningRefFor(v: DurianVariant): RipeningRef | undefined {
  return RIPENING_REFS.find((r) => r.match.test(`${v.name} ${v.code}`));
}
