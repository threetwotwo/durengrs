// One-off: gives photos of EXISTING reports the small `thumb` (320px) and `medium` (900px) copies,
// and sets a long browser cache time on every photo file. Safe to run again: it only fills what is missing.
// Run once from the project folder (needs the same credentials/env as the bot):
//   node scripts/backfill-photos.js
require('dotenv').config();
const crypto = require('crypto');
const sharp = require('sharp');
const { db, getBucket } = require('../lib/firestore');

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

async function saveVariant(bucket, buf, path) {
  const token = crypto.randomUUID();
  await bucket.file(path).save(buf, {
    resumable: false,
    metadata: { contentType: 'image/jpeg', cacheControl: CACHE_CONTROL, metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

(async () => {
  const bucket = getBucket();
  const snap = await db.collection('reports').get();
  let reportsDone = 0;
  let photosDone = 0;
  for (const doc of snap.docs) {
    const { photos, treeId } = doc.data();
    if (!Array.isArray(photos) || !photos.length) continue;
    let changed = false;
    const updated = [];
    for (const [i, p] of photos.entries()) {
      if (!p || !p.path) { updated.push(p); continue; }
      const next = { ...p };
      try {
        const file = bucket.file(p.path);
        // long cache on the original (cheap metadata call, no download)
        await file.setMetadata({ cacheControl: CACHE_CONTROL });
        if (!p.thumb || !p.medium) {
          const [buf] = await file.download();
          if (!p.thumb) {
            const t = await sharp(buf).rotate().resize({ width: 320, height: 320, fit: 'cover' }).jpeg({ quality: 70, mozjpeg: true }).toBuffer();
            next.thumb = await saveVariant(bucket, t, `report-photos/${treeId}/thumbs/${doc.id}-${i + 1}.jpg`);
          }
          if (!p.medium) {
            const m = await sharp(buf).rotate().resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
            next.medium = await saveVariant(bucket, m, `report-photos/${treeId}/medium/${doc.id}-${i + 1}.jpg`);
          }
          changed = true;
          photosDone++;
        }
      } catch (e) {
        console.error(doc.id, i, e.message);
      }
      updated.push(next);
    }
    if (changed) {
      await doc.ref.update({ photos: updated });
      reportsDone++;
      console.log('updated:', doc.id);
    }
  }
  console.log(`Done. ${photosDone} photos in ${reportsDone} reports updated.`);
})();
