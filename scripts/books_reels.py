#!/usr/bin/env python3
"""Make a short Reel (1080 x 1920, 30 fps, MP4) from a quote, talk or excerpt post in books/posts.json.

Used by scripts/books_instagram.py at posting time. To preview by hand:
  python scripts/books_reels.py n13-noisy-replay      (writes books/instagram/preview/<id>.mp4)

The look: the book's cover, blurred and darkened, drifting slowly behind the words. The words
arrive a sentence at a time, the first one straight away, then the cover itself appears with
where to find the book. The music is generated here from scratch for every reel, so there is
nothing to license and Instagram shows it as original audio.

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
END = 3.4                     # seconds the end card stays up
XF = 0.7                      # crossfade into the end card
MAX_LEN = 22.0                # longest reel, in seconds
REEL_TYPES = ("quote", "talk", "excerpt")


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ---------- words ----------
def chunks_of(text, most=6):
    """Split into sentences, the unit the words arrive in. Short ones are joined so there are at most six."""
    text = bc.smart(" ".join(text.split()))
    parts = [s for s in re.split(r"(?<=[.!?”])\s+(?=[“‘A-Z0-9])", text) if s]
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
def read_time(chunk):
    return max(1.5, len(chunk.split()) / 3.2 + 0.7)


def plan(post, data):
    """Work out every layer of the reel and when it comes and goes.
    Short quotes build up a sentence at a time. Longer text (a talk's paragraph, an excerpt, a long
    quote) shows one sentence at a time in large type, each replacing the last, like a trailer."""
    book = data["books"][post["book"]]
    th = book["theme"]
    fg, ac = bc.hexrgb(th["fg"]), bc.hexrgb(th["accent"])
    kind = post["type"]
    probe = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    width = X1 - X0
    layers = []   # dicts: img, t_in, t_out (None = stays), fade

    def keep(img, t_in, t_out=None, fade=0.5):
        layers.append({"img": img, "t_in": t_in, "t_out": t_out, "fade": fade})

    label = post.get("label") or ("Opening lines" if kind == "excerpt" else ("From " + book["title"] if kind == "quote" else book["title"]))
    keep(single(lambda d: d.text((X0, LABEL_Y), label.upper(), font=bc.font("plex-mono-500", 34), fill=ac + (255,))), 0.0, fade=0.3)

    if kind not in REEL_TYPES:
        raise ValueError(f"{post['id']}: a reel needs a quote, talk or excerpt post, not '{kind}'")

    if kind == "talk":
        head = bc.smart(" ".join(post["headline"].split()))
        hf, hstep, hlines = layout(probe, [head], "bricolage-800", width, 520, 132, 64, 1.04)
        hh = len(hlines) * hstep
        seq = chunks_of(post.get("sub", ""), 6) if post.get("sub") else []
        box_top, box_h = Y0 + hh + 60, Y1 - Y0 - hh - 60
        t = read_time(head) if seq else max(2.6, read_time(head))
        fname, start, smallest, lead, colour = "source-serif-400", 78, 40, 1.3, fg
        build = False
        tail = None
    else:
        chunks = chunks_of(post["text"], 6)
        long = kind == "excerpt" or len(post["text"].split()) > 42
        mark = 0
        if kind == "quote":
            mark = 150
        box_top, box_h = Y0 + mark, Y1 - Y0 - mark - 90
        if long:
            seq = chunks
            fname, start, smallest, lead, colour = "source-serif-400", 84, 42, 1.3, fg
            build = False
        else:
            seq = chunks
            fname, start, smallest, lead, colour = "source-serif-400", 96, 46, 1.28, fg
            build = True
        t = 0.0
        tail = (post.get("attribution") or book["title"]).upper()

    # Lay the words out
    blocks = []   # (layer, bottom edge)
    top = box_top
    if build:
        f, step, lines = layout(probe, seq, fname, width, box_h, start, smallest, lead)
        bh = len(lines) * step
        top = box_top + max(0, (box_h - bh) * 0.38)
        blocks = [(text_layer(lines, f, step, X0, top, colour, i), top + bh) for i in range(len(seq))]
    elif seq:
        # one size for every sentence: the largest at which the longest one still fits
        size = start
        while size > smallest:
            if all(len(layout(probe, [c], fname, width, box_h, size, size, lead)[2]) * size * lead <= box_h for c in seq):
                break
            size -= 2
        laid = [layout(probe, [c], fname, width, box_h, size, size, lead) for c in seq]
        tallest = max(len(lines) * step for f, step, lines in laid)
        if kind != "talk":
            top = box_top + max(0, (box_h - tallest) * 0.32)
        else:
            # centre the headline and the tallest sentence together
            top = Y0 + max(0, (Y1 - Y0 - (hh + 60 + tallest)) * 0.4) + hh + 60
        for f, step, lines in laid:
            blocks.append((text_layer(lines, f, step, X0, top, colour, 0), top + len(lines) * step))

    if kind == "talk":
        y_head = (top - hh - 60) if seq else Y0 + (Y1 - Y0 - hh) * 0.35
        keep(text_layer(hlines, hf, hstep, X0, y_head, ac, 0), 0.0, fade=0.25)
    if kind == "quote":
        keep(single(lambda d: d.text((X0 - 10, top - 190), "\u201c", font=bc.font("bricolage-800", 220), fill=ac + (255,))), 0.0, fade=0.25)

    # Timing: the first words are on screen within a quarter of a second (the hook), then each
    # sentence gets long enough to be read before the next arrives.
    reads = [read_time(c) for c in seq]
    budget = MAX_LEN - END - 1.2 - t
    if reads and sum(reads) > budget:
        k = budget / sum(reads)
        reads = [max(1.2, r * k) for r in reads]
    starts = []
    for i, (img, bottom) in enumerate(blocks):
        st = t
        starts.append(st)
        out = None if (build or i == len(blocks) - 1) else st + reads[i]
        keep(img, st, out, fade=0.25 if st == 0 else 0.45)
        t += reads[i]
        if not build and i < len(blocks) - 1:
            t += 0.15
    if tail:
        last_bottom = max(b for _, b in blocks)
        keep(single(lambda d: d.text((X0, last_bottom + 30), tail, font=bc.font("plex-mono-500", 30), fill=ac + (255,))),
             (starts[-1] + 0.5) if starts else 0.5)
    if kind == "talk":
        starts = [0.0] + starts
    end_at = t + 0.9
    total = round(end_at + END, 2)
    return {
        "book": book, "theme": th, "layers": layers, "starts": starts,
        "end_at": end_at, "duration": total, "status": end_status(post, book),
        "thumb_ms": int((end_at - 0.25) * 1000), "seed": zlib.crc32(post["id"].encode()),
    }


# ---------- pictures ----------
def backdrop(book):
    th = book["theme"]
    path = os.path.join(bc.BOOKS, book.get("cover") or "")
    bg = bc.hexrgb(th["bg"])
    if book.get("cover") and os.path.exists(path):
        cov = Image.open(path).convert("RGB")
        k = max(W * 1.2 / cov.width, H * 1.2 / cov.height)
        # blurred hard enough that the cover's own lettering melts into colour and light
        small = cov.resize((cov.width // 4, cov.height // 4), Image.LANCZOS).filter(ImageFilter.GaussianBlur(9))
        big = small.resize((round(cov.width * k), round(cov.height * k)), Image.BICUBIC).filter(ImageFilter.GaussianBlur(6))
        big = Image.blend(big, Image.new("RGB", big.size, bg), 0.5)
        # darker for bright covers, so the words always stand out
        mean = float(np.asarray(big.convert("L"), dtype=np.float32).mean())
        k = min(0.7, 34.0 / max(mean, 1.0))
        big = Image.eval(big, lambda v: int(v * k))
    else:
        big = bc.background(th).resize((round(W * 1.2), round(H * 1.2)))
    return big


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
    big = backdrop(p["book"])
    bw, bh = big.size
    vig = vignette()[:, :, None]
    shade, top = end_card(p)
    total = p["duration"]
    n = int(round(total * FPS))
    for fi in range(n):
        t = fi / FPS
        prog = ease(t / total)
        z = 1.0 + 0.09 * prog
        ww, wh = W * 1.12 / z, H * 1.12 / z
        cx, cy = bw / 2 + 18 * math.sin(t * 0.35), bh / 2 - 40 + 80 * prog
        frame = big.resize((W, H), Image.BILINEAR, box=(cx - ww / 2, cy - wh / 2, cx + ww / 2, cy + wh / 2)).convert("RGBA")

        endp = ease((t - p["end_at"]) / XF) if t >= p["end_at"] else 0.0
        words = 1.0 - endp
        if words > 0:
            for L in p["layers"]:
                k = ease((t - L["t_in"]) / L["fade"]) if t >= L["t_in"] else 0.0
                if L["t_out"] is not None and t >= L["t_out"]:
                    k *= 1.0 - ease((t - L["t_out"]) / 0.35)
                if k > 0.002:
                    rise = ease((t - L["t_in"]) / L["fade"])
                    frame = over(frame, L["img"], k * words, dy=int(round(22 * (1 - rise))))
        if endp > 0:
            frame = over(frame, shade, endp)
            rise = ease((t - p["end_at"]) / 0.9)
            frame = over(frame, top, endp, dy=int(round(46 * (1 - rise))))
        arr = np.asarray(frame.convert("RGB"), dtype=np.float32) * vig
        yield np.clip(arr, 0, 255).astype(np.uint8).tobytes()


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
        wav = os.path.join(tmp, "score.wav")
        score(p, wav)
        cmd = [ffmpeg_exe(), "-y", "-loglevel", "error",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
               "-i", wav,
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
    """Quote, talk and excerpt posts go out as reels unless the post says "format": "image"."""
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
