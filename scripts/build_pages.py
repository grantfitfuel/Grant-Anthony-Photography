"""Plain pages for every lesson and photograph, so search engines can find them.

Called by scripts/build_seo.py (the Search pages job) whenever photos.json changes.
The interactive site (index.html with #l/... and #p/... addresses) stays exactly as it is;
these pages sit alongside it, each with its own address, title, description and share image,
and link through to the interactive version. Nothing here needs editing by hand: change a
lesson or photograph in the Studio and its page is rebuilt.

  learn/index.html            every lesson, grouped by topic
  learn/<lesson id>/index.html
  photo/<photo id>/index.html
"""
import html, json, os, re, shutil

SITE = "https://grantanthony.co.uk"


def esc(s):
    return html.escape(str(s or ""), quote=True)


def clip(s, n=158):
    s = re.sub(r"\s+", " ", s or "").strip()
    if len(s) <= n:
        return s
    return s[:n].rsplit(" ", 1)[0].rstrip(",;:.") + "..."


def ld(obj):
    return '<script type="application/ld+json">\n' + json.dumps(obj, indent=1, ensure_ascii=False).replace("</", "<\\/") + "\n</script>"


def inline(s):
    s = esc(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    return re.sub(r"(^|[^*])\*(?!\s)(.+?)\*", r"\1<em>\2</em>", s)


def plain(s):
    return re.sub(r"\s+", " ", re.sub(r"\[\[[^\]]*\]\]|[*#>_`]", " ", s or "")).strip()


GUIDE_NAMES = {
    "triangle": "the exposure triangle", "lightdir": "the direction of light", "reflect": "how reflections work",
    "dof": "depth of field", "aspects": "aspect ratios", "tides": "tides", "sunstar": "sunstars", "ghosts": "lens flare",
    "backup": "three copies on three storage points", "orton": "the Orton effect", "sharpen": "sharpening and halos",
    "overdo": "pushing the sliders too far", "kelvin": "white balance in kelvin", "points": "black and white points",
    "double": "double exposure blend modes",
}

CSS = """
body{background:var(--bg);color:var(--fg)}
.nav{background:rgba(13,13,14,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.sp{max-width:760px;margin:0 auto;padding:calc(clamp(56px,9vw,120px) + 36px) var(--gut) 72px}
.sp.wide{max-width:1100px}
.sp h1{font-family:var(--display);font-weight:400;font-size:clamp(40px,7vw,76px);line-height:1;letter-spacing:-.02em;margin:0 0 18px;text-wrap:balance}
.sp .lede{font-size:clamp(18px,2.2vw,21px);line-height:1.55;color:var(--fg);opacity:.9;margin:0 0 30px;max-width:62ch}
.sp h2{font-family:var(--display);font-weight:400;font-size:clamp(26px,3.4vw,34px);line-height:1.15;margin:46px 0 14px;text-wrap:balance}
.sp p,.sp li{line-height:1.7;opacity:.9}
.sp ul,.sp ol{padding-left:22px}.sp li{margin:0 0 8px}
.sp blockquote{margin:40px 0;padding:0 0 0 22px;border-left:2px solid var(--accent);font-family:var(--display);font-size:clamp(22px,3vw,28px);line-height:1.3}
.sp figure{margin:34px 0}
.sp figure img{display:block;width:100%;height:auto;border-radius:4px;background:var(--bg3)}
.sp figcaption{font-size:14px;color:var(--muted);margin-top:10px}
.sp figcaption a{color:var(--fg)}
.sp a{color:var(--accent);text-underline-offset:3px}
.cta{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;border:1px solid var(--line2);border-radius:6px;padding:16px 18px;margin:0 0 34px}
.cta p{margin:0;flex:1 1 260px;font-size:15px}
.btn{display:inline-block;background:var(--accent);color:var(--accent-ink)!important;text-decoration:none;font-size:12px;letter-spacing:.16em;text-transform:uppercase;padding:12px 20px;border-radius:999px;white-space:nowrap}
.demo{border:1px dashed var(--line2);border-radius:6px;padding:14px 16px;margin:28px 0;font-size:15px}
.demo b{color:var(--accent);font-weight:500}
.facts{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin:22px 0;font-size:15px}
.facts dt{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);padding-top:3px}
.facts dd{margin:0}
.pn{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-top:1px solid var(--line);margin-top:56px;padding-top:22px;font-size:15px}
.pn a{text-decoration:none;color:var(--fg)}.pn small{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.topic{margin:44px 0 0}.topic h2{margin-top:0}
.sp .ll{list-style:none;padding:0;margin:0;display:grid;gap:2px}
.ll a{display:block;text-decoration:none;color:var(--fg);padding:14px 0;border-bottom:1px solid var(--line)}
.ll b{font-family:var(--display);font-weight:400;font-size:22px;display:block}.ll span{font-size:15px;color:var(--muted)}
.photo-full{margin:0 0 26px}.photo-full img{display:block;width:100%;height:auto;max-height:82vh;object-fit:contain;background:var(--bg2);border-radius:4px}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}.tags span{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;border:1px solid var(--line2);border-radius:999px;padding:5px 11px;color:var(--muted)}
.foot{display:flex;flex-wrap:wrap;gap:12px 24px;justify-content:space-between}
"""


def head(title, desc, url, image, wh, graph, og_type="article"):
    w, h = wh or (None, None)
    size = f'<meta property="og:image:width" content="{w}">\n<meta property="og:image:height" content="{h}">\n' if w else ""
    return f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="{url}">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="Grant C Anthony">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{image}">
{size}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{image}">
<meta name="theme-color" content="#0D0D0E">
<link rel="icon" href="/assets/favicon.png">
<link rel="stylesheet" href="/assets/style.css">
<style>{CSS}</style>
{ld({"@context": "https://schema.org", "@graph": graph})}
</head>
<body>
<nav class="nav" aria-label="Main">
  <a class="brand" href="/" aria-label="Grant C Anthony, home"><img class="sig-nav" src="/assets/signature-sm.png" alt="Grant C Anthony" width="800" height="311"></a>
  <div class="nav-links">
    <a href="/#work">Work</a>
    <a href="/learn/">Learn</a>
    <a href="/#about" class="hide-sm">About</a>
    <a href="/books/" class="nav-books">Books</a>
  </div>
</nav>
"""


def foot():
    return """<footer class="foot">
  <span>&copy; Grant C Anthony</span>
  <span><a href="/" style="text-decoration:none">Photographs</a> &middot; <a href="/learn/" style="text-decoration:none">Lessons</a> &middot; <a href="/copyright.html" style="text-decoration:none">Copyright</a> &middot; <a href="/privacy.html" style="text-decoration:none">Privacy</a> &middot; <a href="/books/" style="text-decoration:none">Books</a></span>
</footer>
</body>
</html>
"""


PERSON = {"@type": "Person", "@id": SITE + "/#person", "name": "Grant C Anthony", "url": SITE + "/"}


def img_tag(p, alt, sizes="(max-width: 1100px) 100vw, 1100px", eager=False):
    src = "/" + (p.get("medium") or p["file"])
    srcset = []
    if p.get("thumb") and p.get("tw"):
        srcset.append(f'/{p["thumb"]} {p["tw"]}w')
    if p.get("medium") and p.get("mw"):
        srcset.append(f'/{p["medium"]} {p["mw"]}w')
    if p.get("w"):
        srcset.append(f'/{p["file"]} {p["w"]}w')
    ss = f' srcset="{", ".join(srcset)}" sizes="{sizes}"' if srcset else ""
    wh = f' width="{p["w"]}" height="{p["h"]}"' if p.get("w") else ""
    lazy = "" if eager else ' loading="lazy"'
    return f'<img src="{src}"{ss}{wh} alt="{esc(alt)}"{lazy} decoding="async">'


def alt_of(p):
    """Title plus description, for screen readers and search engines."""
    t = (p.get("title") or "Photograph").strip()
    d = (p.get("description") or "").strip()
    return f"{t}. {d}" if d else t


def share_image(p):
    """The size social networks use: the medium copy if there is one."""
    if p.get("medium"):
        return f'{SITE}/{p["medium"]}', (p.get("mw"), p.get("mh"))
    return f'{SITE}/{p["file"]}', (p.get("w"), p.get("h"))


def find_photo(photos, key):
    k = key.strip().lower()
    return next((p for p in photos if p["id"].lower() == k or (p.get("title") or "").strip().lower() == k), None)


def lesson_body(text, photos, lesson_id):
    out = []
    for block in re.split(r"\n\s*\n", (text or "").replace("\r", "")):
        block = block.strip()
        if not block:
            continue
        m = re.match(r"^\[\[(photo|shot):(.+)\]\]$", block)
        if m:
            p = find_photo(photos, m.group(2))
            if p:
                cap = f'<a href="/photo/{p["id"]}/">{esc(p.get("title") or "Untitled")}</a>' + (f' &middot; {esc(p["location"])}' if p.get("location") else "")
                if m.group(1) == "shot":
                    sets = " &middot; ".join(esc(x) for x in (p.get("focal"), p.get("aperture"), p.get("shutter"), p.get("iso")) if x)
                    if sets:
                        cap += f"<br>{sets}"
                out.append(f'<figure>{img_tag(p, alt_of(p), "(max-width: 760px) 100vw, 760px")}<figcaption>{cap}</figcaption></figure>')
            continue
        m = re.match(r"^\[\[guide:([a-z]+)\]\]$", block)
        if m or block == "[[exposure]]":
            what = GUIDE_NAMES.get(m.group(1), "this") if m else "the exposure triangle"
            out.append(f'<p class="demo"><b>Interactive demo:</b> {esc(what)}. <a href="/#l/{lesson_id}">Try it in the interactive lesson</a>.</p>')
            continue
        if block.startswith("## "):
            out.append(f"<h2>{inline(block[3:])}</h2>")
            continue
        lines = block.split("\n")
        if all(re.match(r"^\d+\. ", x.strip()) for x in lines):
            out.append("<ol>" + "".join("<li>" + inline(re.sub(r"^\d+\.\s+", "", x.strip())) + "</li>" for x in lines) + "</ol>")
        elif all(re.match(r"^[-*] ", x.strip()) for x in lines):
            out.append("<ul>" + "".join(f"<li>{inline(x.strip()[2:])}</li>" for x in lines) + "</ul>")
        elif all(x.strip().startswith(">") for x in lines):
            out.append("<blockquote>" + inline(" ".join(re.sub(r"^>\s?", "", x.strip()) for x in lines)) + "</blockquote>")
        else:
            out.append("<p>" + "<br>".join(inline(x) for x in lines) + "</p>")
    return "\n".join(out)


def lesson_page(l, i, lessons, photos, topics):
    url = f"{SITE}/learn/{l['id']}/"
    cover = find_photo(photos, l.get("cover") or "")
    tname = topics.get(l.get("topic"), "")
    desc = clip(l.get("summary") or plain(l.get("body")))
    title = f'{l["title"]}: a photography lesson | Grant C Anthony'
    image, wh = share_image(cover) if cover else (SITE + "/assets/share.jpg", (1200, 630))
    graph = [PERSON, {"@type": ["Article", "LearningResource"], "@id": url + "#lesson", "url": url, "headline": l["title"],
                      "description": desc, "image": image, "author": {"@id": SITE + "/#person"}, "publisher": {"@id": SITE + "/#person"},
                      "inLanguage": "en-GB", "isAccessibleForFree": True, "learningResourceType": "Lesson",
                      **({"about": tname} if tname else {})},
             {"@type": "BreadcrumbList", "itemListElement": [
                 {"@type": "ListItem", "position": 1, "name": "Lessons", "item": SITE + "/learn/"},
                 {"@type": "ListItem", "position": 2, "name": l["title"], "item": url}]}]
    has_demo = bool(re.search(r"\[\[(guide:|exposure)", l.get("body") or ""))
    extra = "a hands-on demo, " if has_demo else ""
    prev_l, next_l = (lessons[i - 1] if i > 0 else None), (lessons[i + 1] if i < len(lessons) - 1 else None)
    pn = '<nav class="pn" aria-label="More lessons">' + (
        f'<a href="/learn/{prev_l["id"]}/"><small>Previous</small>{esc(prev_l["title"])}</a>' if prev_l else "<span></span>") + (
        f'<a href="/learn/{next_l["id"]}/" style="text-align:right"><small>Next</small>{esc(next_l["title"])}</a>' if next_l else "<span></span>") + "</nav>"
    challenge = f'<h2>Your challenge</h2>\n<p>{inline(l["challenge"])}</p>' if l.get("challenge") else ""
    return head(title, desc, url, image, wh, graph) + f"""<main class="sp">
<p class="eyebrow"><a href="/learn/" style="color:inherit;text-decoration:none">Lessons</a>{f" &middot; {esc(tname)}" if tname else ""}</p>
<h1>{esc(l["title"])}</h1>
<p class="lede">{esc(l.get("summary") or "")}</p>
{f'<figure>{img_tag(cover, alt_of(cover), "(max-width: 760px) 100vw, 760px", eager=True)}<figcaption><a href="/photo/{cover["id"]}/">{esc(cover.get("title") or "")}</a>{" &middot; " + esc(cover["location"]) if cover.get("location") else ""}</figcaption></figure>' if cover else ""}
<div class="cta"><p>The interactive version has {extra}a quiz, and keeps track of the lessons you have finished.</p><a class="btn" href="/#l/{l["id"]}">Open the interactive lesson</a></div>
{lesson_body(l.get("body"), photos, l["id"])}
{challenge}
{pn}
</main>
""" + foot()


def learn_index(lessons, topics, photos):
    url = SITE + "/learn/"
    desc = f"{len(lessons)} free photography lessons by Grant C Anthony: light, composition, technique, editing and more, with settings to start from and hands-on demos."
    groups = ""
    for tid, tname in topics.items():
        ls = [l for l in lessons if l.get("topic") == tid]
        if not ls:
            continue
        items = "".join(f'<li><a href="/learn/{l["id"]}/"><b>{esc(l["title"])}</b><span>{esc(l.get("summary") or "")}</span></a></li>' for l in ls)
        groups += f'<section class="topic"><h2>{esc(tname)}</h2><ul class="ll">{items}</ul></section>\n'
    other = [l for l in lessons if l.get("topic") not in topics]
    if other:
        groups += '<section class="topic"><h2>More</h2><ul class="ll">' + "".join(
            f'<li><a href="/learn/{l["id"]}/"><b>{esc(l["title"])}</b><span>{esc(l.get("summary") or "")}</span></a></li>' for l in other) + "</ul></section>"
    graph = [PERSON, {"@type": "CollectionPage", "url": url, "name": "Photography lessons", "description": desc, "author": {"@id": SITE + "/#person"},
                      "hasPart": [{"@type": "LearningResource", "name": l["title"], "url": f'{SITE}/learn/{l["id"]}/'} for l in lessons]}]
    return head("Free photography lessons | Grant C Anthony", desc, url, SITE + "/assets/share.jpg", (1200, 630), graph, "website") + f"""<main class="sp">
<p class="eyebrow">Learn</p>
<h1>Free photography <i>lessons</i></h1>
<p class="lede">{esc(desc)}</p>
<div class="cta"><p>The interactive versions have hands-on demos and quizzes, and keep track of what you have finished.</p><a class="btn" href="/#learn">Open the lessons</a></div>
{groups}
</main>
""" + foot()


def photo_page(p, i, photos, lessons, cats, email):
    url = f'{SITE}/photo/{p["id"]}/'
    t = (p.get("title") or "Untitled").strip()
    where = p.get("location") or ""
    desc = clip(p.get("description") or (f"{t}, {where}. Photograph by Grant C Anthony." if where else f"{t}. Photograph by Grant C Anthony."))
    title = f"{t}{', ' + where if where else ''} | Photograph by Grant C Anthony"
    image, wh = share_image(p)
    io = {"@type": "ImageObject", "contentUrl": f'{SITE}/{p["file"]}', "creator": {"@id": SITE + "/#person"}, "creditText": "Grant C Anthony",
          "copyrightNotice": "© Grant C Anthony", "license": SITE + "/copyright.html", "acquireLicensePage": SITE + "/copyright.html"}
    if p.get("w"):
        io.update(width=p["w"], height=p["h"])
    ph = {"@type": "Photograph", "@id": url + "#photo", "url": url, "name": t, "description": desc, "image": io, "creator": {"@id": SITE + "/#person"}}
    if where:
        ph["contentLocation"] = {"@type": "Place", "name": where}
    if p.get("year"):
        ph["dateCreated"] = str(p["year"])
    facts = ""
    sets = " · ".join(str(x) for x in (p.get("focal"), p.get("aperture"), p.get("shutter"), p.get("iso")) if x)
    for k, v in (("Place", where), ("Year", p.get("year")), ("Camera", p.get("camera")), ("Lens", p.get("lens")), ("Settings", sets)):
        if v:
            facts += f"<dt>{k}</dt><dd>{esc(v)}</dd>"
    facts = f'<dl class="facts">{facts}</dl>' if facts else ""
    tags = "".join(f"<span>{esc(cats.get(c, c))}</span>" for c in p.get("categories", []))
    used = [l for l in lessons if (l.get("cover") == p["id"]) or re.search(r"\[\[(?:photo|shot):\s*(" + re.escape(p["id"]) + "|" + re.escape(t) + r")\s*\]\]", l.get("body") or "", re.I)]
    used_html = ("<h2>In the lessons</h2><ul>" + "".join(f'<li><a href="/learn/{l["id"]}/">{esc(l["title"])}</a></li>' for l in used) + "</ul>") if used else ""
    print_link = f'<a class="btn" href="mailto:{esc(email)}?subject={esc("Print enquiry: " + t)}">Ask about a print</a>' if email else ""
    prev_p, next_p = (photos[i - 1] if i > 0 else None), (photos[i + 1] if i < len(photos) - 1 else None)
    pn = '<nav class="pn" aria-label="More photographs">' + (
        f'<a href="/photo/{prev_p["id"]}/"><small>Previous</small>{esc(prev_p.get("title") or "Untitled")}</a>' if prev_p else "<span></span>") + (
        f'<a href="/photo/{next_p["id"]}/" style="text-align:right"><small>Next</small>{esc(next_p.get("title") or "Untitled")}</a>' if next_p else "<span></span>") + "</nav>"
    return head(title, desc, url, image, wh, [PERSON, ph]) + f"""<main class="sp wide">
<figure class="photo-full">{img_tag(p, alt_of(p), "(max-width: 1100px) 100vw, 1100px", eager=True)}</figure>
<div style="max-width:760px">
<p class="eyebrow">Photograph{f" &middot; {esc(where)}" if where else ""}</p>
<h1>{esc(t)}</h1>
{f'<p class="lede">{esc(p["description"])}</p>' if p.get("description") else ""}
{facts}
<div class="tags">{tags}</div>
<div class="cta" style="margin-top:30px"><p>See it full screen in the gallery, or ask about a print.</p><a class="btn" href="/#p/{p["id"]}">View in the gallery</a>{print_link}</div>
{used_html}
{pn}
</div>
</main>
""" + foot()


def build_pages(changed, write_if_changed):
    """Write every lesson and photo page; remove pages for lessons or photographs that have gone.
    Returns (lessons, photos) for the sitemap."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data = json.load(open(os.path.join(root, "photos.json"), encoding="utf-8"))
    site = data.get("site", {})
    photos = [p for p in data.get("photos", []) if p.get("file")]
    lessons = [l for l in data.get("lessons", []) if l.get("id") and not l.get("draft")]
    topics = {t["id"]: t["name"] for t in site.get("lessonTopics", [])}
    cats = {c["id"]: c["name"] for c in site.get("categories", [])}
    n = 0
    if write_if_changed("learn/index.html", learn_index(lessons, topics, photos)):
        n += 1
    for i, l in enumerate(lessons):
        if write_if_changed(f'learn/{l["id"]}/index.html', lesson_page(l, i, lessons, photos, topics)):
            n += 1
    for i, p in enumerate(photos):
        if write_if_changed(f'photo/{p["id"]}/index.html', photo_page(p, i, photos, lessons, cats, site.get("email", ""))):
            n += 1
    # tidy away pages whose lesson or photograph has been deleted
    for folder, keep in (("learn", {l["id"] for l in lessons}), ("photo", {p["id"] for p in photos})):
        base = os.path.join(root, folder)
        if os.path.isdir(base):
            for name in os.listdir(base):
                if os.path.isdir(os.path.join(base, name)) and name not in keep:
                    shutil.rmtree(os.path.join(base, name)); n += 1
    if n:
        changed.append(f"{n} lesson and photo pages")
    return lessons, photos
