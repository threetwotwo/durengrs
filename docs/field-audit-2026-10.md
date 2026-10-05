# Field audit, October 2026: from field to healthy trees

**The goal is a healthy, productive durian farm.** The WhatsApp Flow and the web app only exist to get the right
observation from the right tree to the right person in time, and to turn it into the right care. Every finding
below is judged by that.

Audited: the web app at `697b778` (main, 5 Oct 2026), the WhatsApp Flow as seen in the owner's screenshots, the
farm's tree sheet (2 Sep / 16 Sep / 28 Sep 2026 columns) and the live numbers shown on the Dashboard. The bot code
is **not in this repository**, so its behaviour is read from what it writes to Firestore and from screenshots.

---

## 1. What the numbers say today

| Signal (Dashboard, 4–5 Oct) | Value | What it means for the trees |
|---|---|---|
| Trees reported in the last 7 days | **3 of 390** | Almost no tree is being looked at. Disease is found late or not at all. |
| Re-checks overdue | **69** | Problem trees are not followed up within 2 days (emergency) / 7 days (minor). |
| Emergency / watch list | **22 / 49** | Many flags, mostly from the sheet import, with no field follow-up. |
| Flower clusters → fruit set → on tree | 5,057 → 930 → 1,279 | Counts exist from the sheet. "After thinning" was never counted. |
| Trees with a count due | **98** | The count workflow is not being followed. |
| Trees in the app vs rows in the sheet | 390 (5 blocks) vs ≈199 (blocks A–D) | Needs a check: block E, test trees (A0) and duplicates. |

**Conclusion:** the system has plenty of structure but very little field input. The bottleneck is the cost of
sending one report, for a worker who isn't trained in data entry or disease identification. Fixing that has more
impact on tree health than any web app feature.

---

## 2. Workers and the WhatsApp Flow

| # | Finding | Impact on the farm |
|---|---|---|
| W1 | The Flow opens with a **menu of 6 record types** (Mulai berbunga, Hitung tandan bunga, Hitung buah jadi, Hitung buah yang disisakan, Hitung buah di pohon, Catat panen). The worker must already know which stage the tree is in to pick the right one. | Wrong or skipped records; stage knowledge is assumed, not captured. |
| W2 | The issue report ("Buka Laporan Pohon") asks the worker to **classify the problem** (condition, disease options). Workers can't reliably tell hawar daun from jamur batang from kanker batang. | Misclassified disease, inflated "Darurat", real problems hidden under "Sehat". |
| W3 | **Photo and description are optional** on several records. | Nobody can verify or diagnose later, and the AI or agronomist has nothing to look at. |
| W4 | **No daily route.** Nothing tells a worker which trees to look at today. | 3 of 390 trees seen in a week. |
| W5 | **Tree identification is typed by hand** ("A0", "B12"). | Wrong-tree records; friction on every report. |
| W6 | **The reply is only "Terima kasih, laporan sudah tersimpan."** The worker learns nothing and gets no next step. | No learning loop. The worker never hears "that's leaf blight, cut and burn it". |

**Direction (owner's request, agreed):** the worker sends **tree + photo(s) + a few words** (text, or a voice
note later). That's all; photo and description are mandatory. The **system** works out the stage, the likely
issue, any number written in the text and how urgent it is. The owner confirms with one tap, and the worker gets a
short reply in plain Indonesian.

### 2b. The "Catatan Kebun" flow (`docs/flows/flow-farm.json`, v7.3, data API 3.0)

Two paths after one radio choice: **Curah Hujan** (date ≤ 7 days back, mm 0–400, extra "Ya, angka sudah benar"
confirmation on unusual values) and **Pekerjaan Selesai** (block, a fixed checkbox list of 5 season tasks, date ≤ 30
days back). All screens go through `data_exchange`, so the endpoint already owns the logic. That's good: choices
can be made dynamic without republishing the Flow.

| # | Finding | Impact on the farm | Change |
|---|---|---|---|
| F1 | **The task list is fixed**, so all 5 tasks are always offered. Hand pollination shows up when no block is in bloom, and bagging when there's no fruit. | Ticks that can't be true; real gaps hidden. | Fill `data-source` from the endpoint with **only the tasks due for that block now** (same rule as `fieldInsights.blockTasks`), plus "Lainnya" with a photo. |
| F2 | **Done is per block, not per flowering wave.** The app tracks tasks per wave (trees or branches that flowered apart). | A late wave looks done when it isn't. | When a block has more than one wave, show one checkbox per wave ("Blok A · bunga 14 Sep (A3, A7)"). |
| F3 | **No routine work** (pupuk, semprot, pangkas from `treatmentPlans`). The most frequent field work, fertiliser per tree, is only entered in the web app or kept in William's sheet. | Feeding and spraying aren't tied to the trees and stages they were for; doses aren't checked. | Add "Pupuk / semprot selesai": the endpoint lists routines due now, with product and per-tree dose from the label rule (§3); the worker ticks them and adds a photo. |
| F4 | **No photo on tasks.** | Nobody can verify bagging or thinning quality. | Optional photo (bagging, thinning) that goes through the same triage. |
| F5 | **Rain needs the whole Flow** (open, choose, date, number, save) every morning. | Rain days get skipped; the dry-spell flowering trigger and wet-core risk go blind. | A 07:00 utility template "Hujan kemarin berapa mm? Balas angka (0 jika tidak hujan)". A plain number reply is parsed by the bot; the Flow stays as the fallback. |

The tree flow ("Panen & Data Pohon": a menu of 6 record types; "Laporan Pohon": condition and disease options) and
the endpoint code (`index.js`) aren't in this repository. Its JSON is still needed to finish the contract.

---

## 3. Owner (William) and the web app

William runs the farm from a Google Sheet: **one row per tree**, columns for measurements, dated counts
(2 Sep, 16 Sep, 28 Sep), Hijau/Kuning/Merah with the disease name and "membaik", size labels
(high/mid/low), and **fertiliser doses per tree** tied to a stage ("Oct W1 Vegetatif", "Oct W1 All Ping Pong",
"Oct W2 All Telor").

| # | Finding | Impact |
|---|---|---|
| O1 | **Seven top-level tabs plus a Guide switch.** The Reports tab has three sub-views (Feed, Field log, Activity). His sheet is one screen. | He has to learn the app's map before he can answer "how is tree B12?". |
| O2 | **The tree table lacks his columns:** no stage, no dated counts, no traffic-light health, no labels or dose. It's paginated, read-only (no inline edit) and has no export or paste. | He keeps working in the sheet and the app drifts out of date. |
| O3 | **Stage is computed only from the block's bloom date,** with app-made names (Bakal buah, Buah membesar…). His words are **mata ketam, ping pong, telor**, and they are what he observes. | Stage isn't visible per tree and doesn't match what the field sees. Off-season trees ("2 musim") are invisible. |
| O4 | **Only issue reports have a detail page.** Counts, flowerings and harvests in the field log can't be opened. Feed and Field log are two lists of overlapping things. | Field evidence (photos on counts) is hard to find. |
| O5 | **Health words don't match.** The app says Sehat / Masalah ringan / Darurat; the sheet says Hijau / Kuning / Merah plus "membaik" (improving). There's no "improving" state at all. | Translation errors; recovery isn't tracked. |
| O6 | **Fertiliser dosing per tree lives only in the sheet.** App routines are per block and per calendar month. | The most frequent input decision can't be planned or checked in the app. |
| O7 | **The Guide adds value but also weight.** It's now hidden behind a switch, which helps. | Keep it, but surface Guide content inside triage replies and the review inbox, where it's actionable. |

### William's sheet already contains a rule set (observed; to be confirmed by him)

| Label | low | mid | high | skip |
|---|---|---|---|---|
| Batang (trunk girth, cm) | ≤ 37 | 38–55 | ≥ 56 | young tree |
| Tajuk (canopy, cm) | < 340 | 340–549 | ≥ 550 | — |
| Est. Butir (dahan × bonggol) | ≤ 14 | 15–47 | ≥ 48 | ≤ 1 |
| Fruitset (fruit count 28 Sep) | 1–5 | 6–11 | ≥ 12 | 0 |

Dose pattern seen across all rows:
- **Fruiting trees:** the dose follows the Fruitset label (low 0.5, mid 0.75, high 1.0).
- **Non-fruiting trees:** the dose follows Tajuk (high 1.0, otherwise 0.5).
- **Young trees:** 1.0.

Products are tied to stages: Y-Unik/M-Grower for vegetative, YM Winner and NPK Perfect at ping pong, YV Caltrac at telor. **This is exactly
"right care at the right stage, per tree"**, so the app should compute this table, not replace it.

---

## 4. Sync between WhatsApp and the web app

| # | Finding | Risk |
|---|---|---|
| S1 | **The bot lives outside this repository.** Vocabulary is copied by hand: `common.ts` says it "matches flow.json". | The two drift apart every time either side changes. |
| S2 | **There's no written data contract** (collections, fields, enums, id formats, who writes what). Rules are spread over comments in `fieldData.ts`, `fieldLog.ts` and `crop.ts`. | Silent breakage, as with bloom ids, season moves and count ids, all of which were fixed after the fact. |
| S3 | **Firestore rules are open and the API key is public.** Anyone can write farm data. | Acceptable while testing. It becomes critical once an AI writes structured data automatically. |

---

## 5. Phenological stages: one scale, observed and expected

**There's no published BBCH scale for durian.** Researchers describe Musang King stages "from crab eye to mature
fruit" ([Springer 2026](https://link.springer.com/article/10.1007/s11084-026-09722-y)). Musang King fruit grows
slowly for 0–28 days after fruit set, fast from 28–70 days, and ripens from 70–90 days
([De Gruyter 2025](https://www.degruyterbrill.com/document/doi/10.1515/opag-2025-0422/html?lang=en)). The farm's
own words map onto that. **Proposed farm scale** (codes are internal, labels are William's words):

| Code | Label (ID) | What the worker sees | Engine stage today |
|---|---|---|---|
| `veg` | Vegetatif / tunas daun | New leaf flush | preflower / recovery |
| `rest` | Daun tua, siap bunga | Mature dark leaves, dry spell | preflower |
| `bud` | **Mata ketam** | Small round buds on branches | preflower (≈ 3–5 weeks before bloom) |
| `bloom` | Bunga mekar | Open flowers | bloom (day 0–7) |
| `set` | Pentil / buah jadi | Tiny fruit after petals drop | set (day 8–27) |
| `pingpong` | **Ping pong** | Fruit ping-pong ball size | thin |
| `egg` | **Telor** | Egg size | thin → grow |
| `grow` | Buah besar | Fruit growing fast | grow |
| `mature` | Menjelang matang | Last month, spines spread | mature |
| `harvest` | Panen / jatuh | Fruit falling, being picked | harvest |
| `post` | Pemulihan | After harvest: pruning, feeding | recovery |

- **Observed stage:** the latest confirmed field report for that tree (from the photo, the words or the reviewer).
- **Expected stage:** today's engine, which counts days from the bloom date.
- **Where they disagree, show it.** A tree "expected Buah besar, observed Mata ketam" is either flowering
  off-season ("2 musim") or the bloom date is wrong. Both matter for care.
- **The day ranges for ping pong and telor are deliberately not fixed.** The system learns them from confirmed
  reports (days since bloom per stage, per variety), the same way real ripening days are learned from harvests.

---

## 6. Target design

1. **One field report.** Worker sends tree + 1–3 photos + description (text, later voice). It's stored in
   `reports`, as today, with new fields:
   - `triage`: AI suggestion of stage, issues, severity, numbers and a one-line summary;
   - `review`: accepted or corrected, by whom;
   - `stage`: the confirmed farm-scale code.

   Confirmed values write the structured records the app already uses (crop counts, bloom records, tree
   condition), linked back by `reportId`.
2. **AI triage** runs as a Cloud Function on each new report. It uses Claude with vision, structured JSON output,
   and the farm's stage and issue catalogue plus Guide topics in the prompt (estimated $0.03–0.05 per report).
   - **Conservative auto-apply:** stage and Hijau results apply automatically at high confidence. Any Kuning or
     Merah, and any disease name, waits for one-tap review.
   - **Reply to the worker** in plain Indonesian: what it looks like, the one next step, and a question only if a
     count is due for that stage.
3. **Review inbox** ("Perlu dicek") at the top of Laporan. Each card shows the photo, the AI's suggestion and three
   buttons: Benar, Ubah, Abaikan. This is where William's knowledge (or an agronomist's) is applied once and then
   reused.
4. **Kebun sheet view** for William. One row per tree, his column groups, sticky header and first column, inline
   edit, filters, CSV export and paste-import. Columns include observed and expected stage, health traffic light
   with trend, dated counts, labels and dose.
5. **Field report detail page** for every record kind (issue, flowering, count, harvest, task), all opened from
   one list.
6. **Stage board** on Hari ini: per block, how many trees are in each observed stage, e.g. "Blok B: 40 ping pong ·
   12 telor · 5 belum dilihat". It also shows what the stage calls for (thinning, bagging, the product and dose).
7. **One repository, one contract.** Bot code moves into this repo (or a submodule). Vocabulary, stage scale,
   issue codes and rules live in `src/shared/` and are imported by both the bot and the app, with contract tests.
8. **Fewer tabs:** Hari ini · Kebun · Laporan · Panen · Jadwal. Varietas, Pekerja and Panduan move under "Lainnya".

---

## 7. Priorities (impact on tree health first)

| Pri | Work | Why it helps the trees |
|---|---|---|
| **P1** | Photo + description reporting, AI triage, review inbox, worker reply | More eyes on more trees; disease named correctly and early; workers learn |
| **P1** | Farm stage scale; observed stage per tree; stage board | Care (thinning, bagging, feeding, pest control) happens at the observed stage, tree by tree |
| **P1** | Data contract and bot in this repo; shared vocabulary | WhatsApp and web app can't drift apart |
| **P1** | Firestore rules lock-down for automatic writes (bot and function use the Admin SDK) | Prerequisite for auto-apply |
| **P2** | Kebun sheet view; Hijau/Kuning/Merah + membaik; per-tree dose table | William can drop the parallel sheet; dosing follows size and fruit load |
| **P2** | Field report detail for all kinds; one Laporan list | Evidence is one tap away |
| **P3** | Daily route push; QR or number tags with wa.me links; voice notes | Coverage and less typing |

**Build status (5 Oct 2026)**

| Work | Status |
|---|---|
| Shared vocabulary and data contract (`src/shared/`, `docs/data-contract.md`) | **Done.** Bot to import it once its code is in the repo. |
| Rule-based triage of the worker's words + worker reply text | **Done** in `src/shared/triage.ts` (free). Bot side waits for the bot code. |
| "Perlu dicek" review inbox (Laporan) | **Done.** Benar / Ubah / Abaikan; a check sets the report's stage, issues and health, the tree's observed stage and (latest report only) its condition, logged in `treeEdits`. |
| Observed stage per tree, next to the expected one | **Done.** Trees list (Tahap column), tree page header, Panen table, report cards and the report page. Violet = what was seen fits none of the tree's flowering waves; dashed = seen over 30 days ago. |
| Stage board on Hari ini | **Done.** Per block: trees by observed stage, not seen, how many don't fit the bloom date, and the expected stages. |
| Review from the report page | **Done.** The same Benar / Ubah / Abaikan sits on each report's page; checked values can be changed later. |
| Photo AI triage | Later, behind the same `Triage` shape, once there's an API key. |
| Field record page for every kind; one Laporan list | **Done.** Laporan is one list (worker reports, flowering, counts, harvests, tasks, rain, tree data) with search, kind, block, condition, sender and source filters; every row opens its page (`#/reports/<id>` for a worker report, `#/reports/<kind>:<id>` for the rest). The review inbox shows 4 at a time above it. Tree pages link to all their records. |
| Kebun sheet view | **Done** (`#/kebun`). One row per tree in William's column groups (Pohon, Ukuran, Bunga & buah, dated counts, Tahap, Kesehatan, Label, Dosis, Catatan), sticky header and ID column, sort, filters (block, stage, health, ID), column groups remembered per device, totals row. Type into a cell like Sheets (Enter/Tab/Esc/arrows); same checks and `treeEdits` log as the tree form. Paste from Google Sheets previews only the changed cells; CSV export of what's shown. Labels and dose are suggestions from `src/shared/labels.ts`; the thresholds are shown but not editable until William confirms them. |
| Lighter navigation; Hijau / Kuning / Merah everywhere | **Done.** Tabs: Hari ini · Kebun · Laporan · Panen · Jadwal; Pohon, Varietas, Pekerja and Panduan under "Lainnya" (a menu on desktop, a sheet on phones). Conditions read Hijau / Kuning / Merah with their meaning on hover; a checked "membaik" shows on the tree (`trees.improving`) until a newer report arrives. Stored codes are unchanged. |
| Catatan Kebun changes, daily route push, 07:00 rain template | Waiting for the bot code (all bot-side). |
| Firestore rules lock-down | Needs the owner: the web app would need sign-in for writes, and the bot must write with the Admin SDK first. |
| Bot: photo + words mandatory, no menus, instant reply | Waiting for the bot code. |

---

## 8. Questions for the owner

1. Where does the WhatsApp bot code live, and can it move into this repository (or be shared with this session)?
2. Are the stage words and their order right (vegetatif → mata ketam → bunga → pentil → ping pong → telor → buah
   besar → matang)? Are any missing?
3. Who confirms AI suggestions (William, a mandor, an agronomist), and how quickly?
4. Is the label and dose rule in §3 right? Which unit is the dose (kg per tree)?
5. Should there be 390 trees? The sheet has about 199 in blocks A–D. What is block E?
6. Can we get an Anthropic API key and billing for triage (about $15–20 per month at 500 reports)?
7. Do workers prefer voice notes to typing?

### Answers (5 Oct 2026) and decisions taken

| # | Answer | Decision |
|---|---|---|
| 1 | Bot code can move into this repo | Waiting for `index.js` and the tree Flow JSON. Until then the contract lives in `src/shared/` and the bot is told what to import. |
| 2 | Stage words: not sure | Use the §5 scale. Reviewers can always choose "tidak yakin", and the scale is one list in `src/shared/stages.ts` that's easy to rename. Calibrate it from confirmed photos. |
| 3 | Fertiliser rule: not sure | Show the §3 labels and doses as **suggestions marked "to confirm"**, with thresholds in one place. Nothing is applied automatically. |
| 4 | Who approves: not sure | Default: whoever uses the web app (William) confirms in the "Perlu dicek" inbox. Nothing about disease or health changes without that tap. |
| 5 | Block E = newly planted, may be reorganised | **Done:** a block whose trees are all under 4 years old is "Belum berbuah". It's left out of bloom-date reminders, the farm check and the harvest card. |
| 6 | API key: perhaps; is there something cheaper? | **Start at $0:** rule-based triage of the worker's words (stage words, issue words, numbers), shared with the bot for an instant reply, plus one-tap human review. Add photo AI later behind the same interface. Claude Haiku 4.5 is about $0.005 per report (≈ $2.50/month at 500 reports); Claude Opus 5.5 is about $0.025 (≈ $12.50/month) and more accurate on disease photos. |
