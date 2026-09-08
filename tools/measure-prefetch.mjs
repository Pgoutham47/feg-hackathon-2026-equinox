/**
 * Dev-only. Answers one question: does the prefetch get in the way of a game
 * the player opens while it is still running?
 *
 *   node tools/throttle-proxy.mjs        # in another shell, with next on :3001
 *   node tools/measure-prefetch.mjs
 *
 * Each scenario gets a fresh browser context, so no service worker or cache
 * survives from the previous one — a stale worker silently invalidates
 * everything here.
 *
 * Timings come from responseEnd, never from transferSize: once a service worker
 * serves a response the browser reports transferSize as 0 whether or not the
 * worker actually went to the network, so bytes are only meaningful in the
 * control, which has no worker at all.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const CACHE = 'eog-assets-v1';
const SETTLE_MS = 20_000;

async function timeToPlayScreen(page) {
  const frame = page.frames().find((f) => f.url().includes('/cdn/'));
  if (!frame) return { error: 'no game iframe' };
  return frame.evaluate(async () => {
    const cat = await fetch('/catalogue.json').then((r) => r.json());
    const want = new Set(cat.slice.map((a) => a.path));
    const res = performance
      .getEntriesByType('resource')
      .filter((r) => want.has(decodeURIComponent(new URL(r.name).pathname.split('/').slice(3).join('/').split('?')[0])));
    return {
      sliceFiles: res.length,
      msToPlayScreen: Math.round(Math.max(...res.map((r) => r.responseEnd))),
      mbFromNetwork: +(res.reduce((n, r) => n + (r.transferSize || 0), 0) / 1e6).toFixed(2),
    };
  });
}

const cacheState = (page) =>
  page.evaluate(async (c) => {
    const keys = await (await caches.open(c)).keys();
    return { files: keys.length, ready: keys.some((k) => new URL(k.url).pathname === '/__eog-ready') };
  }, CACHE);

async function scenario(browser, run) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    return await run(page);
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch();
const out = {};

// A — control: open a game with nothing cached and no worker in the way.
out.A_noPrefetch = await scenario(browser, async (page) => {
  await page.goto(`${BASE}/game/king-rhino`, { waitUntil: 'load' });
  await page.waitForTimeout(SETTLE_MS);
  return timeToPlayScreen(page);
});

// B — the question: the prefetch is still downloading when the player taps.
out.B_duringPrefetch = await scenario(browser, async (page) => {
  await page.goto(BASE, { waitUntil: 'load' });
  let state = { files: 0 };
  for (let i = 0; i < 120 && state.files < 2 && !state.ready; i++) {
    await page.waitForTimeout(250);
    state = await cacheState(page).catch(() => state);
  }
  await page.goto(`${BASE}/game/king-rhino`, { waitUntil: 'load' });
  await page.waitForTimeout(SETTLE_MS);
  return { filesCachedAtHandoff: state.files, ...(await timeToPlayScreen(page)) };
});

// C — the payoff: the prefetch finished before the player opened anything.
out.C_afterPrefetch = await scenario(browser, async (page) => {
  const started = Date.now();
  await page.goto(BASE, { waitUntil: 'load' });
  let state = { ready: false };
  for (let i = 0; i < 240 && !state.ready; i++) {
    await page.waitForTimeout(500);
    state = await cacheState(page).catch(() => state);
  }
  const prefetchMs = Date.now() - started;
  await page.goto(`${BASE}/game/king-rhino`, { waitUntil: 'load' });
  await page.waitForTimeout(SETTLE_MS);
  return { prefetchCompletedMs: prefetchMs, prefetchReached: state.ready, ...(await timeToPlayScreen(page)) };
});

await browser.close();
console.log(JSON.stringify(out, null, 2));
