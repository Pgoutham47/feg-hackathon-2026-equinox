import { expect, test } from '@playwright/test';

const CACHE = 'eog-assets-v1';

test('the lobby renders the catalogue server-side', async ({ page }) => {
  // Whatever renders here came from the server. The tiles must be present
  // before hydration, or the prefetch cannot start until the client bundle is
  // parsed — which is most of the win.
  await page.goto('/');
  const tiles = page.locator('a[href^="/game/"]');
  await expect(tiles).toHaveCount(30);
  await expect(tiles.first()).toContainText('Multiplay 81');
});

test('the worker registers, takes control and caches a slice', async ({ page, baseURL }) => {
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state ?? null),
    )
    .toBe('activated');

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(new URL('/', baseURL).href);

  // pointerdown fires ~80-120ms before the tap registers as a click; that head
  // start is the cheapest of the two triggers.
  await page.locator('a[href="/game/king-rhino"]').dispatchEvent('pointerdown');

  await expect
    .poll(
      () =>
        page.evaluate(async (cacheName) => {
          const keys = await (await caches.open(cacheName)).keys();
          return keys.filter((r) => r.url.includes('king-rhino')).length;
        }, CACHE),
      { timeout: 30_000, message: 'expected king-rhino slice assets in Cache Storage' },
    )
    .toBeGreaterThan(0);

  // The badge is the player-visible proof that the slice is resident.
  await expect(page.locator('a[href="/game/king-rhino"]')).toContainText('READY', {
    timeout: 30_000,
  });
});

test('the game frame is same-origin and controlled by the worker', async ({ page, baseURL }) => {
  // The load-bearing invariant of the whole feature. A service worker only
  // controls clients on its own origin, so serving the bundle from a CDN host
  // makes the game an iframe the worker cannot see: it re-downloads every byte
  // the prefetch just cached, silently, with nothing failing anywhere.
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto('/game/king-rhino');
  await page.waitForFunction(() => !!document.querySelector('iframe')?.contentWindow);

  const frame = page.frames().find((f) => f.url().includes('/cdn/'));
  expect(frame, 'the game iframe should be serving the bundle from /cdn/').toBeTruthy();
  expect(new URL(frame!.url()).origin).toBe(new URL(baseURL!).origin);
  expect(
    await frame!.evaluate(() => !!navigator.serviceWorker.controller),
    'the worker must control the game frame',
  ).toBe(true);
});

test('a shared asset cached under one game serves another game', async ({ page }) => {
  // Without the alias in the worker, game two re-downloads the whole engine
  // that game one already paid for.
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.locator('a[href="/game/king-rhino"]').dispatchEvent('pointerdown');

  const sharedUrl = async () =>
    page.evaluate(async (cacheName) => {
      const keys = await (await caches.open(cacheName)).keys();
      return keys.find((r) => r.url.includes('/_shared/'))?.url ?? null;
    }, CACHE);

  await expect
    .poll(sharedUrl, { timeout: 30_000, message: 'expected a _shared asset in Cache Storage' })
    .not.toBeNull();

  // Ask for the same asset under a different game's prefix: same bytes, an
  // address the cache has never seen.
  const tail = (await sharedUrl())!.split('/_shared/')[1]!.split('/').slice(1).join('/');
  const status = await page.evaluate(
    (t) => fetch(`/cdn/some-other-game/deadbeefdeadbeef/${t}`).then((r) => r.status),
    tail,
  );
  expect(status).toBe(200);
});
