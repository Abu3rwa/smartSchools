"""TEMPORARY: sample rendered pixels to check text contrast on gradient backgrounds.

Glyph pixels are a minority of any text box, so the 25th/75th luminance percentiles
bracket the background without picking up the text itself. Contrast is reported
against whichever end of that range is worse for the declared text colour.
"""
import json
import sys
from PIL import Image


def lum(rgb):
    def ch(v):
        s = v / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(fg, bg):
    a, b = lum(fg), lum(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def main(png, spec):
    im = Image.open(png).convert("RGB")
    rows = json.load(open(spec, encoding="utf-8"))
    out = []
    for r in rows:
        x, y, w, h = (int(round(r[k])) for k in ("x", "y", "w", "h"))
        box = im.crop((max(0, x), max(0, y), min(im.width, x + w), min(im.height, y + h)))
        if box.width == 0 or box.height == 0:
            continue
        px = sorted(box.getdata(), key=lum)
        lo = px[int(len(px) * 0.25)]
        hi = px[int(len(px) * 0.75)]
        alpha = r.get("a", 1)
        worst = None
        for bg in (lo, hi):
            eff = tuple(r["rgb"][i] * alpha + bg[i] * (1 - alpha) for i in range(3))
            cr = ratio(eff, bg)
            if worst is None or cr < worst[0]:
                worst = (cr, bg)
        cr, bg = worst
        size = r["size"]
        need = 3 if (size >= 24 or (size >= 18.66 and r.get("bold"))) else 4.5
        out.append({
            "text": r["text"][:34],
            "bg": "#%02x%02x%02x" % bg,
            "ratio": round(cr, 2),
            "need": need,
            "pass": cr >= need,
        })
    print(json.dumps(out, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])