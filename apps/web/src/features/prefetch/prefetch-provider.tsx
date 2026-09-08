'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { PrefetchPlan } from '@eog/prefetch-core';
import { getDeviceKey, parseReadySet, SW_MESSAGES } from '@eog/prefetch-core';

import { publicEnv } from '@/env';

/** Not in lib.dom yet; we only read the two fields that gate prefetching. */
type NetworkInformation = { saveData?: boolean; effectiveType?: string };

type PrefetchApi = {
  /** Ask the worker to cache a game's slice now. Idempotent and cheap to spam. */
  request: (slug: string, reason: 'dwell' | 'pointerdown' | 'policy') => void;
  ready: Set<string>;
  enabled: boolean;
};

const Ctx = createContext<PrefetchApi>({ request: () => {}, ready: new Set(), enabled: false });

export function usePrefetch(): PrefetchApi {
  return useContext(Ctx);
}

/**
 * Never prefetch on a metered or slow link. On 2G the prefetch competes with the
 * load it is meant to help, and on Save-Data the player has told us not to.
 */
function shouldPrefetch(): boolean {
  if (!publicEnv.NEXT_PUBLIC_PREFETCH_ENABLED) return false;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (conn?.saveData) return false;
  return !(conn?.effectiveType && /^(slow-)?2g$/.test(conn.effectiveType));
}

export function PrefetchProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState<Set<string>>(new Set());
  const workerRef = useRef<ServiceWorker | null>(null);
  const enabled = publicEnv.NEXT_PUBLIC_PREFETCH_ENABLED;

  /**
   * Resolve the worker at call time rather than trusting a ref captured during
   * registration: a tile can be pressed before the plan fetch has resolved, and
   * `controller` is live as soon as the worker claims the page.
   */
  const post = useCallback((message: Record<string, unknown>) => {
    const worker = navigator.serviceWorker?.controller ?? workerRef.current;
    worker?.postMessage(message);
  }, []);

  useEffect(() => {
    if (!shouldPrefetch()) return;
    let cancelled = false;

    const onMessage = (event: MessageEvent) => {
      const slugs = parseReadySet(event.data);
      if (slugs) setReady(new Set(slugs));
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    void (async () => {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      if (cancelled) return;
      workerRef.current = navigator.serviceWorker.controller ?? reg.active;

      // Hand over the API origin first. Until the worker has it, it would resolve
      // manifest URLs against the lobby origin, which serves no API.
      post({
        type: SW_MESSAGES.CONFIGURE,
        apiBaseUrl: publicEnv.NEXT_PUBLIC_API_BASE_URL,
        cdnBasePath: publicEnv.NEXT_PUBLIC_CDN_BASE_URL,
      });

      const params = new URLSearchParams({
        deviceKey: getDeviceKey(),
        budgetBytes: String(publicEnv.NEXT_PUBLIC_PREFETCH_BUDGET_BYTES),
      });
      const response = await fetch(
        `${publicEnv.NEXT_PUBLIC_API_BASE_URL}/v1/prefetch/plan?${params}`,
      );
      if (!response.ok || cancelled) return;
      const plan = (await response.json()) as PrefetchPlan;
      post({
        type: SW_MESSAGES.APPLY_PLAN,
        plan,
        apiBaseUrl: publicEnv.NEXT_PUBLIC_API_BASE_URL,
      });
    })().catch(() => {
      // Prefetch is an optimisation; a failure here just means normal load times.
    });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [post]);

  const value = useMemo<PrefetchApi>(
    () => ({
      enabled,
      ready,
      request: (slug, reason) => {
        post({
          type: SW_MESSAGES.PREFETCH_GAME,
          slug,
          reason,
          apiBaseUrl: publicEnv.NEXT_PUBLIC_API_BASE_URL,
        });
      },
    }),
    [enabled, post, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
