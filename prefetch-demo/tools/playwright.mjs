/**
 * Locate Playwright wherever this checkout happens to have installed it.
 *
 * Playwright is a verification tool only - it drives a real Chromium so the
 * service worker and Cache Storage can actually be exercised. Nothing in
 * `site/` depends on it, and it is not part of the static deployable.
 *
 * The repo installs it through pnpm, which hides packages under
 * `node_modules/.pnpm/<name>@<version>/node_modules/<name>`, so a plain import
 * specifier does not resolve from here.
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

function candidates() {
  const out = [];
  const require_ = createRequire(import.meta.url);
  for (const from of [REPO, join(REPO, 'apps', 'web'), HERE]) {
    try {
      out.push(require_.resolve('playwright', { paths: [from] }));
    } catch {
      /* not installed there */
    }
  }
  const pnpm = join(REPO, 'node_modules', '.pnpm');
  try {
    for (const entry of readdirSync(pnpm)) {
      if (entry.startsWith('playwright@')) {
        out.push(join(pnpm, entry, 'node_modules', 'playwright', 'index.mjs'));
      }
    }
  } catch {
    /* no pnpm store */
  }
  return out;
}

let loaded = null;
for (const path of candidates()) {
  try {
    loaded = await import(pathToFileURL(path).href);
    break;
  } catch {
    /* try the next one */
  }
}

if (!loaded) {
  console.error(
    'Playwright not found. Install it with `pnpm install` at the repo root, ' +
      'or `npx playwright install chromium`.',
  );
  process.exit(2);
}

export const { chromium } = loaded;
