import test from 'node:test';
import assert from 'node:assert/strict';

test('a new product: the section letter and its next number, after the section in order', async () => {
  const { newItemId } = await import('../src/shared/stock');
  const items = [
    { id: 'A01', section: 'A. Crop nutrition', no: 1 },
    { id: 'A15', section: 'A. Crop nutrition', no: 15 },
    { id: 'B03', section: 'B. Fungisida', no: 3 },
  ];
  assert.deepEqual(newItemId(items, 'A. Crop nutrition'), { id: 'A16', no: 16, order: 65016 });
  assert.deepEqual(newItemId(items, 'G. Alat'), { id: 'G01', no: 1, order: 71001 });
  assert.equal(newItemId([...items, { id: 'B04', section: 'B. lama', no: 1 }], 'B. Fungisida').id, 'B05', 'a taken id is skipped');
});
