import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTileTriggers } from './use-tile-triggers';

const request = vi.fn<(slug: string, reason: string) => void>();

vi.mock('./prefetch-provider', () => ({
  usePrefetch: () => ({ request, ready: new Set<string>(), enabled: true }),
}));

/**
 * The dwell timer is the one piece of prefetch logic with real timing risk: too
 * short and every scroll-past spends the player's bytes, too long and the tap
 * beats it to the navigation.
 */
describe('useTileTriggers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    request.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('does not fire dwell before 500ms', () => {
    const { result } = renderHook(() => useTileTriggers('king-rhino'));
    result.current.onPointerEnter();

    vi.advanceTimersByTime(499);
    expect(request).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('king-rhino', 'dwell');
  });

  it('cancels dwell when the pointer leaves early', () => {
    const { result } = renderHook(() => useTileTriggers('king-rhino'));
    result.current.onPointerEnter();
    vi.advanceTimersByTime(300);
    result.current.onPointerLeave();
    vi.advanceTimersByTime(1_000);

    expect(request).not.toHaveBeenCalled();
  });

  it('fires immediately on pointerdown and cancels the pending dwell', () => {
    const { result } = renderHook(() => useTileTriggers('king-rhino'));
    result.current.onPointerEnter();
    vi.advanceTimersByTime(100);
    result.current.onPointerDown();

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('king-rhino', 'pointerdown');

    // The dwell timer must not fire a second, redundant request afterwards.
    vi.advanceTimersByTime(1_000);
    expect(request).toHaveBeenCalledOnce();
  });
});
