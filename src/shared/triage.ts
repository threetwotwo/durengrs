import { FARM_STAGES, FARM_STAGE_INFO, type FarmStage } from './stages';
import { ISSUES, ISSUE_INFO, type Issue } from './issues';
import { HEALTH_INFO, worstHealth, type Health } from './health';
import { normalize, wordHits } from './text';
import { TREATMENT_PRODUCTS, TREATMENT_WORDS, TREATS, type Action, type CaseUpdate } from './actions';

/**
 * Field report triage: what a worker's report is probably about. The worker only sends tree + photo + words;
 * this suggests the stage, the issues, the health and any numbers, and a person confirms (review inbox).
 *
 * `triageText` is the free, rule-based version (words only), shared with the WhatsApp bot so its instant reply and
 * the web app's suggestion are the same. A photo model can later fill the same `Triage` shape (source 'ai').
 */
export const TRIAGE_RULES_VERSION = 'rules-2';

export type NumberKind = 'fruit' | 'clusters' | 'branches' | 'mm';

export interface Triage {
  source: 'rules' | 'ai';
  /** Rules version, or model + prompt version for 'ai'. */
  version: string;
  stage?: { code: FarmStage; confidence: number; evidence: string };
  /**
   * Problems seen. A Gemini reading also names the specific pest or disease (`name`), the first step for the worker
   * (`action`) and the photo it is in.
   */
  issues: Array<{ code: Issue; confidence: number; evidence: string; name?: string; action?: string; photo?: number }>;
  health?: Health;
  /** The worker says it is getting better ("membaik"). */
  improving: boolean;
  /**
   * The words say the tree is in danger right now ("darurat", "hampir mati", "tumbang"), not merely that a serious
   * problem may be present. Only this lets the bot turn a tree Merah before anyone checks. Missing on older triage.
   */
  urgent?: boolean;
  numbers: Array<{ value: number; kind?: NumberKind; evidence: string }>;
  /** False only for a plain "all fine" report: nothing for a person to decide. */
  needsReview: boolean;

  // ---- Gemini reading only (source 'ai', bot/lib/ai.js) ----
  /** Every stage seen (a tree can show two at once); `stage` is the most likely one. */
  stages?: Array<{ code: FarmStage; confidence: number; evidence: string }>;
  /** One or two sentences in Indonesian: what the photos and words show. */
  summary?: string;
  /** What each photo shows, by photo number. */
  photosSeen?: Array<{ photo: number; seen: string }>;
  photoOk?: boolean;
  /** When a photo is not good enough: what to photograph instead (Indonesian). */
  photoRequest?: string;
  /** Work the worker did: treatments against a problem and routine care. */
  actions?: Array<{ type: Action; issue: Issue | 'none'; evidence: string; product?: string; target?: string; case?: number; photo?: number }>;
  /** Progress on the tree's open cases, numbered as Gemini was shown them. */
  caseUpdates?: Array<{ case: number; status: CaseUpdate; evidence: string }>;
  /** Fruit picked, as the worker wrote it (also saved as a harvest record). */
  harvest?: { fruits: number; weightKg?: number; grades?: Partial<Record<'extra' | 'class1' | 'class2' | 'reject', number>> };
}

// Not "no": workers write it for "nomor" ("pohon no 12").
const NEGATIONS = ['tidak', 'tak', 'tdk', 'bukan', 'bkn', 'belum', 'blm', 'tanpa', 'gak', 'nggak', 'ngga', 'ga', 'gk', 'enggak', 'engga', 'ndak', 'nda', 'jangan'];
/** "kurang bagus", "kurang sehat": only negates the all-fine words. */
const FINE_NEGATIONS = [...NEGATIONS, 'kurang', 'agak'];
/** Danger now. A disease name alone is not enough (that waits for a person); these words are. */
const URGENT = ['darurat', 'parah', 'sekarat', 'hampir mati', 'pohon mati', 'mati total', 'sudah mati', 'tumbang', 'roboh', '=sos'];
const FINE = ['sehat', 'aman', 'bagus', 'normal', '=baik', 'oke', '=ok'];
// Not "berkurang" or "sudah hilang": "daun berkurang", "daun sudah hilang semua" are bad news.
const BETTER = ['membaik', 'mulai baik', 'sudah baik', 'lebih baik', 'pulih', 'sembuh'];
/** Words that may sit between a negation and what it negates: "tidak ada kutu", "tdk terlihat lagi getah". */
const FILLER = ['ada', 'terlihat', 'kelihatan', 'keliatan', 'tampak', 'nampak', 'ditemukan', 'ketemu', 'terdapat', 'muncul', 'lagi', 'terlalu', 'begitu', 'pernah', 'sama', 'sekali', 'juga'];

/**
 * The occurrence at `at` is negated: a negation right before it, or up to three words back with only filler words
 * in between, within the same phrase ("tidak ada kutu", "tdk terlihat getah"; but not "tidak berbunga. ada kutu",
 * nor "tidak ada kutu daun kuning" for "daun kuning").
 */
function negatedAt(text: string, at: number, negations: string[]): boolean {
  const before = text.slice(Math.max(0, at - 60), at);
  const phrase = before.split(/[.,;]/).pop() || '';
  const words = phrase.trim().split(' ').filter(Boolean).slice(-3).reverse();
  for (const w of words) {
    if (negations.includes(w)) return true;
    if (!FILLER.includes(w)) return false;
  }
  return false;
}

/** Keywords found in `text` with at least one occurrence that isn't negated. */
function matches(text: string, keywords: string[], negations = NEGATIONS): string[] {
  return keywords
    .filter((kw) => wordHits(text, kw).some((at) => !negatedAt(text, at, negations)))
    .map((k) => k.replace(/^=/, ''));
}

/** Keywords found only in negated form ("tidak sehat"). */
function negatedOnly(text: string, keywords: string[], negations: string[]): boolean {
  return keywords.some((kw) => {
    const hits = wordHits(text, kw);
    return hits.length > 0 && hits.every((at) => negatedAt(text, at, negations));
  });
}

const UNIT_WORDS: Array<[NumberKind, string[]]> = [
  ['fruit', ['buah', 'butir']],
  ['clusters', ['bonggol', 'tandan', 'kelompok bunga']],
  ['branches', ['dahan', 'cabang']],
  ['mm', ['mm', 'milimeter']],
];

function findNumbers(text: string): Triage['numbers'] {
  const out: Triage['numbers'] = [];
  const re = /(\d+(?:[.,]\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const value = Number(m[1].replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    const after = text.slice(m.index + m[1].length, m.index + m[1].length + 18).trim();
    const before = text.slice(Math.max(0, m.index - 18), m.index).trim();
    let kind: NumberKind | undefined;
    for (const [k, words] of UNIT_WORDS) {
      if (words.some((w) => after.startsWith(w) || before.endsWith(w) || before.endsWith(`${w} :`) || before.endsWith(`${w}:`))) {
        kind = k;
        break;
      }
    }
    const evidence = `${before.split(' ').slice(-1)[0] || ''} ${m[1]} ${after.split(' ')[0] || ''}`.trim();
    out.push(kind ? { value, kind, evidence } : { value, evidence }); // no undefined fields: Firestore refuses them
  }
  return out;
}

export function triageText(raw: string | undefined): Triage {
  // A line break, "!" or "?" ends a phrase like a full stop (WhatsApp messages often have no other punctuation).
  const text = normalize((raw || '').replace(/[\r\n!?]+/g, '. '));

  // Stage: the most specific (longest) matching word wins; several different stages lower the confidence.
  const stageHits = FARM_STAGES.flatMap((code) => matches(text, FARM_STAGE_INFO[code].keywords).map((kw) => ({ code, kw })));
  stageHits.sort((a, b) => b.kw.length - a.kw.length);
  const best = stageHits[0];
  const distinct = new Set(stageHits.filter((h) => !best || !best.kw.includes(h.kw)).map((h) => h.code));
  const stage = best ? { code: best.code, confidence: distinct.size > 1 ? 0.4 : 0.6, evidence: best.kw } : undefined;

  // Issues: drop a match whose word sits inside a longer word matched for another issue ("rontok" in "rontok daun").
  const issueHits = ISSUES.flatMap((code) => matches(text, ISSUE_INFO[code].keywords).map((kw) => ({ code, kw })));
  const kept = issueHits.filter((h) => !issueHits.some((o) => o.code !== h.code && o.kw.length > h.kw.length && o.kw.includes(h.kw)));
  const issues: Triage['issues'] = [];
  for (const h of kept) {
    if (!issues.some((i) => i.code === h.code)) issues.push({ code: h.code, confidence: 0.6, evidence: h.kw });
  }

  const improving = matches(text, BETTER).length > 0;
  let health: Health | undefined;
  for (const i of issues) health = worstHealth(health, ISSUE_INFO[i.code].health);
  // "tidak sehat", "kurang bagus": something is wrong even if no problem word was used.
  const notFine = negatedOnly(text, FINE, FINE_NEGATIONS);
  if (notFine) health = worstHealth(health, 'kuning');
  // Danger words are always suggested as Merah; only when the worker doesn't also say it is getting better may the
  // bot act on them by itself.
  const danger = matches(text, URGENT).length > 0;
  const urgent = danger && !improving;
  if (danger) health = 'merah';
  if (!health && matches(text, FINE, FINE_NEGATIONS).length) health = 'hijau';

  const numbers = findNumbers(text);
  const needsReview = !(health === 'hijau' && issues.length === 0);
  // Only defined fields: Firestore refuses `undefined` values, and this object is stored as is.
  const out: Triage = { source: 'rules', version: TRIAGE_RULES_VERSION, issues, improving, urgent, numbers, needsReview };
  if (stage) out.stage = stage;
  if (health) out.health = health;
  return out;
}

/** Words that mean a treatment is not done (yet) when they come earlier in the same phrase: "perlu dikerok". */
const NOT_DONE = [...NEGATIONS, 'perlu', 'harus', 'sebaiknya', 'segera', 'disarankan', 'butuh', 'akan', 'rencana', 'nanti', 'mau', 'jika', 'kalau'];

/**
 * Treatment done on the tree, from words ("batang dikerok dan dioles Ridomil"), for each of `issues` it treats. Used
 * when Gemini's reading has no list of actions (a failed or older reading). A treatment word with "belum", "perlu",
 * "harus"… earlier in its phrase is not counted. Scraping and painting a canker with a fungicide paste is one
 * treatment (canker_treatment, with the product), not also a fungicide spray.
 */
export function treatmentsInText(raw: string | undefined, issues: Issue[]): Array<{ type: Action; issue: Issue; evidence: string; product?: string }> {
  const text = normalize((raw || '').replace(/[\r\n!?]+/g, '. '));
  const done = (kw: string) =>
    wordHits(text, kw).some((at) => {
      const phrase = text.slice(Math.max(0, at - 80), at).split(/[.,;]/).pop() || '';
      return !phrase.split(' ').some((w) => NOT_DONE.includes(w));
    });
  // The phrase the word sits in, as the evidence ("batang dikerok hingga jaringan kayu dan diolesi pasta").
  const phraseOf = (kw: string) => {
    const at = wordHits(text, kw)[0];
    const start = Math.max(text.lastIndexOf('.', at), text.lastIndexOf(',', at), text.lastIndexOf(';', at)) + 1;
    const ends = ['.', ',', ';'].map((p) => text.indexOf(p, at)).filter((i) => i >= 0);
    return text.slice(start, ends.length ? Math.min(...ends) : text.length).trim().slice(0, 120);
  };
  const found = new Map<Action, string>();
  for (const [type, words] of Object.entries(TREATMENT_WORDS) as Array<[Action, string[]]>) {
    const kw = words.find(done);
    if (kw) found.set(type, phraseOf(kw));
  }
  if (found.has('canker_treatment')) found.delete('fungicide');
  const product = TREATMENT_PRODUCTS.find(done);
  const out: Array<{ type: Action; issue: Issue; evidence: string; product?: string }> = [];
  for (const [type, evidence] of found) {
    for (const issue of issues) {
      if (!(TREATS[type] || []).includes(issue)) continue;
      const a: { type: Action; issue: Issue; evidence: string; product?: string } = { type, issue, evidence };
      if (product && type !== 'sanitation') a.product = product[0].toUpperCase() + product.slice(1);
      out.push(a);
    }
  }
  return out;
}

/** Short WhatsApp reply in plain Indonesian: what it looks like and one next step. */
export function workerReply(t: Triage): string {
  const parts: string[] = [];
  if (t.stage) parts.push(`Tahap: ${FARM_STAGE_INFO[t.stage.code].label.id}.`);
  if (t.issues.length) {
    const first = ISSUE_INFO[t.issues[0].code];
    parts.push(`Kemungkinan: ${t.issues.map((i) => ISSUE_INFO[i.code].label.id).join(', ')}.`);
    parts.push(first.nextStep.id);
  } else if (t.health === 'hijau') {
    parts.push('Terima kasih, pohon terlihat sehat.');
  }
  if (t.health && t.health !== 'hijau') parts.push(`Status: ${HEALTH_INFO[t.health].label.id}${t.improving ? ' (membaik)' : ''}.`);
  parts.push('Admin akan cek laporan ini.');
  return parts.join(' ');
}
