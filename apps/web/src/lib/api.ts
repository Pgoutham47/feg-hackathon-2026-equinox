import 'server-only';

import { createClient } from '@eog/api-client';

import { serverEnv } from '@/env';

/**
 * Server-side client used by RSCs. The lobby is rendered on the server so the
 * catalogue is in the HTML — the tiles must not wait on a client fetch, or the
 * prefetch cannot start until after hydration.
 */
export const api = createClient({ baseUrl: serverEnv().API_BASE_URL });

export const CATALOGUE_REVALIDATE_SECONDS = 60;
