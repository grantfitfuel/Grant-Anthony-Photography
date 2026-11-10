#!/usr/bin/env python3
"""Post the next book post to Instagram, for the fiction or the nonfiction account.

Run by .github/workflows/books-instagram.yml. Reads books/posts.json, picks the first
post for that account that has not gone out yet, draws its image with
scripts/books_cards.py, posts it, and records it in books/instagram-log.json.

  Fiction    (@grantcanthony)  Mondays and Thursdays, 18:00 UK time
  Nonfiction (@g_c_anthony)    Wednesdays and Saturdays, 18:00 UK time
  (days and handles are set in books/posts.json under "accounts")

A post with a "date" (YYYY-MM-DD) goes out on that day only, at 18:00 UK time, on any day of
the week, ahead of the queue. GitHub's timer often runs hours late, so a run up to 03:00 UK the
next morning still counts as the evening before. After that the day is missed and the post is skipped.

Quote, talk and excerpt posts go out as Reels, made by scripts/books_reels.py (moving text over
the cover, with an original score). If Instagram won't take the reel, the image goes out instead.
A post can say "format": "image" to stay a picture, and "trial": "auto" to go out as a trial reel
(shown to non-followers first, shared with followers automatically if it does well).

Captions carry at most five hashtags (Instagram's limit): the post's own first, then the book's,
then the account's.

books/instagram-log.json belongs to this script only, so editing the queue can never
wipe the record and cause something to be posted twice.

Environment:
  ACCOUNT               "fiction", "nonfiction" or "auto" (auto = whichever posts today)
  MODE                  "dry-run" (default) or "post"
  SCHEDULED             "1" = only post at or after 18:00 UK, once per account per day
  IG_TOKEN_FICTION      token for @grantcanthony (GitHub secret)
  IG_TOKEN_NONFICTION   token for @g_c_anthony (GitHub secret)
  GH_PAT                optional; lets renewed tokens be saved back to their secrets
  IG_API_BASE, IG_REFRESH_URL, IG_IMAGE_BASE, NOW   overrides used in tests
"""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import books_cards  # noqa: E402
try:
    import books_reels  # noqa: E402  (needs numpy; without it, posts go out as images)
    REELS_OFF = ""
except Exception as e:
    books_reels, REELS_OFF = None, str(e)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKS = os.path.join(ROOT, "books")
QUEUE_PATH = os.path.join(BOOKS, "posts.json")
LOG_PATH = os.path.join(BOOKS, "instagram-log.json")
OUT_DIR = os.path.join(BOOKS, "ig")
API = os.environ.get("IG_API_BASE", "https://graph.instagram.com/v23.0").rstrip("/")
REFRESH = os.environ.get("IG_REFRESH_URL", "https://graph.instagram.com/refresh_access_token")
MODE = os.environ.get("MODE", "dry-run")
REPO = os.environ.get("GITHUB_REPOSITORY", "")
TZ = ZoneInfo("Europe/London")
LOCAL_HOUR = 18
LATE_HOURS = 3     # a run delayed past midnight, up to 03:00 UK, still counts as the evening before
CAPTION_MAX = 2200
MAX_TAGS = 5       # Instagram allows five hashtags per post
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def say(*a):
    print(*a, flush=True)


def fail(msg):
    say("::error::" + msg)
    sys.exit(1)


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def write_log(log):
    with open(LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2, ensure_ascii=False)
        f.write("\n")


def now_uk():
    fixed = os.environ.get("NOW")
    t = datetime.fromisoformat(fixed) if fixed else datetime.now(timezone.utc)
    return t.astimezone(TZ)


# ---------- choosing ----------
def post_day(t):
    """The posting day a moment belongs to. Until 03:00 UK it is still the evening before."""
    return (t.astimezone(TZ) - timedelta(hours=LATE_HOURS)).date()


def dated_today(data, log, account, now):
    """The post set for today's date for this account, if it has not gone out yet."""
    done = {x["id"] for x in log.get("posted", [])}
    for p in data["posts"]:
        book = data["books"].get(p.get("book"), {})
        if (book.get("account") == account and p.get("date") == post_day(now).isoformat()
                and p["id"] not in done and not p.get("hold")):
            return p
    return None


def account_for_today(data, now, log=None):
    """The account that posts today: one with a dated post still to go out today first,
    then the account whose usual day it is and which has not posted yet."""
    log = log or {"posted": []}
    day = DAYS[post_day(now).weekday()]
    for name in data["accounts"]:
        if dated_today(data, log, name, now) and not posted_today(log, name, now):
            return name
    for name, acc in data["accounts"].items():
        if day in acc.get("days", []):
            return name
    return None


def next_post(data, log, account, now=None):
    now = now or now_uk()
    dated = dated_today(data, log, account, now)
    if dated:
        return dated
    done = {x["id"] for x in log.get("posted", [])}
    for p in data["posts"]:
        book = data["books"].get(p.get("book"), {})
        if book.get("account") == account and p["id"] not in done and not p.get("hold") and not p.get("date"):
            return p
    return None


def posted_today(log, account, now):
    for x in log.get("posted", []):
        try:
            if x.get("account") == account and post_day(datetime.fromisoformat(x["date"])) == post_day(now):
                return True
        except (KeyError, ValueError):
            pass
    return False


# ---------- caption ----------
def caption_for(p, data):
    book = data["books"][p["book"]]
    acc = data["accounts"][book["account"]]
    body = p.get("caption", "").strip()
    link = data.get("link", "").strip()
    if link and link not in body:
        body += "\n\n" + link
    # Five hashtags at most, counting any already in the caption: the post's own, then the book's,
    # then the account's.
    tags = [t.lower() for t in re.findall(r"(?<![\w#])#\w+", body)]
    room = max(0, MAX_TAGS - len(tags))
    extra = []
    for t in (p.get("tags", "") + " " + book.get("tags", "") + " " + acc.get("tags", "")).replace(",", " ").split():
        t = "#" + t.lstrip("#")
        if len(t) > 1 and t.lower() not in tags:
            tags.append(t.lower())
            extra.append(t)
    tail = " ".join(extra[:room])
    room = CAPTION_MAX - (len(tail) + 2 if tail else 0)
    if len(body) > room:
        body = body[: room - 1].rstrip() + "…"
    return body + ("\n\n" + tail if tail else "")


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
    req = urllib.request.Request(url + "?" + data.decode()) if method == "GET" else urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode()).get("error", {}).get("message") or str(e)
        except Exception:
            msg = str(e)
        raise RuntimeError(f"Instagram said: {msg}")


def refresh_token(token, secret):
    """Long-lived tokens last 60 days. Renewing on every run keeps them alive."""
    try:
        r = call("GET", REFRESH, {"grant_type": "ig_refresh_token", "access_token": token})
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
            f"Without it, {secret} needs replacing by hand every 60 days.")
        return
    res = subprocess.run(["gh", "secret", "set", secret, "--repo", REPO, "--body", new],
                         capture_output=True, text=True, env={**os.environ, "GH_TOKEN": pat})
    if res.returncode == 0:
        say(f"Token renewed and saved to {secret}; good for another {days} days.")
    else:
        say(f"::warning::Token renewed but could not be saved to {secret}: " + res.stderr.strip())


def wait_ready(token, cid, tries=30, pause=None, what="image"):
    pause = float(os.environ.get("IG_POLL_SECONDS", "5")) if pause is None else pause
    for _ in range(tries):
        r = call("GET", f"{API}/{cid}", {"fields": "status_code,status", "access_token": token})
        st = r.get("status_code")
        if st == "FINISHED":
            return
        if st in ("ERROR", "EXPIRED"):
            detail = f": {r['status']}" if r.get("status") and r.get("status") != st else ""
            raise RuntimeError(f"Instagram could not process the {what} (status {st}{detail}).")
        time.sleep(pause)
    raise RuntimeError(f"Instagram took too long to process the {what}.")


def whoami(token, expected):
    me = call("GET", f"{API}/me", {"fields": "user_id,username", "access_token": token})
    user, name = me.get("user_id") or me.get("id"), me.get("username", "")
    if name.lower() != expected.lower().lstrip("@"):
        raise PermissionError(f"The token belongs to @{name}, not @{expected.lstrip('@')}. Nothing was posted.")
    return user, name


def publish(token, user, cid):
    mid = call("POST", f"{API}/{user}/media_publish", {"creation_id": cid, "access_token": token})["id"]
    link = ""
    try:
        link = call("GET", f"{API}/{mid}", {"fields": "permalink", "access_token": token}).get("permalink", "")
    except RuntimeError:
        pass
    return mid, link


class NotPosted(RuntimeError):
    """The reel failed before anything was published, so the image can safely go instead."""


def post_reel(token, video_url, caption, expected, thumb_ms=None, trial=None):
    user, name = whoami(token, expected)
    params = {"media_type": "REELS", "video_url": video_url, "caption": caption, "share_to_feed": "true", "access_token": token}
    if thumb_ms:
        params["thumb_offset"] = str(int(thumb_ms))
    tries = [params]
    if trial:
        how = "MANUAL" if str(trial).lower() == "manual" else "SS_PERFORMANCE"
        tries = [{**params, "trial_params": json.dumps({"graduation_strategy": how})}, params]
    cid, as_trial = None, False
    for n, prm in enumerate(tries):
        try:
            cid = call("POST", f"{API}/{user}/media", prm)["id"]
            as_trial = "trial_params" in prm
            break
        except RuntimeError as e:
            if n == len(tries) - 1:
                raise NotPosted(str(e))
            say(f"::warning::Instagram would not take it as a trial reel ({e}). Posting it as an ordinary reel.")
    try:
        wait_ready(token, cid, tries=int(os.environ.get("IG_REEL_TRIES", "36")),
                   pause=float(os.environ.get("IG_REEL_POLL_SECONDS", "10")), what="reel")
    except RuntimeError as e:
        raise NotPosted(str(e))
    mid, link = publish(token, user, cid)
    return mid, link, name, as_trial


def post(token, image_urls, caption, expected):
    """One image posts as a single image; two to ten post as a carousel."""
    user, name = whoami(token, expected)
    if len(image_urls) == 1:
        cid = call("POST", f"{API}/{user}/media", {"image_url": image_urls[0], "caption": caption, "access_token": token})["id"]
    else:
        if len(image_urls) > 10:
            raise RuntimeError("A carousel can have at most 10 slides.")
        children = []
        for url in image_urls:
            child = call("POST", f"{API}/{user}/media", {"image_url": url, "is_carousel_item": "true", "access_token": token})["id"]
            wait_ready(token, child)
            children.append(child)
        cid = call("POST", f"{API}/{user}/media", {"media_type": "CAROUSEL", "children": ",".join(children), "caption": caption, "access_token": token})["id"]
    wait_ready(token, cid)
    mid, link = publish(token, user, cid)
    return mid, link, name


def site_base():
    """The site's own address (from CNAME), where GitHub Pages serves the repository's files."""
    if os.environ.get("SITE_BASE") is not None:
        return os.environ["SITE_BASE"].rstrip("/")
    try:
        with open(os.path.join(ROOT, "CNAME"), encoding="utf-8") as f:
            host = f.read().strip()
        return "https://" + host if host else ""
    except FileNotFoundError:
        return ""


def video_address(rel, sha, raw_base):
    """Where Instagram should fetch the reel from. The site serves video with the right type, so wait
    (up to about seven minutes) for GitHub Pages to publish it; if it is slow, use the raw file."""
    raw = raw_base + "/" + rel
    site = site_base()
    if not site or os.environ.get("IG_IMAGE_BASE"):
        return raw
    url = f"{site}/{rel}?v={sha[:10]}"
    size = os.path.getsize(os.path.join(ROOT, rel))
    deadline = time.time() + float(os.environ.get("PAGES_WAIT", "420"))
    n = 0
    while time.time() < deadline:
        n += 1
        try:
            req = urllib.request.Request(f"{url}&check={n}", method="HEAD")
            with urllib.request.urlopen(req, timeout=30) as r:
                length = r.headers.get("Content-Length")
                if r.status == 200 and (length is None or int(length) == size):
                    say(f"The reel is live on the site after {n} check(s).")
                    return url
        except (urllib.error.URLError, ValueError, OSError):
            pass
        time.sleep(15)
    say("::warning::The site had not published the reel yet, so Instagram will fetch it from GitHub directly.")
    return raw


def check_access(data):
    """Confirm every account can post, without posting anything."""
    ok = True
    for name, acc in data["accounts"].items():
        handle, secret = acc["handle"], acc["secret"]
        say(f"\n@{handle} ({name})")
        token = os.environ.get(secret, "").strip()
        if not token:
            say(f"  FAIL  No {secret} secret is set in GitHub.")
            ok = False
            continue
        say(f"  ok    {secret} secret is set")
        try:
            try:
                me = call("GET", f"{API}/me", {"fields": "user_id,username,account_type", "access_token": token})
            except RuntimeError:
                me = call("GET", f"{API}/me", {"fields": "user_id,username", "access_token": token})
        except RuntimeError as e:
            say(f"  FAIL  Instagram did not accept the token ({str(e).replace('Instagram said: ', '')}). Generate it again.")
            ok = False
            continue
        who = me.get("username", "")
        if who.lower() != handle.lower():
            say(f"  FAIL  The token belongs to @{who}, not @{handle}.")
            ok = False
            continue
        say(f"  ok    Token belongs to @{who}")
        kind = (me.get("account_type") or "").upper()
        if kind and kind not in ("BUSINESS", "MEDIA_CREATOR", "CREATOR"):
            say(f"  FAIL  @{who} is a {kind.lower()} account. Switch it to professional (Creator) in the Instagram app.")
            ok = False
        elif kind:
            say(f"  ok    Professional account ({kind.lower().replace('media_', '')})")
        user = me.get("user_id") or me.get("id")
        try:
            lim = call("GET", f"{API}/{user}/content_publishing_limit", {"fields": "quota_usage,config", "access_token": token})
            used = (lim.get("data") or [{}])[0].get("quota_usage", 0)
            say(f"  ok    Allowed to publish (posts in the last 24 hours: {used})")
        except RuntimeError as e:
            say(f"  FAIL  Not allowed to publish ({str(e).replace('Instagram said: ', '')}). Generate the token again and allow 'Access and publish content'.")
            ok = False
    pat = os.environ.get("GH_PAT", "").strip()
    say("")
    if pat:
        say("ok    GH_PAT is set, so renewed tokens can be saved.")
    else:
        say("::warning::No GH_PAT secret, so tokens will need replacing by hand every 60 days.")
    if not ok:
        fail("Access check failed. Fix the items marked FAIL above, then run the check again.")
    say("\nAll set. Both accounts can post.")


# ---------- main ----------
def main():
    data = load_json(QUEUE_PATH, None)
    if not data:
        fail("books/posts.json not found.")
    log = load_json(LOG_PATH, {"posted": []})
    now = now_uk()
    scheduled = os.environ.get("SCHEDULED") == "1"

    account = (os.environ.get("ACCOUNT") or "auto").strip().lower()
    if MODE == "check":
        return check_access(data)
    if account == "auto":
        account = account_for_today(data, now, log)
        if not account:
            say(f"No account posts on {DAYS[post_day(now).weekday()]}. Nothing to do on this run.")
            return
    if account not in data["accounts"]:
        fail(f"Unknown account '{account}'. Use fiction, nonfiction or auto.")
    acc = data["accounts"][account]
    token = os.environ.get(acc["secret"], "").strip()
    say(f"Account: {account} (@{acc['handle']})")

    if scheduled:
        if LATE_HOURS <= now.hour < LOCAL_HOUR:
            say(f"It is {now:%H:%M} UK time; scheduled posts wait until {LOCAL_HOUR}:00. Nothing to do on this run.")
            return
        if posted_today(log, account, now):
            say(f"@{acc['handle']} has already posted today (UK time). Nothing to do on this run.")
            return

    p = next_post(data, log, account, now)
    if not p:
        say(f"Nothing left in the queue for @{acc['handle']}. Add posts to books/posts.json.")
        if MODE == "post" and token:
            try:
                if call("GET", f"{API}/me", {"fields": "username", "access_token": token}).get("username", "").lower() == acc["handle"].lower():
                    refresh_token(token, acc["secret"])
            except RuntimeError as e:
                say(f"::warning::{acc['secret']} was not accepted: {e}")
        return

    cap = caption_for(p, data)
    outs = books_cards.save(p, data, OUT_DIR)
    video, info = None, {}
    if books_reels is None and p.get("type") in ("quote", "talk", "excerpt") and p.get("format") != "image":
        say(f"::warning::Reels are switched off because the reel maker could not load ({REELS_OFF}). The image will go out instead.")
    elif books_reels and books_reels.wants_reel(p):
        try:
            video, info = books_reels.save(p, data, OUT_DIR)
        except Exception as e:  # never let the reel stop the post going out
            say(f"::warning::Could not make the reel ({e}). The image will go out instead.")
    kind = (f"reel, {info['duration']:.0f} seconds" + (", trial" if p.get("trial") else "")) if video else (
        f"carousel, {len(outs)} slides" if len(outs) > 1 else "image")
    say(f"Next up: {p['id']}  ({kind})")
    say(f"Hashtags: {len(re.findall(r'(?<![\w#])#\w+', cap))}")
    say("----- caption -----\n" + cap + "\n-------------------")
    if MODE != "post":
        say("Dry run: nothing was posted. Run again with 'post' to publish this one.")
        return
    if not token:
        fail(f"No {acc['secret']} secret is set. See 'Book posts on Instagram' in the README.")
    try:
        who = call("GET", f"{API}/me", {"fields": "username", "access_token": token}).get("username", "")
    except RuntimeError as e:
        fail(f"{acc['secret']} was not accepted: {e}")
    if who.lower() != acc["handle"].lower():
        fail(f"{acc['secret']} belongs to @{who}, not @{acc['handle']}. Nothing was posted.")
    refresh_token(token, acc["secret"])
    rels = [os.path.relpath(o, ROOT) for o in outs]
    vrel = os.path.relpath(video, ROOT) if video else None
    sha = commit_and_push(rels + ([vrel] if vrel else []), f"Books Instagram: prepare {p['id']}")
    base = os.environ.get("IG_IMAGE_BASE", f"https://raw.githubusercontent.com/{REPO}/{sha}/").rstrip("/")
    fmt, note = ("carousel" if len(rels) > 1 else "image"), ""
    try:
        posted = None
        if vrel:
            try:
                url = video_address(vrel, sha, base)
                *posted, as_trial = post_reel(token, url, cap, acc["handle"], info.get("thumb_ms"), p.get("trial"))
                fmt = "trial reel" if as_trial else "reel"
            except NotPosted as e:
                note = f"Reel not accepted, image posted instead: {e}"
                say(f"::warning::The reel did not go through ({e}). Posting the image instead.")
        if not posted:
            posted = post(token, [base + "/" + r for r in rels], cap, acc["handle"])
        mid, link, name = posted
    except (RuntimeError, PermissionError) as e:
        log.setdefault("lastError", {})[account] = {"id": p["id"], "date": now.astimezone(timezone.utc).isoformat(timespec="seconds"), "message": str(e)}
        write_log(log)
        commit_and_push([os.path.relpath(LOG_PATH, ROOT)], f"Books Instagram: failed to post {p['id']}")
        fail(str(e))
    entry = {"id": p["id"], "account": account, "date": now.astimezone(timezone.utc).isoformat(timespec="seconds"),
             "media": mid, "link": link, "format": fmt}
    if note:
        entry["note"] = note
    log.setdefault("posted", []).append(entry)
    if isinstance(log.get("lastError"), dict):
        log["lastError"].pop(account, None)
        if not log["lastError"]:
            log.pop("lastError")
    write_log(log)
    if vrel:
        # Instagram has its own copy now. Take the video out of the site so it stays small; the file
        # stays on the runner, so the run's "books-instagram-preview" download still has it.
        git("rm", "--cached", "-q", vrel)
    commit_and_push([os.path.relpath(LOG_PATH, ROOT)], f"Books Instagram: posted {p['id']}")
    say(f"Posted to @{name} as {'an' if fmt == 'image' else 'a'} {fmt}: {link or mid}")


if __name__ == "__main__":
    main()
