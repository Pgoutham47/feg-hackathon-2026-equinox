# Dependency & third-party disclosure

Material open-source libraries, third-party components, assets and AI-assisted
tooling used in this submission, with the licence each is used under.

Nothing here is fetched at runtime: there is no third-party API, SDK, analytics
tag, font CDN or model endpoint in the running prototype. Every byte a player
downloads is served from this repository.

## 1. Runtime dependencies (npm, declared in `package.json`)

| Package | Version | Licence | Why it is here |
|---|---|---|---|
| `next` | 15.5.x | MIT | The application framework: server components, routing, middleware, static serving |
| `react` | 19.x | MIT | UI runtime |
| `react-dom` | 19.x | MIT | DOM renderer |
| `server-only` | 0.0.1 | MIT | Compile-time guard so the catalogue reader can never be bundled into client code |
| `ismobilejs` | 1.1.1 | MIT | Phone/tablet detection for the asset-tier choice — the same library the game engine uses, so the two always agree |

## 2. Build / development dependencies (npm)

| Package | Version | Licence |
|---|---|---|
| `typescript` | 5.9.x | Apache-2.0 |
| `tailwindcss` | 4.x | MIT |
| `@tailwindcss/postcss` | 4.x | MIT |
| `@types/node`, `@types/react`, `@types/react-dom` | — | MIT (DefinitelyTyped) |

Transitive packages resolved into `node_modules` carry MIT, Apache-2.0, ISC,
BSD-3-Clause, 0BSD, MPL-2.0 (`lightningcss`), CC-BY-4.0 (`caniuse-lite`) and
LGPL-3.0-or-later (`@img/sharp-libvips-*`, pulled in by Next's optional image
optimiser) licences. All are permissive or file-level copyleft used unmodified
as a dependency; none is statically linked into or redistributed as part of the
submitted source. `package-lock.json` records the exact resolved set.

## 3. The game bundle — `public/bundle/`

**This is a pre-built, certified third-party game build. It is not the
submitting team's work, and it is redistributed here byte-identical and
unmodified.** No file in it was edited, recompiled, re-encoded or re-hashed; the
whole caching strategy is built around not touching it.

Reviewers evaluating licensing should treat this directory as supplied vendor
material, provided for the Hackathon under the arrangement described in the
challenge briefing.

The bundle itself embeds third-party runtimes, identified from its shipped
artefacts:

| Component | Evidence | Usual licence |
|---|---|---|
| PixiJS v8 | `assets/vendor-pixi-*.js` | MIT |
| Howler.js | `assets/vendor-pixi-*.js`, `assets/core-engine-*.js` | MIT |
| GSAP 3.x | `assets/vendor-pixi-*.js` | Standard "No Charge" licence — commercial use has conditions |
| Spine runtime, skeletons exported from Spine **4.2.43** | `assets/spines/**/*.json` (`"spine": "4.2.43"`) | Spine Runtimes Licence — requires a valid Esoteric Software Spine licence |
| Vite (build tool, not shipped as a library) | module-preload shim in `assets/vendor-pixi-*.js` | MIT |
| Fonts: Mulish, Oswald, Roboto, New Rocker | `assets/fonts/en/*.ttf` | SIL Open Font Licence 1.1 |

Version numbers beyond Spine's are not asserted precisely: the vendor build ships
minified with no dependency manifest, so the entries above are identified by
their code signatures. **GSAP and the Spine runtime are the two entries with
non-permissive terms** — both are the bundle vendor's obligations rather than
this repository's, and confirming the vendor holds the required licences is a
question for the Organisers, not something that can be established from the
files.

## 4. Artwork — `assets/art-src/`, `public/art/`

Game cover thumbnails. These are vendor art: they are the operator's to supply,
and only art the operator has the right to show should ship. `scripts/build-art.mjs`
copies and resizes them into `public/art/`; nothing in this repository fetches
artwork from the internet. Where a thumbnail is missing, the script generates
placeholder artwork deterministically, so the lobby always has a full set.

## 5. Data

`src/lib/demo-data.ts` — balances, jackpot figures, player names and similar
lobby dressing — is **synthetic demo data written for this prototype**. No real
customer data, player data or personal data is present anywhere in this
repository.

The engagement figures quoted in [architecture.md](./architecture.md) (89 players,
13,682 launches, the 4.5% → 46.7% spread) are aggregate counts derived from event logs. Only the
aggregates appear in this repository; no event rows, identifiers or personal
data were committed.

## 6. Secrets

None. The prototype has no API keys, tokens, passwords or credentials, and no
`process.env` read anywhere except `NODE_ENV`. See `.env.example`.

## 7. AI / code-assistance disclosure

Generative AI coding assistance was used during development of the
application code in `src/`, `scripts/`, `tests/` and this documentation.

- It was **not** used on `public/bundle/`, which is the unmodified vendor build.
- No confidential information, credentials, real customer or player data, or
  restricted Hackathon Resources were entered into any AI system.
- All AI-assisted output was reviewed by the team, which remains responsible for
  originality, security, licensing and accuracy.

<!-- TODO before submission: confirm the tool name(s) and the extent of use with
     your team, and adjust the three bullets above to match what you actually did. -->
