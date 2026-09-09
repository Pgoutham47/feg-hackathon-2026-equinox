'use client';

import { useState } from 'react';

import { Compare } from '@/components/dashboard/compare';
import { GameBrowser } from '@/components/dashboard/game-browser';
import { Hero } from '@/components/dashboard/hero';
import { JackpotTicker } from '@/components/dashboard/jackpot-ticker';
import { Sidebar } from '@/components/dashboard/sidebar';
import { TopBar } from '@/components/dashboard/top-bar';
import { GameRow } from '@/components/game-row';
import { Prefetch } from '@/components/prefetch';
import type { Game } from '@/lib/catalogue';
import { DEMO_RECOMMENDED, favouriteSlugs } from '@/lib/copies';

/**
 * The lobby, dressed as the product it belongs to.
 *
 * Everything the original page did is still here and in the same order — the
 * prefetch registers on mount, the recently-played row is above the catalogue,
 * and the grid renders server-side so the tiles are in the HTML. The dashboard
 * is chrome around that, not a replacement for it.
 *
 * `query` lives here because the search box is in the header and the results
 * are in the grid, and this is the nearest thing that owns both.
 */
export function Dashboard({
  games,
  art,
  bundleVersion,
}: {
  games: Game[];
  art: Record<string, string>;
  bundleVersion: string;
}) {
  const [query, setQuery] = useState('');

  return (
    <>
      <TopBar query={query} onQuery={setQuery} />

      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-6">
        <Sidebar />

        <main className="min-w-0 flex-1 space-y-8">
          <Hero />
          <JackpotTicker />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Lobby</h1>
            <div className="flex flex-wrap items-center gap-3">
              <Prefetch gameCount={games.length} />
              <Compare bundleVersion={bundleVersion} />
            </div>
          </div>

          {/* Both rows come out of the warmed copies, so both are instant. The
              recommendations cost nothing extra: they ride on the same two
              copies the favourites already filled. */}
          <GameRow title="Recently played" slugs={favouriteSlugs()} games={games} art={art} />
          <GameRow title="Recommended for you" slugs={DEMO_RECOMMENDED} games={games} art={art} />
          <GameBrowser games={games} art={art} query={query} />

          <footer className="border-t border-border pt-6 pb-2 text-xs leading-relaxed text-muted">
            <p className="font-medium text-text">Empire of Gold — demo build</p>
            <p className="mt-1">
              No real money and no real account: the balance, the jackpots and the promotions are
              dummy data, and nothing you enter leaves this browser. The thirty games and their
              artwork are real, and they all boot the same certified bundle.
            </p>
            <p className="mt-2">18+ · Play responsibly · This is not a gambling service.</p>
          </footer>
        </main>
      </div>
    </>
  );
}
