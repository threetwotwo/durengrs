# Production audit: Cilowong farm web app

**Goal:** run the app in production so the farm can keep trees and fruit in the best condition, as described in
the Guide. **Not covered here:** security rules and sign-in (later), and WhatsApp flows (to be evaluated later).

Written for a small team: every action says **how much it helps, how much work it is, and who does it**. Most
of the work is either a few clicks in the Firebase console or code changes Claude can make. The team's part is
kept to short habits.

---

## How the priority works

Each action gets two scores. The list is sorted by **impact first**, then by **least effort**.

| Impact | Meaning |
|---|---|
| ★★★★★ | Protects trees, fruit or years of data. Skipping it can cause real loss. |
| ★★★★ | The Guide gives wrong or generic advice without it. |
| ★★★ | Saves time or avoids confusing mistakes. |
| ★★ | Nice to have. |
| ★ | Polish. |

| Effort | Meaning |
|---|---|
| **S** | Under 1 hour, done once |
| **M** | Half a day to a day, done once |
| **L** | Several days |
| **Habit** | A few minutes, repeated (daily, weekly or per season) |

| Who | Meaning |
|---|---|
| **You** | Clicks in the Firebase console or a quick check. Steps are written out. |
| **Claude** | A code change. Ask Claude to do it and review the result. |
| **Team** | A short routine for whoever manages the farm. |

---

## Start here: the first week

If you only do five things, do these. Your part is about **5 minutes** plus a short team habit; the rest are code
changes Claude can do.

1. **A3 Check the bot's timestamps** (You, 5 min)
2. **A4 Stop losing unsaved tree edits** (Claude)
3. **A5 Record bloom dates every season** (Team, 2 min per block per season)
4. **A8 Make planting date editable** (Claude)
5. **A9 Check tree measurements when saving** (Claude)

**Decided:** A1 backups skipped for now · A2 done (the default database is the live one) · A17 skipped.

---

## All actions, sorted by impact

| # | Action | Impact | Effort | Who |
|---|---|---|---|---|
| A1 | Turn on backups · **skipped for now** | ★★★★★ | S | You |
| A2 | Check which database is live · **done** | ★★★★★ | S | You (+ Claude, 1 line) |
| A3 | Check the bot's timestamps | ★★★★★ | S | You |
| A4 | Stop losing unsaved tree edits | ★★★★★ | S | Claude |
| A5 | Record bloom dates every season | ★★★★★ | Habit | Team |
| A6 | Simple harvest log | ★★★★★ | M | Claude + Team habit |
| A7 | Weekly 10-minute farm check | ★★★★ | Habit | Team |
| A8 | Make planting date editable | ★★★★ | S | Claude |
| A9 | Check tree measurements when saving | ★★★★ | S | Claude |
| A10 | Keep ripening days up to date | ★★★★ | Habit | Team |
| A11 | One-tap "done" for season tasks | ★★★★ | M | Claude |
| A12 | Fix overdue routines that are not overdue | ★★★ | S | Claude |
| A13 | Clear message on a slow connection | ★★★ | S | Claude |
| A14 | Put deploy settings in the code | ★★★ | S | Claude (+ You, once) |
| A15 | Rain gauge + daily rain entry | ★★★ | M | Claude + Team habit |
| A16 | Lab results page | ★★★ | M | Claude |
| A17 | Error alerts · **skipped** | ★★ | S | Claude (+ You, sign-up) |
| A18 | Faster first load | ★ | S | Claude |

---

## Action details

### A1 Turn on backups · ★★★★★ · S · You · skipped for now

> Skipped for now by decision. Worth revisiting before the first full season of data.

**Why:** the Guide improves every season from the farm's own history: bloom dates, ripening days, condition
changes and work done. One mistaken delete or a bad bot update could erase years of it. Today there is no backup.

**Steps (Firebase console, about 15 minutes):**
1. Open [console.firebase.google.com](https://console.firebase.google.com), choose project **duren-db**.
2. Go to **Firestore Database**, then the **Disaster recovery** (or **Backups**) tab.
3. Turn on **Point-in-time recovery**. This lets you restore any moment from the last 7 days.
4. Create a **backup schedule**: daily, keep 14 days or more.
5. (Optional) Upgrade to the Blaze plan if the console asks; backups need it. The cost at this farm's size is
   very small.

**Done when:** the Backups tab shows a daily schedule and point-in-time recovery is on.

---

### A2 Check which database is live · ★★★★★ · S · You (+ Claude, 1 line) · done

> **Done.** The **(default)** database is the live one. The unused `duren-db` database was deleted but kept
> coming back; the likely cause was `"firestoreDatabaseId": "duren-db"` in `firebase-applet-config.json`, which
> AI Studio's Firebase setup reads. That line has been removed and the app now states the default database
> explicitly. If `duren-db` still reappears after deleting it again, check AI Studio's Firebase integration
> settings. If the bot names a database in its own config, it should use the default too.

**Why:** the settings file names a database called `duren-db`, but the app reads the **(default)** database.
If the WhatsApp bot writes to one and the app reads the other, reports silently go missing.

**Steps:**
1. In the Firebase console, open **Firestore Database**. At the top there is a database selector.
2. Note which database has your `trees` and `reports` (with recent dates).
3. Tell Claude the name. Claude makes the app point to it explicitly and removes the misleading setting.

**Done when:** the app and the bot are confirmed to use the same database.

---

### A3 Check the bot's timestamps · ★★★★★ · S · You

**Why:** the app's "new reports" badge and the Activity view look for reports by date. They only find a report
if its `createdAt` is stored as a Firestore **timestamp**. If the bot stores it as text, those reports are
missing from both.

**Steps (5 minutes):**
1. Firebase console → **Firestore Database** → `reports` → open the newest report.
2. Look at `createdAt`. It should say **timestamp** next to it, not **string**.
3. Also check one with a date field written by the bot (e.g. a treatment from WhatsApp): `date` should look
   like `2026-10-04`, in Indonesian time.

**Done when:** both look right. If not, send a screenshot to whoever maintains the bot (or to Claude).

---

### A4 Stop losing unsaved tree edits · ★★★★★ · S · Claude

**Why:** on a tree's page, the form resets every time that tree changes in the database. If a WhatsApp report
arrives while someone is typing, their unsaved changes disappear without warning.

**Change:** keep the user's edits when new data arrives, and show a small notice ("This tree was updated by a
new report") with the option to reload.

**Done when:** editing a tree while a report comes in keeps the typed values.

---

### A5 Record bloom dates every season · ★★★★★ · Habit · Team

**Why:** every season stage, "do now" action and harvest date in the Guide is counted from the day flowers open
in each block. Without it, the Guide can only give general advice.

**Routine (2 minutes per block, once per season):**
1. When most flowers in a block open, open the app → **Schedule** → **Harvest**.
2. Pick the date for that block. That's all.

**Done when:** the Guide's farm check shows "Every block has a bloom date".

---

### A6 Simple harvest log · ★★★★★ · M · Claude + Team habit

**Why:** nothing records what was harvested. Without it the farm can't learn its real ripening days, its yield
per tree or variety, or how often fruit has wet core or rot. The Guide asks for exactly these to improve each
season.

**Change (Claude):** a small form in **Schedule → Harvest**: date, block, number of fruit, optional weight,
and tick boxes for problems (wet core, uneven ripening, rot, cracks, borers). The app then works out the real
bloom-to-harvest days per variety and shows them next to the ripening days on the Variants page.

**Routine (Team, 1 minute per block per harvest day):** at the end of a harvest day, enter the totals per block.

**Done when:** after one harvest season, the Variants page shows the real ripening days next to the typed ones.

---

### A7 Weekly 10-minute farm check · ★★★★ · Habit · Team

**Why:** the Guide's farm check already lists what needs attention: missing bloom dates, sick trees waiting for
a re-check, overdue work, missing Phytophthora prevention. It only helps if someone looks.

**Routine (every Monday, 10 minutes):**
1. Open **Guide**. Look at **Farm check**.
2. Fix the first red item, or give it to someone.
3. Look at **This season by block** and share the "Do now" list with the field team.

**Done when:** it has happened four Mondays in a row.

---

### A8 Make planting date editable · ★★★★ · S · Claude

**Why:** planting date is shown as "Recorded" and can't be changed. The Guide uses it to warn when a tree carries
more fruit than is normal for its age, and for young-tree care. Without it these warnings never appear.

**Change:** a date field on the tree page (not in the future, not before 1990).

**Team, once:** fill it in for trees you know, a block at a time. An approximate year is fine.

---

### A9 Check tree measurements when saving · ★★★★ · S · Claude

**Why:** trunk girth, flower clusters and fruit count accept negative or impossible numbers, and canopy width
accepts any text. One typo can make the harvest forecast or fruit-load warning wrong.

**Change:** clear limits with friendly messages. Girth 1-600 cm, canopy 50-2,500 cm (number only), clusters
0-2,000, fruit 0-500. Also a warning (not a block) if fruit is far above normal for the tree's age.

---

### A10 Keep ripening days up to date · ★★★★ · Habit · Team

**Why:** harvest dates come from bloom date + ripening days per variety. The Variants page now shows the
published range; for Super Tembaga there is no published figure at all.

**Routine (after each harvest season, 5 minutes):** open **Variants**, and for each variety put in the real
number of days from bloom to harvest. With A6, the app suggests the number.

---

### A11 One-tap "done" for season tasks · ★★★★ · M · Claude

**Why:** thinning (around days 28-60), bagging (by week 6), tying fruit stalks and hand pollination are timed
from the bloom date and done once per season. Today there is no way to mark them done, so nobody can see
what was missed.

**Change:** a **Done** button next to each "Do now" item on the Guide's season cards, per block. One tap
records the date. Late items turn amber.

**Team:** tap Done when a task is finished. No typing.

---

### A12 Fix overdue routines that are not overdue · ★★★ · S · Claude

**Why:** the schedule only reads the newest 500 work records. After some months of frequent routines (for
example weekly watering), older records drop out, and routines done less often (pruning, leaf analysis)
wrongly show as "never done" or overdue. The team then stops trusting the schedule.

**Change:** remember the last-done date on each routine itself, so no history limit matters.

---

### A13 Clear message on a slow connection · ★★★ · S · Claude

**Why:** with a weak signal, the app can stay on "Loading…" forever with no explanation.

**Change:** after about 10 seconds, show "Connection is slow; data will appear when the signal returns", and
keep a copy of the last data on the phone so the app opens instantly next time.

---

### A14 Put deploy settings in the code · ★★★ · S · Claude (+ You, once)

**Why:** some settings the app needs (database indexes, rules and hosting setup) exist only in the Firebase
console. If they're changed by accident or the project is moved, nobody knows how to restore them.

**Change (Claude):** add `firebase.json` and `firestore.indexes.json` to the code.
**You, once:** confirm where the app is hosted today (AI Studio, Firebase Hosting, or elsewhere), so the files
match.

---

### A15 Rain gauge + daily rain entry · ★★★ · M · Claude + Team habit

**Why:** the Guide's research says about 15 dry days trigger flowering roughly 50 days later, and 200 mm or more
of rain while fruit matures raises the risk of wet core. Without rain records the app can't warn about either.

**Buy:** a simple plastic rain gauge (inexpensive at agricultural shops). Put it in an open spot.
**Change (Claude):** a one-number "rain today (mm)" entry on the Dashboard, plus dry-spell and heavy-rain
alerts in the farm check.
**Routine (Team, 1 minute every morning):** read the gauge at 7:00, enter the number, empty the gauge.

---

### A16 Lab results page · ★★★ · M · Claude

**Why:** the Guide recommends a yearly leaf analysis and soil pH test and lists the ideal ranges. There's
nowhere to keep the results, so they can't be compared from year to year.

**Change:** a simple page to type in each lab report (block, date, pH, N, P, K, Ca, Mg, B). Each value is shown
green or amber against the Guide's ranges.

---

### A17 Error alerts · ★★ · S · Claude (+ You, sign-up) · skipped

> Skipped by decision.

**Why:** if something breaks (for example the database refuses a save), today only the browser console knows.

**Change:** connect a free error-reporting service, so errors arrive by email. You create the free account;
Claude adds the code.

---

### A18 Faster first load · ★ · S · Claude

**Why:** the app downloads about 550 kB of database code on first open. It's fine on Wi-Fi but slow on a weak
mobile signal.

**Change:** load the photo-storage part only on pages that show photos.

---

## What's already in good shape

- **Navigation:** pages have shareable links, Back works, and filters stay in the address bar.
- **Language:** Indonesian is the default and uses the same words as the WhatsApp reports.
- **Report deletion** removes the photos too and repairs the tree's status.
- **Tree edits** are saved together with their history record.
- **Variants** are validated, can be deleted safely, and trees are moved before a variety is removed.
- **The Guide's farm check** already flags many gaps automatically.

---

## Not included in this audit

- **Security rules and sign-in.** The database is currently open to anyone with the address; plan it next.
- **WhatsApp flows.** Field data collection by WhatsApp is to be evaluated later. A first draft from earlier is
  in [whatsapp-flows.md](./whatsapp-flows.md), for reference only.
