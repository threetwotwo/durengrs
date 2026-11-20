// scripts/access.js — the webapp's sign-in (src/lib/auth.ts). Never prints an email (the repository is public).
//   node scripts/access.js check         is Google sign-in on; how many accounts have signed in; users by role
//   node scripts/access.js first-admin   makes the one account that has signed in an admin, when there is no admin
//                                        yet and exactly one account has signed in (the owner, right after launch);
//                                        waits up to 50 minutes for that first sign-in
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
for (const line of fs.readFileSync(path.join(root, 'env.yaml'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+):\s*(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = path.join(root, 'service-account.json');
const { db } = require('../lib/firestore');
const admin = require('firebase-admin');

async function googleProvider() {
  const token = (await admin.app().options.credential.getAccessToken()).access_token;
  const r = await fetch('https://identitytoolkit.googleapis.com/admin/v2/projects/duren-db/defaultSupportedIdpConfigs/google.com', { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return 'not set up';
  if (!r.ok) return `unknown (${r.status})`;
  return (await r.json()).enabled ? 'on' : 'off';
}

async function main() {
  const action = process.argv[2] || 'check';
  const [users, list] = await Promise.all([db.collection('users').get(), admin.auth().listUsers(100)]);
  const roles = {};
  for (const d of users.docs) roles[d.data().role || '(none)'] = (roles[d.data().role || '(none)'] || 0) + 1;
  console.log(`Google sign-in: ${await googleProvider().catch((e) => `unknown (${e.message})`)}`);
  console.log(`Accounts signed in: ${list.users.length}; access records by role: ${JSON.stringify(roles)}`);
  if (action !== 'first-admin') return;
  const until = Date.now() + 50 * 60 * 1000;
  for (;;) {
    const [us, l] = await Promise.all([db.collection('users').where('role', '==', 'admin').limit(1).get(), admin.auth().listUsers(100)]);
    if (!us.empty) return console.log('There is an admin: nothing changed. Add people on the webapp (More > Access).');
    if (l.users.length > 1) return console.log(`Not changed: ${l.users.length} accounts have signed in, expected exactly 1. Add the admin by hand.`);
    const u = l.users[0];
    if (u && u.email && u.emailVerified) {
      await db.collection('users').doc(u.email.toLowerCase()).set({ role: 'admin', name: u.displayName || '', addedAt: new Date().toISOString(), addedBy: 'first-admin' });
      return console.log(`Made the only signed-in account (signed in ${u.metadata.creationTime}) an admin.`);
    }
    if (Date.now() > until) return console.log('Nobody signed in within 50 minutes: nothing changed. Run again after signing in.');
    await new Promise((r) => setTimeout(r, 15000));
  }
}
main().then(() => process.exit(0), (e) => (console.error(e.message), process.exit(1)));
