// Copies shared/ files into the website and the extension (neither has a build step).
// `node scripts/sync-shared.mjs --check` exits non-zero if a copy is stale (use in CI).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  ['shared/card.js', 'web/assets/js/card.js'],
  ['shared/card.js', 'extension/src/card.js'],
];
const check = process.argv.includes('--check');
let stale = 0;
for (const [from, to] of targets) {
  const body = `// GENERATED from ${from} by scripts/sync-shared.mjs. Edit the source, then run \`npm run sync\`.\n${readFileSync(resolve(root, from), 'utf8')}`;
  const dest = resolve(root, to);
  const same = existsSync(dest) && readFileSync(dest, 'utf8') === body;
  if (check) {
    if (!same) {
      console.error(`stale: ${to}`);
      stale++;
    }
  } else if (!same) {
    writeFileSync(dest, body);
    console.log(`synced ${to}`);
  }
}
if (stale) process.exit(1);
