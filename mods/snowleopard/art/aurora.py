"""Draws img/aurora.jpg: a Snow Leopard style 'Aurora' nebula, procedurally.

Run: python3 -I mods/snowleopard/art/aurora.py [out.jpg]  (needs numpy + Pillow)
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

W, H = 2880, 1800
rng = np.random.default_rng(106)  # 10.6


def noise(octaves=6, base=4):
    """Fractal value noise in [0, 1], W x H."""
    acc = np.zeros((H, W), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        n = base * 2 ** o
        small = rng.random((n * H // W + 2, n + 2)).astype(np.float32)
        img = Image.fromarray((small * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        acc += amp * (np.asarray(img, np.float32) / 255.0)
        total += amp
        amp *= 0.55
    acc /= total
    return (acc - acc.min()) / (acc.max() - acc.min())


y, x = np.mgrid[0:H, 0:W].astype(np.float32)
u, v = x / W, y / H

# Deep space: indigo top, violet-black bottom.
sky = np.stack([
    0.03 + 0.06 * v,
    0.03 + 0.02 * v,
    0.12 + 0.10 * (1 - v),
], -1)

n1, n2, n3 = noise(7, 3), noise(6, 5), noise(5, 9)

# The aurora: a band sweeping from lower left up to the upper right.
center = 0.78 - 0.62 * u + 0.10 * np.sin(u * 5.2 + 0.6) + 0.10 * (n1 - 0.5)
d = (v - center)
band = np.exp(-(d / (0.10 + 0.08 * n2)) ** 2)
core = np.exp(-(d / 0.028) ** 2) * (0.55 + 0.45 * n3)
veil = np.exp(-(d / 0.30) ** 2) * n1

magenta = np.array([0.86, 0.26, 0.78], np.float32)
violet = np.array([0.48, 0.24, 0.92], np.float32)
blue = np.array([0.22, 0.42, 0.98], np.float32)
pink = np.array([1.0, 0.62, 0.92], np.float32)

mix = np.clip(u[..., None] * 1.3 - 0.1, 0, 1)
hue = magenta * (1 - mix) + violet * mix
img = sky
img = img + veil[..., None] * blue * 0.45
img = img + (band * (0.35 + 0.65 * n2))[..., None] * hue * 1.15
img = img + core[..., None] * pink * 0.9
# A second, fainter wisp above the first.
d2 = v - (center - 0.22 - 0.05 * np.cos(u * 3.0))
img = img + (np.exp(-(d2 / 0.07) ** 2) * n3 * 0.5)[..., None] * violet

# Stars.
stars = np.zeros((H, W), np.float32)
count = 2600
sx, sy = rng.integers(0, W, count), rng.integers(0, H, count)
stars[sy, sx] = rng.random(count) ** 3 * 1.6
glow = np.asarray(Image.fromarray((np.clip(stars, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255.0
img = img + (stars * 0.7 + glow * 2.2)[..., None] * np.array([0.92, 0.94, 1.0], np.float32)

# Soft vignette.
vig = 1 - 0.45 * (((u - 0.5) * 1.2) ** 2 + ((v - 0.45) * 1.4) ** 2)
img = img * vig[..., None]

img = 1 - np.exp(-img * 1.35)  # filmic shoulder
out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
out.save(sys.argv[1] if len(sys.argv) > 1 else "aurora.jpg", quality=90)
