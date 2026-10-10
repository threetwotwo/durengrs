// Structural checks on flow.json (tree report) and flow-farm.json (Meta's own validator runs when you paste them into
// the Flow builder).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const FILES = ['flow.json', 'flow-farm.json'];
const flows = Object.fromEntries(FILES.map((f) => [f, require('../flows/' + f)]));

const walk = (node, fn) => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, fn));
  if (node && typeof node === 'object') {
    fn(node);
    Object.values(node).forEach((v) => walk(v, fn));
  }
};

for (const [file, flow] of Object.entries(flows)) {
  test(`${file}: every screen is routed and routes point at real screens`, () => {
    const ids = flow.screens.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(Object.keys(flow.routing_model).sort(), [...ids].sort());
    for (const targets of Object.values(flow.routing_model)) for (const t of targets) assert.ok(ids.includes(t), t);
  });

  test(`${file}: one Footer per screen, declared data, titles within 30 characters`, () => {
    for (const s of flow.screens) {
      assert.ok(s.title.length <= 30, `${s.id} title too long`);
      let footers = 0;
      const used = new Set();
      walk(s.layout, (n) => {
        if (n.type === 'Footer') footers++;
        for (const v of Object.values(n)) {
          if (typeof v === 'string') for (const m of v.matchAll(/\$\{data\.([a-z_]+)/g)) used.add(m[1]);
        }
      });
      assert.equal(footers, 1, `${s.id} needs exactly one Footer`);
      for (const k of used) assert.ok(s.data && k in s.data, `${s.id}: data.${k} is not declared`);
    }
  });

  test(`${file}: a dynamic value is always the whole property (no "Pohon \${data.x}")`, () => {
    for (const s of flow.screens)
      walk(s.layout, (n) => {
        for (const [k, v] of Object.entries(n)) {
          if (typeof v === 'string' && v.includes('${')) assert.match(v, /^\$\{[a-z_0-9.]+\}$/, `${s.id}.${k}: "${v}" mixes text and a variable`);
        }
      });
  });

  test(`${file}: form fields used in payloads exist in the same screen`, () => {
    for (const s of flow.screens) {
      const names = new Set();
      walk(s.layout, (n) => {
        if (n.name && n.type !== 'Form') names.add(n.name);
      });
      walk(s.layout, (n) => {
        if (n.type === 'Footer' && n['on-click-action'].payload)
          for (const v of Object.values(n['on-click-action'].payload))
            for (const m of String(v).matchAll(/\$\{form\.([a-z_0-9]+)\}/g)) assert.ok(names.has(m[1]), `${s.id}: form.${m[1]} missing`);
      });
    }
  });

  test(`${file}: text limits (static strings) and properties Meta rejects`, () => {
    for (const s of flow.screens)
      walk(s.layout, (n) => {
        const at = `${s.id}/${n.type}${n.name ? ':' + n.name : ''}`;
        const dyn = (v) => typeof v === 'string' && v.startsWith('${');
        const len = (v) => (typeof v === 'string' && !dyn(v) ? v.length : 0);
        if (n.type === 'DatePicker') assert.ok(!('label-variant' in n), `${at}: DatePicker has no label-variant`);
        if (['TextInput', 'TextArea'].includes(n.type) && n['label-variant'] !== 'large') assert.ok(len(n.label) <= 20, `${at}: label over 20 characters`);
        if (n.type === 'Dropdown') assert.ok(len(n.label) <= 20, `${at}: label over 20 characters`);
        if (['RadioButtonsGroup', 'CheckboxGroup', 'OptIn'].includes(n.type)) assert.ok(len(n.label) <= 30, `${at}: label over 30 characters`);
        if (n['helper-text']) assert.ok(len(n['helper-text']) <= 80, `${at}: helper-text over 80 characters`);
        if (n.type === 'Footer') assert.ok(n.label.length <= 35, `${at}: footer label too long`);
        if (['TextHeading', 'TextSubheading'].includes(n.type)) assert.ok(len(n.text) <= 80, `${at}: heading over 80 characters`);
        if (Array.isArray(n['data-source']))
          for (const o of n['data-source']) {
            assert.ok(o.title.length <= 30, `${at}: option "${o.title}" over 30 characters`);
            assert.ok(!o.description || o.description.length <= 300, `${at}: option description over 300`);
          }
      });
  });

  test(`${file}: worker-facing text is Indonesian: no common English UI words`, () => {
    const text = JSON.stringify(flow.screens.map((s) => [s.title, s.layout]));
    for (const w of ['Submit', 'Cancel', 'Save', 'Next', 'Please', 'Report Issue', 'Required']) assert.ok(!text.includes(w), w);
  });
}

test('the tree Flow is the one report screen; the farm Flow holds rain and finished work', () => {
  const tree = flows['flow.json'];
  assert.deepEqual(tree.screens.map((s) => s.id), ['REPORT', 'DONE']);
  assert.deepEqual(tree.routing_model, { REPORT: ['DONE'], DONE: [] });
  const report = tree.screens[0];
  const picker = JSON.stringify(report).match(/"min-uploaded-photos":(\d+)/);
  assert.equal(picker[1], '1', 'at least one photo');
  assert.deepEqual(flows['flow-farm.json'].screens.map((s) => s.id).sort(), ['DONE', 'FARM_HOME', 'HUJAN', 'KERJA']);
});

test('every screen with a data_exchange is one the endpoint handles', () => {
  const handled = { 'flow.json': ['REPORT'], 'flow-farm.json': ['FARM_HOME', 'KERJA', 'HUJAN'] };
  for (const [file, flow] of Object.entries(flows))
    for (const s of flow.screens) {
      let ex = false;
      walk(s.layout, (n) => { if (n['on-click-action']?.name === 'data_exchange') ex = true; });
      assert.equal(ex, handled[file].includes(s.id), `${file} ${s.id}`);
    }
});

test('flow files are up to date with scripts/build-flow.js, and nothing else is in flows/', () => {
  const dir = path.join(__dirname, '..', 'flows');
  const read = () => FILES.map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  const before = read();
  require('child_process').execFileSync('node', [require.resolve('../scripts/build-flow.js')]);
  assert.deepEqual(read(), before);
  assert.deepEqual(fs.readdirSync(dir).sort(), [...FILES].sort());
});

test('no "penjarangan" in anything a worker reads', () => {
  const all = Object.values(flows).map((f) => JSON.stringify(f)).join(' ')
    + Object.values(require('../lib/rules').COUNT_STAGES).map((s) => s.label).join(' ')
    + Object.values(require('../lib/rules').SEASON_TASK_LABELS).join(' ');
  assert.equal(/jarang/i.test(all), false);
});
