// lib/reports.js — saves worker reports: photos to Cloud Storage, the report
// to `reports`, and any condition change onto the tree, all consistently.
const crypto = require('crypto');
const sharp = require('sharp');
const { admin, db, getBucket } = require('./firestore');
const { decryptFlowMedia, ALLOWED_TYPES } = require('./media');

const { CONDITIONS, CONDITION_LABELS } = require('./rules');
const MAX_PHOTOS = 3;

// One flow session = one report. Deriving the document ID from the flow token
// means a retried submission overwrites instead of creating a duplicate.
function reportIdFromToken(flowToken) {
  return crypto.createHash('sha1').update(String(flowToken)).digest('hex').slice(0, 20);
}

// Stored copy: max 1600px on the long side, JPEG q75 — typically 150–350 KB
// instead of several MB, and still sharp enough to read leaf damage.
async function compressPhoto(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();
}

// Small copy for lists in the webapp: 320px, ~10–20 KB.
async function makeThumb(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 320, height: 320, fit: 'cover' })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();
}

// Mid-size copy for the album in the webapp: 900px, ~50–90 KB. The 1600px original is only
// loaded when someone opens a photo full screen.
async function makeMedium(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}

// Files never change after upload (new report = new file name), so browsers may cache them for a year.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

function downloadUrl(bucket, filePath, token) {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(filePath)}?alt=media&token=${token}`
  );
}

// One image holding all of a report's photos, so WhatsApp can show them as a
// single message. Built the first time it's needed, then cached on the report.
async function getCollageUrl(reportId, report) {
  const photos = (report?.photos || []).slice(0, MAX_PHOTOS);
  if (photos.length === 0) return null;
  if (photos.length === 1) return photos[0].url;
  if (report.collageUrl) return report.collageUrl;

  const bucket = getBucket();
  const buffers = await Promise.all(photos.map((p) => bucket.file(p.path).download().then(([b]) => b)));

  // 2 photos: side by side. 3 photos: one large on the left, two stacked on the right.
  const cell = (buf, width, height) =>
    sharp(buf).rotate().resize({ width, height, fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
  const W = 1600;
  const H = 1200;
  let layers;
  if (buffers.length === 2) {
    const [l, r] = await Promise.all(buffers.map((b) => cell(b, W / 2 - 4, H)));
    layers = [
      { input: l, left: 0, top: 0 },
      { input: r, left: W / 2 + 4, top: 0 },
    ];
  } else {
    const [big, s1, s2] = await Promise.all([
      cell(buffers[0], 1000, H),
      cell(buffers[1], W - 1008, H / 2 - 4),
      cell(buffers[2], W - 1008, H / 2 - 4),
    ]);
    layers = [
      { input: big, left: 0, top: 0 },
      { input: s1, left: 1008, top: 0 },
      { input: s2, left: 1008, top: H / 2 + 4 },
    ];
  }
  const collage = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite(layers)
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();

  const filePath = `report-photos/${report.treeId}/${reportId}-collage.jpg`;
  const token = crypto.randomUUID();
  await bucket.file(filePath).save(collage, {
    resumable: false,
    metadata: { contentType: 'image/jpeg', cacheControl: CACHE_CONTROL, metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url =
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(filePath)}?alt=media&token=${token}`;
  await db.collection('reports').doc(reportId).update({ collageUrl: url });
  return url;
}

async function uploadPhoto(item, treeId, reportId, index) {
  const mimeType = item.mime_type || 'image/jpeg';
  if (!ALLOWED_TYPES[mimeType]) throw new Error(`Unsupported photo type: ${mimeType}`);

  const original = await decryptFlowMedia(item);

  // Compress; if that ever fails, keep the original rather than lose the photo.
  let buffer = original;
  let storedType = mimeType;
  try {
    buffer = await compressPhoto(original);
    storedType = 'image/jpeg';
  } catch (err) {
    console.error('Compression failed, storing original:', err.message);
  }
  const ext = ALLOWED_TYPES[storedType];

  const bucket = getBucket();
  const filePath = `report-photos/${treeId}/${reportId}-${index + 1}.${ext}`;
  const downloadToken = crypto.randomUUID();

  await bucket.file(filePath).save(buffer, {
    resumable: false,
    metadata: {
      contentType: storedType,
      cacheControl: CACHE_CONTROL,
      // Same mechanism Firebase uses for getDownloadURL(): a permanent,
      // unguessable link that works regardless of bucket ACL settings.
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });

  // Thumbnail is best-effort: if it fails the webapp falls back to the full photo.
  let thumb;
  try {
    const thumbBuffer = await makeThumb(buffer);
    const thumbPath = `report-photos/${treeId}/thumbs/${reportId}-${index + 1}.jpg`;
    const thumbToken = crypto.randomUUID();
    await bucket.file(thumbPath).save(thumbBuffer, {
      resumable: false,
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: CACHE_CONTROL,
        metadata: { firebaseStorageDownloadTokens: thumbToken },
      },
    });
    thumb = downloadUrl(bucket, thumbPath, thumbToken);
  } catch (err) {
    console.error('Thumbnail failed:', err.message);
  }

  // Medium copy: also best-effort.
  let medium;
  try {
    const mediumBuffer = await makeMedium(buffer);
    const mediumPath = `report-photos/${treeId}/medium/${reportId}-${index + 1}.jpg`;
    const mediumToken = crypto.randomUUID();
    await bucket.file(mediumPath).save(mediumBuffer, {
      resumable: false,
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: CACHE_CONTROL,
        metadata: { firebaseStorageDownloadTokens: mediumToken },
      },
    });
    medium = downloadUrl(bucket, mediumPath, mediumToken);
  } catch (err) {
    console.error('Medium copy failed:', err.message);
  }

  return {
    path: filePath,
    mimeType: storedType,
    size: buffer.length,
    url: downloadUrl(bucket, filePath, downloadToken),
    ...(thumb ? { thumb } : {}),
    ...(medium ? { medium } : {}),
  };
}

// Never throws: returns what saved and how many didn't, so a bad photo
// doesn't lose the worker's written report.
async function processPhotos(items, treeId, reportId) {
  const attempted = items.slice(0, MAX_PHOTOS);
  const results = await Promise.allSettled(
    attempted.map((item, i) => uploadPhoto(item, treeId, reportId, i))
  );

  const saved = [];
  let failed = items.length - attempted.length;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      saved.push(result.value);
    } else {
      failed++;
      console.error('Photo not saved:', result.reason?.message);
    }
  }
  return { saved, failed };
}

// `condition`: the worker's choice (older Flow) or 'emergency' when the words read as urgent (triage), else none.
// `triage`: what the system read from the words (lib/shared.js); a suggestion until someone checks it in the webapp.
async function createReport({ reportId, treeId, workerPhone, condition, conditionSource, description, photos, triage }) {
  const treeRef = db.collection('trees').doc(treeId);
  const reportRef = db.collection('reports').doc(reportId);
  const now = admin.firestore.FieldValue.serverTimestamp();

  return db.runTransaction(async (tx) => {
    // All reads first, then writes.
    const [treeSnap, existingReport] = await Promise.all([tx.get(treeRef), tx.get(reportRef)]);

    if (existingReport.exists) return { duplicate: true };
    if (!treeSnap.exists) throw new Error(`Tree ${treeId} not found`);

    const tree = treeSnap.data();
    const before = tree.condition ?? null;
    const changed = CONDITIONS.includes(condition) && condition !== before;
    const after = changed ? condition : before;

    tx.set(reportRef, {
      treeId,
      block: tree.block ?? null,
      workerPhone: workerPhone || null,
      description: description || null,
      photos,
      conditionBefore: before,
      conditionAfter: after,
      conditionChanged: changed,
      ...(changed && conditionSource ? { conditionSource } : {}),
      ...(triage ? { triage } : {}),
      createdAt: now,
    });

    const treeUpdate = { lastReportId: reportId, lastReportAt: now, dateUpdated: now };
    if (changed) {
      treeUpdate.condition = condition;
      // The old note described the old condition, so it's replaced by this
      // report's description rather than left behind to mislead.
      treeUpdate.conditionNotes = description || null;
      treeUpdate.conditionUpdatedAt = now;
    }
    tx.update(treeRef, treeUpdate);

    return { duplicate: false, changed, before, after, photoCount: photos.length };
  });
}

module.exports = { getCollageUrl, reportIdFromToken, processPhotos, createReport, CONDITION_LABELS };
