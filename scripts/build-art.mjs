/**
 * Fills `public/art/` with one cover image per game.
 *
 * Prefers real thumbnails from `assets/art-src/` and falls back to generated
 * artwork for whatever they do not cover, so the lobby always has a full set of
 * tiles however many files are on hand. Vendor art is the operator's to supply;
 * nothing here fetches it.
 *
 * Deterministic: the same inputs always produce the same assignment, so the
 * lobby does not reshuffle between builds.
 */
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CATALOGUE = path.join(process.cwd(), 'public', 'catalogue.json');
const SRC = path.join(process.cwd(), 'assets', 'art-src');
const OUT = path.join(process.cwd(), 'public', 'art');

/** Tiles are 4:3 and never render wider than ~400 CSS px, so this is generous. */
const MAX_WIDTH = 600;
const PHOTO = /\.(jpe?g|png|webp)$/i;

const W = 400;
const H = 300;

/** Stable small integer from a slug, so every choice below is repeatable. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The radiating wedges behind the symbol — the thing that reads as 'jackpot'. */
function rays(count, spin) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = (360 / count) * i + spin;
    const p = (deg, r) => [
      (200 + r * Math.cos((deg * Math.PI) / 180)).toFixed(1),
      (150 + r * Math.sin((deg * Math.PI) / 180)).toFixed(1),
    ];
    const [x1, y1] = p(a - 4, 420);
    const [x2, y2] = p(a + 4, 420);
    out.push(`<path d="M200 150 L${x1} ${y1} L${x2} ${y2} Z" fill="#fff" opacity="0.055"/>`);
  }
  return out.join('');
}

/** A few small ghosted copies of the symbol, for texture in the corners. */
function confetti(symbol, seed) {
  const spots = [
    [58, 66, 30, -18],
    [344, 78, 24, 14],
    [70, 236, 26, 12],
    [332, 232, 30, -12],
  ];
  return spots
    .map(([x, y, size, rot], i) =>
      (seed >> i) & 1
        ? `<text x="${x}" y="${y}" font-size="${size}" fill="#fff" opacity="0.16" text-anchor="middle" transform="rotate(${rot} ${x} ${y})">${escape(symbol)}</text>`
        : '',
    )
    .join('');
}

/** The shape the symbol sits on — three of them, so the grid is not one template. */
function medallion(variant) {
  if (variant === 0) {
    return `<circle cx="200" cy="150" r="96" fill="#000" opacity="0.22"/>
  <circle cx="200" cy="150" r="96" fill="none" stroke="url(#gold)" stroke-width="3.5" opacity="0.9"/>
  <circle cx="200" cy="150" r="86" fill="none" stroke="url(#gold)" stroke-width="1.2" opacity="0.45"/>`;
  }
  if (variant === 1) {
    return `<rect x="126" y="76" width="148" height="148" rx="16" transform="rotate(45 200 150)"
        fill="#000" opacity="0.20" stroke="url(#gold)" stroke-width="3" stroke-opacity="0.85"/>`;
  }
  return '';
}

const SHEEN = `<path d="M0 0 L170 0 L60 300 L0 300 Z" fill="#fff" opacity="0.06"/>`;

function art({ slug, symbol, gradient }) {
  const [from, to] = gradient.split(',');
  const seed = hash(slug);
  const variant = seed % 3;
  const size = variant === 2 ? 150 : 118;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff" stop-opacity="0.42"/>
      <stop offset="0.55" stop-color="#fff" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" cx="0.5" cy="0.45" r="0.78">
      <stop offset="0.45" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe9a8"/>
      <stop offset="0.5" stop-color="#f0c04a"/>
      <stop offset="1" stop-color="#b8862a"/>
    </linearGradient>
    <filter id="drop" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g>${rays(14 + (seed % 5) * 2, seed % 24)}</g>
  <ellipse cx="200" cy="150" rx="185" ry="145" fill="url(#glow)"/>
  ${confetti(symbol, seed)}
  ${SHEEN}
  <rect width="${W}" height="${H}" fill="url(#vig)"/>

  ${medallion(variant)}
  <text x="200" y="150" font-size="${size}" text-anchor="middle" dominant-baseline="central"
        font-family="Georgia, 'Times New Roman', serif" font-weight="700"
        fill="url(#gold)" stroke="#2a1a05" stroke-width="2.5"
        paint-order="stroke" filter="url(#drop)">${escape(symbol)}</text>

  <rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="10" fill="none"
        stroke="url(#gold)" stroke-width="2" opacity="0.55"/>
</svg>
`;
}

const { games } = JSON.parse(await readFile(CATALOGUE, 'utf8'));
// Emptied, not merged into: a game's art can change extension between runs, and
// a leftover `slug.jpg` next to a new `slug.webp` is dead weight that the
// manifest no longer points at. Everything in here is regenerated below.
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await mkdir(SRC, { recursive: true });

/** Pixel width according to sips, or null when it cannot say. */
async function widthOf(file) {
  const { stdout } = await run('sips', ['-g', 'pixelWidth', file]).catch(() => ({ stdout: '' }));
  const found = /pixelWidth:\s*(\d+)/.exec(stdout);
  return found ? Number(found[1]) : null;
}

const supplied = (await readdir(SRC).catch(() => [])).filter((f) => PHOTO.test(f)).sort();
const bySlug = new Map();
const pool = [];
for (const file of supplied) {
  const stem = file.replace(PHOTO, '');
  // A file named for a slug is pinned to that game; everything else is dealt out.
  if (games.some((g) => g.slug === stem)) bySlug.set(stem, file);
  else pool.push(file);
}

// `art.json` is the map the lobby reads, because a slug's art can be a .jpg, a
// .png or a generated .svg and the tile must not have to guess which.
const manifest = {};
let dealt = 0;
let generated = 0;

for (const game of games) {
  const pinned = bySlug.get(game.slug);
  const file = pinned ?? (pool.length > 0 ? pool[dealt++ % pool.length] : null);

  if (file) {
    const ext = path.extname(file).toLowerCase();
    const target = path.join(OUT, `${game.slug}${ext}`);
    await copyFile(path.join(SRC, file), target);
    // Only touch an image that is actually too wide. `sips -Z` on one that is
    // already small does not resize it but does re-encode it, and re-encoding
    // an already-compressed thumbnail makes it bigger — measured at 44 KB in,
    // 106 KB out. Leaving it alone is both smaller and lossless.
    const width = await widthOf(target);
    if (width !== null && width > MAX_WIDTH) {
      await run('sips', ['-Z', String(MAX_WIDTH), target]).catch(() => {});
    }
    manifest[game.slug] = `/art/${game.slug}${ext}`;
  } else {
    await writeFile(path.join(OUT, `${game.slug}.svg`), art(game));
    manifest[game.slug] = `/art/${game.slug}.svg`;
    generated += 1;
  }
}

await writeFile(path.join(OUT, 'art.json'), JSON.stringify(manifest, null, 1) + '\n');

console.log(`art: ${games.length} tiles`);
console.log(`  ${bySlug.size} pinned by filename`);
console.log(`  ${Math.min(dealt, games.length - bySlug.size)} from the pool of ${pool.length} supplied image(s)`);
console.log(`  ${generated} generated`);
