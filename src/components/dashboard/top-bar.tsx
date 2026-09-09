'use client';

import Link from 'next/link';
import { useState } from 'react';

import { SignInDialog } from '@/components/dashboard/sign-in-dialog';
import { Wallet } from '@/components/dashboard/wallet';
import { money, useAccount } from '@/lib/account';

/**
 * The dashboard header: identity, wallet, search.
 *
 * Search state is lifted here from the grid because the box lives in the header
 * and the results live in the page — the two are far apart in the tree and the
 * page owns both.
 */
export function TopBar({ query, onQuery }: { query: string; onQuery: (value: string) => void }) {
  const { account, ready, signOut } = useAccount();
  const [signingIn, setSigningIn] = useState(false);
  const [menu, setMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold text-sm font-bold text-black">
            EG
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:block">
            Empire of Gold
          </span>
        </Link>

        <div className="relative mx-auto w-full max-w-md">
          <svg
            viewBox="0 0 20 20"
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 fill-none stroke-muted stroke-2"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="M13.5 13.5 17 17" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search games or providers"
            aria-label="Search games"
            className="w-full rounded-full border border-border bg-surface py-2 pr-3 pl-9 text-sm outline-none placeholder:text-muted/70 focus:border-gold"
          />
        </div>

        {/* `ready` is false until storage has been read, so the server HTML and
            the first client paint agree on showing nothing here. */}
        {!ready ? (
          <div className="h-8 w-24 shrink-0" />
        ) : account ? (
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden sm:block">
              <Wallet />
            </div>
            {/* On a phone the pill does not fit, but the balance is the one
                number a player wants at a glance — so it stays, and only the
                Deposit control moves into the menu. */}
            <span className="text-sm font-semibold tabular-nums sm:hidden">
              {money(account.balance)}
            </span>
            <div className="relative">
              <button
                onClick={() => setMenu((v) => !v)}
                aria-expanded={menu}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-sm font-semibold uppercase transition-colors hover:border-gold"
              >
                {account.name.slice(0, 2)}
              </button>
              {menu ? (
                <>
                  <button
                    aria-label="Close"
                    onClick={() => setMenu(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="rise absolute right-0 z-20 mt-2 w-48 rounded-xl border border-border bg-elevated p-1.5 shadow-xl">
                    <p className="px-2.5 py-1.5 text-sm font-medium">{account.name}</p>
                    <p className="px-2.5 pb-2 text-xs text-muted">Demo account</p>
                    <div className="border-t border-border px-2.5 py-2.5 sm:hidden">
                      <Wallet inline />
                    </div>
                    <button
                      onClick={() => {
                        signOut();
                        setMenu(false);
                      }}
                      className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-surface hover:text-text"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setSigningIn(true)}
            className="shrink-0 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        )}
      </div>

      <SignInDialog open={signingIn} onClose={() => setSigningIn(false)} />
    </header>
  );
}
