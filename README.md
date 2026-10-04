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
| `photos.json` | Your titles, text, categories and settings. The Studio page writes this for you |
| `images/` | Your photographs and thumbnails |
| `assets/` | Styles, scripts, signature and site icon |
