"""Generate the PWA icon set (Story 8.1).

    python ops/make-icons.py

Writes PNGs into frontend/public/icons/. Committed output, reproducible input — the icons
are generated here rather than pasted in as binaries nobody can regenerate or adjust.

Pure standard library: no Pillow, no node rasteriser, nothing to install. Shapes are drawn
into an RGBA buffer at 4x and box-downsampled, which is where the smooth corners come from,
and the PNG is encoded with zlib directly.

The design is the product: three ascending bars in the app's accent green. It reads at
48px on a home screen, which is the only size that actually matters.
"""

import pathlib
import struct
import zlib

OUT = pathlib.Path(__file__).resolve().parents[1] / "frontend" / "public" / "icons"

# The app's light-theme palette, so the icon belongs to the thing it opens.
BG = (0x2F, 0x6F, 0x5E, 255)
INK = (0xF7, 0xF7, 0xF5, 255)

SS = 4  # supersampling factor


def rounded_rect(px, w, h, x0, y0, x1, y1, radius, colour):
    """Fill a rounded rectangle into an RGBA bytearray."""
    for y in range(max(0, int(y0)), min(h, int(y1) + 1)):
        for x in range(max(0, int(x0)), min(w, int(x1) + 1)):
            # Distance into the corner arcs; outside the radius the pixel is skipped.
            dx = 0.0
            dy = 0.0
            if x < x0 + radius:
                dx = x0 + radius - x
            elif x > x1 - radius:
                dx = x - (x1 - radius)
            if y < y0 + radius:
                dy = y0 + radius - y
            elif y > y1 - radius:
                dy = y - (y1 - radius)
            if dx * dx + dy * dy > radius * radius:
                continue
            i = (y * w + x) * 4
            px[i : i + 4] = bytes(colour)


def downsample(px, w, h, factor):
    """Box filter. This is what makes the curves smooth without a graphics library."""
    ow, oh = w // factor, h // factor
    out = bytearray(ow * oh * 4)
    area = factor * factor
    for y in range(oh):
        for x in range(ow):
            r = g = b = a = 0
            for sy in range(factor):
                for sx in range(factor):
                    i = ((y * factor + sy) * w + (x * factor + sx)) * 4
                    r += px[i]
                    g += px[i + 1]
                    b += px[i + 2]
                    a += px[i + 3]
            o = (y * ow + x) * 4
            out[o : o + 4] = bytes((r // area, g // area, b // area, a // area))
    return out, ow, oh


def write_png(path, width, height, rgba):
    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload))

    # Filter byte 0 (None) per scanline; the images are tiny and flat, so it compresses fine.
    raw = b"".join(
        b"\x00" + bytes(rgba[y * width * 4 : (y + 1) * width * 4]) for y in range(height)
    )
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def render(size, *, maskable):
    w = h = size * SS
    px = bytearray(w * h * 4)

    if maskable:
        # Maskable icons are cropped to a circle by the launcher, so the background must be
        # full-bleed and the glyph must sit inside the inner 80% safe zone.
        rounded_rect(px, w, h, 0, 0, w - 1, h - 1, 0, BG)
        inset, glyph_scale = 0.0, 0.46
    else:
        rounded_rect(px, w, h, 0, 0, w - 1, h - 1, w * 0.22, BG)
        inset, glyph_scale = 0.0, 0.60

    # Three ascending bars, bottom-aligned, centred.
    heights = (0.46, 0.70, 0.94)
    span = w * glyph_scale
    bar_w = span / 5.0
    gap = bar_w / 2.0
    total = len(heights) * bar_w + (len(heights) - 1) * gap
    left = (w - total) / 2.0
    base = h / 2.0 + span / 2.0

    for index, tall in enumerate(heights):
        x0 = left + index * (bar_w + gap)
        y0 = base - span * tall
        rounded_rect(px, w, h, x0, y0, x0 + bar_w, base, bar_w * 0.28, INK)

    small, sw, sh = downsample(px, w, h, SS)
    return small, sw, sh


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        # Separate maskable art, because Android crops and a padded standard icon looks tiny.
        ("icon-maskable-512.png", 512, True),
        # iOS ignores the manifest and uses this one.
        ("apple-touch-icon.png", 180, False),
    ]
    for name, size, maskable in targets:
        data, w, h = render(size, maskable=maskable)
        write_png(OUT / name, w, h, data)
        print(f"  {name:26} {w}x{h}  {(OUT / name).stat().st_size:>6} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
