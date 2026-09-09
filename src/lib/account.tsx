'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * The player's account: who they are, what they have, what they like.
 *
 * A demo, and honest about it — there is no server, no auth and no money. It is
 * a real store though, not a prop: sign-in, balance and favourites survive a
 * reload and drive the rest of the dashboard, so the thing behaves like the
 * product it is standing in for.
 */
const KEY = 'eog-account-v1';
export const OPENING_BALANCE = 2_500;

export type Account = {
  name: string;
  balance: number;
  /** Game slugs, newest first. */
  favourites: string[];
};

type Store = {
  /** Null until the effect has read storage — see `ready`. */
  account: Account | null;
  /**
   * False during the server render and the first client paint. Everything here
   * comes from `localStorage`, which the server cannot see, so a component that
   * renders signed-in markup before this flips would not match the HTML it is
   * hydrating. Header and dialog both wait on it.
   */
  ready: boolean;
  signIn: (name: string) => void;
  signOut: () => void;
  deposit: (amount: number) => void;
  toggleFavourite: (slug: string) => void;
};

const AccountContext = createContext<Store | null>(null);

function read(): Account | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Account>;
    if (typeof parsed?.name !== 'string') return null;
    return {
      name: parsed.name,
      balance: typeof parsed.balance === 'number' ? parsed.balance : OPENING_BALANCE,
      favourites: Array.isArray(parsed.favourites) ? parsed.favourites.filter((s) => typeof s === 'string') : [],
    };
  } catch {
    return null;
  }
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAccount(read());
    setReady(true);
  }, []);

  // One write path, so no caller can update state and forget to persist.
  const commit = useCallback((next: Account | null) => {
    setAccount(next);
    try {
      if (next) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
    } catch {
      // A player with storage blocked simply gets a session that ends on reload.
    }
  }, []);

  const store = useMemo<Store>(
    () => ({
      account,
      ready,
      signIn: (name) =>
        commit({ name: name.trim() || 'Player', balance: OPENING_BALANCE, favourites: [] }),
      signOut: () => commit(null),
      deposit: (amount) =>
        setAccount((current) => {
          if (!current) return current;
          const next = { ...current, balance: current.balance + amount };
          try {
            localStorage.setItem(KEY, JSON.stringify(next));
          } catch {
            /* see commit */
          }
          return next;
        }),
      toggleFavourite: (slug) =>
        setAccount((current) => {
          if (!current) return current;
          const has = current.favourites.includes(slug);
          const next = {
            ...current,
            favourites: has
              ? current.favourites.filter((s) => s !== slug)
              : [slug, ...current.favourites],
          };
          try {
            localStorage.setItem(KEY, JSON.stringify(next));
          } catch {
            /* see commit */
          }
          return next;
        }),
    }),
    [account, ready, commit],
  );

  return <AccountContext.Provider value={store}>{children}</AccountContext.Provider>;
}

export function useAccount(): Store {
  const store = useContext(AccountContext);
  if (!store) throw new Error('useAccount must be used inside <AccountProvider>');
  return store;
}

/** One place for money formatting, so the header and the tiles cannot disagree. */
export function money(amount: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(amount);
}
