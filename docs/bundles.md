# Bundles and skins

One shared engine, thirty skin packs. The engine (`vendor-pixi`, `core-engine`,
~27 MB of audio, ~60 MB of non-logo spines) is fetched once and then hits cache
for every other game in the catalogue. Each game carries only the art that gives
it an identity — splash, symbols, reel elements, control panel, logo, at both
resolutions, plus its own `gameName` — about 24 files and 8 MB.

That split is the point, not a disk saving: the shared half is free after the
first game, and the per-game pack is the only thing the prefetch policy has to
predict and pay for.

## URL shape

```
{CDN}/_shared/{engine_version}/assets/core-engine.js     ← shared, cached once
{CDN}/{slug}/{bundle_version}/assets/images/symbols.webp ← per-game skin
```

Both segments are content hashes, so every URL is immutable and served
`Cache-Control: public, max-age=31536000, immutable`.

## Baking

`make bake` runs the whole pipeline against the local CDN root. The three stages
individually:

```bash
skin-baker classify --trace prefetch-demo/report.jsonl   # → out/tiers.json
skin-baker bake --only king-rhino                        # → out/manifest.json
skin-baker publish --backend local --local-root ./cdn --no-dry-run
```

**classify** derives the prefetch tiers from a recorded load — the slice is every
resource requested before the Play screen. It accepts the instrumentation's JSONL
or a HAR. A golden test asserts it still reproduces the prototype's hand-checked
27-file `_slice.json`; if that ever breaks, the tiers are wrong and every
prefetched load quietly degrades to baseline with no error anywhere.

**bake** palette-rotates the identity art, rewrites the game name in the bundle
script and every locale file, and cuts a lobby thumbnail from the game's own
recoloured splash. Roughly 8 s for all 30 on 10 cores. Each game is stamped, so
re-running only rebuilds what changed.

**publish** uploads to object storage and then registers the manifest with
`POST /v1/internal/bundles`. Registration is last on purpose: register first and
the API starts handing out manifest URLs for objects that do not exist yet.
Uploads skip objects that are already present — every key carries a content hash,
so a present object is by definition the right bytes.

Measured on this catalogue: 546 objects, 44 MB shared + 144 MB of skin packs.
Without the split it would be 30 x 51 MB = 1.5 GB.

### Inherited limits

- Skins are hue rotations of one art set, spaced 12° apart — any closer and
  neighbouring games stop reading as distinct.
- The painted wordmark on the splash is assembled at runtime from spine slots, so
  retitling it per game means rebuilding the logo animation. The document title
  and in-game name do change.
- Faces recolour along with everything else; that is inherent to a hue rotation.
- `assets/spines/@1x/book.png` is requested on every load and 404s. The baker
  warns about it — a classified path with no file behind it is a request the
  bundle cannot satisfy.
