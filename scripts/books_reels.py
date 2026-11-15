#!/usr/bin/env python3
"""Make a Reel (1080 x 1920, 30 fps, MP4) from a quote, talk or excerpt post in books/posts.json.

Used by scripts/books_instagram.py on the post's day. To preview by hand:
  python scripts/books_reels.py n13-noisy-replay      (writes books/instagram/preview/<id>.mp4)

The look: one sentence at a time, in large type, each over its own picture, with slow movement
on every picture and a dissolve between them. The pictures come from the book's "reel_images" in
posts.json: details of the cover ("cover@x0,y0,x1,y1", as fractions of the cover) and pictures in
the repository ("books/reels/img-name.jpg", or with "@0.4" to centre on a point 40% across).
Every sentence stays up long enough to read comfortably; a long one gets a second picture part of
the way through. The reel ends on the cover with where to find the book.

Reels are silent, for music to be added in Instagram. A post with "music": true gets the generated
score below instead (made here from scratch, so there is nothing to license).

Needs numpy, Pillow and ffmpeg (the system one, or the one in the imageio-ffmpeg package).
"""
import json, math, os, re, shutil, subprocess, sys, tempfile, wave, zlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import books_cards as bc  # noqa: E402

W, H, FPS = 1080, 1920, 30
SR = 48000
X0, X1 = 96, W - 150          # keep clear of the like, comment and share buttons on the right
LABEL_Y = 300                 # below Instagram's top bar, inside the 4:5 feed crop
Y0, Y1 = 390, 1390            # the words stay inside the feed crop and above the caption
END = 4.0                     # seconds the end card stays up
XF = 0.8                      # dissolve into the end card
SHOT_XF = 0.6                 # dissolve between pictures
SHOT_MAX = 4.8                # a picture stays up about this long at most
READ_MIN, READ_WPS, READ_PAD = 2.8, 2.4, 1.2   # reading time: at least 2.8 s, 2.4 words a second, plus 1.2 s
MAX_LEN = 50.0                # longest reel, in seconds
BASE = 1.16                   # pictures are prepared a little larger than the frame, for the movement
REEL_TYPES = ("quote", "talk", "excerpt")
ROOT = os.path.dirname(bc.BOOKS)


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ---------- words ----------
def split_long(sentence, most=20):
    """A long sentence is shown in two parts, broken after a comma, colon or semicolon near its middle."""
    words = sentence.split()
    if len(words) <= most:
        return [sentence]
    marks = [i for i, w in enumerate(words[:-3]) if i >= 3 and w[-1] in ",;:"]
    if not marks:
        return [sentence]
    i = min(marks, key=lambda k: abs(k - len(words) / 2))
    return split_long(" ".join(words[:i + 1]), most) + split_long(" ".join(words[i + 1:]), most)


def chunks_of(text, most=8):
    """Split into sentences, the unit the words arrive in. Long sentences are shown in two parts;
    short ones are joined so there are at most eight."""
    text = bc.smart(" ".join(text.split()))
    parts = [s for s in re.split(r"(?<=[.!?”])\s+(?=[“‘A-Z0-9])", text) if s]
    parts = [q for s in parts for q in split_long(s)]
    while len(parts) > most:
        i = min(range(len(parts) - 1), key=lambda k: len(parts[k]) + len(parts[k + 1]))
        parts[i:i + 2] = [parts[i] + " " + parts[i + 1]]
    return parts


def layout(draw, chunks, fname, width, height, start, smallest, leading):
    """Wrap a run of chunks as one paragraph. Returns the font, line step and a list of lines,
    each a list of (x offset, text, chunk index)."""
    words = [(w, i) for i, c in enumerate(chunks) for w in c.split()]
    for size in list(range(start, smallest - 1, -2)) + [smallest]:
        f = bc.font(fname, size)
        lines, cur = [], []
        for w, i in words:
            test = " ".join(x for x, _ in cur + [(w, i)])
            if cur and draw.textlength(test, font=f) > width:
                lines.append(cur)
                cur = []
            cur.append((w, i))
        if cur:
            lines.append(cur)
        step = size * leading
        fits = all(draw.textlength(" ".join(x for x, _ in ln), font=f) <= width for ln in lines)
        if (fits and len(lines) * step <= height) or size == smallest:
            break
    out = []
    for ln in lines:
        runs, k = [], 0
        while k < len(ln):
            j = k
            while j < len(ln) and ln[j][1] == ln[k][1]:
                j += 1
            before = " ".join(x for x, _ in ln[:k])
            x = draw.textlength(before + " ", font=f) if before else 0
            runs.append((x, " ".join(x for x, _ in ln[k:j]), ln[k][1]))
            k = j
        out.append(runs)
    return f, step, out


def text_layer(lines, f, step, x, y, fill, which):
    """One transparent layer holding the words of chunk `which`, with a soft shadow for legibility."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for n, runs in enumerate(lines):
        for dx, txt, i in runs:
            if i == which:
                d.text((x + dx, y + n * step), txt, font=f, fill=fill + (255,))
    return with_shadow(layer)


def with_shadow(layer):
    a = layer.getchannel("A")
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh.putalpha(a.filter(ImageFilter.GaussianBlur(9)).point(lambda v: v * 0.55))
    return Image.alpha_composite(sh, layer)


def single(draw_fn):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer))
    return with_shadow(layer)


def end_status(post, book):
    if post.get("end"):
        return post["end"]
    if book.get("status") == "out":
        return "Out now"
    return "Expected release " + book["release"] if book.get("release") else "Coming soon"


# ---------- the plan for one reel ----------
def read_time(text):
    return max(READ_MIN, len(text.split()) / READ_WPS + READ_PAD)


def text_block(probe, text, fname, colour, start, smallest, lead, centre, tail=None, tail_colour=None):
    """One sentence as its own layer, centred on `centre`, inside the safe area."""
    f, step, lines = layout(probe, [text], fname, X1 - X0, Y1 - Y0 - (90 if tail else 0), start, smallest, lead)
    h = len(lines) * step + (70 if tail else 0)
    top = min(max(Y0, centre - h / 2), Y1 - h)
    layer = text_layer(lines, f, step, X0, top, colour, 0)
    if tail:
        y = top + len(lines) * step + 30
        tl = single(lambda d: d.text((X0, y), tail, font=bc.font("plex-mono-500", 30), fill=tail_colour + (255,)))
        layer = Image.alpha_composite(layer, tl)
    return layer


def plan(post, data):
    """Every layer of the reel and when it comes and goes, and which picture is up when."""
    book = data["books"][post["book"]]
    th = book["theme"]
    fg, ac = bc.hexrgb(th["fg"]), bc.hexrgb(th["accent"])
    kind = post["type"]
    if kind not in REEL_TYPES:
        raise ValueError(f"{post['id']}: a reel needs a quote, talk or excerpt post, not '{kind}'")
    probe = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    label = post.get("label") or ("Opening lines" if kind == "excerpt" else ("From " + book["title"] if kind == "quote" else book["title"]))
    label_layer = single(lambda d: d.text((X0, LABEL_Y), label.upper(), font=bc.font("plex-mono-500", 34), fill=ac + (255,)))

    # the sentences, in order, each with its own layer
    items = []
    if kind == "talk":
        head = bc.smart(" ".join(post["headline"].split()))
        items.append((head, text_block(probe, head, "bricolage-800", fg, 132, 66, 1.04, 880)))
        for c in (chunks_of(post["sub"], 8) if post.get("sub") else []):
            items.append((c, text_block(probe, c, "source-serif-400", fg, 84, 44, 1.28, 940)))
    else:
        chunks = chunks_of(post["text"], 8)
        tail = (post.get("attribution") or book["title"]).upper()
        size = 80 if kind == "quote" else 70
        for i, c in enumerate(chunks):
            last = i == len(chunks) - 1
            items.append((c, text_block(probe, c, "source-serif-400", fg, size, 42, 1.3, 940,
                                        tail if last else None, ac)))

    # timing: every sentence gets time to be read; the reel is squeezed only if it would run very long
    reads = [read_time(t) for t, _ in items]
    reads[-1] += 0.8
    budget = MAX_LEN - END
    if sum(reads) > budget:
        k = budget / sum(reads)
        reads = [max(len(t.split()) / 3.2 + 0.8, r * k) for (t, _), r in zip(items, reads)]
    texts, shots, t = [], [], 0.0
    for i, ((txt, layer), r) in enumerate(zip(items, reads)):
        last = i == len(items) - 1
        texts.append({"img": layer, "t_in": t, "t_out": None if last else t + r - 0.3, "fade": 0.2 if i == 0 else 0.45})
        n = max(1, math.ceil(r / SHOT_MAX - 0.15))     # a long sentence gets a second picture
        for k in range(n):
            shots.append(t + r * k / n)
        t += r
    end_at = t
    total = round(end_at + END, 2)
    return {
        "book": book, "theme": th, "label": label_layer, "texts": texts, "shots": shots,
        "end_at": end_at, "duration": total, "status": end_status(post, book),
        "thumb_ms": int((end_at + 1.8) * 1000), "seed": zlib.crc32(post["id"].encode()),
        "starts": [x["t_in"] for x in texts],
    }


# ---------- pictures ----------
def picture_specs(book):
    """The book's pictures, in order: (path, crop as fractions, centre point)."""
    out = []
    for spec in book.get("reel_images") or ["cover"]:
        name, _, rest = spec.partition("@")
        if name == "cover":
            path = os.path.join(bc.BOOKS, book.get("cover") or "")
            box = tuple(float(v) for v in rest.split(",")) if rest else (0.0, 0.0, 1.0, 1.0)
            focus = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
        else:
            path = os.path.join(ROOT, name)
            box = (0.0, 0.0, 1.0, 1.0)
            focus = (float(rest) if rest else 0.5, 0.5)
        if os.path.exists(path):
            out.append((path, box, focus))
        else:
            print(f"::warning::Reel picture not found, skipped: {spec}")
    if not out and book.get("cover") and os.path.exists(os.path.join(bc.BOOKS, book["cover"])):
        out.append((os.path.join(bc.BOOKS, book["cover"]), (0.0, 0.0, 1.0, 1.0), (0.5, 0.5)))
    return out


def prepare(path, box, focus):
    """Cut the reel's shape out of a picture, staying inside the given box around its centre point,
    size it a little larger than the frame, and darken bright pictures so the words stay readable."""
    im = Image.open(path).convert("RGB")
    sw, sh = im.size
    x0, y0, x1, y1 = box[0] * sw, box[1] * sh, box[2] * sw, box[3] * sh
    w, h = x1 - x0, y1 - y0
    a = W / H
    if w / h > a:
        w = h * a          # too wide: narrow it, never grow past the box
    else:
        h = w / a          # too tall: shorten it
    cx = min(max(focus[0] * sw, x0 + w / 2), x1 - w / 2)
    cy = min(max(focus[1] * sh, y0 + h / 2), y1 - h / 2)
    im = im.crop((round(cx - w / 2), round(cy - h / 2), round(cx + w / 2), round(cy + h / 2)))
    big = im.resize((round(W * BASE), round(H * BASE)), Image.LANCZOS)
    if w < W * BASE * 0.8:   # enlarged a lot: sharpen it back up a little
        big = big.filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=2))
    lum = np.asarray(big.convert("L"), dtype=np.float32)
    mid = float(lum[int(lum.shape[0] * 0.3):int(lum.shape[0] * 0.7)].mean())
    if mid > 80:
        # bright picture: darken behind the words, less so towards the top and bottom
        k = 80.0 / mid
        y = np.linspace(0, 1, big.height, dtype=np.float32)[:, None, None]
        rows = 1.0 - (1.0 - k) * (0.35 + 0.65 * np.exp(-((y - 0.5) / 0.28) ** 2))
        big = Image.fromarray(np.clip(np.asarray(big, dtype=np.float32) * rows, 0, 255).astype(np.uint8))
    elif mid < 55:
        # very dark picture: lift it a little
        k = min(1.3, 55.0 / max(mid, 1.0))
        big = Image.eval(big, lambda v: min(255, int(v * k)))
    return big


def scrim():
    """Darkening that keeps the pictures visible and the words readable: lighter at the top,
    darkest behind the words, a little lighter again at the bottom."""
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    band = np.exp(-((y - 0.5) / 0.26) ** 2)
    keep = 0.70 - 0.30 * band
    return np.repeat(keep, W, axis=1)[:, :, None]


def moving(big, t, t0, t1, n):
    """A slow push in or pull out across the picture's time on screen, different for each picture."""
    bw, bh = big.size
    prog = ease((t - t0) / max(0.1, t1 - t0))
    zin = n % 2 == 0
    z = 1.0 + 0.11 * (prog if zin else 1 - prog)
    ww, wh = bw / z, bh / z
    drift = [(1, 0), (-1, 0), (0, 1), (0, -1)][n % 4]
    cx = bw / 2 + drift[0] * (bw - ww) / 2 * (prog - 0.5)
    cy = bh / 2 + drift[1] * (bh - wh) / 2 * (prog - 0.5)
    return big.resize((W, H), Image.BILINEAR, box=(cx - ww / 2, cy - wh / 2, cx + ww / 2, cy + wh / 2))


def vignette():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H * 0.47) / (H * 0.6)) ** 2)
    return np.clip(1.08 - 0.55 * r ** 2.2, 0.35, 1.0).astype(np.float32)


def end_card(p):
    th = p["theme"]
    fg, ac, bg = bc.hexrgb(th["fg"]), bc.hexrgb(th["accent"]), bc.hexrgb(th["bg"])
    book = p["book"]
    shade = Image.new("RGBA", (W, H), bg + (150,))
    top = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(top)
    d.text((W // 2, LABEL_Y + 14), p["status"].upper(), font=bc.font("plex-mono-500", 32), fill=ac + (255,), anchor="mm")
    cov = bc.cover_image(book, 800)
    cy = 372
    if cov:
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        x = (W - cov.width) // 2
        ImageDraw.Draw(sh).rectangle((x + 16, cy + 26, x + cov.width + 16, cy + cov.height + 26), fill=(0, 0, 0, 170))
        top = Image.alpha_composite(sh.filter(ImageFilter.GaussianBlur(26)), top)
        top.paste(cov, (x, cy))
        d = ImageDraw.Draw(top)
        below = cy + cov.height + 58
    else:
        f, lines, step = bc.fit(d, book["title"], "bricolage-800", X1 - X0, 600, 130, 60, 1.04)
        bc.draw_lines(d, lines, f, X0, 520, step, ac + (255,))
        below = 1180
    d.text((W // 2, below), book["byline"], font=bc.font("bricolage-800", 46), fill=fg + (255,), anchor="mm")
    d.text((W // 2, below + 64), "grantanthony.co.uk/books", font=bc.font("plex-mono-500", 30), fill=fg + (255,), anchor="mm")
    return shade, top


def frames(p):
    specs = picture_specs(p["book"])
    cache = {}

    def pic(i):
        k = i % len(specs)
        if k not in cache:
            cache[k] = prepare(*specs[k])
        return cache[k]

    keep = scrim() * vignette()[:, :, None]
    shade, top = end_card(p)
    shots = p["shots"]
    total = p["duration"]
    n = int(round(total * FPS))
    for fi in range(n):
        t = fi / FPS
        i = max(k for k, st in enumerate(shots) if st <= t + 1e-6)
        t0 = shots[i]
        t1 = shots[i + 1] if i + 1 < len(shots) else total
        frame = moving(pic(i), t, t0, t1 + SHOT_XF, i)
        if i > 0 and t - t0 < SHOT_XF:     # dissolve from the previous picture
            prev = moving(pic(i - 1), t, shots[i - 1], t0 + SHOT_XF, i - 1)
            frame = Image.blend(prev, frame, ease((t - t0) / SHOT_XF))
        arr = np.asarray(frame, dtype=np.float32) * keep
        frame = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert("RGBA")

        endp = ease((t - p["end_at"]) / XF) if t >= p["end_at"] else 0.0
        words = 1.0 - endp
        if words > 0:
            frame = over(frame, p["label"], ease(t / 0.3) * words)
            for L in p["texts"]:
                if t < L["t_in"]:
                    continue
                k = ease((t - L["t_in"]) / L["fade"])
                if L["t_out"] is not None and t >= L["t_out"]:
                    k *= 1.0 - ease((t - L["t_out"]) / 0.3)
                if k > 0.002:
                    frame = over(frame, L["img"], k * words, dy=int(round(20 * (1 - ease((t - L["t_in"]) / L["fade"])))))
        if endp > 0:
            frame = over(frame, shade, endp)
            rise = ease((t - p["end_at"]) / 0.9)
            frame = over(frame, top, endp, dy=int(round(46 * (1 - rise))))
        yield np.asarray(frame.convert("RGB")).tobytes()


def over(base, layer, alpha, dy=0):
    if alpha >= 0.999:
        src = layer
    else:
        src = layer.copy()
        src.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
    if dy:
        base.alpha_composite(src.crop((0, 0, W, H - dy)), dest=(0, dy))
    else:
        base.alpha_composite(src)
    return base


# ---------- sound ----------
def score(p, path):
    """An original cue: a low minor pad, a soft hit as each sentence lands, a lift into the cover."""
    dur = p["duration"]
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(p["seed"])
    root = [49.0, 51.91, 55.0, 58.27, 61.74, 65.41][p["seed"] % 6]
    L = np.zeros(n)
    R = np.zeros(n)
    for f, amp in ((root, 1.0), (root * 1.5, 0.55), (root * 2, 0.5), (root * 2 * 1.1892, 0.32), (root * 3, 0.18)):
        for det, pan in ((-0.0035, 0.25), (0.0035, 0.75)):
            ff = f * (1 + det)
            v = sum(np.sin(2 * np.pi * ff * k * t + rng.uniform(0, 6.28)) / k ** 1.8 for k in range(1, 8))
            L += v * amp * (1 - pan)
            R += v * amp * pan
    move = 0.82 + 0.18 * np.sin(2 * np.pi * 0.09 * t + 1.0)
    env = np.clip(0.35 + t / 1.6, 0, 1) * np.clip((dur - t) / 0.9, 0, 1)
    env *= 1 + 0.35 * np.clip((t - (p["end_at"] - 1.5)) / 1.5, 0, 1)
    pad = 0.08 * move * env
    L *= pad
    R *= pad

    def add(at, sig, gain=1.0, pan=0.5):
        i = int(at * SR)
        if i >= n:
            return
        s = sig[: n - i] * gain
        L[i:i + len(s)] += s * (1.2 - pan)
        R[i:i + len(s)] += s * (0.2 + pan)

    def hit(depth=1.0, length=1.8):
        m = int(length * SR)
        tt = np.arange(m) / SR
        f = (36 + 52 * np.exp(-tt * 10)) * depth
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 2.6)
        click = np.convolve(rng.normal(0, 1, m), np.ones(24) / 24, "same") * np.exp(-tt * 40) * 0.5
        return body + click

    for i, st in enumerate(p["starts"]):
        add(max(0.0, st - 0.02), hit(), 0.34 if i else 0.42)
    # a lift into the end card, then a deeper hit and a bell when the cover lands
    m = int(1.6 * SR)
    tt = np.arange(m) / SR
    lift = np.sin(2 * np.pi * np.cumsum(280 + 520 * (tt / 1.6) ** 2) / SR) * (tt / 1.6) ** 2.5 * 0.08
    lift += np.convolve(rng.normal(0, 1, m), np.ones(6) / 6, "same") * (tt / 1.6) ** 3 * 0.09
    add(p["end_at"] - 1.6, lift)
    add(p["end_at"], hit(0.85, 2.6), 0.5)
    m = int(3.0 * SR)
    tt = np.arange(m) / SR
    bell = (np.sin(2 * np.pi * root * 8 * tt) + 0.5 * np.sin(2 * np.pi * root * 12.01 * tt) + 0.25 * np.sin(2 * np.pi * root * 16.02 * tt)) * np.exp(-tt * 1.6) * 0.07
    add(p["end_at"] + 0.02, bell, 1.0, 0.35)

    # a little room around it all
    m = int(1.8 * SR)
    tt = np.arange(m) / SR
    size = 1 << int(math.ceil(math.log2(n + m)))
    for ch in (L, R):
        ir = rng.normal(0, 1, m) * np.exp(-tt / 0.42)
        ir /= np.sqrt((ir ** 2).sum())
        wet = np.fft.irfft(np.fft.rfft(ch, size) * np.fft.rfft(ir, size), size)[:n]
        ch += 0.32 * wet
    fade = np.clip((dur - t) / 0.6, 0, 1)
    mix = np.stack([L * fade, R * fade], axis=1)
    mix = np.tanh(mix * 2.0) / 2.0
    mix *= 0.89 / max(1e-6, np.abs(mix).max())
    pcm = (mix * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ---------- encoding ----------
def ffmpeg_exe():
    exe = os.environ.get("FFMPEG") or shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        raise RuntimeError("ffmpeg was not found. Install it, or pip install imageio-ffmpeg.")


def save(post, data, out_dir):
    """Write <id>.mp4 for a post. Returns (path, details) where details has the length and the
    point (in milliseconds) to use as the cover frame."""
    os.makedirs(out_dir, exist_ok=True)
    p = plan(post, data)
    out = os.path.join(out_dir, post["id"] + ".mp4")
    with tempfile.TemporaryDirectory() as tmp:
        if post.get("music"):
            wav = os.path.join(tmp, "score.wav")
            score(p, wav)
            audio = ["-i", wav]
        else:
            # silent: an empty sound track, which Instagram expects a video to have
            audio = ["-f", "lavfi", "-t", str(p["duration"]), "-i", "anullsrc=r=48000:cl=stereo"]
        cmd = [ffmpeg_exe(), "-y", "-loglevel", "error",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
               *audio,
               "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
               "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-maxrate", "5M", "-bufsize", "10M",
               "-profile:v", "high", "-g", "60", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
               "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
               "-shortest", "-movflags", "+faststart", "-use_editlist", "0", out]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        try:
            for fr in frames(p):
                proc.stdin.write(fr)
        finally:
            proc.stdin.close()
        if proc.wait() != 0:
            raise RuntimeError("ffmpeg could not make the reel.")
    return out, {"duration": p["duration"], "thumb_ms": p["thumb_ms"]}


def wants_reel(post):
    """Quote, talk and excerpt posts become reels unless the post says "format": "image"."""
    fmt = post.get("format")
    if fmt in ("image", "reel"):
        return fmt == "reel" and post["type"] in REEL_TYPES
    return post["type"] in REEL_TYPES


if __name__ == "__main__":
    data = json.load(open(os.path.join(bc.BOOKS, "posts.json"), encoding="utf-8"))
    out = os.path.join(bc.BOOKS, "instagram", "preview")
    only = sys.argv[1:]
    for post in data["posts"]:
        if (not only and wants_reel(post)) or post["id"] in only:
            path, info = save(post, data, out)
            print(path, f"{info['duration']}s", f"cover frame at {info['thumb_ms']} ms")
