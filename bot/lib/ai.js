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
const K = require('./cases');

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PROMPT_VERSION = 'p2';
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
        properties: {
          code: { type: 'STRING', enum: [...S.ISSUES] },
          name: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
          evidence: { type: 'STRING' },
          photo: { type: 'INTEGER' },
          action: { type: 'STRING' },
        },
        required: ['code', 'name', 'confidence', 'evidence', 'action'],
      },
    },
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: [...K.ACTION_TYPES] },
          product: { type: 'STRING' },
          issue: { type: 'STRING', enum: [...S.ISSUES, 'none'] },
          target: { type: 'STRING' },
          case: { type: 'INTEGER' },
          evidence: { type: 'STRING' },
          photo: { type: 'INTEGER' },
        },
        required: ['type', 'product', 'issue', 'target', 'case', 'evidence'],
      },
    },
    case_updates: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { case: { type: 'INTEGER' }, status: { type: 'STRING', enum: [...K.UPDATE_STATUSES] }, evidence: { type: 'STRING' } },
        required: ['case', 'status', 'evidence'],
      },
    },
    photos_seen: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { photo: { type: 'INTEGER' }, seen: { type: 'STRING' } }, required: ['photo', 'seen'] },
    },
    summary: { type: 'STRING' },
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
  required: ['photos_seen', 'stages', 'bloom_part', 'actions', 'case_updates', 'issues', 'summary', 'health', 'urgent', 'improving', 'counts', 'photo_ok', 'photo_request'],
};

function prompt(tree, description, today, openList = 'none') {
  return `You check field reports from a durian farm in West Java, Indonesia (Musang King and other varieties).
A worker photographed tree ${tree.id} (variety ${tree.variant || '?'}, block ${tree.block || '?'}) on ${today} and wrote, in Indonesian:
"""${description}"""

The photos are numbered in the order given (Foto 1, Foto 2, ...). Look at EVERY photo on its own: each may show a
different part of the tree and a different problem. Report everything found in any photo.

Open problems on this tree from earlier reports (numbered):
${openList}

A report can be about something the worker SAW, something the worker DID (a treatment or farm work), or both.
Short words like "sudah ditangani" / "sudah dioles" / "sudah disemprot" mean the worker treated something.

Return JSON only.
- photos_seen: for each photo, a few words in Indonesian of what it shows (e.g. "daun dengan serangga putih berlilin").
- stages: every growth stage you can SEE in the photos or that the words state. A tree can show two at once (e.g. flowers on one branch, young fruit on another). Codes:
${STAGE_LIST}
- bloom_part: if flowers are open ("bloom"), which part of the tree; else "none".
- actions: everything the worker did or is doing in the photos or words, one item each. "type" from the codes;
  "product" the product or material if named or visible (e.g. "Kautang", "pasta tembaga", "NPK Perfect"), else "";
  "issue" the problem code it was for, or "none" for routine work (fertilising, bagging, pruning…); "target" the problem
  in Indonesian ("" if none); "case" the number of the open problem above it treats, or 0; "photo" the photo number.
  Scraped bark painted with a paste or fungicide is a canker_treatment, not a new canker. Action codes:
${K.ACTION_TYPES.join(', ')}
- case_updates: for each open problem above that this report shows or mentions again: its number and status:
  treated (treated in this report), improving, same, worse, resolved (healed or gone). Evidence in Indonesian.
- issues: only NEW problems: every pest, disease or problem you can see in any photo or the words state that is NOT
  already in the open list (those go in case_updates). Identify it as precisely as you
  would for a durian grower: put the specific pest or disease in "name", in Indonesian with the scientific name when
  you know it (e.g. "Kutu loncat durian (Allocaridara malayensis)", "Kutu putih (Pseudococcidae)", "Kanker batang
  (Phytophthora palmivora)"). "code" is the farm's category: use one ONLY when it is that same problem; whitefly is
  not a psyllid or a mealybug, so for anything without its own code use "other". "photo": the photo number it is in
  (0 if only in the words). "action": the first thing the worker should do, one short sentence in simple Indonesian.
  Only real evidence; no issues is fine. Codes:
${ISSUE_LIST}
- summary: one or two short sentences in simple Indonesian for the worker: what you see overall.
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

// Google AI Studio keys (both "AIza…" and the newer "AQ.…") use the Gemini API address. A Vertex AI express key needs
// GEMINI_ENDPOINT=vertex. Same request either way.
function endpoint() {
  const key = String(process.env.GEMINI_API_KEY || '');
  const vertex = process.env.GEMINI_ENDPOINT === 'vertex';
  const url = vertex
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${MODEL()}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`;
  return { url, vertex, key };
}

async function callGemini(parts, { timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS) || 40000, schema = SCHEMA } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const { url, vertex, key } = endpoint();
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini (${vertex ? 'Vertex' : 'AI Studio'} ${MODEL()}) ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
    const name = String(x.name || '').trim().slice(0, 120);
    if (!S.isIssue(x.code) || clamp01(x.confidence) < 0.4) continue;
    if (issues.some((i) => i.code === x.code && (x.code !== 'other' || i.name === name))) continue;
    const issue = { code: x.code, confidence: clamp01(x.confidence), evidence: evid(x.evidence) };
    if (name) issue.name = name;
    const action = String(x.action || '').trim().slice(0, 200);
    if (action) issue.action = action;
    if (Number.isInteger(x.photo) && x.photo > 0) issue.photo = x.photo;
    issues.push(issue);
  }
  const health = ['hijau', 'kuning', 'merah'].includes(a?.health) ? a.health : issues.length ? 'kuning' : 'hijau';
  const improving = a?.improving === true;
  const kindMap = { fruit: 'fruit', clusters: 'clusters', branches: 'branches' };
  const numbers = (Array.isArray(a?.counts) ? a.counts : [])
    .filter((x) => Number.isInteger(x.value) && x.value >= 0 && x.value <= 5000)
    .map((x) => (kindMap[x.kind] ? { value: x.value, kind: kindMap[x.kind], evidence: evid(x.evidence) } : { value: x.value, evidence: evid(x.evidence) }));
  const photoOk = a?.photo_ok !== false;
  const actions = (Array.isArray(a?.actions) ? a.actions : [])
    .filter((x) => K.ACTION_TYPES.includes(x.type))
    .map((x) => {
      const o = { type: x.type, issue: S.isIssue(x.issue) ? x.issue : 'none', evidence: evid(x.evidence) };
      const product = String(x.product || '').trim().slice(0, 80);
      if (product) o.product = product;
      const target = String(x.target || '').trim().slice(0, 120);
      if (target) o.target = target;
      if (Number.isInteger(x.case) && x.case > 0) o.case = x.case;
      if (Number.isInteger(x.photo) && x.photo > 0) o.photo = x.photo;
      return o;
    });
  const caseUpdates = (Array.isArray(a?.case_updates) ? a.case_updates : [])
    .filter((x) => Number.isInteger(x.case) && x.case > 0 && K.UPDATE_STATUSES.includes(x.status))
    .map((x) => ({ case: x.case, status: x.status, evidence: evid(x.evidence) }));
  const treating = actions.some((x) => x.issue !== 'none');
  // The owner decides on new problems, things getting worse, bad photos, and plain reports that aren't fine.
  // Treatments and progress on known problems are filed into their case instead.
  const needsReview =
    issues.length > 0 || caseUpdates.some((u) => u.status === 'worse') || !photoOk ||
    (!actions.length && !caseUpdates.length && health !== 'hijau');
  const out = {
    source: 'ai',
    version: `${model}/${PROMPT_VERSION}`,
    issues,
    health,
    improving,
    urgent: a?.urgent === true && !improving && !treating,
    numbers,
    needsReview,
    stages,
    photoOk,
    actions,
    caseUpdates,
  };
  if (stages[0]) out.stage = stages[0];
  const summary = String(a?.summary || '').trim().slice(0, 400);
  if (summary) out.summary = summary;
  const seen = (Array.isArray(a?.photos_seen) ? a.photos_seen : [])
    .filter((x) => Number.isInteger(x.photo) && String(x.seen || '').trim())
    .map((x) => ({ photo: x.photo, seen: String(x.seen).trim().slice(0, 160) }));
  if (seen.length) out.photosSeen = seen;
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

/** The worker's reply in Gemini's own words: what it saw, each problem by its specific name with the first step. */
function aiReply(t) {
  const out = [];
  if (t.summary) out.push(t.summary);
  if (t.stages.length) out.push(`Tahap: ${t.stages.map((s) => S.FARM_STAGE_INFO[s.code].label.id).join(', ')}.`);
  for (const i of t.issues) {
    const name = i.name || S.ISSUE_INFO[i.code].label.id;
    out.push(`• ${name}${i.photo ? ` (foto ${i.photo})` : ''}${i.action ? `: ${i.action}` : ''}`);
  }
  if (!t.actions.length || t.issues.length) out.push(`Status: ${S.HEALTH_INFO[t.health].label.id}.${t.needsReview ? ' Admin akan cek laporan ini.' : ''}`);
  return out.join('\n');
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
    const open = await K.openCases(tree.id).catch((err) => (console.error('Open cases failed:', err), []));
    const parts = [{ text: prompt(tree, claimed.description || '', today, K.casesForPrompt(open)) }, ...photos.flatMap((data, i) => [{ text: `Foto ${i + 1}:` }, { inlineData: { mimeType: 'image/jpeg', data } }])];
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
    let progress = { caseIds: [], lines: [] };
    try {
      progress = await K.applyToCases({ tree, reportId, triage, today, workerPhone, open });
    } catch (err) {
      console.error(`Cases for ${reportId} failed:`, err);
    }
    await ref.update({ caseIds: progress.caseIds, ai: { status: 'done', model: MODEL(), photos: photos.length, recorded: recorded.done, at: now() } });
    console.log(`AI ${reportId} ${tree.id}: stages=${triage.stages.map((s) => s.code).join(',') || '-'} issues=${triage.issues.map((i) => i.code).join(',') || '-'} health=${triage.health} photoOk=${triage.photoOk} recorded=${recorded.done.length}`);

    const msg = [`🔎 Hasil pemeriksaan laporan ${tree.id} (${photos.length} foto):`, aiReply(triage), ...lines, ...progress.lines, ...recorded.lines];
    if (!triage.photoOk) msg.push('', `📷 Mohon kirim foto yang lebih jelas: ${triage.photoRequest || 'foto lebih dekat dan terang.'}`, 'Ketuk tombol di bawah untuk kirim laporan baru.');
    return msg.filter((x) => x !== undefined).join('\n');
  } catch (err) {
    console.error(`AI read of ${reportId} failed:`, err);
    await ref.update({ ai: { status: 'failed', model: MODEL(), error: String(err.message || err).slice(0, 300), at: now() } }).catch(() => {});
    return null;
  }
}

/** One tiny call to see whether the key and model work: { ok, model, endpoint, error? }. */
async function checkGemini() {
  const { url, vertex } = endpoint();
  const base = { model: MODEL(), endpoint: vertex ? 'Vertex AI' : 'Google AI Studio (Gemini API)', keySet: !!process.env.GEMINI_API_KEY };
  if (!process.env.GEMINI_API_KEY) return { ok: false, ...base, error: 'GEMINI_API_KEY is not set on the service' };
  try {
    const r = await callGemini([{ text: 'Reply with {"ok": true}.' }], { timeoutMs: 15000, schema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] } });
    return { ok: r && r.ok === true, ...base, url };
  } catch (err) {
    return { ok: false, ...base, url, error: String(err.message || err).slice(0, 400) };
  }
}

module.exports = { analyzeReport, toTriage, prompt, SCHEMA, checkGemini };
