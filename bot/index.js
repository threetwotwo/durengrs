// index.js — the farm's WhatsApp bot (Cloud Run): the chat webhook, the encrypted Flow endpoint, /ai-check and
// /cases-backfill.
//   A tree ID ("A1") gets the tree's last photos and the report Flow (flows/flow.json, FLOW_ID);
//   KEBUN (or the "Hujan & Pekerjaan" button) gets the farm Flow (flows/flow-farm.json, FARM_FLOW_ID).
//   When a report Flow completes, Gemini reads the report (lib/ai.js) and the reply comes with a fresh Flow message.
require('dotenv').config();
const express = require('express');
const { decryptRequest, encryptResponse } = require('./lib/encryption');
const { getTreeById, getTreeRecord, isArchived, getLastReport } = require('./lib/trees');
const { getCollageUrl } = require('./lib/reports');
const { CONDITION_LABELS } = require('./lib/rules');
const { route, parseFlowToken, makeTreeToken, makeFarmToken } = require('./lib/flowScreens');
const { analyzeReport, checkGemini } = require('./lib/ai');
const { backfillCases } = require('./lib/backfill');

const app = express();
app.use(express.json());

const { AsyncLocalStorage } = require('async_hooks');
const { VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID, FLOW_ID, FARM_FLOW_ID } = process.env;

// Replies go out from the WhatsApp number that RECEIVED the message (taken from the webhook),
// so the test number and the production number can both work. PHONE_NUMBER_ID is only the fallback.
const sendContext = new AsyncLocalStorage();

// Cloud Run injects PORT (8080) itself — never set it in env.yaml.
const PORT = process.env.PORT || 8080;

// Matches tree IDs like "A1", "B77" — adjust if your IDs ever look different.
const TREE_ID_PATTERN = /^[A-Z]{1,3}\d{1,3}$/i;
// Words that open the farm Flow (rain and finished work), compared without spaces: "curah hujan" -> CURAHHUJAN.
const FARM_WORDS = /^(KEBUN|HUJAN|CURAHHUJAN|KERJA|PEKERJAAN|CATATANKEBUN)$/;

// ---------- WhatsApp helpers ----------

async function sendWhatsAppMessage(payload) {
  const phoneNumberId = sendContext.getStore()?.phoneNumberId || PHONE_NUMBER_ID;
  const resp = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await resp.json();
  if (!resp.ok) console.error('WhatsApp send failed:', JSON.stringify(body));
  return body;
}

function sendText(to, text) {
  return sendWhatsAppMessage({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } });
}

// ---------- messages workers read (Indonesian) ----------

const HELP_BODY = [
  'Halo! Selamat datang di *Laporan Kebun Cilowong* 🌳',
  '',
  'Pilih salah satu:',
  '',
  '🌳 *Laporan pohon*',
  'Foto + keterangan: bunga, buah, hama, penyakit, panen.',
  'Kirim ID pohon, contoh: *A1*',
  '',
  '🌧️ *Hujan & pekerjaan kebun*',
  'Ketuk tombol di bawah, atau kirim kata *KEBUN*.',
].join('\n');

// Friendly guide plus one tap to the farm Flow. Falls back to plain text if buttons are refused.
async function sendHelp(to, intro) {
  const text = intro ? `${intro}\n\n${HELP_BODY}` : HELP_BODY;
  const sent = await sendWhatsAppMessage({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text },
      action: { buttons: [{ type: 'reply', reply: { id: 'farm', title: 'Hujan & Pekerjaan' } }] },
    },
  });
  if (sent?.error) await sendText(to, text);
}

// The latest report's photos as ONE normal chat image (a collage when there are
// several), which WhatsApp lets the worker tap, zoom and save. Flow images can't be zoomed.
async function sendLastReportPhotos(to, tree) {
  try {
    const report = await getLastReport(tree);
    const url = await getCollageUrl(tree.lastReportId, report);
    if (!url) return;
    await sendWhatsAppMessage({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: url, caption: reportCaption(tree, report) },
    });
  } catch (err) {
    console.error('Could not send report photos:', err);
  }
}

// Caption shown under the photo(s): when, what changed, and what the worker wrote.
function reportCaption(tree, report) {
  const when = formatDate(report.createdAt);
  const change = report.conditionChanged
    ? ` · ${conditionLabel(report.conditionBefore)} → ${conditionLabel(report.conditionAfter)}`
    : '';
  const photos = (report.photos || []).slice(0, 3).length;
  const lines = [`*${tree.id} — laporan terakhir*`, `${when}${change}`.trim()];
  if (report.description) lines.push('', report.description);
  lines.push('', `📷 ${photos} foto`);
  return lines.join('\n').slice(0, 1000); // WhatsApp caption limit is 1024
}

function sendTreeFlow(to, tree, intro) {
  return sendWhatsAppMessage({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: ['Pohon ' + tree.id, tree.variant, tree.block ? `Blok ${tree.block}` : null].filter(Boolean).join(' · ') },
      body: {
        text: intro
          ? `${intro}\n\nKetuk tombol di bawah untuk lapor lagi untuk pohon ini. Untuk pohon lain, kirim ID-nya. Untuk hujan atau pekerjaan kebun, kirim *KEBUN*.`
          : 'Ketuk tombol di bawah, ambil foto, lalu tulis apa yang Anda lihat.',
      },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: makeTreeToken(tree.id, to),
          flow_id: FLOW_ID,
          flow_cta: 'Kirim Laporan',
          flow_action: 'data_exchange',
        },
      },
    },
  });
}

function sendFarmFlow(to, intro) {
  return sendWhatsAppMessage({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: 'Catatan Kebun' },
      body: { text: intro ? `${intro}\n\nKetuk tombol di bawah untuk mencatat lagi. Untuk laporan pohon, kirim ID pohon, contoh: *A1*.` : 'Catat curah hujan atau pekerjaan kebun yang sudah selesai. Ketuk tombol di bawah.' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: makeFarmToken(to),
          flow_id: FARM_FLOW_ID,
          flow_cta: 'Buka Catatan Kebun',
          flow_action: 'navigate',
          flow_action_payload: { screen: 'FARM_HOME' },
        },
      },
    },
  });
}

// WhatsApp greys out a Flow message once it has been completed ("Response sent"), so after every
// finished report we hand the worker a fresh one instead of making them type the ID again.
async function reopenAfterCompletion(to, message) {
  let r = {};
  try {
    r = JSON.parse(message.interactive?.nfm_reply?.response_json || '{}') || {};
  } catch (_) {}
  const { kind, treeId } = parseFlowToken(r.flow_token);
  const saved = r.saved !== false && r.saved !== 'false'; // a Flow published before `saved` existed doesn't send it
  const reportId = typeof r.report_id === 'string' ? r.report_id : '';
  const thanks = saved ? '✅ Terima kasih, laporan sudah tersimpan.' : '⚠️ Laporan belum tersimpan. Coba lagi lewat tombol di bawah, atau kirim ID pohon lain.';
  if (kind === 'report' && treeId) {
    const tree = await getTreeById(treeId);
    if (tree) {
      // Gemini reads the photos and words before the answer (Cloud Run throttles work left after the response).
      const ai = saved && reportId ? await analyzeReport(reportId, { tree, workerPhone: to }) : null;
      return sendTreeFlow(to, tree, ai ? `✅ Laporan tersimpan.\n\n${ai}`.slice(0, 850) : thanks);
    }
  }
  if (kind === 'farm' && FARM_FLOW_ID) return sendFarmFlow(to, thanks);
  return sendHelp(to, thanks);
}

async function openFarmFlow(to) {
  if (!FARM_FLOW_ID) {
    console.error('FARM_FLOW_ID is not set');
    return sendText(to, 'Catatan kebun belum aktif. Mohon hubungi pemilik kebun.');
  }
  const sent = await sendFarmFlow(to);
  if (sent?.error) await sendText(to, 'Formulir catatan kebun belum bisa dibuka saat ini. Coba lagi sebentar lagi.');
}

const seenMessages = new Set();

// ---------- Regular WhatsApp webhook (incoming messages) ----------

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  // Do the work BEFORE answering. On Cloud Run (request-based billing) the CPU is
  // throttled as soon as the response is sent, so work left running afterwards
  // stalls until the next incoming request, which is what caused replies to
  // arrive late and in pairs. Duplicate deliveries are filtered by message id.
  try {
    const phoneNumberId = req.body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    await sendContext.run({ phoneNumberId }, () => handleIncomingMessage(req.body));
  } catch (err) {
    console.error('Failed to process webhook payload:', err);
  }
  res.sendStatus(200);
});

async function handleIncomingMessage(body) {
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return; // delivery/read receipts

  // WhatsApp re-delivers webhooks it thinks failed; don't answer the same message twice.
  if (seenMessages.has(message.id)) return;
  seenMessages.add(message.id);
  if (seenMessages.size > 500) seenMessages.delete(seenMessages.values().next().value);

  const to = message.from;

  // The "Hujan & Pekerjaan" button.
  if (message.type === 'interactive') {
    if (message.interactive?.button_reply?.id === 'farm') return openFarmFlow(to);
    if (message.interactive?.type === 'nfm_reply') return reopenAfterCompletion(to, message);
    return;
  }

  // Photos, voice notes, stickers...: explain where photos belong instead of staying silent.
  if (message.type !== 'text') {
    return sendHelp(to, 'Maaf, saya hanya bisa membaca teks. Foto dikirim lewat formulir laporan pohon.');
  }

  const compact = (message.text?.body || '').replace(/\s+/g, '').toUpperCase(); // "a 1" -> "A1"

  if (FARM_WORDS.test(compact)) return openFarmFlow(to);

  if (!TREE_ID_PATTERN.test(compact)) return sendHelp(to);

  // Check first, so a typo gets a plain reply instead of a Flow with no
  // tree behind it (and a button that can't work).
  const tree = await getTreeRecord(compact);
  if (isArchived(tree)) {
    await sendText(to, `Pohon ${compact} sudah tidak aktif (diarsipkan), jadi tidak bisa dilaporkan lagi.\nJika ini keliru, hubungi pemilik kebun.`);
    return;
  }
  if (!tree) {
    await sendText(
      to,
      `Pohon ${compact} tidak ditemukan. 🤔\nPeriksa huruf blok dan nomornya, lalu kirim lagi. Contoh: *A1* atau *B12*.`
    );
    return;
  }

  await sendLastReportPhotos(to, tree); // zoomable; the Flow comes last so it sits at the bottom
  const sent = await sendTreeFlow(to, tree);
  // If WhatsApp rejects the Flow (wrong FLOW_ID, Flow unpublished...) the worker should not be left in silence.
  if (sent?.error) {
    await sendText(to, `Pohon ${tree.id}: formulir laporan belum bisa dibuka saat ini. Coba lagi sebentar lagi.`);
  }
}

// Manual triggers, for testing without texting. /send-tree-lookup is the older name of /send-tree-flow.
app.post(['/send-tree-flow', '/send-tree-lookup'], async (req, res) => {
  const { to, treeId } = req.body;
  if (!to || !treeId) return res.status(400).json({ error: 'Need "to" and "treeId"' });

  const tree = await getTreeById(treeId.toUpperCase());
  if (!tree) return res.status(404).json({ error: `Pohon ${treeId} tidak ditemukan` });
  res.json(await sendTreeFlow(to, tree));
});

// Open https://<service>/ai-check?token=<VERIFY_TOKEN> in a browser: says whether the Gemini key and model work.
app.get('/ai-check', async (req, res) => {
  if (!VERIFY_TOKEN || req.query.token !== VERIFY_TOKEN) return res.sendStatus(403);
  res.json(await checkGemini());
});

// Open https://<service>/cases-backfill?token=<VERIFY_TOKEN> in a browser: what problems older reports would file
// (add &apply=1 to file them, &days=60 to look further back). See lib/backfill.js.
app.get('/cases-backfill', async (req, res) => {
  if (!VERIFY_TOKEN || req.query.token !== VERIFY_TOKEN) return res.sendStatus(403);
  try {
    res.json(await backfillCases({ days: req.query.days, apply: req.query.apply === '1' }));
  } catch (err) {
    console.error('Cases backfill failed:', err);
    res.status(500).json({ error: String(err.message || err).slice(0, 400) });
  }
});

app.post('/send-farm-flow', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Need "to"' });
  res.json(await sendFarmFlow(to));
});

// ---------- Flow data endpoint (the encrypted contract) ----------

app.post('/flow-endpoint', async (req, res) => {
  let decrypted;
  try {
    decrypted = decryptRequest(req.body);
  } catch (err) {
    console.error('Decryption failed:', err);
    return res.sendStatus(421); // tells WhatsApp to re-fetch the public key
  }

  const { payload, aesKey, iv } = decrypted;
  console.log(
    `Flow endpoint: action=${payload.action} screen=${payload.screen ?? '-'} flow_token=${payload.flow_token ?? '-'} dataKeys=${Object.keys(payload.data || {}).join(',') || '-'}`
  );

  try {
    const response = await buildResponse(payload);
    res.status(200).type('text/plain').send(encryptResponse(response, aesKey, iv));
  } catch (err) {
    console.error('Flow endpoint handler failed:', err);
    res.sendStatus(500);
  }
});

async function buildResponse(payload) {
  const { action, screen, flow_token } = payload;

  if (action === 'ping') return { data: { status: 'active' } };

  const { kind, treeId, workerPhone } = parseFlowToken(flow_token);
  // Screens live in lib/flowScreens.js, checks in lib/rules.js.
  return route({ kind, action, screen, data: payload.data, flowToken: flow_token, treeId, workerPhone });
}

// ---------- small helpers for the chat messages ----------

function conditionLabel(condition) {
  return CONDITION_LABELS[condition] || 'Belum dinilai';
}

function formatDate(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
