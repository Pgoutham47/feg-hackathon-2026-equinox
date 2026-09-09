/**
 * Reports what a player actually downloads, and checks the catalogue against
 * the bundle on disk.
 *
 * The directory total is not a download size and must never be quoted as one.
 * The bundle ships every image at two resolutions and every sound in two
 * formats; a player takes one of each, so the folder is roughly twice what
 * anybody fetches. This prints the per-player number so nobody has to remember
 * that, and fails if the catalogue has drifted from the files it names.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'public', 'bundle');
const CATALOGUE = path.join(process.cwd(), 'public', 'catalogue.json');

const MB = (bytes) => (bytes / 1e6).toFixed(1).padStart(5) + ' MB';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** Which variant axis a file sits on, or null if every player gets it. */
function variant(rel) {
  if (rel.includes(`@1x${path.sep}`)) return 'tier:@1x';
  if (rel.includes(`@0.5x${path.sep}`)) return 'tier:@0.5x';
  if (rel.includes(`ogg${path.sep}`)) return 'fmt:ogg';
  if (rel.includes(`mp3${path.sep}`)) return 'fmt:mp3';
  // Precompressed twins are alternates of a .js every player fetches exactly once.
  if (/\.(br|gz)$/.test(rel)) return 'encoded';
  return null;
}

const files = await walk(ROOT);
const sized = await Promise.all(
  files.map(async (f) => ({
    rel: path.relative(ROOT, f),
    bytes: (await stat(f)).size,
  })),
);

const group = (name) =>
  sized.filter((f) => variant(f.rel) === name).reduce((a, f) => a + f.bytes, 0);

const shared = group(null);
const onDisk = sized.reduce((a, f) => a + f.bytes, 0);

// A player fetches the raw .js or one precompressed twin, never all three, so
// the twins are not additional download weight — they replace bytes already
// counted in `shared`.
// Tier and format are independent axes, so there are four real combinations —
// not two. Android Chrome is a phone that takes ogg, and listing only
// "phone, mp3" implies phones take mp3, which is the Safari/iOS path. Measured
// on a real Android device: @0.5x images with ogg audio.
const COMBOS = [
  ['desktop / tablet, Chrome', '@1x', 'ogg'],
  ['desktop / tablet, Safari', '@1x', 'mp3'],
  ['phone, Chrome (Android)', '@0.5x', 'ogg'],
  ['phone, Safari (iOS)', '@0.5x', 'mp3'],
];
const perPlayer = Object.fromEntries(
  COMBOS.map(([who, tier, fmt]) => [who, shared + group(`tier:${tier}`) + group(`fmt:${fmt}`)]),
);

console.log('Bundle');
console.log(`  on disk                 ${MB(onDisk)}   ${sized.length} files — NOT a download size`);
console.log(`    every player          ${MB(shared)}   code, fonts, config`);
console.log(`    @1x images            ${MB(group('tier:@1x'))}   tablets and desktops`);
console.log(`    @0.5x images          ${MB(group('tier:@0.5x'))}   phones`);
console.log(`    ogg audio             ${MB(group('fmt:ogg'))}   Chrome, Firefox, Edge`);
console.log(`    mp3 audio             ${MB(group('fmt:mp3'))}   Safari, iOS`);
console.log(`    precompressed twins   ${MB(group('encoded'))}   served instead of the raw .js`);
console.log('\nWhat one player downloads');
for (const [who, bytes] of Object.entries(perPlayer)) {
  console.log(`  ${who.padEnd(26)}${MB(bytes)}`);
}

// --- the catalogue must name files that exist -------------------------------

const { slice, audio, rest } = JSON.parse(await readFile(CATALOGUE, 'utf8'));
const present = new Set(sized.map((f) => f.rel.split(path.sep).join('/')));
const problems = [];

/** Every variant of a tokenised path has to resolve, not just the one we measured. */
function expand(p) {
  const variants = p.includes('{tier}')
    ? ['@1x', '@0.5x'].map((t) => p.split('{tier}').join(t))
    : [p];
  return variants.flatMap((v) =>
    v.includes('{fmt}') ? ['ogg', 'mp3'].map((f) => v.split('{fmt}').join(f)) : [v],
  );
}

const byRel = new Map(sized.map((f) => [f.rel.split(path.sep).join('/'), f.bytes]));
for (const [label, assets] of [
  ['slice', slice],
  ['audio', audio],
  ['rest', rest ?? []],
]) {
  for (const asset of assets) {
    const resolved = expand(asset.path);
    for (const r of resolved) {
      if (!present.has(r)) problems.push(`${label}: ${r} is in the catalogue but not on disk`);
    }
    // `bytes` is documented as the larger variant, so it is an upper bound.
    const largest = Math.max(...resolved.map((r) => byRel.get(r) ?? 0));
    if (largest > 0 && asset.bytes !== largest) {
      problems.push(`${label}: ${asset.path} says ${asset.bytes} bytes, largest variant is ${largest}`);
    }
  }
}

// --- 'full' has to mean full -------------------------------------------------

// The whole point of `rest` is that slice + audio + rest is the entire bundle:
// a player who takes all three never fetches anything at runtime. That only
// holds if the three lists partition the files on disk, so check it rather than
// trusting the generator that wrote them.
const tokenise = (rel) =>
  rel
    .replace(/(^|\/)@(?:1x|0\.5x)\//, '$1{tier}/')
    .replace(/(^|\/)(?:ogg|mp3)\//, '$1{fmt}/')
    .replace(/\.(?:ogg|mp3)$/, '.{fmt}');

const listed = new Map();
for (const [label, assets] of [
  ['slice', slice],
  ['audio', audio],
  ['rest', rest ?? []],
]) {
  for (const asset of assets) {
    if (listed.has(asset.path)) {
      problems.push(`${asset.path} is in both ${listed.get(asset.path)} and ${label}`);
    }
    listed.set(asset.path, label);
  }
}
for (const { rel } of sized) {
  const posix = rel.split(path.sep).join('/');
  // The precompressed twins are reached through the .js URL, never named.
  if (/\.(br|gz)$/.test(posix)) continue;
  if (!listed.has(tokenise(posix))) {
    problems.push(`${posix} is on disk but in no list — 'full' would not include it`);
  }
}

// --- what the prefetch costs, per player ------------------------------------

const cost = (assets, tier, fmt) =>
  assets.reduce(
    (a, asset) =>
      a + (byRel.get(asset.path.split('{tier}').join(tier).split('{fmt}').join(fmt)) ?? 0),
    0,
  );

console.log('\nWhat the lobby prefetches — every visitor');
for (const [who, tier, fmt] of COMBOS) {
  const s = cost(slice, tier, fmt);
  const a = cost(audio, tier, fmt);
  const share = ((s + a) / perPlayer[who]) * 100;
  console.log(
    `  ${who.padEnd(26)}${MB(s + a)}   slice ${MB(s).trim()} + audio ${MB(a).trim()}` +
      `  — ${share.toFixed(0)}% of that player's bundle`,
  );
}

// A returning player — two distinct games opened — also gets `rest`, which by
// the partition check above completes the bundle: nothing is left to fetch.
console.log(`\nAdditionally, a returning player (${(rest ?? []).length} more files)`);
for (const [who, tier, fmt] of COMBOS) {
  const r = cost(rest ?? [], tier, fmt);
  const total = cost(slice, tier, fmt) + cost(audio, tier, fmt) + r;
  const flag = total === perPlayer[who] ? '' : '   ** does not add up to the bundle **';
  console.log(
    `  ${who.padEnd(26)}${MB(r)}   → ${MB(total).trim()} total, the whole bundle${flag}`,
  );
}

// bundleVersion is a content hash of the bundle, but the recipe that produced
// the committed value is not in this repo, so it cannot be recomputed here.
// Regenerating it means replacing it wholesale, which invalidates every cache.

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('\nCatalogue matches the bundle on disk.');
