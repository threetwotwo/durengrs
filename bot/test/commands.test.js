// What a chat message asks for: case, spaces and small typos don't matter.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommand } = require('../lib/commands');

test('tree IDs in any case and spacing', () => {
  for (const t of ['A1', 'a1', ' a 1 ', 'b12', 'A1.', 'aa105']) assert.equal(parseCommand(t).kind, 'tree', t);
  assert.equal(parseCommand('a 1').id, 'A1');
  assert.equal(parseCommand('B12').id, 'B12');
});

test('command words in any case, with small typos', () => {
  for (const t of ['RINGKASAN', 'ringkasan', 'Ringkasan', 'Ringakasan', 'ringksan', 'RINGKASN', 'rekap', 'Ringkasan!', 'laporan hari ini']) assert.equal(parseCommand(t).kind, 'summary', t);
  for (const t of ['KEBUN', 'kebun', 'Kebon', 'hujan', 'Hujan', 'kerja', 'pekerjan', 'curah hujan', 'Catatan kebun']) assert.equal(parseCommand(t).kind, 'farm', t);
});

test('anything else gets the help message', () => {
  for (const t of ['', 'halo', 'terima kasih', 'ringan', 'A1 sehat', 'kebunnya bagus sekali']) assert.equal(parseCommand(t).kind, 'help', t);
});

test('PANEN A0 opens only the harvest report for that tree', () => {
  assert.deepEqual(parseCommand('panen a0'), { kind: 'harvest', id: 'A0' });
  assert.deepEqual(parseCommand('PANEN B 12'), { kind: 'harvest', id: 'B12' });
  assert.deepEqual(parseCommand('Panan A3'), { kind: 'harvest', id: 'A3' }, 'a typo in PANEN');
  assert.deepEqual(parseCommand('A0'), { kind: 'tree', id: 'A0' }, 'the tree alone still opens both reports');
  assert.notEqual(parseCommand('kebun A0').kind, 'harvest');
});
