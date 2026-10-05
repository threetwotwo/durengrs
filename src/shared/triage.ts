import { FARM_STAGES, FARM_STAGE_INFO, type FarmStage } from './stages';
import { ISSUES, ISSUE_INFO, type Issue } from './issues';
import { HEALTH_INFO, worstHealth, type Health } from './health';
import { hasWord, normalize } from './text';

/**
 * Field report triage: what a worker's report is probably about. The worker only sends tree + photo + words;
 * this suggests the stage, the issues, the health and any numbers, and a person confirms (review inbox).
 *
 * `triageText` is the free, rule-based version (words only), shared with the WhatsApp bot so its instant reply and
 * the web app's suggestion are the same. A photo model can later fill the same `Triage` shape (source 'ai').
 */
export const TRIAGE_RULES_VERSION = 'rules-1';

export type NumberKind = 'fruit' | 'clusters' | 'branches' | 'mm';

export interface Triage {
  source: 'rules' | 'ai';
  /** Rules version, or model + prompt version for 'ai'. */
  version: string;
  stage?: { code: FarmStage; confidence: number; evidence: string };
  issues: Array<{ code: Issue; confidence: number; evidence: string }>;
  health?: Health;
  /** The worker says it is getting better ("membaik"). */
  improving: boolean;
  numbers: Array<{ value: number; kind?: NumberKind; evidence: string }>;
  /** False only for a plain "all fine" report: nothing for a person to decide. */
  needsReview: boolean;
}

const NEGATIONS = ['tidak', 'tak', 'bukan', 'belum', 'tanpa', 'no', 'gak', 'nggak', 'ga'];
const URGENT = ['darurat', 'parah', 'sekarat', 'hampir mati', 'mati', '=sos'];
const FINE = ['sehat', 'aman', 'bagus', 'normal', '=baik', 'oke', '=ok'];
const BETTER = ['membaik', 'mulai baik', 'sudah baik', 'pulih', 'sembuh', 'lebih baik'];

/** The word before `kw` in `text` is a negation ("tidak ada kutu"). */
function negated(text: string, kw: string): boolean {
  const k = kw.replace(/^=/, '');
  const i = text.indexOf(k);
  if (i < 0) return false;
  const before = text.slice(Math.max(0, i - 14), i).trim().split(' ').slice(-2);
  return before.some((w) => NEGATIONS.includes(w));
}

function matches(text: string, keywords: string[]): string[] {
  return keywords.filter((kw) => hasWord(text, kw) && !negated(text, kw)).map((k) => k.replace(/^=/, ''));
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
    out.push({ value, kind, evidence: `${before.split(' ').slice(-1)[0] || ''} ${m[1]} ${after.split(' ')[0] || ''}`.trim() });
  }
  return out;
}

export function triageText(raw: string | undefined): Triage {
  const text = normalize(raw);

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

  let health: Health | undefined;
  for (const i of issues) health = worstHealth(health, ISSUE_INFO[i.code].health);
  if (matches(text, URGENT).length) health = 'merah';
  if (!health && matches(text, FINE).length) health = 'hijau';
  const improving = matches(text, BETTER).length > 0;

  const numbers = findNumbers(text);
  const needsReview = !(health === 'hijau' && issues.length === 0);
  return { source: 'rules', version: TRIAGE_RULES_VERSION, stage, issues, health, improving, numbers, needsReview };
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
