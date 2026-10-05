// lib/firestore.js — Firestore + Cloud Storage connection.
const admin = require('firebase-admin');
const path = require('path');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE)),
    storageBucket: process.env.STORAGE_BUCKET,
  });
}

const db = admin.firestore();
// A field left undefined is skipped instead of failing the whole write (a worker's report must never be lost over it).
db.settings({ ignoreUndefinedProperties: true });

// Only needed when photos are uploaded, so the seed scripts still run
// without STORAGE_BUCKET set.
const getBucket = () => admin.storage().bucket();

module.exports = { admin, db, getBucket };
