// lib/rain.js — daily rainfall without anyone writing it down: the farm's daily rain (mm) from Open-Meteo (free, no
// key; model estimates from weather stations, radar and satellites, not a rain gauge), filed as `weather/{date}`
// with source 'open-meteo'. A rain day a person recorded (WhatsApp or the web app) is never replaced.
// Runs by itself at most every few hours, after the bot has answered a WhatsApp message, and on
// GET /rain-sync?token=<VERIFY_TOKEN> (index.js). Env: FARM_LAT, FARM_LON (the farm's coordinates; without them
// nothing is fetched).
const { admin, db } = require('./firestore');
const R = require('./rules');

const now = () => admin.firestore.FieldValue.serverTimestamp();
const EVERY_MS = 6 * 60 * 60 * 1000;
/** Days read back: a first run fills the last three months (the API's limit), later runs the last two weeks. */
const FIRST_DAYS = 92;
const LATER_DAYS = 14;

const ms = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return typeof ts.toDate === 'function' ? ts.toDate().getTime() : 0;
};

function farmPlace() {
  const lat = Number(process.env.FARM_LAT);
  const lon = Number(process.env.FARM_LON);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon) ? { lat, lon } : null;
}

/** Open-Meteo's daily rain for the farm: [{ date, mm }] for the days before today (today is not over yet). */
async function fetchRain({ lat, lon }, days, timeoutMs = 10000) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=precipitation_sum&timezone=Asia%2FJakarta&past_days=${days}&forecast_days=1`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const dates = body?.daily?.time || [];
    const mm = body?.daily?.precipitation_sum || [];
    const today = R.todayStr();
    return dates
      .map((date, i) => ({ date, mm: mm[i] }))
      .filter((d) => typeof d.date === 'string' && d.date < today && typeof d.mm === 'number' && Number.isFinite(d.mm) && d.mm >= 0);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Files the farm's recent daily rain. `force` runs even when it ran a moment ago. Never throws.
 * Returns { ok, skipped?, written?, kept?, error? } (kept = days a person had recorded, left as they were).
 */
async function syncRain({ force = false } = {}) {
  const place = farmPlace();
  if (!place) return { ok: false, error: 'FARM_LAT and FARM_LON are not set on the service' };
  try {
    const metaRef = db.collection('farmMeta').doc('rainSync');
    const meta = await metaRef.get();
    const last = meta.exists ? ms(meta.data().at) : 0;
    if (!force && last && Date.now() - last < EVERY_MS) return { ok: true, skipped: true };
    await metaRef.set({ at: now() }, { merge: true }); // claim the run first: two messages at once fetch once

    const days = await fetchRain(place, last ? LATER_DAYS : FIRST_DAYS);
    const snaps = await Promise.all(days.map((d) => db.collection('weather').doc(d.date).get()));
    const batch = db.batch();
    let written = 0;
    let kept = 0;
    days.forEach((d, i) => {
      const prev = snaps[i].exists ? snaps[i].data() : null;
      if (prev && prev.source !== 'open-meteo') return void kept++; // a person's record wins
      const rainMm = Math.round(d.mm * 10) / 10;
      if (prev && prev.rainMm === rainMm) return;
      batch.set(db.collection('weather').doc(d.date), { date: d.date, rainMm, source: 'open-meteo', updatedAt: now() });
      written++;
    });
    if (written) await batch.commit();
    await metaRef.set({ at: now(), lastDays: days.length, written }, { merge: true });
    return { ok: true, written, kept, days: days.length };
  } catch (err) {
    console.error('Rain sync failed:', err);
    return { ok: false, error: String(err.message || err).slice(0, 300) };
  }
}

module.exports = { syncRain, fetchRain };
