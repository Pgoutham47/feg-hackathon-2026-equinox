/**
 * Typed API client.
 *
 * `schema.d.ts` is generated from the live FastAPI OpenAPI document by
 * `pnpm codegen` and is git-ignored — CI regenerates it and fails the build if
 * it differs from what the backend serves, so the contract cannot drift.
 */
import createOpenApiClient from 'openapi-fetch';

import type { components, paths } from './schema';

export type GameSummary = components['schemas']['GameSummary'];
export type GamePage = components['schemas']['Page_GameSummary_'];
export type SliceManifest = components['schemas']['SliceManifest'];
export type PrefetchPlan = components['schemas']['PrefetchPlan'];
export type ErrorBody = components['schemas']['ErrorBody'];
/** Manifest tiers only — see LoadTier in @eog/prefetch-core for the load-time counterpart. */
export type ManifestTier = SliceManifest['tier'];

/**
 * Only the request options that make sense for a GET, plus Next's fetch
 * extensions. Spreading a full RequestInit here would collide with openapi-fetch's
 * own `body`/`params` handling.
 */
export type RequestOptions = {
  signal?: AbortSignal;
  cache?: RequestCache;
  headers?: Record<string, string>;
  next?: { revalidate?: number | false; tags?: string[] };
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody,
  ) {
    super(body.message);
    this.name = 'ApiError';
  }
}

type Result<T> = { data?: T; error?: unknown; response: Response };

async function unwrap<T>(pending: Promise<Result<T>>): Promise<T> {
  const { data, error, response } = await pending;
  if (error !== undefined || data === undefined) {
    throw new ApiError(response.status, error as ErrorBody);
  }
  return data;
}

export function createClient({ baseUrl }: { baseUrl: string }) {
  const http = createOpenApiClient<paths>({ baseUrl });

  return {
    listGames: (
      query: { provider?: string; limit?: number; offset?: number } = {},
      init: RequestOptions = {},
    ): Promise<GamePage> => unwrap(http.GET('/v1/games', { params: { query }, ...init })),

    getManifest: (
      { slug, tier = 'slice' }: { slug: string; tier?: ManifestTier },
      init: RequestOptions = {},
    ): Promise<SliceManifest> =>
      unwrap(
        http.GET('/v1/games/{slug}/manifest', {
          params: { path: { slug }, query: { tier } },
          ...init,
        }),
      ),

    getPrefetchPlan: (
      query: { deviceKey?: string; budgetBytes?: number; resident?: string[] } = {},
      init: RequestOptions = {},
    ): Promise<PrefetchPlan> =>
      unwrap(http.GET('/v1/prefetch/plan', { params: { query }, ...init })),
  };
}

export type ApiClient = ReturnType<typeof createClient>;
