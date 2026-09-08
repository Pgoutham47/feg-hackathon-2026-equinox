/**
 * Phase 1 verification, in a real Chromium.
 *
 * Asserts, end to end:
 *   1. the worker registers from the site root and claims the page
 *   2. it precaches every file in `toPlay`
 *   3. a subsequent load of the certified bundle is served entirely from Cache
 *      Storage - zero bytes over the network for the toPlay set
 *   4. the Play button actually appears (PRIMARY finished, not just SPLASH)
 *
 * Run:  node tools/verify_phase1.mjs [--port 8150]
 */
import { readFileSync } from 'node:fs';
import { chromium } from './playwright.mjs';

const PORT = Number(process.argv.includes('--port')
  ? process.argv[process.argv.indexOf('--port') + 1]
  : 8150);
const BASE = `http://localhost:${PORT}`;

const ok = (c, m) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${m}`); if (!c) process.exitCode = 1; };
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log('\n1. worker registers and claims the page');
await page.goto(BASE + '/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__eog && window.__eog.slices(), null, { timeout: 15000 });
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
const claimed = await page.evaluate(() => window.__eog.ready());
ok(claimed, 'service worker active and controlling');

const slices = await page.evaluate(() => window.__eog.slices());
console.log(`       toSplash ${slices.toSplash.length} (${mb(slices.bytes.toSplash)})`);
console.log(`       toPlay   ${slices.toPlay.length} (${mb(slices.bytes.toPlay)})`);
console.log(`       afterPlay${slices.afterPlay.length} (${mb(slices.bytes.afterPlay)})`);

console.log('\n2. precache toPlay');
const t0 = Date.now();
const result = await page.evaluate(
  (files) =>
    new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('message', function h(e) {
        if (e.data?.type === 'sw:ready' && e.data.key === 'toPlay') {
          navigator.serviceWorker.removeEventListener('message', h);
          resolve(e.data);
        }
      });
      window.__eog.post({ type: 'sw:prefetch', kind: 'play', key: 'toPlay', files });
    }),
  slices.toPlay,
);
console.log(`       ${result.total} files, ${mb(result.bytes)} downloaded in ${Date.now() - t0} ms`);
ok(result.complete, 'every toPlay file is resident in Cache Storage');

console.log('\n3. load the bundle - expect zero network requests for toPlay');
// The server's access log is the only trustworthy counter here.
// `PerformanceResourceTiming.transferSize` reads 0 both for a response the
// worker served from cache and for one it fetched over the network on the
// page's behalf, and Playwright's page-level `response` event does not see
// requests the worker itself made. The server sees all of them.
const ACCESS_LOG = new URL('./out/requests.log', import.meta.url);
const logLines = () => {
  try {
    return readFileSync(ACCESS_LOG, 'utf8').split('\n').filter(Boolean);
  } catch {
    return null;
  }
};
const before = logLines();
if (before === null) {
  console.log('       (server started without --access-log; skipping the server-side check)');
}

const gamePage = await ctx.newPage();
await gamePage.goto(BASE + '/bundle/index.html', { waitUntil: 'load' });

// The Play button is created in onPrimaryLoaded(). Wait for the whole PRIMARY
// set to have arrived, then confirm it visually rather than trusting a timer.
await gamePage.waitForFunction(
  () => {
    const seen = new Set(performance.getEntriesByType('resource').map((e) => e.name));
    return ['symbols.webp', 'reels_frame.json', 'king_character.png', 'BG_king.png']
      .every((n) => [...seen].some((u) => u.includes(n)));
  },
  null,
  { timeout: 60000 },
);

const timing = await gamePage.evaluate(() => {
  const r = performance.getEntriesByType('resource');
  const bundle = r.filter((e) => e.name.includes('/bundle/'));
  return {
    count: bundle.length,
    network: bundle.reduce((a, e) => a + (e.transferSize || 0), 0),
    decoded: bundle.reduce((a, e) => a + (e.decodedBodySize || 0), 0),
    fromCache: bundle.filter((e) => e.transferSize === 0 && e.decodedBodySize > 0).length,
    lastEnd: Math.round(Math.max(...bundle.map((e) => e.responseEnd))),
  };
});
console.log(`       ${timing.count} bundle resources requested by the page`);
console.log(`       decoded ${mb(timing.decoded)} · last resource at ${timing.lastEnd} ms`);

if (before !== null) {
  const after = logLines();
  const during = after.slice(before.length).map((p) => p.split('/bundle/')[1]).filter(Boolean);
  const wanted = new Set(slices.toPlay.map((p) => p.split('?')[0]));
  // `book.png` 404s by design and is deliberately never cached, so it is the
  // one request that legitimately hits the network on every single load.
  const leaked = during.filter((p) => wanted.has(p.split('?')[0]));
  console.log(`       server saw ${during.length} bundle requests during the load`);
  if (during.length) console.log('       ' + [...new Set(during)].slice(0, 6).join('\n       '));
  ok(leaked.length === 0, `no toPlay file crossed the network (${leaked.length} did)`);
}

console.log('\n4. the Play button is actually on screen');
// Not "the canvas exists" and not "the files arrived" - the bundle exposes its
// Pixi app, and the Play button is a display object named `startBtn`. Waiting
// for that to become visible is the only check that proves PRIMARY finished
// rather than SPLASH, which is the whole point of the new slice.
// Polled with evaluate() rather than waitForFunction(): waitForFunction runs in
// an isolated world, which shares the DOM but not the page's own JS globals, so
// `window.__PIXI_APP__` is invisible from there.
let btnVisible = false;
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  btnVisible = await gamePage.evaluate(() => {
    const app = window.__PIXI_APP__;
    if (!app || !app.stage) return false;
    // There is more than one object called `startBtn`: the splash one, and a
    // second inside the hidden free-spins promo popup. Collect them all and ask
    // whether *any* is on screen, rather than trusting the first hit.
    const found = [];
    const walk = (n, d) => {
      if (!n || d > 60) return;
      if ((n.label ?? n.name) === 'startBtn') found.push(n);
      for (const c of n.children || []) walk(c, d + 1);
    };
    walk(app.stage, 0);
    return found.some((node) => {
      for (let m = node; m; m = m.parent) if (m.visible === false || m.alpha === 0) return false;
      return true;
    });
  });
  if (btnVisible) break;
  await gamePage.waitForTimeout(100);
}
const shot = 'tools/out/phase1-play-screen.png';
await gamePage.screenshot({ path: shot });
ok(btnVisible, 'startBtn ("Play game") is visible in the scene graph');
console.log(`       screenshot: ${shot}`);

await browser.close();
console.log(process.exitCode ? '\nFAILED\n' : '\nAll phase 1 checks passed\n');
