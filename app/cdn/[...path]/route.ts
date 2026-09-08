import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import { getCatalogue } from '@/lib/catalogue.server';

/**
 * Serves the game bundle at the URL shape the CDN uses in production:
 *
 *   /cdn/{slug}/{bundleVersion}/{path}   the baked skin pack
 *   /cdn/_shared/{engineVersion}/{path}  the shared engine
 *
 * The bundle asks for every file under its own prefix, because its index.html
 * references them relatively and we never modify it. So a per-game miss falls
 * through to the shared engine, and then to the unmodified source bundle in
 * `assets/` — which is what keeps the lobby working on a clone that has no
 * baked `cdn/` directory.
 */
const ROOTS = ['cdn', 'assets', 'bundle'].map((dir) => resolve(process.cwd(), dir));

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  css: 'text/css; charset=utf-8',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  ttf: 'font/ttf',
  fnt: 'text/plain; charset=utf-8',
};

/** The file at `candidate`, but only if it really is a file inside a served root. */
async function readIfFile(candidate: string): Promise<Buffer | null> {
  const full = resolve(process.cwd(), candidate);
  // Path traversal guard: the URL is not trusted.
  if (!ROOTS.some((root) => full.startsWith(root + sep))) return null;
  try {
    if (!(await stat(full)).isFile()) return null;
    return await readFile(full);
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const segments = (await params).path;
  const [namespace, , ...rest] = segments;
  const assetPath = rest.join('/');
  if (!namespace || !assetPath) return new Response('Not found', { status: 404 });

  const { engineVersion } = await getCatalogue();
  const candidates = [
    join('cdn', ...segments),
    namespace === '_shared' ? null : join('cdn', '_shared', engineVersion, assetPath),
    // The unmodified bundle in the repo: `assets/…` resolves as itself, and the
    // boot document lives in `bundle/`.
    assetPath === 'index.html' ? join('bundle', 'index.html') : assetPath,
  ].filter((candidate): candidate is string => candidate !== null);

  for (const candidate of candidates) {
    const body = await readIfFile(candidate);
    if (!body) continue;
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': TYPES[assetPath.split('.').pop() ?? ''] ?? 'application/octet-stream',
        // The version is in the path, so the bytes at a URL never change.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }
  return new Response('Not found', { status: 404 });
}
