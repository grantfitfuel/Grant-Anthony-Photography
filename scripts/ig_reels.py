#!/usr/bin/env python3
"""Make vertical reels (1080 x 1920, MP4) for @gcanth from the site's photographs or tips.

Reels reach far more people who do not follow you than photos do. Instagram's own
music cannot be added automatically, so these are made silent: post them from the
Instagram app and add a track there.

  python scripts/ig_reels.py photos <name> "<title>" <photo id> <photo id> ...
      A slow pan or push-in over each photograph, with a gentle fade between them,
      and the title over the first one.
  python scripts/ig_reels.py tip <tip id>
      The tip carousel from instagram-tips.json as a reel, one slide at a time.

Files are written to ig/reels/<name>.mp4. Do not upload them to the site's repository: they are large, and they are for posting from the Instagram app.
Needs ffmpeg and Pillow.
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageOps, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ig_tips as T

ROOT = T.ROOT
W, H, FPS = 1080, 1920, 30
OUT = os.path.join(ROOT, "ig", "reels")


def load(path):
    return ImageOps.exif_transpose(Image.open(path)).convert("RGB")


def photo_path(data, pid):
    p = T.photo_by_id(data, pid)
    if not p:
        raise SystemExit(f"No photograph with id '{pid}' in photos.json")
    return p, os.path.join(ROOT, p.get("file") or f"images/{pid}.jpg")


def moves(im, n, kind):
    """n frames moving smoothly over the image: a sideways pan for wide photographs,
    a slow push-in for tall ones. Subpixel, so it does not judder."""
    iw, ih = im.size
    scale = max(W / iw, H / ih)
    for f in range(n):
        t = f / max(1, n - 1)
        e = t * t * (3 - 2 * t)                      # ease in and out
        if kind == "pan":
            s = scale * 1.02
            vw, vh = W / s, H / s
            x0 = (iw - vw) * (0.15 + 0.7 * e)
            y0 = (ih - vh) / 2
        else:
            s = scale * (1.0 + 0.08 * e)
            vw, vh = W / s, H / s
            x0, y0 = (iw - vw) / 2, (ih - vh) * 0.45
        yield im.transform((W, H), Image.AFFINE, (vw / W, 0, x0, 0, vh / H, y0), resample=Image.BICUBIC)


def title_layer(title, kicker):
    """Text over the bottom of the first photograph, in the site's fonts."""
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shade = Image.new("L", (1, H))
    for y in range(H):
        shade.putpixel((0, y), int(min(1.0, max(0.0, (y - H * 0.42) / (H * 0.36))) ** 1.3 * 200))
    lay.putalpha(shade.resize((W, H)))
    d = ImageDraw.Draw(lay)
    M = 80
    for size in range(110, 60, -4):
        f = T.display(size)
        lines = T.wrap(d, title, f, W - 2 * M)
        if len(lines) <= 3:
            break
    # keep clear of Instagram's caption, buttons and progress bar along the bottom and right
    y = H - 560 - int(size * 1.08) * len(lines)
    if kicker:
        T.spaced(d, (M, y - 64), kicker, T.mono(28), T.ACCENT + (255,))
    for ln in lines:
        d.text((M, y), ln, font=f, fill=T.FG + (255,))
        y += int(size * 1.08)
    d.text((M, y + 18), "@gcanth", font=T.mono(28), fill=T.MUTED + (255,))
    return lay


def write(frames_iter, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
           "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high",
           "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", path]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for fr in frames_iter:
        pr.stdin.write(fr.tobytes())
    pr.stdin.close()
    if pr.wait():
        raise SystemExit("ffmpeg failed")
    return path


def sequence(clips, fade):
    """Join clips (frame generators) with a crossfade of `fade` frames, holding only
    a few frames in memory at a time."""
    from collections import deque
    tail = None
    for i, cl in enumerate(clips):
        it = iter(cl)
        if tail:
            for k, prev in enumerate(tail):
                yield Image.blend(prev, next(it), (k + 1) / (fade + 1))
        buf = deque()
        last = i == len(clips) - 1
        for fr in it:
            buf.append(fr)
            if not last and len(buf) > fade:
                yield buf.popleft()
            elif last:
                yield buf.popleft()
        tail = list(buf) if not last else None


def reel_photos(data, name, title, ids, seconds=3.2, kicker="Grant C Anthony"):
    n, fade = int(seconds * FPS), int(0.5 * FPS)
    clips = []
    for i, pid in enumerate(ids):
        p, path = photo_path(data, pid)
        im = load(path)
        kind = "pan" if im.width / im.height > 0.8 else "push"
        fr = moves(im, n + (FPS if i == 0 else 0), kind)          # hold the first a moment longer
        if i == 0 and title:
            lay = title_layer(title, kicker)
            fr = (Image.alpha_composite(f.convert("RGBA"), lay).convert("RGB") for f in fr)
        clips.append(fr)
    return write(sequence(clips, fade), os.path.join(OUT, f"{name}.mp4"))


def reel_tip(data, tips, tip_id, seconds=3.6):
    post = next((t for t in tips["posts"] if t["id"] == tip_id), None)
    if not post:
        raise SystemExit(f"No tip with id '{tip_id}'")
    slides = T.render(post, data, tips)
    n, fade = int(seconds * FPS), int(0.35 * FPS)
    clips = []
    def still(img, k):
        for _ in range(k):
            yield img

    for i, s in enumerate(slides):
        if i == 0:   # a reel cannot be swiped: cover the "Swipe for more" line
            s = s.copy(); ImageDraw.Draw(s).rectangle([0, s.height - 120, s.width, s.height], fill=T.BG)
        bg = ImageOps.fit(slides[0], (W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(40))
        bg = Image.blend(bg, Image.new("RGB", (W, H), T.BG), 0.6)
        sl = s.resize((W, int(W * s.height / s.width)), Image.LANCZOS)
        base = bg.copy(); base.paste(sl, (0, (H - sl.height) // 2))
        hold = n + (int(1.5 * FPS) if i not in (0,) else 0)      # text slides need longer to read
        clips.append(moves(base, hold, "push") if i == 0 else still(base, hold))
    return write(sequence(clips, fade), os.path.join(OUT, f"tip-{tip_id}.mp4"))


if __name__ == "__main__":
    with open(os.path.join(ROOT, "photos.json"), encoding="utf-8") as f:
        data = json.load(f)
    a = sys.argv[1:]
    if len(a) >= 4 and a[0] == "photos":
        print(reel_photos(data, a[1], a[2], a[3:]))
    elif len(a) == 2 and a[0] == "tip":
        print(reel_tip(data, T.load_tips(), a[1]))
    else:
        print(__doc__)
