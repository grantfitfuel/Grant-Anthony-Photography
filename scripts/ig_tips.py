#!/usr/bin/env python3
"""Draw the tip and discussion carousels for @gcanth, and write their captions.

Used by scripts/instagram.py on tip days. The posts themselves live in
instagram-tips.json at the top of the site; edit the text there.

Preview every carousel by hand:
  python scripts/ig_tips.py            writes ig/preview/<id>-1.jpg ... for all posts
  python scripts/ig_tips.py <id>       just one

Slides are 1080 x 1350 (4:5), in the site's colours and fonts:
  1     the photograph, with the series number, the label and the title
  2..   the tip, one heading and a short paragraph or list per slide
  (settings posts get a slide with the photograph's camera settings from photos.json)
  last  the question, and a link to the free lesson when there is one
"""
import json, os, re, sys
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIPS_PATH = os.path.join(ROOT, "instagram-tips.json")
W, H = 1080, 1350
M = 88
BG = (13, 13, 14)
FG = (238, 236, 231)
MUTED = (142, 140, 135)
ACCENT = (217, 198, 163)
LINE = (52, 52, 54)
SITE = "grantanthony.co.uk"


def font(name, size, wght=400):
    f = ImageFont.truetype(os.path.join(ROOT, "assets", name + ".woff"), size)
    try:
        if name.startswith("bodoni"):
            # optical size 28 and a medium weight keep the hairlines readable on a phone
            f.set_variation_by_axes([max(wght, 500), 28 if size >= 40 else 11])
        else:
            f.set_variation_by_axes([wght])
    except Exception:
        pass
    return f


def display(size, italic=False):
    return font("bodoni-moda-italic" if italic else "bodoni-moda", size)


def body(size, wght=400):
    return font("hanken-grotesk", size, wght)


def mono(size, wght=500):
    return font("jetbrains-mono", size, wght)


def smart(text):
    """Curly quotes and apostrophes."""
    text = re.sub(r'(^|[\s(\n])"', "\\1\u201c", text)
    text = text.replace('"', "\u201d")
    text = re.sub(r"(^|[\s(\n])'", "\\1\u2018", text)
    return text.replace("'", "\u2019")


def wrap(draw, text, fnt, width):
    lines, line = [], ""
    for w in smart(text).split():
        test = (line + " " + w).strip()
        if draw.textlength(test, font=fnt) <= width or not line:
            line = test
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def spaced(draw, xy, text, fnt, fill, track=0.14):
    """Small capitals with letter spacing, like the site's labels."""
    x, y = xy
    for ch in text.upper():
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + fnt.size * track
    return x


def spaced_len(draw, text, fnt, track=0.14):
    return sum(draw.textlength(ch, font=fnt) + fnt.size * track for ch in text.upper())


# ---------- data ----------
def load_tips():
    with open(TIPS_PATH, encoding="utf-8") as f:
        return json.load(f)


def photo_by_id(data, pid):
    for p in data.get("photos", []):
        if p.get("id") == pid:
            return p
    return None


def lesson_by_id(data, lid):
    for l in data.get("lessons", []):
        if l.get("id") == lid:
            return l
    return None


def number_of(tips, post):
    return tips["posts"].index(post) + 1


def settings_rows(p):
    rows = []
    for label, key in (("Camera", "camera"), ("Focal length", "focal"), ("Aperture", "aperture"),
                       ("Shutter", "shutter"), ("ISO", "iso"), ("Where", "location")):
        v = str(p.get(key) or "").strip()
        v = re.sub(r"\s+", " ", v)
        if key == "iso":
            v = v.replace("ISO", "").strip()
        if v:
            rows.append((label, v))
    return rows


# ---------- slides ----------
def chrome(d, series, no, page, pages):
    f = mono(22)
    spaced(d, (M, 70), f"{series}  No. {no:02d}", f, ACCENT)
    t = f"{page:02d} / {pages:02d}"
    d.text((W - M - d.textlength(t, font=f), 70), t, font=f, fill=MUTED)
    d.line([(M, 116), (W - M, 116)], fill=LINE, width=2)
    foot = mono(22)
    d.text((M, H - 92), "@gcanth", font=foot, fill=MUTED)
    d.text((W - M - d.textlength(SITE, font=foot), H - 92), SITE, font=foot, fill=MUTED)


def cover_slide(post, data, series, no, pages):
    p = photo_by_id(data, post["photo"])
    src = os.path.join(ROOT, p.get("file") or f"images/{p['id']}.jpg")
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    im = ImageOps.fit(im, (W, H), Image.LANCZOS, centering=(0.5, 0.45))
    # darken the bottom for the title and the top for the label
    shade = Image.new("L", (1, H))
    for y in range(H):
        top = max(0.0, 1 - y / 260) * 150
        bot = max(0.0, (y - H * 0.42) / (H * 0.58)) ** 1.25 * 235
        shade.putpixel((0, y), int(min(255, top + bot)))
    im = Image.composite(Image.new("RGB", (W, H), BG), im, shade.resize((W, H)))
    d = ImageDraw.Draw(im)
    spaced(d, (M, 70), f"{series}  No. {no:02d}", mono(22), ACCENT)
    # title, sized to fit at most three lines
    for size in range(104, 60, -4):
        tf = display(size)
        lines = wrap(d, post["title"], tf, W - 2 * M)
        if len(lines) <= 3:
            break
    step = int(size * 1.08)
    y = H - 150 - step * len(lines)
    spaced(d, (M, y - 58), post.get("kicker", ""), mono(24), ACCENT)
    for ln in lines:
        d.text((M, y), ln, font=tf, fill=FG)
        y += step
    f = mono(22)
    d.text((M, H - 92), "Swipe for more  \u2192", font=f, fill=FG)
    d.text((W - M - d.textlength("@gcanth", font=f), H - 92), "@gcanth", font=f, fill=MUTED)
    return im


def text_slide(slide, series, no, page, pages):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    chrome(d, series, no, page, pages)
    box_w, top, bottom = W - 2 * M, 190, H - 150
    head = slide.get("h", "")
    pts = slide.get("points")
    para = slide.get("t", "")
    # largest sizes at which everything fits
    for hs, bs in [(78, 44), (72, 42), (66, 40), (62, 38), (58, 36), (54, 34), (50, 32), (46, 30)]:
        hf, bf = display(hs), body(bs)
        hl = wrap(d, head, hf, box_w) if head else []
        h_h = len(hl) * int(hs * 1.1) + (48 if hl else 0)
        if pts:
            blocks = [wrap(d, x, bf, box_w - 74) for x in pts]
            b_h = sum(len(b) * int(bs * 1.38) for b in blocks) + 34 * (len(blocks) - 1)
        else:
            blocks = [wrap(d, para, bf, box_w)]
            b_h = len(blocks[0]) * int(bs * 1.45)
        if h_h + b_h <= bottom - top:
            break
    total = h_h + b_h
    y = top + max(0, (bottom - top - total) // 2 - 20)
    for ln in hl:
        d.text((M, y), ln, font=hf, fill=FG)
        y += int(hs * 1.1)
    if hl:
        y += 48
    if pts:
        nf = mono(int(bs * 0.62))
        for i, b in enumerate(blocks):
            d.text((M, y + int(bs * 0.32)), f"{i + 1:02d}", font=nf, fill=ACCENT)
            for ln in b:
                d.text((M + 74, y), ln, font=bf, fill=FG)
                y += int(bs * 1.38)
            y += 34
    else:
        for ln in blocks[0]:
            d.text((M, y), ln, font=bf, fill=FG)
            y += int(bs * 1.45)
    return im


def settings_slide(p, series, no, page, pages):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    chrome(d, series, no, page, pages)
    rows = settings_rows(p)
    hf = display(76)
    lf, vf = mono(23), display(50)
    y = 190
    d.text((M, y), "The settings", font=hf, fill=FG)
    y += 140
    for label, v in rows:
        spaced(d, (M, y), label, lf, MUTED)
        vl = wrap(d, v, vf, W - 2 * M)
        y += 38
        d.text((M, y), vl[0], font=vf, fill=FG)
        y += 74
        d.line([(M, y), (W - M, y)], fill=LINE, width=1)
        y += 28
    return im


def last_slide(post, data, series, no, page, pages):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    chrome(d, series, no, page, pages)
    y = 220
    spaced(d, (M, y), "Over to you", mono(26), ACCENT)
    y += 80
    for size in range(76, 44, -4):
        qf = display(size, italic=True)
        ql = wrap(d, post["question"], qf, W - 2 * M)
        if len(ql) * int(size * 1.15) <= 520:
            break
    for ln in ql:
        d.text((M, y), ln, font=qf, fill=FG)
        y += int(size * 1.15)
    y += 40
    bf = body(36)
    d.text((M, y), "Tell me in the comments.", font=bf, fill=MUTED)
    lesson = lesson_by_id(data, post.get("lesson"))
    by = H - 330
    d.line([(M, by), (W - M, by)], fill=LINE, width=2)
    by += 44
    if lesson:
        spaced(d, (M, by), "The full lesson, free", mono(22), ACCENT)
        by += 46
        for ln in wrap(d, lesson["title"], display(48), W - 2 * M)[:2]:
            d.text((M, by), ln, font=display(48), fill=FG)
            by += 56
        d.text((M, by + 6), SITE + "  \u00b7  Learn", font=body(32), fill=MUTED)
    else:
        spaced(d, (M, by), "Save this for your next shoot", mono(22), ACCENT)
        by += 46
        d.text((M, by), "More free lessons at", font=body(32), fill=MUTED)
        d.text((M, by + 48), SITE, font=display(48), fill=FG)
    return im


def render(post, data, tips):
    series = tips.get("series", "Light, explained")
    no = number_of(tips, post)
    p = photo_by_id(data, post["photo"])
    if not p:
        raise ValueError(f"Tip '{post['id']}': photo '{post['photo']}' is not in photos.json")
    slides = list(post.get("slides", []))
    extra = 1 if post.get("type") == "settings" and settings_rows(p) else 0
    pages = 1 + extra + len(slides) + 1
    if pages > 10:
        raise ValueError(f"Tip '{post['id']}' has {pages} slides; Instagram allows 10.")
    out = [cover_slide(post, data, series, no, pages)]
    page = 2
    if extra:
        out.append(settings_slide(p, series, no, page, pages)); page += 1
    for s in slides:
        out.append(text_slide(s, series, no, page, pages)); page += 1
    out.append(last_slide(post, data, series, no, page, pages))
    return out


def save(post, data, tips, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for i, im in enumerate(render(post, data, tips), 1):
        path = os.path.join(out_dir, f"{post['id']}-{i}.jpg")
        im.save(path, "JPEG", quality=90, optimize=True, progressive=False)
        paths.append(path)
    return paths


# ---------- caption ----------
def caption(post, data, tips, extra_tags="", limit=2200, max_tags=30):
    series = tips.get("series", "Light, explained")
    no = number_of(tips, post)
    parts = [post["title"]]
    p = photo_by_id(data, post["photo"])
    if post.get("type") == "settings" and p:
        rows = [f"{a}: {b}" for a, b in settings_rows(p)]
        if rows:
            parts.append("\n".join(rows))
    for s in post.get("slides", []):
        block = s.get("h", "")
        if s.get("points"):
            block += "\n" + "\n".join("\u2022 " + x for x in s["points"])
        elif s.get("t"):
            block += "\n" + s["t"]
        parts.append(block.strip())
    parts.append(post["question"] + " Tell me in the comments.")
    lesson = lesson_by_id(data, post.get("lesson"))
    if lesson:
        parts.append(f"The full lesson, {lesson['title']}, is free at {SITE} (link in bio).")
    else:
        parts.append(f"More free photography lessons at {SITE} (link in bio).")
    if post.get("type") in ("tip", "settings", "care", "myth"):
        parts.append("Save this for your next shoot.")
    if p and post.get("type") != "settings":
        where = (p.get("location") or "").strip()
        title = p.get("title", "").strip()
        if where and title.lower() in where.lower():
            parts.append(f"Photo: {where}")
        else:
            parts.append(f"Photo: {title}" + (f", {where}" if where else ""))
    parts.append(f"{series} \u00b7 No. {no:02d}")
    tags = []
    for t in (post.get("tags", "") + " " + extra_tags).replace(",", " ").split():
        t = "#" + t.lstrip("#")
        if len(t) > 1 and t.lower() not in [x.lower() for x in tags]:
            tags.append(t)
    tail = " ".join(tags[:max_tags])
    text = smart("\n\n".join(parts))
    room = limit - (len(tail) + 2 if tail else 0)
    if len(text) > room:
        text = text[: room - 1].rstrip() + "\u2026"
    return text + ("\n\n" + tail if tail else "")


if __name__ == "__main__":
    with open(os.path.join(ROOT, "photos.json"), encoding="utf-8") as f:
        data = json.load(f)
    tips = load_tips()
    want = sys.argv[1:] or [x["id"] for x in tips["posts"]]
    out = os.path.join(ROOT, "ig", "preview")
    for post in tips["posts"]:
        if post["id"] in want:
            print(post["id"], len(save(post, data, tips, out)), "slides")
