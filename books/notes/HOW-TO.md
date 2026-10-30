# Adding a note

Each note is one text file in `books/notes/posts`. The Search pages job turns it into a page at
grantanthony.co.uk/books/notes/, puts the newest three on the books page, links it from its book's page
and adds it to the sitemap.

## From your iPhone

1. In the repo, open `books`, then `notes`, then `posts`.
2. Tap **Add file**, then **Create new file**.
3. Name it with dashes and `.md` on the end, e.g. `three-ways-to-stop-overthinking.md`.
   The name becomes the web address, so keep it short.
4. Paste in the top lines below, fill them in, leave one empty line, then write the note.
5. Tap **Commit changes**. The page is live a couple of minutes later.

## The top lines

```
Title: Three ways to stop overthinking
Date: 2026-11-30
Book: the-noisy-mind
Summary: One or two sentences. Shown under the title and in search results.
```

- **Book** is the book the note is about, by its web address (`debunked`, `the-noisy-mind`,
  `the-calibrated-mind`, `rewiring-pain`, `pentimento`, `underpainting` and so on) or its title.
  Leave it out if the note isn't about one book.
- **Date** in the future: the note waits and goes live on that morning by itself.
- Add `Draft: yes` to keep a note off the site while you work on it. The text file itself can still be
  opened by anyone who guesses its address, so don't keep anything private in it.
- Optional picture at the top: `Image: /images/medium/name-of-photo.jpg` (any photo already on the
  photography site) and `Caption: what it shows`.

## In the text

- Leave an empty line between paragraphs.
- `## ` at the start of a line makes a heading.
- `> ` at the start of a line makes a quote.
- `*Debunked*` makes italics, `**this**` makes bold.
- `[Rewiring Pain](rewiring-pain/)` links to a book page. Full web addresses work too.
- A line on its own like `![What it shows](/images/medium/name-of-photo.jpg)` puts a photo in.
