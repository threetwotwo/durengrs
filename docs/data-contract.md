# Data contract: WhatsApp bot ⇄ Firestore ⇄ web app

One Firestore database (`(default)`, project `duren-db`). The **bot** (WhatsApp Flows endpoint) and the **web app**
both read and write it. Every field below has one meaning on both sides. Shared words, codes and rules live in
[`src/shared/`](../src/shared/index.ts), which the bot imports.

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
| `trees/{treeId}` (e.g. `A12`) | web app (form, Kebun), bot (counts → fruit estimate, condition from reports) | both | `block, variant, condition (healthy/minor/emergency/not_assessed), conditionNotes, canopySize, trunkSize, floweringBranches, floweringClusters, estimatedFruitCount, datePlanted, supplier, notes, active, lastReportAt, lastReportId, dateUpdated`; ✱`observedStage {code: FarmStage, date, reportId}`: the latest **confirmed** stage seen on the tree; ✱`improving {reportId, date}`: "membaik" from a checked report, shown only while `lastReportId` is that report |
| `treeEdits/{auto}` | both | web app | `treeId, changes {field: {from, to}}, at, source, workerPhone?, reason?`, one per change to a tree |
| `reports/{auto}` | bot | both | `treeId, block, workerPhone, description, photos [{url, thumb, medium}], conditionBefore, conditionAfter, conditionChanged, createdAt`; ✱`triage` (below); ✱`review {decision: accepted/corrected/dismissed, by?, at}`; ✱`stage: FarmStage`; ✱`issues: Issue[]`; ✱`health: Health`; ✱`improving: true` ("membaik") |
| `harvestCycles/{block}` | web app, bot | both | `block, floweredOn` (the block's bloom date), `updatedAt` |
| `bloomWaves/{treeId}_{date}_{part}` | bot, web app | both | `treeId, block, date, part (whole/lower/middle/upper/some), note?, photos?, source, workerPhone?` |
| `cropCounts/{treeId}_{season}_{stage}_{date}` | bot, web app | both | `treeId, block, season (bloom date of the counted flowers), stage (clusters/set/kept/onTree), count, date, by?, note?, photos?, source` |
| `harvests/{auto}` | bot, web app | both | `block, treeId?, variant, date, fruits, weightKg?, grades {extra, class1, class2, reject}, problems[], problemFruits?, floweredOn?, daysFromBloom?, photos?, source, workerPhone?` |
| `seasonTasks/{block}_{season}_{task}` | bot (Catatan Kebun), web app | both | `block, season, task (hand_pollination/fruit_thinning/bagging/ca_mg_spray/fruit_tying), date, source, workerPhone?`; the first record wins |
| `weather/{date}` | bot (Catatan Kebun), web app | both | `date, rainMm, source, workerPhone?, updatedAt` |
| `treatmentPlans/{auto}`, `treatments/{auto}` | web app | web app (bot: planned, see audit F3) | routines and applications; `plan.lastDone {block: date}` |
| `workers/{phone}` | web app | both | `phone, name` |
| `variants/{code}` | web app | both | `code, name, ripeningDays, …` |
| `labResults/{auto}`, `guideNotes/{topic}`, `farmMeta/*` | web app | web app | lab values, Guide notes, weekly check, import markers |

## `reports.triage` ✱

Written once when the report is triaged: by the bot at receipt, by the web app if missing, or later by a photo
model. Shape (`src/shared/triage.ts` `Triage`):

```ts
{
  source: 'rules' | 'ai', version: string,            // 'rules-1', or model + prompt version
  stage?: { code: FarmStage, confidence: number, evidence: string },
  issues: [{ code: Issue, confidence: number, evidence: string }],
  health?: 'hijau' | 'kuning' | 'merah',
  improving: boolean,                                  // "membaik"
  numbers: [{ value: number, kind?: 'fruit' | 'clusters' | 'branches' | 'mm', evidence: string }],
  needsReview: boolean                                 // false only for a plain "all fine" report
}
```

**A triage is a suggestion.** Only a review (`reports.review`) sets `reports.stage / issues / health`, and from
there `trees.observedStage` and `trees.condition`, each change logged in `treeEdits`.

## Shared vocabulary (`src/shared/`)

| Module | Contents |
|---|---|
| `stages.ts` | `FARM_STAGES` = `veg, rest, bud (mata ketam), bloom, set (pentil), pingpong, egg (telor), grow, mature, harvest, post`; labels, what a worker sees, the engine stage each maps to, `stageMismatch()` |
| `issues.ts` | `ISSUES` = `phytophthora_canker, stem_fungus, leaf_blight, whitefly, borer, leaf_drop, fruit_drop, nutrient, water, other`; label, Guide topic, default health, the worker's next step |
| `health.ts` | Hijau / Kuning / Merah ⇄ `healthy / minor / emergency`; "Membaik" |
| `triage.ts` | `triageText()` (rule-based, free) and `workerReply()` (the bot's instant reply text) |
| `labels.ts` | The owner's size and fruit labels and dose suggestion (**not confirmed**: suggestions only) |

Codes are pinned by `tests/shared.test.ts`. Changing a code is a migration, not a rename.
