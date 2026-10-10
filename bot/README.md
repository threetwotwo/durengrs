# WhatsApp bot (Laporan Kebun Cilowong)

The program behind the farm's WhatsApp number. It runs on Google Cloud Run and does three jobs:

- **Webhook** (`POST /webhook`): reads what a worker texts. A tree ID (e.g. `A1`) gets the tree's last report photos
  (one zoomable chat image) and the report Flow; `KEBUN` (or the "Hujan & Pekerjaan" button) opens the farm Flow.
  Anything else (hello, a photo, a voice note...) gets a friendly guide with the button.
- **Flow endpoint** (`POST /flow-endpoint`): answers each button in the Flows (encrypted per Meta's spec) and saves
  reports, rain and finished work to Firestore.
- **Gemini reading**: when a report Flow completes, the bot has Gemini read the report's photos and words, records
  what needs no person, files problems into cases, and replies to the worker with a fresh Flow message (WhatsApp greys
  out the button of a completed Flow).

Shared words and rules with the web app: see `docs/data-contract.md` and `src/shared/` (repository root).

**Never commit secrets here** (this repository is public): no `.env`, `env.yaml`, `.pem` private key, API key or
service-account JSON. They stay in Cloud Run. `.gitignore` in this folder blocks the files.

## The two Flows (both Indonesian for the workers)

| Flow | opened by | file | env | screens |
|---|---|---|---|---|
| **Laporan Pohon** | the worker sends a tree ID, e.g. `A1` | `flows/flow.json` | `FLOW_ID` | `REPORT` (1-3 photos + free text, both required) → `DONE` |
| **Catatan Kebun** | the "Hujan & Pekerjaan" button, or the word `KEBUN` | `flows/flow-farm.json` | `FARM_FLOW_ID` | `FARM_HOME` → `HUJAN` (Curah Hujan) or `KERJA` (Pekerjaan Selesai) → `DONE` |

The flow token says which Flow a request belongs to: `lapor:<tree>:<phone>:<time>` (report), `farm:<phone>:<time>`.
Chat messages of the older multi-screen tree Flow carry `tree:<tree>:<phone>:<time>`; they are handled exactly like
`lapor:` (they open the report screen and save a report), so an old button never breaks.

## What a report does

1. **On send** (`lib/flowScreens.js` `handleReport`, `lib/reports.js`): photos go to Storage (three sizes), the report
   to `reports` with `triage` (the rule-based reading of the words, `lib/shared.js`). Only words that say the tree is in
   danger now ("hampir mati", "tumbang") turn it Merah at once (`conditionSource: 'triage'`). The DONE screen returns
   `saved` and `report_id` with the completion.
2. **On completion** (`index.js` `reopenAfterCompletion` → `lib/ai.js` `analyzeReport`, once per report): Gemini reads
   the photos (numbered) and words, and is told the tree's open cases. Its answer replaces `triage` (the word-only
   reading is kept as `triageRules`): stages, issues (specific pest or disease names), what the worker did, progress on
   open cases, health, numbers the worker wrote, the harvest, photo quality.
3. **Recorded without a person**:
   - flowers open and no flowering in the last 30 days → `bloomWaves` (today);
   - a fruit or flower-cluster count the worker wrote → `cropCounts` against the newest flowering;
   - fruit picked ("panen 12 buah, 30 kg") → `harvests/wa_{reportId}`: fruits, `weightKg` and `grades` when written,
     `floweredOn` / `daysFromBloom` from the flowering nearest the variety's ripening time (`lib/season.js`
     `floweredOnFor`), `source: 'whatsapp'`, `reportId`;
   - danger seen or written → tree Merah (once).
4. **Cases** (`lib/cases.js`): every problem becomes a case followed to the end (open → treated → improving →
   resolved, or worse); treatments join the problem they treat; season jobs (pollination, thinning, bagging, tying)
   are filed in `seasonTasks` of the block.
5. **Reply** in the chat: what was seen, each problem with its first step, what was recorded ("📅 Tanggal bunga
   mekar dicatat", "🔢 …", "🧺 Panen dicatat: 12 buah, 30 kg."), case progress, and a request for a better photo when
   needed. Everything else waits for the owner's check in the web app ("Perlu dicek").

Without `GEMINI_API_KEY` reports still save and the worker gets the rule-based reply on the DONE screen.

| record | written to (same collections the webapp reads) |
|---|---|
| report (photos + words) | `reports/{id}` (+ tree `lastReportId`, `lastReportAt`; `condition` only for urgent words) |
| flowering, count, harvest from a report | `bloomWaves/{tree}_{date}_{part}`, `cropCounts/{tree}_{season}_{stage}_{date}`, `harvests/wa_{reportId}` |
| problems and treatments from a report | `cases/{tree}_{issue}_{openedOn}[_{name}]`, `reports.caseIds` |
| Pekerjaan Selesai | `seasonTasks/{block}_{season}_{task}` (first record wins) |
| Curah Hujan | `weather/{YYYY-MM-DD}` |
| (archived trees, `active: false`) | closed: the bot answers that the tree is no longer active |

Every write has a deterministic id, so a retry never duplicates. A report's id depends on the flow token and what was
sent, so a network retry maps to the same report while a new report sent from an old Flow message still saves. The farm
Flow's numbers are checked on the server (`lib/rules.js`): hard errors are refused with a message; odd-but-possible
values ask the worker to tick "Ya, sudah benar".

## Checking Gemini

Open `https://<service>/ai-check?token=<VERIFY_TOKEN>` in a browser: it answers `{ ok, model, endpoint, keySet, error? }`
after one tiny Gemini call, so a wrong key or model name shows at once.

## Filing problems from older reports

Problems (`cases`) are filed when Gemini reads a report, or from the words when Gemini fails. Reports saved before
that have none. Open `https://<service>/cases-backfill?token=<VERIFY_TOKEN>` to see what the last 30 days of reports
would file (nothing is written; it also counts how many reports Gemini read), then add `&apply=1` to file them
(`&days=60` to look further back). The owner's check in the web app wins over the reading; dismissed reports and
archived trees are skipped. Safe to run again: a report already filed is left alone.

## Files

| file | purpose |
|---|---|
| `index.js` | Express server: WhatsApp webhook, encrypted Flow endpoint, `/ai-check`, `/cases-backfill`, manual triggers (`/send-tree-flow`, `/send-farm-flow`) |
| `flows/flow.json`, `flows/flow-farm.json` | The two Flows, generated by `scripts/build-flow.js` (paste each into its own Flow in WhatsApp Manager) |
| `scripts/build-flow.js` | Builds both Flow JSON files (the one place to change a screen) |
| `scripts/backfill-photos.js`, `scripts/delete-reports.js` | One-off maintenance (photo sizes; clearing test reports, `--yes` to really delete) |
| `lib/flowScreens.js` | Flow tokens, the screens and what each button does |
| `lib/ai.js` | Gemini: the prompt and answer schema, cleaning the answer, records, the worker's reply, `/ai-check` |
| `lib/cases.js` | Problems followed over time (`cases`), treatments, season jobs seen in a report |
| `lib/backfill.js` | `/cases-backfill`: files problems from older reports |
| `lib/reports.js` | Saves photos to Storage, report + tree update to Firestore; the photo collage for the chat |
| `lib/cropData.js` | Reads the tree's season; writes flowering, counts, harvests, season tasks, rain |
| `lib/season.js` | The flowerings of a tree and which one a harvest came from (port of the webapp's guide.ts) |
| `lib/rules.js` | Choices, ranges, dates, ids, and the farm Flow's checks and messages |
| `lib/shared.js` | **Generated** from the webapp's `src/shared` (triage, health words, labels): run `npm run build:bot-shared` in the repository root after changing `src/shared`; a webapp test fails if it's stale. Never edit it here |
| `lib/trees.js`, `lib/firestore.js` | Firestore access |
| `lib/encryption.js` | Flow request/response encryption (RSA + AES-GCM) |
| `lib/media.js` | Decrypts photos uploaded through the Flow |
| `test/` | Unit + end-to-end tests with an in-memory Firestore and a stubbed Gemini |
| `seed-variants.js`, `seed-trees.js` | One-off seeding scripts |

Tests (no real data touched): `npm test`. After editing `scripts/build-flow.js`: `npm run build-flow` (a test fails
if the Flow files are stale).

Rule for Flow JSON: a dynamic property is always the WHOLE value (`"${data.title}"`); build any text that mixes words
and variables on the server, or it shows up literally on the phone.

## Config (`env.yaml` for Cloud Run, `.env` locally)

See `.env.example` (placeholders only). Never set `PORT` on Cloud Run.

| variable | meaning |
|---|---|
| `VERIFY_TOKEN` | webhook verification, also guards `/ai-check` and `/cases-backfill` |
| `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID` | sending messages (replies go out from the number that received the message; this is the fallback) |
| `FLOW_ID`, `FARM_FLOW_ID` | the published report Flow and farm Flow |
| `FLOW_PRIVATE_KEY_FILE` | private key of the Flow endpoint |
| `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`, `STORAGE_BUCKET` | Firestore and Storage (bucket name from Firebase console → Storage) |
| `GEMINI_API_KEY` | Google AI Studio key (`AIza…` or `AQ.…`); without it nothing is sent to Gemini |
| `GEMINI_MODEL` | default `gemini-2.5-flash` |
| `GEMINI_ENDPOINT` | `vertex` only for a Vertex AI express key; otherwise leave empty (Gemini API) |
| `GEMINI_TIMEOUT_MS` | how long to wait for Gemini, default `40000` |

## Deploy

```
gcloud run deploy durian-tree-lookup --source . --region asia-southeast1 --allow-unauthenticated --env-vars-file env.yaml
```

Keep one instance warm so a Flow request never waits on a cold start:

```
gcloud run services update durian-tree-lookup --region asia-southeast1 --min-instances=1
```

## Updating the bot from this repository

1. `git pull`, then go to `bot/`.
2. Copy in the three secret files from the folder you deployed from before (they are never in git):
   `env.yaml`, `service-account.json`, `private_key.pem`.
3. Deploy (same command as always, run inside `bot/`):
   `gcloud run deploy durian-tree-lookup --source . --project whatsapp-survey-509713 --region asia-southeast1 --allow-unauthenticated --env-vars-file env.yaml`

## Flow setup

A published Flow can't be edited. After changing a file in `flows/`, create a new Flow,
paste the JSON, set its endpoint URI to `<service-url>/flow-endpoint`, publish,
and put the new Flow ID in `FLOW_ID` (report Flow) or `FARM_FLOW_ID` (farm Flow). Both Flows use the same endpoint URI.
