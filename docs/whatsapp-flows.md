# WhatsApp Flows plan: field data for the Guide

How field workers feed the data the Guide needs, without opening the web app. This plan builds on the existing
tree-report flow (`flow.json` / `index.js` in the bot, whose vocabulary is mirrored in `src/i18n/common.ts`).
That bot code isn't in this repository, so anything about its current behaviour below is **inferred from
what the web app reads** and marked *(assumed)*.

See [production-audit.md](./production-audit.md) for why each metric matters.

---

## 1. Architecture

```
            ┌───────────────────────── scheduler (bot cron / Cloud Function, Asia/Jakarta) ─────────────────────────┐
            │ reads: trees, variants, harvestCycles, weather, flushes, seasonTasks, treatmentPlans, treatments,     │
            │        workers  →  runs the SAME stage/check rules as src/lib/guide.ts                                │
            │ decides: who gets which flow today  →  sends an approved *utility template* with a Flow button        │
            └──────────────────────────────────────────────────────────┬────────────────────────────────────────────┘
                                                                       │
 worker's WhatsApp  ◀──── template + Flow ──────────────────────────────┘
        │ fills the flow (dropdowns come from the data endpoint)
        ▼
 Flow data endpoint (bot, HTTPS, encrypted per Meta spec)
   • INIT / data_exchange: returns blocks, trees in a block, due tasks, variants … for this worker
   • complete: validates (shared rules) → writes Firestore in one batch → replies with a summary message
        │
        ▼
 Firestore (same database as the web app)  ──▶  web app listeners  ──▶  Guide stages, checks, Dashboard
```

**Principles**

1. **One rule set.** Stage windows, follow-up limits, validation ranges and the dry-spell rule live in one
   shared module. Extract `src/lib/guide.ts` / `src/lib/variants.ts` logic (no React) into a small package
   imported by both the web app and the bot. Never fork the numbers.
2. **Short flows.** Each flow fits one screen (two at most), takes under a minute, and works one-handed in
   the field. Free text is optional, never required.
3. **Dynamic choices only.** Blocks, trees, variants and tasks always come from the data endpoint, so a worker
   can't send an unknown code.
4. **Idempotent writes.** Each submission carries the Meta `flow_token`; writes use it as the document ID, or
   check it first, so retries don't duplicate.
5. **Business-initiated messages need approved templates.** Outside the 24-hour customer-service window,
   WhatsApp only lets the business start a conversation with a pre-approved template. Each pushed flow
   needs a *utility* template with a Flow button. Budget for the per-conversation cost and keep pushes few and
   relevant (see §5).
6. **Indonesian first**, same words as the app (`common.ts` glossary). English variants of the templates are
   optional.

---

## 2. Metric → flow map

| Missing or weak metric | Flow | Who | When pushed |
|---|---|---|---|
| Bud emergence + bloom date per block | **F1 Pembungaan** | Block lead | Preflower stage: weekly; after buds reported: every 3 days until bloom |
| Fruit count per tree after thinning | **F2 Hitung buah** | Block lead | Day ~60 after bloom (end of thinning), per block |
| Season tasks done (bud/fruit thinning, bagging, tying, hand pollination) + routine work | **F3 Pekerjaan selesai** | Whoever did it | On the day a task is due; also self-started anytime |
| Structured trunk / Phytophthora check | **F4 Cek batang** | Block lead | Weekly per block in wet weather; within 2 days (emergency) / 7 days (minor) for follow-ups |
| Harvest: date, count, weight, quality | **F5 Panen** | Harvest crew lead | Daily while any block is in its harvest window |
| Daily rain, standing water, irrigation | **F6 Hujan & air** | One rain recorder | Every morning, 07:00 |
| Leaf-flush stage per block | **F7 Tunas daun** | Block lead | Every 14 days in the recovery and preflower stages |
| Tree condition, notes, photos | **F0 Laporan pohon** *(exists, assumed)* | Anyone | Self-started; follow-ups pushed per the rule above |
| New / replacement tree, planting date | **F9 Pohon baru / sulam** | Supervisor | Self-started |
| Lab results (soil pH, leaf nutrients) | *Web app form, not WhatsApp* | Owner | After each lab report |

---

## 3. Flow catalog

Field names are the Firestore fields they write. "→" marks what the Guide or app does with it.

### F0 Laporan pohon *(existing, assumed)*
Tree, condition (Sehat / Masalah ringan / Darurat), keterangan, photos, optional measurements
(Pengukuran: lebar kanopi, lingkar batang, cabang berbunga, kelompok bunga, perkiraan jumlah buah).
**Changes:** add an optional **symptom** checklist (same codes as F4) and enforce the validation ranges in §4.

### F1 Pembungaan (flowering), per block
| Screen field | Type | Values |
|---|---|---|
| Blok | Dropdown (endpoint) | blocks assigned to this worker |
| Yang terlihat | RadioButtons | `buds` Kuncup mulai muncul · `bloom` Bunga mulai mekar · `drop` Banyak bunga rontok |
| Tanggal | DatePicker | default today; not in the future |
| Berapa pohon | Dropdown | `<25%`, `25-50%`, `50-75%`, `>75%` |
| Varietas yang berbunga | CheckboxGroup (endpoint) | varieties present in the block |
| Foto | PhotoPicker | optional, 0-3 |

Writes `flowerEvents/{flowToken}` `{ block, event, date, share, variants[], photos[], workerPhone, source, createdAt }`.
On `bloom` with share ≥ 25% and no bloom date yet this season, it also sets `harvestCycles/{block}.floweredOn`
(the earliest such date wins; the web app can still override).
→ Season stages start. `buds` predicts bloom at about +49 days. `drop` links to the Flowering topic (why flowers drop).

### F2 Hitung buah (fruit count), per tree, repeatable
| Field | Type | Values |
|---|---|---|
| Blok → Pohon | Dropdown → Dropdown (endpoint) | trees in the block; trees without a count this season first |
| Jumlah buah setelah penjarangan | TextInput (number) | 0-500 |
| Dibrongsong? | RadioButtons | semua / sebagian / belum |
| Lanjut ke pohon berikutnya | Footer | submits and reopens for the next tree (`data_exchange`) |

Writes `trees/{id}.estimatedFruitCount` plus a `fruitCounts/{flowToken}` history row (tree, date, count, bagged).
→ Harvest forecast, fruit-load check against tree age, and the "trees without a fruit estimate" check goes green.

### F3 Pekerjaan selesai (work done)
| Field | Type | Values |
|---|---|---|
| Pekerjaan | RadioButtons (endpoint) | due routines (from `treatmentPlans`) + season tasks due now: `bud_thinning`, `fruit_thinning`, `bagging`, `fruit_tying`, `hand_pollination` |
| Blok | CheckboxGroup (endpoint) | blocks where it is due (preselected) |
| Tanggal | DatePicker | default today |
| Bagian pohon | Dropdown | season tasks only: semua / sebagian |
| Produk, dosis | TextInput | routines only, prefilled from the plan |
| Catatan | TextArea | optional |

Routines write `treatments` exactly like the web app (`planId`, `planName`, `type`, `date`, `blocks`, `product`,
`dose`, `doneBy` = worker name, `source: 'whatsapp'`). Season tasks write `seasonTasks/{flowToken}`
`{ block, task, date, coverage, season (= floweredOn), workerPhone, createdAt }`.
→ Schedule agenda clears. Each Guide "do now" action shows done or overdue per block.

### F4 Cek batang (trunk check), per tree
| Field | Type | Values |
|---|---|---|
| Blok → Pohon | Dropdown (endpoint) | trees not checked in 7 days first; follow-ups on top |
| Yang terlihat | CheckboxGroup | `none` Tidak ada · `wet_patch` Bercak basah di kulit · `red_ooze` Getah merah-cokelat · `borer_hole` Lubang + serbuk kayu · `bark_crack` Kulit retak · `fruit_rot` Buah busuk |
| Kondisi | RadioButtons | Sehat / Masalah ringan / Darurat (suggested from symptoms: `red_ooze` or `wet_patch` → Darurat) |
| Foto | PhotoPicker | required if any symptom, 1-3 |

Writes a normal `reports` document plus `symptoms: string[]` and `kind: 'trunk_check'`, and updates the tree
the way F0 does. → Follow-up timer, Phytophthora topic mentions, and the inspection-coverage check.

### F5 Panen (harvest), per tree or per block
| Field | Type | Values |
|---|---|---|
| Blok → Pohon (optional) | Dropdown (endpoint) | blocks in their harvest window; "Seluruh blok" allowed |
| Tanggal | DatePicker | default today |
| Cara | RadioButtons | `drop` Jatuh sendiri · `cut` Dipetik |
| Jumlah buah | TextInput (number) | 1-500 |
| Berat total (kg) | TextInput (number) | optional, 0.5-2,000 |
| Masalah mutu | CheckboxGroup | `none` · `wet_core` Daging basah · `uneven` Matang tidak rata · `rot` Busuk · `crack` Retak · `borer` Ulat/penggerek |
| Berapa buah bermasalah | TextInput (number) | shown if any problem |

Writes `harvests/{flowToken}` `{ block, treeId?, variant (from tree or block), date, method, fruits, weightKg?,
problems[], problemFruits?, floweredOn (copied from harvestCycles), daysFromBloom, workerPhone, source, createdAt }`.
→ Actual ripening days per variety (median of `daysFromBloom`), yield per tree/variety/block, and quality
vs rain (F6) and nutrition.

### F6 Hujan & air (rain & water), farm-wide, daily
| Field | Type | Values |
|---|---|---|
| Hujan 24 jam terakhir (mm) | TextInput (number) | 0-400, from the rain gauge read at 07:00 |
| Blok tergenang | CheckboxGroup (endpoint) | optional |
| Blok yang disiram kemarin | CheckboxGroup (endpoint) | optional |

Writes `weather/{YYYY-MM-DD}` `{ rainMm, waterlogged[], irrigated[], workerPhone, createdAt }` (one per day,
last write wins).
→ **Dry-spell detector** (15-day mean < 1 mm) predicts bloom about 50 days later per block. Rain over 200 mm in
a block's maturing/harvest window raises a wet-core warning. Waterlogged blocks raise a Phytophthora warning.

### F7 Tunas daun (leaf flush), per block
| Field | Type | Values |
|---|---|---|
| Blok | Dropdown (endpoint) | |
| Tahap daun | RadioButtons | `none` Tidak ada tunas baru · `young` Tunas muda (merah/cokelat muda) · `light` Hijau muda · `hardened` Hijau tua/kaku |
| Berapa pohon | Dropdown | `<25%` … `>75%` |
| Kutu loncat terlihat? | RadioButtons | ya / tidak |

Writes `flushes/{flowToken}`. → Phosphonate routine gets a "good time: flush in progress" hint. The preflower
stage shows "leaves ready" once `hardened` ≥ 75%. Psyllid sightings link to the Pests topic.

### F9 Pohon baru / sulam (new or replacement tree)
Block, tree number, variety (endpoint), planting date, supplier, rootstock (optional), replaces tree? (dropdown).
Writes `trees/{id}` with `datePlanted` and `dateCreated`, and logs `treeEdits`.
→ Fruit-load rule and the planting topic.

---

## 4. Data contracts

Apply these to every write from the bot (and from the web app where the collection is shared).

| Rule | Detail |
|---|---|
| Instants | Firestore `Timestamp` (`serverTimestamp()`), e.g. `createdAt`. Never ISO strings: web app queries compare Timestamps. |
| Calendar dates | `YYYY-MM-DD` string in **Asia/Jakarta** (`date`, `floweredOn`, `weather` doc id). |
| Provenance | `source: 'whatsapp'`, `workerPhone` (E.164), `flowToken` (idempotency). |
| Codes | `block`, `treeId` and `variant` must exist (taken from the endpoint lists). |
| Ranges | girth 1-600 cm · canopy 50-2,500 cm · flower clusters 0-2,000 · fruit 0-500 · rain 0-400 mm · harvest weight 0.5-2,000 kg · ripening days 60-200 |
| Atomicity | Tree update + audit/report writes in one batch, like the web app's `saveTreeChanges`. |

New collections: `flowerEvents`, `fruitCounts`, `seasonTasks`, `harvests`, `weather`, `flushes`, `workers`,
`labResults` (web app only), optional `botEvents` (errors). Each needs a matching block in `firestore.rules`
(open like the others until sign-in lands) and composite indexes for `(block, date desc)` where listed by block.

`workers/{phone}`: `{ name, phone, roles: ('rain'|'block_lead'|'harvest'|'sprayer'|'supervisor')[], blocks[],
lang: 'id'|'en', active }`, managed in the web app.

---

## 5. Push schedule

The scheduler runs once a day at 06:30 WIB, plus event-driven follow-ups. It sends **at most one template per
worker per day**. If a worker has several items, one template opens a menu flow listing them.

| Trigger (computed from shared rules) | Template | Opens |
|---|---|---|
| 07:00 daily | `cek_hujan` | F6 |
| Block in preflower, leaves hardened, weekly | `cek_kuncup` | F1 (`buds`) |
| Buds reported, until bloom recorded, every 3 days | `cek_mekar` | F1 (`bloom`) |
| Day 28 / 45 / 60 after bloom | `tugas_musim` (thinning, bagging) | F3 |
| Day 60 after bloom | `hitung_buah` | F2 |
| Routine due today or overdue (from `computeTasks`) | `tugas_rutin` | F3 |
| Wet weather (≥ 3 rain days in 7, from F6) and block not checked in 7 days | `cek_batang` | F4 |
| Emergency tree > 2 days / minor > 7 days without a report | `cek_ulang_pohon` | F4 for that tree |
| Block enters its harvest window | `panen_mulai`, then daily while open | F5 |
| Recovery / preflower stage, every 14 days | `cek_tunas` | F7 |

Each template needs Meta approval (utility category, Indonesian), with a Flow button and 1-2 variables
(block, tree, task).

---

## 6. Web app work to consume the flows

| Flow | App change |
|---|---|
| F1 | Harvest view shows bloom events; Guide predicts bloom from `buds` (+49 d) or the F6 dry spell (+50 d) |
| F2 | Fruit-count history on the tree page |
| F3 | Guide "do now" actions show ✓ done / overdue per block; Schedule history shows season tasks |
| F4 | Report card shows symptom chips; topic matching prefers symptom codes |
| F5 | **Harvest log** (Schedule → Harvest): per block, variety, tree; actual vs expected ripening days on Variants; quality rates |
| F6 | Weather strip on the Dashboard; dry-spell and >200 mm alerts in the farm check |
| F7 | Flush stage per block on the Guide season cards; phosphonate timing hint |
| F9 | Editable planting date (needed regardless; see audit P0-3) |
| Roster | Workers page (name, phone, roles, blocks) |

---

## 7. Rollout

1. **Groundwork:** data contract (§4), `workers` roster, shared rules package, rules and index entries,
   template approvals.
2. **Wave 1:** F1, F5, F3. These unlock the season engine, real ripening days and task tracking.
3. **Wave 2:** F6, F4, F2. Rain-driven predictions, structured disease surveillance, forecast accuracy.
4. **Wave 3:** F7, F9 and the lab results form.

Pilot each flow with one block lead for a week, then check in the web app that the matching Guide check turns
green before rolling it out farm-wide.

### Example Flow JSON (F1, single screen)

Set `version` to the latest Flow JSON version your account supports; `DatePicker` and `PhotoPicker` are
standard components. `data_api_version` is required because the block and variety lists come from the endpoint.

```json
{
  "version": "6.3",
  "data_api_version": "3.0",
  "routing_model": { "PEMBUNGAAN": [] },
  "screens": [
    {
      "id": "PEMBUNGAAN",
      "title": "Pembungaan",
      "terminal": true,
      "data": {
        "blocks": { "type": "array", "items": { "type": "object", "properties": { "id": { "type": "string" }, "title": { "type": "string" } } }, "__example__": [{ "id": "A", "title": "Blok A" }] },
        "variants": { "type": "array", "items": { "type": "object", "properties": { "id": { "type": "string" }, "title": { "type": "string" } } }, "__example__": [{ "id": "MK", "title": "Musang King" }] },
        "today": { "type": "string", "__example__": "2026-10-03" }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          { "type": "Dropdown", "name": "block", "label": "Blok", "required": true, "data-source": "${data.blocks}" },
          {
            "type": "RadioButtonsGroup", "name": "event", "label": "Yang terlihat", "required": true,
            "data-source": [
              { "id": "buds", "title": "Kuncup mulai muncul" },
              { "id": "bloom", "title": "Bunga mulai mekar" },
              { "id": "drop", "title": "Banyak bunga rontok" }
            ]
          },
          { "type": "DatePicker", "name": "date", "label": "Tanggal", "required": true, "max-date": "${data.today}" },
          {
            "type": "Dropdown", "name": "share", "label": "Berapa pohon", "required": true,
            "data-source": [
              { "id": "lt25", "title": "Kurang dari 25%" },
              { "id": "25_50", "title": "25-50%" },
              { "id": "50_75", "title": "50-75%" },
              { "id": "gt75", "title": "Lebih dari 75%" }
            ]
          },
          { "type": "CheckboxGroup", "name": "variants", "label": "Varietas yang berbunga", "required": false, "data-source": "${data.variants}" },
          { "type": "PhotoPicker", "name": "photos", "label": "Foto (opsional)", "min-uploaded-photos": 0, "max-uploaded-photos": 3 },
          {
            "type": "Footer", "label": "Kirim",
            "on-click-action": {
              "name": "complete",
              "payload": {
                "block": "${form.block}", "event": "${form.event}", "date": "${form.date}",
                "share": "${form.share}", "variants": "${form.variants}", "photos": "${form.photos}"
              }
            }
          }
        ]
      }
    }
  ]
}
```

Check component availability and limits (for example PhotoPicker counts and sizes, and which Flow JSON version
added a component) against Meta's current Flow JSON reference before building. They change between versions.
