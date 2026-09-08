import { expect, test } from '@playwright/test';

test('lobby renders the catalogue server-side', async ({ page }) => {
  // JS disabled: whatever renders here came from the server. The tiles must be
  // present before hydration, or the prefetch cannot start until the client
  // bundle is parsed — which is most of the win.
  await page.goto('/');
  const tiles = page.locator('a[href^="/game/"]');
  await expect(tiles).toHaveCount(30);
  await expect(tiles.first()).toContainText('Multiplay 81');
});

test('service worker registers and takes control', async ({ page, baseURL }) => {
  await page.goto('/');
  // `ready` resolves as soon as there is an active worker, which can still be
  // 'activating' for a tick — poll rather than racing it.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        return reg.active?.state ?? null;
      }),
    )
    .toBe('activated');

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(new URL('/', baseURL).href);
});

test('worker caches a game slice on the pointerdown trigger', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);

  // pointerdown fires ~80-120ms before the tap registers as a click; that head
  // start is the cheapest of the three triggers.
  await page.locator('a[href="/game/king-rhino"]').dispatchEvent('pointerdown');

  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const names = await caches.keys();
          const cache = names.length ? await caches.open(names[0]!) : null;
          const keys = cache ? await cache.keys() : [];
          return keys.filter((r) => r.url.includes('king-rhino')).length;
        }),
      { timeout: 15_000, message: 'expected king-rhino slice assets in Cache Storage' },
    )
    .toBeGreaterThan(0);
});

test('the game frame is same-origin and controlled by the worker', async ({ page, baseURL }) => {
  // The load-bearing invariant of the whole feature. A service worker only
  // controls clients on its own origin, so serving the bundle from a CDN host
  // makes the game an iframe the worker cannot see: it re-downloads every byte
  // the prefetch just cached, silently, with nothing failing anywhere.
  await page.goto('/game/king-rhino');
  await page.waitForFunction(() => !!document.querySelector('iframe')?.contentWindow);

  const frame = page.frames().find((f) => f.url().includes('/cdn/'));
  expect(frame, 'game iframe should be serving the bundle from /cdn/').toBeTruthy();
  expect(new URL(frame!.url()).origin).toBe(new URL(baseURL!).origin);

  const inside = await frame!.evaluate(async () => ({
    controlled: !!navigator.serviceWorker.controller,
    caches: await caches.keys(),
  }));
  expect(inside.controlled, 'worker must control the game frame').toBe(true);
  expect(inside.caches).toContain('eog-assets-v1');
});

test('a shared asset cached under one game serves another game', async ({ page }) => {
  // Each game requests every file under its own /{slug}/{version}/ prefix, but
  // shared assets are cached once under /_shared/. Without the alias in the
  // worker, game two re-downloads the whole engine game one already paid for.
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.locator('a[href="/game/king-rhino"]').dispatchEvent('pointerdown');

  const readSharedUrl = () =>
    page.evaluate(async () => {
      const cache = await caches.open('eog-assets-v1');
      const hit = (await cache.keys()).find((r) => r.url.includes('/_shared/'));
      return hit?.url ?? null;
    });

  await expect
    .poll(readSharedUrl, { timeout: 20_000, message: 'expected a _shared asset in Cache Storage' })
    .not.toBeNull();
  const sharedUrl = (await readSharedUrl())!;

  // Ask for the same asset under a different game's prefix: same bytes, an
  // address the cache has never seen.
  const tail = sharedUrl.split('/_shared/')[1]!.split('/').slice(1).join('/');
  const status = await page.evaluate(
    (t) => fetch(`/cdn/some-other-game/deadbeefdeadbeef/${t}`).then((r) => r.status),
    tail,
  );
  expect(status).toBe(200);
});
