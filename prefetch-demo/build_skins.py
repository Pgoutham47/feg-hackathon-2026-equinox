#!/usr/bin/env python3
"""Bake N distinct game bundles out of the one Empire of Gold bundle.

Only the art that gives a game its identity is copied and recoloured — splash,
symbols, reel elements, control panel, logo. The engine JS, sounds and the big
non-logo spines stay shared, exactly as a real casino platform ships a catalogue:
one certified engine, a per-game asset pack on top.

    python3 build_skins.py            # build every game in site/games.json
    python3 build_skins.py -j 8       # limit workers
    python3 build_skins.py --only frozzy-fruits golden-fate-1000
    python3 build_skins.py --force    # rebuild even if up to date

Output: site/games/<slug>/assets/... mirroring the shared tree, plus
site/games/<slug>/thumb.webp for the lobby tile.
"""

import argparse, json, os, shutil, sys, time
from concurrent.futures import ProcessPoolExecutor
from PIL import Image, ImageEnhance
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SHARED = os.path.join(HERE, 'site', 'assets')          # symlink -> the original bundle
OUT = os.path.join(HERE, 'site', 'games')
CATALOG = os.path.join(HERE, 'site', 'games.json')

# The art that makes one game look like a different game. Everything not listed
# here is served from the shared bundle.
SKIN_ART = [
    *[f'images/{r}/{f}' for r in ('@0.5x', '@1x') for f in (
        'splashBG.jpg', 'splashAssets.webp', 'symbols.webp', 'gameElements.webp',
        'controlPanelPrimaryAssets.webp', 'controlPanelAssets.webp', 'brandLogo.png',
        'en/langImages.webp', 'en/commonLangAssets.webp')],
    *[f'spines/{r}/EOG_Logo_Anim{s}.png' for r in ('@0.5x', '@1x') for s in ('', '_2')],
    'images/loader.webp',
]

# Text files carrying the game's own name. game-empireofgold-*.js holds
# `gameName`, which drives the document title and the in-game UI — and it is in
# the prefetch slice, so skinning it makes each game's slice differ for real.
SKIN_TEXT = ['game-empireofgold-CK6MbOiD.js']

SRC_HUE = 40.0        # the gold the bundle is built around, in degrees
THUMB = 320           # lobby tile art, square


# --- recolour ---------------------------------------------------------------
# 8-bit HSV via PIL: hue is 0..255, not 0..360. Precision is irrelevant for a
# reskin and it is an order of magnitude faster than float conversion.

def _gamma_lut(g):
    return np.clip((np.arange(256) / 255.0) ** g * 255.0, 0, 255).astype(np.uint8)


def recolour(img, hue, sat, val):
    """Rotate the palette to `hue`, holding the art's internal hue relationships."""
    alpha = img.getchannel('A') if img.mode in ('RGBA', 'LA', 'P') and 'A' in img.getbands() else None
    hsv = np.array(img.convert('RGB').convert('HSV'))

    dh = round((hue - SRC_HUE) % 360 / 360.0 * 256) % 256
    hsv[..., 0] = (hsv[..., 0].astype(np.int16) + dh) % 256

    sat_mul = 1.00 + 0.45 * sat                 # 1.00..1.45 — keep the art rich, never washed
    hsv[..., 1] = np.clip(hsv[..., 1].astype(np.float32) * sat_mul, 0, 255).astype(np.uint8)
    hsv[..., 2] = _gamma_lut(1.06 - 0.16 * val)[hsv[..., 2]]   # 1.06..0.90

    out = Image.fromarray(hsv, 'HSV').convert('RGB')
    if alpha is not None:
        out.putalpha(alpha)
    return out


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ext = os.path.splitext(path)[1].lower()
    if ext == '.webp':
        img.save(path, 'WEBP', quality=86, method=4)
    elif ext in ('.jpg', '.jpeg'):
        img.convert('RGB').save(path, 'JPEG', quality=86, optimize=True, progressive=True)
    else:
        img.save(path, 'PNG', optimize=False, compress_level=6)


# --- one game ---------------------------------------------------------------

def build_one(game, force):
    slug, skin = game['slug'], game['skin']
    root = os.path.join(OUT, slug)
    stamp = os.path.join(root, '.skin.json')
    want = {'skin': skin, 'name': game['name'], 'art': len(SKIN_ART) + len(SKIN_TEXT), 'v': 5}

    if not force and os.path.exists(stamp):
        try:
            if json.load(open(stamp)) == want:
                return slug, 0, 0.0, 'up to date'
        except Exception:
            pass

    t0 = time.time()
    shutil.rmtree(root, ignore_errors=True)
    hue, sat, val = skin['hue'], skin['sat'], skin['val']
    written = {}          # source md5-free dedupe: identical inputs -> hardlink

    for rel in SKIN_ART:
        src, dst = os.path.join(SHARED, rel), os.path.join(root, 'assets', rel)
        if not os.path.exists(src):
            continue
        key = (os.path.getsize(src), os.path.basename(src))
        if key in written:                       # e.g. @0.5x/@1x logo are one file
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            os.link(written[key], dst)
            continue
        with Image.open(src) as im:
            save(recolour(im, hue, sat, val), dst)
        written[key] = dst

    for rel in SKIN_TEXT:
        src = os.path.join(SHARED, rel)
        if not os.path.exists(src):
            continue
        txt = open(src, encoding='utf-8').read().replace('Empire of Gold', game['name'])
        dst = os.path.join(root, 'assets', rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, 'w', encoding='utf-8').write(txt)

    # Lobby tile art, cut from this game's own splash. Every game shares one
    # background painting, so vary the framing too — a different zoom and pan per
    # game, or 30 tiles read as one picture in 30 colours.
    with Image.open(os.path.join(root, 'assets/images/@1x/splashBG.jpg')) as bg:
        w, h = bg.size
        gid = game['id']
        zoom = 1.00 + 0.55 * ((gid * 7) % 5) / 4          # 1.00..1.55
        side = int(min(w, h) / zoom)
        fx = ((gid * 13) % 7) / 6.0                        # pan across the scene
        fy = ((gid * 5) % 4) / 3.0
        x0 = int((w - side) * fx)
        y0 = int((h - side) * fy)
        crop = bg.crop((x0, y0, x0 + side, y0 + side)).resize((THUMB, THUMB), Image.LANCZOS)
        ImageEnhance.Contrast(crop).enhance(1.12) \
            .save(os.path.join(root, 'thumb.webp'), 'WEBP', quality=80, method=4)

    # the game's own name, in every locale that carries it
    for loc in sorted(os.listdir(os.path.join(SHARED, 'locale'))):
        f = os.path.join(SHARED, 'locale', loc, 'gameContent.json')
        if not os.path.isfile(f):
            continue
        d = json.load(open(f, encoding='utf-8'))
        d = {k: (v.replace('Empire of Gold', game['name']) if isinstance(v, str) else v)
             for k, v in d.items()}
        out = os.path.join(root, 'assets/locale', loc, 'gameContent.json')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        json.dump(d, open(out, 'w', encoding='utf-8'), ensure_ascii=False)

    json.dump(want, open(stamp, 'w'))
    size = sum(os.path.getsize(os.path.join(p, f))
               for p, _, fs in os.walk(root) for f in fs)
    return slug, size, time.time() - t0, 'built'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('-j', type=int, default=min(8, os.cpu_count() or 4), help='workers')
    ap.add_argument('--only', nargs='*', help='slugs to build')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()

    games = json.load(open(CATALOG))
    if a.only:
        known = {g['slug'] for g in games}
        unknown = set(a.only) - known
        if unknown:
            sys.exit(f'unknown slugs: {", ".join(sorted(unknown))}')
        games = [g for g in games if g['slug'] in set(a.only)]

    os.makedirs(OUT, exist_ok=True)
    print(f'building {len(games)} bundles, {len(SKIN_ART)} art + {len(SKIN_TEXT)} text files each, {a.j} workers\n')

    t0, total, built = time.time(), 0, 0
    with ProcessPoolExecutor(max_workers=a.j) as ex:
        futs = [ex.submit(build_one, g, a.force) for g in games]
        for n, f in enumerate(futs, 1):
            slug, size, dt, how = f.result()
            total += size
            built += how == 'built'
            print(f'  [{n:2}/{len(games)}] {slug:24} {size/1048576:6.1f} MB  {dt:5.1f}s  {how}')

    print(f'\n{built} built, {len(games)-built} already current')
    print(f'{total/1048576:.0f} MB in site/games/ · {time.time()-t0:.0f}s')
    print(f'shared bundle untouched: {sum(os.path.getsize(os.path.join(p,f)) for p,_,fs in os.walk(SHARED) for f in fs)/1048576:.0f} MB')


if __name__ == '__main__':
    main()
