// lib/media.js — decrypts photos uploaded through a Flow PhotoPicker.
//
// WhatsApp doesn't send the image itself to your endpoint. It sends a CDN
// link plus the keys needed to decrypt it:
//   { file_name, mime_type, cdn_url, encryption_metadata: {
//       encryption_key, hmac_key, iv, plaintext_hash, encrypted_hash } }
//
// The downloaded file is: AES-256-CBC ciphertext + 10-byte truncated HMAC tag.
const crypto = require('crypto');

const ALLOWED_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function matchesHash(buffer, expected) {
  const digest = crypto.createHash('sha256').update(buffer).digest();
  return expected === digest.toString('base64') || expected === digest.toString('hex');
}

async function decryptFlowMedia(item) {
  const meta = item?.encryption_metadata;
  if (!item?.cdn_url || !meta) {
    throw new Error('Photo is missing cdn_url or encryption_metadata');
  }
  if (!item.cdn_url.startsWith('https://')) {
    throw new Error('Photo cdn_url is not https');
  }

  const res = await fetch(item.cdn_url);
  if (!res.ok) throw new Error(`Photo download failed: HTTP ${res.status}`);
  const encrypted = Buffer.from(await res.arrayBuffer());

  if (encrypted.length > MAX_PHOTO_BYTES) throw new Error('Photo is too large');
  if (!matchesHash(encrypted, meta.encrypted_hash)) throw new Error('Encrypted photo hash mismatch');

  const ciphertext = encrypted.subarray(0, -10);
  const tag = encrypted.subarray(-10);
  const iv = Buffer.from(meta.iv, 'base64');

  const expectedTag = crypto
    .createHmac('sha256', Buffer.from(meta.hmac_key, 'base64'))
    .update(iv)
    .update(ciphertext)
    .digest()
    .subarray(0, 10);
  if (!crypto.timingSafeEqual(tag, expectedTag)) throw new Error('Photo HMAC check failed');

  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(meta.encryption_key, 'base64'), iv);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  if (!matchesHash(plain, meta.plaintext_hash)) throw new Error('Decrypted photo hash mismatch');
  return plain;
}

module.exports = { decryptFlowMedia, ALLOWED_TYPES, MAX_PHOTO_BYTES };
