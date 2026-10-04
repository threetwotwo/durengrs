# Production audit: Cilowong farm web app

**Goal:** run the app in production so the farm reaches and keeps the ideal conditions for its trees and fruit,
as described in the Guide. **Not covered here:** security rules and sign-in (later), and WhatsApp flows (to be
evaluated later).

Written for a small team: every action says **how much it helps the farm, how much work it is, and who does it**.
Code changes have been made by Claude; what is left for people is a few console clicks and short habits.

---

## How the priority works

**Impact = how much the action helps the farm achieve and maintain ideal conditions** (right timing of care,
healthy trees, good fruit), not how important it is for the software. The list is sorted by impact first, then
by least effort.

| Impact | Meaning for the farm |
|---|---|
| ★★★★★ | Directly decides whether care happens at the right time (flowering, thinning, bagging, disease checks). |
| ★★★★ | Keeps a core condition (water, nutrition, harvest timing) measured and on target. |
| ★★★ | Keeps tree records correct, so advice for each tree is right. |
| ★★ | Helps in the field, but trees aren't affected directly. |
| ★ | Housekeeping. |

| Effort | | Who | |
|---|---|---|---|
| **S** | under 1 hour, once | **You** | clicks in the Firebase console |
| **M** | half a day to a day, once | **Claude** | code change (done) |
| **Habit** | a few minutes, repeated | **Team** | a short routine |

---

## Do this first (about 10 minutes)

1. **A0 Publish the database rules.** Without this, none of the new records (bloom dates, harvests, rain, season
   tasks, lab results, weekly check) can be saved. See A0 below.
2. **Buy a rain gauge** (A15) and put it in an open spot.
3. Start the habits in [The team's routine](#the-teams-routine).

---

## All actions, sorted by impact on the farm

| # | Action | Impact | Effort | Who | Status |
|---|---|---|---|---|---|
| A0 | Publish the database rules | ★★★★★ | S | You | **to do** |
| A5 | Record bloom dates every season | ★★★★★ | Habit | Team | app done (one tap) |
| A11 | One-tap "done" for season tasks | ★★★★★ | M | Claude + Team | **done** |
| A7 | Weekly 10-minute farm check | ★★★★★ | Habit | Team | app done (marker) |
| A15 | Rain gauge + daily rain entry | ★★★★ | M | Claude + Team | **done**; buy a gauge |
| A16 | Lab results page | ★★★★ | M | Claude | **done**; yearly lab test |
| A12 | Fix overdue routines that are not overdue | ★★★★ | S | Claude | **done** |
| A6 | Simple harvest log | ★★★★ | M | Claude + Team | **done** |
| A10 | Keep ripening days up to date | ★★★★ | Habit | Team | app suggests (one tap) |
| A2 | Use the default database | ★★★★ | S | You + Claude | **done** |
| A3 | Check the bot's timestamps | ★★★ | S | You | **done, passes** |
| A4 | Stop losing unsaved tree edits | ★★★ | S | Claude | **done** |
| A8 | Make planting date editable | ★★★ | S | Claude + Team | **done**; fill in dates |
| A9 | Check tree measurements when saving | ★★★ | S | Claude | **done** |
| A13 | Clear message on a slow connection | ★★ | S | Claude | **done** |
| A1 | Backups | ★★ | S | You | skipped for now |
| A14 | Deploy settings in the code | ★ | S | Claude (+ You) | **done** |
| A18 | Faster first load | ★ | S | Claude | partly (see notes) |
| A17 | Error alerts | ★ | S | Claude | skipped |

---

## The team's routine

All of it fits in about **1 minute a day and 10 minutes a week**, plus a few taps per season.

| When | What | Where in the app | Time |
|---|---|---|---|
| Every morning, 7:00 | Read the rain gauge, type the number (or tap **No rain**), empty the gauge | Dashboard → **Rain** | 1 min |
| Every Monday | Open the Guide, fix the first red item, tap **Mark as checked** | Guide → **Farm check** | 10 min |
| When flowers open in a block | Tap **Block X: flowers opened today** | Dashboard → **This season** | seconds |
| When a season task is done | Tap the block chip (**Block A: done?**) next to the task | Dashboard / Guide → **This season** | seconds |
| End of each harvest day | Enter fruit count per block (+ problems) | Schedule → Harvest → **Log harvest** | 1 min per block |
| After each harvest season | Tap **Use N days** where the real ripening days differ | Variants | 1 min |
| Once a year, before flowering | Leaf + soil test; copy the numbers in | Guide → Nutrition → **Add lab result** | 10 min |
| Once, block by block | Fill in planting dates (approximate year is fine) | Tree page | as time allows |

---

## Action details

### A0 Publish the database rules · ★★★★★ · S · You · to do

**Why:** the database only accepts the new kinds of records once the rules say so. The repository's
`firestore.rules` already allows them. Your screenshot from 4 Oct showed only `reports`, `trees` and
`variants`, which suggests the published rules are older. Until they are published, taps on bloom dates,
season tasks, rain, harvests, lab results and the weekly check show "Publish the updated firestore.rules".

**Steps (5 minutes):**
1. Open the [Firebase console](https://console.firebase.google.com), project **duren-db**.
2. **Firestore Database** → **Rules** tab.
3. Replace everything with the contents of `firestore.rules` from the repository.
4. Click **Publish**.

**Done when:** tapping **No rain** on the Dashboard shows "Rain for … saved."

### A5 Record bloom dates every season · ★★★★★ · Habit · Team

Every stage, "do now" action, season task and harvest date is counted from the day flowers open in each block.
**App (done):** one tap ("Block X: flowers opened today"), "other date" for a past day, and Undo. It's on the
Dashboard, the Guide and tree pages, wherever a block has no date or is waiting for flowers.

### A11 One-tap "done" for season tasks · ★★★★★ · M · Claude + Team · done

**Why:** thinning, bagging, the calcium + magnesium spray and tying fruit stalks are done once per season, timed
from the bloom date. Doing them late costs fruit size and quality, or lets borers in.
**App:** each task in **This season** has a chip per block: **Block A: done?** One tap records it (tap again to
undo). A task whose window has just passed turns amber "late", and the farm check lists late tasks for 14 days
after the window, while they're still worth doing. Hand pollination is offered but optional, so it is never
counted as late.

| Task | Window (days after bloom) |
|---|---|
| Hand pollination (optional) | 0-7 |
| Fruit thinning | 28-60 |
| Bagging | 28-49 |
| Calcium + magnesium spray | 45-60 |
| Tie fruit stalks | 61 to 2 weeks before harvest |

### A7 Weekly 10-minute farm check · ★★★★★ · Habit · Team

**App (done):** **Mark as checked** in the Guide's farm check and on the Dashboard's Farm check tile. It shows
"Checked N days ago", amber after 7 days.

### A15 Rain gauge + daily rain entry · ★★★★ · M · Claude + Team · done

**Why:** about 15 dry days trigger flowering around 50 days later. 200 mm or more of rain while fruit matures
raises the risk of wet core and uneven ripening.
**App:** a **Rain** card on the Dashboard: one number, or **No rain**, plus a 14-day chart. When the 15-day
average falls below 1 mm, it shows "Dry spell since …, flowers usually open around …" (also on the Guide's
"Waiting for flowers" card). The farm check warns when rain hasn't been recorded for over 3 days, and when a
maturing block has had 200 mm or more.
**You:** buy a simple plastic rain gauge and place it in the open.

### A16 Lab results page · ★★★★ · M · Claude · done

**App:** Guide → Nutrition (and Climate & soil) → **Add lab result**: block, date, and any of pH, organic matter,
N, P, K, Ca, Mg, B, Zn. Comma decimals are fine. The latest result per block shows each value green, or amber
"low"/"high" against the Guide's ranges. The farm check lists out-of-range values and counts a recent result as
the yearly test done.

### A12 Fix overdue routines that are not overdue · ★★★★ · S · Claude · done

Each routine now remembers its last-done date per block, updated with every log (and corrected on undo or
delete). Existing routines are rebuilt from their full history the first time the app opens after this change.

### A6 Simple harvest log · ★★★★ · M · Claude + Team · done

**App:** Schedule → Harvest → **Log harvest**: date, block (variety picked automatically if the block has one),
number of fruit, optional weight, and problem buttons (wet core, uneven ripening, rot, cracked, borers). The app
stores the days since bloom. A summary shows per variety: fruit, % with problems, and **real ripening days** next
to the typed ones. The farm check reminds you if a block's harvest window has passed with nothing logged.

### A10 Keep ripening days up to date · ★★★★ · Habit · Team

**App (done):** Variants cards show "Real: N days (from M harvest entries)". When it differs by more than 3 days,
**Use N days** updates it in one tap. The Guide's harvest topic shows the same.

### A2 Use the default database · ★★★★ · done
The app uses the **(default)** database; the misleading `duren-db` database id was removed.

### A3 Check the bot's timestamps · ★★★ · done, passes
`reports.createdAt` is stored as a timestamp.

### A4 Stop losing unsaved tree edits · ★★★ · done
Untouched fields refresh when a report arrives; your edits stay; a notice names any field changed in both
places, with **Discard my changes**.

### A8 Make planting date editable · ★★★ · done (team: fill in dates)
Date field on the tree page (1990 to today). The Guide uses it for fruit load by tree age.

### A9 Check tree measurements when saving · ★★★ · done
Girth 1-600 cm, canopy 50-2,500 cm, clusters 0-2,000, fruit 0-500. Only changed fields are checked.

### A13 Clear message on a slow connection · ★★ · done
After 10 seconds of loading: "Weak signal. Data will appear as soon as the connection returns." A copy of the
data is kept on the device, so the app opens instantly next time, even offline.

### A14 Deploy settings in the code · ★ · done
`firebase.json` (database, rules, indexes, storage rules, hosting from `dist/`) and `firestore.indexes.json`
(the reports index the tree page needs). If you deploy with the Firebase command line, `firebase deploy
--only firestore:rules` publishes the rules (an alternative to A0's console steps).

### A18 Faster first load · ★ · partly
Photo storage now loads only with the Reports page, and the Dashboard no longer loads 8 photo albums. The
offline copy (A13) adds about 25 kB (compressed) to the shared database code. That's worth it for weak signals.

### A1 Backups · skipped for now · A17 Error alerts · skipped

---

## Dashboard audit

The Dashboard is now arranged around **what needs doing today to keep the trees in ideal condition**.

| # | Finding | Change |
|---|---|---|
| D1 | "Orchard health" repeated the KPI tiles and the block table | Merged into one **Blocks** table with an overall health bar on top |
| D2 | Block table had counts only | Adds **season stage**, **harvest window** and **% of trees checked in 7 days** per block (from the Guide) |
| D3 | "Reported today" tile duplicated the coverage bar | Replaced by a **Farm check** tile (items needing action + weekly check marker) |
| D4 | Trees needing attention didn't say what to read | Each tree shows the **Guide topic** its notes point to (e.g. "getah merah" → Canker & rot) |
| D5 | 8 reports with full photo albums loaded on every visit | **6 compact reports** with one small photo each; full photos stay on the Reports page |
| D6 | No water information | **Rain** card next to the Blocks table |
| D7 | Season card only appeared when there was room | Blocks without a bloom date always show the one-tap button; season tasks have Done chips |
| D8 | Counting and phone masking were repeated in several places | One pass over the trees for all counts; one shared phone-masking helper |

---

## What's already in good shape

- **Navigation:** pages have shareable links, Back works, and filters stay in the address bar.
- **Language:** Indonesian first, same words as the WhatsApp reports.
- **Clean deletes and history:** report deletion removes the photos too; tree edits and variant changes keep a
  history.
- **Validation:** the variant form and tree measurements check their values before saving.
- **The Guide** ties research to the farm's own data, and its farm check finds gaps automatically.

## Not included

- **Security rules and sign-in.** The database is open to anyone with the address; plan it next.
- **WhatsApp flows.** On hold. An earlier draft is in [whatsapp-flows.md](./whatsapp-flows.md), for reference only.
