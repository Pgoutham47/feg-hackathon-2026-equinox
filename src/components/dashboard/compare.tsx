'use client';

import { useEffect, useRef, useState } from 'react';

import { assetUrl } from '@/lib/catalogue';
import { copyVersion, originalUrl } from '@/lib/copies';
import { useFrameLoad, type LoadResult } from '@/lib/use-frame-load';

/**
 * Loads the same game twice and times both: once the way a browser with no help
 * would, once from the warmed cache.
 *
 * Nothing here is quoted. Both sides are real loads of the real bundle, in real
 * iframes, measured by the same hook that drives the badge over a game — the
 * only difference between them is the cache, which is the only thing the
 * comparison is about. The baseline loads from `/original/`, which sits outside
 * the worker's `/cdn/` prefix — so the worker never sees the request and the
 * browser fetches it the ordinary way, with `no-store` on top so nothing is
 * kept between runs. It is the bundle exactly as it behaves with none of this
 * work in place, not a cached path asked nicely to skip its cache.
 *
 * They run one after the other, never together. Two Pixi instances booting at
 * once compete for the network and the main thread, which would slow the cold
 * side and flatter the warm one — a rigged comparison is worse than no
 * comparison.
 */
type Phase = 'idle' | 'cold' | 'warm' | 'done';

function Panel({
  title,
  tone,
  running,
  elapsed,
  result,
  children,
}: {
  title: string;
  tone: 'plain' | 'gold';
  running: boolean;
  elapsed: number;
  result: LoadResult | null;
  children?: React.ReactNode;
}) {
  const seconds = ((result?.ms ?? elapsed) / 1000).toFixed(2);
  const gold = tone === 'gold';

  return (
    <div
      className={`flex min-w-0 flex-1 flex-col rounded-xl border p-4 ${
        gold ? 'border-gold/40 bg-gold/[0.04]' : 'border-border bg-surface'
      }`}
    >
      <p className={`text-sm font-semibold ${gold ? 'text-gold' : 'text-text'}`}>{title}</p>

      <div className="relative mt-2.5 aspect-[4/3] overflow-hidden rounded-lg border border-border bg-black">
        {children}
        {!running && !result ? (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted">
            Not run yet
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={`text-3xl font-bold tabular-nums ${gold ? 'text-gold' : 'text-text'} ${
            running && !result ? 'opacity-70' : ''
          }`}
        >
          {result || running ? `${seconds}s` : '—'}
        </span>
        {running && !result ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-gold" />
        ) : null}
      </div>

      <p className="mt-0.5 text-xs text-muted tabular-nums">
        {result
          ? result.downloaded === 0
            ? 'nothing downloaded'
            : `${result.downloaded} files downloaded`
          : running
            ? 'loading…'
            : ' '}
      </p>
    </div>
  );
}

export function Compare({ bundleVersion }: { bundleVersion: string }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  /**
   * Bumped on every run, and used as the iframes' `key`.
   *
   * Without it a second run measures nothing: the iframe is already mounted
   * with the same `src`, so React leaves it alone, the document never reloads,
   * and the hook reads the previous run's resource timings — reporting a load
   * that never happened. A new key forces a new document, which starts an empty
   * timeline and refetches every file from scratch.
   */
  const [run, setRun] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const coldFrame = useRef<HTMLIFrameElement>(null);
  const warmFrame = useRef<HTMLIFrameElement>(null);

  const cold = useFrameLoad(coldFrame, { enabled: phase === 'cold', runId: run });
  const warm = useFrameLoad(warmFrame, { enabled: phase === 'warm', runId: run });

  // The warm side is copy `a` — the one the lobby actually precached, so the
  // comparison uses the real thing rather than a copy made for the demo.
  const coldSrc = originalUrl(bundleVersion, 'index.html');
  const warmSrc = assetUrl(copyVersion(bundleVersion, 'a'), 'index.html');

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Strictly sequential: the warm run does not start until the cold one has a
  // number, so neither is measured while the other is using the network.
  useEffect(() => {
    if (phase === 'cold' && cold.result) setPhase('warm');
  }, [phase, cold.result]);
  useEffect(() => {
    if (phase === 'warm' && warm.result) setPhase('done');
  }, [phase, warm.result]);

  const speedup =
    cold.result && warm.result && warm.result.ms > 0 ? cold.result.ms / warm.result.ms : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-gold/50 px-3.5 py-1.5 text-sm font-semibold text-gold transition-colors hover:bg-gold/10"
      >
        Compare load times
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-2xl border border-border bg-elevated p-0 text-text backdrop:bg-black/75 backdrop:backdrop-blur-sm"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Load time</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-lg px-2 py-1 text-muted transition-colors hover:text-text"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row">
            <Panel
              title="Without prefetch"
              tone="plain"
              running={phase === 'cold'}
              elapsed={cold.elapsed}
              result={cold.result}
            >
              {phase !== 'idle' ? (
                <iframe
                  key={`cold-${run}`}
                  ref={coldFrame}
                  title="Cold load"
                  src={coldSrc}
                  className="h-full w-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : null}
            </Panel>

            <Panel
              title="With prefetch"
              tone="gold"
              running={phase === 'warm'}
              elapsed={warm.elapsed}
              result={warm.result}
            >
              {phase === 'warm' || phase === 'done' ? (
                <iframe
                  key={`warm-${run}`}
                  ref={warmFrame}
                  title="Warm load"
                  src={warmSrc}
                  className="h-full w-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : null}
            </Panel>
          </div>

          {speedup ? (
            <p className="rise mt-4 rounded-xl border border-gold/40 bg-gold/[0.06] py-2.5 text-center">
              <span className="text-xl font-bold text-gold tabular-nums">
                {speedup.toFixed(1)}× faster
              </span>
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setRun((n) => n + 1);
                setPhase('cold');
              }}
              disabled={phase === 'cold' || phase === 'warm'}
              className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {phase === 'idle'
                ? 'Run comparison'
                : phase === 'done'
                  ? 'Run again'
                  : phase === 'cold'
                    ? 'Loading cold…'
                    : 'Loading prefetched…'}
            </button>
            {/* The seconds belong to whatever link this is running on; the file
                count does not. One line, because a demo run over loopback
                otherwise reads as though the win were small. */}
            <p className="text-xs text-muted">Times follow the connection. The file counts don’t.</p>
          </div>
        </div>
      </dialog>
    </>
  );
}
