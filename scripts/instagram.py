#!/usr/bin/env python3
"""Post the next queued photograph to Instagram.

Run by .github/workflows/instagram.yml. Reads photos.json (written by the Studio),
picks the first photograph ticked "Share to Instagram" that has not been posted yet,
prepares an Instagram-sized copy, posts it, and records it in instagram-log.json.

instagram-log.json belongs to this script only. The Studio never writes it, so a
Studio publish can never wipe the record and cause a photograph to be posted twice.

Environment:
  IG_TOKEN        Instagram access token (GitHub secret)
  MODE            "dry-run" (default) or "post"
  GH_PAT          optional; lets the script save a renewed IG_TOKEN back to the secret
  IG_API_BASE     optional; defaults to https://graph.instagram.com/v23.0 (overridden in tests)
  GITHUB_REPOSITORY, GITHUB_SHA  set by GitHub Actions
"""
import json, math, os, subprocess, sys, time, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timezone
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = os.environ.get("IG_API_BASE", "https://graph.instagram.com/v23.0").rstrip("/")
REFRESH = os.environ.get("IG_REFRESH_URL", "https://graph.instagram.com/refresh_access_token")
MODE = os.environ.get("MODE", "dry-run")
TOKEN = os.environ.get("IG_TOKEN", "").strip()
REPO = os.environ.get("GITHUB_REPOSITORY", "")
LOG_PATH = os.path.join(ROOT, "instagram-log.json")
OUT_DIR = os.path.join(ROOT, "ig")
CAPTION_MAX = 2200
MAX_TAGS = 30


def say(*a):
    print(*a, flush=True)


def fail(msg):
    say("::error::" + msg)
    sys.exit(1)


# ---------- data ----------
def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def last_posted(log):
    """id -> date of its most recent post"""
    last = {}
    for x in log.get("posted", []):
        if x.get("id") and x.get("date", "") > last.get(x["id"], ""):
            last[x["id"]] = x["date"]
    return last


def is_due(p, last):
    """Ticked and never posted, or 'Post again' pressed in the Studio since its last post."""
    if not p.get("instagram"):
        return False
    when = last.get(p["id"])
    if not when:
        return True
    again = p.get("igRepostAfter") or ""
    try:
        return bool(again) and datetime.fromisoformat(again.replace("Z", "+00:00")) > datetime.fromisoformat(when)
    except ValueError:
        return False


def next_photo(data, log):
    last = last_posted(log)
    for p in data.get("photos", []):
        if is_due(p, last):
            return p
    return None


def camera_tags(p, site):
    """Tags for the camera that took the photograph, from the Camera field.
    site.igCameraTags lines look like:  Canon EOS R5 = #canonr5"""
    # Ignore case, spaces, hyphens and the word "EOS", so "Canon R5" matches "Canon EOS R5"
    norm = lambda x: "".join(ch for ch in x.lower().replace("eos", "") if ch.isalnum())
    cam = norm(p.get("camera") or "")
    if not cam:
        return ""
    for line in (site.get("igCameraTags") or "").splitlines():
        if "=" not in line:
            continue
        name, tags = line.split("=", 1)
        n = norm(name)
        if n and (n in cam or cam in n):
            return tags
    return ""


def caption_for(p, site):
    parts = []
    title = (p.get("title") or "").strip()
    if title:
        parts.append(title)
    where = " · ".join(x for x in [(p.get("location") or "").strip(), str(p.get("year") or "").strip()] if x)
    if where:
        parts.append(where)
    desc = (p.get("description") or "").strip()
    if desc:
        parts.append(desc)
    if site.get("showSettings", True):
        bits = [p.get(k, "").strip() for k in ("camera", "focal", "aperture", "shutter", "iso")]
        bits = [b for b in bits if b]
        if bits:
            parts.append(" · ".join(bits))
    link = (site.get("igLink") or "").strip()
    if link:
        parts.append(link)
    tags = []
    # Tags for every post first, then the tags set for each of the photograph's categories
    src = (site.get("igHashtags") or "") + " " + camera_tags(p, site) + " " + " ".join((site.get("igCategoryTags") or {}).get(c, "") for c in p.get("categories", []))
    for t in src.replace(",", " ").split():
        t = "#" + t.lstrip("#")
        if len(t) > 1 and t.lower() not in [x.lower() for x in tags]:
            tags.append(t)
    tags = tags[:MAX_TAGS]
    tail = " ".join(tags)
    body = "\n\n".join(parts)
    room = CAPTION_MAX - (len(tail) + 2 if tail else 0)
    if len(body) > room:
        body = body[: room - 1].rstrip() + "…"
    return body + ("\n\n" + tail if tail else "")


# ---------- image ----------
def prepare_image(p, site):
    """Instagram accepts JPEG between 4:5 (portrait) and 1.91:1 (landscape), up to 1440 px wide.
    Anything outside that range gets a plain border rather than a crop, so nothing is cut."""
    src = os.path.join(ROOT, p.get("file") or f"images/{p['id']}.jpg")
    if not os.path.exists(src):
        fail(f"Image file not found for '{p.get('title') or p['id']}': {src}")
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    w, h = im.size
    r = w / h
    border = (site.get("igBorder") or "#ffffff").strip()
    if r < 0.8:                      # taller than 4:5: widen with a border
        cw, ch = math.ceil(h * 0.8), h
    elif r > 1.91:                   # wider than 1.91:1: deepen with a border
        cw, ch = w, math.ceil(w / 1.91)
    else:
        cw, ch = w, h
    if (cw, ch) != (w, h):
        canvas = Image.new("RGB", (cw, ch), border)
        canvas.paste(im, ((cw - w) // 2, (ch - h) // 2))
        im = canvas
    if im.width > 1440:
        im = im.resize((1440, round(im.height * 1440 / im.width)), Image.LANCZOS)
    # Rounding can leave the shape a pixel outside Instagram's limits; pull it back in
    if im.width / im.height < 0.8:
        im = im.resize((im.width, math.floor(im.width / 0.8)), Image.LANCZOS)
    elif im.width / im.height > 1.91:
        im = im.resize((im.width, math.ceil(im.width / 1.91)), Image.LANCZOS)
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, p["id"] + ".jpg")
    im.save(out, "JPEG", quality=92, optimize=True, progressive=False)
    return out, im.size


# ---------- git ----------
def git(*args, check=True):
    return subprocess.run(["git", *args], cwd=ROOT, check=check, capture_output=True, text=True)


def commit_and_push(paths, message):
    git("add", *paths)
    if git("diff", "--cached", "--quiet", check=False).returncode == 0:
        return git("rev-parse", "HEAD").stdout.strip()
    git("-c", "user.name=Instagram poster", "-c", "user.email=actions@users.noreply.github.com", "commit", "-m", message)
    for attempt in range(4):
        if git("push", check=False).returncode == 0:
            return git("rev-parse", "HEAD").stdout.strip()
        git("pull", "--rebase", "--quiet", check=False)
        time.sleep(2 * (attempt + 1))
    fail("Could not push to GitHub after several tries.")


# ---------- Instagram ----------
def call(method, url, params):
    data = urllib.parse.urlencode(params).encode()
    if method == "GET":
        req = urllib.request.Request(url + "?" + data.decode())
    else:
        req = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode()).get("error", {})
            msg = err.get("message") or str(e)
        except Exception:
            msg = str(e)
        raise RuntimeError(f"Instagram said: {msg}")


def refresh_token():
    """Long-lived tokens last 60 days. Renewing on every run keeps it alive indefinitely."""
    try:
        r = call("GET", REFRESH, {"grant_type": "ig_refresh_token", "access_token": TOKEN})
    except RuntimeError as e:
        say(f"Token not renewed this time ({e}). This is normal if the token is less than a day old.")
        return
    new = r.get("access_token")
    if not new:
        return
    days = round(int(r.get("expires_in", 0)) / 86400)
    pat = os.environ.get("GH_PAT", "").strip()
    if not pat:
        say(f"::warning::Token renewed for {days} days, but there is no GH_PAT secret to save it with. "
            "Add GH_PAT (see README) or the token will need replacing by hand every 60 days.")
        return
    res = subprocess.run(["gh", "secret", "set", "IG_TOKEN", "--repo", REPO, "--body", new],
                         capture_output=True, text=True, env={**os.environ, "GH_TOKEN": pat})
    if res.returncode == 0:
        say(f"Token renewed and saved; good for another {days} days.")
    else:
        say("::warning::Token renewed but could not be saved to the IG_TOKEN secret: " + res.stderr.strip())


def post(image_url, caption, expected_user):
    me = call("GET", f"{API}/me", {"fields": "user_id,username", "access_token": TOKEN})
    user, name = me.get("user_id") or me.get("id"), me.get("username", "")
    if expected_user and name.lower() != expected_user.lower().lstrip("@"):
        fail(f"The token belongs to @{name}, not @{expected_user.lstrip('@')}. Nothing was posted.")
    c = call("POST", f"{API}/{user}/media", {"image_url": image_url, "caption": caption, "access_token": TOKEN})
    cid = c["id"]
    for _ in range(30):
        st = call("GET", f"{API}/{cid}", {"fields": "status_code", "access_token": TOKEN}).get("status_code")
        if st == "FINISHED":
            break
        if st in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"Instagram could not process the image (status {st}).")
        time.sleep(5)
    else:
        raise RuntimeError("Instagram took too long to process the image.")
    pub = call("POST", f"{API}/{user}/media_publish", {"creation_id": cid, "access_token": TOKEN})
    mid = pub["id"]
    link = ""
    try:
        link = call("GET", f"{API}/{mid}", {"fields": "permalink", "access_token": TOKEN}).get("permalink", "")
    except RuntimeError:
        pass
    return mid, link, name


# ---------- main ----------
LOCAL_TZ = "Europe/London"
LOCAL_HOUR = 18          # scheduled posts go out at 18:00 UK time, summer and winter


def scheduled_slot_ok(log, now=None):
    """GitHub schedules run on UTC, which does not follow the clocks changing.
    The workflow wakes at 17:00 and 18:00 UTC; this keeps only the run that falls
    at or after 18:00 UK time, and never posts twice on the same UK day."""
    from zoneinfo import ZoneInfo
    tz = ZoneInfo(LOCAL_TZ)
    now = (now or datetime.now(timezone.utc)).astimezone(tz)
    if now.hour < LOCAL_HOUR:
        say(f"It is {now:%H:%M} UK time; scheduled posts wait until {LOCAL_HOUR}:00. Nothing to do on this run.")
        return False
    for x in log.get("posted", []):
        try:
            if datetime.fromisoformat(x["date"]).astimezone(tz).date() == now.date():
                say("Already posted today (UK time). Nothing to do on this run.")
                return False
        except (KeyError, ValueError):
            pass
    return True


def main():
    data = load_json(os.path.join(ROOT, "photos.json"), None)
    if not data:
        fail("photos.json not found.")
    site = data.get("site", {})
    log = load_json(LOG_PATH, {"posted": []})
    if os.environ.get("SCHEDULED") == "1" and not scheduled_slot_ok(log):
        return
    p = next_photo(data, log)
    if not p:
        say("Nothing queued. Tick 'Share to Instagram' on a photograph in the Studio and publish.")
        if MODE == "post" and TOKEN:
            refresh_token()
        return
    cap = caption_for(p, site)
    out, size = prepare_image(p, site)
    say(f"Next up: {p.get('title') or p['id']}  ({size[0]} x {size[1]} px)")
    say("----- caption -----\n" + cap + "\n-------------------")
    if MODE != "post":
        say("Dry run: nothing was posted. Run again with 'post' to publish this one.")
        return
    if not TOKEN:
        fail("No IG_TOKEN secret is set. See the Instagram section of the README.")
    refresh_token()
    rel = os.path.relpath(out, ROOT)
    sha = commit_and_push([rel], f"Instagram: prepare {p['id']}")
    image_url = os.environ.get("IG_IMAGE_BASE", f"https://raw.githubusercontent.com/{REPO}/{sha}/").rstrip("/") + "/" + rel
    try:
        mid, link, name = post(image_url, cap, site.get("igAccount", ""))
    except RuntimeError as e:
        log["lastError"] = {"id": p["id"], "date": datetime.now(timezone.utc).isoformat(timespec="seconds"), "message": str(e)}
        with open(LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(log, f, indent=2, ensure_ascii=False); f.write("\n")
        commit_and_push(["instagram-log.json"], f"Instagram: failed to post {p['id']}")
        fail(str(e))
    log.setdefault("posted", []).append({"id": p["id"], "title": p.get("title", ""), "date": datetime.now(timezone.utc).isoformat(timespec="seconds"), "media": mid, "link": link})
    log.pop("lastError", None)
    with open(LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2, ensure_ascii=False); f.write("\n")
    commit_and_push(["instagram-log.json"], f"Instagram: posted {p['id']}")
    say(f"Posted to @{name}: {link or mid}")


if __name__ == "__main__":
    main()
