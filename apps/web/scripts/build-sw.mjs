/**
 * Bundles the service worker from packages/prefetch-core into public/sw.js.
 *
 * The worker is built, not hand-written in public/, so it shares the policy
 * types with the app and cannot drift from the API contract.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['../../packages/prefetch-core/src/sw.ts'],
  outfile: 'public/sw.js',
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: process.env.NODE_ENV !== 'production',
  logLevel: 'info',
});
