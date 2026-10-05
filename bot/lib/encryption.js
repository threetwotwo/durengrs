// lib/encryption.js — implements WhatsApp's Flow endpoint encryption contract.
// Every data_exchange/INIT/BACK/ping request to your Flow endpoint is
// encrypted this way; see Meta's "Implementing your Flow endpoint" docs.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIVATE_KEY = fs.readFileSync(path.resolve(process.env.FLOW_PRIVATE_KEY_FILE), 'utf8');

function decryptRequest(body) {
  const aesKey = crypto.privateDecrypt(
    { key: PRIVATE_KEY, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(body.encrypted_aes_key, 'base64')
  );

  const iv = Buffer.from(body.initial_vector, 'base64');
  const flowData = Buffer.from(body.encrypted_flow_data, 'base64');
  const tag = flowData.subarray(flowData.length - 16);
  const ciphertext = flowData.subarray(0, flowData.length - 16);

  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return { payload: JSON.parse(plain.toString('utf8')), aesKey, iv };
}

function encryptResponse(responseObj, aesKey, iv) {
  // Response is encrypted with the same AES key but a flipped IV.
  const flippedIv = Buffer.from(Uint8Array.from(iv, (b) => b ^ 0xff));
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(JSON.stringify(responseObj), 'utf8'), cipher.final()]);
  return Buffer.concat([enc, cipher.getAuthTag()]).toString('base64');
}

module.exports = { decryptRequest, encryptResponse };
