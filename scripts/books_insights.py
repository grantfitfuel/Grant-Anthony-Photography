#!/usr/bin/env python3
"""Weekly report: which books are drawing the most interest on Instagram.

Run by .github/workflows/books-insights.yml. For both book accounts it reads every post
(automatic ones and Reels you posted by hand), works out which book each one is about
from its caption, asks Instagram for that post's numbers, and adds them up per book.
Nothing is posted and nothing in the repository changes. The report is written to
report.md for the workflow to put in a GitHub issue.

Needs the same tokens as the posting job, with the "instagram_business_manage_insights"
permission. If that is missing, the report says so and how to add it.

Environment: IG_TOKEN_FICTION, IG_TOKEN_NONFICTION, DAYS (how far back, default 90),
IG_API_BASE (tests only).
"""
import json, os, sys, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = os.environ.get("IG_API_BASE", "https://graph.instagram.com/v23.0").rstrip("/")
DAYS = int(os.environ.get("DAYS", "90"))
METRICS = ["reach", "saved", "shares", "likes", "comments", "views"]


class NoPermission(Exception):
    pass


def get(url, params):
    full = f"{url}?{urllib.parse.urlencode(params)}" if params else url
    try:
        with urllib.request.urlopen(full, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode()).get("error", {}).get("message") or str(e)
        except Exception:
            msg = str(e)
        if "permission" in msg.lower() or "scope" in msg.lower():
            raise NoPermission(msg)
        raise RuntimeError(msg)


def media_list(token, since):
    me = get(f"{API}/me", {"fields": "user_id,username", "access_token": token})
    user = me.get("user_id") or me.get("id")
    out, url, params = [], f"{API}/{user}/media", {
        "fields": "id,caption,media_type,media_product_type,timestamp,permalink", "limit": 50, "access_token": token}
    while url:
        page = get(url, params)
        for m in page.get("data", []):
            ts = datetime.fromisoformat(m["timestamp"].replace("+0000", "+00:00"))
            if ts < since:
                return me.get("username", ""), out
            out.append(m)
        nxt = page.get("paging", {}).get("next")
        url, params = (nxt, {}) if nxt else (None, None)
    return me.get("username", ""), out


def insights(token, mid):
    """The post's numbers. Asks for all at once, then one by one if Instagram refuses the set."""
    try:
        res = get(f"{API}/{mid}/insights", {"metric": ",".join(METRICS), "access_token": token})
        return {d["name"]: (d.get("values") or [{}])[0].get("value", 0) for d in res.get("data", [])}
    except NoPermission:
        raise
    except RuntimeError:
        vals = {}
        for m in METRICS:
            try:
                res = get(f"{API}/{mid}/insights", {"metric": m, "access_token": token})
                for d in res.get("data", []):
                    vals[d["name"]] = (d.get("values") or [{}])[0].get("value", 0)
            except NoPermission:
                raise
            except RuntimeError:
                pass
        return vals


def book_for(caption, titles):
    """The book a caption is about: the longest title it mentions."""
    c = (caption or "").lower().replace("’", "'")
    hits = [t for t in titles if t.lower() in c]
    return max(hits, key=len) if hits else None


def main():
    data = json.load(open(os.path.join(ROOT, "books", "posts.json"), encoding="utf-8"))
    titles = [b["title"] for b in data["books"].values()]
    since = datetime.now(timezone.utc) - timedelta(days=DAYS)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    lines, problems = [], []
    per_book, recent = {}, []

    for name, acc in data["accounts"].items():
        token = os.environ.get(acc["secret"], "").strip()
        handle = acc["handle"]
        if not token:
            problems.append(f"@{handle}: no {acc['secret']} secret is set.")
            continue
        try:
            who, media = media_list(token, since)
            for m in media:
                book = book_for(m.get("caption"), titles)
                if not book:
                    continue
                v = insights(token, m["id"])
                kind = "Reel" if m.get("media_product_type") == "REELS" else ("Carousel" if m.get("media_type") == "CAROUSEL_ALBUM" else "Post")
                b = per_book.setdefault(book, {"account": handle, "posts": 0, "reach": 0, "saved": 0, "shares": 0, "likes": 0, "comments": 0, "views": 0})
                b["posts"] += 1
                for k in ("reach", "saved", "shares", "likes", "comments", "views"):
                    b[k] += int(v.get(k, 0) or 0)
                ts = datetime.fromisoformat(m["timestamp"].replace("+0000", "+00:00"))
                if ts >= week_ago:
                    recent.append((ts, handle, book, kind, v, m.get("permalink", "")))
        except NoPermission as e:
            problems.append(
                f"@{handle}: Instagram will not share post numbers with this token ({e}). "
                "Fix: in the Meta app (GCA Photo Poster) open Use cases > Customize, and in Permissions "
                "make sure instagram_business_manage_insights is added. Then on the API setup with "
                "Instagram login page, Generate token for this account again and put the new token in the "
                f"{acc['secret']} secret. Posting carries on as normal either way.")
        except RuntimeError as e:
            problems.append(f"@{handle}: {e}")

    lines.append(f"Instagram interest by book, last {DAYS} days. Every post that names a book counts, including Reels you posted by hand.\n")
    if problems:
        lines.append("**Needs attention**\n")
        lines += [f"- {p}" for p in problems]
        lines.append("")
    if per_book:
        def score(b):
            return (b["saved"] + b["shares"]) / b["reach"] * 100 if b["reach"] else 0
        rows = sorted(per_book.items(), key=lambda kv: (score(kv[1]), kv[1]["reach"]), reverse=True)
        lines.append("**By book** (sorted by saves and shares per 100 people reached, the best sign of real interest)\n")
        lines.append("| Book | Account | Posts | Reach | Reach per post | Saves | Shares | Saves + shares per 100 reached |")
        lines.append("|---|---|---:|---:|---:|---:|---:|---:|")
        for t, b in rows:
            per = round(b["reach"] / b["posts"]) if b["posts"] else 0
            lines.append(f"| {t} | @{b['account']} | {b['posts']} | {b['reach']} | {per} | {b['saved']} | {b['shares']} | {score(b):.1f} |")
        lines.append("")
        lines.append("Read it as a trend over several weeks. With small numbers, one post can swing a book up or down.\n")
    elif not problems:
        lines.append("No posts naming a book were found in that period.\n")
    if recent:
        lines.append("**Posted in the last 7 days**\n")
        lines.append("| Date | Account | Book | Type | Reach | Saves | Shares | Likes |")
        lines.append("|---|---|---|---|---:|---:|---:|---:|")
        for ts, handle, book, kind, v, link in sorted(recent):
            label = f"[{ts:%a %-d %b}]({link})" if link else f"{ts:%a %-d %b}"
            lines.append(f"| {label} | @{handle} | {book} | {kind} | {v.get('reach', 0)} | {v.get('saved', 0)} | {v.get('shares', 0)} | {v.get('likes', 0)} |")
        lines.append("")

    report = "\n".join(lines)
    with open("report.md", "w", encoding="utf-8") as f:
        f.write(report)
    print(report)


if __name__ == "__main__":
    main()
