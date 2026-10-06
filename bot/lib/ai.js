// lib/ai.js — Gemini reads a worker's report (photos + words) after it is saved:
//   stage(s) of the tree, issues, health, numbers the worker wrote, and whether the photos are good enough.
// The result replaces the rule-based suggestion on the report (kept as `triageRules`), records what can be recorded
// without a person (flowering date, a fruit or flower count the worker wrote), turns the tree Merah only for danger
// words or signs, and gives the worker one chat message: what was seen, the next step, and a request for a better
// photo when needed. Everything else waits for the owner's check in the web app ("Perlu dicek").
// Needs GEMINI_API_KEY (Google AI Studio). Optional GEMINI_MODEL (default below). Without a key nothing happens.
const { admin, db } = require('./firestore');
const R = require('./rules');
const S = require('./shared');
const C = require('./cropData');

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PROMPT_VERSION = 'p1';
const now = () => admin.firestore.FieldValue.serverTimestamp();

const STAGE_LIST = S.FARM_STAGES.map((c) => `${c}: ${S.FARM_STAGE_INFO[c].label.en} (${S.FARM_STAGE_INFO[c].label.id})`).join('\n');
const ISSUE_LIST = S.ISSUES.map((c) => `${c}: ${S.ISSUE_INFO[c].label.en} (${S.ISSUE_INFO[c].label.id})`).join('\n');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    stages: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { code: { type: 'STRING', enum: [...S.FARM_STAGES] }, confidence: { type: 'NUMBER' }, evidence: { type: 'STRING' } },
        required: ['code', 'confidence', 'evidence'],
      },
    },
    bloom_part: { type: 'STRING', enum: ['whole', 'lower', 'middle', 'upper', 'some', 'none'] },
    issues: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { code: { type: 'STRING', enum: [...S.ISSUES] }, confidence: { type: 'NUMBER' }, evidence: { type: 'STRING' } },
        required: ['code', 'confidence', 'evidence'],
      },
    },
    health: { type: 'STRING', enum: ['hijau', 'kuning', 'merah'] },
    urgent: { type: 'BOOLEAN' },
    improving: { type: 'BOOLEAN' },
    counts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { kind: { type: 'STRING', enum: ['fruit', 'clusters', 'branches', 'harvested'] }, value: { type: 'INTEGER' }, evidence: { type: 'STRING' } },
        required: ['kind', 'value', 'evidence'],
      },
    },
    photo_ok: { type: 'BOOLEAN' },
    photo_request: { type: 'STRING' },
  },
  required: ['stages', 'bloom_part', 'issues', 'health', 'urgent', 'improving', 'counts', 'photo_ok', 'photo_request'],
};

function prompt(tree, description, today) {
  return `You check field reports from a durian farm in West Java, Indonesia (Musang King and other varieties).
A worker photographed tree ${tree.id} (variety ${tree.variant || '?'}, block ${tree.block || '?'}) on ${today} and wrote, in Indonesian:
"""${description}"""

Return JSON only.
- stages: every growth stage you can SEE in the photos or that the words state. A tree can show two at once (e.g. flowers on one branch, young fruit on another). Codes:
${STAGE_LIST}
- bloom_part: if flowers are open ("bloom"), which part of the tree; else "none".
- issues: problems you can see or the words state. Only real evidence; none is fine. Codes:
${ISSUE_LIST}
- health: hijau = fine, kuning = a problem to watch or treat, merah = serious (stem canker, dying tree, fallen tree).
- urgent: true ONLY if the tree is in danger right now (dying, fallen, broken trunk, heavy active canker), and the worker does not say it is getting better.
- improving: the worker says it is getting better ("membaik", "sembuh").
- counts: ONLY numbers the worker WROTE, with their kind: fruit on the tree, clusters (flower clusters), branches (flowering branches), harvested (fruit picked). Never estimate counts from the photo.
- evidence: a few words, in Indonesian, of what shows it (in the photo or the text).
- photo_ok: false if the photos are blurry, too dark, too far, or do not show what the words describe (or a problem you suspect needs a closer look).
- photo_request: if photo_ok is false, ONE short instruction in simple Indonesian for the worker (e.g. "Foto lebih dekat ke batang yang bergetah, siang hari."); else "".
Confidence is 0 to 1. Be conservative: a low-confidence guess is better left out.`;
}

async function fetchPhoto(p) {
  const url = p && (p.medium || p.url);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer()).toString('base64');
}

async function callGemini(parts, { timeoutMs = 25000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    const text = body?.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
const evid = (s) => String(s || '').slice(0, 120);

/** Gemini's answer in the shared Triage shape (src/shared/triage.ts), with no undefined fields. */
function toTriage(a, model = MODEL()) {
  const stages = (Array.isArray(a?.stages) ? a.stages : [])
    .filter((x) => S.isFarmStage(x.code) && clamp01(x.confidence) >= 0.4)
    .map((x) => ({ code: x.code, confidence: clamp01(x.confidence), evidence: evid(x.evidence) }))
    .sort((x, y) => y.confidence - x.confidence);
  const issues = [];
  for (const x of Array.isArray(a?.issues) ? a.issues : []) {
    if (!S.isIssue(x.code) || clamp01(x.confidence) < 0.4 || issues.some((i) => i.code === x.code)) continue;
    issues.push({ code: x.code, confidence: clamp01(x.confidence), evidence: evid(x.evidence) });
  }
  const health = ['hijau', 'kuning', 'merah'].includes(a?.health) ? a.health : issues.length ? 'kuning' : 'hijau';
  const improving = a?.improving === true;
  const kindMap = { fruit: 'fruit', clusters: 'clusters', branches: 'branches' };
  const numbers = (Array.isArray(a?.counts) ? a.counts : [])
    .filter((x) => Number.isInteger(x.value) && x.value >= 0 && x.value <= 5000)
    .map((x) => (kindMap[x.kind] ? { value: x.value, kind: kindMap[x.kind], evidence: evid(x.evidence) } : { value: x.value, evidence: evid(x.evidence) }));
  const photoOk = a?.photo_ok !== false;
  const out = {
    source: 'ai',
    version: `${model}/${PROMPT_VERSION}`,
    issues,
    health,
    improving,
    urgent: a?.urgent === true && !improving,
    numbers,
    needsReview: !(health === 'hijau' && issues.length === 0) || !photoOk,
    stages,
    photoOk,
  };
  if (stages[0]) out.stage = stages[0];
  const req = String(a?.photo_request || '').trim().slice(0, 200);
  if (!photoOk && req) out.photoRequest = req;
  if (['whole', 'lower', 'middle', 'upper', 'some'].includes(a?.bloom_part)) out.bloomPart = a.bloom_part;
  const harvested = (a?.counts || []).find((x) => x.kind === 'harvested' && Number.isInteger(x.value));
  if (harvested) out.harvestedFruits = harvested.value;
  return out;
}

const COUNT_STAGE = { bloom: 'clusters', set: 'set', pingpong: 'kept', egg: 'onTree', grow: 'onTree', mature: 'onTree', harvest: 'onTree' };

/** Records that need no person: the flowering date, and a fruit or flower count the worker wrote. */
async function recordFromTriage(tree, triage, workerPhone, today) {
  const done = [];
  const lines = [];
  const codes = triage.stages.filter((s) => s.confidence >= 0.6).map((s) => s.code);
  let season = await C.loadTreeSeason(tree, today);

  // Flowers open and no flowering recorded in the last 30 days: today is the flowering date.
  if (codes.includes('bloom') && !(season.waves || []).some((w) => R.diffDays(today, w.date) <= 30)) {
    const part = triage.bloomPart || 'some';
    const r = await C.saveBloom({ treeId: tree.id, block: tree.block, date: today, part, note: 'Otomatis dari laporan foto', workerPhone });
    if (!r.duplicate) {
      done.push(`bloomWaves/${r.id}`);
      lines.push(`📅 Tanggal bunga mekar dicatat: ${R.dateLabel(today)}.`);
      season = await C.loadTreeSeason(tree, today);
    }
  }

  // A number the worker wrote, filed against the newest flowering.
  const waves = season.waves || [];
  const wave = waves[waves.length - 1];
  const stage = codes.map((c) => COUNT_STAGE[c]).find(Boolean);
  const n = triage.numbers.find((x) => (stage === 'clusters' ? x.kind === 'clusters' : x.kind === 'fruit'));
  if (wave && stage && n && R.COUNT_STAGES[stage]) {
    const r = await C.saveCount({ tree, season: wave.date, stage, count: n.value, date: today, workerPhone, wavesCount: waves.length, existing: season.counts, note: 'Otomatis dari laporan foto' });
    done.push(`cropCounts/${r.id}`);
    lines.push(`🔢 ${R.COUNT_STAGES[stage].label || 'Jumlah'}: ${n.value} dicatat.`);
  }
  return { done, lines };
}

/** Danger seen or written: the tree turns Merah now (once), like the rule-based reading does. */
async function markUrgent(reportRef, treeId, workerPhone) {
  return db.runTransaction(async (tx) => {
    const [rep, tr] = await Promise.all([tx.get(reportRef), tx.get(db.collection('trees').doc(treeId))]);
    if (!rep.exists || !tr.exists || rep.data().conditionChanged || tr.data().condition === 'emergency') return false;
    const before = tr.data().condition ?? null;
    tx.update(reportRef, { conditionBefore: before, conditionAfter: 'emergency', conditionChanged: true, conditionSource: 'triage' });
    tx.update(tr.ref, { condition: 'emergency', conditionUpdatedAt: now(), dateUpdated: now() });
    tx.set(db.collection('treeEdits').doc(), { treeId, changes: { condition: { from: before, to: 'emergency' } }, at: now(), source: 'whatsapp', reason: 'ai-urgent', reportId: rep.id, workerPhone: workerPhone || null });
    return true;
  });
}

/**
 * Reads one saved report with Gemini and updates it. Returns the chat message for the worker, or null when there is
 * nothing to add (no key, already read, report missing). Never throws.
 */
async function analyzeReport(reportId, { tree, workerPhone, today = R.todayStr() } = {}) {
  if (!process.env.GEMINI_API_KEY || !reportId || !tree) return null;
  const ref = db.collection('reports').doc(reportId);
  try {
    // Claim the report once (WhatsApp may deliver the completion twice).
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().ai) return null;
      tx.update(ref, { ai: { status: 'running', model: MODEL(), at: now() } });
      return snap.data();
    });
    if (!claimed) return null;

    const photos = (await Promise.all((claimed.photos || []).slice(0, 3).map((p) => fetchPhoto(p).catch(() => null)))).filter(Boolean);
    const parts = [{ text: prompt(tree, claimed.description || '', today) }, ...photos.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } }))];
    const triage = toTriage(await callGemini(parts));

    const update = { triage };
    if (claimed.triage && claimed.triage.source !== 'ai') update.triageRules = claimed.triage;
    await ref.update(update);

    const lines = [];
    if (triage.urgent && (await markUrgent(ref, tree.id, workerPhone))) lines.push('🔴 Kondisi pohon diubah menjadi Merah. Pemilik akan segera mengecek.');
    let recorded = { done: [], lines: [] };
    try {
      recorded = await recordFromTriage(tree, triage, workerPhone, today);
    } catch (err) {
      console.error(`AI records for ${reportId} failed:`, err);
    }
    await ref.update({ ai: { status: 'done', model: MODEL(), photos: photos.length, recorded: recorded.done, at: now() } });
    console.log(`AI ${reportId} ${tree.id}: stages=${triage.stages.map((s) => s.code).join(',') || '-'} issues=${triage.issues.map((i) => i.code).join(',') || '-'} health=${triage.health} photoOk=${triage.photoOk} recorded=${recorded.done.length}`);

    const msg = [`🔎 Hasil pemeriksaan laporan ${tree.id}:`, S.workerReply(triage), ...lines, ...recorded.lines];
    if (!triage.photoOk) msg.push('', `📷 Mohon kirim foto yang lebih jelas: ${triage.photoRequest || 'foto lebih dekat dan terang.'}`, 'Ketuk tombol di bawah untuk kirim laporan baru.');
    return msg.filter((x) => x !== undefined).join('\n');
  } catch (err) {
    console.error(`AI read of ${reportId} failed:`, err);
    await ref.update({ ai: { status: 'failed', model: MODEL(), error: String(err.message || err).slice(0, 300), at: now() } }).catch(() => {});
    return null;
  }
}

module.exports = { analyzeReport, toTriage, prompt, SCHEMA };
