import type { NextConfig } from 'next';

/**
 * Security headers are set here rather than in vercel.json so they also apply
 * to `next start` and to any non-Vercel deploy.
 *
 * The service worker needs `Service-Worker-Allowed: /` to control the whole
 * origin while being served from /sw.js.
 */

/**
 * Where `/cdn/*` is proxied to — object storage in production, the API's dev
 * CDN locally.
 *
 * The browser must never be handed this URL directly. A service worker only
 * controls clients on its own origin, so a bundle served from another host is
 * an iframe the worker cannot see: it re-downloads every byte the prefetch
 * just cached. Rewriting here keeps the bytes on the CDN and the URL on the
 * lobby's origin, which is the only place the worker can intercept them.
 */
const CDN_UPSTREAM_URL = (process.env.CDN_UPSTREAM_URL ?? 'http://localhost:8000/cdn').replace(
  /\/$/,
  '',
);
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  typedRoutes: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  rewrites() {
    return Promise.resolve([{ source: '/cdn/:path*', destination: `${CDN_UPSTREAM_URL}/:path*` }]);
  },
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          // Never cache the worker itself, or a bad policy ships permanently.
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ]);
  },
};

export default config;
