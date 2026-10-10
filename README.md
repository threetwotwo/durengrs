# Cilowong Durian Farm Management

The web app for the Cilowong durian farm (React 19, TypeScript, Tailwind CSS, Firestore), and the WhatsApp bot in
[`bot/`](bot/README.md) that workers report through. Both read and write one Firestore database; the shared words and
codes are in [`src/shared/`](src/shared/index.ts) and every field is described in
[`docs/data-contract.md`](docs/data-contract.md).

## How it works

A worker sends a tree ID ("A1") on WhatsApp, adds photos and a few words, and Gemini reads the report: the stage, any
problem (the specific pest or disease), work done (a spray, a fertiliser, a harvest) and progress on the tree's known
problems. The bot saves what needs no person, files each problem into a **case** that is followed until it is solved,
and replies to the worker (asking for a better photo when needed).

## Pages

- **Today**: what needs you (reports to check, problems getting worse or due for a photo check, trees to pick or
  count, overdue routines), the farm's open problems, the latest reports and each block's season.
- **Trees**: every tree in one sheet (type into cells like a spreadsheet; every change is logged), with quick views for
  trees with a problem, due for a check, not reported in 7 days, or archived. Each tree has its own page: problems,
  report history, crop, flowering, treatments and details.
- **Reports**: To check (confirm or correct what was read), Problems (every case from first sighting to solved), All
  records, and Workers (who reports, which blocks are missed).
- **Harvest**, **Schedule** (routines and season work), **Varieties**, **Workers** and the **Guide** (sourced best
  practice applied to the farm's own data).

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
