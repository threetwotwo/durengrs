/**
 * How every photo is stored, the same for the WhatsApp bot (sharp, bot/lib/reports.js) and the web app (canvas,
 * src/lib/photoUpload.ts): the photo at most 1600px on its long side, a 900px copy for pages, and a 320px square
 * thumbnail, all JPEG, with the orientation the camera recorded applied. Files never change after upload.
 */
export const PHOTO_SIZES = {
  full: { max: 1600, quality: 75 },
  medium: { max: 900, quality: 72 },
  thumb: { square: 320, quality: 70 },
} as const;

export const PHOTO_CACHE_CONTROL = 'public, max-age=31536000, immutable';
