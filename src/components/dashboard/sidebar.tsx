'use client';

import { useAccount } from '@/lib/account';

const NAV = [
  { id: 'lobby', label: 'Lobby', icon: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5' },
  { id: 'live', label: 'Live casino', icon: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 5v3l2 2' },
  { id: 'promos', label: 'Promotions', icon: 'M4 8h16v12H4zM4 8l2-4h12l2 4M12 8v12' },
  { id: 'tournaments', label: 'Tournaments', icon: 'M7 4h10v5a5 5 0 0 1-10 0zM9 20h6M12 14v6' },
  { id: 'history', label: 'My history', icon: 'M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7' },
];

/**
 * Section nav. Only the lobby exists, so the rest announce themselves as
 * unbuilt rather than dead-ending on a blank route — a demo is better served by
 * an honest 'soon' than by a link that goes nowhere.
 */
export function Sidebar() {
  const { account } = useAccount();

  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <nav className="sticky top-20 space-y-1">
        {NAV.map((item, i) => (
          <button
            key={item.id}
            disabled={i > 0}
            title={i > 0 ? 'Not part of this demo' : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              i === 0
                ? 'bg-surface text-text'
                : 'text-muted/60 hover:bg-surface/50 disabled:cursor-not-allowed'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0 fill-none stroke-current stroke-[1.8]">
              <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {item.label}
            {i > 0 ? <span className="ml-auto text-[10px] tracking-wide uppercase">soon</span> : null}
          </button>
        ))}

        <div className="!mt-6 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            {account ? 'Your level' : 'Loyalty'}
          </p>
          <p className="mt-1.5 text-sm font-semibold">{account ? 'Silver · 240 pts' : 'Sign in to earn'}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-gold" style={{ width: account ? '48%' : '0%' }} />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {account ? '260 pts to Gold' : 'Play to collect points'}
          </p>
        </div>
      </nav>
    </aside>
  );
}
