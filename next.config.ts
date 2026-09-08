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
  reactStrictMode: true,
  poweredByHeader: false,
  rewrites() {
    return Promise.resolve([{ source: '/cdn/:version/:path*', destination: '/bundle/:path*' }]);
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
        // Never cache the worker itself, or a bad policy ships permanently.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]);
  },
};

export default config;
