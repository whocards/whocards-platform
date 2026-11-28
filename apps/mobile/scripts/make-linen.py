#!/usr/bin/env python3
"""Regenerates assets/images/linen@3x.png, the face-up Card's linen weave.

usage: python3 scripts/make-linen.py assets/images/linen@3x.png 576 16.7 28
(<out.png> <size> <target_mean> <spread> [seed]): tileable linen weave encoded per pixel as
black- or white-with-alpha so that, over the charcoal base (#111516), its brightness averages target_mean."""
import random, sys
from PIL import Image, ImageFilter
out, N, mean, spread = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
random.seed(int(sys.argv[5]) if len(sys.argv) > 5 else 11)
BASE = 0.2126 * 0x11 + 0.7152 * 0x15 + 0.0722 * 0x16
def threads(n):
    v = [random.random() for _ in range(n)]
    for _ in range(n // 48):
        i = random.randrange(n); v[i] = min(1, v[i] + 0.35)
    return v
rows, cols = threads(N), threads(N)
val = Image.new('L', (N, N)); px = val.load()
for y in range(N):
    for x in range(N):
        t = rows[y] if ((x // 2) + (y // 2)) % 2 == 0 else cols[x]
        px[x, y] = int(max(0, min(1, 0.65 * t + 0.35 * random.random())) * 255)
val = val.filter(ImageFilter.GaussianBlur(0.35)); vp = val.load()
img = Image.new('RGBA', (N, N)); ip = img.load()
for y in range(N):
    for x in range(N):
        target = mean + (vp[x, y] / 255 - 0.5) * 2 * spread
        if target <= BASE:
            ip[x, y] = (0, 0, 0, int(round((1 - target / BASE) * 255)))
        else:
            ip[x, y] = (255, 255, 255, int(round((target - BASE) / (255 - BASE) * 255)))
img.save(out, optimize=True)
# The 1x base lets Metro and jest resolve `linen.png`; devices pick the @3x.
img.resize((N // 3, N // 3), Image.LANCZOS).save(out.replace('@3x', ''), optimize=True)
