'use client';

import { useState } from 'react';

import { money, useAccount } from '@/lib/account';

const TOP_UPS = [50, 100, 250];

/**
 * Balance, and a deposit that actually moves it.
 *
 * Two shapes rather than one. `inline` is for inside the account menu on a
 * phone, where the balance and the amounts are laid out flat; the default is
 * the header pill, which hides its amounts behind a popover because the header
 * has no room for them. The inline form exists because nesting this popover
 * inside the account menu put two full-screen backdrop catchers on top of each
 * other, and whichever one you hit first closed the thing you were aiming at.
 */
export function Wallet({ inline = false }: { inline?: boolean }) {
  const { account, deposit } = useAccount();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);

  if (!account) return null;

  const add = (amount: number) => {
    deposit(amount);
    setOpen(false);
    // A balance that changes silently reads as a broken button.
    setFlash(true);
    setTimeout(() => setFlash(false), 700);
  };

  const amounts = (
    <div className="grid grid-cols-3 gap-2">
      {TOP_UPS.map((amount) => (
        <button
          key={amount}
          onClick={() => add(amount)}
          className="rounded-lg border border-border bg-surface py-2 text-sm font-semibold transition-colors hover:border-gold hover:text-gold"
        >
          €{amount}
        </button>
      ))}
    </div>
  );

  if (inline) {
    return (
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs text-muted">Balance</span>
          <span
            className={`text-sm font-semibold tabular-nums transition-colors ${flash ? 'text-win' : 'text-text'}`}
          >
            {money(account.balance)}
          </span>
        </div>
        {amounts}
        <p className="mt-2 text-[11px] leading-relaxed text-muted">Demo only. No real funds.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pr-1 pl-3">
        <span
          className={`text-sm font-semibold tabular-nums transition-colors ${flash ? 'text-win' : 'text-text'}`}
        >
          {money(account.balance)}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-full bg-gold px-3 py-1 text-xs font-semibold text-black transition-opacity hover:opacity-90"
        >
          Deposit
        </button>
      </div>

      {open ? (
        <>
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="rise absolute right-0 z-20 mt-2 w-56 rounded-xl border border-border bg-elevated p-3 shadow-xl">
            <p className="mb-2 text-xs text-muted">Add play money</p>
            {amounts}
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Demo only. No payment method, no real funds.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
