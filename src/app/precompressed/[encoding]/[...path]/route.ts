import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';

/**
 * Serves the precompressed twin of a bundle script.
 *
 * The build emits `foo.js` next to `foo.js.br` and `foo.js.gz`, but Next has no
 * static precompression: left alone it ships the 1.2 MB raw Pixi build instead
 * of the 299 KB Brotli one. Rewriting to the `.br` file from middleware does not
 * work either — Next strips `Content-Encoding` off a rewritten response, and its
 * own compressor then re-gzips the `.gz`, so both encodings arrive corrupt. A
 * route handler is the only layer that owns its response headers outright.
 *
 * Only scripts come through here. Everything else keeps the static rewrite in
 * next.config.ts, which is what gives the audio its range requests.
 */
const ENCODINGS: Record<string, string> = { br: '.br', gzip: '.gz' };

const BUNDLE = path.join(process.cwd(), 'public', 'bundle');

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ encoding: string; path: string[] }> },
) {
  const { encoding, path: segments } = await context.params;

  const extension = ENCODINGS[encoding];
  if (!extension) return new Response('Not found', { status: 404 });

  // The segments arrive decoded, so a traversal attempt is a literal '..' here.
  // Resolving and re-checking the prefix is the belt to that braces.
  const file = path.join(BUNDLE, ...segments) + extension;
  if (!file.startsWith(BUNDLE + path.sep) || !file.endsWith('.js' + extension)) {
    return new Response('Not found', { status: 404 });
  }

  let stats;
  try {
    stats = await fs.stat(file);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers({
    'Content-Encoding': encoding,
    'Content-Type': 'text/javascript; charset=utf-8',
    'Content-Length': String(stats.size),
    // The version segment makes the URL immutable, same as the static path.
    'Cache-Control': 'public, max-age=31536000, immutable',
    Vary: 'Accept-Encoding',
  });

  if (request.method === 'HEAD') return new Response(null, { headers });

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  return new Response(stream, { headers });
}

export const HEAD = GET;
