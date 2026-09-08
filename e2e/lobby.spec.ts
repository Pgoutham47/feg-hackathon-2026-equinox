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

test('the worker caches the Play-screen slice and the lobby says so', async ({ page, baseURL }) => {
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state ?? null),
    )
    .toBe('activated');

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(new URL('/', baseURL).href);

  // 27 files plus the completion marker.
  await expect
    .poll(
      () => page.evaluate(async (c) => (await (await caches.open(c)).keys()).length, CACHE),
      { timeout: 60_000, message: 'expected the whole slice in Cache Storage' },
    )
    .toBe(28);

  // One bundle serves every game, so the whole catalogue goes ready at once.
  await expect(page.getByText(/30 games ready/)).toBeVisible({ timeout: 30_000 });
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

test('every game boots the same bundle', async ({ page }) => {
  const src = async (slug: string) => {
    await page.goto(`/game/${slug}`);
    return page.locator('iframe').getAttribute('src');
  };
  expect(await src('king-rhino')).toBe(await src('multiplay-81'));
});
