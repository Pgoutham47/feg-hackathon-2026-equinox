# Configuration

There are **no secrets and no runtime configuration** to supply. The prototype
runs from a clean clone with `npm install && npm run dev` — no `.env` file, no
database URL, no API key. `.env.example` at the repository root is the template,
and everything in it is commented out because everything in it is optional.

This folder documents where the real configuration lives, since it is all
checked-in code rather than environment values.

## Application configuration

| File | What it configures |
|---|---|
| `../next.config.ts` | The `/cdn/{version}/…` and `/original/{version}/…` rewrites onto `public/bundle/`, cache-control and security headers, and the split dev / production build directories |
| `../src/middleware.ts` | Which requests get routed to a precompressed `.br` / `.gz` twin, and the `Vary: Accept-Encoding` on every bundle response |
| `../tsconfig.json` | TypeScript, including the `@/*` → `src/*` path alias |
| `../postcss.config.mjs` | Tailwind v4 via `@tailwindcss/postcss` |
| `../package.json` | Scripts, dependencies, and the Node engine floor (>= 20.11.0) |
| `../.claude/launch.json` | Dev-server launch profiles used by the local tooling; not needed to run the app |

## Content configuration

| File | What it configures |
|---|---|
| `../public/catalogue.json` | The source of truth: the 30 games, `bundleVersion`, and the `slice` / `audio` / `rest` partition of the bundle that the service worker caches in three passes |
| `../public/sw.js` | The caching engine's own constants: the throughput floors for each pass (3 Mbps for audio, 5 Mbps for the rest) and the cache names |
| `../src/lib/recent.ts` | The returning-player threshold — two distinct games opened, five seconds of dwell each — that gates the full 38.8 MB pass |

Changing the bundle means regenerating the derived lists; see the README's
*How to test / validate* section.

## Deployment configuration

The one hard requirement is that the game bundle is served from the lobby's own
origin over HTTPS. A service worker cannot control a cross-origin iframe, so a
bundle moved to a separate CDN host is one the worker never sees. See
`../docs/architecture.md` under *Deployment assumptions*.
