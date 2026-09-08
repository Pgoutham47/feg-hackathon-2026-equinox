'use client';

import { useCallback, useRef } from 'react';

import { usePrefetch } from './prefetch-provider';

const DWELL_MS = 500;

/**
 * The three triggers measured in the prototype, in order of how much time each
 * one buys:
 *   1. lobby open   — policy-ranked, handled by PrefetchProvider
 *   2. tile dwell   — 500 ms of hover/scroll-rest, the cheapest real signal
 *   3. pointerdown  — fires ~80-120 ms before the tap registers as a click
 */
export function useTileTriggers(slug: string) {
  const { request } = usePrefetch();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  return {
    onPointerEnter: useCallback(() => {
      clear();
      timer.current = setTimeout(() => request(slug, 'dwell'), DWELL_MS);
    }, [clear, request, slug]),
    onPointerLeave: clear,
    onPointerDown: useCallback(() => {
      clear();
      request(slug, 'pointerdown');
    }, [clear, request, slug]),
  };
}
