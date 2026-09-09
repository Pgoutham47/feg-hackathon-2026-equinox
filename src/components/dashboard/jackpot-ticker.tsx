'use client';

import { useEffect, useState } from 'react';

import { money } from '@/lib/account';
import { POTS } from '@/lib/demo-data';

const TICK_MS = 1_000;

/**
 * The house pots, counting up.
 *
 * Seeded from constants and advanced by elapsed time rather than by counting
 * ticks, so a backgrounded tab — where timers are throttled — comes back
 * showing what the pot should be, not what it would have been if the tab had
 * kept up. Starts from the seed on the server so the HTML hydrates cleanly.
 */
export function JackpotTicker() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="no-scrollbar flex gap-3 overflow-x-auto">
      {POTS.map((pot) => (
        <div
          key={pot.id}
          className="min-w-[9.5rem] flex-1 rounded-xl border border-border bg-surface px-4 py-3"
        >
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-live" />
            <p className="text-[11px] font-medium tracking-widest text-muted uppercase">
              {pot.label}
            </p>
          </div>
          <p className="mt-1 text-lg font-bold tracking-tight text-gold tabular-nums">
            {money(pot.seed + pot.drift * elapsed)}
          </p>
        </div>
      ))}
    </section>
  );
}
