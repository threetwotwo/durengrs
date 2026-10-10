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
- **Trees**: every tree in one sheet (type into cells like a spreadsheet; every change is logged), with quick views.
  Each tree has its own page: its history as one line (reports with their photos, counts, harvests, flowerings),
  its problems, crop and details; type another tree ID to jump there.
- **Reports**: every record from the field as photo-first cards, newest first, a page at a time.
- **Problems**: every problem from first sighting to solved; each has its own page with its photo history.
- **Harvest**: picked this season, still on the trees, ready to pick, each block's harvest window, and the harvest
  records (from WhatsApp, or added by hand).
- **Schedule** (routines and season work), **Varieties**, **Workers** and the **Guide** (sourced best practice applied
  to the farm's own data, when it is switched on).

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
