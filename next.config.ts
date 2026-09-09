import type { NextConfig } from 'next';

/**
 * The game bundle lives in public/bundle and is served at /cdn/{bundleVersion}/…
 *
 * The version segment is a content hash of the bundle, so every asset URL is
 * immutable: a new bundle is a new set of URLs and the service worker never has
 * to invalidate anything. The rewrite drops that segment and lets Next serve the
 * file statically, which also gives range requests — the game seeks within its
 * audio, and a handler returning whole buffers cannot support that.
 *
 * It must stay a same-origin path. A service worker cannot control a
 * cross-origin iframe, so a bundle on a CDN host is one the worker never sees.
 */
const config: NextConfig = {
  // Dev and prod get separate build dirs, so a running `next dev` cannot
  // overwrite the output that `next start` is serving.
  distDir: process.env.NODE_ENV === 'production' ? '.next-prod' : '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  rewrites() {
    return Promise.resolve([
      { source: '/cdn/:version/:path*', destination: '/bundle/:path*' },
      // DEMO ONLY. The same bytes as /cdn/, served so that nothing may keep
      // them: it is the Compare panel's baseline, the load a first-time visitor
      // gets with no service worker and no warm cache. Outside the worker's
      // `/cdn/` prefix on purpose, so the request is one it never sees.
      { source: '/original/:version/:path*', destination: '/bundle/:path*' },
    ]);
  },
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        // The version is in the path, so the bytes at a URL never change.
        source: '/cdn/:version/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // The baseline has to be cold on every run, or the second comparison
        // would measure the first one's leftovers rather than a first load.
        source: '/original/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' }],
      },
      {
        // Never cache the worker itself, or a bad policy ships permanently.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]);
  },
};

export default config;
