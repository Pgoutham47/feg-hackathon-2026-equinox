'use client';

const KEY = 'eog.plays';
const KEEP = 40;

export type Play = { slug: string; at: number };

/**
 * A per-browser play history, kept in localStorage and never sent anywhere.
 * It is the only personalisation the prefetch ranking uses, so there is nothing
 * to store server-side and no consent gate to build.
 */
export function recentPlays(): Play[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (p): p is Play =>
        typeof p === 'object' && p !== null && typeof (p as Play).slug === 'string',
    );
  } catch {
    // Private mode or storage blocked: rank on popularity alone.
    return [];
  }
}

export function recordPlay(slug: string): void {
  try {
    const next = [{ slug, at: Date.now() }, ...recentPlays()].slice(0, KEEP);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Nothing to do — the ranking falls back to popularity.
  }
}
