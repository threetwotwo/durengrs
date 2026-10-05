// Builds bot/lib/shared.js from src/shared (the words, codes and rules both sides use), as CommonJS for the bot.
// Run after any change in src/shared: npm run build:bot-shared. tests/bot-shared.test.ts fails if it's stale.
import { buildSync } from 'esbuild';
import { writeFileSync } from 'node:fs';

export function bundleShared() {
  const out = buildSync({
    entryPoints: ['src/shared/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    write: false,
    legalComments: 'none',
  });
  return '// GENERATED from src/shared by scripts/build-bot-shared.mjs. Do not edit: change src/shared, then npm run build:bot-shared.\n' + out.outputFiles[0].text;
}

if (process.argv[1] && process.argv[1].endsWith('build-bot-shared.mjs')) {
  writeFileSync('bot/lib/shared.js', bundleShared());
  console.log('bot/lib/shared.js written');
}
