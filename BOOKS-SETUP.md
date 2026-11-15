# Books site and book posts on Instagram

The books site lives at grantanthony.co.uk/books, inside the photography repo.
Book posts go out automatically:

- Fiction to @grantcanthony on Mondays and Thursdays at 18:00 UK time
- Nonfiction to @g_c_anthony on Wednesdays and Saturdays at 18:00 UK time

Photography posts to @gcanth on Tuesdays and Fridays, so no two jobs share a day.

## 1. Upload the files

Upload from the zip into the repo, keeping the folders:

- the whole `books` folder
- `scripts/books_cards.py`, `scripts/books_instagram.py` and `scripts/books_reels.py` (into the existing `scripts` folder)

The workflow file sits in a hidden folder, which drag-and-drop often misses. In the repo, choose
**Add file > Create new file**, type `.github/workflows/books-instagram.yml` as the name, paste in
the contents of `books-instagram.yml`, and commit.

Check the site at grantanthony.co.uk/books once GitHub Pages has rebuilt (a minute or two).

## 2. Make both Instagram accounts professional

In the Instagram app, on each of @grantcanthony and @g_c_anthony:
Settings > Account type and tools > Switch to professional account > Creator.
Both must be public.

## 3. Get a token for each account

Use the same Meta app you made for @gcanth. Do this on a computer.

1. Go to developers.facebook.com, open **My Apps**, and open your photo poster app.
2. Go to **Instagram > API setup with Instagram login**.
3. Under **Generate access tokens**, click **Add account**.
4. Log in to Instagram as **@grantcanthony** and allow the permissions.
   If it logs you straight in as @gcanth, log out of Instagram in that browser first, then try again.
5. Click **Generate token** next to @grantcanthony, tick the box, and copy the token.
6. Repeat steps 3 to 5 for **@g_c_anthony**.

Keep the tokens private. Paste them only into GitHub as below.

## 4. Store the tokens in GitHub

In the repo: **Settings > Secrets and variables > Actions > New repository secret**.

- Name `IG_TOKEN_FICTION`, value: the @grantcanthony token
- Name `IG_TOKEN_NONFICTION`, value: the @g_c_anthony token

Your existing `GH_PAT` secret lets both tokens renew themselves, as with photos.

## 5. Check access, then test

**Actions > Books Instagram > Run workflow**:

1. mode **check** (the account setting doesn't matter here). This posts nothing. For each account it
   confirms the secret is set, the token belongs to the right account, the account is professional,
   and it is allowed to publish. Anything wrong is marked FAIL with what to fix. Run it again until
   it ends with "All set. Both accounts can post."
2. account **fiction**, mode **dry-run**. The log shows the next post and its caption.
   The image is attached to the run as "books-instagram-preview".
3. Same for **nonfiction**.
4. When both look right, run each once with mode **post**, or just wait for the schedule.

The job checks each token belongs to the right account before posting, and stops if not.

## 6. An outside timer (recommended)

GitHub's own schedule is often hours late, which is why the photos have a cron-job.org timer.
Add a second cron-job.org job that starts the **books-instagram.yml** workflow **every day** at
18:00 UK (dated posts can fall on any day). It never posts twice in a day.

- URL: `https://api.github.com/repos/grantfitfuel/Grant-Anthony-Photography/actions/workflows/books-instagram.yml/dispatches`
- Method POST, with the same headers as the photo job
- Body: `{"ref":"main","inputs":{"account":"auto","mode":"post","scheduled":"1"}}`

GitHub's own schedule still runs as a back-up, every 15 minutes from 18:00 until 03:00 UK.
A run after midnight still counts as the evening before, so a late timer can't skip a day.

## How the queue works

- `books/posts.json` holds every post: the book, the card type, the text on the image, and the caption.
- Each account posts its next unposted item, in the order listed. Each is posted once.
- To hold a post back, add `"hold": true` to it. To change the order, move it in the list.
- `books/instagram-log.json` records what has gone out. Only the posting job writes it.
- The image for each post is drawn at posting time from the text, in the book's colours with its cover.
  To preview every card: `python scripts/books_cards.py` (writes `books/instagram/preview/`).
- Captions carry five hashtags at most (Instagram's limit): the post's own `"tags"` first, then the
  book's, then the account's.
- A post with a `"date"` goes out on that day, ahead of the queue, on any day of the week.

When the queue for an account runs out, it stops posting until more are added.

## Fonts

The site and the post images use Bricolage Grotesque, Source Serif 4 and IBM Plex Mono, all served
from `books/assets/fonts` (no outside font service). Their licences are in the same folder.

## Carousels

Carousels are in the same queue (`books/posts.json`) and post automatically on the usual days.
A carousel has `"type": "carousel"` and a list of `"slides"` (2 to 10). Each slide is a page of text
from the book, and the last is the cover. The job draws every slide, then posts them as one carousel.

## Reels

**Reels you post yourself.** Quote, talk and excerpt posts in the queue become silent Reels, made
by `scripts/books_reels.py`: one sentence at a time in large type, each over its own picture with
slow movement and a dissolve between them, then the cover with where to find the book. Every
sentence stays up long enough to read comfortably, and a long one gets a second picture. You post
them by hand so you can choose the music.

- Each book's pictures are its `"reel_images"` in `books/posts.json`, used in order: details of the
  cover (`"cover@x0,y0,x1,y1"`, as fractions of the cover's width and height, kept clear of the
  title) and tall pictures made for the reels, kept in `books/reels` as `img-book-name.jpg`
  (`"books/reels/img-debunked-clyde.jpg"`; add `@0.4` to centre on a point 40% across).
  A book with none uses its cover.
- On the reel's day, at the usual 18:00, the video goes on the site and a GitHub issue opens called
  "Reel to post", with the link, the caption ready to copy, and the steps. GitHub emails it and shows
  it in the GitHub app. That counts as the account's post for the day.
- Close the issue once it's posted. Videos are tidied off the site after 14 days.
- To keep a post as a picture instead, add `"format": "image"` to it.
- `"end"` sets the line above the cover at the end (otherwise "Out now" or "Coming soon").
- A dry run (Actions > Books Instagram > Run workflow > dry-run) attaches the reel to the run as
  "books-instagram-preview", so you can watch it first.
- To have reels posted automatically again, add `"reel_posting": "auto",` near the top of
  `books/posts.json`.
- To preview by hand: `python scripts/books_reels.py <post id>` (writes `books/instagram/preview/`).

**Reels with a trending sound** are not posted automatically, because only the Instagram app can
add one.

- They live in `books/reels/`: a silent video for each book, plus its caption.
- Open **grantanthony.co.uk/books/reels/** on your phone. Each Reel has **Download video** and
  **Copy caption**, and a **Posted** tick that this phone remembers. The page is not linked from the
  site and asks search engines not to list it.
- Every Sunday morning the **Books Reels reminder** workflow opens a GitHub issue with that week's
  two Reels (one per account). GitHub emails it to you. Close the issue once both are up.
- To post: download the video, copy the caption, then in Instagram tap + > Reel, pick the video,
  tap the music note, choose a sound from Trending, paste the caption, and share.
