'use client';

import { useEffect, useState } from 'react';

import { PROMOS } from '@/lib/demo-data';

const ROTATE_MS = 6_000;

/** The promo banner. Rotates on its own, and stops the moment anyone steers it. */
export function Hero() {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % PROMOS.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [held]);

  const promo = PROMOS[index];

  return (
    <section
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      className="relative overflow-hidden rounded-2xl border border-border"
      style={{ backgroundImage: `linear-gradient(115deg, ${promo.gradient})` }}
    >
      <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_78%_28%,rgba(255,255,255,0.35),transparent_58%)]" />

      <div key={promo.id} className="rise relative px-6 py-8 sm:px-10 sm:py-12">
        <p className="text-xs font-medium tracking-widest text-gold uppercase">{promo.eyebrow}</p>
        <h2 className="mt-2 max-w-xl text-2xl font-bold tracking-tight sm:text-4xl">
          {promo.title}
        </h2>
        <p className="mt-2 max-w-md text-sm text-white/80 sm:text-base">{promo.body}</p>
        <button className="mt-5 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90">
          {promo.cta}
        </button>
      </div>

      <div className="relative flex gap-2 px-6 pb-6 sm:px-10">
        {PROMOS.map((item, i) => (
          <button
            key={item.id}
            onClick={() => setIndex(i)}
            aria-label={`Show ${item.title}`}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-7 bg-gold' : 'w-3 bg-white/35 hover:bg-white/60'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
