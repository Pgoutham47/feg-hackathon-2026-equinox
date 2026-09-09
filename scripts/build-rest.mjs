/**
 * Regenerates the catalogue's `rest` list: everything in the bundle that the
 * slice and the audio do not already name.
 *
 * It is derived, never hand-written. `rest` is defined as a remainder, so the
 * only way it stays correct across a bundle change is to recompute it from the
 * files on disk minus the two lists that already exist.
 *
 * Run after a bundle update, then `node tests/check-bundle.mjs` to verify.
 */
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'public', 'bundle');
const CATALOGUE = path.join(process.cwd(), 'public', 'catalogue.json');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** Collapses a concrete path back to the tokenised form the catalogue stores. */
function tokenise(rel) {
  return rel
    .replace(/(^|\/)@(?:1x|0\.5x)\//, '$1{tier}/')
    .replace(/(^|\/)(?:ogg|mp3)\//, '$1{fmt}/')
    .replace(/\.(?:ogg|mp3)$/, '.{fmt}');
}

const catalogue = JSON.parse(await readFile(CATALOGUE, 'utf8'));
const named = new Set([...catalogue.slice, ...catalogue.audio].map((a) => a.path));

const files = await walk(ROOT);
const sizes = new Map();
for (const file of files) {
  sizes.set(path.relative(ROOT, file).split(path.sep).join('/'), (await stat(file)).size);
}

const rest = new Map();
for (const [rel, bytes] of sizes) {
  // The precompressed twins are alternates of a .js the player fetches once,
  // chosen by Accept-Encoding on the .js URL itself. Fetching that URL already
  // gets the compressed bytes, so naming the twins here would cache the same
  // script three times over.
  if (/\.(br|gz)$/.test(rel)) continue;
  const path_ = tokenise(rel);
  if (named.has(path_)) continue;
  // `bytes` is the largest variant, matching how slice and audio record it.
  rest.set(path_, Math.max(rest.get(path_) ?? 0, bytes));
}

catalogue.rest = [...rest]
  .map(([path_, bytes]) => ({ path: path_, bytes }))
  .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));

await writeFile(CATALOGUE, JSON.stringify(catalogue, null, 1) + '\n');

const total = catalogue.rest.reduce((a, x) => a + x.bytes, 0);
console.log(`rest: ${catalogue.rest.length} entries, ${(total / 1e6).toFixed(1)} MB at the larger variant`);
