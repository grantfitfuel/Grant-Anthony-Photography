#!/usr/bin/env python3
"""Draw Instagram images (1080 x 1350, 4:5) for the books queue in books/posts.json.

Used by scripts/books_instagram.py at posting time. Can also be run by hand to
preview every card:  python scripts/books_cards.py  (writes books/instagram/preview/)

Card types:
  cover    the book's cover on its own colours, with a status label
  quote    a line from the book, with the cover small in the corner
  excerpt  a longer passage, usually the opening lines
  talk     a headline and a short paragraph about the book
  blurb    a typographic card for a book with no cover image yet
"""
import json, os, re, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKS = os.path.join(ROOT, "books")
FONTS = os.path.join(BOOKS, "assets", "fonts")
W, H = 1080, 1350
M = 92  # outer margin


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name + ".woff"), size)


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def smart(text):
    """Curly quotes and apostrophes for print."""
    text = re.sub(r'(^|[\s(\n])"', '\\1\u201c', text)
    text = text.replace('"', '\u201d')
    text = re.sub(r"(^|[\s(\n])'", "\\1\u2018", text)
    return text.replace("'", "\u2019")


def wrap(draw, text, fnt, width):
    """Wrap text to a width, keeping the paragraph breaks the text already has."""
    lines = []
    for para in smart(text).split("\n"):
        words, line = para.split(), ""
        for w in words:
            test = (line + " " + w).strip()
            if draw.textlength(test, font=fnt) <= width or not line:
                line = test
            else:
                lines.append(line)
                line = w
        lines.append(line)
    return lines


def fit(draw, text, fname, box_w, box_h, start, smallest, leading=1.32):
    """Largest size from start downwards at which the wrapped text fits the box."""
    for size in range(start, smallest - 1, -2):
        f = font(fname, size)
        lines = wrap(draw, text, f, box_w)
        too_wide = any(draw.textlength(ln, font=f) > box_w for ln in lines)
        if not too_wide and len(lines) * size * leading <= box_h:
            return f, lines, size * leading
    f = font(fname, smallest)
    return f, wrap(draw, text, f, box_w), smallest * leading


def draw_lines(draw, lines, f, x, y, step, fill):
    for ln in lines:
        draw.text((x, y), ln, font=f, fill=fill)
        y += step
    return y


def background(theme):
    bg, ac = hexrgb(theme["bg"]), hexrgb(theme["accent"])
    im = Image.new("RGB", (W, H), bg)
    glow = Image.new("RGB", (W, H), bg)
    g = ImageDraw.Draw(glow)
    g.ellipse((W * 0.45, -H * 0.15, W * 1.35, H * 0.55), fill=ac)
    glow = glow.filter(ImageFilter.GaussianBlur(170))
    return Image.blend(im, glow, 0.22)


def cover_image(book, height):
    path = os.path.join(BOOKS, book.get("cover") or "")
    if not book.get("cover") or not os.path.exists(path):
        return None
    c = Image.open(path).convert("RGB")
    return c.resize((round(c.width * height / c.height), height), Image.LANCZOS)


def paste_with_shadow(im, cov, x, y, rot=0):
    pad = 60
    sh = Image.new("RGBA", (cov.width + pad * 2, cov.height + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rectangle((pad + 14, pad + 22, pad + cov.width + 14, pad + cov.height + 22), fill=(0, 0, 0, 140))
    sh = sh.filter(ImageFilter.GaussianBlur(22))
    layer = sh.copy()
    layer.paste(cov, (pad, pad))
    if rot:
        layer = layer.rotate(rot, resample=Image.BICUBIC, expand=True)
    im.paste(layer, (x - pad - (layer.width - sh.width) // 2, y - pad - (layer.height - sh.height) // 2), layer)


def header(draw, theme, label):
    f = font("plex-mono-500", 26)
    draw.text((M, M - 6), label.upper(), font=f, fill=hexrgb(theme["accent"]), spacing=4)


def footer(draw, theme, book, data):
    fg = hexrgb(theme["fg"])
    f1, f2 = font("bricolage-800", 40), font("plex-mono-500", 24)
    draw.text((M, H - M - 70), book["byline"], font=f1, fill=fg)
    draw.text((M, H - M - 18), data.get("link", "grantanthony.co.uk/books"), font=f2, fill=fg + (0,) if False else fg)


def render(post, data):
    book = data["books"][post["book"]]
    theme = book["theme"]
    fg, ac = hexrgb(theme["fg"]), hexrgb(theme["accent"])
    im = background(theme)
    d = ImageDraw.Draw(im)
    kind = post["type"]

    if kind == "cover":
        status = post.get("label") or ("Out now" if book.get("status") == "out" else "Coming soon")
        header(d, theme, status)
        cov = cover_image(book, 900)
        if cov is None:
            raise ValueError(f"{post['id']}: cover card needs a cover image for {book['title']}")
        paste_with_shadow(im, cov, (W - cov.width) // 2, 168, rot=0)
        d = ImageDraw.Draw(im)
        f = font("plex-mono-500", 26)
        d.text((M, H - M - 18), data.get("link", "grantanthony.co.uk/books"), font=f, fill=fg)
        tf = font("bricolage-800", 40)
        d.text((W - M, H - M - 26), book["byline"], font=tf, fill=fg, anchor="rs")

    elif kind in ("quote", "excerpt"):
        header(d, theme, post.get("label") or ("Opening lines" if kind == "excerpt" else "From " + book["title"]))
        cov = cover_image(book, 250)
        box_w = W - 2 * M
        top = 210
        bottom = H - M - (290 if cov else 150)
        if kind == "quote":
            d.text((M - 8, top - 70), "“", font=font("bricolage-800", 210), fill=ac)
            top += 90
            f, lines, step = fit(d, post["text"], "source-serif-400", box_w, bottom - top, 76, 40, 1.28)
        else:
            f, lines, step = fit(d, post["text"], "source-serif-400", box_w, bottom - top, 46, 28, 1.42)
        y = draw_lines(d, lines, f, M, top, step, fg)
        attr = post.get("attribution") or book["title"]
        af = font("plex-mono-500", 26)
        d.text((M, y + 28), attr.upper(), font=af, fill=ac)
        if cov:
            paste_with_shadow(im, cov, W - M - cov.width, H - M - cov.height, rot=-4)
            d = ImageDraw.Draw(im)
        tf = font("bricolage-800", 40)
        d.text((M, H - M - 70), book["byline"], font=tf, fill=fg)
        d.text((M, H - M - 18), data.get("link", "grantanthony.co.uk/books"), font=font("plex-mono-500", 24), fill=fg)

    elif kind in ("talk", "blurb"):
        header(d, theme, post.get("label") or book["title"])
        box_w = W - 2 * M
        top = 230
        hf, hl, hstep = fit(d, post["headline"], "bricolage-800", box_w, 470, 132, 60, 1.02)
        y = draw_lines(d, hl, hf, M, top, hstep, ac)
        y += 40
        if post.get("sub"):
            sf, sl, sstep = fit(d, post["sub"], "source-serif-400", box_w, H - M - 190 - y, 46, 30, 1.38)
            draw_lines(d, sl, sf, M, y, sstep, fg)
        tf = font("bricolage-800", 40)
        d.text((M, H - M - 70), book["byline"], font=tf, fill=fg)
        d.text((M, H - M - 18), data.get("link", "grantanthony.co.uk/books"), font=font("plex-mono-500", 24), fill=fg)
    else:
        raise ValueError(f"{post['id']}: unknown card type '{kind}'")
    return im


def save(post, data, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, post["id"] + ".jpg")
    render(post, data).save(path, "JPEG", quality=92, optimize=True)
    return path


if __name__ == "__main__":
    data = json.load(open(os.path.join(BOOKS, "posts.json"), encoding="utf-8"))
    out = os.path.join(BOOKS, "instagram", "preview")
    only = sys.argv[1:]
    for p in data["posts"]:
        if not only or p["id"] in only:
            print(save(p, data, out))
