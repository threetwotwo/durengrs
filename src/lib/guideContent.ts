import type { L, TopicId } from './guide';

/**
 * Research notes behind the Guide tab. Each number has a source listed with its topic.
 *
 * Confidence:
 *   strong   several independent sources agree
 *   study    one field study or trial; true there, may differ here
 *   rule     grower rule of thumb from extension material; use as a starting point
 *
 * Open questions are what the literature cannot answer for this farm; the farm's own notes answer them.
 */

export type Confidence = 'strong' | 'study' | 'rule';

export interface Target {
  label: L;
  value: L;
  confidence: Confidence;
}

export interface Section {
  heading: L;
  points: L[];
}

export interface Source {
  title: string;
  url: string;
}

export interface TopicContent {
  targets: Target[];
  sections: Section[];
  questions: L[];
  /** Routine templates (lib/treatments PLAN_TEMPLATE_BY_ID) that put this topic into practice. */
  templates?: string[];
  related: TopicId[];
  sources: Source[];
}

const S = {
  itfBiology: { title: 'ITFNet: Durian biology and ecology', url: 'http://itfnet.org/gfruit/Templates%20English/durian.biology.htm' },
  itfPreHarvest: { title: 'ITFNet: Durian pre-harvest practices', url: 'http://www.itfnet.org/gfruit/Templates%20English/durian.harv.pre.htm' },
  itfFlower: { title: 'ITFNet: Durian flowering and fruiting', url: 'http://www.itfnet.org/gfruit/Templates%20English/durian.flower.fruit.htm' },
  itfPost: { title: 'ITFNet: Durian harvest and post-harvest', url: 'http://www.itfnet.org/gfruit/Templates%20English/durian.harv.post.htm' },
  drySpell: {
    title: 'Dry spells trigger durian flowering in aseasonal tropics (Int. J. Biometeorology, 2024)',
    url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11785592/',
  },
  mkDevelopment: {
    title: 'Fruit development and physiological disorders of Musang King durian (Open Agriculture, 2025)',
    url: 'https://www.degruyterbrill.com/document/doi/10.1515/opag-2025-0422/html?lang=en',
  },
  pbzMulch: {
    title: 'Paclobutrazol and soil mulching on flower induction in durian (JARQ 58/2)',
    url: 'https://www.jstage.jst.go.jp/article/jarq/58/2/58_121/_article/-char/en',
  },
  pbzJuvenile: {
    title: "Paclobutrazol on flowering of juvenile 'Monthong' durian (IJAT 18/5, 2022)",
    url: 'https://li04.tci-thaijo.org/index.php/IJAT/article/view/8731',
  },
  pollinationEcology: {
    title: 'Pollination ecology of durian in southern Thailand (J. Tropical Ecology)',
    url: 'https://www.researchgate.net/publication/231795180_The_pollination_ecology_of_durian_Durio_zibethinus_Bombacaceae_in_southern_Thailand',
  },
  batReview: {
    title: 'A review of durian plant-bat pollinator interactions (J. Plant Interactions, 2022)',
    url: 'https://www.tandfonline.com/doi/pdf/10.1080/17429145.2021.2015466',
  },
  incompatibility: {
    title: 'Durian flowering, pollination and incompatibility studies',
    url: 'https://www.researchgate.net/publication/228014258_Durian_flowering_pollination_and_incompatibility_studies',
  },
  thinning: {
    title: 'Yield and harvest quality of thinned durian',
    url: 'https://pdfs.semanticscholar.org/7bd9/52a6176a74af99d7997dda5c12c47edf1528.pdf',
  },
  botanyReview: {
    title: 'The Durian: Botany, Horticulture, and Utilization (Horticultural Reviews)',
    url: 'https://www.researchgate.net/publication/337299356_The_Durian_Botany_Horticulture_and_Utilization',
  },
  rfcaFactsheet: {
    title: 'Rare Fruit Council of Australia: Durian factsheet no. 6',
    url: 'https://gms.ctahr.hawaii.edu/gs/handler/getmedia.ashx?moid=3036&dt=3&g=12',
  },
  leafStandards: {
    title: 'Development of leaf nutrient concentration standards for durian',
    url: 'https://www.researchgate.net/publication/289652218_DEVELOPMENT_OF_LEAF_NUTRIENT_CONCENTRATION_STANDARDS_FOR_DURIAN',
  },
  dris: {
    title: 'DRIS nutritional balance of durian, Mekong Delta (Horticulturae, 2024)',
    url: 'https://www.mdpi.com/2311-7524/10/6/561',
  },
  organicFoliar: {
    title: 'Organic and foliar fertilization to mitigate durian fruit disorders (2025)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12030457/',
  },
  caMg: {
    title: 'Calcium nitrate and magnesium sulfate on Musang King fruit disorders (Sci. World J., 2026)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13424451/',
  },
  phenologyPhos: {
    title: 'Durian tree phenology and phytophthora control using phosphonate trunk injection (ACIAR / DPI Qld)',
    url: 'https://era.dpi.qld.gov.au/id/eprint/10665/',
  },
  ipmPhytophthora: {
    title: 'Integrated management of phytophthora diseases of durian (ACIAR / DPI Qld)',
    url: 'https://era.dpi.qld.gov.au/id/eprint/10666/',
  },
  aciar114: {
    title: 'Diversity and Management of Phytophthora in Southeast Asia (ACIAR Monograph 114)',
    url: 'https://forestphytophthoras.org/sites/default/files/educational_materials/Drenth%20Diversity%20and%20management%20of%20Phytophthora%20in%20SE%20Asia.pdf',
  },
  plantwise: {
    title: 'Plantwise: Phytophthora palmivora (root rot, stem rot, fruit rot)',
    url: 'https://plantwiseplusknowledgebank.org/doi/full/10.1079/pwkb.20187800447',
  },
  conogethes: {
    title: 'Status and management of Conogethes spp. in Malaysia',
    url: 'https://www.researchgate.net/publication/327692646_Status_and_Management_of_Conogethes_spp_in_Malaysia',
  },
  seedBorer: {
    title: 'Fruit bagging time for preventing durian seed borer (Mudaria luteileprosa)',
    url: 'https://agris.fao.org/agris-search/search.do?recordID=TH2001002001',
  },
  ucdavis: { title: 'UC Davis Postharvest: Durian', url: 'https://postharvest.ucdavis.edu/produce-facts-sheets/durian' },
  paullKetsa: {
    title: 'Paull & Ketsa: Durian (USDA Handbook 66 chapter)',
    url: 'https://www.doc-developpement-durable.org/file/Culture/Arbres-Fruitiers/FICHES_ARBRES/Durian/durian3.pdf',
  },
  umurPanen: {
    title: 'Kajian umur panen buah pada beberapa jenis durian (Univ. Brawijaya)',
    url: 'https://protan.studentjournal.ub.ac.id/index.php/protan/article/view/1551',
  },
  bawor: {
    title: 'Kompas: Cara menanam durian Bawor',
    url: 'https://agri.kompas.com/read/2022/09/18/101900384/cara-menanam-durian-bawor-varietas-durian-unggul-lokal?page=all',
  },
  sopIpb: {
    title: 'Panduan ringkas SOP budidaya durian (Mitra Pengembangan Buah Nusantara / IPB)',
    url: 'https://botaniseedipb.com/wp-content/uploads/2024/12/E-book-durian.pdf',
  },
  topFruitsHarvest: { title: 'Top Fruits Malaysia: Durian harvesting', url: 'https://topfruits.com.my/durian-harvesting/' },
  mkPollination: {
    title: 'Evaluation on durian var. Musang King pollination compatibility regarding high fruit set (Pertanika JTAS, 2022)',
    url: 'https://www.researchgate.net/publication/360564076_Evaluation_on_Durian_var_Musang_King_Pollination_Compatibility_Regarding_High_Fruit_Set',
  },
  mkHarvestAge: {
    title: 'Postharvest behaviour of Musang King (D197) harvested at different times after anthesis (MARDI JTAFS, 2024)',
    url: 'http://jtafs.mardi.gov.my/index.php/publication/jtafs-issues/issues/200-2024/vol-52-no-2/370-postharvest-behaviour-of-musang-king-d197-durian-fruits-harvested-at-different-time-intervals-after-anthesis',
  },
  mkStorage: {
    title: 'Optimum storage temperature of mature-drop Musang King durian (IJAFP, 2020)',
    url: 'https://www.researchgate.net/publication/345974957_OPTIMUM_STORAGE_TEMPERATURE_OF_MATURE_DROP_DURIAN_DURIO_ZIBETHINUS_CV_MUSANG_KING',
  },
  boron: { title: 'U.S. Borax crop guide: Boron deficiency symptoms in durian', url: 'https://agriculture.borax.com/crop-guides/fruit-and-nut-crops/durian' },
  soilMekong: {
    title: 'Fertilizer practices and soil properties in fruit-bearing durian orchards, Tien Giang (J. Agric. Development)',
    url: 'https://jad.hcmuaf.edu.vn/index.php/jad/article/view/1176',
  },
  diseaseDataset: {
    title: 'Image dataset of ten durian diseases from a Vinh Long orchard, Vietnam (Data in Brief, 2025)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12670932/',
  },
  durianDiseasesCabi: { title: 'Diseases of durian (CABI, Diseases of Tropical Fruit Crops)', url: 'https://www.cabidigitallibrary.org/doi/abs/10.1079/9780851993904.0241' },
  topFruitsDiseases: { title: 'Top Fruits Malaysia: Durian diseases and pests', url: 'https://topfruits.com.my/durian-diseases-and-pests-how-to-prevent/' },
  qldDecline: {
    title: 'Phytophthora diseases of durian and durian-decline syndrome in northern Queensland (ACIAR Monograph 114, ch. 6.6)',
    url: 'https://era.dpi.qld.gov.au/id/eprint/10667/1/Phytophthora%20diseases%20of%20durian,%20and%20durian-decline%20syndrome%20in%20northern%20Queensland,%20Australia.pdf',
  },
  kementanPests: { title: 'Kementan Cybex: Hama penting tanaman durian', url: 'http://cybex.pertanian.go.id/mobile/artikel/50490/HAMA-PENTING-TANAMAN-DURIAN-King-Of-Fruit/' },
  cropsReview: { title: 'Crops Review: How-to guide in growing durian', url: 'https://www.cropsreview.com/durian/' },
  bordeaux: { title: 'Bordeaux paste and paint as a fungicide for pruning cuts (Indian Farmer, 2021)', url: 'https://indianfarmer.net/uploads/1_7_2021.pdf' },
  patchCankerMy: {
    title: 'Chemical control of Phytophthora patch canker of durian (Malaysia, AGRIS)',
    url: 'https://agris.fao.org/search/en/providers/123819/records/64735f8953aa8c89630a4c77',
  },
  cropCycle: { title: 'Durian Info: crop production cycle and orchard management practices', url: 'http://durianinfo.blogspot.com/p/durian-crop-production-cycle.html' },
} satisfies Record<string, Source>;

export const TOPIC_CONTENT: Record<TopicId, TopicContent> = {
  site: {
    targets: [
      { label: { id: 'Suhu', en: 'Temperature' }, value: { id: '24-30 °C; pertumbuhan berhenti bila rata-rata harian di bawah 22 °C', en: '24-30 °C; growth stops when the daily average falls below 22 °C' }, confidence: 'strong' },
      { label: { id: 'Kelembapan udara', en: 'Humidity' }, value: { id: '75-80%', en: '75-80%' }, confidence: 'rule' },
      { label: { id: 'Curah hujan', en: 'Rainfall' }, value: { id: '1.500 mm/tahun atau lebih, merata; 1.500-2.000 mm paling cocok', en: '1,500 mm/year or more, well spread; 1,500-2,000 mm suits best' }, confidence: 'strong' },
      { label: { id: 'Masa kering', en: 'Dry spell' }, value: { id: 'Singkat (sekitar 2 minggu) untuk memicu bunga; kemarau panjang merugikan', en: 'Short (about 2 weeks) to trigger flowers; long droughts hurt' }, confidence: 'strong' },
      { label: { id: 'pH tanah', en: 'Soil pH' }, value: { id: '5,5-6,5 (masih tumbuh di 5,0-7,0)', en: '5.5-6.5 (tolerates 5.0-7.0)' }, confidence: 'strong' },
      { label: { id: 'Tanah', en: 'Soil' }, value: { id: 'Lempung dalam, gembur, kaya bahan organik, tidak pernah tergenang', en: 'Deep loam, rich in organic matter, never waterlogged' }, confidence: 'strong' },
      { label: { id: 'Akar penyerap', en: 'Feeder roots' }, value: { id: 'Dangkal, sebagian besar di 30 cm teratas', en: 'Shallow, mostly in the top 30 cm' }, confidence: 'rule' },
      { label: { id: 'Pembanding uji tanah', en: 'Soil test reference' }, value: { id: 'Kebun durian berbuah di Vietnam: bahan organik 1,4-3,8%, Ca 5,5-9,5 dan Mg 1,7-3,7 meq/100 g, KTK 11,6-19,8 (nilai yang diamati, bukan target)', en: 'Bearing durian orchards in Vietnam: organic matter 1.4-3.8%, Ca 5.5-9.5 and Mg 1.7-3.7 meq/100 g, CEC 11.6-19.8 (observed values, not targets)' }, confidence: 'study' },
    ],
    sections: [
      {
        heading: { id: 'Kenapa penting', en: 'Why it matters' },
        points: [
          { id: 'Durian berasal dari hutan hujan. Akarnya dangkal dan bekerja sama dengan jamur mikoriza di lapisan serasah yang kaya bahan organik.', en: 'Durian comes from rainforest. Its roots are shallow and work with mycorrhizal fungi in an organic leaf-litter layer.' },
          { id: 'Akar sangat peka terhadap air yang menggenang: tanah becek adalah pintu masuk utama busuk akar Phytophthora.', en: 'Roots are very sensitive to standing water: soggy soil is the main entry point for Phytophthora root rot.' },
          { id: 'Tanah gundul di bawah tajuk membuat akar permukaan terkena panas matahari dan mematikan mikoriza.', en: 'Bare soil under the canopy exposes surface roots to sun and kills the mycorrhiza.' },
          { id: 'Angin kencang membuat buah rontok dan cabang patah.', en: 'Strong wind makes fruit drop and branches break.' },
        ],
      },
      {
        heading: { id: 'Yang bisa dilakukan', en: 'What you can do' },
        points: [
          { id: 'Uji pH tanah tiap blok setahun sekali. Bila di bawah 5,5, beri kapur pertanian sesuai saran lab, biasanya setelah panen.', en: 'Test soil pH in each block once a year. Below 5.5, lime as the lab advises, usually after harvest.' },
          { id: 'Di kebun yang diteliti, bahan organik tanah tetap rendah walau petani rutin memberi pupuk kandang; ukur, jangan anggap cukup.', en: 'In the orchards studied, soil organic matter stayed low even with regular manure; measure it rather than assume.' },
          { id: 'Buat dan rawat saluran pembuangan; amati blok mana yang masih tergenang sehari setelah hujan lebat.', en: 'Build and keep drains clear; note which blocks still have standing water a day after heavy rain.' },
          { id: 'Beri mulsa (jerami, serasah, pupuk kandang) di bawah tajuk sampai batas tetes, tapi jauhkan dari pangkal batang.', en: 'Mulch (straw, leaf litter, manure) under the canopy to the drip line, but keep it away from the trunk base.' },
          { id: 'Pasang penakar hujan sederhana dan catat hujan harian. Data ini menjelaskan waktu berbunga, buah rontok, dan daging basah.', en: 'Put up a simple rain gauge and log daily rain. It explains flowering time, fruit drop and wet core.' },
        ],
      },
    ],
    questions: [
      { id: 'Berapa pH tanah di tiap blok?', en: 'What is the soil pH in each block?' },
      { id: 'Blok mana yang tergenang setelah hujan lebat?', en: 'Which blocks hold water after heavy rain?' },
      { id: 'Bulan apa biasanya kering di kebun ini, dan berapa lama?', en: 'Which months are usually dry on this farm, and for how long?' },
    ],
    templates: ['leafSoil'],
    related: ['water', 'phytophthora', 'nutrition'],
    sources: [S.itfBiology, S.rfcaFactsheet, S.organicFoliar, S.soilMekong, S.sopIpb],
  },

  planting: {
    targets: [
      { label: { id: 'Jarak tanam', en: 'Spacing' }, value: { id: '8-12 m; 10 × 10 m = 100 pohon/ha, 9 × 9 m ≈ 123 pohon/ha', en: '8-12 m; 10 × 10 m = 100 trees/ha, 9 × 9 m ≈ 123 trees/ha' }, confidence: 'strong' },
      { label: { id: 'Lubang tanam', en: 'Planting hole' }, value: { id: 'Paling sedikit 50 cm dalam dan lebar', en: 'At least 50 cm deep and wide' }, confidence: 'rule' },
      { label: { id: 'Naungan', en: 'Shade' }, value: { id: 'Naungi bibit baru sampai benar-benar tumbuh', en: 'Shade new plants until they are established' }, confidence: 'rule' },
      { label: { id: 'Mulai berbuah', en: 'First fruit' }, value: { id: 'Okulasi/sambung 4-6 tahun; dari biji 8-15 tahun', en: 'Grafted 4-6 years; from seed 8-15 years' }, confidence: 'strong' },
      { label: { id: 'Batang bawah', en: 'Rootstock' }, value: { id: 'Belum ada yang terbukti tahan Phytophthora; Chanee dipakai di Thailand karena dianggap lebih toleran', en: 'None proven resistant to Phytophthora; Thailand uses Chanee for its perceived tolerance' }, confidence: 'study' },
    ],
    sections: [
      {
        heading: { id: 'Menanam', en: 'Planting' },
        points: [
          { id: 'Jarak rapat memberi hasil awal lebih banyak per hektar, tapi pohon perlu dijarangkan setelah 8-10 tahun.', en: 'Close spacing gives more early yield per hectare, but trees need thinning out after 8-10 years.' },
          { id: 'Lindungi dari angin kencang dengan pemecah angin alami atau buatan.', en: 'Protect from strong wind with natural or artificial windbreaks.' },
          { id: 'Di kebun muda, lahan antar baris bisa ditanami pisang, pepaya atau tanaman semusim; durian juga sering ditanam di bawah kelapa.', en: 'In a young orchard the space between rows can carry banana, papaya or annual crops; durian is also commonly grown under coconut.' },
          { id: 'Di persemaian, mati pucuk bibit karena Phytophthora bisa mencapai 50% bila kebersihan buruk; infeksi sering mulai di batang muda atau di sambungan. Beli bibit sehat dan periksa sambungannya.', en: 'In nurseries, Phytophthora seedling dieback can reach 50% losses where hygiene is poor; infection often starts at the young stem or the graft union. Buy healthy plants and check the union.' },
        ],
      },
      {
        heading: { id: 'Pohon muda (sebelum berbuah)', en: 'Young trees (before bearing)' },
        points: [
          { id: 'Tahun 1-5 pohon membangun kerangka cabang. Bentuk tajuk sejak tahun pertama (lihat Pemangkasan & tajuk).', en: 'In years 1-5 the tree builds its branch framework. Shape the canopy from the first year (see Pruning & canopy).' },
          { id: 'Pohon bertajuk rendah mulai berbuah setahun lebih cepat dan hasilnya hampir dua kali lipat (satu studi).', en: 'Low-headed trees start fruiting a year earlier and yield nearly twice as much (one study).' },
          { id: 'Mulsa dan bahan organik di zona akar sejak awal membangun lapisan serasah yang dibutuhkan akar durian.', en: 'Mulch and organic matter in the root zone from the start build the leaf-litter layer durian roots need.' },
          { id: 'Celah pengetahuan: tidak ditemukan pedoman terbitan kapan bunga pertama pada pohon muda sebaiknya dibuang. Catat pengalaman kebun ini.', en: 'Knowledge gap: no published guidance found on when to remove first flowers from young trees. Record this farm\u2019s experience.' },
        ],
      },
    ],
    questions: [
      { id: 'Berapa jarak tanam di tiap blok, dan apakah tajuk sudah saling menutup?', en: 'What is the spacing in each block, and do canopies already touch?' },
      { id: 'Bibit dari pemasok mana yang tumbuh paling baik dan paling jarang sakit?', en: 'Which supplier\u2019s plants grew best and got sick least?' },
      { id: 'Apakah membiarkan pohon muda berbuah memperlambat pertumbuhannya di kebun ini?', en: 'Does letting young trees fruit slow their growth on this farm?' },
    ],
    related: ['canopy', 'site', 'phytophthora'],
    sources: [S.cropsReview, S.itfBiology, S.rfcaFactsheet, S.qldDecline, S.sopIpb],
  },

  flowering: {
    targets: [
      { label: { id: 'Pemicu bunga', en: 'Flower trigger' }, value: { id: 'Sekitar 15 hari hampir tanpa hujan (rata-rata 15 hari < 1 mm/hari)', en: 'About 15 days with almost no rain (15-day average < 1 mm/day)' }, confidence: 'study' },
      { label: { id: 'Dari masa kering ke mekar', en: 'Dry spell to bloom' }, value: { id: 'Sekitar 50 hari', en: 'About 50 days' }, confidence: 'study' },
      { label: { id: 'Dari kuncup muncul ke mekar', en: 'Bud emergence to bloom' }, value: { id: 'Sekitar 49 hari (Musang King)', en: 'About 49 days (Musang King)' }, confidence: 'study' },
      { label: { id: 'Lama satu pohon berbunga', en: 'Bloom period of one tree' }, value: { id: 'Sekitar 7 hari, puncak di hari ke-3', en: 'About 7 days, peak on day 3' }, confidence: 'study' },
      { label: { id: 'Syarat daun', en: 'Leaf condition' }, value: { id: 'Tunas daun terakhir sudah tua (hijau gelap, umur 2-3 bulan)', en: 'Last leaf flush hardened (dark green, 2-3 months old)' }, confidence: 'strong' },
    ],
    sections: [
      {
        heading: { id: 'Bagaimana bunga dipicu', en: 'How flowering is triggered' },
        points: [
          { id: 'Masa kering singkat adalah pemicu utama. Pengamatan 110 pohon: bunga pertama memuncak sekitar 50 hari setelah rata-rata hujan 15 hari turun di bawah 1 mm, baik pohon okulasi maupun dari biji.', en: 'A short dry spell is the main trigger. Observing 110 trees: first bloom peaked about 50 days after the 15-day rainfall average fell below 1 mm, for grafted and seedling trees alike.' },
          { id: 'Pohon hanya berbunga dari daun yang sudah tua. Tunas daun baru tepat sebelum musim kering akan menunda atau menggagalkan bunga.', en: 'Trees only flower from mature leaves. A new leaf flush just before the dry season delays or prevents flowering.' },
          { id: 'Durian bertunas daun 2-5 kali setahun. Pola umum: setelah panen dorong 2 kali tunas daun; sekitar 2 bulan sebelum musim bunga, pupuk untuk mematangkan daun yang ada dan mencegah tunas baru.', en: 'Durian flushes 2-5 times a year. A common pattern: push 2 leaf flushes after harvest; about 2 months before the flowering season, feed to mature the existing leaves and prevent new flushes.' },
          { id: 'Tahap kuncup: kaki tikus → mata ketam (±1 minggu) → kancing (±1 minggu) → terung (±1 minggu) → mekar. Kuncup membesar paling cepat 1-2 minggu sebelum mekar.', en: 'Bud stages: mouse-leg → crab-eye (~1 week) → button (~1 week) → eggplant (~1 week) → bloom. Buds grow fastest 1-2 weeks before opening.' },
        ],
      },
      {
        heading: { id: 'Kenapa bunga rontok', en: 'Why flowers drop' },
        points: [
          { id: 'Kekurangan air: bunga layu, menguning lalu kering.', en: 'Too little water: flowers wilt, yellow and dry out.' },
          { id: 'Kelebihan air atau hujan lebat: bunga masih segar tapi tangkainya berair dan mudah patah.', en: 'Too much water or heavy rain: flowers look fresh but the stalk is watery and snaps.' },
          { id: 'Tidak terserbuki: bakal buah gugur 7-10 hari setelah mekar.', en: 'Not pollinated: the ovary falls 7-10 days after bloom.' },
          { id: 'Terlalu banyak air saat berbunga memicu tunas daun yang mengambil tenaga dari bunga.', en: 'Too much water during bloom triggers a leaf flush that takes energy from the flowers.' },
        ],
      },
      {
        heading: { id: 'Zat pengatur tumbuh (paklobutrazol)', en: 'Growth regulators (paclobutrazol)' },
        points: [
          { id: 'Paklobutrazol dipakai di Thailand, Malaysia, Indonesia dan Vietnam untuk memajukan atau menyerempakkan bunga. Pohon yang diberi cukup 3-7 hari kering, dibanding 10-14 hari tanpa perlakuan.', en: 'Paclobutrazol is used in Thailand, Malaysia, Indonesia and Vietnam to advance or synchronise flowering. Treated trees need 3-7 dry days instead of 10-14 untreated.' },
          { id: 'Dalam satu uji, siraman tanah 3 ml per meter diameter tajuk memajukan panen 22 hari. Ini zat kuat: pakai hanya dengan saran ahli dan sesuai label.', en: 'In one trial a soil drench of 3 ml per metre of canopy diameter advanced harvest by 22 days. It is potent: use only with expert advice and per the label.' },
        ],
      },
    ],
    questions: [
      { id: 'Berapa hari dari awal kemarau sampai kuncup terlihat di tiap blok?', en: 'How many days from the start of the dry season until buds show in each block?' },
      { id: 'Apakah semua varietas di satu blok berbunga bersamaan?', en: 'Do all varieties in a block flower at the same time?' },
    ],
    related: ['water', 'pollination', 'records'],
    sources: [S.drySpell, S.mkDevelopment, S.itfFlower, S.pbzMulch, S.pbzJuvenile, S.botanyReview, S.cropCycle],
  },

  pollination: {
    targets: [
      { label: { id: 'Waktu mekar', en: 'Opening time' }, value: { id: 'Putik terbuka ±16.00; serbuk sari keluar ±19.30 (Musang King)', en: 'Stigma exposed ~4 pm; pollen sheds ~7:30 pm (Musang King)' }, confidence: 'study' },
      { label: { id: 'Penyerbuk utama', en: 'Main pollinator' }, value: { id: 'Kelelawar gua (Eonycteris spelaea); lebah membantu', en: 'Dawn bat (Eonycteris spelaea); bees help' }, confidence: 'strong' },
      { label: { id: 'Penyerbukan tangan silang', en: 'Hand cross-pollination' }, value: { id: '2 bulan setelah penyerbukan: 12,2% bunga masih menjadi buah vs 5,1% alami (pada hari ke-10: 76,6% vs 54,4%)', en: '2 months after pollination: 12.2% of flowers still fruit vs 5.1% open-pollinated (at day 10: 76.6% vs 54.4%)' }, confidence: 'study' },
      { label: { id: 'Serbuk sendiri', en: 'Self-pollen' }, value: { id: 'Banyak varietas menolak serbuk sari sendiri', en: 'Many varieties reject their own pollen' }, confidence: 'strong' },
      { label: { id: 'Musang King', en: 'Musang King' }, value: { id: 'Tidak bisa menyerbuki diri; bakal buah tertinggi saat disilangkan dengan D24 (16,28% saat panen)', en: 'Self-incompatible; highest set when crossed with D24 (16.28% at harvest)' }, confidence: 'study' },
    ],
    sections: [
      {
        heading: { id: 'Yang perlu diketahui', en: 'What to know' },
        points: [
          { id: 'Ketidakcocokan diri pada durian dikendalikan secara genetik: ada varietas yang sama sekali tidak bisa menyerbuki diri, sebagian, atau cocok penuh.', en: "Durian's self-incompatibility is genetic: varieties are fully self-incompatible, partly, or fully compatible." },
          { id: 'Buah dari serbuk sendiri cenderung lebih sedikit dan lebih kecil daripada hasil penyerbukan silang.', en: 'Self-pollinated fruit tends to be fewer and smaller than cross-pollinated fruit.' },
          { id: 'Sebagian besar bakal buah gugur dalam 2 bulan pertama, bahkan setelah penyerbukan berhasil: angka hari ke-10 jauh lebih tinggi daripada yang bertahan sampai panen.', en: 'Most young fruit falls in the first 2 months even after successful pollination: day-10 set is far higher than what survives to harvest.' },
          { id: 'Musang King (Raub, Pahang, 2017-2018): tidak bisa menyerbuki diri, dan posisi putik-benang sarinya (herkogami) menghalangi serbuk sendiri. Peneliti menyarankan menanamnya bersama varietas lain, bukan satu varietas saja.', en: 'Musang King (Raub, Pahang, 2017-2018): self-incompatible, and its flower shape (herkogamy) physically blocks self-pollen. The researchers advise planting it with other varieties, not as a single variety.' },
          { id: 'Dalam uji lain, penyerbukan tangan selama 2 minggu dengan serbuk dari varietas lain menaikkan bakal buah Chanee ke 30-64% dan Kanyao ke 87-90%.', en: 'In other trials, two weeks of hand pollination with pollen from other varieties raised fruit set to 30-64% in Chanee and 87-90% in Kanyao.' },
        ],
      },
      {
        heading: { id: 'Yang bisa dilakukan', en: 'What you can do' },
        points: [
          { id: 'Tanam atau sambung varietas penyerbuk di blok yang hanya berisi satu varietas, pilih yang waktu berbunganya sama.', en: 'Plant or top-work a pollinator variety into single-variety blocks, choosing one that flowers at the same time.' },
          { id: 'Penyerbukan tangan: ambil benang sari dari varietas lain mulai pukul 19.30, oleskan ke putik bunga yang baru mekar.', en: 'Hand pollination: collect anthers from another variety from 7:30 pm and brush them onto the stigmas of freshly opened flowers.' },
          { id: 'Lindungi kelelawar: jangan semprot insektisida sore/malam saat bunga mekar, dan jaga gua atau pohon tempat bersarang di sekitar kebun.', en: 'Protect bats: no insecticide in the evening while flowers are open, and keep nearby roosts undisturbed.' },
        ],
      },
    ],
    questions: [
      { id: 'Varietas mana yang berbunga bersamaan dan bisa saling menyerbuki di kebun ini?', en: 'Which varieties flower together and can pollinate each other on this farm?' },
      { id: 'Apakah penyerbukan tangan menaikkan jumlah buah di blok yang dicoba?', en: 'Did hand pollination raise fruit numbers in the block where it was tried?' },
      { id: 'Untuk Musang King di sini: varietas penyerbuk mana yang berbunga bersamaan (D24 terbaik di Malaysia)?', en: 'For Musang King here: which pollinator variety flowers at the same time (D24 was best in Malaysia)?' },
    ],
    related: ['flowering', 'fruit'],
    sources: [S.pollinationEcology, S.mkPollination, S.batReview, S.incompatibility, S.mkDevelopment],
  },

  fruit: {
    targets: [
      { label: { id: 'Buah per tangkai', en: 'Fruit per cluster' }, value: { id: '1 (paling banyak 2)', en: '1 (at most 2)' }, confidence: 'strong' },
      { label: { id: 'Waktu penjarangan', en: 'When to thin' }, value: { id: '5-8 minggu setelah mekar, saat rontok alami paling sedikit; di Thailand bertahap: minggu 4-6, ±hari 45, terakhir ±hari 60', en: '5-8 weeks after bloom, when natural drop is lowest; in Thailand in rounds: weeks 4-6, ~day 45, last ~day 60' }, confidence: 'strong' },
      { label: { id: 'Penjarangan kuncup', en: 'Bud thinning' }, value: { id: 'Di Thailand saat kuncup ±1 cm; banyaknya tergantung varietas', en: 'In Thailand when buds are ~1 cm across; how much depends on the variety' }, confidence: 'rule' },
      { label: { id: 'Daun per buah', en: 'Leaves per fruit' }, value: { id: '150-200 daun untuk satu buah 2 kg', en: '150-200 leaves for one 2 kg fruit' }, confidence: 'rule' },
      { label: { id: 'Buah per pohon dewasa', en: 'Fruit per mature tree' }, value: { id: 'Biasanya 50-100 per tahun; 70-80 di Malaysia; 50-150 setelah penjarangan di Thailand', en: 'Usually 50-100 a year; 70-80 in Malaysia; 50-150 after thinning in Thailand' }, confidence: 'rule' },
      { label: { id: 'Hasil menurut umur (okulasi)', en: 'Yield by age (grafted)' }, value: { id: 'Tahun berbuah pertama 10-40; ±100 di tahun berbuah ke-6; sampai 200 setelah tahun ke-10', en: 'First fruiting year 10-40; ~100 by the 6th fruiting year; up to 200 after the 10th' }, confidence: 'rule' },
    ],
    sections: [
      {
        heading: { id: 'Kenapa menjarangkan', en: 'Why thin' },
        points: [
          { id: 'Terlalu banyak bakal buah menghasilkan buah kecil dan tidak seragam, dan menguras pohon untuk musim berikutnya.', en: 'Too much fruit set gives small, uneven fruit and drains the tree for next season.' },
          { id: 'Dalam uji penjarangan 25% dan 50%, buah lebih berat, lingkarnya lebih besar dan lebih panjang daripada tanpa penjarangan.', en: 'In a trial, thinning by 25% and 50% gave heavier, wider and longer fruit than no thinning.' },
          { id: 'Buah tunggal kurang disukai penggerek untuk bertelur; penjarangan juga mengurangi hama.', en: 'Single fruit are less attractive to borers for egg laying; thinning also reduces pests.' },
        ],
      },
      {
        heading: { id: 'Kenapa buah rontok', en: 'Why fruit drops' },
        points: [
          { id: 'Tidak terserbuki (7-10 hari setelah mekar).', en: 'Not pollinated (7-10 days after bloom).' },
          { id: 'Kekurangan air, atau sebaliknya hujan lebat: buah rontok berhubungan positif dengan curah hujan selama buah berkembang.', en: 'Water shortage, or heavy rain: fruit drop rises with rainfall during fruit development.' },
          { id: 'Tunas daun baru yang bersaing dengan buah muda.', en: 'A new leaf flush competing with young fruit.' },
          { id: 'Angin kencang; ikat tangkai buah ke cabang.', en: 'Strong wind; tie fruit stalks to branches.' },
        ],
      },
      {
        heading: { id: 'Cara menjarangkan', en: 'How to thin' },
        points: [
          { id: 'Buang buah kecil, cacat dan tidak simetris; sisakan buah yang seragam.', en: 'Remove small, damaged and lopsided fruit; keep uniform ones.' },
          { id: 'Sesuaikan jumlah buah dengan ukuran cabang dan jumlah daunnya, bukan hanya jumlah tangkai.', en: 'Match fruit numbers to the size of the branch and its leaves, not just the number of clusters.' },
          { id: 'Ronde kedua (±hari 45): buang buah cacat, bertangkai kecil, atau yang posisinya buruk di cabang. Ronde terakhir sekitar hari ke-60.', en: 'Second round (~day 45): remove deformed fruit, fruit on thin stalks, and fruit badly placed on the branch. Last round around day 60.' },
          { id: 'Pada pohon muda, pertahankan lebih sedikit buah agar pertumbuhan tidak terhambat. (Belum ada angka terbitan untuk berapa; lihat pertanyaan terbuka.)', en: 'On young trees keep fewer fruit so growth is not held back. (No published figure for how few; see the open questions.)' },
        ],
      },
    ],
    questions: [
      { id: 'Berapa buah per pohon yang menghasilkan ukuran terbaik di kebun ini, per varietas?', en: 'How many fruit per tree give the best size on this farm, per variety?' },
      { id: 'Berapa persen bakal buah yang rontok sebelum penjarangan?', en: 'What share of fruitlets drop before thinning?' },
      { id: 'Pada umur dan ukuran berapa pohon di kebun ini boleh mulai dibiarkan berbuah penuh?', en: 'At what age and size should trees on this farm be allowed to carry a full crop?' },
    ],
    related: ['pollination', 'nutrition', 'pests', 'records'],
    sources: [S.thinning, S.itfPreHarvest, S.itfBiology, S.rfcaFactsheet, S.botanyReview, S.conogethes],
  },

  water: {
    targets: [
      { label: { id: 'Sebelum berbunga', en: 'Before flowering' }, value: { id: 'Masa kering ±2 minggu; kurangi siraman', en: 'Dry spell of ~2 weeks; hold back irrigation' }, confidence: 'strong' },
      { label: { id: 'Kuncup sampai bakal buah', en: 'Buds to fruit set' }, value: { id: 'Siram lagi begitu kuncup tumbuh; tanah lembap merata', en: 'Resume watering once buds grow; evenly moist soil' }, confidence: 'rule' },
      { label: { id: 'Buah berkembang', en: 'Fruit development' }, value: { id: 'Cukup dan merata; jangan berlebihan (memicu tunas daun)', en: 'Enough and even; not excess (it triggers leaf flush)' }, confidence: 'rule' },
      { label: { id: 'Menjelang panen', en: 'Before harvest' }, value: { id: 'Hindari kelebihan air; hujan ≥200 mm menaikkan risiko daging basah', en: 'Avoid excess water; rain ≥200 mm raises wet-core risk' }, confidence: 'study' },
      { label: { id: 'Genangan', en: 'Standing water' }, value: { id: 'Tidak pernah', en: 'Never' }, confidence: 'strong' },
    ],
    sections: [
      {
        heading: { id: 'Prinsip', en: 'Principles' },
        points: [
          { id: 'Kering singkat memicu bunga, tapi durian tidak tahan kemarau panjang.', en: 'A short dry spell triggers flowers, but durian does not tolerate long droughts.' },
          { id: 'Sekitar 4 minggu setelah mekar, pohon butuh air secukupnya untuk buah; terlalu banyak air membuat pohon bertunas daun dengan mengorbankan buah.', en: 'About 4 weeks after bloom the tree needs just enough water for the fruit; too much makes it flush leaves at the fruit’s expense.' },
          { id: 'Irigasi tetes ke zona akar dianjurkan: daun tetap kering (penyakit lebih sedikit) dan pupuk bisa dilarutkan.', en: 'Drip irrigation to the root zone is recommended: leaves stay dry (less disease) and fertilizer can be dissolved in.' },
          { id: 'Hujan 200 mm atau lebih saat buah matang dikaitkan dengan insiden tertinggi matang tidak merata dan daging basah.', en: '200 mm or more rain while fruit matures is linked to the highest incidence of uneven ripening and wet core.' },
        ],
      },
      {
        heading: { id: 'Yang bisa dilakukan', en: 'What you can do' },
        points: [
          { id: 'Siram di zona akar di bawah tajuk (akar penyerap ada di 30 cm teratas), bukan di pangkal batang.', en: 'Water the root zone under the canopy (feeder roots are in the top 30 cm), not the trunk base.' },
          { id: 'Mulsa menahan lembap saat kemarau dan menekan Phytophthora.', en: 'Mulch holds moisture in dry weather and suppresses Phytophthora.' },
          { id: 'Catat hujan harian agar bisa melihat kapan masa kering pemicu bunga terjadi.', en: 'Log daily rain to see when the flower-triggering dry spell happened.' },
        ],
      },
    ],
    questions: [
      { id: 'Berapa liter per pohon yang dibutuhkan saat kemarau di tanah kebun ini?', en: 'How many litres per tree does this soil need in dry weather?' },
      { id: 'Apakah ada sumber air yang cukup untuk semua blok di puncak kemarau?', en: 'Is there enough water for every block at the height of the dry season?' },
    ],
    templates: ['dryIrrigation'],
    related: ['flowering', 'site', 'phytophthora', 'harvest'],
    sources: [S.itfFlower, S.drySpell, S.botanyReview, S.organicFoliar, S.rfcaFactsheet],
  },

  nutrition: {
    targets: [
      { label: { id: 'Nitrogen daun (N)', en: 'Leaf nitrogen (N)' }, value: { id: '2,0-2,4%', en: '2.0-2.4%' }, confidence: 'study' },
      { label: { id: 'Fosfor daun (P)', en: 'Leaf phosphorus (P)' }, value: { id: '0,15-0,25%', en: '0.15-0.25%' }, confidence: 'study' },
      { label: { id: 'Kalium daun (K)', en: 'Leaf potassium (K)' }, value: { id: '1,5-2,5%', en: '1.5-2.5%' }, confidence: 'study' },
      { label: { id: 'Kalsium daun (Ca)', en: 'Leaf calcium (Ca)' }, value: { id: '1,7-2,5%', en: '1.7-2.5%' }, confidence: 'study' },
      { label: { id: 'Magnesium daun (Mg)', en: 'Leaf magnesium (Mg)' }, value: { id: '0,25-0,50%', en: '0.25-0.50%' }, confidence: 'study' },
      { label: { id: 'Mikro (ppm)', en: 'Micronutrients (ppm)' }, value: { id: 'Fe 40-150 · Mn 50-120 · Cu 10-25 · Zn 10-30', en: 'Fe 40-150 · Mn 50-120 · Cu 10-25 · Zn 10-30' }, confidence: 'study' },
      { label: { id: 'Batas kekurangan', en: 'Deficient below' }, value: { id: 'N 1,67% · P 0,16% · K 1,37% · Ca 1,49% · Mg 0,22% (studi Vietnam)', en: 'N 1.67% · P 0.16% · K 1.37% · Ca 1.49% · Mg 0.22% (Vietnam study)' }, confidence: 'study' },
      { label: { id: 'Boron daun (B)', en: 'Leaf boron (B)' }, value: { id: '40-60 mg/kg pada daun dewasa sebelum kuncup muncul', en: '40-60 mg/kg in mature leaves before inflorescences form' }, confidence: 'rule' },
      { label: { id: 'Waktu ambil contoh daun', en: 'When to sample leaves' }, value: { id: 'Sebelum berbunga, saat kadar hara paling stabil', en: 'Before flowering, when levels are most stable' }, confidence: 'study' },
      { label: { id: 'Ca + Mg lewat daun (Musang King)', en: 'Foliar Ca + Mg (Musang King)' }, value: { id: 'Ca(NO₃)₂ 0,4% ±40 hari setelah bakal buah + MgSO₄ 0,2% ±50 hari: hasil naik 8-12%, kelainan daging berkurang', en: 'Ca(NO₃)₂ 0.4% ~40 days after fruit set + MgSO₄ 0.2% ~50 days: yield up 8-12%, fewer flesh disorders' }, confidence: 'study' },
      { label: { id: 'Boron lewat daun', en: 'Foliar boron' }, value: { id: 'Solubor (20,5% B) ±0,5-1 g/L bersama kalsium, dari berbunga sampai bakal buah', en: 'Solubor (20.5% B) ~0.5-1 g/L with calcium, from bloom to fruit set' }, confidence: 'rule' },
    ],
    sections: [
      {
        heading: { id: 'Pupuk menurut tahap', en: 'Feeding by stage' },
        points: [
          { id: 'Setelah panen: nitrogen untuk tunas daun baru, plus Mg dan Zn. Bila daun kurang atau setelah panen besar, naikkan N.', en: 'After harvest: nitrogen for the new leaf flush, plus Mg and Zn. If leaves are sparse or after a big crop, raise N.' },
          { id: 'Menjelang berbunga: P dan K lebih tinggi, N sedang. Jangan dorong tunas daun saat pohon harus berbunga.', en: 'Before flowering: higher P and K, moderate N. Do not push a leaf flush when the tree should flower.' },
          { id: 'Bunga sampai bakal buah: semprot daun boron + kalsium pada pagi atau sore yang sejuk. Boron beracun bila berlebihan: jangan melebihi dosis label, dan ukur kadar B daun bila ragu.', en: 'Bloom to fruit set: foliar boron + calcium in the cool of morning or late afternoon. Boron is toxic in excess: never exceed the label rate, and test leaf B if unsure.' },
          { id: 'Buah berkembang: kalium tinggi, N sedang, dosis kecil terbagi. Hindari N tinggi: tunas daun saat buah tumbuh dikaitkan dengan matang tidak merata.', en: 'Fruit development: high K, moderate N, in small split doses. Avoid high N: leaf flushing during fruit growth is linked to uneven ripening.' },
        ],
      },
      {
        heading: { id: 'Kelainan daging buah', en: 'Flesh disorders' },
        points: [
          { id: 'Musang King rawan daging mengeras, ujung daging terbakar dan perubahan warna; insidennya naik menjelang panen.', en: 'Musang King is prone to hardened flesh, aril tip burn and discolouration; incidence rises towards harvest.' },
          { id: 'Kekurangan boron: buah kecil, bentuk tidak normal atau retak, daging kering seperti gabus; daun menguning di tepi lalu mati, rapuh atau berubah bentuk.', en: 'Boron deficiency: small, misshapen or cracked fruit, dry corky flesh; leaves yellow at the edges then die, turn brittle or deform.' },
          { id: 'Uji di Vietnam (Musang King umur 7 tahun): kalsium nitrat 0,4% + magnesium sulfat 0,2-0,4% lewat daun saat buah berkembang tidak menimbulkan kelainan dan menaikkan hasil 8-12%.', en: 'Vietnam trial (7-year-old Musang King): foliar 0.4% calcium nitrate + 0.2-0.4% magnesium sulfate during fruit development caused no disorders and raised yield 8-12%.' },
          { id: 'Uji di lapangan: kombinasi pupuk organik dan semprot hara lewat daun menurunkan buah retak dan matang tidak merata serta menaikkan kadar gula.', en: 'Field trials: combining organic fertilizer with foliar nutrient sprays reduced cracking and uneven ripening and raised sugar content.' },
        ],
      },
      {
        heading: { id: 'Ukur, jangan menebak', en: 'Measure, don’t guess' },
        points: [
          { id: 'Analisis daun setahun sekali memberi tahu hara mana yang kurang. Ambil daun dewasa dari tunas terakhir, dari beberapa pohon per blok.', en: 'A yearly leaf analysis shows which nutrient is short. Take mature leaves from the last flush, from several trees per block.' },
          { id: 'Bandingkan hasil lab dengan rentang di atas, lalu sesuaikan pupuk di Jadwal.', en: 'Compare lab results with the ranges above, then adjust the feeding routines in Schedule.' },
          { id: 'Tambah bahan organik tiap tahun; jumlahnya naik dengan umur pohon.', en: 'Add organic matter every year; increase it as trees age.' },
        ],
      },
    ],
    questions: [
      { id: 'Hasil analisis daun terakhir per blok (N, P, K, Ca, Mg, B)?', en: 'Latest leaf analysis per block (N, P, K, Ca, Mg, B)?' },
      { id: 'Pupuk dan dosis apa yang memberi buah terbaik musim lalu?', en: 'Which fertilizer and dose gave the best fruit last season?' },
    ],
    templates: ['leafSoil', 'leaf', 'flowerSoil', 'flowerFoliar', 'fruit', 'post'],
    related: ['fruit', 'harvest', 'site'],
    sources: [S.leafStandards, S.dris, S.organicFoliar, S.caMg, S.boron, S.mkDevelopment, S.botanyReview, S.cropCycle],
  },

  canopy: {
    targets: [
      { label: { id: 'Bentuk', en: 'Shape' }, value: { id: 'Satu batang utama, 6-10 cabang primer simetris', en: 'One main trunk, 6-10 evenly spaced primary branches' }, confidence: 'rule' },
      { label: { id: 'Jarak cabang primer', en: 'Primary branch spacing' }, value: { id: '40-60 cm', en: '40-60 cm' }, confidence: 'rule' },
      { label: { id: 'Cabang terbawah', en: 'Lowest branches' }, value: { id: 'Tidak ada cabang di bawah 80-100 cm dari tanah', en: 'No branches within 80-100 cm of the ground' }, confidence: 'strong' },
      { label: { id: 'Waktu pangkas', en: 'When to prune' }, value: { id: 'Setelah panen', en: 'After harvest' }, confidence: 'strong' },
    ],
    sections: [
      {
        heading: { id: 'Kenapa memangkas', en: 'Why prune' },
        points: [
          { id: 'Cabang bawah yang dibuang memperlancar udara, menurunkan kelembapan tajuk, dan mencegah percikan tanah pembawa Phytophthora.', en: 'Removing low branches improves airflow, lowers canopy humidity and stops soil splash that carries Phytophthora.' },
          { id: 'Pohon bertajuk rendah butuh sedikit pemangkasan, mulai berbuah setahun lebih cepat, dan hasilnya hampir dua kali lipat pohon bertajuk tinggi (satu studi).', en: 'Low-headed trees need little pruning, fruit a year earlier and yield nearly twice as much as high-headed trees (one study).' },
        ],
      },
      {
        heading: { id: 'Yang dipangkas', en: 'What to cut' },
        points: [
          { id: 'Cabang mati, sakit, patah, dan yang saling bersilangan.', en: 'Dead, diseased, broken and crossing branches.' },
          { id: 'Tunas air (tumbuh tegak lurus) dan tunas dari batang bawah.', en: 'Water shoots (straight up) and shoots from the rootstock.' },
          { id: 'Pada pohon muda: pangkas pucuk setelah batang 70-100 cm, lalu pilih 6-10 calon cabang primer yang simetris.', en: 'On young trees: top the stem at 70-100 cm, then keep 6-10 evenly placed primary branches.' },
          { id: 'Potong rapi tepat di luar leher cabang. Luka besar biasanya dilindungi pasta tembaga, misalnya bubur Bordeaux (1 kg terusi + 1 kg kapur dalam 10 L air).', en: 'Cut cleanly just outside the branch collar. Large cuts are usually protected with a copper paste such as Bordeaux paste (1 kg copper sulfate + 1 kg lime in 10 L water).' },
          { id: 'Bersihkan gulma di bawah tajuk.', en: 'Clear weeds under the canopy.' },
        ],
      },
    ],
    questions: [
      { id: 'Berapa tinggi pohon yang masih aman dipanen dan disemprot di kebun ini?', en: 'How tall can trees get on this farm and still be harvested and sprayed safely?' },
    ],
    templates: ['skirtPrune', 'prune'],
    related: ['phytophthora', 'fruit'],
    sources: [S.sopIpb, S.aciar114, S.rfcaFactsheet, S.itfPreHarvest, S.bordeaux],
  },

  phytophthora: {
    targets: [
      { label: { id: 'Injeksi fosfonat, dosis anjuran', en: 'Phosphonate injection, recommended' }, value: { id: '2-3 injeksi × 16 g bahan aktif per pohon per tahun, menurut ukuran pohon dan tekanan penyakit', en: '2-3 injections × 16 g active ingredient per tree per year, by tree size and disease pressure' }, confidence: 'study' },
      { label: { id: 'Tekanan sedang / tinggi', en: 'Moderate / high pressure' }, value: { id: 'Sedang: 1 × 16 g/tahun sudah lebih baik dari semprotan. Tinggi: 3 × 16 g tiap 3 bulan', en: 'Moderate: 1 × 16 g/year already beat sprays. High: 3 × 16 g every 3 months' }, confidence: 'study' },
      { label: { id: 'Larutan', en: 'Solution' }, value: { id: 'Kalium fosfonat (asam fosfit dinetralkan) pH 6,5-7,0', en: 'Potassium phosphonate (neutralised phosphorous acid) pH 6.5-7.0' }, confidence: 'strong' },
      { label: { id: 'Waktu injeksi', en: 'When to inject' }, value: { id: 'Saat tunas daun, pagi hari; bertahan di jaringan ≥128 hari', en: 'During leaf flush, in the morning; lasts in tissue ≥128 days' }, confidence: 'study' },
      { label: { id: 'Cabang bawah', en: 'Low branches' }, value: { id: 'Bersih sampai 80-100 cm dari tanah', en: 'Clear to 80-100 cm above ground' }, confidence: 'strong' },
    ],
    sections: [
      {
        heading: { id: 'Gejala', en: 'Symptoms' },
        points: [
          { id: 'Kanker batang: bercak basah di kulit batang yang mengeluarkan getah merah-cokelat. Bercak menyatu dan bisa melingkari batang.', en: 'Stem canker: wet-looking patches on the bark that ooze red-brown resin. Patches merge and can girdle the trunk.' },
          { id: 'Kerok kulit luar: jaringan di bawahnya merah-cokelat (sehat berwarna krem sampai merah muda).', en: 'Scrape the outer bark: tissue underneath is red-brown (healthy is cream to pink).' },
          { id: 'Busuk akar: daun layu dan menguning, tajuk menipis, mati pucuk.', en: 'Root rot: leaves wilt and yellow, canopy thins, branch dieback.' },
          { id: 'Busuk buah: bercak cokelat basah pada buah, terutama yang menyentuh tanah atau saat lembap.', en: 'Fruit rot: wet brown patches on fruit, especially on the ground or in wet weather.' },
          { id: 'Jangan tertukar dengan penggerek batang: penggerek meninggalkan lubang dengan serbuk kayu/kotoran dan cairan kemerahan. Kanker tidak berlubang; kulitnya basah dan jaringan di bawahnya merah-cokelat.', en: "Don't confuse it with stem borers: borers leave a hole with sawdust-like frass and reddish fluid. Canker has no hole; the bark is wet and the tissue beneath is red-brown." },
        ],
      },
      {
        heading: { id: 'Pencegahan', en: 'Prevention' },
        points: [
          { id: 'Drainase baik; tidak ada genangan di bawah tajuk.', en: 'Good drainage; no standing water under the canopy.' },
          { id: 'Pangkas cabang bawah (80-100 cm), bersihkan gulma, beri jarak tanam yang cukup agar udara mengalir.', en: 'Prune low branches (80-100 cm), clear weeds, space trees so air moves.' },
          { id: 'Mulsa organik menekan Phytophthora dan menyuburkan tanah; jauhkan dari pangkal batang.', en: 'Organic mulch suppresses Phytophthora and builds soil; keep it off the trunk base.' },
          { id: 'Jangan biarkan buah menyentuh tanah; kumpulkan buah jatuh setiap hari.', en: 'Keep fruit off the ground; collect dropped fruit daily.' },
          { id: 'Injeksi fosfonat ke batang memberi kendali kanker dan busuk buah jangka panjang terbaik, lebih baik dari semprot metalaksil atau fosetil-Al dalam uji.', en: 'Phosphonate trunk injection gave the best long-term control of canker and fruit rot, better than metalaxyl or fosetyl-Al sprays in trials.' },
        ],
      },
      {
        heading: { id: 'Bila ditemukan kanker', en: 'When you find canker' },
        points: [
          { id: 'Kerok kulit yang sakit sampai jaringan sehat, lalu oles fungisida (mis. fosetil-Al, metalaksil, atau tembaga).', en: 'Scrape diseased bark back to healthy tissue, then paint with fungicide (e.g. fosetyl-Al, metalaxyl or copper).' },
          { id: 'Tandai pohon sebagai Darurat atau Masalah ringan, foto lukanya, dan periksa ulang dalam 2-7 hari.', en: 'Mark the tree Emergency or Minor, photograph the lesion, and re-check within 2-7 days.' },
          { id: 'Pohon yang pernah terkena masuk daftar pemeriksaan batang rutin.', en: 'Trees that had canker go on a routine trunk-check list.' },
          { id: 'Saran penyuluhan di Malaysia: oles batang yang dikerok ditambah siram tanah dengan fungisida bekerja paling baik untuk kanker bercak.', en: 'Malaysian extension advice: painting the scraped trunk plus a fungicide soil drench works best against patch canker.' },
        ],
      },
    ],
    questions: [
      { id: 'Pohon mana yang pernah terkena kanker, dan di blok mana paling sering?', en: 'Which trees have had canker, and which blocks get it most?' },
      { id: 'Apakah injeksi fosfonat sudah dilakukan, kapan, dan berapa dosisnya?', en: 'Has phosphonate been injected, when, and at what dose?' },
    ],
    templates: ['phosphonate', 'skirtPrune', 'fungicide'],
    related: ['water', 'canopy', 'site'],
    sources: [S.phenologyPhos, S.ipmPhytophthora, S.aciar114, S.qldDecline, S.plantwise, S.patchCankerMy, S.topFruitsDiseases],
  },

  diseases: {
    targets: [
      { label: { id: 'Penyakit utama', en: 'Main threat' }, value: { id: 'Busuk akar dan batang (Phytophthora, Pythium) paling merugikan; yang lain biasanya bisa dikendalikan', en: 'Root and stem rots (Phytophthora, Pythium) do the most damage; the others are usually manageable' }, confidence: 'strong' },
      { label: { id: 'Pemicu umum', en: 'Common trigger' }, value: { id: 'Lembap lama, hujan terus-menerus, tajuk rapat', en: 'Long wet spells, continuous rain, dense canopy' }, confidence: 'strong' },
    ],
    sections: [
      {
        heading: { id: 'Kenali gejalanya', en: 'Know the symptoms' },
        points: [
          { id: 'Jamur upas (pink disease, Erythricium salmonicolor): lapisan jamur merah muda seperti bedak di cabang dan kulit batang, lalu cabang layu dan mati. Muncul saat lembap lama di kebun yang rapat.', en: 'Pink disease (Erythricium salmonicolor): pink powdery fungal growth on branches and bark, then wilting and branch dieback. Appears in long wet spells in dense orchards.' },
          { id: 'Antraknosa (Colletotrichum gloeosporioides): bercak gelap mengendap di daun mulai dari ujung atau tepi dengan cincin cokelat, bercak gelap pada buah, buah rontok dan ranting mati.', en: 'Anthracnose (Colletotrichum gloeosporioides): sunken dark leaf spots starting at the tip or edge with brown rings, dark lesions on fruit, fruit drop and twig dieback.' },
          { id: 'Hawar daun Rhizoctonia (Rhizoctonia solani): bercak basah di daun yang menyatu menjadi bidang basah tak beraturan, lalu mengering cokelat muda.', en: 'Rhizoctonia leaf blight (Rhizoctonia solani): water-soaked leaf spots that merge into irregular wet patches, then dry light brown.' },
          { id: 'Bercak daun Phomopsis: bercak cokelat tua dengan lingkaran kuning.', en: 'Phomopsis leaf spot: dark brown spots with a yellow halo.' },
          { id: 'Busuk akar Pythium (Pythium vexans): akar utama membusuk dan cabang di satu sisi pohon mati.', en: 'Pythium root rot (Pythium vexans): main roots decay and branches on one section of the tree die back.' },
          { id: 'Bercak alga (Cephaleuros virescens): bercak oranye seperti karat di permukaan atas daun, ranting dan cabang.', en: 'Algal spot (Cephaleuros virescens): orange, rust-like spots on the upper side of leaves, twigs and branches.' },
        ],
      },
      {
        heading: { id: 'Pencegahan', en: 'Prevention' },
        points: [
          { id: 'Tajuk yang terbuka, cabang bawah dipangkas dan gulma bersih membuat daun cepat kering dan menekan hampir semua penyakit ini.', en: 'An open canopy, pruned low branches and clean weeding let leaves dry quickly and suppress most of these diseases.' },
          { id: 'Potong dan musnahkan cabang yang terkena jamur upas sampai bagian sehat; jangan ditinggal di kebun.', en: 'Cut pink-disease branches back to healthy wood and destroy them; do not leave them in the orchard.' },
          { id: 'Foto gejala baru dan laporkan lewat WhatsApp; bila tidak yakin, minta diagnosis dari dinas pertanian atau laboratorium.', en: 'Photograph new symptoms and report them via WhatsApp; when unsure, get a diagnosis from the agriculture office or a lab.' },
        ],
      },
    ],
    questions: [
      { id: 'Penyakit daun atau cabang apa yang muncul di kebun ini, di blok mana, dan pada bulan apa?', en: 'Which leaf or branch diseases show up on this farm, in which blocks, and in which months?' },
    ],
    templates: ['fungicide', 'skirtPrune'],
    related: ['phytophthora', 'canopy', 'pests'],
    sources: [S.diseaseDataset, S.durianDiseasesCabi, S.topFruitsDiseases, S.plantwise],
  },

  pests: {
    targets: [
      { label: { id: 'Brongsong (penggerek buah)', en: 'Bagging (fruit borer)' }, value: { id: '±1 bulan setelah bakal buah: serangan turun ke 9,2%', en: '~1 month after fruit set: infestation down to 9.2%' }, confidence: 'study' },
      { label: { id: 'Brongsong (penggerek biji)', en: 'Bagging (seed borer)' }, value: { id: '6 minggu setelah bakal buah: 100% terlindungi; 8 minggu: 2,86% rusak', en: '6 weeks after fruit set: 100% protected; 8 weeks: 2.86% damaged' }, confidence: 'study' },
      { label: { id: 'Jeda sebelum panen', en: 'Pre-harvest interval' }, value: { id: 'Ikuti label setiap produk', en: 'Follow every product label' }, confidence: 'strong' },
    ],
    sections: [
      {
        heading: { id: 'Hama utama', en: 'Main pests' },
        points: [
          { id: 'Penggerek buah (Conogethes punctiferalis): ulat masuk ke buah, kotoran keluar dari lubang.', en: 'Fruit borer (Conogethes punctiferalis): caterpillars bore into fruit, frass comes out of holes.' },
          { id: 'Penggerek biji (Mudaria luteileprosa): merusak biji dan daging dari dalam, sering tidak terlihat dari luar.', en: 'Seed borer (Mudaria luteileprosa): damages seed and flesh from inside, often invisible outside.' },
          { id: 'Kutu loncat durian (Allocaridara malayensis): menyerang tunas daun muda.', en: 'Durian psyllid (Allocaridara malayensis): attacks young leaf flushes.' },
          { id: 'Penggerek batang (Batocera, Xyleutes leuconotus, Zeuzera coffeae): lubang di batang atau cabang dengan serbuk kayu dan cairan kemerahan; cabang layu lalu mati. Bersihkan kebun dari gulma dan tanaman inang, potong cabang yang terserang.', en: 'Stem borers (Batocera, Xyleutes leuconotus, Zeuzera coffeae): holes in trunk or branches with sawdust-like frass and reddish fluid; branches wilt and die. Keep the orchard clear of weeds and host plants, cut out infested branches.' },
          { id: 'Kutu putih (Pseudococcus): mengisap daun, bunga dan buah, meninggalkan embun jelaga; disebarkan semut yang memakan embun madunya. Kendalikan semutnya juga.', en: 'Mealybugs (Pseudococcus): suck leaves, flowers and fruit and leave sooty mould; ants spread them for the honeydew. Control the ants too.' },
        ],
      },
      {
        heading: { id: 'Pengendalian', en: 'Control' },
        points: [
          { id: 'Jarangkan buah lalu brongsong: buah tunggal kurang disukai untuk bertelur, dan brongsong mengurangi kebutuhan insektisida.', en: 'Thin, then bag: single fruit are less attractive for egg laying, and bagging cuts insecticide needs.' },
          { id: 'Sanitasi: buang dan musnahkan buah yang terserang dan yang jatuh.', en: 'Sanitation: remove and destroy infested and fallen fruit.' },
          { id: 'Utamakan musuh alami, jamur entomopatogen dan formulasi nimba.', en: 'Favour natural enemies, entomopathogenic fungi and neem formulations.' },
          { id: 'Jangan semprot insektisida ke bunga yang mekar; jaga kelelawar dan lebah penyerbuk.', en: 'No insecticide on open flowers; protect pollinating bats and bees.' },
          { id: 'Amati setiap tunas daun baru; kutu loncat menyerang daun muda.', en: 'Watch every new leaf flush; psyllids attack young leaves.' },
        ],
      },
    ],
    questions: [
      { id: 'Hama apa yang paling sering dilaporkan di tiap blok, dan bulan apa?', en: 'Which pests are reported most in each block, and in which months?' },
      { id: 'Berapa persen buah rusak penggerek di blok yang dibrongsong vs tidak?', en: 'What share of fruit had borer damage in bagged vs unbagged blocks?' },
    ],
    templates: ['pest'],
    related: ['fruit', 'pollination'],
    sources: [S.conogethes, S.seedBorer, S.kementanPests, S.botanyReview],
  },

  harvest: {
    targets: [
      { label: { id: 'Varietas genjah', en: 'Early varieties' }, value: { id: '90-100 hari setelah mekar', en: '90-100 days after bloom' }, confidence: 'strong' },
      { label: { id: 'Varietas tengah', en: 'Medium varieties' }, value: { id: '100-120 hari', en: '100-120 days' }, confidence: 'strong' },
      { label: { id: 'Varietas lambat', en: 'Late varieties' }, value: { id: '120-130 hari (sangat lambat 140-150)', en: '120-130 days (very late 140-150)' }, confidence: 'strong' },
      { label: { id: 'Tanda paling andal', en: 'Most reliable signs' }, value: { id: 'Umur sejak mekar + bunyi ketukan kopong', en: 'Days since bloom + a hollow tapping sound' }, confidence: 'strong' },
      { label: { id: 'Tingkat matang petik', en: 'Picking maturity' }, value: { id: '±85%: matang dengan mutu sangat baik dalam < 1 minggu', en: '~85%: ripens to excellent quality within a week' }, confidence: 'strong' },
      { label: { id: 'Buah jatuh alami', en: 'Natural drop' }, value: { id: 'Matang dalam 2-4 hari setelah jatuh', en: 'Ripens 2-4 days after dropping' }, confidence: 'strong' },
      { label: { id: 'Musang King', en: 'Musang King' }, value: { id: 'Petik ±15 minggu (±105 hari) setelah mekar; dipetik di minggu 13-14 bahan keringnya belum setara buah jatuh matang (60,18%)', en: 'Pick ~15 weeks (~105 days) after bloom; at weeks 13-14 dry matter had not reached that of naturally dropped fruit (60.18%)' }, confidence: 'study' },
      { label: { id: 'Penyimpanan (Musang King jatuh matang)', en: 'Storage (mature-drop Musang King)' }, value: { id: '7 °C: layak jual sampai 2 minggu tanpa kerusakan dingin; 10-13 °C: busuk jamur dalam 1-2 minggu', en: '7 °C: marketable up to 2 weeks with no chilling injury; 10-13 °C: fungal rot within 1-2 weeks' }, confidence: 'study' },
    ],
    sections: [
      {
        heading: { id: 'Menentukan kematangan', en: 'Judging maturity' },
        points: [
          { id: 'Hitung hari sejak bunga mekar (tanggal berbunga per blok di Jadwal → Panen) dan cocokkan dengan lama matang varietas.', en: 'Count days since bloom (flowering date per block in Schedule → Harvest) and compare with the variety’s ripening days.' },
          { id: 'Ketuk buah: bunyi kopong menandakan matang. Tanda lain: tangkai, duri, aroma, dan garis antar juring.', en: 'Tap the fruit: a hollow sound means mature. Other signs: stalk, spines, smell and the seams between segments.' },
          { id: 'Buah 95% matang saat dipetik sudah mulai matang di pohon; buah 75% matang bisa matang dengan mutu rendah.', en: 'Fruit picked at 95% has already started ripening; fruit at 75% may ripen with poor quality.' },
          { id: 'Buah tumbuh sangat cepat sampai minggu ke-13, lalu melambat sampai matang sekitar minggu ke-16.', en: 'Fruit grows very fast until week 13, then slows until it matures around week 16.' },
          { id: 'Kadar bahan kering daging buah adalah ukuran kematangan yang bisa diukur (dipakai untuk Monthong dan Musang King); bila ragu, timbang daging sebelum dan sesudah dikeringkan.', en: 'Pulp dry matter is a measurable maturity index (used for Monthong and Musang King); when in doubt, weigh pulp before and after drying.' },
        ],
      },
      {
        heading: { id: 'Menjaga mutu', en: 'Protecting quality' },
        points: [
          { id: 'Ikat tangkai buah ke cabang sebelum matang: tidak patah oleh angin, dan buah yang lepas tertahan tali, tidak terbanting.', en: 'Tie fruit stalks to branches before maturity: wind cannot snap them, and a fruit that lets go hangs on the string instead of hitting the ground.' },
          { id: 'Hujan lebat saat buah matang adalah penyebab utama daging basah dan matang tidak merata; tunas daun saat buah tumbuh juga dikaitkan dengannya.', en: 'Heavy rain while fruit matures is a main cause of wet core and uneven ripening; leaf flushing during fruit growth is also linked.' },
          { id: 'Hormati jeda sebelum panen (PHI) semua semprotan.', en: 'Respect the pre-harvest interval (PHI) of every spray.' },
        ],
      },
    ],
    questions: [
      { id: 'Berapa hari nyata dari mekar sampai panen untuk tiap varietas di kebun ini?', en: 'How many days does each variety really take from bloom to harvest on this farm?' },
      { id: 'Super Tembaga dan varietas lokal lain: belum ada angka terbitan yang bisa dipercaya; catat sendiri.', en: 'Super Tembaga and other local varieties: no reliable published figure found; record your own.' },
    ],
    related: ['records', 'water', 'pests'],
    sources: [S.itfPost, S.ucdavis, S.paullKetsa, S.mkHarvestAge, S.mkStorage, S.umurPanen, S.mkDevelopment, S.bawor, S.topFruitsHarvest],
  },

  records: {
    targets: [
      { label: { id: 'Tanggal mekar per blok', en: 'Bloom date per block' }, value: { id: 'Setiap musim (Jadwal → Panen)', en: 'Every season (Schedule → Harvest)' }, confidence: 'strong' },
      { label: { id: 'Lama matang per varietas', en: 'Ripening days per variety' }, value: { id: 'Diperbarui dari panen nyata (Varietas)', en: 'Updated from real harvests (Variants)' }, confidence: 'strong' },
      { label: { id: 'Jumlah buah per pohon', en: 'Fruit per tree' }, value: { id: 'Setelah penjarangan', en: 'After thinning' }, confidence: 'rule' },
      { label: { id: 'Lingkar batang & lebar tajuk', en: 'Trunk girth & canopy width' }, value: { id: 'Setahun sekali', en: 'Once a year' }, confidence: 'rule' },
      { label: { id: 'Analisis daun & pH tanah', en: 'Leaf analysis & soil pH' }, value: { id: 'Setahun sekali, sebelum berbunga', en: 'Once a year, before flowering' }, confidence: 'study' },
      { label: { id: 'Hujan harian', en: 'Daily rain' }, value: { id: 'Penakar hujan sederhana', en: 'A simple rain gauge' }, confidence: 'rule' },
    ],
    sections: [
      {
        heading: { id: 'Kenapa mencatat', en: 'Why record' },
        points: [
          { id: 'Literatur memberi rentang umum. Hanya catatan kebun ini yang bisa menunjukkan kapan blok Anda berbunga, berapa hari varietas Anda matang, dan berapa buah yang sanggup dibawa pohon Anda.', en: 'The literature gives general ranges. Only this farm’s records show when your blocks flower, how long your varieties take, and how much fruit your trees can carry.' },
          { id: 'Setiap tahap dan tindakan di Panduan dihitung dari tanggal mekar per blok; tanpa tanggal itu, Panduan hanya bisa memberi saran umum.', en: 'Every stage and action in the Guide is counted from the bloom date per block; without it the Guide can only give general advice.' },
          { id: 'Laporan WhatsApp yang menyebut gejala (getah, ulat, daun kuning) otomatis ditautkan ke topik yang sesuai.', en: 'WhatsApp reports that mention symptoms (ooze, caterpillars, yellow leaves) are linked to the matching topic automatically.' },
        ],
      },
    ],
    questions: [
      { id: 'Apa yang dipelajari musim ini yang harus diingat musim depan?', en: 'What did this season teach that should be remembered next season?' },
    ],
    related: ['harvest', 'flowering', 'nutrition'],
    sources: [S.drySpell, S.itfPost, S.leafStandards],
  },
};
