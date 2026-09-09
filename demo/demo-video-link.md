# Demo

## Video

<!-- TODO before submission: paste the link and make sure reviewer access works. -->

| | |
|---|---|
| **Link** | `<DEMO VIDEO URL>` |
| **Access** | `<public / link-restricted / reviewer accounts>` |
| **Length** | `<mm:ss>` |
| **Recorded on** | `<date, build / commit hash>` |

## What the video shows

The demo flow, in the order it is worth filming:

1. **The lobby loads.** Tiles are in the server-rendered HTML — no spinner, no
   client-side fetch for the catalogue.
2. **The prefetch starts on its own.** DevTools → Application → Service Workers
   shows `/sw.js` active; the Network panel shows the 27 slice files arriving at
   low priority. The lobby says when the catalogue is ready.
3. **Open a game while the prefetch is still running.** It halves the wait,
   because the prefetch is already pulling the exact files the game asks for.
4. **Open a game after the prefetch has finished.** The Play screen in ~250 ms
   on an 8 Mbps link, against ~5.4 s cold.
5. **Open two different games, then reload the lobby.** The recently-played row
   appears and the third pass starts: the remaining 38.8 MB, for a player who
   has shown they come back.
6. **Open a game again.** DevTools shows 141 bundle requests and 140 of them
   transferring nothing.
7. **The Compare panel** runs the cold baseline against the warmed load
   side by side, in the page.

## Screenshots

`screenshots/` — see the README there for what to capture.

## Presentation

`presentation/` — slide deck, if one is submitted.
