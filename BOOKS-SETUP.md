# Books site and book posts on Instagram

The books site lives at grantanthony.co.uk/books, inside the photography repo.
Book posts go out automatically:

- Fiction to @grantcanthony on Mondays and Thursdays at 18:00 UK time
- Nonfiction to @g_c_anthony on Wednesdays and Saturdays at 18:00 UK time

Photography posts to @gcanth on Tuesdays and Fridays, so no two jobs share a day.

## 1. Upload the files

Upload from the zip into the repo, keeping the folders:

- the whole `books` folder
- `scripts/books_cards.py` and `scripts/books_instagram.py` (into the existing `scripts` folder)

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

## 6. Optional: an outside timer

GitHub's own schedule is often late, which is why the photos have a cron-job.org timer.
To do the same here, add a second cron-job.org job that starts the **books-instagram.yml**
workflow at 18:00 UK on Mondays, Wednesdays, Thursdays and Saturdays, with inputs
`{"account": "auto", "mode": "post", "scheduled": "1"}`. It never posts twice in a day.

## How the queue works

- `books/posts.json` holds every post: the book, the card type, the text on the image, and the caption.
- Each account posts its next unposted item, in the order listed. Each is posted once.
- To hold a post back, add `"hold": true` to it. To change the order, move it in the list.
- `books/instagram-log.json` records what has gone out. Only the posting job writes it.
- The image for each post is drawn at posting time from the text, in the book's colours with its cover.
  To preview every card: `python scripts/books_cards.py` (writes `books/instagram/preview/`).

When the queue for an account runs out, it stops posting until more are added.

## Fonts

The site and the post images use Bricolage Grotesque, Source Serif 4 and IBM Plex Mono, all served
from `books/assets/fonts` (no outside font service). Their licences are in the same folder.

## Carousels

Carousels are in the same queue (`books/posts.json`) and post automatically on the usual days.
A carousel has `"type": "carousel"` and a list of `"slides"` (2 to 10). Each slide is a page of text
from the book, and the last is the cover. The job draws every slide, then posts them as one carousel.

## Reels

Reels are not posted automatically, because only the Instagram app can add a trending sound.

- They live in `books/reels/`: a silent video for each book, plus its caption.
- Open **grantanthony.co.uk/books/reels/** on your phone. Each Reel has **Download video** and
  **Copy caption**, and a **Posted** tick that this phone remembers. The page is not linked from the
  site and asks search engines not to list it.
- Every Sunday morning the **Books Reels reminder** workflow opens a GitHub issue with that week's
  two Reels (one per account). GitHub emails it to you. Close the issue once both are up.
- To post: download the video, copy the caption, then in Instagram tap + > Reel, pick the video,
  tap the music note, choose a sound from Trending, paste the caption, and share.
