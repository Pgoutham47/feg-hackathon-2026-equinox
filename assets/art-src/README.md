# Drop game thumbnails here

Any `.jpg` / `.jpeg` / `.png` / `.webp`. Then run:

    node scripts/build-art.mjs

Two ways a file gets used:

- **Name it after a game's slug** — `sizzling-hot-deluxe.jpg` — and it is pinned
  to that game. Slugs are in `public/catalogue.json`.
- **Name it anything else** and it joins the pool, dealt out to whichever games
  are left in catalogue order and repeated until all thirty have one.

Leave the folder empty and the build falls back to generated artwork, so the
lobby always has a full set of tiles.

These are vendor thumbnails: ship only art the operator has the right to show.
