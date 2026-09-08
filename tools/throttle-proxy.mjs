/**
 * Dev-only bandwidth-limited proxy, for measuring what the lobby actually costs
 * on a slow link. Not part of the app.
 *
 *   MBPS=8 LATENCY_MS=80 node tools/throttle-proxy.mjs
 *   → http://localhost:3200 proxies http://localhost:3000
 *
 * The token bucket is GLOBAL, not per connection: a prefetch and a game load
 * have to share one pipe, which is the only way contention between them can
 * show up at all.
 */
import http from 'node:http';
import { once } from 'node:events';

/**
 * Listens on the port the browser already uses and forwards to the real server
 * behind it. Keeping the origin identical matters: a service worker is scoped to
 * its origin, so proxying on a different port would test a different app.
 */
const PORT = Number(process.env.PORT ?? 3000);
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT ?? 3001);
const MBPS = Number(process.env.MBPS ?? 8);
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 80);
/**
 * NO_HTTP_CACHE=1 rewrites Cache-Control to no-store. The bundle is served
 * immutable, so without this the browser's own HTTP cache answers on the second
 * run and every measurement after the first is a fiction. Cache Storage still
 * works — the worker puts responses in explicitly, whatever the header says.
 */
const NO_HTTP_CACHE = process.env.NO_HTTP_CACHE === '1';

const BYTES_PER_SEC = (MBPS * 1_000_000) / 8;
const TICK_MS = 20;
const CHUNK = 8 * 1024;

let tokens = 0;
const waiting = [];

setInterval(() => {
  // Cap the burst at a quarter second so a quiet period cannot bank enough
  // credit to deliver a whole file instantly.
  tokens = Math.min(tokens + (BYTES_PER_SEC * TICK_MS) / 1000, BYTES_PER_SEC / 4);
  while (waiting.length && tokens >= waiting[0].size) {
    tokens -= waiting[0].size;
    waiting.shift().go();
  }
}, TICK_MS).unref();

/** Wait until `size` bytes of budget are available. FIFO, so nothing starves. */
function reserve(size) {
  if (!waiting.length && tokens >= size) {
    tokens -= size;
    return Promise.resolve();
  }
  return new Promise((go) => waiting.push({ size, go }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  if (process.env.DEBUG === '1') {
    console.log('REQ', req.method, req.url, '| dest=' + (req.headers['sec-fetch-dest'] ?? '-'));
  }
  const upstream = http.request(
    { host: 'localhost', port: UPSTREAM_PORT, path: req.url, method: req.method, headers: req.headers },
    async (up) => {
      await sleep(LATENCY_MS / 2); // one way
      const headers = { ...up.headers };
      if (NO_HTTP_CACHE) headers['cache-control'] = 'no-store';
      res.writeHead(up.statusCode ?? 502, headers);
      try {
        for await (const chunk of up) {
          for (let i = 0; i < chunk.length; i += CHUNK) {
            const piece = chunk.subarray(i, i + CHUNK);
            await reserve(piece.length);
            if (!res.write(piece)) await once(res, 'drain');
          }
        }
      } catch {
        // client went away mid-response
      }
      res.end();
    },
  );
  upstream.on('error', () => res.destroy());
  sleep(LATENCY_MS / 2).then(() => req.pipe(upstream)); // the other way
});

server.listen(PORT, () => {
  console.log(`throttle-proxy :${PORT} -> :${UPSTREAM_PORT}  ${MBPS} Mbps, ${LATENCY_MS}ms RTT`);
});
