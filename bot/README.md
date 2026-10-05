# WhatsApp bot (Laporan Kebun Cilowong)

The program behind the farm's WhatsApp number. It runs on Google Cloud Run and does two jobs:

- **Webhook** (`POST /webhook`): reads what a worker texts. A tree ID (e.g. `A1`) opens the tree Flow; `KEBUN`
  opens the farm Flow (rain and finished work).
- **Flow endpoint** (`POST /flow-endpoint`): answers each button in the Flows (encrypted per Meta's spec) and
  saves reports, flowering, counts, harvests, tree data, tasks and rain to Firestore.

Shared words and rules with the web app: see `docs/data-contract.md` and `src/shared/`.

**Never commit secrets here** (this repository is public): no `.env`, `env.yaml`, `.pem` private key or
service-account JSON. They stay in Cloud Run.

## Files

| File | Status |
|---|---|
| `index.js` | received |
| `lib/encryption.js`, `lib/trees.js`, `lib/flowScreens.js`, `lib/reports.js` | received |
| `lib/firestore.js`, `lib/rules.js`, `lib/cropData.js`, `lib/media.js` | **missing** |
| `package.json` | **missing** |
| `flows/flow.json` (Flow "Laporan Pohon") | **missing** |
| `flows/flow-farm.json` (Flow "Catatan Kebun") | received |
