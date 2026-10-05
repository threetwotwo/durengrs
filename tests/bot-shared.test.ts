// The bot reads the shared words and rules from a generated copy: it must match src/shared.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundleShared } from '../scripts/build-bot-shared.mjs';

test('bot/lib/shared.js is up to date with src/shared (else: npm run build:bot-shared)', () => {
  assert.equal(readFileSync('bot/lib/shared.js', 'utf8'), bundleShared());
});
