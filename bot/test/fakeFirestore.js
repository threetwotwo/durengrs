// test/fakeFirestore.js — a tiny in-memory stand-in for ./lib/firestore, so the tests never touch real data.
// Use: const fake = require('./fakeFirestore'); fake.install();  (before requiring anything from ../lib)
const path = require('path');

const TS = { _ts: true, toDate: () => new Date() };
const DELETE = { _delete: true };
const store = new Map(); // collection -> Map(id -> data)
let autoId = 0;

const col = (name) => (store.has(name) ? store.get(name) : store.set(name, new Map()).get(name));
const clone = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v && v._ts ? '__ts__' : v)), (k, v) => (v === '__ts__' ? TS : v));
const snap = (name, id) => {
  const data = col(name).get(id);
  return { exists: data !== undefined, id, data: () => (data === undefined ? undefined : clone(data)) };
};
// The real Firestore refuses undefined anywhere in a document ("Cannot use undefined as a Firestore value").
// lib/firestore.js turns that off as a safety net, but the tests keep it on so such a write shows up here.
const noUndefined = (v, path) => {
  if (v === undefined) throw new Error(`Cannot use "undefined" as a Firestore value (found in field ${path})`);
  if (v && typeof v === 'object' && !v._ts && !v._delete) for (const [k, x] of Object.entries(v)) noUndefined(x, `${path}.${k}`);
};
const apply = (name, id, d, merge) => {
  for (const [k, v] of Object.entries(d)) noUndefined(v, k);
  const prev = merge ? { ...(col(name).get(id) || {}) } : {};
  for (const [k, v] of Object.entries(d)) {
    if (v && v._delete) delete prev[k];
    else if (v && v._ts) prev[k] = TS;
    else prev[k] = v;
  }
  col(name).set(id, prev);
};
const ref = (name, id) => ({
  __col: name, __id: id, id,
  get: async () => snap(name, id),
  set: async (d) => apply(name, id, d, false),
  update: async (d) => {
    if (!col(name).has(id)) throw new Error(`No document to update: ${name}/${id}`);
    apply(name, id, d, true);
  },
});
const query = (name, filters = []) => ({
  where: (f, op, v) => {
    if (op !== '==') throw new Error('fake supports == only');
    return query(name, [...filters, [f, v]]);
  },
  select: () => query(name, filters),
  get: async () => {
    const docs = [...col(name).keys()].filter((id) => filters.every(([f, v]) => col(name).get(id)[f] === v)).map((id) => snap(name, id));
    return { docs, empty: !docs.length, forEach: (fn) => docs.forEach(fn) };
  },
});
const db = {
  collection: (name) => ({ ...query(name), doc: (id) => ref(name, id || `auto${++autoId}`) }),
  batch: () => {
    const ops = [];
    return {
      set: (r, d) => ops.push(() => apply(r.__col, r.__id, d, false)),
      update: (r, d) => ops.push(() => apply(r.__col, r.__id, d, true)),
      commit: async () => ops.forEach((f) => f()),
    };
  },
  runTransaction: async (fn) =>
    fn({
      get: async (r) => r.get(),
      set: (r, d) => apply(r.__col, r.__id, d, false),
      update: (r, d) => apply(r.__col, r.__id, d, true),
    }),
};
const admin = { firestore: { FieldValue: { serverTimestamp: () => TS, delete: () => DELETE } } };

module.exports = {
  db,
  store,
  reset: () => store.clear(),
  seed: (name, id, data) => col(name).set(id, data),
  get: (name, id) => col(name).get(id),
  all: (name) => [...col(name).entries()].map(([id, data]) => ({ id, ...data })),
  install() {
    const p = require.resolve(path.join(__dirname, '..', 'lib', 'firestore.js'));
    try { require.resolve('sharp'); } catch { // sharp is only needed for photos; tests do not upload any
      const sp = path.join(__dirname, 'sharp-stub.js'); require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: () => ({}) };
      const Module = require('module'); const orig = Module._resolveFilename;
      Module._resolveFilename = function (r, ...a) { return r === 'sharp' ? sp : orig.call(this, r, ...a); };
    }
    require.cache[p] = { id: p, filename: p, loaded: true, exports: { admin, db, getBucket: () => { throw new Error('no storage in tests'); } } };
  },
};
