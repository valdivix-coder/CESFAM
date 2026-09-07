#!/usr/bin/env python3
"""Check the PWA icons: one mark everywhere, inside the maskable safe zone."""
import math
import sys
from pathlib import Path

from PIL import Image

ICONS = Path('public/icons')
DISC_TESTS = (
    lambda r, g, b: g > 150 and r < 150 and b < 150,      # verde
    lambda r, g, b: b > 180 and r < 140 and 120 < g < 200,  # azul
    lambda r, g, b: r > 190 and g > 160 and b < 100,      # amarillo
)


def mark_extent(path):
    """Farthest disc pixel from the centre, as a fraction of the icon's side."""
    image = Image.open(path).convert('RGB')
    width, height = image.size
    pixels = image.load()
    far = 0.0
    for y in range(0, height, 2):
        for x in range(0, width, 2):
            colour = pixels[x, y]
            if any(test(*colour) for test in DISC_TESTS):
                far = max(far, math.hypot(x - width / 2, y - height / 2) / width)
    return far


def main():
    problems = []
    for name in ('icon-192.png', 'icon-512.png', 'maskable-192.png', 'maskable-512.png',
                 'apple-touch-icon.png', 'favicon-32.png', 'icon-rounded-512.png',
                 'app-icon-96.png'):
        path = ICONS / name
        if not path.exists():
            problems.append(f'falta {name}')
            continue
        extent = mark_extent(path)
        if extent < 0.15:
            problems.append(f'{name}: no se reconoce la marca de tres discos')
        limit = 0.40 if name.startswith('maskable') else 0.46
        if extent > limit:
            problems.append(f'{name}: la marca llega a {extent:.3f}, sobre el límite {limit}')
        print(f'{name}: radio {extent:.3f}')

    if problems:
        print('\n'.join(problems), file=sys.stderr)
        raise SystemExit(1)
    print('ok: una sola marca, dentro de la zona segura')


if __name__ == '__main__':
    main()
