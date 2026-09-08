/**
 * Calibration probe: how well does "all toPlay files complete" line up with the
 * moment the Play button is actually on screen?
 *
 * The bundle's postMessage to the parent is stubbed, so readiness has to be
 * inferred from outside. Two candidate signals, sampled every 50 ms:
 *
 *   A. resource timing - the last file of the toPlay set finishes
 *   B. the scene graph  - the Pixi object named `startBtn` becomes visible
 *
 * B is the truth (it is the button the player taps) but it depends on the
 * bundle happening to expose `__PIXI_APP__`. A works everywhere. This measures
 * the gap between them so the wrapper can use A and state the error honestly.
 *
 * Run:  node tools/probe_ready.mjs [port] [--cached]
 */
import { readFileSync } from 'node:fs';
import { chromium } from './playwright.mjs';

const PORT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 8151;
const BASE = `http://localhost:${PORT}`;
const CACHED = process.argv.includes('--cached');

const slices = JSON.parse(readFileSync(new URL('../site/slices.json', import.meta.url)));

/** Runs inside the page: is the Play button up? */
const START_BTN_PROBE = () => {
  const app = window.__PIXI_APP__;
  if (!app || !app.stage) return null;
  let found = null;
  const walk = (node, depth) => {
    if (!node || depth > 40 || found) return;
    if (node.label === 'startBtn' || node.name === 'startBtn') {
      found = node;
      return;
    }
    for (const child of node.children || []) walk(child, depth + 1);
  };
  walk(app.stage, 0);
  if (!found) return null;
  // A Pixi button that exists but is not yet rendered is not a tappable button.
  let visible = found.visible !== false;
  let n = found;
  while (n && visible) {
    if (n.visible === false || n.alpha === 0) visible = false;
    n = n.parent;
  }
  return { present: true, visible };
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

if (CACHED) {
  // Warm Cache Storage first, so this run measures the cached path.
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  await page.evaluate(
    (files) =>
      new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('message', function h(e) {
          if (e.data?.type === 'sw:ready') {
            navigator.serviceWorker.removeEventListener('message', h);
            resolve();
          }
        });
        window.__eog.post({ type: 'sw:prefetch', kind: 'play', key: 'toPlay', files });
      }),
    slices.toPlay,
  );
}

const gamePage = await ctx.newPage();
await gamePage.goto(BASE + '/bundle/index.html', { waitUntil: 'commit' });

let btnAt = null;
let playAt = null;
const t0 = Date.now();
for (let i = 0; i < 400; i++) {
  const s = await gamePage.evaluate(
    ({ probeSrc, want }) => {
      // eslint-disable-next-line no-eval
      const probe = eval(`(${probeSrc})`);
      const btn = probe();
      const done = new Set(
        performance
          .getEntriesByType('resource')
          .filter((e) => e.responseEnd > 0)
          .map((e) => new URL(e.name).pathname.split('/bundle/')[1] || ''),
      );
      const missing = want.filter((w) => !done.has(w));
      const last = performance.getEntriesByType('resource');
      return {
        t: Math.round(performance.now()),
        btn,
        missingCount: missing.length,
        missingSample: missing.slice(0, 3),
        lastEnd: last.length ? Math.round(Math.max(...last.map((e) => e.responseEnd))) : 0,
      };
    },
    {
      probeSrc: START_BTN_PROBE.toString(),
      // index.html is the navigation, not a resource, so drop it from the wait set.
      want: slices.toPlay.filter((p) => p !== 'index.html').map((p) => p.split('?')[0]),
    },
  );

  if (playAt === null && s.missingCount === 0) playAt = { t: s.t, lastEnd: s.lastEnd };
  if (btnAt === null && s.btn && s.btn.visible) btnAt = { t: s.t };
  if (playAt && btnAt) break;
  if (Date.now() - t0 > 90000) break;
  await gamePage.waitForTimeout(50);
}

console.log(`\nmode: ${CACHED ? 'cached (warm)' : 'cold'}  @ ${BASE}`);
console.log(`  A. all toPlay files complete : ${playAt ? playAt.lastEnd + ' ms (resource timing)' : 'never'}`);
console.log(`  B. startBtn visible          : ${btnAt ? '~' + btnAt.t + ' ms (polled at 50 ms)' : 'never'}`);
if (playAt && btnAt) {
  console.log(`  gap (B - A)                  : ${btnAt.t - playAt.lastEnd} ms of decode/scene setup`);
}
await gamePage.screenshot({ path: `tools/out/probe-${CACHED ? 'warm' : 'cold'}.png` });
await browser.close();
