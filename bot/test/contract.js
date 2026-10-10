// test/contract.js — checks that what the endpoint answers fits the Flow JSON it is answering for:
// the screen exists, every data field the screen declares is present with the right type, and the move
// from one screen to the next is allowed by routing_model. Used by screens.test.js on every scenario.
const assert = require('node:assert/strict');
// Keyed by the token kind (lib/flowScreens.js parseFlowToken).
const flows = { report: require('../flows/flow.json'), farm: require('../flows/flow-farm.json') };

const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

function check(kind, from, res) {
  const flow = flows[kind];
  const target = flow.screens.find((s) => s.id === res.screen);
  assert.ok(target, `${kind}: response screen "${res.screen}" is not in the Flow`);
  if (from && from !== res.screen) {
    assert.ok((flow.routing_model[from] || []).includes(res.screen), `${kind}: ${from} -> ${res.screen} is not in routing_model`);
  }
  for (const [key, spec] of Object.entries(target.data || {})) {
    assert.ok(key in (res.data || {}), `${kind}: ${res.screen} is missing data.${key}`);
    const want = spec.type === 'object' ? 'object' : spec.type;
    assert.equal(typeOf(res.data[key]), want, `${kind}: ${res.screen} data.${key} should be ${want}, is ${typeOf(res.data[key])}`);
    if (spec.type === 'string') assert.ok(res.data[key] !== undefined && res.data[key] !== null, `${res.screen}.${key} is empty`);
    if (spec.type === 'object') for (const p of Object.keys(spec.properties || {})) assert.ok(p in res.data[key], `${res.screen}.${key}.${p} missing`);
  }
  // visible text that comes from data must not be empty (WhatsApp rejects an empty TextBody)
  const walk = (n, fn) => (Array.isArray(n) ? n.forEach((x) => walk(x, fn)) : n && typeof n === 'object' && (fn(n), Object.values(n).forEach((v) => walk(v, fn))));
  walk(target.layout, (n) => {
    if (['TextHeading', 'TextBody', 'TextCaption', 'TextSubheading'].includes(n.type)) {
      const m = /^\$\{data\.([a-z_]+)\}$/.exec(n.text || '');
      if (m) assert.ok(String(res.data[m[1]] ?? '').trim() !== '', `${res.screen}: text data.${m[1]} is empty`);
    }
    // choices shown from data: titles within 30 characters, descriptions within 300
    for (const key of ['data-source']) {
      const m = typeof n[key] === 'string' && /^\$\{data\.([a-z_]+)\}$/.exec(n[key]);
      if (m) for (const o of res.data[m[1]]) {
        assert.ok(o.id && o.title && o.title.length <= 30, `${res.screen}: option title "${o.title}" too long`);
        assert.ok(!o.description || o.description.length <= 300, `${res.screen}: option description too long`);
      }
    }
  });
  return res;
}

module.exports = { check };
