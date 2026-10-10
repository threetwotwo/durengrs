# Data contract: WhatsApp bot ⇄ Firestore ⇄ web app

One Firestore database (`(default)`, project `duren-db`). The **bot** (WhatsApp webhook + Flows endpoint in `bot/`,
see [The WhatsApp bot](#the-whatsapp-bot) below) and the **web app** both read and write it. Every field below has one
meaning on both sides. Shared words, codes and rules live in [`src/shared/`](../src/shared/index.ts), which the bot
imports.

**Rules for both sides**

- **Dates:** a calendar date is `YYYY-MM-DD`, local farm time (Asia/Jakarta). An instant is a Firestore timestamp.
- **`source`:** `'whatsapp' | 'webapp' | 'sheet' | 'sheet-import'` on every field record.
- **`workerPhone`:** digits only, international form (`628…`). It matches `workers/{phone}`.
- **Idempotency:** where the id is deterministic (listed below), writing again replaces the record instead of
  duplicating it. The bot must never overwrite a record with a different `source`.
- **Never delete trees:** archive them (`active: false`).

## Collections

| Collection / id | Written by | Read by | Fields (✱ = new in this contract) |
|---|---|---|---|
| `trees/{treeId}` (e.g. `A12`) | web app (tree page, Trees sheet), bot (counts → fruit estimate, condition from reports) | both | `block, variant, condition (healthy/minor/emergency/not_assessed), conditionNotes, canopySize, trunkSize, floweringBranches, floweringClusters, estimatedFruitCount, datePlanted, supplier, notes, active, lastReportAt, lastReportId, dateUpdated`; ✱`observedStage {code: FarmStage, date, reportId}`: the latest **confirmed** stage seen on the tree; ✱`improving {reportId, date}`: "membaik" from a checked report, shown only while `lastReportId` is that report |
| `treeEdits/{auto}` | both | web app | `treeId, changes {field: {from, to}}, at, source, workerPhone?, reason?`, one per change to a tree |
| `reports/{id}` (bot: 20 hex characters from the flow token + what was sent) | bot | both | `treeId, block, workerPhone, description, photos [{path, url, thumb, medium}], conditionBefore, conditionAfter, conditionChanged, createdAt`, `collageUrl?` (the chat image of several photos); ✱`triage` (below); ✱`review {decision: accepted/corrected/dismissed, by?, at}`; ✱`stage: FarmStage`; ✱`issues: Issue[]`; ✱`health: Health`; ✱`improving: true` ("membaik"); ✱`conditionSource: 'worker' \| 'triage'`: 'triage' when urgent words (or danger Gemini saw) changed the tree; 'worker' only on older reports, from a Flow that asked for a condition; ✱`caseIds` (cases this report opened, treated or re-checked); ✱`ai {status: running/done/failed, model, photos, recorded[] (paths of the records it wrote, e.g. `harvests/wa_…`), error?, at}`; ✱`triageRules` (the word-only reading kept when Gemini's replaces it) |
| ✱`cases/{treeId}_{issue}_{openedOn}[_{name}]` | bot (after Gemini reads a report); web app (the owner closes, reopens or deletes one) | both | one problem on one tree, followed over time: `treeId, block, issue (Issue code), name?, status (open/treated/improving/worse/resolved), openedOn, openedReportId, lastOn, lastReportId, lastAction?, nextCheck (date, null once resolved), closedOn?, events [{date, reportId?, type (seen/treated/checked/improving/worse/resolved/reopened), action?, product?, note?, photo?, by?}], source, updatedAt`. Reports point back with `caseIds`. The web app shows them on Today, Reports › Problems, the tree page and each report; closing by hand adds a `resolved` event (`by`, no `reportId`) and clears `nextCheck`, reopening adds `reopened` and sets `nextCheck` a week out; deleting one (a misreading) keeps its reports. Codes and labels: `src/shared/actions.ts` |
| `harvestCycles/{block}` | web app | both | `block, floweredOn` (the block's bloom date), `updatedAt` |
| `bloomWaves/{treeId}_{date}_{part}` | bot (from a report), web app | both | `treeId, block, date, part (whole/lower/middle/upper/some), note?, photos?, source, workerPhone?` |
| `cropCounts/{treeId}_{season}_{stage}_{date}` | bot (from a report), web app | both | `treeId, block, season (bloom date of the counted flowers), stage (clusters/set/kept/onTree), count, date, by?, note?, photos?, source` |
| `harvests/{auto}`; bot: ✱`harvests/wa_{reportId}` | bot (from a report), web app | both | `block, treeId?, variant, date, fruits, weightKg?, grades {extra, class1, class2, reject}, problems[], problemFruits?, floweredOn?, daysFromBloom?, notes?, photos?, source, workerPhone?`; ✱`reportId?` (the report it was read from; the bot writes no `photos`, they stay on the report). Older bot harvests (`wa` + hex, two-step Flow) may also carry `problems`, `problemFruits`, `photos`, `flowToken` |
| `seasonTasks/{block}_{season}_{task}` | bot (Catatan Kebun, and season jobs seen in a report), web app | both | `block, season, task (hand_pollination/fruit_thinning/bagging/ca_mg_spray/fruit_tying), date, source, workerPhone?`; the first record wins |
| `weather/{date}` | bot (Catatan Kebun), web app | both | `date, rainMm, source, workerPhone?, updatedAt` |
| `treatmentPlans/{auto}`, `treatments/{auto}` | web app | web app (bot: planned, see audit F3) | routines and applications; `plan.lastDone {block: date}` |
| `workers/{phone}` | web app | both | `phone, name` |
| `variants/{code}` | web app | both | `code, name, ripeningDays, …` |
| ✱`farmMeta/labelRules` | web app (Trees › Aturan label dan dosis) | web app | the owner's label limits and doses: `batang, tajuk, est, fruitset` limits, `dose {fruiting, vegetative, young, unit}`, `products`, `confirmed`, `updatedBy, updatedAt`, `previous` (the values it replaced). Read it with `mergeLabelRules(doc)`; a missing document means the sheet's values (`DEFAULT_LABEL_RULES`) |
| `labResults/{auto}`, `guideNotes/{topic}`, `farmMeta/*` | web app | web app | lab values, Guide notes, weekly check, import markers |

## `reports.triage` ✱

Written when the report is triaged: by the bot at receipt (rules), by the web app if missing, and replaced once by
Gemini's reading of the photos and words (`source: 'ai'`, `bot/lib/ai.js`). Shape (`src/shared/triage.ts` `Triage`):

```ts
{
  source: 'rules' | 'ai', version: string,            // 'rules-2', or model + prompt version
  stage?: { code: FarmStage, confidence: number, evidence: string },
  issues: [{ code: Issue, confidence: number, evidence: string }],
  health?: 'hijau' | 'kuning' | 'merah',
  improving: boolean,                                  // "membaik"
  urgent?: boolean,                                    // danger words ("hampir mati", "tumbang") and no "membaik"
  numbers: [{ value: number, kind?: 'fruit' | 'clusters' | 'branches' | 'mm', evidence: string }],  // only numbers written
  needsReview: boolean                                 // false for "all fine", and for treatments / progress on known problems
  // Gemini reading only (source 'ai'):
  stages?: [{ code, confidence, evidence }],           // every stage seen (a tree can show two)
  bloomPart?: 'whole' | 'lower' | 'middle' | 'upper' | 'some',  // where the open flowers are
  summary?: string, photosSeen?: [{ photo, seen }], photoOk?: boolean, photoRequest?: string,
  issues[].name?, issues[].action?, issues[].photo?    // the specific pest/disease, first step, photo number
  actions?: [{ type, issue, product?, target?, case?, evidence, photo? }],  // what the worker did (src/shared/actions.ts ACTIONS)
  caseUpdates?: [{ case, status: treated|improving|same|worse|resolved, evidence }],  // progress on the tree's open cases
  harvest?: { fruits: number, weightKg?: number, grades?: { extra?, class1?, class2?, reject? } }  // fruit picked, as written
}
```

The bot writes it on every new report (`bot/lib/shared.js` is generated from `src/shared`, so both sides read
words the same way). **One exception to "suggestion only":** when the words read as urgent (`urgent: true`: danger
now, such as "hampir mati", "tumbang", "darurat"; a disease name alone is not enough), the bot turns the tree Merah at
once (`conditionSource: 'triage'`), so an emergency never waits for the inbox. Dismissing that report in the inbox
puts the tree back, unless someone changed the condition since.

Words are matched at the start of a word ("aman" is not found in "tanaman"), a negation up to three words back
cancels them ("tidak ada kutu"), and a full stop, comma, line break, "!" or "?" ends a negation.

**A triage is a suggestion.** Only a review (`reports.review`) sets `reports.stage / issues / health`, and from
there `trees.observedStage` and `trees.condition`, each change logged in `treeEdits`. The records Gemini's reading
writes without a person (below) are ordinary field records the owner can edit or delete in the web app.

## The WhatsApp bot

Two Flows (worker text in Indonesian), one endpoint (`POST /flow-endpoint`):

- **Laporan Pohon** (`bot/flows/flow.json`, env `FLOW_ID`): the worker sends a tree ID ("A1"); one screen, `REPORT`:
  1-3 photos and free text, both required, nothing to choose. Flow tokens `lapor:<tree>:<phone>:<time>`; tokens
  `tree:…` from chat messages of the older multi-screen Flow are handled the same way.
- **Catatan Kebun** (`bot/flows/flow-farm.json`, env `FARM_FLOW_ID`): the word `KEBUN` or the "Hujan & Pekerjaan"
  button; rain (`weather`) and finished season work per block (`seasonTasks`).

When a report Flow completes, Gemini reads the report once (`reports.ai` claims it) and the bot:

- replaces `reports.triage` with its reading (the word-only one moves to `triageRules`);
- records what needs no person, with `source: 'whatsapp'` and note "Otomatis dari laporan foto": a flowering
  (`bloomWaves`, today, when flowers are open and none was recorded in the last 30 days); a count the worker wrote
  (`cropCounts`, newest flowering); **a harvest** the worker wrote (`harvests/wa_{reportId}`: `fruits` 1-500,
  `weightKg` 0.5-2000 when written, `grades` when written and not more than `fruits`, `floweredOn` = the flowering
  whose ripening time (the tree's variety, else the block's shortest) is nearest today, `daysFromBloom`, `reportId`);
  each path is listed in `reports.ai.recorded`;
- turns the tree Merah when Gemini reports danger now (`conditionSource: 'triage'`, `treeEdits.reason: 'ai-urgent'`);
- files problems, treatments and progress into `cases` (`reports.caseIds`), and the season jobs it saw into
  `seasonTasks`;
- replies to the worker in the chat (what was seen, first steps, what was recorded, case progress, a better-photo
  request), with a fresh Flow button.

`GET /ai-check?token=<VERIFY_TOKEN>` makes one tiny Gemini call and answers `{ ok, model, endpoint, keySet, error? }`.
Gemini settings (env, never in the repository): `GEMINI_API_KEY` (Google AI Studio; without it nothing is sent and the
rule-based reading stays), `GEMINI_MODEL` (default `gemini-2.5-flash`), `GEMINI_ENDPOINT=vertex` (Vertex AI express
key only), `GEMINI_TIMEOUT_MS` (default 40000).

## Shared vocabulary (`src/shared/`)

| Module | Contents |
|---|---|
| `stages.ts` | `FARM_STAGES` = `veg, rest, bud (mata ketam), bloom, set (pentil), pingpong, egg (telor), grow, mature, harvest, post`; labels, what a worker sees, the engine stage each maps to, `stageMismatch()` |
| `issues.ts` | `ISSUES` = `phytophthora_canker, stem_fungus, leaf_blight, whitefly, borer, leaf_drop, fruit_drop, nutrient, water, other`; label, Guide topic, default health, the worker's next step |
| `health.ts` | Hijau / Kuning / Merah ⇄ `healthy / minor / emergency`; "Membaik" |
| `triage.ts` | `triageText()` (rule-based, free) and `workerReply()` (the bot's instant reply text) |
| `labels.ts` | The owner's size and fruit labels and dose suggestion; every function takes the rules from `farmMeta/labelRules` (`mergeLabelRules`), else the sheet's values. Suggestions only until `confirmed` (which needs a dose unit) |
| `actions.ts` | `ACTIONS` (work done on a tree, e.g. `fungicide`, `canker_treatment`, `harvest`) with labels and kind; case statuses, events and updates with labels; `SEASON_TASK_OF` (an action that is also a block's season job); `RECHECK_DAYS` (7) |
| `crop.ts` | `fruitRemaining()`: fruit on a tree now (last fruit count minus fruit picked since, else this season's tree estimate), for the Trees sheet |

Codes are pinned by `tests/shared.test.ts`. Changing a code is a migration, not a rename.
