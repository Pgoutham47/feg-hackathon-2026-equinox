import { NextRequest, NextResponse } from 'next/server';

/**
 * Routes bundle scripts to their precompressed twin when the client can take it.
 *
 * The picking happens here because only middleware sees Accept-Encoding before
 * the static layer resolves the file; the serving happens in the route handler
 * because only a route handler can set Content-Encoding without Next stripping
 * it. Anything that is not a script falls straight through to the static
 * rewrite in next.config.ts.
 */
const ENCODINGS = ['br', 'gzip'] as const;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Vary on every bundle response, not just the rewritten ones: the bytes at
  // these URLs genuinely differ by Accept-Encoding, and a shared cache that
  // misses that will hand Brotli to a client that cannot read it.
  const vary = { headers: { Vary: 'Accept-Encoding' } };
  if (!pathname.endsWith('.js')) return NextResponse.next(vary);

  const offered = (request.headers.get('accept-encoding') ?? '')
    .split(',')
    .map((part) => part.trim().split(';')[0]);
  const encoding = ENCODINGS.find((candidate) => offered.includes(candidate));
  if (!encoding) return NextResponse.next(vary);

  const original = pathname.startsWith('/original/');
  const url = request.nextUrl.clone();
  url.pathname = pathname.replace(/^\/(?:cdn|original)\/[^/]+\//, `/precompressed/${encoding}/`);
  if (original) url.searchParams.set('nostore', '1');
  return NextResponse.rewrite(url);
}

export const config = { matcher: ['/cdn/:path*', '/original/:path*'] };
