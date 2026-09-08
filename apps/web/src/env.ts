import { z } from 'zod';

/**
 * Fail the build, not the first request. Next inlines NEXT_PUBLIC_* at build
 * time, so these must be referenced literally — destructuring process.env breaks
 * the inlining.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  /**
   * A same-origin PATH (`/cdn`), never another origin.
   *
   * A service worker only controls clients on its own origin. Point this at a
   * different host and the game iframe becomes a frame the worker cannot see:
   * it re-downloads everything the prefetch just cached, and the whole
   * optimisation silently buys nothing. `next.config.ts` rewrites `/cdn/*` to
   * the real storage origin, so the bytes still come from the CDN.
   */
  NEXT_PUBLIC_CDN_BASE_URL: z
    .string()
    .startsWith('/', 'must be a same-origin path such as /cdn — see next.config.ts')
    .default('/cdn'),
  NEXT_PUBLIC_PREFETCH_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  NEXT_PUBLIC_PREFETCH_BUDGET_BYTES: z.coerce.number().int().positive().default(6_815_744),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_CDN_BASE_URL: process.env.NEXT_PUBLIC_CDN_BASE_URL,
  NEXT_PUBLIC_PREFETCH_ENABLED: process.env.NEXT_PUBLIC_PREFETCH_ENABLED,
  NEXT_PUBLIC_PREFETCH_BUDGET_BYTES: process.env.NEXT_PUBLIC_PREFETCH_BUDGET_BYTES,
});

/** Server-only. Importing this from a client component is a build error. */
export function serverEnv() {
  return z
    .object({ API_BASE_URL: z.string().url() })
    .parse({ API_BASE_URL: process.env.API_BASE_URL });
}
