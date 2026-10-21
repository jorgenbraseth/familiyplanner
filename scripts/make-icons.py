#!/usr/bin/env python3
"""Regenerate every app icon from design/app-icon.png (transparent master).

Dev-only. Needs Pillow:  python3 scripts/make-icons.py
To rebuild the master from a raw render on black, pass it: python3 scripts/make-icons.py --master raw.png
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER = os.path.join(ROOT, "design", "app-icon.png")
BG = (0xFB, 0xF8, 0xEF, 255)  # app background, also the maskable/apple backing


def build_master(src, out, tol=5, size=1024):
    im = Image.open(src).convert("RGB")
    a = np.asarray(im)
    near_black = (a.max(axis=2) <= tol).astype(np.uint8)
    m = Image.fromarray(near_black * 200, "L").copy()  # 200 = candidate background
    w, h = m.size
    # flood from every border pixel that is a candidate: only border-connected black is background
    for x in range(w):
        for y in (0, h - 1):
            if m.getpixel((x, y)) == 200:
                ImageDraw.floodfill(m, (x, y), 100)
    for y in range(h):
        for x in (0, w - 1):
            if m.getpixel((x, y)) == 200:
                ImageDraw.floodfill(m, (x, y), 100)
    bg = (np.asarray(m) == 100).astype(np.uint8) * 255
    # feather the edge by ~1px so there is no hard black fringe
    soft = Image.fromarray(bg, "L").filter(ImageFilter.GaussianBlur(0.9))
    alpha = 255 - np.asarray(soft)
    rgba = Image.fromarray(np.dstack([a, alpha.astype(np.uint8)]), "RGBA")
    rgba = rgba.crop(rgba.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())
    s = max(rgba.size)
    sq = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sq.paste(rgba, ((s - rgba.width) // 2, (s - rgba.height) // 2))
    sq = sq.resize((size, size), Image.LANCZOS)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sq.save(out)


def render(master, size, pad, bg=None):
    inner = round(size * (1 - 2 * pad))
    glyph = master.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    canvas.alpha_composite(glyph, ((size - inner) // 2, (size - inner) // 2))
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", help="raw artwork on black; rebuilds design/app-icon.png first")
    args = ap.parse_args()
    if args.master:
        build_master(args.master, MASTER)
    master = Image.open(MASTER).convert("RGBA")
    icons = os.path.join(ROOT, "public", "icons")
    render(master, 192, 0.04).save(os.path.join(icons, "icon-192.png"))
    render(master, 512, 0.04).save(os.path.join(icons, "icon-512.png"))
    render(master, 512, 0.10, BG).save(os.path.join(icons, "maskable-512.png"))  # content in central 80%
    render(master, 180, 0.10, BG).convert("RGB").save(os.path.join(icons, "apple-touch-icon.png"))
    big = render(master, 256, 0.04)
    big.save(os.path.join(ROOT, "src", "app", "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])


if __name__ == "__main__":
    sys.exit(main())
