import os, re, json, time, functools, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")
os.chdir(ROOT)

# id -> slug, so /g7/assets/symbols.webp can look in that game's own skin pack.
SLUG = {g["id"]: g["slug"] for g in json.load(open(os.path.join(ROOT, "games.json")))}

RATE = 25_000_000 / 8    # simulated network. 25 Mbps = phone on 4G. Change this one line to re-test.
CHUNK = 16384
_lock = threading.Lock()
_state = {"t": time.monotonic(), "allow": 0.0}

def take(n):
    while n > 0:
        with _lock:
            now = time.monotonic()
            _state["allow"] += (now - _state["t"]) * RATE
            _state["t"] = now
            if _state["allow"] > RATE * 0.05:
                _state["allow"] = RATE * 0.05
            got = min(n, _state["allow"])
            _state["allow"] -= got
            n -= got
        if n > 0:
            time.sleep(0.005)

GAME_PREFIX = re.compile(r'^/(g\d+|nocache)/')

class H(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def translate_path(self, path):
        # A game is the shared engine plus its own skin pack. /g7/assets/symbols.webp
        # resolves to games/<slug>/assets/symbols.webp if that game skins it, and to
        # the shared /assets/symbols.webp if it doesn't — so the 90 MB of engine,
        # sound and spine data is stored once and served to every game.
        clean = path.split('?', 1)[0]
        m = GAME_PREFIX.match(clean)
        rest = clean[m.end() - 1:] if m else clean
        if m and m.group(1) != 'nocache':
            slug = SLUG.get(int(m.group(1)[1:]))
            if slug:
                skinned = super().translate_path('/games/%s%s' % (slug, rest))
                if os.path.isfile(skinned):
                    return skinned
        return super().translate_path(rest)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')   # every miss is a real download
        super().end_headers()

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n)
        with open(ROOT + "/../report.jsonl", "ab") as f:
            f.write(body + b"\n")
        self.send_response(204); self.end_headers()

    def copyfile(self, src, dst):
        while True:
            buf = src.read(CHUNK)
            if not buf: break
            take(len(buf))
            try: dst.write(buf)
            except Exception: break

Handler = functools.partial(H, directory=ROOT)
ThreadingHTTPServer(("0.0.0.0", 8150), Handler).serve_forever()
