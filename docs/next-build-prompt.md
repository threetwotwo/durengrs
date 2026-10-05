# Build prompt: "Photo in, care out"

Paste this into a Claude Code session on `threetwotwo/durengrs`. It is self-contained; the audit behind it is
[`docs/field-audit-2026-10.md`](./field-audit-2026-10.md). Read that audit first.

---

## Role and goal

You are the engineer for the Cilowong durian farm system: a React/TypeScript/Firebase web app (this repository)
and a WhatsApp bot with Flows that write to the same Firestore database.

**The goal is a real, healthy, productive durian farm.** Software is only worth building if it makes these happen
sooner and more reliably, tree by tree:
- a problem is seen;
- it is named correctly;
- the right care is done at the right stage;
- it is followed up.

Judge every decision by that. When a feature doesn't move a tree toward better care, leave it out.

## Who uses it

- **Field workers.** Not trained in data entry or plant disease, and they work one-handed on a phone in the sun.
  They must only ever have to do this: **say which tree, take a photo, say what they see.** No menus of record
  types, no disease lists, no stage choices.
- **William (owner/manager).** Runs the farm from a Google Sheet: one row per tree; dated counts; Hijau / Kuning /
  Merah plus "membaik"; size labels (high/mid/low); a fertiliser dose per tree tied to a stage. The web app must
  feel like his sheet got smarter, not like a new tool to learn.
- **The system.** Does the sorting: stage, likely issue, urgency, numbers in the text, what's due next. Every
  conclusion goes into one review inbox that he confirms with a tap.

## Non-negotiables

1. **WhatsApp and the web app are one system.** Same words, same stage scale, same issue codes, same rules, same
   records. Shared constants and rules live in `src/shared/` and are imported by both. Never fork a number or a
   word. Add a contract test whenever a field is written by one side and read by the other.
2. **Photo and description are mandatory on every field report**; text now, voice later.
3. **The farm's own words, Indonesian first:**
   - mata ketam, ping pong, telor, pentil;
   - dahan berbunga, tandan bunga, bonggol, buang buah berlebih, brongsong;
   - Hijau / Kuning / Merah, membaik.

   English is a translation, never the source.
4. **The AI suggests and a person confirms.** Automatic writes only where a mistake is harmless (observed stage at
   high confidence, Hijau). Anything Kuning or Merah, and any disease name, waits for review. Store the raw AI
   output, its model and its prompt version on the record.
5. **Never lose field data.** No destructive migrations. Old records stay readable: `reports` without `triage`,
   counts without photos. Archive; never delete trees.
6. **Ship in small, tested steps.** After each phase:
   - run `npx tsc --noEmit -p .`, `npx vite build` and the `tests/` suite;
   - check every changed screen in the browser in both languages at phone and desktop width;
   - commit with a clear message, then push the branch **and fast-forward `main`** (the owner wants every finished
     change on main).

## What exists (main at `697b778` or later; re-read before you start)

| Area | Where |
|---|---|
| Season engine: bloom dates, flowering waves, stages from days since bloom | `src/lib/guide.ts` (`blockSeasons`, `treeWaves`, `stageOf`, `STAGES`) |
| Crop funnel: clusters → set → kept → on tree → graded harvest, next step per tree | `src/lib/crop.ts`, `src/components/CropWidgets.tsx`, `HarvestPage.tsx` |
| Field records and writes | `src/lib/fieldData.ts` (blooms, counts, harvests, season tasks, rain, labs) |
| Field log (every record in one list) | `src/lib/fieldLog.ts`, `src/components/FieldLog.tsx` |
| Worker issue reports, report page, shared report card | `reports` collection; `ReportsPage.tsx`, `ReportDetailView.tsx`, `ReportCard.tsx` |
| Workers (phone → name) | `src/lib/workers.ts` |
| Guide content and checks (behind the Guide switch) | `src/lib/guideContent.ts`, `guide.ts`, `GuideWidgets.tsx` |
| Catatan Kebun Flow (rain, season tasks) | `docs/flows/flow-farm.json` |
| Tree Flow ("Panen & Data Pohon", "Laporan Pohon") and bot endpoint | **Not in this repo.** Ask the owner (step 0). |

## Decisions already taken (5 Oct 2026)

- The bot code will move in; until it does, build the shared contract here.
- Stage words, dose rule and approver are not confirmed. Build them as editable suggestions (see the audit answers).
- Block E is young: done.
- **Triage starts at $0.** A rule-based text triage in `src/shared/triage.ts` (the same code the bot uses for its
  instant reply) plus human review. The Claude photo triage in Phase 2 is added later, behind the same `triage`
  shape, when an API key is available. Claude Haiku 4.5 is the cheap option, Claude Opus 5.5 the accurate one.

## Phase 0: Unblock and agree (ask only what blocks you)

1. Get the bot code (`index.js`, the tree Flow JSON) into this repository under `bot/`, or get read access to it.
   If it can't come, write the contract in step 1 and a reference endpoint in `bot/`, and tell the owner exactly
   which bot changes they need to make.
2. Confirm the stage words and their order, and the label/dose rule (audit §3 and §5), with the owner. Use the
   audit's proposal until confirmed and mark it `// to confirm` in one place only.
3. Get an Anthropic API key, stored as a Cloud Functions secret (`ANTHROPIC_API_KEY`), never in the client bundle.

## Phase 1: One contract (P1)

- Create `src/shared/`, with no React and no Firebase imports, so the bot can import it:
  - `vocab.ts`: every label both sides show (ID and EN);
  - `stages.ts`: the farm stage scale (`veg, rest, bud, bloom, set, pingpong, egg, grow, mature, harvest, post`),
    with labels, what a worker sees, and mapping to the engine `StageId`;
  - `issues.ts`: issue codes with labels, Guide topic and default severity. At least:
    - `phytophthora_canker` (kanker batang, getah merah);
    - `leaf_blight` (hawar daun);
    - `stem_fungus` (jamur batang);
    - `whitefly` (kutu kebul);
    - `leaf_drop` (rontok daun);
    - `fruit_drop` (rontok buah);
    - `borer` (penggerek);
    - `nutrient` (daun kuning / kurang daun);
    - `water` (kering / tergenang);
    - `other`;
  - `health.ts`: Hijau / Kuning / Merah plus `improving`, mapped to the stored `healthy / minor / emergency`;
  - `rules.ts`: the pure functions both sides need (task windows, follow-up limits, next count step, label and dose
    rule). Move them from `lib/` and keep re-exports so nothing breaks.
- Write `docs/data-contract.md`. For every collection: fields, types, who writes, who reads, id format, and
  idempotency (the bot's `flow_token` / message id).
- Add contract tests in `tests/` that pin enums and id formats.

**Done when** the web app builds on `src/shared/`, the tests pass, and the bot (or the reference endpoint) imports
the same files.

## Phase 2: "Lapor pohon", the photo report (P1)

**Worker side (bot):**
- One Flow or chat path: tree ID (typed, or a `wa.me` link from a QR/number tag that pre-fills it), then 1–3 photos,
  then a description. All mandatory.
- **Remove the record-type menu and the condition/disease options** from the tree Flow. Harvest stays a separate
  short form for the harvest lead only: per tree, fruit per grade.
- **Reply within a minute:**
  - what the system sees, as stage and possible issue in plain words, with "kemungkinan" when unsure;
  - one simple next step taken from the Guide;
  - **only if a count is due for that tree's stage**, one question ("Berapa buah di pohon ini? Balas angka saja."),
    whose numeric reply becomes a crop count linked to the report.

**Triage (Cloud Function `functions/src/triage.ts`, trigger: `reports` onCreate):**
- **Inputs:** the report's photos (the 900px `medium` copies, fetched with the Admin SDK and sent as base64), the
  description, and the tree's context (variety, block, expected stage, last 3 reports, open issues).
- **Call:** `@anthropic-ai/sdk`, `client.messages.parse` with `model: "claude-opus-5-5"`,
  `output_config: { effort: "low", format: zodOutputFormat(TriageSchema) }`, `max_tokens: 4000`, and the
  server-side refusal fallback (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`, through
  `client.beta.messages`).
  - The system prompt carries the stage scale, the issue catalogue with visual cues, the Guide's actions per issue,
    and the rule "say 'tidak yakin' rather than guess". Keep it byte-stable for prompt caching; put the tree context
    and photos in the user turn.
- **`TriageSchema`** (strict):
  - `stage { code, confidence 0–1, evidence }`;
  - `issues [{ code, confidence, evidence }]`;
  - `health: 'hijau' | 'kuning' | 'merah'`;
  - `numbers [{ what, value }]` read from the text;
  - `summary_id` (one sentence, Indonesian);
  - `next_step_id` (one action, plain Indonesian);
  - `ask_count: 'clusters' | 'set' | 'kept' | 'onTree' | null`;
  - `needs_review: boolean`.
- **Write** `reports/{id}.triage` with `{ ...result, model, promptVersion, at }`.
- **Auto-apply** only when `health === 'hijau'` and `stage.confidence ≥ 0.8`: set `reports/{id}.stage` and the
  denormalised `trees/{id}.stage = { code, at, reportId }`. Everything else waits for review.
- **Cost guard:** about $0.03–0.05 per report (two or three images at about 800 tokens each, a cached system
  prompt, about 1k output tokens). Log `usage`. Add a daily cap that falls back to `needs_review` without AI.
- **Failure handling:** on an API error or refusal, write `triage: { error }` and leave the report in the inbox.
  Never block the worker's reply; send "Laporan diterima, admin akan cek."

**Done when** a WhatsApp report with photo and text appears in the web app within a minute, with a stage and issue
suggestion, and the worker has a reply. A Merah suggestion never changes tree health without a person.

## Phase 3: Review inbox and the field report page (P1/P2)

- **"Perlu dicek"** at the top of Laporan. Each card shows:
  - the photo, large;
  - the worker's words;
  - the AI's stage, issue and health chips;
  - the tree's expected stage;
  - buttons: **Benar** (accept), **Ubah** (pick stage / issue / health from `src/shared/`), **Abaikan**.

  On accept or correct:
  - write `review { by, at, decision, changes }`;
  - write the confirmed `stage` / health to the tree, with the usual `treeEdits` log;
  - create follow-ups using the existing re-check rule;
  - reply to the worker if the decision changed the advice.

  Corrections are kept as labelled examples, so the prompt can later include the farm's own confirmed cases.
- **One field report page** (`#/reports/:id`) for every record kind:
  - issue, flowering, count, harvest, task and rain records all open here;
  - it shows photos, words, AI triage, the confirmed result, the worker, the tree's stage timeline and the Guide
    action for the issue.

  The field log rows link to it. Merge Feed and Field log into one Laporan list with kind filters.

**Done when** William can clear a day's reports in minutes without leaving the inbox, and every record links
somewhere useful.

## Phase 4: Stages you can see (P1)

- **Observed stage per tree** = latest confirmed report stage; **expected stage** = engine. Show both wherever a
  tree appears: tree list, tree page, report card, harvest table. Use one `StageChip` with the farm word and the
  day count. Flag a mismatch: off-season flowering ("2 musim") or a wrong bloom date.
- **Stage board on Hari ini.** Per block, a stacked bar of trees by observed stage, e.g. "Blok B: 40 ping pong ·
  12 telor · 5 belum dilihat". Under it, what that stage calls for: thinning, bagging, and the product and dose
  from the stage-triggered programme.
- **Learn the calendar.** From confirmed reports, compute the median days since bloom per stage and variety, and
  show it next to the Guide's ranges. Never hard-code ping pong or telor days.

## Phase 5: "Kebun", William's sheet (P2)

- A **Kebun** tab: one row per tree, sticky header and first column, grouped columns matching his sheet:

  | Group | Columns |
  |---|---|
  | Pohon | Blok, ID, Varietas, Tanam, Supplier |
  | Ukuran | Tajuk, Batang |
  | Bunga & buah | Dahan berbunga, Bonggol, Est. Butir, then one column per count date (2 Sep, 16 Sep, 28 Sep…) |
  | Tahap | Observed and expected stage |
  | Kesehatan | Hijau / Kuning / Merah, membaik, issue, last photo |
  | Label | Batang, Tajuk, Est. Butir, Fruitset |
  | Dosis | Product and dose for the current stage |
  | Catatan | Notes |

- **Inline edit** for measurements and notes (same validation and `treeEdits` log as the tree form). Keyboard
  navigation. Filters per block and stage. Remember the column choices per device.
- **CSV export** of exactly what's shown, and **paste-import** from Google Sheets: preview a diff and apply only
  the changed cells, each logged. That's how William moves off the parallel sheet without retyping.
- **Labels and dose** come from `src/shared/rules.ts`, with thresholds editable in one settings sheet (audit §3
  values until he confirms).

## Phase 6: Lighter navigation and the Catatan Kebun flow (P2/P3)

- **Tabs:** Hari ini · Kebun · Laporan · Panen · Jadwal. Varietas, Pekerja and Panduan go under "Lainnya". The
  Guide switch stays; Guide content appears inside triage replies and the inbox, where it's actionable.
- **Health labels everywhere:** Hijau / Kuning / Merah, plus a "membaik" trend.
- **Catatan Kebun** (audit §2b):
  - tasks offered only when due, per flowering wave;
  - "Pupuk / semprot selesai" with due routines and per-tree doses;
  - an optional photo on tasks;
  - a 07:00 rain template that takes a plain number reply.
- **Daily route push:** each worker gets today's trees to look at (re-checks first, then the oldest unseen), so
  coverage goes from 3 trees a week to every tree every 1–2 weeks.
- **Lock down Firestore rules.** The bot and functions write with the Admin SDK; the web app requires sign-in for
  writes. Coordinate with the owner before publishing.

## How to report back

After each phase, tell the owner in a few lines:
- what a worker now does differently;
- what William now sees;
- what was verified, and how;
- what still needs a decision.

Update `docs/field-audit-2026-10.md` §7 with the status.
