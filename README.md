# Grant C Anthony Photography

A photography portfolio for GitHub Pages. Photographs are added from your browser through the Studio page; no code editing needed.

## One-time setup (about 10 minutes)

1. **Create the repository.** On GitHub, choose **New repository**. Name it whatever you like (for example `photography`). Set it to **Public**. GitHub Pages is free for public repositories; private ones need a paid plan.
2. **Upload the files.** In the new repository, choose **Add file → Upload files** and drag in everything from this folder, including the `assets` and `images` folders. Commit. Your 27 photographs, their titles and categories, and all 24 lessons are already included, so the site goes live complete.
   - GitHub's web uploader takes up to 100 files at a time. If it complains, upload the `images` folder in a second go.
   - The `.nojekyll` file is hidden on some computers. If it doesn't upload, create it on GitHub with **Add file → Create new file**, name it `.nojekyll`, leave it empty and commit.
3. **Turn on GitHub Pages.** In the repository go to **Settings → Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main** and folder to **/ (root)**. Save.
4. After a minute or two your site is live at `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`.

## Connect the Studio page

The Studio page is how you add and edit photographs. It lives at `/admin.html` on your site, for example `https://YOUR-USERNAME.github.io/photography/admin.html`.

1. On GitHub open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name it (for example "Photography studio") and choose an expiry. A year is sensible.
3. Under **Repository access** choose **Only select repositories** and pick your site's repository.
4. Under **Repository permissions** set **Contents** to **Read and write**. Leave everything else alone.
5. Generate the token and copy it.
6. Open your Studio page, go to the **Connection** tab, check your username and repository name, paste the token and press **Connect**.

The token is saved only in that browser on that device. Do this once on each device you want to upload from (your phone works too). Anyone can open the Studio page address, but without a token it can't change anything.

## Day to day

- **Add photographs:** Studio → Photographs → Choose photographs (or drag them in). They upload straight away.
- **Titles, text, place, year, categories:** fill them in on each photograph, then press **Publish changes**.
- **Opening slideshow:** tick **Feature in opening slideshow** on your strongest landscape-format shots. If none are ticked, the most recent landscape shots are used.
- **Categories:** manage them on the Categories tab. A photograph can be in several. Empty categories are hidden on the public site.
- **Order:** Move up / Move down. The top of the list shows first.
- **About and contact:** Site details tab.
- **Lessons:** Studio → Learn. Each lesson has a topic, cover photo, body text, an optional **Try this** challenge and an optional **Quick check** quiz (the format is shown under the box). Tick Draft to hide a lesson while you work on it. Every lesson also gets a Print cheat sheet button automatically.
- **Glossary:** the terms that readers can tap for a definition are stored under `glossary` in `photos.json`. Each term is linked once per lesson.

The public site updates about a minute after you publish, once GitHub Pages rebuilds.

## Before you publish

- Titles and places on the 27 starter photographs were set as working names. Check them in the Studio and change any that are wrong.
- The starter photographs are the web-sized copies you sent (about 1500 to 2600 px). For the sharpest result, re-upload full-size originals over time and delete the smaller copies.
- 20 of the photographs have no camera settings because their metadata had been removed. Type them in if you want them shown.
- Opening `index.html` directly from this folder now works as a preview. The Studio page only works once the site is on GitHub.

## Instagram posting (@gcanth)

Tick **Share to Instagram** on a photograph in the Studio and publish. Every Tuesday and Friday at 18:00 UTC (19:00 in summer, 18:00 in winter) GitHub posts the next ticked photograph, in the order they appear in your list. One photograph per run. Each photograph is only ever posted once.

- **Caption:** title, place and year, description, camera settings (if shown on the site), then the line from Studio > Site details > Instagram posting, the hashtags set there for every post, and the hashtags for each of the photograph's categories (up to 30 in total).
- **Shape:** Instagram accepts 4:5 portrait to 1.91:1 landscape. Taller or wider photographs get a plain border (white, black or dark grey; your choice in Site details) rather than a crop. Prepared copies are kept in the `ig` folder.
- **Status:** each photograph in the Studio shows "Next to post", its place in the queue, "Posted to Instagram" with a link, or the reason the last attempt failed. A photograph under 1080 px wide is flagged, because it will look soft.
- **Safety:** before every post the job checks the token belongs to the account named in Site details, and stops if it does not.
- **Record:** what has been posted is kept in `instagram-log.json`. Only the posting job writes it. Do not delete it, or photographs will be posted again.

### One-time setup (about 20 minutes)

The menu names below were right at the time of writing. Meta changes its screens often, so if something is labelled differently, look for the nearest match.

1. **Switch @gcanth to a professional account.** In the Instagram app: Settings > Account type and tools > Switch to professional account > Creator. It is free and can be switched back.
2. **Create a Meta app.** Go to developers.facebook.com and log in (Meta asks for a Facebook login here). My Apps > Create app. Choose the use case for managing content on Instagram (the "Instagram API" with Instagram login), and Business as the type if asked.
3. **Get a token.** In the app: Instagram > API setup with Instagram login > Generate access tokens > Add account, and log in as @gcanth. Allow the permissions it asks for (basic profile and content publishing). Copy the token it shows. If it asks you to add the account as a tester first, do that under App roles > Roles.
4. **Store the token in GitHub.** In the repository: Settings > Secrets and variables > Actions > New repository secret. Name: `IG_TOKEN`. Value: the token.
5. **Let it renew itself (recommended).** Tokens last 60 days; the job renews it on every run, but needs permission to save the new one. Create a fine-grained GitHub token (as for the Studio) for this repository only, with **Secrets: Read and write**. Store it as a second repository secret named `GH_PAT`. Without it, you would need to repeat step 3 every 60 days.
6. **Test without posting.** Actions tab > Instagram > Run workflow > mode: dry-run. Open the run to read the caption it would use; the prepared image is under Artifacts as "instagram-preview".
7. **First real post.** Run workflow again with mode: post. After that the schedule takes over.

### Good to know

- To post straight away, use Run workflow with mode: post. To change the days or time, ask for the schedule line in `.github/workflows/instagram.yml` to be changed.
- GitHub can start scheduled runs a few minutes to an hour late when it is busy.
- GitHub pauses scheduled jobs in a repository with no activity for 60 days. Publishing from the Studio, or any post, counts as activity. If it does pause, the Actions tab shows a button to turn it back on.
- Instagram may flag accounts that behave like bots. Two posts a week is ordinary use.

## Good to know

- Photographs are stored at 2560 px on the long edge, plus a 1000 px thumbnail. That's sharp on large screens while keeping pages fast. Keep your full-size originals elsewhere.
- Camera, lens, focal length, aperture, shutter speed and ISO are read from each JPEG when you upload it and shown with the photograph. Photos exported without metadata get empty fields you can fill in by hand. Turn the display off in Site details if you prefer.
- Location data (GPS) embedded in your photos is never read and is stripped on upload.
- The repository is public, so the 2560 px files can be downloaded by anyone who looks for them. That's true of every portfolio site.
- The "On the wall" view uses real proportions: prints are shown at 30, 50, 70 or 100 cm on the long edge, above a 170 cm sideboard or a 214 cm sofa.
- To use your own domain (for example `grantcanthony.com`), add it under **Settings → Pages → Custom domain** and follow GitHub's DNS instructions.
- Your signature logo is `assets/signature.png` (large) and `assets/signature-sm.png` (navigation). To switch to the name in type instead, untick the signature option in Site details.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The public site |
| `admin.html` | The Studio page |
| `scripts/instagram.py` | Prepares and posts the next queued photograph to Instagram |
| `.github/workflows/instagram.yml` | Runs the Instagram posting on a schedule |
| `instagram-log.json` | Created by the posting job: what has been posted. Do not edit |
| `photos.json` | Your titles, text, categories and settings. The Studio page writes this for you |
| `images/` | Your photographs and thumbnails |
| `assets/` | Styles, scripts, signature and site icon |
