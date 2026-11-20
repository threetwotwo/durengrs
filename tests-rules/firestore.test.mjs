// The webapp's access rules (firestore.rules) on the Firestore emulator: admins everything, the shop team only
// what the QC page needs, anyone else nothing. Run by deploy-web.yml before deploying; a failure stops the deploy.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
const env = await initializeTestEnvironment({ projectId: 'duren-db', firestore: { rules: fs.readFileSync('../firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 } });
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users/boss@x.com'), { role: 'admin' });
  await setDoc(doc(db, 'users/shop@x.com'), { role: 'shop' });
  await setDoc(doc(db, 'trees/A1'), { variant: 'MK' });
  await setDoc(doc(db, 'reports/r1'), { treeId: 'A1' });
  await setDoc(doc(db, 'harvests/h1'), { treeId: 'A1' });
  await setDoc(doc(db, 'treeGrades/h1-0'), { treeId: 'A1', qc: {} });
});
const as = (email, verified = true) => env.authenticatedContext(email || 'anon', email ? { email, email_verified: verified } : {}).firestore();
const boss = as('Boss@x.com'), shop = as('shop@x.com'), stranger = as('who@x.com'), unverified = as('shop@x.com', false), anon = env.unauthenticatedContext().firestore();
const grade = { treeId: 'A1', date: '2026-11-20', qc: { manis: 4 }, by: 'Rina', from: 'toko', at: 'x', updatedAt: new Date() };
const checks = [
  ['admin reads reports', assertSucceeds(getDoc(doc(boss, 'reports/r1')))],
  ['admin writes trees', assertSucceeds(setDoc(doc(boss, 'trees/A2'), { variant: 'BW' }))],
  ['admin adds a user', assertSucceeds(setDoc(doc(boss, 'users/new@x.com'), { role: 'shop' }))],
  ['shop reads trees', assertSucceeds(getDocs(collection(shop, 'trees')))],
  ['shop reads harvests', assertSucceeds(getDoc(doc(shop, 'harvests/h1')))],
  ['shop writes a grading', assertSucceeds(setDoc(doc(shop, 'treeGrades/h1-0'), grade))],
  ['shop reads own access', assertSucceeds(getDoc(doc(shop, 'users/shop@x.com')))],
  ['shop: no reports', assertFails(getDoc(doc(shop, 'reports/r1')))],
  ['shop: no tree writes', assertFails(setDoc(doc(shop, 'trees/A1'), { variant: 'X' }))],
  ['shop: no deleting gradings', assertFails(deleteDoc(doc(shop, 'treeGrades/h1-0')))],
  ['shop: no extra fields', assertFails(setDoc(doc(shop, 'treeGrades/h1-0'), { ...grade, role: 'admin' }))],
  ['shop: cannot make self admin', assertFails(setDoc(doc(shop, 'users/shop@x.com'), { role: 'admin' }))],
  ['shop: no listing users', assertFails(getDocs(collection(shop, 'users')))],
  ['stranger: nothing', assertFails(getDoc(doc(stranger, 'trees/A1')))],
  ['stranger: cannot add self', assertFails(setDoc(doc(stranger, 'users/who@x.com'), { role: 'admin' }))],
  ['unverified email: nothing', assertFails(getDoc(doc(unverified, 'trees/A1')))],
  ['signed out: nothing', assertFails(getDoc(doc(anon, 'trees/A1')))],
];
let bad = 0;
for (const [name, p] of checks) {
  try { await p; console.log('ok  ', name); } catch (e) { bad++; console.log('FAIL', name, e.message.slice(0, 120)); }
}
await env.cleanup();
console.log(bad ? `${bad} failed` : 'all passed');
process.exit(bad ? 1 : 0);
