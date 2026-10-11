#!/usr/bin/env python3
"""Post the next book post to Instagram, for the fiction or the nonfiction account.

Run by .github/workflows/books-instagram.yml. Reads books/posts.json, picks the first
post for that account that has not gone out yet, draws its image with
scripts/books_cards.py, posts it, and records it in books/instagram-log.json.

  Fiction    (@grantcanthony)  Mondays and Thursdays, 18:00 UK time
  Nonfiction (@g_c_anthony)    Wednesdays and Saturdays, 18:00 UK time
  (days and handles are set in books/posts.json under "accounts")

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
import json, os, subprocess, sys, time, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import books_cards  # noqa: E402

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
CAPTION_MAX = 2200
MAX_TAGS = 30
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
def account_for_today(data, now):
    day = DAYS[now.weekday()]
    for name, acc in data["accounts"].items():
        if day in acc.get("days", []):
            return name
    return None


def next_post(data, log, account):
    done = {x["id"] for x in log.get("posted", [])}
    for p in data["posts"]:
        book = data["books"].get(p.get("book"), {})
        if book.get("account") == account and p["id"] not in done and not p.get("hold"):
            return p
    return None


def posted_today(log, account, now):
    for x in log.get("posted", []):
        try:
            if x.get("account") == account and datetime.fromisoformat(x["date"]).astimezone(TZ).date() == now.date():
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
    tags = []
    for t in (book.get("tags", "") + " " + acc.get("tags", "") + " " + p.get("tags", "")).replace(",", " ").split():
        t = "#" + t.lstrip("#")
        if len(t) > 1 and t.lower() not in [x.lower() for x in tags]:
            tags.append(t)
    tail = " ".join(tags[:MAX_TAGS])
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


def wait_ready(token, cid):
    for _ in range(30):
        st = call("GET", f"{API}/{cid}", {"fields": "status_code", "access_token": token}).get("status_code")
        if st == "FINISHED":
            return
        if st in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"Instagram could not process the image (status {st}).")
        time.sleep(float(os.environ.get("IG_POLL_SECONDS", "5")))
    raise RuntimeError("Instagram took too long to process the image.")


def post(token, image_urls, caption, expected):
    """One image posts as a single image; two to ten post as a carousel."""
    me = call("GET", f"{API}/me", {"fields": "user_id,username", "access_token": token})
    user, name = me.get("user_id") or me.get("id"), me.get("username", "")
    if name.lower() != expected.lower().lstrip("@"):
        raise PermissionError(f"The token belongs to @{name}, not @{expected.lstrip('@')}. Nothing was posted.")
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
    mid = call("POST", f"{API}/{user}/media_publish", {"creation_id": cid, "access_token": token})["id"]
    link = ""
    try:
        link = call("GET", f"{API}/{mid}", {"fields": "permalink", "access_token": token}).get("permalink", "")
    except RuntimeError:
        pass
    return mid, link, name


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
        account = account_for_today(data, now)
        if not account:
            say(f"No account posts on {DAYS[now.weekday()]}. Nothing to do on this run.")
            return
    if account not in data["accounts"]:
        fail(f"Unknown account '{account}'. Use fiction, nonfiction or auto.")
    acc = data["accounts"][account]
    token = os.environ.get(acc["secret"], "").strip()
    say(f"Account: {account} (@{acc['handle']})")

    if scheduled:
        if now.hour < LOCAL_HOUR:
            say(f"It is {now:%H:%M} UK time; scheduled posts wait until {LOCAL_HOUR}:00. Nothing to do on this run.")
            return
        if posted_today(log, account, now):
            say(f"@{acc['handle']} has already posted today (UK time). Nothing to do on this run.")
            return

    p = next_post(data, log, account)
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
    say(f"Next up: {p['id']}" + (f"  (carousel, {len(outs)} slides)" if len(outs) > 1 else ""))
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
    sha = commit_and_push(rels, f"Books Instagram: prepare {p['id']}")
    base = os.environ.get("IG_IMAGE_BASE", f"https://raw.githubusercontent.com/{REPO}/{sha}/").rstrip("/")
    try:
        mid, link, name = post(token, [base + "/" + r for r in rels], cap, acc["handle"])
    except (RuntimeError, PermissionError) as e:
        log.setdefault("lastError", {})[account] = {"id": p["id"], "date": now.astimezone(timezone.utc).isoformat(timespec="seconds"), "message": str(e)}
        write_log(log)
        commit_and_push([os.path.relpath(LOG_PATH, ROOT)], f"Books Instagram: failed to post {p['id']}")
        fail(str(e))
    log.setdefault("posted", []).append({"id": p["id"], "account": account, "date": now.astimezone(timezone.utc).isoformat(timespec="seconds"), "media": mid, "link": link})
    if isinstance(log.get("lastError"), dict):
        log["lastError"].pop(account, None)
        if not log["lastError"]:
            log.pop("lastError")
    write_log(log)
    commit_and_push([os.path.relpath(LOG_PATH, ROOT)], f"Books Instagram: posted {p['id']}")
    say(f"Posted to @{name}: {link or mid}")


if __name__ == "__main__":
    main()
