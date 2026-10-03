# Production audit: Cilowong farm web app

Audit of the whole web app against what the Guide says the farm must measure and maintain, with production
readiness in mind. **Security rules and sign-in are out of scope for now** (tracked separately).

Companion plan: [whatsapp-flows.md](./whatsapp-flows.md) designs the field-worker flows that close the data gaps
found here.

Priority: **P0** blocks going live or makes the app give wrong advice · **P1** needed soon after launch ·
**P2** quality and cost.

---

## 1. Why data gaps matter here

Almost everything the Guide does is computed from a few inputs. If an input is missing, the advice silently
falls back to a generic default:

| Guide output | Depends on | Captured today? |
|---|---|---|
| Season stage per block, "do now" actions, harvest window | Bloom date per block (`harvestCycles`) | Manually, in the web app only |
| Harvest date per block/variety | Bloom date + `variants.ripeningDays` | Ripening days typed by hand, never checked against real harvests |
| Predicting bloom ~50 days ahead | Daily rain (15-day dry spell) or bud-emergence date (~49 days) | **No** |
| Wet-core / uneven-ripening risk | Rain while fruit matures (≥200 mm) | **No** |
| Phosphonate injection timing, flowering readiness, psyllid watch | Leaf-flush stage per block | **No** |
| Thinning, bagging, fruit tying, hand pollination done on time | One-off season tasks tied to the bloom date | **No** (only recurring routines exist) |
| Harvest forecast, fruit load vs tree age | `estimatedFruitCount`, `datePlanted` | Fruit count yes; planting date **cannot be edited** |
| Real ripening days, yield per tree, quality (wet core, rot, cracking) | Harvest records | **No** |
| Phytophthora early detection | Structured trunk-check results | Free-text reports only (keyword matching) |
| Leaf and soil nutrient targets | Lab results | **No** place to store them |
| Pushing the right task to the right worker | Worker roster (name, phone, blocks, role) | **No** (only `workerPhone` on reports) |

---

## 2. Findings

### P0: wrong or missing advice, or a risky launch

**P0-1. No harvest records.** Nothing stores what was harvested, when, how much, or its quality. That means:
- ripening days can never be corrected from the farm's own data (the Guide asks for this);
- the harvest forecast can't be checked against reality;
- yield per tree, per variety and per block is unknown;
- wet core, uneven ripening and fruit rot can't be linked to rain, nutrition or thinning.

*Fix:* new `harvests` collection, filled by Flow **F5 Panen**; harvest view in the app; a rolling median of
actual bloom-to-harvest days per variety shown next to `ripeningDays` on the Variants page.

**P0-2. The bloom date, which drives the whole Guide, is only entered in the web app.** The people who
see flowers open are in the field. A missed or late entry shifts every stage, action and harvest date for that
block.
*Fix:* Flow **F1 Pembungaan** reports bud emergence and bloom per block. The web app keeps the manual
override.

**P0-3. Planting date is read-only.** `datePlanted` shows "Recorded" and can't be edited. The fruit-load
check and young-tree guidance depend on it, so for most trees they never fire.
*Fix:* make it editable in the tree form (date input, not in the future, not before 1990), and capture it in
Flow **F9 Pohon baru / sulam** for new and replacement trees.

**P0-4. Deployment isn't reproducible from the repo.** There is no `firebase.json` or
`firestore.indexes.json`. The tree page and report deletion need a composite index (`reports`: `treeId ==` +
`createdAt desc`), which presumably exists only in the console. New flow collections will add more.
*Fix:* commit `firebase.json` (hosting + rules + indexes) and `firestore.indexes.json`, and deploy from the repo.

**P0-5. Unclear which database the app uses.** `firebase-applet-config.json` names `firestoreDatabaseId:
"duren-db"`, but the app calls `getFirestore(app)`, which uses `(default)`. The bot must write to the same
database the app reads.
*Fix:* decide on one database, set it explicitly in code and in the bot, and remove the misleading config field.

**P0-6. Date and timestamp contracts aren't written down.** The app's queries assume `reports.createdAt`
is a Firestore `Timestamp` (unread badge, activity view). A bot that writes ISO strings would make those
reports invisible to the queries. Date-only fields (`floweredOn`, `treatments.date`) are local
`YYYY-MM-DD` strings. A bot server running in UTC would record dates a day early before 07:00 WIB.
*Fix:* the data contract in [whatsapp-flows.md §4](./whatsapp-flows.md#4-data-contracts). `Timestamp` for
instants, `YYYY-MM-DD` in **Asia/Jakarta** for calendar dates, and `source` + `flowToken` on every write.

**P0-7. No backups.** One bad bot deploy or manual delete can wipe history that the Guide needs year over year.
*Fix:* enable Firestore point-in-time recovery and a scheduled daily export to Cloud Storage.

### P1: needed soon after launch

**P1-1. Tree measurements accept anything.** In the tree form, trunk girth, flower clusters and fruit count
accept negative or absurd values, and canopy width is free text (units mix). These numbers feed the
fruit-load rule and the harvest forecast.
*Fix:* validate in the form and in the bot with one shared rule set: girth 1–600 cm, canopy 50–2,500 cm
(number only), clusters 0–2,000, fruit 0–500. Show a warning, not a block, when fruit exceeds the age-based
typical maximum.

**P1-2. One-off season tasks can't be logged.** Thinning (in rounds around days 28–60), bagging (by week 6
after fruit set), tying fruit stalks, hand pollination and flower-bud thinning happen once per season,
timed from the bloom date. Today only recurring routines exist, so they're invisible.
*Fix:* a `seasonTasks` log (block, task, date, share of trees done) filled by Flow **F3 Pekerjaan selesai**.
The Guide then marks each "do now" action as done or overdue per block.

**P1-3. Trunk checks are free text.** Phytophthora is the main threat, and the Guide asks for weekly trunk
checks in wet weather. Reports are matched to topics by keywords, which is a heuristic.
*Fix:* Flow **F4 Cek batang** records structured symptoms (`wet_patch`, `red_ooze`, `borer_hole`,
`bark_crack`, `none`) on the report, and the follow-up rule (emergency 2 days, minor 7) applies to them.

**P1-4. No rain or water data.** The Guide can't detect the dry spell that triggers flowering, warn about
≥200 mm while fruit matures, or flag waterlogged blocks.
*Fix:* Flow **F6 Hujan & air**, one reading a day from a rain gauge, plus standing water and irrigation per
block, written to a `weather` collection keyed by date.

**P1-5. No leaf-flush data.** Phosphonate injection works best during a flush, flowering needs hardened leaves,
and psyllids attack new flushes. None of this is recorded.
*Fix:* Flow **F7 Tunas daun** records the flush stage per block every 2 weeks outside the fruiting period.

**P1-6. Lab results have no home.** The Guide recommends a yearly leaf analysis and soil pH test and compares
them with target ranges. There's nowhere to put the numbers.
*Fix:* a web-app form (owner-entered, not WhatsApp): `labResults` per block and date with pH, N, P, K, Ca, Mg, B,
Zn and organic matter. The nutrition topic then shows each value against its range.

**P1-7. Treatments listener is capped at 500.** `computeTasks` takes the last-done date per plan and block
from the newest 500 treatments. Once frequent routines (e.g. weekly irrigation across blocks) push older entries
out, rarely done routines look **never done / overdue**.
*Fix:* store `lastDone` per plan and block on the plan document (updated in the same batch as each log), or
query per plan.

**P1-8. No worker roster.** Pushing flows needs to know who gets which task (rain recorder, sprayer, block
leads). Reports only carry a phone number.
*Fix:* a `workers` collection (name, phone E.164, roles, blocks, language, active) managed in the web app.
It's also the base for sign-in later.

**P1-9. No error monitoring.** Listener failures only reach `console.error`. Bot write failures aren't
visible anywhere.
*Fix:* a lightweight error reporter for the web app, and a `botEvents` log (or Cloud Logging alert) for
failed flow submissions.

### P2: quality, cost, polish

- **P2-1. Bundle size.** The Firebase chunk is ~550 kB (165 kB gzip). Load Storage only on report pages, and
  consider splitting `firebase/firestore` usage per page.
- **P2-2. Offline use of the web app.** Firestore's memory cache is used. Enabling `persistentLocalCache`
  lets the owner open the app in the field with a weak signal. Workers are covered by WhatsApp.
- **P2-3. Read cost.** Every open listens to all `trees`, `variants`, `treatmentPlans`, `harvestCycles` and 500
  `treatments`. Fine at hundreds of trees. Revisit past ~2,000 trees.
- **P2-4. Keyword matching** of notes to Guide topics stays useful for free text, but should defer to
  structured symptom codes once F4 exists.
- **P2-5. Variant codes on trees aren't constrained.** The Variants page now flags unknown codes; the bot
  should only offer codes from `variants` (dynamic dropdown via the data endpoint).

---

## 3. What's already in good shape

- Hash routing with deep links, Back that works, and URL-held filters across pages.
- Indonesian-first UI with matching vocabulary to the WhatsApp flow.
- Report deletion cleans up photos and repairs the tree.
- Tree edits are atomic with their audit record.
- The variant form validates, deletes cleanly, and reassigns trees.
- The Guide's farm check already flags missing bloom dates, ripening days, unknown variant codes, fruit
  counts, measurements, inspection coverage and missing routines.

---

## 4. Suggested order of work

1. **Before go-live:** P0-4 deploy config + indexes, P0-5 database choice, P0-6 data contract, P0-7 backups,
   P0-3 editable planting date.
2. **Flows wave 1** (highest value per effort): F1 Pembungaan, F5 Panen, F3 Pekerjaan selesai, plus the
   `workers` roster (P1-8).
3. **Flows wave 2:** F6 Hujan & air, F4 Cek batang, F2 Hitung buah.
4. **Flows wave 3 + app:** F7 Tunas daun, F9 Pohon baru / sulam, lab results form (P1-6), validation
   (P1-1), treatments `lastDone` (P1-7), monitoring (P1-9).
