#!/usr/bin/env python3
"""Static file server for the demo, with an optional bandwidth throttle.

This is a development tool, not part of the deployable. The deployable is the
contents of `site/` on any static host — there is no backend.

    python3 tools/serve.py                 # unthrottled, port 8150
    python3 tools/serve.py --rate 25       # 25 Mbps, the phone-on-4G case
    python3 tools/serve.py --port 8200

Everything is sent `Cache-Control: no-store` on purpose. The HTTP cache would
otherwise hide what we are trying to measure: we want every miss to be a real
download, so a fast load is provably Cache Storage doing the work and not the
browser's disk cache.
"""

from __future__ import annotations

import argparse
import functools
import mimetypes
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("audio/ogg", ".ogg")
mimetypes.add_type("font/ttf", ".ttf")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("text/plain", ".atlas")
mimetypes.add_type("text/plain", ".fnt")

CHUNK = 16384

# Optional request log, enabled with --access-log. Written by the handler and
# read by the verification scripts; it is the only trustworthy byte/hit counter
# once a service worker is in play.
access_log = None
access_log_lock = threading.Lock()


class Throttle:
    """One token bucket shared by every connection, so the cap is the link."""

    def __init__(self, bytes_per_second: float | None) -> None:
        self.rate = bytes_per_second
        self._lock = threading.Lock()
        self._t = time.monotonic()
        self._allow = 0.0

    def take(self, n: int) -> None:
        if self.rate is None:
            return
        while n > 0:
            with self._lock:
                now = time.monotonic()
                self._allow += (now - self._t) * self.rate
                self._t = now
                # Cap the burst at 50 ms of link, or an idle server would let the
                # first file through at unlimited speed.
                self._allow = min(self._allow, self.rate * 0.05)
                got = min(n, self._allow)
                self._allow -= got
                n -= int(got)
            if n > 0:
                time.sleep(0.005)


def make_handler(throttle: Throttle) -> type[SimpleHTTPRequestHandler]:
    class Handler(SimpleHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def end_headers(self) -> None:
            # Never let the HTTP cache stand in for Cache Storage in a measurement.
            self.send_header("Cache-Control", "no-store")
            # The worker must be allowed to control the whole origin even though
            # it is served from /sw.js.
            if self.path.split("?", 1)[0].endswith("sw.js"):
                self.send_header("Service-Worker-Allowed", "/")
            super().end_headers()

        def send_head(self):  # noqa: ANN201
            # Ground truth for "did this actually cross the network?".
            # `PerformanceResourceTiming.transferSize` is 0 for anything a
            # service worker answered *and* for anything it fetched on the
            # page's behalf, so the browser cannot tell us. The server can.
            if access_log is not None:
                with access_log_lock:
                    access_log.write(self.path + "\n")
                    access_log.flush()
            return super().send_head()

        def copyfile(self, source, outputfile) -> None:  # noqa: ANN001
            while True:
                buf = source.read(CHUNK)
                if not buf:
                    break
                throttle.take(len(buf))
                try:
                    outputfile.write(buf)
                except (BrokenPipeError, ConnectionResetError):
                    break

        def log_message(self, fmt: str, *args: object) -> None:
            pass  # the request log is noise during a measurement

    return Handler


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=8150)
    ap.add_argument(
        "--rate",
        type=float,
        default=0,
        help="Mbps to simulate; 0 means unthrottled (default)",
    )
    ap.add_argument(
        "--access-log",
        help="append every requested path here, for the verification scripts",
    )
    args = ap.parse_args()

    if args.access_log:
        global access_log
        log_path = Path(args.access_log)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        access_log = log_path.open("a", encoding="utf-8")

    throttle = Throttle(args.rate * 1_000_000 / 8 if args.rate else None)
    handler = functools.partial(make_handler(throttle), directory=str(SITE))
    server = ThreadingHTTPServer(("0.0.0.0", args.port), handler)
    rate = f"{args.rate:g} Mbps" if args.rate else "unthrottled"
    print(f"serving {SITE} on http://localhost:{args.port}  ({rate})", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
