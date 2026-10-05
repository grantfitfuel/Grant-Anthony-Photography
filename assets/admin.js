(() => {
  "use strict";
  const API = "https://api.github.com";
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const FULL_EDGE = 2560, THUMB_EDGE = 1000;
  const DEFAULT = { site: { name: "Grant C Anthony", tagline: "Photography", aboutTitle: "Behind the lens", useSignature: true, about: "", email: "", instagram: "", categories: [] }, photos: [] };

  let conn = { owner: "", repo: "", branch: "main", token: "" };
  let data = null, savedStr = "", jsonSha = null, busy = false;
  let pendingDeletes = [];               // photos removed locally, files deleted on publish
  const previews = {};                   // id -> object URL for freshly uploaded thumbs
  const confirmFor = new Set();
  let igLog = { posted: [] };            // instagram-log.json, written only by the posting job

  /* ---------- small utils ---------- */
  function toast(msg, err, ms = 3200) {
    const t = $("toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
    clearTimeout(toast._t); if (ms) toast._t = setTimeout(() => t.hidden = true, ms);
  }
  const slug = s => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const uid = base => (slug(base) || "photo") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const b64FromBytes = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const b64Text = txt => b64FromBytes(new TextEncoder().encode(txt));
  const textFromB64 = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, "")), c => c.charCodeAt(0)));
  const blobB64 = blob => blob.arrayBuffer().then(buf => b64FromBytes(new Uint8Array(buf)));
  const clone = o => JSON.parse(JSON.stringify(o));
  const dirty = () => data && (JSON.stringify(data) !== savedStr || pendingDeletes.length > 0);

  /* ---------- GitHub API ---------- */
  async function gh(method, path, body, accept) {
    const res = await fetch(`${API}/repos/${encodeURIComponent(conn.owner)}/${encodeURIComponent(conn.repo)}${path}`, {
      method, cache: "no-store",
      headers: { "Authorization": "Bearer " + conn.token, "Accept": accept || "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      let m = ""; try { m = (await res.json()).message || ""; } catch (e) {}
      const err = new Error(explain(res.status, m)); err.status = res.status; throw err;
    }
    return accept && accept.includes("raw") ? res.text() : (res.status === 204 ? null : res.json());
  }
  function explain(status, m) {
    if (status === 401) return "GitHub rejected the token. Check it was copied in full and has not expired.";
    if (status === 403) return "The token is not allowed to change this repository. Give it Contents: Read and write on this repository.";
    if (status === 404) return "Not found. Check the username, repository name and branch, and that the token can see this repository.";
    if (status === 409 || status === 422) return "GitHub reported a conflict (" + (m || status) + ").";
    return "GitHub error " + status + (m ? ": " + m : "");
  }
  const contentPath = p => "/contents/" + p.split("/").map(encodeURIComponent).join("/");
  async function getJson() {
    try {
      const meta = await gh("GET", contentPath("photos.json") + "?ref=" + encodeURIComponent(conn.branch));
      const txt = meta.content ? textFromB64(meta.content) : await gh("GET", contentPath("photos.json") + "?ref=" + encodeURIComponent(conn.branch), null, "application/vnd.github.raw+json");
      return { json: JSON.parse(txt), sha: meta.sha };
    } catch (e) { if (e.status === 404) return { json: null, sha: null }; throw e; }
  }
  async function putFile(path, b64, message, sha) {
    const body = { message, content: b64, branch: conn.branch }; if (sha) body.sha = sha;
    return gh("PUT", contentPath(path), body);
  }
  async function deleteFile(path, message) {
    try {
      const meta = await gh("GET", contentPath(path) + "?ref=" + encodeURIComponent(conn.branch));
      await gh("DELETE", contentPath(path), { message, sha: meta.sha, branch: conn.branch });
    } catch (e) { if (e.status !== 404) throw e; }
  }
  async function writeJson(message) {
    const out = clone(data);
    const txt = JSON.stringify(out, null, 2) + "\n";
    try {
      const r = await putFile("photos.json", b64Text(txt), message, jsonSha);
      jsonSha = r.content.sha;
    } catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e;
      const cur = await getJson(); jsonSha = cur.sha;           // file moved on since we loaded it: retry against latest
      const r = await putFile("photos.json", b64Text(txt), message, jsonSha);
      jsonSha = r.content.sha;
    }
    savedStr = JSON.stringify(data);
  }

  /* ---------- connection ---------- */
  function loadConn() {
    try { Object.assign(conn, JSON.parse(localStorage.getItem("ghConn") || "{}")); } catch (e) {}
    if (!conn.owner && /\.github\.io$/i.test(location.hostname)) {
      conn.owner = location.hostname.split(".")[0];
      const seg = location.pathname.split("/").filter(Boolean)[0];
      conn.repo = seg && !/\.html$/.test(seg) ? seg : location.hostname;
    }
    $("cOwner").value = conn.owner || ""; $("cRepo").value = conn.repo || ""; $("cBranch").value = conn.branch || "main"; $("cToken").value = conn.token || "";
  }
  function setStatus(state, text) { $("dot").className = "dot" + (state ? " " + state : ""); $("statusText").textContent = text; }
  async function connect(silent) {
    conn.owner = $("cOwner").value.trim(); conn.repo = $("cRepo").value.trim(); conn.branch = $("cBranch").value.trim() || "main"; conn.token = $("cToken").value.trim();
    if (!conn.owner || !conn.repo || !conn.token) { if (!silent) toast("Fill in your username, repository and token.", true); lock(true); showTab("conn"); return; }
    try { localStorage.setItem("ghConn", JSON.stringify(conn)); } catch (e) {}
    setStatus("", "Connecting…");
    try {
      await gh("GET", "");
      const { json, sha } = await getJson();
      data = normalise(json || clone(DEFAULT)); jsonSha = sha;
      savedStr = json ? JSON.stringify(data) : "";
      pendingDeletes = [];
      await loadIgLog();
      setStatus("ok", conn.owner + "/" + conn.repo);
      lock(false); renderAll(); if (!silent) { toast("Connected"); showTab("photos"); }
    } catch (e) {
      setStatus("err", "Connection failed"); lock(true); showTab("conn"); toast(e.message, true, 7000);
    }
  }
  async function loadIgLog() {
    try {
      const meta = await gh("GET", contentPath("instagram-log.json") + "?ref=" + encodeURIComponent(conn.branch));
      igLog = JSON.parse(textFromB64(meta.content)); igLog.posted = igLog.posted || [];
    } catch (e) { igLog = { posted: [] }; }
  }
  const lastPost = id => igLog.posted.filter(x => x.id === id).sort((a, b) => a.date < b.date ? 1 : -1)[0];
  const igDue = p => { if (!p.instagram) return false; const l = lastPost(p.id); return !l || (!!p.igRepostAfter && new Date(p.igRepostAfter) > new Date(l.date)); };
  function igStatus(p) {
    const done = lastPost(p.id);
    if (done && !igDue(p)) return { posted: true, text: "Posted to Instagram " + new Date(done.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), link: done.link };
    if (igLog.lastError && igLog.lastError.id === p.id && p.instagram) return { text: "Last attempt failed: " + igLog.lastError.message, err: true };
    if (!p.instagram) return null;
    const q = data.photos.filter(igDue);
    const n = q.indexOf(p) + 1;
    return { text: n === 1 ? "Next to post" : "Queued: " + n + (n === 2 ? "nd" : n === 3 ? "rd" : "th") + " in line" };
  }
  function normalise(j) {
    j.site = Object.assign(clone(DEFAULT.site), j.site || {});
    j.site.categories = (j.site.categories || []).filter(c => c && c.id);
    j.photos = (j.photos || []).filter(p => p && p.id);
    j.photos.forEach(p => { p.categories = p.categories || []; });
    j.lessons = (j.lessons || []).filter(l => l && l.id);
    return j;
  }
  function lock(on) { document.querySelectorAll('[data-panel]:not([data-panel="conn"])').forEach(p => p.classList.toggle("locked", on)); }
  $("connect").onclick = () => connect(false);
  $("forget").onclick = () => { conn.token = ""; $("cToken").value = ""; try { localStorage.setItem("ghConn", JSON.stringify(conn)); } catch (e) {} setStatus("", "Not connected"); lock(true); toast("Token removed from this browser"); };

  /* ---------- tabs ---------- */
  function showTab(name) {
    document.querySelectorAll("[role=tab]").forEach(t => t.setAttribute("aria-selected", t.dataset.tab === name));
    document.querySelectorAll("[data-panel]").forEach(p => p.hidden = p.dataset.panel !== name);
  }
  document.querySelectorAll("[role=tab]").forEach(t => t.onclick = () => showTab(t.dataset.tab));

  /* ---------- rendering ---------- */
  function renderAll() { renderPhotos(); renderCats(); renderLessons(); renderSite(); updateBar(); }
  function updateBar() {
    const d = dirty(); $("savebar").classList.toggle("show", d || busy);
    $("save").disabled = busy || !d; $("discard").disabled = busy || !d;
    if (!busy) $("saveMsg").innerHTML = d ? "<b>Unsaved changes.</b> Publish to put them on your site." : "All changes published.";
  }
  const touch = () => updateBar();

  function field(label, input) { const f = el("div", "field"); const l = el("label", null, label); l.htmlFor = input.id; f.append(l, input); return f; }
  function input(id, value, oninput, opts = {}) {
    const i = el(opts.area ? "textarea" : "input"); if (!opts.area) i.type = "text"; i.id = id; i.value = value || "";
    if (opts.ph) i.placeholder = opts.ph; if (opts.max) i.maxLength = opts.max; if (opts.style) i.style.cssText = opts.style;
    i.addEventListener("input", () => { oninput(i.value); touch(); }); return i;
  }

  function renderPhotos() {
    const L = $("plist"); L.textContent = "";
    if (!data.photos.length) { const e = el("div", "empty"); e.append(el("h3", null, "No photographs yet"), el("p", null, "Add your first photographs above. They will appear on your site once published.")); L.append(e); return; }
    data.photos.forEach((p, i) => {
      const it = el("article", "pitem"); it.dataset.id = p.id;
      const left = el("div");
      const th = el("div", "thumb"); const im = el("img"); im.alt = ""; im.loading = "lazy"; im.src = previews[p.id] || p.thumb || p.file;
      im.onerror = () => { im.onerror = null; im.src = `https://raw.githubusercontent.com/${encodeURIComponent(conn.owner)}/${encodeURIComponent(conn.repo)}/${encodeURIComponent(conn.branch)}/${p.thumb || p.file}`; };
      th.append(im); if (p.featured) th.append(el("span", "badge", "Featured"));
      left.append(th, el("div", "info", `${p.w} × ${p.h} px`));

      const f = el("div", "fields");
      f.append(field("Title", input("t-" + p.id, p.title, v => p.title = v, { max: 120 })));
      const g = el("div", "grid2");
      g.append(field("Place", input("l-" + p.id, p.location, v => p.location = v, { ph: "e.g. Isle of Skye", max: 80 })));
      g.append(field("Year", input("y-" + p.id, p.year, v => p.year = v.replace(/[^0-9]/g, "").slice(0, 4), { ph: "e.g. 2025", max: 4 })));
      g.append(field("Camera", input("c-" + p.id, p.camera, v => p.camera = v, { ph: "e.g. Canon EOS R5", max: 60 })));
      g.append(field("Lens", input("ln-" + p.id, p.lens, v => p.lens = v, { ph: "e.g. RF24-70mm F2.8", max: 80 })));
      f.append(g);
      const g2 = el("div", "grid4");
      g2.append(field("Focal length", input("fl-" + p.id, p.focal, v => p.focal = v, { ph: "35 mm", max: 16 })));
      g2.append(field("Aperture", input("ap-" + p.id, p.aperture, v => p.aperture = v, { ph: "f/8", max: 10 })));
      g2.append(field("Shutter", input("sh-" + p.id, p.shutter, v => p.shutter = v, { ph: "1/125 s", max: 12 })));
      g2.append(field("ISO", input("is-" + p.id, p.iso, v => p.iso = v, { ph: "ISO 100", max: 12 })));
      f.append(g2);
      f.append(field("About this photograph", input("d-" + p.id, p.description, v => p.description = v, { area: true, ph: "The story behind it. Leave a blank line between paragraphs." })));
      const cf = el("div", "field"); cf.append(el("span", "lab", "Categories"));
      const cp = el("div", "catpick");
      if (!data.site.categories.length) cp.append(el("span", "none", "No categories yet. Add them in the Categories tab."));
      data.site.categories.forEach(c => {
        const lab = el("label"); const cb = el("input"); cb.type = "checkbox"; cb.checked = p.categories.includes(c.id);
        cb.onchange = () => { p.categories = cb.checked ? [...new Set([...p.categories, c.id])] : p.categories.filter(x => x !== c.id); touch(); };
        lab.append(cb, c.name); cp.append(lab);
      });
      cf.append(cp); f.append(cf);

      const tools = el("div", "tools");
      const tg = el("label", "tog"); const fcb = el("input"); fcb.type = "checkbox"; fcb.checked = !!p.featured;
      fcb.onchange = () => { p.featured = fcb.checked; renderPhotos(); touch(); };
      tg.append(fcb, "Feature in opening slideshow"); tools.append(tg);
      const st = igStatus(p);
      if (st && st.posted) {
        const ps = el("span", "igstat ok"); ps.append(st.text + " ");
        if (st.link) { const a = el("a", null, "View"); a.href = st.link; a.target = "_blank"; a.rel = "noopener"; ps.append(a); }
        const again = el("button", "b sm", "Post again"); again.type = "button";
        again.onclick = () => { p.instagram = true; p.igRepostAfter = new Date().toISOString(); renderPhotos(); touch(); };
        tools.append(ps, again);
      } else {
        const ig = el("label", "tog"); const icb = el("input"); icb.type = "checkbox"; icb.checked = !!p.instagram;
        icb.onchange = () => { if (icb.checked) p.instagram = true; else { delete p.instagram; delete p.igRepostAfter; } renderPhotos(); touch(); };
        ig.append(icb, "Share to Instagram"); tools.append(ig);
        if (st) tools.append(el("span", "igstat" + (st.err ? " err" : ""), st.text));
        if (p.instagram && Math.max(p.w || 0, Math.round((p.h || 0) * 0.8)) < 1080) tools.append(el("span", "igstat err", "Small file: will look soft on Instagram. Replace it with a larger export first."));
      }
      tools.append(el("span", "sp"));
      const mv = (label, d, dis) => { const b = el("button", "b sm", label); b.type = "button"; b.disabled = dis; b.onclick = () => { const a = data.photos; [a[i], a[i + d]] = [a[i + d], a[i]]; renderPhotos(); touch(); }; return b; };
      tools.append(mv("Move up", -1, i === 0), mv("Move down", 1, i === data.photos.length - 1));
      if (confirmFor.has(p.id)) {
        const c = el("div", "confirm"); c.append("Remove from the site?");
        const y = el("button", "b sm danger", "Remove"); y.type = "button"; y.onclick = () => { confirmFor.delete(p.id); pendingDeletes.push(p); data.photos.splice(i, 1); renderPhotos(); touch(); };
        const n = el("button", "b sm", "Keep"); n.type = "button"; n.onclick = () => { confirmFor.delete(p.id); renderPhotos(); };
        c.append(y, n); tools.append(c);
      } else {
        const del = el("button", "b sm danger", "Delete"); del.type = "button"; del.onclick = () => { confirmFor.add(p.id); renderPhotos(); };
        tools.append(del);
      }
      f.append(tools);
      it.append(left, f); L.append(it);
    });
  }

  function renderCats() {
    const L = $("catList"); L.textContent = "";
    const cats = data.site.categories;
    if (!cats.length) { L.append(el("p", "help", "No categories yet.")); return; }
    cats.forEach((c, i) => {
      const r = el("div", "catrow");
      const left = el("div", "row"); left.style.minWidth = "0";
      const inp = input("cat-" + c.id, c.name, v => { c.name = v; }, { max: 40, style: "flex:1 1 200px;min-width:0" });
      inp.addEventListener("change", () => renderPhotos());
      left.append(inp, el("span", "n", data.photos.filter(p => p.categories.includes(c.id)).length + " photos"));
      const right = el("div", "row");
      const mv = (label, d, dis) => { const b = el("button", "b sm", label); b.type = "button"; b.disabled = dis; b.onclick = () => { [cats[i], cats[i + d]] = [cats[i + d], cats[i]]; renderCats(); renderPhotos(); touch(); }; return b; };
      right.append(mv("Up", -1, i === 0), mv("Down", 1, i === cats.length - 1));
      const key = "cat:" + c.id;
      if (confirmFor.has(key)) {
        const y = el("button", "b sm danger", "Confirm delete"); y.type = "button";
        y.onclick = () => { confirmFor.delete(key); cats.splice(i, 1); data.photos.forEach(p => p.categories = p.categories.filter(x => x !== c.id)); renderCats(); renderPhotos(); touch(); };
        const n = el("button", "b sm", "Keep"); n.type = "button"; n.onclick = () => { confirmFor.delete(key); renderCats(); };
        right.append(y, n);
      } else { const d = el("button", "b sm danger", "Delete"); d.type = "button"; d.onclick = () => { confirmFor.add(key); renderCats(); }; right.append(d); }
      r.append(left, right); L.append(r);
    });
  }
  $("addCat").onclick = () => {
    const name = $("newCat").value.trim(); if (!name) { $("newCat").focus(); return; }
    const cats = data.site.categories;
    if (cats.some(c => c.name.toLowerCase() === name.toLowerCase())) { toast("That category already exists.", true); return; }
    let id = slug(name) || "category"; while (cats.some(c => c.id === id)) id += "-2";
    cats.push({ id, name }); $("newCat").value = ""; renderCats(); renderPhotos(); touch();
  };
  $("newCat").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("addCat").click(); } });

  const LEVELS = ["", "Behind the shot"];
  function renderLessons() {
    const s = data.site;
    $("lTitle").value = s.learnTitle || ""; $("lTitle").oninput = () => { s.learnTitle = $("lTitle").value; touch(); };
    $("lIntro").value = s.learnIntro || ""; $("lIntro").oninput = () => { s.learnIntro = $("lIntro").value; touch(); };
    const L = $("llist"); L.textContent = "";
    const ls = data.lessons;
    if (!ls.length) { const e = el("div", "empty"); e.append(el("h3", null, "No lessons yet"), el("p", null, "Press New lesson to write your first one.")); L.append(e); return; }
    ls.forEach((l, i) => {
      const it = el("article", "pitem litem"); it.dataset.id = l.id;
      it.append(el("p", "eyebrow", "Lesson " + String(i + 1).padStart(2, "0") + (l.draft ? "  \u00b7  Draft, hidden from the site" : "")));
      it.append(field("Title", input("lt-" + l.id, l.title, v => l.title = v, { max: 120 })));
      const g = el("div", "grid2");
      const lv = el("select"); lv.id = "lv-" + l.id;
      const noTopic = el("option", null, "No topic"); noTopic.value = ""; lv.append(noTopic);
      (data.site.lessonTopics || []).forEach(t => { const o = el("option", null, t.name); o.value = t.id; lv.append(o); });
      lv.value = l.topic || "";
      lv.onchange = () => { l.topic = lv.value; l.level = lv.value === "behind" ? "Behind the shot" : ""; touch(); };
      g.append(field("Topic", lv));
      const cv = el("select"); cv.id = "lc-" + l.id; const none = el("option", null, "No cover photo"); none.value = ""; cv.append(none);
      data.photos.forEach(p => { const o = el("option", null, p.title || p.id); o.value = p.id; cv.append(o); });
      cv.value = data.photos.some(p => p.id === l.cover) ? l.cover : "";
      cv.onchange = () => { l.cover = cv.value; touch(); };
      g.append(field("Cover photograph", cv));
      it.append(g);
      it.append(field("Summary", input("ls-" + l.id, l.summary, v => l.summary = v, { area: true, max: 300, style: "min-height:70px", ph: "One or two sentences shown on the home page" })));
      const body = input("lb-" + l.id, l.body, v => l.body = v, { area: true, ph: "Write the lesson. See Formatting lesson text above." }); body.classList.add("body");
      it.append(field("Lesson", body));
      it.append(field("Cheat sheet (optional; leave empty to build it from the lesson)", input("lcs-" + l.id, l.cheat, v => l.cheat = v, { area: true, style: "min-height:90px", ph: "## Heading\n- Short point\n- Short point" })));
      it.append(field("Try this (a challenge shown at the end)", input("lch-" + l.id, l.challenge, v => l.challenge = v, { area: true, style: "min-height:70px", ph: "One exercise for readers to go and shoot" })));
      const qz = input("lqz-" + l.id, l.quiz, v => l.quiz = v, { area: true, style: "min-height:150px;font-family:var(--mono);font-size:13px", ph: "Q: Your question\n* The right answer\n- A wrong answer\n- Another wrong answer" });
      it.append(field("Quick check (questions at the end)", qz));
      const tools = el("div", "tools");
      const dt = el("label", "tog"); const dcb = el("input"); dcb.type = "checkbox"; dcb.checked = !!l.draft; dcb.onchange = () => { l.draft = dcb.checked; renderLessons(); touch(); };
      dt.append(dcb, "Draft (hidden from the site)"); tools.append(dt, el("span", "sp"));
      const mv = (label, d, dis) => { const b = el("button", "b sm", label); b.type = "button"; b.disabled = dis; b.onclick = () => { [ls[i], ls[i + d]] = [ls[i + d], ls[i]]; renderLessons(); touch(); }; return b; };
      tools.append(mv("Move up", -1, i === 0), mv("Move down", 1, i === ls.length - 1));
      const key = "les:" + l.id;
      if (confirmFor.has(key)) {
        const c = el("div", "confirm"); c.append("Delete this lesson?");
        const y = el("button", "b sm danger", "Delete"); y.type = "button"; y.onclick = () => { confirmFor.delete(key); ls.splice(i, 1); renderLessons(); touch(); };
        const n = el("button", "b sm", "Keep"); n.type = "button"; n.onclick = () => { confirmFor.delete(key); renderLessons(); };
        c.append(y, n); tools.append(c);
      } else { const d = el("button", "b sm danger", "Delete"); d.type = "button"; d.onclick = () => { confirmFor.add(key); renderLessons(); }; tools.append(d); }
      it.append(tools); L.append(it);
    });
  }
  $("addLesson").onclick = () => {
    const id = uid("lesson");
    data.lessons.push({ id, title: "Untitled lesson", level: "Beginner", summary: "", body: "", cover: "" });
    renderLessons(); touch();
    const t = $("lt-" + id); if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); t.select(); }
  };

  function renderSite() {
    const s = data.site;
    [["sName", "name"], ["sTag", "tagline"], ["sYears", "yearsShooting"], ["sAboutTitle", "aboutTitle"], ["sAbout", "about"], ["sEmail", "email"], ["sInsta", "instagram"]].forEach(([id, k]) => {
      const i = $(id); i.value = s[k] || ""; i.oninput = () => { s[k] = i.value; touch(); };
    });
    $("sSig").checked = s.useSignature !== false;
    $("sSig").onchange = () => { s.useSignature = $("sSig").checked; touch(); };
    $("sSet").checked = s.showSettings !== false;
    $("sSet").onchange = () => { s.showSettings = $("sSet").checked; touch(); };
    [["sIgAcc", "igAccount"], ["sIgLink", "igLink"], ["sIgTags", "igHashtags"], ["sIgCams", "igCameraTags"]].forEach(([id, k]) => {
      const i = $(id); i.value = s[k] || ""; i.oninput = () => { s[k] = i.value.trim() ? i.value : ""; touch(); };
    });
    const ic = $("sIgCats"); ic.textContent = "";
    s.categories.forEach(c => {
      ic.append(field(c.name, input("sIgCat-" + c.id, (s.igCategoryTags || {})[c.id], v => { s.igCategoryTags = s.igCategoryTags || {}; if (v.trim()) s.igCategoryTags[c.id] = v; else delete s.igCategoryTags[c.id]; }, { ph: "#" + c.name.toLowerCase().replace(/[^a-z0-9]/g, "") + "photography" })));
    });
    $("sIgBorder").value = s.igBorder || "#ffffff";
    $("sIgBorder").onchange = () => { s.igBorder = $("sIgBorder").value; touch(); };
  }

  /* ---------- image processing ---------- */
  function loadImage(file) {
    return new Promise((res, rej) => { const url = URL.createObjectURL(file); const i = new Image(); i.onload = () => res({ img: i, url }); i.onerror = () => { URL.revokeObjectURL(url); rej(new Error(file.name + " could not be read as an image.")); }; i.src = url; });
  }
  function render(img, edge, q) {
    const w0 = img.naturalWidth, h0 = img.naturalHeight, s = Math.min(1, edge / Math.max(w0, h0));
    const w = Math.round(w0 * s), h = Math.round(h0 * s);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"); x.fillStyle = "#0d0d0e"; x.fillRect(0, 0, w, h); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, w, h);
    return new Promise(r => c.toBlob(b => r({ blob: b, w, h }), "image/jpeg", q));
  }
  function toneOf(img) {
    const c = document.createElement("canvas"); c.width = c.height = 24; const x = c.getContext("2d"); x.drawImage(img, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data; let r = 0, g = 0, b = 0, n = 0, best = null, bestS = -1;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), s = mx ? (mx - mn) / mx : 0;
      if (s * mx > bestS) { bestS = s * mx; best = [d[i], d[i + 1], d[i + 2]]; }
    }
    // blend the average with the most vivid sample, then settle it into a deep tone for the lightbox glow
    let [R, G, B] = [r / n * .55 + best[0] * .45, g / n * .55 + best[1] * .45, b / n * .55 + best[2] * .45].map(v => v / 255);
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const dd = mx - mn; s = l > .5 ? dd / (2 - mx - mn) : dd / (mx + mn); h = mx === R ? (G - B) / dd + (G < B ? 6 : 0) : mx === G ? (B - R) / dd + 2 : (R - G) / dd + 4; h /= 6; }
    s = Math.min(.6, s * 1.25); const L2 = .3;
    const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1/6 ? p + (q - p) * 6 * t : t < 1/2 ? q : t < 2/3 ? p + (q - p) * (2/3 - t) * 6 : p; };
    const q2 = L2 < .5 ? L2 * (1 + s) : L2 + s - L2 * s, p2 = 2 * L2 - q2;
    const hex = v => Math.round(v * 255).toString(16).padStart(2, "0");
    return "#" + hex(f(p2, q2, h + 1/3)) + hex(f(p2, q2, h)) + hex(f(p2, q2, h - 1/3));
  }

  /* ---------- upload ---------- */
  async function upload(files) {
    files = [...files].filter(f => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!files.length) { toast("Choose JPEG, PNG or WebP files.", true); return; }
    if (!data || !conn.token) { toast("Connect to GitHub first.", true); showTab("conn"); return; }
    busy = true; updateBar(); $("prog").hidden = false;
    let done = 0, failed = [];
    const total = files.length * 2;
    for (const file of files) {
      $("saveMsg").innerHTML = `<b>Uploading ${done + failed.length + 1} of ${files.length}</b> · ${file.name.replace(/</g, "&lt;")}`;
      let url;
      try {
        let ex = {};
        if (file.type === "image/jpeg" && window.readExif) { try { ex = window.readExif(await file.slice(0, 262144).arrayBuffer()); } catch (e) { ex = {}; } }
        const loaded = await loadImage(file); url = loaded.url;
        const full = await render(loaded.img, FULL_EDGE, 0.88);
        const thumb = await render(loaded.img, THUMB_EDGE, 0.82);
        const tone = toneOf(loaded.img);
        const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
        const id = uid(title);
        await putFile(`images/${id}.jpg`, await blobB64(full.blob), `Add photograph ${id}`);
        $("progBar").style.width = ((done * 2 + 1) / total * 100) + "%";
        await putFile(`images/thumbs/${id}.jpg`, await blobB64(thumb.blob), `Add thumbnail ${id}`);
        previews[id] = URL.createObjectURL(thumb.blob);
        data.photos.unshift({ id, title, description: "", location: "", year: ex.year || "", camera: ex.camera || "", lens: ex.lens || "", focal: ex.focal || "", aperture: ex.aperture || "", shutter: ex.shutter || "", iso: ex.iso || "", categories: [], featured: false,
          file: `images/${id}.jpg`, thumb: `images/thumbs/${id}.jpg`, w: full.w, h: full.h, tw: thumb.w, th: thumb.h, tone, added: new Date().toISOString().slice(0, 10) });
        done++;
      } catch (e) { failed.push(file.name + ": " + e.message); console.warn(e); }
      finally { if (url) URL.revokeObjectURL(url); }
      $("progBar").style.width = ((done + failed.length) * 2 / total * 100) + "%";
      renderPhotos();
    }
    renderLessons();
    try {
      if (done) { $("saveMsg").innerHTML = "<b>Publishing…</b>"; await writeJson(`Add ${done} photograph${done === 1 ? "" : "s"}`); }
      busy = false; $("prog").hidden = true; $("progBar").style.width = "0";
      if (failed.length) toast(`Added ${done}. ${failed.length} failed. ${failed[0]}`, true, 9000);
      else toast(`Added ${done} photograph${done === 1 ? "" : "s"}. Give them titles and categories below, then publish.`, false, 5000);
    } catch (e) { busy = false; toast("Photos uploaded but the list could not be saved: " + e.message + " Press Publish changes to try again.", true, 9000); }
    updateBar();
  }
  $("pick").onclick = () => $("fileIn").click();
  $("fileIn").onchange = e => { upload(e.target.files); e.target.value = ""; };
  const drop = $("drop");
  ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => drop.addEventListener(t, () => drop.classList.remove("over")));
  drop.addEventListener("drop", e => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); });
  document.addEventListener("dragover", e => e.preventDefault());
  document.addEventListener("drop", e => e.preventDefault());

  /* ---------- publish / discard ---------- */
  $("save").onclick = async () => {
    if (busy || !dirty()) return;
    busy = true; updateBar(); $("saveMsg").innerHTML = "<b>Publishing…</b>";
    try {
      await writeJson("Update gallery");
      const dels = pendingDeletes.slice();
      for (const p of dels) {
        $("saveMsg").innerHTML = "<b>Removing files…</b>";
        await deleteFile(p.file, `Remove photograph ${p.id}`);
        if (p.thumb) await deleteFile(p.thumb, `Remove thumbnail ${p.id}`);
        pendingDeletes = pendingDeletes.filter(x => x !== p);
      }
      busy = false; toast("Published. Your site updates in about a minute.", false, 5000);
    } catch (e) { busy = false; toast(e.message, true, 8000); }
    updateBar();
  };
  $("discard").onclick = () => {
    if (busy) return;
    data = normalise(savedStr ? JSON.parse(savedStr) : clone(DEFAULT)); pendingDeletes = []; confirmFor.clear();
    renderAll(); toast("Changes discarded");
  };
  addEventListener("beforeunload", e => { if (busy || dirty()) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- boot ---------- */
  loadConn(); lock(true);
  data = normalise(clone(DEFAULT)); renderAll();
  if (conn.owner && conn.repo && conn.token) connect(true); else showTab("conn");
})();
