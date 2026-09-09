'use client';

import { useEffect, useRef, useState } from 'react';

import { money, OPENING_BALANCE, useAccount } from '@/lib/account';

/**
 * Demo sign-in. Any name gets in — there is no server to check against, and
 * pretending otherwise would only add a fake failure state to click past.
 *
 * A real `<dialog>` rather than a div, so Escape, the backdrop and focus
 * trapping come from the platform instead of being reimplemented badly.
 */
export function SignInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const { signIn } = useAccount();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-border bg-elevated p-0 text-text backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <form
        method="dialog"
        className="p-6"
        onSubmit={(event) => {
          event.preventDefault();
          signIn(name);
          onClose();
        }}
      >
        <p className="text-xs font-medium tracking-widest text-gold uppercase">Empire of Gold</p>
        <h2 className="mt-1 text-xl font-semibold">Sign in to play</h2>
        <p className="mt-1 text-sm text-muted">
          Demo account — any name works, and you start with {money(OPENING_BALANCE)} in play money.
        </p>

        <label className="mt-5 block text-sm font-medium" htmlFor="player-name">
          Username
        </label>
        <input
          id="player-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="lucky_player"
          autoComplete="off"
          className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-muted/60 focus:border-gold"
        />

        <label className="mt-4 block text-sm font-medium" htmlFor="player-pass">
          Password
        </label>
        <input
          id="player-pass"
          type="password"
          defaultValue="demo"
          autoComplete="off"
          className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-gold"
        />

        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-gold py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-lg py-2 text-sm text-muted transition-colors hover:text-text"
        >
          Not now
        </button>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
          No real money, no real account. Nothing you type here leaves this browser.
        </p>
      </form>
    </dialog>
  );
}
