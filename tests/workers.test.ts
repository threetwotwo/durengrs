import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWorker, normalizePhone, workerLabel } from '../src/lib/workers';

test('phone numbers in any common form become the WhatsApp form', () => {
  assert.equal(normalizePhone('0811-188-6551'), '628111886551');
  assert.equal(normalizePhone('+62 811 188 6551'), '628111886551');
  assert.equal(normalizePhone('8111886551'), '628111886551');
  assert.equal(normalizePhone('66812345678'), '66812345678'); // Thai number kept as is
});

test('worker form checks', () => {
  const list = [{ phone: '628111886551', name: 'Udin' }];
  assert.equal(checkWorker({ phone: '0811 188 6551', name: 'Udin' }, list).errors.phone, 'wk.e.exists');
  assert.equal(checkWorker({ phone: '0811 188 6551', name: 'Udin' }, list, '628111886551').errors.phone, undefined); // editing itself
  assert.equal(checkWorker({ phone: '123', name: 'X' }, list).errors.phone, 'wk.e.phone');
  assert.equal(checkWorker({ phone: '081299990000', name: '  ' }, list).errors.name, 'wk.e.name');
  assert.equal(checkWorker({ phone: '081299990000', name: 'x'.repeat(41) }, list).errors.name, 'wk.e.nameLong');
});

test('labels: name when known, masked number otherwise, typed names as they are', () => {
  const names = new Map([['628111886551', 'Udin']]);
  assert.equal(workerLabel(names, '628111886551'), 'Udin');
  assert.equal(workerLabel(names, '628122223333'), '••••3333');
  assert.equal(workerLabel(names, 'Pak Budi'), 'Pak Budi');
  assert.equal(workerLabel(names, undefined), '');
});
