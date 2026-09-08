import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

/**
 * Serves the game bundle at the URL shape a CDN would: /cdn/{version}/{path}.
 *
 * The version is a content hash of the whole bundle, so every URL is immutable
 * and the service worker never has to invalidate anything — only evict.
 */
const ROOT = resolve(process.cwd(), 'bundle');

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

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const [, ...rest] = (await params).path;
  const assetPath = rest.join('/');
  const file = resolve(ROOT, join(...rest));
  // Path traversal guard: the URL is not trusted.
  if (!assetPath || !file.startsWith(ROOT + sep)) return new Response('Not found', { status: 404 });

  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    return new Response(new Uint8Array(await readFile(file)), {
      headers: {
        'Content-Type': TYPES[assetPath.split('.').pop() ?? ''] ?? 'application/octet-stream',
        // The version is in the path, so the bytes at a URL never change.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
