import isMobile from 'ismobilejs';

import { type AssetTier } from '@/lib/catalogue';

/**
 * Mirrors the bundle's own tier choice.
 *
 * The engine sets `assetResolution` from `isMobile.phone` / `isMobile.tablet`
 * — tablets and desktops take `@1x`, phones `@0.5x`. This uses the same
 * library rather than a lookalike user-agent test, because the only thing that
 * matters is that the two agree: a prefetch of the tier the game does not ask
 * for is worse than no prefetch at all, since it spends the player's bandwidth
 * on bytes that are never read.
 */
export function detectTier(): AssetTier {
  const device = isMobile(window.navigator);
  return device.phone && !device.tablet ? '@0.5x' : '@1x';
}
