/**
 * Everything the dashboard shows that the catalogue does not know.
 *
 * The catalogue is the real thing — thirty games, their providers, and the
 * bundle they boot. A casino lobby also shows a category, an RTP, a jackpot, a
 * NEW badge. None of that exists here, so it is derived from the slug rather
 * than invented per game: derived means the same game always looks the same
 * across reloads and rebuilds, which a random generator would not give.
 *
 * Nothing here is real. It is dressing for a demo and must never be read as
 * game data.
 */
import type { Game } from '@/lib/catalogue';

/** Stable small integer from a slug. Same function the art generator uses. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export const CATEGORIES = [
  { id: 'all', label: 'All games' },
  { id: 'slots', label: 'Slots' },
  { id: 'jackpot', label: 'Jackpots' },
  { id: 'table', label: 'Table' },
  { id: 'live', label: 'Live' },
  { id: 'new', label: 'New' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export type GameMeta = {
  category: Exclude<CategoryId, 'all' | 'new'>;
  isNew: boolean;
  isHot: boolean;
  /** Percent, one decimal. Real slots sit around 94-97. */
  rtp: number;
  volatility: 'Low' | 'Medium' | 'High';
  minBet: number;
  /** Euros, only on jackpot games. Seeds a ticker that counts up from here. */
  jackpot: number | null;
  playersNow: number;
};

export function metaFor(game: Game): GameMeta {
  const h = hash(game.slug);
  // Weighted so the lobby looks like a slots lobby with a few of everything
  // else, rather than an even split across six tabs.
  // Weighted so the lobby reads as a slots lobby with a bit of everything else.
  // The thresholds are tuned against the thirty real slugs rather than picked
  // for how they read: the obvious 62/80/92 split leaves Live empty, and a tab
  // that is always empty is worse than no tab.
  const roll = h % 100;
  const category = roll < 44 ? 'slots' : roll < 65 ? 'jackpot' : roll < 77 ? 'table' : 'live';

  return {
    category,
    isNew: h % 7 === 0,
    isHot: h % 5 === 0,
    rtp: Number((94 + ((h >> 3) % 36) / 10).toFixed(1)),
    volatility: (['Low', 'Medium', 'High'] as const)[(h >> 5) % 3],
    minBet: [0.1, 0.2, 0.25, 0.5][(h >> 7) % 4],
    jackpot: category === 'jackpot' ? 12_000 + ((h >> 9) % 880_000) : null,
    playersNow: 8 + ((h >> 11) % 420),
  };
}

/** Matches a game against the category rail. */
export function inCategory(game: Game, category: CategoryId): boolean {
  if (category === 'all') return true;
  const meta = metaFor(game);
  if (category === 'new') return meta.isNew;
  return meta.category === category;
}

/** Name and provider, case-insensitive, so the search box is worth having. */
export function matchesQuery(game: Game, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return game.name.toLowerCase().includes(q) || game.provider.toLowerCase().includes(q);
}

export type Promo = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  gradient: string;
};

export const PROMOS: Promo[] = [
  {
    id: 'welcome',
    eyebrow: 'New players',
    title: '100% up to €500',
    body: 'Double your first deposit and take 200 free spins on Sizzling Hot Deluxe.',
    cta: 'Claim bonus',
    gradient: 'oklch(38% 0.16 305), oklch(20% 0.10 280)',
  },
  {
    id: 'drops',
    eyebrow: 'Every day, 18:00–23:00',
    title: 'Prize Drops — €50,000',
    body: 'Random cash prizes land on any spin across 30 selected games. No opt-in.',
    cta: 'See eligible games',
    gradient: 'oklch(40% 0.15 45), oklch(21% 0.09 30)',
  },
  {
    id: 'cashback',
    eyebrow: 'Weekly',
    title: '10% cashback, no wagering',
    body: 'Paid every Monday on last week’s net losses. Straight to your balance.',
    cta: 'How it works',
    gradient: 'oklch(37% 0.14 190), oklch(20% 0.08 210)',
  },
];

export type JackpotPot = { id: string; label: string; seed: number; drift: number };

/**
 * The house jackpots in the ticker. `drift` is euros per second — small enough
 * to read as a live pot rather than a slot machine counter.
 */
export const POTS: JackpotPot[] = [
  { id: 'mega', label: 'Mega', seed: 1_284_390, drift: 3.4 },
  { id: 'major', label: 'Major', seed: 96_120, drift: 0.9 },
  { id: 'minor', label: 'Minor', seed: 8_450, drift: 0.3 },
  { id: 'mini', label: 'Mini', seed: 940, drift: 0.08 },
];
