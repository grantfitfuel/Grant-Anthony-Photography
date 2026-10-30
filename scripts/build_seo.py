"""Search engine pages and data for grantanthony.co.uk.

Run by .github/workflows/seo.yml whenever photos or books change (or by hand: python scripts/build_seo.py).
It writes:
  books/<book>/index.html   one page per book, built from the cards on books/index.html
                            and the excerpts in books/posts.json (posts on hold are left out)
  books/notes/...           the Notes section, built from the text files in books/notes/posts
                            (see books/notes/HOW-TO.md); the latest notes also go on books/index.html
  index.html                the structured data block between the seo markers (photos as ImageObjects)
  sitemap.xml               every page, with images
Everything else is left alone. Running it twice on the same day gives the same result.
"""
import html, json, os, re, struct
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://grantanthony.co.uk"
BOOKS = SITE + "/books/"
AUTHOR_ID = BOOKS + "#author"
# where the small line above a book's title is not a description of the book, say what it is about instead
ABOUT = {"the-noisy-mind": "Living with an overactive brain"}
# genre for search engines where the series line does not say it
GENRE = {"echoes-of-the-shattered": "Fantasy", "cradles-veil": "Fantasy", "when-realms-become-one": "Fantasy"}


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


def write_if_changed(p, text):
    full = os.path.join(ROOT, p)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    if os.path.exists(full) and read(p) == text:
        return False
    with open(full, "w", encoding="utf-8") as f:
        f.write(text)
    return True


def jpeg_size(p):
    """Width and height of a JPEG, without needing Pillow."""
    with open(os.path.join(ROOT, p), "rb") as f:
        data = f.read()
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    return None, None


def text_of(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def clip(s, n=158):
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= n:
        return s
    cut = s[:n].rsplit(" ", 1)[0].rstrip(",;:")
    return cut + "..."


def esc(s):
    return html.escape(s, quote=True)


def ld(obj):
    return '<script type="application/ld+json">\n' + json.dumps(obj, indent=1, ensure_ascii=False).replace("</", "<\\/") + "\n</script>"


# ---------------------------------------------------------------- books

def parse_books(page):
    nf_at = page.find('id="nonfiction"')
    books = []
    for m in re.finditer(r'<article class="book" id="([^"]+)">(.*?)</article>', page, re.S):
        slug, body = m.group(1), m.group(2)
        g = lambda pat: (re.search(pat, body, re.S) or [None, None])[1]
        status_html = g(r'<span class="status[^"]*">(.*?)</span>') or ""
        out = 'class="status out"' in body
        b = {
            "slug": slug,
            "title": text_of(g(r"<h3>(.*?)</h3>")),
            "series": text_of(g(r'<p class="series">(.*?)</p>') or ""),
            "tag": text_of(g(r'<p class="tag">(.*?)</p>') or ""),
            "blurb": text_of(g(r'<p class="blurb">(.*?)</p>') or ""),
            "cover": g(r'<img class="cover[^"]*" src="([^"]+)"'),
            "buy": html.unescape(g(r'<a class="buy" href="([^"]+)"') or ""),
            "out": out,
            "status": "Out now" if out else re.sub(r"\s+", " ", text_of(status_html.replace("</small>", "</small> "))),
            "fiction": nf_at < 0 or m.start() < nf_at,
        }
        b["byline"] = "Grant C Anthony" if b["fiction"] else "G C Anthony"
        large = b["cover"].replace(".jpg", "-large.jpg")
        b["cover_large"] = large if os.path.exists(os.path.join(ROOT, "books", large)) else b["cover"]
        books.append(b)
    return books


def book_extras(b, posts):
    """Excerpts, quotes and notes for a book, taken from posts that are not on hold."""
    key = next((k for k, v in posts["books"].items() if v["title"] == b["title"]), None)
    opening, quotes, notes = [], [], []
    if key:
        for p in posts["posts"]:
            if p.get("book") != key or p.get("hold"):
                continue
            t = p.get("type")
            if t == "carousel" and not opening:
                opening = [s["text"] for s in p.get("slides", []) if s.get("type") == "page" and s.get("text")]
            elif t == "excerpt" and p.get("text"):
                quotes.append((p["text"], p.get("attribution", "")))
            elif t == "quote" and p.get("text"):
                quotes.append((p["text"], ""))
            elif t == "talk" and p.get("headline"):
                notes.append((p.get("label", ""), p["headline"], p.get("sub", "")))
    # a book can name its own lines for the web page (books.<key>.lines); otherwise the quote posts are used
    if key and posts["books"][key].get("opening"):
        opening = list(posts["books"][key]["opening"])
    if key and posts["books"][key].get("lines"):
        quotes = [(t, "") for t in posts["books"][key]["lines"]]
    return key, opening, quotes, notes


EXTRA_CSS = """
.bp{padding-block:40px 24px}
.crumbs{font:500 .72rem/1.4 var(--mono);text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin:0 0 28px}
.crumbs a{text-decoration:none;color:var(--muted)} .crumbs a:hover{color:var(--ink)}
.bp-grid{display:grid;grid-template-columns:minmax(0,340px) 1fr;gap:48px;align-items:start}
.bp-cover{width:100%;height:auto;border-radius:6px;box-shadow:0 30px 60px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.06);transform:rotate(-2deg)}
.bp h1{font:800 clamp(2.4rem,6vw,4.2rem)/.95 var(--display);letter-spacing:-.03em;margin:8px 0 6px}
.bp .by{font:500 .8rem/1.4 var(--mono);text-transform:uppercase;letter-spacing:.14em;color:var(--muted);margin:0 0 18px}
.bp .by a{text-decoration:none} .bp .by a:hover{color:var(--ink)}
.bp .tag{font-style:italic;color:var(--sun);font-size:1.2rem;margin:0 0 16px}
.bp .blurb{max-width:62ch}
.bp .act{margin-top:22px}
.fic .bp h1{color:var(--fic)} .nf .bp h1{color:var(--nf)}
.read{border-top:1px solid var(--rule);padding-block:44px}
.read h2,.more h2{font:800 1.9rem/1 var(--display);letter-spacing:-.02em;margin:6px 0 22px}
.read .pages{max-width:66ch}
.read .pages p{margin:0 0 16px}
.read .pages p:first-child{font-size:1.18rem}
.quotes{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:8px}
.quotes blockquote{margin:0;padding:20px 22px;border:1px solid var(--rule);border-radius:14px;background:var(--deep);font-style:italic}
.quotes cite{display:block;margin-top:10px;font:500 .7rem/1.3 var(--mono);font-style:normal;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}
.note{max-width:66ch;margin-top:28px}
.note b{display:block;font:800 1.35rem/1.1 var(--display);margin:6px 0 8px}
.more{border-top:1px solid var(--rule);padding-block:44px 64px}
.more .row{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:22px}
.more a{text-decoration:none;display:block}
.more img{width:100%;height:auto;aspect-ratio:2/3;object-fit:cover;border-radius:4px;box-shadow:0 12px 26px rgba(0,0,0,.4)}
.more a span{display:block;margin-top:8px;font:700 .95rem/1.2 var(--display)}
@media (max-width:760px){.bp-grid{grid-template-columns:1fr;gap:28px}.bp-cover{max-width:240px}}
"""


def book_page(b, all_books, posts, style, book_notes=()):
    key, opening, quotes, notes = book_extras(b, posts)
    url = BOOKS + b["slug"] + "/"
    cover_abs = BOOKS + b["cover_large"]
    w, h = jpeg_size("books/" + b["cover_large"])
    series_plain = ABOUT.get(b["slug"], b["series"]).replace(" · ", ", ")
    title = f'{b["title"]} by {b["byline"]} | {series_plain}'
    desc = clip(f'{b["title"]} by {b["byline"]}. {b["blurb"]}')
    status = b["status"]

    # structured data
    book = {
        "@type": "Book", "@id": url + "#book", "name": b["title"], "url": url,
        "author": {"@type": "Person", "@id": AUTHOR_ID, "name": b["byline"]},
        "genre": GENRE.get(b["slug"], series_plain), "description": b["blurb"], "image": cover_abs, "inLanguage": "en-GB",
    }
    if b["fiction"]:
        book["publisher"] = {"@type": "Organization", "name": "Levern Press"}
    sm = re.match(r"(.+?) · Book (\w+)$", b["series"])
    if sm:
        book["isPartOf"] = {"@type": "BookSeries", "name": sm.group(1)}
        words = ["One", "Two", "Three", "Four", "Five"]
        if sm.group(2) in words:
            book["position"] = words.index(sm.group(2)) + 1
    if b["out"] and b["buy"]:
        book["sameAs"] = b["buy"]
    else:
        book["creativeWorkStatus"] = status
    if b["tag"]:
        book["alternativeHeadline"] = b["tag"]
    graph = [
        {"@type": "WebPage", "@id": url, "url": url, "name": title, "description": desc, "inLanguage": "en-GB",
         "isPartOf": {"@id": BOOKS}, "primaryImageOfPage": {"@type": "ImageObject", "url": cover_abs},
         "mainEntity": {"@id": url + "#book"}, "breadcrumb": {"@id": url + "#crumbs"}},
        book,
        {"@type": "BreadcrumbList", "@id": url + "#crumbs", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Books", "item": BOOKS},
            {"@type": "ListItem", "position": 2, "name": b["title"], "item": url}]},
    ]

    act = (f'<span class="status out">Out now</span><a class="buy" href="{esc(b["buy"])}" target="_blank" rel="noopener">Find it on Amazon</a>'
           if b["out"] else f'<span class="status due"><small>Expected release</small>{esc(status.replace("Expected release", "").strip())}</span>')
    read = ""
    if opening or quotes or notes:
        read += '<section class="read wrap">'
        if opening:
            read += f'<span class="label">From the book</span><h2>{"The opening" if b["fiction"] else "From the opening"}</h2><div class="pages">'
            read += "".join(f"<p>{esc(t)}</p>" for t in opening) + "</div>"
        if quotes:
            read += ('<span class="label" style="display:block;margin-top:34px">Lines</span>' if opening else '<span class="label">Lines</span>')
            read += '<div class="quotes">' + "".join(
                f'<blockquote>{esc(t)}<cite>{esc(a or b["title"])}</cite></blockquote>' for t, a in quotes[:4]) + "</div>"
        for label, head, sub in notes[:2]:
            read += f'<div class="note"><span class="label">{esc(label or "Behind the book")}</span><b>{esc(head)}</b><p>{esc(sub)}</p></div>'
        read += "</section>"
    if book_notes:
        read += ('<section class="read wrap"><span class="label">Notes</span><h2>Read more</h2><div class="nlist">'
                 + "".join(note_link(n) for n in book_notes) + "</div></section>")

    same =[o for o in all_books if o["slug"] != b["slug"] and o["fiction"] == b["fiction"]]
    more = '<section class="more wrap"><span class="label">More by ' + esc(b["byline"]) + '</span><h2>Other books</h2><div class="row">' + "".join(
        f'<a href="{o["slug"]}/"><img src="{esc(o["cover"])}" alt="Cover of {esc(o["title"])}" width="200" height="300" loading="lazy"><span>{esc(o["title"])}</span></a>'
        for o in same) + "</div></section>"

    side = "fic" if b["fiction"] else "nf"
    handle = "grantcanthony" if b["fiction"] else "g_c_anthony"
    shelf = "#fiction" if b["fiction"] else "#nonfiction"
    head = f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<base href="/books/">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="author" content="{esc(b["byline"])}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="{url}">
<meta property="og:type" content="book">
<meta property="og:site_name" content="Grant C Anthony">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="{esc(b["title"])} by {esc(b["byline"])}">
<meta property="og:description" content="{esc(clip(b["tag"] or b["blurb"], 200))}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{cover_abs}">
{f'<meta property="og:image:width" content="{w}">' + chr(10) + f'<meta property="og:image:height" content="{h}">' + chr(10) if w else ""}<meta property="og:image:alt" content="Cover of {esc(b["title"])} by {esc(b["byline"])}">
<meta property="book:tag" content="{esc(GENRE.get(b["slug"], series_plain))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(b["title"])} by {esc(b["byline"])}">
<meta name="twitter:description" content="{esc(clip(b["tag"] or b["blurb"], 200))}">
<meta name="twitter:image" content="{cover_abs}">
<meta name="theme-color" content="#100f24">
<link rel="icon" href="../assets/favicon.png">
{ld({"@context": "https://schema.org", "@graph": graph})}
<style>
{style}
{EXTRA_CSS}
</style>
</head>
<body class="{side}">
<header class="top"><div class="wrap">
  <a class="mark" href="./">Grant <i>C</i> Anthony</a>
  {NAV}
</div></header>
<main>
  <section class="bp wrap">
    <p class="crumbs"><a href="./">Books</a> / <a href="./{shelf}">{"Fiction" if b["fiction"] else "Nonfiction"}</a> / {esc(b["title"])}</p>
    <div class="bp-grid">
      <img class="bp-cover" src="{esc(b["cover_large"])}" alt="Cover of {esc(b["title"])} by {esc(b["byline"])}"{f' width="{w}" height="{h}"' if w else ""}>
      <div>
        <p class="series label">{esc(b["series"])}</p>
        <h1>{esc(b["title"])}</h1>
        <p class="by">By <a href="./#about">{esc(b["byline"])}</a></p>
        {f'<p class="tag">{esc(b["tag"])}</p>' if b["tag"] else ""}
        <p class="blurb">{esc(b["blurb"])}</p>
        <div class="act">{act}</div>
      </div>
    </div>
  </section>
  {read}
  {more}
</main>
<footer><div class="wrap">© {date.today().year} Grant C Anthony.{" Fiction published by Levern Press." if b["fiction"] else ""} <a href="./">All books</a> &middot; <a href="https://www.instagram.com/{handle}/" target="_blank" rel="noopener">@{handle}</a> &middot; <a href="mailto:grant.anthony@btinternet.com">Contact</a> &middot; <a href="../privacy.html">Privacy</a></div></footer>
</body>
</html>
"""
    return head


def build_books(changed):
    page = read("books/index.html")
    posts = json.loads(read("books/posts.json"))
    style = re.search(r"<style>(.*?)</style>", page, re.S).group(1).strip()
    books = parse_books(page)
    notes = load_notes(books)
    for b in books:
        mine = [n for n in notes if n["book"] is b]
        if write_if_changed(f"books/{b['slug']}/index.html", book_page(b, books, posts, style, mine)):
            changed.append(f"books/{b['slug']}/index.html")
    build_notes(notes, style, changed)
    return books, notes


# ---------------------------------------------------------------- notes

NAV = '<nav><a href="./#fiction">Fiction</a><a href="./#nonfiction">Nonfiction</a><a href="notes/">Notes</a><a href="./#about">About</a></nav>'
MONTHS = "January February March April May June July August September October November December".split()


def nice_date(d):
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def smart(s):
    """Curly quotes for text typed with straight ones."""
    s = re.sub(r'(^|[\s(\[/-])"', "\\1\u201c", s).replace('"', "\u201d")
    return re.sub(r"(^|[\s(\[/-])'", "\\1\u2018", s).replace("'", "\u2019")


def inline(t):
    """One paragraph of text: links, *italic*, **bold**, curly quotes, everything else escaped."""
    out, last = "", 0
    for m in re.finditer(r"\[([^\]]+)\]\(([^)\s]+)\)", t):
        out += _words(t[last:m.start()])
        href = m.group(2)
        ext = ' target="_blank" rel="noopener"' if href.startswith("http") and "grantanthony.co.uk" not in href else ""
        out += f'<a href="{esc(href)}"{ext}>{_words(m.group(1))}</a>'
        last = m.end()
    return out + _words(t[last:])


def _words(t):
    t = esc(smart(t))
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    return re.sub(r"\*(.+?)\*", r"<em>\1</em>", t)


def img_src(p):
    """Where an image path from a note points, as used on the page (base /books/) and as a full address."""
    if p.startswith("http"):
        return p, p, None
    local = p.lstrip("/") if p.startswith("/") else "books/" + p
    full = SITE + "/" + local
    return ("/" + local if p.startswith("/") else p), full, local


def figure(src, caption):
    page_src, _, local = img_src(src)
    w, h = jpeg_size(local) if local and os.path.exists(os.path.join(ROOT, local)) else (None, None)
    size = f' width="{w}" height="{h}"' if w else ""
    cap = f"<figcaption>{inline(caption)}</figcaption>" if caption else ""
    return f'<figure><img src="{esc(page_src)}" alt="{esc(smart(caption))}"{size} loading="lazy">{cap}</figure>'


def render_body(text):
    out = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = [l.rstrip() for l in block.strip().split("\n")]
        first = lines[0]
        if first.startswith("## "):
            out.append(f"<h2>{inline(first[3:].strip())}</h2>")
            if len(lines) > 1:
                out.append("<p>" + inline(" ".join(l.strip() for l in lines[1:])) + "</p>")
        elif all(l.startswith(">") for l in lines):
            out.append("<blockquote><p>" + inline(" ".join(l.lstrip("> ").strip() for l in lines)) + "</p></blockquote>")
        elif len(lines) == 1 and re.fullmatch(r"!\[([^\]]*)\]\(([^)\s]+)\)", first):
            m = re.fullmatch(r"!\[([^\]]*)\]\(([^)\s]+)\)", first)
            out.append(figure(m.group(2), m.group(1)))
        elif all(l.startswith("- ") for l in lines):
            out.append("<ul>" + "".join(f"<li>{inline(l[2:].strip())}</li>" for l in lines) + "</ul>")
        else:
            out.append("<p>" + inline(" ".join(l.strip() for l in lines)) + "</p>")
    return "\n".join(out)


def load_notes(books):
    """Every published note, newest first. A note is a text file in books/notes/posts:
    a few 'Name: value' lines, a blank line, then the text. Drafts and notes dated in the future are left out."""
    folder = os.path.join(ROOT, "books/notes/posts")
    if not os.path.isdir(folder):
        return []
    by_key = {}
    for b in books:
        by_key[b["slug"]] = b
        by_key[b["title"].lower()] = b
    notes, today = [], date.today()
    for name in sorted(os.listdir(folder)):
        if not name.lower().endswith((".md", ".txt")) or name.startswith(".") or name.upper().startswith(("README", "HOW-TO")):
            continue
        raw = read("books/notes/posts/" + name).replace("\r\n", "\n").lstrip("\ufeff")
        head, _, body = raw.partition("\n\n")
        meta = {}
        for line in head.split("\n"):
            k, sep, v = line.partition(":")
            if sep:
                meta[k.strip().lower()] = v.strip()
        try:
            when = date.fromisoformat(meta.get("date", ""))
        except ValueError:
            print(f"Notes: skipped {name}, it needs a line like 'Date: 2026-11-02'")
            continue
        if not meta.get("title") or not body.strip():
            print(f"Notes: skipped {name}, it needs a Title line and some text")
            continue
        if meta.get("draft", "").lower() in ("yes", "true", "y"):
            continue
        if when > today:
            print(f"Notes: {name} is scheduled for {when}")
            continue
        slug = re.sub(r"[^a-z0-9]+", "-", os.path.splitext(name)[0].lower()).strip("-")
        book = by_key.get(meta.get("book", "").strip().lower()) or by_key.get(meta.get("book", "").strip().strip("/"))
        words = len(re.findall(r"[A-Za-z\u2019']+", body))
        notes.append({
            "slug": slug, "title": smart(meta["title"]), "date": when, "book": book,
            "summary": smart(meta.get("summary", "")), "image": meta.get("image", ""),
            "image_alt": smart(meta.get("image alt", "") or meta.get("caption", "")),
            "body": body, "minutes": max(1, round(words / 220)), "words": words,
            "byline": book["byline"] if book else "Grant C Anthony",
            "fiction": book["fiction"] if book else True,
        })
    notes.sort(key=lambda n: (n["date"], n["title"]), reverse=True)
    return notes


def note_thumb(n):
    """Picture for a note in a list: its own image if it has one, otherwise its book's cover."""
    if n["image"]:
        src, alt = img_src(n["image"])[0], n["image_alt"] or n["title"]
    elif n["book"]:
        src, alt = n["book"]["cover"], "Cover of " + n["book"]["title"]
    else:
        return ""
    return f'<img src="{esc(src)}" alt="{esc(alt)}" width="120" height="180" loading="lazy">'


def note_card(n):
    about = f' · {esc(n["book"]["title"])}' if n["book"] else ""
    side = "fic" if n["fiction"] else "nf"
    return (f'<a class="ncard {side}" href="notes/{n["slug"]}/">{note_thumb(n)}<span class="ntext">'
            f'<span class="label">{nice_date(n["date"])}{about}</span><b>{esc(n["title"])}</b>'
            f'<span class="nsum">{esc(n["summary"])}</span><span class="nmore">Read the full note <span aria-hidden="true">→</span></span></span></a>')


def note_link(n):
    return (f'<a class="nline" href="notes/{n["slug"]}/"><b>{esc(n["title"])}</b>'
            f'<span class="nsum">{esc(n["summary"])}</span><span class="nmore">Read the full note <span aria-hidden="true">→</span></span></a>')


NOTE_CSS = """
.np{padding-block:40px 8px}
.np .crumbs{margin-bottom:22px}
.np h1{font:800 clamp(2.2rem,6.4vw,4rem)/1 var(--display);letter-spacing:-.03em;margin:10px 0 16px;max-width:20ch;text-wrap:balance}
.fic .np h1{color:var(--fic)} .nf .np h1{color:var(--nf)}
.np .stand{font-size:1.25rem;line-height:1.5;color:var(--muted);max-width:56ch;margin:0 0 14px}
.np .by{font:500 .76rem/1.4 var(--mono);text-transform:uppercase;letter-spacing:.14em;color:var(--muted);margin:0}
.np .by a{text-decoration:none} .np .by a:hover{color:var(--ink)}
.prose{font-size:1.12rem;line-height:1.7}
.prose p{margin:0 0 1.15em}
.prose h2{font:800 1.6rem/1.15 var(--display);letter-spacing:-.02em;margin:1.8em 0 .6em}
.prose blockquote{margin:1.6em 0;padding:4px 0 4px 22px;border-left:3px solid var(--fic);font-style:italic;font-size:1.2rem}
.nf .prose blockquote{border-color:var(--nf)}
.prose blockquote p{margin:0}
.prose a{color:var(--sun);text-underline-offset:3px}
.prose ul{padding-left:1.2em;margin:0 0 1.15em} .prose li{margin:0 0 .4em}
.prose figure,.np figure{margin:1.8em 0}
.prose figure img,.np figure img{display:block;width:100%;height:auto;border-radius:8px}
.prose figcaption,.np figcaption{font:500 .74rem/1.5 var(--mono);color:var(--muted);margin-top:10px;letter-spacing:.04em}
.np figure.hero{max-width:900px;margin:30px 0 0}
.nbody{display:grid;grid-template-columns:minmax(0,68ch) minmax(230px,280px);gap:64px;justify-content:space-between;align-items:start;padding-bottom:56px}
.nbody.solo{grid-template-columns:minmax(0,68ch)}
.nbody .prose{padding-block:18px 0}
.thebook{position:sticky;top:84px;margin-top:26px;display:grid;gap:18px;padding:22px;border:1px solid var(--rule);border-radius:18px;background:var(--deep)}
.thebook img{width:100%;max-width:150px;height:auto;border-radius:4px;box-shadow:0 12px 26px rgba(0,0,0,.4);transform:rotate(-2deg)}
.thebook h2{font:800 1.5rem/1.05 var(--display);letter-spacing:-.02em;margin:6px 0 8px}
.thebook h2 a{text-decoration:none}
.thebook p{margin:0 0 14px;font-size:.95rem;line-height:1.5}
.thebook .page{font:500 .7rem/1 var(--mono);text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
.thebook .page:hover{color:var(--ink)}
@media (max-width:900px){.nbody{grid-template-columns:minmax(0,1fr);gap:8px}.thebook{position:static;grid-template-columns:110px 1fr;gap:20px;max-width:66ch}}
.nhead{padding-block:48px 8px}
.nhead h1{font:800 clamp(3rem,10vw,6rem)/.9 var(--display);letter-spacing:-.035em;margin:8px 0 18px;color:var(--sun)}
.nhead .intro{max-width:56ch;color:var(--muted);font-size:1.15rem;margin:0}
.nall{padding-block:28px 72px}
@media (max-width:640px){.thebook{grid-template-columns:84px 1fr;gap:16px;padding:18px}.prose{font-size:1.06rem}}
"""


def page_head(title, desc, url, og_title, og_desc, image, image_wh, ld_graph, style, og_type="article", extra_meta=""):
    w, h = image_wh
    size = (f'<meta property="og:image:width" content="{w}">\n<meta property="og:image:height" content="{h}">\n' if w else "")
    return f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<base href="/books/">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="{url}">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="Grant C Anthony">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="{esc(og_title)}">
<meta property="og:description" content="{esc(og_desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{image}">
{size}{extra_meta}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(og_title)}">
<meta name="twitter:description" content="{esc(og_desc)}">
<meta name="twitter:image" content="{image}">
<meta name="theme-color" content="#100f24">
<link rel="icon" href="../assets/favicon.png">
{ld({"@context": "https://schema.org", "@graph": ld_graph})}
<style>
{style}
{EXTRA_CSS}
{NOTE_CSS}
</style>
</head>
"""


def page_top(side):
    return f"""<body class="{side}">
<header class="top"><div class="wrap">
  <a class="mark" href="./">Grant <i>C</i> Anthony</a>
  {NAV}
</div></header>
<main>
"""


def page_foot(fiction):
    handle = "grantcanthony" if fiction else "g_c_anthony"
    return f"""</main>
<footer><div class="wrap">© {date.today().year} Grant C Anthony.{" Fiction published by Levern Press." if fiction else ""} <a href="./">All books</a> &middot; <a href="notes/">Notes</a> &middot; <a href="https://www.instagram.com/{handle}/" target="_blank" rel="noopener">@{handle}</a> &middot; <a href="mailto:grant.anthony@btinternet.com">Contact</a> &middot; <a href="../privacy.html">Privacy</a></div></footer>
</body>
</html>
"""


def note_image(n):
    """The note's share picture as a full address, with its size: its own image, else its book's cover."""
    if n["image"]:
        _, full, local = img_src(n["image"])
        wh = jpeg_size(local) if local and os.path.exists(os.path.join(ROOT, local)) else (None, None)
        return full, wh
    if n["book"]:
        return BOOKS + n["book"]["cover_large"], jpeg_size("books/" + n["book"]["cover_large"])
    return BOOKS + "assets/share.jpg", (1200, 630)


def note_page(n, notes, style):
    url = BOOKS + "notes/" + n["slug"] + "/"
    image, wh = note_image(n)
    desc = clip(n["summary"] or text_of(render_body(n["body"])))
    b = n["book"]
    post = {
        "@type": "BlogPosting", "@id": url + "#post", "headline": n["title"], "description": desc, "url": url,
        "datePublished": n["date"].isoformat(), "inLanguage": "en-GB", "wordCount": n["words"], "image": image,
        "author": {"@type": "Person", "@id": AUTHOR_ID, "name": n["byline"]},
        "publisher": {"@type": "Person", "@id": AUTHOR_ID, "name": n["byline"]},
        "mainEntityOfPage": {"@id": url}, "isPartOf": {"@id": BOOKS + "notes/#blog"},
    }
    if b:
        post["about"] = {"@type": "Book", "@id": BOOKS + b["slug"] + "/#book", "name": b["title"]}
    graph = [
        {"@type": "WebPage", "@id": url, "url": url, "name": n["title"], "description": desc, "inLanguage": "en-GB",
         "isPartOf": {"@id": BOOKS}, "primaryImageOfPage": {"@type": "ImageObject", "url": image},
         "mainEntity": {"@id": url + "#post"}, "breadcrumb": {"@id": url + "#crumbs"}},
        post,
        {"@type": "BreadcrumbList", "@id": url + "#crumbs", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Books", "item": BOOKS},
            {"@type": "ListItem", "position": 2, "name": "Notes", "item": BOOKS + "notes/"},
            {"@type": "ListItem", "position": 3, "name": n["title"], "item": url}]},
    ]
    meta = f'<meta property="article:published_time" content="{n["date"].isoformat()}">\n'
    out = page_head(f'{n["title"]} | Notes by {n["byline"]}', desc, url, n["title"], clip(n["summary"] or desc, 200),
                    image, wh, graph, style, "article", meta)
    out += page_top("fic" if n["fiction"] else "nf")
    hero = figure(n["image"], n["image_alt"]).replace("<figure>", '<figure class="hero">', 1).replace(' loading="lazy"', "") if n["image"] else ""
    aside = ""
    if b:
        act = (f'<span class="status out">Out now</span><a class="buy" href="{esc(b["buy"])}" target="_blank" rel="noopener">Find it on Amazon</a>'
               if b["out"] and b["buy"] else
               f'<span class="status due"><small>Expected release</small>{esc(b["status"].replace("Expected release", "").strip())}</span>')
        aside = f"""
    <aside class="thebook">
      <a href="{b["slug"]}/"><img src="{esc(b["cover"])}" alt="Cover of {esc(b["title"])}" width="200" height="300" loading="lazy"></a>
      <div><span class="label">The book</span><h2><a href="{b["slug"]}/">{esc(b["title"])}</a></h2>
      <p>{esc(b["tag"] or re.split(r"(?<=[.!?])\s", b["blurb"])[0])}</p>
      <div class="act">{act}<a class="page" href="{b["slug"]}/">About the book</a></div></div>
    </aside>"""
    out += f"""  <article class="wrap">
  <header class="np">
    <p class="crumbs"><a href="./">Books</a> / <a href="notes/">Notes</a> / {esc(n["title"])}</p>
    <span class="label">{nice_date(n["date"])} · {n["minutes"]} min read</span>
    <h1>{esc(n["title"])}</h1>
    {f'<p class="stand">{esc(n["summary"])}</p>' if n["summary"] else ""}
    <p class="by">By <a href="./#about">{esc(n["byline"])}</a></p>
    {hero}
  </header>
  <div class="nbody{"" if b else " solo"}">
    <div class="prose">
{render_body(n["body"])}
    </div>{aside}
  </div>
  </article>
"""
    others = [o for o in notes if o is not n][:3]
    if others:
        out += ('  <section class="mnotes wrap"><span class="label">Notes</span><h2>More notes</h2><div class="ngrid">'
                + "".join(note_card(o) for o in others) + "</div></section>\n")
    return out + page_foot(n["fiction"])


def notes_index(notes, style):
    url = BOOKS + "notes/"
    desc = ("Notes from Grant C Anthony: articles on anxiety, overthinking and the mind, "
            "the real science and places behind the novels, and news of new books.")
    blog = {"@type": "Blog", "@id": url + "#blog", "name": "Notes", "url": url, "description": desc, "inLanguage": "en-GB",
            "author": {"@type": "Person", "@id": AUTHOR_ID, "name": "Grant C Anthony"},
            "blogPost": [{"@id": BOOKS + "notes/" + n["slug"] + "/#post"} for n in notes]}
    graph = [{"@type": "WebPage", "@id": url, "url": url, "name": "Notes", "description": desc, "inLanguage": "en-GB",
              "isPartOf": {"@id": BOOKS}, "mainEntity": {"@id": url + "#blog"}}, blog]
    out = page_head("Notes | Grant C Anthony Books", desc, url, "Notes from Grant C Anthony",
                    "On the mind, and the real science and places behind the novels.",
                    BOOKS + "assets/share.jpg", (1200, 630), graph, style, "website")
    out += page_top("fic")
    cards = "".join(note_card(n) for n in notes) or "<p>The first notes are on their way.</p>"
    out += f"""  <section class="nhead wrap">
    <p class="crumbs"><a href="./">Books</a> / Notes</p>
    <h1>Notes</h1>
    <p class="intro">On anxiety, overthinking and the mind. The real science and the real places behind the novels. And news of what is coming next.</p>
  </section>
  <section class="nall wrap"><div class="ngrid">{cards}</div></section>
"""
    return out + page_foot(True)


def build_notes(notes, style, changed):
    for n in notes:
        p = f"books/notes/{n['slug']}/index.html"
        if write_if_changed(p, note_page(n, notes, style)):
            changed.append(p)
    if write_if_changed("books/notes/index.html", notes_index(notes, style)):
        changed.append("books/notes/index.html")
    # the latest three on the main books page, between the notes markers,
    # always with at least one fiction and one nonfiction note when both exist
    latest = notes[:3]
    if len({n["fiction"] for n in latest}) == 1:
        other = next((n for n in notes if n["fiction"] != latest[0]["fiction"]), None)
        if other:
            latest = latest[:2] + [other]
    page = read("books/index.html")
    if "<!-- notes:start" in page:
        inner = ""
        if notes:
            inner = ('\n  <section id="notes" class="notes wrap">\n    <div class="shelf-head"><div><span class="label">Notes</span><h2>Notes</h2></div>'
                     '<p>The mind, the science behind the stories, and the places in them.</p></div>\n    <div class="ngrid">'
                     + "".join(note_card(n) for n in latest)
                     + '</div>\n    <p class="nall-link"><a href="notes/">All notes</a></p>\n  </section>\n  ')
        block = "<!-- notes:start (written by scripts/build_seo.py) -->" + inner + "<!-- notes:end -->"
        new = re.sub(r"<!-- notes:start.*?<!-- notes:end -->", lambda m: block, page, flags=re.S)
        if write_if_changed("books/index.html", new):
            changed.append("books/index.html")


# ---------------------------------------------------------------- photography

def build_photo_data(changed):
    data = json.loads(read("photos.json"))
    photos = [p for p in data.get("photos", []) if p.get("file")]
    imgs = []
    for p in photos:
        o = {"@type": "ImageObject", "contentUrl": f'{SITE}/{p["file"]}', "name": p.get("title") or "Photograph",
             "creator": {"@id": SITE + "/#person"}, "creditText": "Grant C Anthony",
             "copyrightNotice": "© Grant C Anthony", "license": SITE + "/copyright.html",
             "acquireLicensePage": SITE + "/copyright.html"}
        if p.get("thumb"):
            o["thumbnailUrl"] = f'{SITE}/{p["thumb"]}'
        if p.get("description"):
            o["description"] = p["description"]
        if p.get("location"):
            o["contentLocation"] = {"@type": "Place", "name": p["location"]}
        if p.get("year"):
            o["dateCreated"] = str(p["year"])
        if p.get("w") and p.get("h"):
            o["width"], o["height"] = p["w"], p["h"]
        imgs.append(o)
    graph = [
        {"@type": "WebSite", "@id": SITE + "/#site", "url": SITE + "/", "name": "Grant C Anthony", "inLanguage": "en-GB",
         "publisher": {"@id": SITE + "/#person"}},
        {"@type": "Person", "@id": SITE + "/#person", "name": "Grant C Anthony", "alternateName": ["Grant Anthony", "G C Anthony"],
         "url": SITE + "/", "jobTitle": "Photographer and author", "homeLocation": {"@type": "Place", "name": "Scotland"},
         "sameAs": ["https://www.instagram.com/gcanth/", "https://www.instagram.com/grantcanthony/",
                    "https://www.instagram.com/g_c_anthony/", BOOKS]},
        {"@type": "ImageGallery", "@id": SITE + "/#work", "url": SITE + "/", "name": "Photography by Grant C Anthony",
         "author": {"@id": SITE + "/#person"}, "isPartOf": {"@id": SITE + "/#site"}, "image": imgs},
    ]
    block = "<!-- seo:start (written by scripts/build_seo.py) -->\n" + ld({"@context": "https://schema.org", "@graph": graph}) + "\n<!-- seo:end -->"
    page = read("index.html")
    if "<!-- seo:start" in page:
        new = re.sub(r"<!-- seo:start.*?<!-- seo:end -->", lambda m: block, page, flags=re.S)
    else:
        new = page.replace("</head>", block + "\n</head>", 1)
    if write_if_changed("index.html", new):
        changed.append("index.html")
    return photos


# ---------------------------------------------------------------- sitemap

def build_sitemap(books, notes, photos, changed):
    newest = max((p.get("added", "") for p in photos), default="")
    urls = []

    def u(loc, images=(), mod=None, freq=None, prio=None):
        x = f"  <url>\n    <loc>{esc(loc)}</loc>\n"
        if mod:
            x += f"    <lastmod>{mod}</lastmod>\n"
        if freq:
            x += f"    <changefreq>{freq}</changefreq>\n"
        if prio:
            x += f"    <priority>{prio}</priority>\n"
        for loc_i, title in images:
            x += f"    <image:image>\n      <image:loc>{esc(loc_i)}</image:loc>\n"
            if title:
                x += f"      <image:title>{esc(title)}</image:title>\n"
            x += "    </image:image>\n"
        return x + "  </url>\n"

    urls.append(u(SITE + "/", [(f'{SITE}/{p["file"]}', p.get("title", "")) for p in photos], newest or None, "weekly", "1.0"))
    urls.append(u(BOOKS, [(BOOKS + b["cover_large"], b["title"]) for b in books], None, "weekly", "0.9"))
    for b in books:
        urls.append(u(BOOKS + b["slug"] + "/", [(BOOKS + b["cover_large"], b["title"])], None, "monthly", "0.8"))
    if notes:
        urls.append(u(BOOKS + "notes/", (), notes[0]["date"].isoformat(), "weekly", "0.7"))
        for n in notes:
            imgs = [(img_src(n["image"])[1], n["image_alt"] or n["title"])] if n["image"] else []
            urls.append(u(BOOKS + "notes/" + n["slug"] + "/", imgs, n["date"].isoformat(), "monthly", "0.7"))
    urls.append(u(SITE + "/privacy.html", (), None, "yearly", "0.2"))
    urls.append(u(SITE + "/copyright.html", (), None, "yearly", "0.2"))
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
           + "".join(urls) + "</urlset>\n")
    if write_if_changed("sitemap.xml", xml):
        changed.append("sitemap.xml")


if __name__ == "__main__":
    changed = []
    books, notes = build_books(changed)
    photos = build_photo_data(changed)
    build_sitemap(books, notes, photos, changed)
    print(f"{len(books)} book pages, {len(notes)} notes, {len(photos)} photographs.")
    print("Changed: " + (", ".join(changed) if changed else "nothing"))
