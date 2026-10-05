// GENERATED from src/shared by scripts/build-bot-shared.mjs. Do not edit: change src/shared, then npm run build:bot-shared.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/shared/index.ts
var index_exports = {};
__export(index_exports, {
  DEFAULT_LABEL_RULES: () => DEFAULT_LABEL_RULES,
  FARM_STAGES: () => FARM_STAGES,
  FARM_STAGE_INFO: () => FARM_STAGE_INFO,
  HEALTH: () => HEALTH,
  HEALTH_INFO: () => HEALTH_INFO,
  IMPROVING: () => IMPROVING,
  ISSUES: () => ISSUES,
  ISSUE_INFO: () => ISSUE_INFO,
  LABEL_RULES: () => LABEL_RULES,
  TRIAGE_RULES_VERSION: () => TRIAGE_RULES_VERSION,
  checkLabelRules: () => checkLabelRules,
  doseSuggestion: () => doseSuggestion,
  hasWord: () => hasWord,
  healthOf: () => healthOf,
  isFarmStage: () => isFarmStage,
  isIssue: () => isIssue,
  labelBatang: () => labelBatang,
  labelEst: () => labelEst,
  labelFruitset: () => labelFruitset,
  labelTajuk: () => labelTajuk,
  mergeLabelRules: () => mergeLabelRules,
  normalize: () => normalize,
  stageMismatch: () => stageMismatch,
  triageText: () => triageText,
  workerReply: () => workerReply,
  worstHealth: () => worstHealth
});
module.exports = __toCommonJS(index_exports);

// src/shared/text.ts
function normalize(text) {
  return (text || "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}.,\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function hasWord(text, kw) {
  const whole = kw.startsWith("=") || kw.replace(/\s/g, "").length <= 3;
  const k = kw.replace(/^=/, "");
  if (!whole) return text.includes(k);
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, "u").test(text);
}

// src/shared/stages.ts
var FARM_STAGES = ["veg", "rest", "bud", "bloom", "set", "pingpong", "egg", "grow", "mature", "harvest", "post"];
var FARM_STAGE_INFO = {
  veg: {
    code: "veg",
    label: { id: "Vegetatif (tunas daun)", en: "Vegetative (leaf flush)" },
    sees: { id: "Daun muda baru keluar, warna terang", en: "New light-coloured young leaves" },
    engine: "recovery",
    keywords: ["tunas daun", "daun muda", "pupus", "flush", "vegetatif", "trubus"]
  },
  rest: {
    code: "rest",
    label: { id: "Daun tua, siap bunga", en: "Mature leaves, ready to flower" },
    sees: { id: "Daun tua hijau gelap, belum ada kuncup", en: "Dark mature leaves, no buds yet" },
    engine: "preflower",
    keywords: ["daun tua", "siap bunga", "belum berbunga", "belum ada bunga", "tidak berbunga", "tidak ada bunga", "no flower", "istirahat"]
  },
  bud: {
    code: "bud",
    label: { id: "Mata ketam", en: "Crab eye (flower buds)" },
    sees: { id: "Kuncup bulat kecil di dahan", en: "Small round buds on the branches" },
    engine: "preflower",
    keywords: ["mata ketam", "matketam", "kuncup", "bakal bunga", "calon bunga"]
  },
  bloom: {
    code: "bloom",
    label: { id: "Bunga mekar", en: "Flowers open" },
    sees: { id: "Bunga terbuka, mekar sore hari", en: "Open flowers, opening in the evening" },
    engine: "bloom",
    keywords: ["mekar", "berbunga", "bunga", "kembang"]
  },
  set: {
    code: "set",
    label: { id: "Pentil (buah jadi)", en: "Fruit set" },
    sees: { id: "Buah kecil setelah kelopak rontok", en: "Tiny fruit after the petals drop" },
    engine: "set",
    keywords: ["pentil", "buah jadi", "bakal buah", "buah kecil", "putik"]
  },
  pingpong: {
    code: "pingpong",
    label: { id: "Ping pong", en: "Ping-pong size" },
    sees: { id: "Buah sebesar bola pingpong", en: "Fruit the size of a ping-pong ball" },
    engine: "thin",
    keywords: ["ping pong", "pingpong", "pimpong", "=pp"]
  },
  egg: {
    code: "egg",
    label: { id: "Telor", en: "Egg size" },
    sees: { id: "Buah sebesar telur", en: "Fruit the size of an egg" },
    engine: "thin",
    keywords: ["telor", "telur"]
  },
  grow: {
    code: "grow",
    label: { id: "Buah besar", en: "Fruit growing" },
    sees: { id: "Buah membesar cepat", en: "Fruit growing fast" },
    engine: "grow",
    keywords: ["buah besar", "membesar", "sebesar kepala", "buah tua"]
  },
  mature: {
    code: "mature",
    label: { id: "Menjelang matang", en: "Maturing" },
    sees: { id: "Bulan terakhir: duri merenggang, bunyi ketukan nyaring", en: "Last month: spines spread, hollow sound when tapped" },
    engine: "mature",
    keywords: ["menjelang matang", "hampir matang", "mau matang", "duri merenggang"]
  },
  harvest: {
    code: "harvest",
    label: { id: "Panen", en: "Harvest" },
    sees: { id: "Buah jatuh atau dipetik", en: "Fruit falling or being picked" },
    engine: "harvest",
    keywords: ["panen", "petik", "buah jatuh", "jatuhan", "matang"]
  },
  post: {
    code: "post",
    label: { id: "Pemulihan", en: "Recovery" },
    sees: { id: "Setelah panen: pangkas, pupuk, tunggu tunas", en: "After harvest: prune, feed, wait for the flush" },
    engine: "recovery",
    keywords: ["habis panen", "selesai panen", "sudah panen", "pemulihan", "pasca panen"]
  }
};
var isFarmStage = (s) => typeof s === "string" && FARM_STAGES.includes(s);
var COMPATIBLE = {
  veg: ["recovery", "preflower"],
  rest: ["preflower", "recovery"],
  bud: ["preflower"],
  bloom: ["bloom", "preflower"],
  set: ["set", "bloom", "thin"],
  pingpong: ["thin", "set", "grow"],
  egg: ["thin", "grow"],
  grow: ["grow", "thin", "mature"],
  mature: ["mature", "grow", "harvest"],
  harvest: ["harvest", "mature"],
  post: ["recovery", "harvest", "preflower"]
};
function stageMismatch(observed, expected) {
  return !!expected && !COMPATIBLE[observed].includes(expected);
}

// src/shared/issues.ts
var ISSUES = [
  "phytophthora_canker",
  "stem_fungus",
  "leaf_blight",
  "whitefly",
  "borer",
  "leaf_drop",
  "fruit_drop",
  "nutrient",
  "water",
  "other"
];
var ISSUE_INFO = {
  phytophthora_canker: {
    code: "phytophthora_canker",
    label: { id: "Kanker batang (getah merah)", en: "Stem canker (Phytophthora)" },
    topic: "phytophthora",
    health: "merah",
    nextStep: { id: "Foto dekat bagian batang yang basah/bergetah. Jangan dilukai dulu; admin akan cek hari ini.", en: "Take a close photo of the wet/oozing bark. Don't cut yet; the admin will check today." },
    keywords: ["kanker", "getah merah", "getah", "blendok", "busuk batang", "kulit basah", "batang basah", "kulit busuk", "phytophthora", "fitoftora"]
  },
  stem_fungus: {
    code: "stem_fungus",
    label: { id: "Jamur batang / dahan", en: "Stem or branch fungus" },
    topic: "diseases",
    health: "kuning",
    nextStep: { id: "Foto dekat jamurnya. Tandai dahan yang kena.", en: "Take a close photo of the fungus. Mark the affected branch." },
    keywords: ["jamur upas", "jamur batang", "jamur dahan", "jamur", "cendawan", "lumut kerak"]
  },
  leaf_blight: {
    code: "leaf_blight",
    label: { id: "Hawar daun", en: "Leaf blight" },
    topic: "diseases",
    health: "kuning",
    nextStep: { id: "Foto daun yang kena dari dekat dan satu foto seluruh tajuk.", en: "Take a close photo of the leaves and one of the whole canopy." },
    keywords: ["hawar", "daun gosong", "daun terbakar", "bercak daun", "daun bercak", "ujung daun kering", "daun kering"]
  },
  whitefly: {
    code: "whitefly",
    label: { id: "Kutu kebul", en: "Whitefly" },
    topic: "pests",
    health: "kuning",
    nextStep: { id: "Foto bagian bawah daun. Lihat apakah ada di pohon sebelah juga.", en: "Photograph the underside of the leaves. Check the neighbouring trees too." },
    keywords: ["kutu kebul", "kebul", "kutu putih", "kutu daun", "kutu"]
  },
  borer: {
    code: "borer",
    label: { id: "Penggerek", en: "Borer" },
    topic: "pests",
    health: "kuning",
    nextStep: { id: "Foto lubangnya dari dekat. Pisahkan buah yang berlubang.", en: "Close photo of the holes. Separate the bored fruit." },
    keywords: ["penggerek", "ulat", "lubang", "larva", "berlubang"]
  },
  leaf_drop: {
    code: "leaf_drop",
    label: { id: "Rontok daun", en: "Leaf drop" },
    topic: "water",
    health: "kuning",
    nextStep: { id: "Foto seluruh pohon dan tanah di bawahnya (kering atau tergenang?).", en: "Photograph the whole tree and the soil under it (dry or waterlogged?)." },
    keywords: ["rontok daun", "daun rontok", "daun gugur", "meranggas", "daun jatuh"]
  },
  fruit_drop: {
    code: "fruit_drop",
    label: { id: "Rontok bunga / buah", en: "Flower or fruit drop" },
    topic: "fruit",
    health: "kuning",
    nextStep: { id: "Hitung kira-kira berapa buah yang jatuh dan foto buahnya.", en: "Roughly count the fallen fruit and photograph them." },
    keywords: ["buah rontok", "rontok buah", "bunga rontok", "rontok bunga", "buah gugur", "rontok"]
  },
  nutrient: {
    code: "nutrient",
    label: { id: "Kurang hara (daun kuning / sedikit)", en: "Nutrient problem (yellow or few leaves)" },
    topic: "nutrition",
    health: "kuning",
    nextStep: { id: "Foto daun tua dan daun muda berdampingan.", en: "Photograph old and young leaves side by side." },
    keywords: ["daun kuning", "menguning", "kurang daun", "daun kurang", "daun pucat", "pucat"]
  },
  water: {
    code: "water",
    label: { id: "Air (kering / tergenang)", en: "Water (dry / waterlogged)" },
    topic: "water",
    health: "kuning",
    nextStep: { id: "Foto tanah di bawah tajuk.", en: "Photograph the soil under the canopy." },
    keywords: ["tergenang", "genangan", "banjir", "becek", "kekeringan", "layu", "tanah kering"]
  },
  other: {
    code: "other",
    label: { id: "Lainnya", en: "Other" },
    topic: "diseases",
    health: "kuning",
    nextStep: { id: "Admin akan cek fotonya.", en: "The admin will check the photo." },
    keywords: []
  }
};
var isIssue = (s) => typeof s === "string" && ISSUES.includes(s);

// src/shared/health.ts
var HEALTH = ["hijau", "kuning", "merah"];
var HEALTH_INFO = {
  hijau: { label: { id: "Hijau", en: "Green" }, condition: "healthy", meaning: { id: "Sehat", en: "Healthy" } },
  kuning: { label: { id: "Kuning", en: "Yellow" }, condition: "minor", meaning: { id: "Ada masalah, pantau", en: "Has a problem, watch it" } },
  merah: { label: { id: "Merah", en: "Red" }, condition: "emergency", meaning: { id: "Darurat, tangani segera", en: "Emergency, act now" } }
};
var IMPROVING = { id: "Membaik", en: "Improving" };
function healthOf(condition) {
  const c = (condition || "").toLowerCase();
  if (c === "healthy") return "hijau";
  if (c === "minor" || c === "minor_issue") return "kuning";
  if (c === "emergency") return "merah";
  return null;
}
var RANK = { hijau: 0, kuning: 1, merah: 2 };
var worstHealth = (a, b) => !a ? b : !b ? a : RANK[a] >= RANK[b] ? a : b;

// src/shared/triage.ts
var TRIAGE_RULES_VERSION = "rules-1";
var NEGATIONS = ["tidak", "tak", "bukan", "belum", "tanpa", "no", "gak", "nggak", "ga"];
var URGENT = ["darurat", "parah", "sekarat", "hampir mati", "mati", "=sos"];
var FINE = ["sehat", "aman", "bagus", "normal", "=baik", "oke", "=ok"];
var BETTER = ["membaik", "mulai baik", "sudah baik", "pulih", "sembuh", "lebih baik"];
function negated(text, kw) {
  const k = kw.replace(/^=/, "");
  const i = text.indexOf(k);
  if (i < 0) return false;
  const before = text.slice(Math.max(0, i - 14), i).trim().split(" ").slice(-2);
  return before.some((w) => NEGATIONS.includes(w));
}
function matches(text, keywords) {
  return keywords.filter((kw) => hasWord(text, kw) && !negated(text, kw)).map((k) => k.replace(/^=/, ""));
}
var UNIT_WORDS = [
  ["fruit", ["buah", "butir"]],
  ["clusters", ["bonggol", "tandan", "kelompok bunga"]],
  ["branches", ["dahan", "cabang"]],
  ["mm", ["mm", "milimeter"]]
];
function findNumbers(text) {
  const out = [];
  const re = /(\d+(?:[.,]\d+)?)/g;
  let m;
  while (m = re.exec(text)) {
    const value = Number(m[1].replace(",", "."));
    if (!Number.isFinite(value)) continue;
    const after = text.slice(m.index + m[1].length, m.index + m[1].length + 18).trim();
    const before = text.slice(Math.max(0, m.index - 18), m.index).trim();
    let kind;
    for (const [k, words] of UNIT_WORDS) {
      if (words.some((w) => after.startsWith(w) || before.endsWith(w) || before.endsWith(`${w} :`) || before.endsWith(`${w}:`))) {
        kind = k;
        break;
      }
    }
    out.push({ value, kind, evidence: `${before.split(" ").slice(-1)[0] || ""} ${m[1]} ${after.split(" ")[0] || ""}`.trim() });
  }
  return out;
}
function triageText(raw) {
  const text = normalize(raw);
  const stageHits = FARM_STAGES.flatMap((code) => matches(text, FARM_STAGE_INFO[code].keywords).map((kw) => ({ code, kw })));
  stageHits.sort((a, b) => b.kw.length - a.kw.length);
  const best = stageHits[0];
  const distinct = new Set(stageHits.filter((h) => !best || !best.kw.includes(h.kw)).map((h) => h.code));
  const stage = best ? { code: best.code, confidence: distinct.size > 1 ? 0.4 : 0.6, evidence: best.kw } : void 0;
  const issueHits = ISSUES.flatMap((code) => matches(text, ISSUE_INFO[code].keywords).map((kw) => ({ code, kw })));
  const kept = issueHits.filter((h) => !issueHits.some((o) => o.code !== h.code && o.kw.length > h.kw.length && o.kw.includes(h.kw)));
  const issues = [];
  for (const h of kept) {
    if (!issues.some((i) => i.code === h.code)) issues.push({ code: h.code, confidence: 0.6, evidence: h.kw });
  }
  let health;
  for (const i of issues) health = worstHealth(health, ISSUE_INFO[i.code].health);
  if (matches(text, URGENT).length) health = "merah";
  if (!health && matches(text, FINE).length) health = "hijau";
  const improving = matches(text, BETTER).length > 0;
  const numbers = findNumbers(text);
  const needsReview = !(health === "hijau" && issues.length === 0);
  return { source: "rules", version: TRIAGE_RULES_VERSION, stage, issues, health, improving, numbers, needsReview };
}
function workerReply(t) {
  const parts = [];
  if (t.stage) parts.push(`Tahap: ${FARM_STAGE_INFO[t.stage.code].label.id}.`);
  if (t.issues.length) {
    const first = ISSUE_INFO[t.issues[0].code];
    parts.push(`Kemungkinan: ${t.issues.map((i) => ISSUE_INFO[i.code].label.id).join(", ")}.`);
    parts.push(first.nextStep.id);
  } else if (t.health === "hijau") {
    parts.push("Terima kasih, pohon terlihat sehat.");
  }
  if (t.health && t.health !== "hijau") parts.push(`Status: ${HEALTH_INFO[t.health].label.id}${t.improving ? " (membaik)" : ""}.`);
  parts.push("Admin akan cek laporan ini.");
  return parts.join(" ");
}

// src/shared/labels.ts
var DEFAULT_LABEL_RULES = {
  batang: { skipMax: 20, lowMax: 37, midMax: 55 },
  tajuk: { lowMax: 339, midMax: 549 },
  est: { skipMax: 1, lowMax: 14, midMax: 47 },
  fruitset: { lowMax: 5, midMax: 11 },
  dose: { fruiting: { low: 0.5, mid: 0.75, high: 1 }, vegetative: { high: 1, other: 0.5 }, young: 1, unit: "" },
  products: { fruiting: "NPK Perfect", vegetative: "YM Winner", young: "YM Winner" },
  confirmed: false
};
var LABEL_RULES = DEFAULT_LABEL_RULES;
var band = (v, lowMax, midMax) => v === void 0 || !Number.isFinite(v) ? void 0 : v <= lowMax ? "low" : v <= midMax ? "mid" : "high";
function labelBatang(girth, r = DEFAULT_LABEL_RULES) {
  if (girth === void 0 || !Number.isFinite(girth)) return void 0;
  return girth <= r.batang.skipMax ? "skip" : band(girth, r.batang.lowMax, r.batang.midMax);
}
var labelTajuk = (canopy, r = DEFAULT_LABEL_RULES) => band(canopy, r.tajuk.lowMax, r.tajuk.midMax);
function labelEst(est, r = DEFAULT_LABEL_RULES) {
  if (est === void 0 || !Number.isFinite(est)) return void 0;
  return est <= r.est.skipMax ? "skip" : band(est, r.est.lowMax, r.est.midMax);
}
function labelFruitset(fruit, r = DEFAULT_LABEL_RULES) {
  if (fruit === void 0 || !Number.isFinite(fruit)) return void 0;
  return fruit <= 0 ? "skip" : band(fruit, r.fruitset.lowMax, r.fruitset.midMax);
}
function doseSuggestion(x, r = DEFAULT_LABEL_RULES) {
  if (x.fruitset && x.fruitset !== "skip") return { product: r.products.fruiting, dose: r.dose.fruiting[x.fruitset] };
  if (x.batang === "skip") return { product: r.products.young, dose: r.dose.young };
  if (x.tajuk) return { product: r.products.vegetative, dose: x.tajuk === "high" ? r.dose.vegetative.high : r.dose.vegetative.other };
  return void 0;
}
function mergeLabelRules(stored) {
  const d = DEFAULT_LABEL_RULES;
  const s = stored && typeof stored === "object" ? stored : {};
  const n = (v, fallback) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
  const str = (v, fallback) => typeof v === "string" ? v.trim().slice(0, 60) : fallback;
  const pick = (src, def) => {
    const o = src && typeof src === "object" ? src : {};
    return Object.fromEntries(Object.entries(def).map(([k, v]) => [k, n(o[k], v)]));
  };
  const dose = s.dose && typeof s.dose === "object" ? s.dose : {};
  const products = s.products && typeof s.products === "object" ? s.products : {};
  return {
    batang: pick(s.batang, d.batang),
    tajuk: pick(s.tajuk, d.tajuk),
    est: pick(s.est, d.est),
    fruitset: pick(s.fruitset, d.fruitset),
    dose: {
      fruiting: pick(dose.fruiting, d.dose.fruiting),
      vegetative: pick(dose.vegetative, d.dose.vegetative),
      young: n(dose.young, d.dose.young),
      unit: str(dose.unit, d.dose.unit)
    },
    products: {
      fruiting: str(products.fruiting, d.products.fruiting) || d.products.fruiting,
      vegetative: str(products.vegetative, d.products.vegetative) || d.products.vegetative,
      young: str(products.young, d.products.young) || d.products.young
    },
    confirmed: s.confirmed === true
  };
}
function checkLabelRules(r) {
  const out = [];
  const order = (name, ...v) => {
    for (let i = 1; i < v.length; i++) if (!(v[i] > v[i - 1])) return out.push({ key: "rules.err.order", vars: { name } });
  };
  order("batang", r.batang.skipMax, r.batang.lowMax, r.batang.midMax);
  order("tajuk", r.tajuk.lowMax, r.tajuk.midMax);
  order("est", r.est.skipMax, r.est.lowMax, r.est.midMax);
  order("fruitset", 0, r.fruitset.lowMax, r.fruitset.midMax);
  const doses = [r.dose.fruiting.low, r.dose.fruiting.mid, r.dose.fruiting.high, r.dose.vegetative.high, r.dose.vegetative.other, r.dose.young];
  if (doses.some((x) => !Number.isFinite(x) || x < 0 || x > 100)) out.push({ key: "rules.err.dose" });
  if (!r.products.fruiting.trim() || !r.products.vegetative.trim() || !r.products.young.trim()) out.push({ key: "rules.err.product" });
  return out;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_LABEL_RULES,
  FARM_STAGES,
  FARM_STAGE_INFO,
  HEALTH,
  HEALTH_INFO,
  IMPROVING,
  ISSUES,
  ISSUE_INFO,
  LABEL_RULES,
  TRIAGE_RULES_VERSION,
  checkLabelRules,
  doseSuggestion,
  hasWord,
  healthOf,
  isFarmStage,
  isIssue,
  labelBatang,
  labelEst,
  labelFruitset,
  labelTajuk,
  mergeLabelRules,
  normalize,
  stageMismatch,
  triageText,
  workerReply,
  worstHealth
});
