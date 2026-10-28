# Cilowong Durian Farm Management

The web app for the Cilowong durian farm (React 19, TypeScript, Tailwind CSS, Firestore), and the WhatsApp bot in
[`bot/`](bot/README.md) that workers report through. Both read and write one Firestore database; the shared words and
codes are in [`src/shared/`](src/shared/index.ts) and every field is described in
[`docs/data-contract.md`](docs/data-contract.md).

## How it works

A worker sends a tree ID ("A1") on WhatsApp, adds photos and a few words, and Gemini reads the report: the stage, any
problem (the specific pest or disease), work done (a spray, a fertiliser, a harvest) and progress on the tree's known
problems. Every report is taken as read: the tree's stage and health follow its latest report, the bot files what
needs no person (a harvest, a count, a flowering date), follows each problem as a **case** until it is solved, and
replies to the worker (asking for a better photo when needed). The owner can change what was read from any report.

## Pages

Every page is in the navigation bar:

- **Today**: what needs you (problems getting worse or due for a photo check, trees to pick, overdue routines, trees
  nobody reported on this week), the open problems, each block's season, and the latest reports.
- **Trees**: every tree in one sheet (type into cells like a spreadsheet; every change is logged), with quick views
  and filters (block, variety, stage, condition); sort by any column.
  Each tree has its own page: its history as one line (reports with their photos, counts, harvests, flowerings),
  its problems, crop and details; type another tree ID to jump there.
  **Count** (Trees › Count, or Harvest › Count again) is the Trees sheet with one new green column for the day:
  type each tree's fruit (or flower clusters) and press Enter to go down, like a new column in Google Sheets. The last
  counting rounds are the dated columns beside it, the tree's open problems on the right, totals at the bottom. One
  number per tree; a photo can go with it. A column copied from Google Sheets can be pasted in. The earlier dated
  columns can be corrected in place. Filter by block or variety, sort by tree ID or variety. A day's counts show
  in Reports as one card.
- **Reports**: every record from the field as photo-first cards, newest first, a page at a time.
- **Problems**: every problem from first sighting to solved; each has its own page with its photo history.
- **Harvest**: picked this season, still on the trees, ready to pick, each block's harvest window, and the harvest
  records (from WhatsApp, or added by hand). **Fruits** (Harvest › All fruits, `#/harvest/fruits`): every fruit from
  Laporan PANEN, one row each with its code, filtered by variety or block, sorted by any column, the varieties side by
  side; each fruit has its own page (`#/harvest/fruits/A3-20261021-01`) where its weight and scores can be corrected.
- **Schedule** (routines and season work), **Varieties**, **Workers** and the **Guide** (sourced best practice applied
  to the farm's own data, when it is switched on).

## Deploying (automatic)

Every push to `main` deploys what it changed, so a change made from a phone goes live by itself:

- `bot/` → the WhatsApp bot on Cloud Run (`.github/workflows/deploy-bot.yml`: tests, then `gcloud run deploy`).
- the webapp, `firestore.rules`, `storage.rules` → Firebase Hosting, **https://duren-db.web.app**
  (`.github/workflows/deploy-web.yml`: tests, type check, build, then `firebase deploy`).

Either can also be run by hand: GitHub › Actions › the workflow › Run workflow. A failed test stops the deploy.
The secrets (deploy key, the bot's env.yaml, service-account.json, private_key.pem) are encrypted GitHub secrets, set
once by `bot/scripts/setup-github-deploy.sh` (run on a computer, inside the bot folder that has those files). To change
one later (a new WhatsApp token), edit it in GitHub › Settings › Secrets and variables › Actions, or run the script again.

## Getting started

Node.js 20+.

```bash
git clone https://github.com/threetwotwo/durengrs.git
cd durengrs
npm install
npm run dev        # http://localhost:3000
npm test           # rules and shared vocabulary
npm run build      # production build
```

After changing `src/shared/`, run `npm run build:bot-shared` so the bot reads words the same way.

Firestore and Cloud Storage rules are `firestore.rules` and `storage.rules` (publish them in the Firebase console, or
`firebase deploy --only firestore:rules,storage`). Photos taken on the Count page need the `count-photos/` rule.
