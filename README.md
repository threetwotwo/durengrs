# Cilowong Durian Farm Management

A complete Durian Farm Monitoring & Inventory Management Web Application built with React 19, TypeScript, Tailwind CSS, and Google Cloud Firestore.

## Features
- **Tree Inventory Management**: Real-time tracking of trees, block locations, variants, trunk girth, canopy spread, cluster counts, fruit estimates, dates planted, suppliers, and notes.
- **Variant Catalog**: Complete database of durian varieties (e.g. Musang King, Bawor, Super Tembaga, etc.) with botanical and harvest profiles.
- **Field Inspection Reports**: Photographic reports, health condition tracking (Healthy, Minor, Emergency), and timeline audits.
- **Analytics & Dashboard**: Yield estimations, condition distribution charts, block-by-block breakdowns, and urgent attention feeds.
- **Data Export**: Full CSV export of tree inventory and report data.
- **Research Guide**: Sourced best practices (climate, flowering, pollination, thinning, water, nutrition, pruning, Phytophthora, pests, harvest) applied to live farm data: each block's stage in its fruiting cycle with what to do now, a farm check that finds gaps in records and routines, and per-topic farm notes.

## Getting Started

### Prerequisites
- Node.js 18+ or 20+
- npm or bun

### Installation
```bash
git clone https://github.com/threetwotwo/durengrs.git
cd durengrs
bun install   # or: npm install
```

### Running Locally
Start the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

### Building for Production
```bash
npm run build
npm run preview
```
