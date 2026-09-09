# Screenshots

Drop the submission screenshots here as `NN-description.png`, numbered in the
order they appear in the demo flow.

Worth capturing:

0. `compare-load-time.png` — **the headline image, referenced from the README.**
   The in-page Compare panel after a run: without-prefetch against with-prefetch,
   with both the seconds and the file counts visible.
1. `01-lobby.png` — the lobby, catalogue-ready state visible.
2. `02-prefetch-network.png` — DevTools Network during the slice pass, showing
   the low-priority `/cdn/{version}/…` requests.
3. `03-service-worker.png` — DevTools → Application → Service Workers, active.
4. `04-cold-open.png` — a game opened with no prefetch, for the baseline.
5. `05-warm-open.png` — the same game opened warm.
6. `06-cache-hits.png` — Network showing bundle requests transferring nothing.
7. `07-recently-played.png` — the returning-player row above the catalogue.
8. `08-compare-panel.png` — the in-page Compare panel result.

Screenshots must contain no credentials, no real player data and no
confidential challenge information.
