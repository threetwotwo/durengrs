// seed-variants.js — run: node seed-variants.js
// Safe to re-run any time you want to add a new variety — doc ID is the
// type code itself, and writes use merge:true, so nothing gets duplicated.
require('dotenv').config();
const { admin, db } = require('./lib/firestore');

// type = the short code used inside Tree IDs (e.g. "A1 MK" -> type "MK").
const VARIANTS = [
  { type: 'MK', description: 'Musang King' },
  { type: 'ST', description: 'Super Tembaga' },
  { type: 'ST_LOKAL', description: 'Super Tembaga Lokal' },
  { type: 'OC', description: 'Ochee' },
  { type: 'MTG', description: 'Montong' },
  { type: 'MTH', description: 'Matahari' },
  { type: 'BW', description: 'Bawor' },
  { type: 'NLG', description: 'Namlung' },
  { type: 'LAY', description: 'Lay' },
  { type: 'PLG', description: 'Pelangi' },
  { type: 'PTK', description: 'Petruk' },
  { type: 'MM', description: 'Masmuar' },
  { type: 'KJ', description: 'Kanjau' },
  { type: 'UM', description: 'Udang Merah' },
  { type: 'SB', description: 'Sirombut' },
  { type: 'SD24', description: 'Sultan D24' },
];

async function seed() {
  const batch = db.batch();
  for (const variant of VARIANTS) {
    const ref = db.collection('variants').doc(variant.type);
    batch.set(
      ref,
      {
        type: variant.type,
        description: variant.description,
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  await batch.commit();
  console.log(`Seeded ${VARIANTS.length} variants.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
