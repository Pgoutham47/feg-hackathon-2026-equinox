import { describe, expect, it } from 'vitest';

import { parseGameReady, parseReadySet, SW_MESSAGES } from './types';

/**
 * These parsers guard the page ↔ worker boundary. A service worker outlives any
 * single page load, so a worker from a previous deploy can send a payload the
 * running page was never compiled against — the parsers must reject it rather
 * than let `any` through into typed state.
 */
describe('parseReadySet', () => {
  it('accepts a well-formed ready set', () => {
    expect(parseReadySet({ type: SW_MESSAGES.READY_SET, slugs: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('drops non-string entries rather than failing the whole message', () => {
    expect(parseReadySet({ type: SW_MESSAGES.READY_SET, slugs: ['a', 7, null, 'b'] })).toEqual([
      'a',
      'b',
    ]);
  });

  it.each([
    ['a different message type', { type: 'something-else', slugs: ['a'] }],
    ['a missing slugs array', { type: SW_MESSAGES.READY_SET }],
    ['slugs that is not an array', { type: SW_MESSAGES.READY_SET, slugs: 'a' }],
    ['null', null],
    ['a bare string', 'ready'],
    ['undefined', undefined],
  ])('rejects %s', (_label, input) => {
    expect(parseReadySet(input)).toBeNull();
  });
});

describe('parseGameReady', () => {
  it('accepts a known tier', () => {
    expect(parseGameReady({ type: 'game:ready', tier: 'slice' })).toEqual({ tier: 'slice' });
  });

  it('falls back to cold for an unknown or missing tier', () => {
    // A game reporting a tier we do not recognise is still a real load; recording
    // it as cold under-claims the win rather than inventing one.
    expect(parseGameReady({ type: 'game:ready', tier: 'nonsense' })).toEqual({ tier: 'cold' });
    expect(parseGameReady({ type: 'game:ready' })).toEqual({ tier: 'cold' });
  });

  it('rejects anything that is not a game:ready message', () => {
    expect(parseGameReady({ type: 'other', tier: 'slice' })).toBeNull();
    expect(parseGameReady(null)).toBeNull();
  });
});
