(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  let site = {}, photos = [], cats = [];
  let filter = "all", list = [], current = -1, view = "print";
  const wall = { wall: "chalk", frame: "black", mount: "standard", size: 50, furniture: "sideboard", finish: "paint", light: "day", person: false, sofa: "gray" };
  try { Object.assign(wall, JSON.parse(localStorage.getItem("wallPrefs") || "{}")); } catch (e) {}

  const WALLS = { chalk:["Chalk","#ECEAE4"], stone:["Stone","#CFC9BE"], sage:["Sage","#B9C2AF"], clay:["Clay","#C9A08A"], slate:["Slate","#58616B"], navy:["Navy","#2E3B55"], forest:["Forest","#2C3A32"], ink:["Ink","#22252B"] };
  const FRAMES = { black:["Black","#1A1A1A","#2A2A2A"], oak:["Oak","#C79D66","#A47A47"], ash:["Ash","#E2D3B6","#C7B591"], walnut:["Walnut","#5C3F2B","#3F2A1C"], white:["White","#F5F4F0","#DCDAD3"], brass:["Brass","#C9A75E","#8E7134"], silver:["Silver","#D9DBDD","#9DA1A6"] };

  const setUrl = u => { try { history.replaceState(null, "", u); } catch (e) {} };
  /* ---------- helpers ---------- */
  function ratioLabel(w, h) {
    const known = [[3,2],[2,3],[4,3],[3,4],[1,1],[16,9],[9,16],[5,4],[4,5],[7,5],[5,7],[3,1],[2,1],[1,2],[65,24]];
    const r = w / h;
    for (const [a,b] of known) if (Math.abs(r - a/b) < 0.012) return a + ":" + b;
    return r >= 1 ? r.toFixed(2) + ":1" : "1:" + (1/r).toFixed(2);
  }
  const orient = (w,h) => w === h ? "Square" : (w > h ? "Landscape" : "Portrait");
  const pad = n => String(n).padStart(2, "0");
  const catName = id => (cats.find(c => c.id === id) || {}).name;
  function nameMarkup(target, name) {
    target.textContent = "";
    const words = (name || "Photographs").trim().split(/\s+/);
    if (words.length < 2) { target.textContent = words[0]; return; }
    target.append(words.slice(0, -1).join(" ") + " ");
    target.append(el("i", null, words[words.length - 1]));
  }
  function paragraphs(target, text) {
    target.textContent = "";
    (text || "").split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).forEach(s => target.append(el("p", null, s)));
  }

  /* ---------- load ---------- */
  // Opened straight from a folder on your computer, browsers block reading photos.json,
  // so fall back to a snapshot script. On the live site photos.json is always used.
  const offline = () => new Promise(res => {
    if (location.protocol !== "file:") return res({ site: {}, photos: [] });
    const sc = document.createElement("script"); sc.src = "assets/offline-preview.js";
    sc.onload = () => res(window.__PHOTOS__ || { site: {}, photos: [] });
    sc.onerror = () => res({ site: {}, photos: [] });
    document.head.append(sc);
  });
  fetch("photos.json?v=" + Date.now(), { cache: "no-store" })
    .then(r => r.ok ? r.json() : offline())
    .catch(offline)
    .then(data => {
      site = data.site || {};
      cats = (site.categories || []).filter(c => c && c.id && c.name);
      photos = (data.photos || []).filter(p => p && p.file && p.w && p.h);
      if (window.Learn) window.Learn.init(data);
      renderSite(); renderHero(); renderIndex(); applyHash(true);
    });

  /* ---------- recently on Instagram (from the posting job's own log; nothing is loaded from Instagram) ---------- */
  fetch("instagram-log.json?v=" + Date.now(), { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null).then(log => {
    const sec = $("insta"); if (!sec || !log || !Array.isArray(log.posted)) return;
    let tries = 0;
    const wait = () => { if (photos.length) draw(); else if (++tries < 50) setTimeout(wait, 200); };
    const draw = () => {
      const seen = new Set();
      const items = log.posted.slice().sort((a, b) => a.date < b.date ? 1 : -1)
        .filter(x => x.link && !seen.has(x.id) && seen.add(x.id))
        .map(x => [x, photos.find(p => p.id === x.id)]).filter(([, p]) => p).slice(0, 6);
      if (!items.length) return;
      const strip = $("igStrip"); strip.textContent = "";
      items.forEach(([x, p]) => {
        const a = el("a", "ig-tile"); a.href = x.link; a.target = "_blank"; a.rel = "noopener";
        a.setAttribute("aria-label", (p.title || "Photograph") + ", view on Instagram");
        const im = el("img"); im.src = p.thumb || p.file; im.alt = ""; im.loading = "lazy"; im.decoding = "async";
        const d = new Date(x.date);
        const cap = el("span", "ig-cap"); cap.append(el("b", null, p.title || "Untitled"), el("small", null, isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })));
        a.append(im, cap); strip.append(a);
      });
      const acc = (site.igAccount || "").replace(/^@/, "");
      const f = $("igFollow"); f.hidden = !acc;
      if (acc) { f.href = "https://instagram.com/" + encodeURIComponent(acc); f.textContent = "Follow @" + acc + " on Instagram"; }
      sec.hidden = false;
    };
    wait();
  });

  function renderSite() {
    const name = site.name || "Grant C Anthony";
    document.title = name + (site.tagline ? " | " + site.tagline : "");
    const md = document.querySelector('meta[name="description"]'); if (md) md.content = site.tagline || (name + " photography portfolio");
    if (site.useSignature === false) { nameMarkup($("brand"), name); nameMarkup($("heroTitle"), name); }
    else document.querySelectorAll(".sig-nav,.sig-hero").forEach(i => i.alt = name);
    $("heroTag").textContent = site.tagline || ""; $("heroTag").hidden = !site.tagline;
    $("footName").textContent = "\u00a9 " + new Date().getFullYear() + " " + name;
    $("footYear").textContent = photos.length + " photograph" + (photos.length === 1 ? "" : "s");

    const hasAbout = site.about || site.email || site.instagram;
    $("about").hidden = !hasAbout; $("aboutLink").hidden = !hasAbout;
    if (hasAbout) {
      nameMarkup($("aboutTitle"), site.aboutTitle || "Behind the lens");
      paragraphs($("aboutBody"), site.about);
      const c = $("contact"); c.textContent = "";
      if (site.email) { const a = el("a", null, site.email); a.href = "mailto:" + site.email; c.append(a); }
      (site.instagram || "").split(/[\s,]+/).map(h => h.replace(/^@/, "")).filter(Boolean).forEach(h => { const a = el("a", null, "Instagram @" + h); a.href = "https://instagram.com/" + encodeURIComponent(h); a.target = "_blank"; a.rel = "noopener"; c.append(a); });
      const s = $("stats"); s.textContent = "";
      const years = photos.map(p => parseInt(p.year, 10)).filter(Boolean);
      const statsData = [[photos.length, "Photographs"], [cats.filter(c => photos.some(p => (p.categories || []).includes(c.id))).length, "Series"]];
      if (site.yearsShooting) statsData.push([site.yearsShooting, "Years"]);
      statsData.forEach(([n, l]) => { const d = el("div", "stat"); d.append(el("b", null, String(n)), el("span", null, l)); s.append(d); });
    }
  }

  /* Let the browser pick the smallest file that is sharp enough: thumbnail, medium or full size */
  const srcsetOf = p => [p.thumb && p.tw ? `${p.thumb} ${p.tw}w` : "", p.medium && p.mw ? `${p.medium} ${p.mw}w` : "", `${p.file} ${p.w}w`].filter(Boolean).join(", ");
  // In the lightbox a tall photograph is limited by the screen height, so it needs a narrower file than a wide one
  const lbSizes = p => `(max-width: 900px) 100vw, min(70vw, ${(p.w / p.h * 90).toFixed(1)}vh)`;
  const setSrc = (img, p, sizes) => {
    if (p.w) { img.srcset = srcsetOf(p); img.sizes = sizes; }
    img.src = p.file;
    img.addEventListener("error", () => { if (img.srcset) { img.removeAttribute("srcset"); img.src = p.file; } }, { once: true });   // fall back to the full file if a smaller copy is missing
  };
  /* ---------- hero ---------- */
  let heroIdx = 0, heroTimer = null, heroSet = [];
  const HERO_MS = 6500;
  function renderHero() {
    const featured = photos.filter(p => p.featured);
    heroSet = (featured.length ? featured : photos.filter(p => p.w >= p.h)).slice(0, 8);
    if (!heroSet.length) heroSet = photos.slice(0, 5);
    const box = $("slides"); box.textContent = "";
    if (!heroSet.length) { $("top").classList.add("no-photos"); return; }
    heroSet.forEach((p, i) => {
      const s = el("div", "slide"); const img = el("img");
      setSrc(img, p, "100vw"); img.alt = ""; img.decoding = "async"; if (i > 0) img.loading = "lazy";
      img.style.objectPosition = (p.focus || "50% 50%");
      s.append(img); box.append(s);
    });
    const bars = $("bars"); bars.textContent = "";
    heroSet.forEach(() => { const b = el("span"); b.append(el("i")); bars.append(b); });
    $("heroMeta").hidden = false;
    showSlide(0);
  }
  function showSlide(i) {
    heroIdx = (i + heroSet.length) % heroSet.length;
    [...$("slides").children].forEach((s, k) => s.classList.toggle("on", k === heroIdx));
    [...$("bars").children].forEach((b, k) => { b.className = k < heroIdx ? "done" : ""; });
    const bar = $("bars").children[heroIdx]; void bar.offsetWidth; bar.style.setProperty("--dur", HERO_MS + "ms"); bar.className = "run";
    const p = heroSet[heroIdx];
    $("heroNow").textContent = pad(heroIdx + 1) + " / " + pad(heroSet.length) + "  \u00b7  " + (p.title || "Untitled");
    clearTimeout(heroTimer);
    // Photos keep changing even with Reduce Motion on; that setting only removes the slow zoom (see style.css)
    if (heroSet.length > 1) heroTimer = setTimeout(() => showSlide(heroIdx + 1), HERO_MS);
  }
  // Swipe left or right on the slideshow to move between photos
  (() => {
    let x0 = null, y0 = 0;
    const top = $("top");
    top.addEventListener("touchstart", e => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
    top.addEventListener("touchend", e => {
      if (x0 === null || heroSet.length < 2) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) showSlide(heroIdx + (dx < 0 ? 1 : -1));
    }, { passive: true });
  })();
  $("heroOpen").onclick = () => { const p = heroSet[heroIdx]; if (!p) return; setFilter("all", false); openById(p.id); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearTimeout(heroTimer); else if (heroSet.length) showSlide(heroIdx); });

  /* ---------- nav state ---------- */
  const nav = $("nav");
  function onScroll() {
    const solid = window.scrollY > $("top").offsetHeight - 90;
    nav.classList.toggle("solid", solid);
    const ix = $("index"); ix.classList.add("stuck"); document.documentElement.style.setProperty("--navh", nav.offsetHeight + "px");
  }
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ---------- category index ---------- */
  function renderIndex() {
    const ix = $("index"); ix.textContent = "";
    const count = id => photos.filter(p => (p.categories || []).includes(id)).length;
    const items = [["all", "All work", photos.length]].concat(cats.map(c => [c.id, c.name, count(c.id)]).filter(x => x[2] > 0));
    ix.hidden = items.length < 2;
    items.forEach(([id, name, n]) => {
      const b = el("button"); b.type = "button"; b.dataset.id = id;
      b.append(name, el("sup", null, pad(n)));
      b.setAttribute("aria-pressed", filter === id);
      b.onclick = () => setFilter(id, true);
      ix.append(b);
    });
  }
  function setFilter(id, scroll) {
    filter = cats.some(c => c.id === id) ? id : "all";
    [...$("index").children].forEach(b => b.setAttribute("aria-pressed", b.dataset.id === filter));
    list = filter === "all" ? photos.slice() : photos.filter(p => (p.categories || []).includes(filter));
    $("workTitle").textContent = "";
    if (filter === "all") { $("workTitle").append("The ", el("i", null, "collection")); }
    else $("workTitle").append(el("i", null, catName(filter)));
    if (scroll) { setUrl(filter === "all" ? location.pathname : "#c/" + filter); const t = $("work").offsetTop - 10; scrollTo({ top: t, behavior: "smooth" }); }
    layout(true);
  }

  /* ---------- justified grid ---------- */
  let lastW = 0;
  function layout(rebuild) {
    const g = $("grid");
    $("empty").hidden = photos.length > 0;
    const W = g.clientWidth; if (!W) return;
    const gap = W < 600 ? 6 : 10; g.style.setProperty("--g", gap + "px");
    const target = W < 600 ? 180 : W < 1000 ? 260 : 340;
    if (rebuild || !g.children.length) {
      g.textContent = "";
      list.forEach((p, i) => {
        const b = el("button", "tile"); b.type = "button"; b.dataset.i = i;
        b.setAttribute("aria-label", (p.title || "Untitled") + ", open photograph");
        const img = el("img"); img.alt = p.title || "Untitled photograph"; img.loading = i < 6 ? "eager" : "lazy"; img.decoding = "async";
        img.width = p.tw || p.w; img.height = p.th || p.h;
        img.onload = () => img.classList.add("ready"); img.src = p.thumb || p.file;
        if (img.complete) img.classList.add("ready");
        const cap = el("div", "cap"); cap.append(el("span", "t", p.title || "Untitled"), el("span", "r", ratioLabel(p.w, p.h)));
        b.append(img, cap);
        b.onclick = () => open(i);
        b.onmouseenter = () => g.classList.add("dim"); b.onmouseleave = () => g.classList.remove("dim");
        g.append(b);
      });
    }
    // rows
    const tiles = [...g.children]; let row = [], sum = 0;
    const flush = (last) => {
      if (!row.length) return;
      const h = last ? Math.min(target, (W - gap * (row.length - 1)) / sum) : (W - gap * (row.length - 1)) / sum;
      row.forEach(({ t, r }) => { const w = Math.floor(r * h * 100) / 100; t.style.width = w + "px"; t.style.height = Math.round(h) + "px"; t.classList.toggle("narrow", w < 150); });
      row = []; sum = 0;
    };
    tiles.forEach((t, i) => {
      const p = list[i]; const r = p.w / p.h;
      row.push({ t, r }); sum += r;
      if (sum * target + gap * (row.length - 1) >= W) flush(false);
    });
    flush(true);
    lastW = W;
  }
  new ResizeObserver(() => { if ($("grid").clientWidth !== lastW) layout(false); }).observe($("grid"));

  /* ---------- hash ---------- */
  function applyHash(initial) {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith("c/")) setFilter(h.slice(2), false);
    else setFilter(filter, false);
    if (h.startsWith("p/")) openById(h.slice(2));
    else if (!$("lb").hidden && !initial) close(true);
    if (window.Learn) { if (h.startsWith("l/")) window.Learn.open(h.slice(2)); else if (window.Learn.isOpen() && !initial) window.Learn.close(); }
  }
  addEventListener("hashchange", () => applyHash(false));

  /* ---------- lightbox ---------- */
  function openById(id) {
    let i = list.findIndex(p => p.id === id);
    if (i < 0) { setFilter("all", false); i = list.findIndex(p => p.id === id); }
    if (i >= 0) open(i);
  }
  let lastFocus = null;
  function open(i) {
    if ($("lb").hidden) lastFocus = document.activeElement;
    current = i; $("lb").hidden = false; document.body.style.overflow = "hidden";
    const p = list[i]; setUrl("#p/" + encodeURIComponent(p.id));
    renderLb(); $("lbClose").focus({ preventScroll: true });
    [list[i - 1], list[i + 1]].forEach(n => { if (n) { const im = new Image(); setSrc(im, n, lbSizes(n)); } });
  }
  function close(fromHash) {
    $("lb").hidden = true; document.body.style.overflow = ""; current = -1;
    if (!fromHash) setUrl(filter === "all" ? location.pathname : "#c/" + filter);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function step(d) { const n = current + d; if (n >= 0 && n < list.length) open(n); }
  $("lbClose").onclick = () => close(false);
  $("prev").onclick = () => step(-1); $("next").onclick = () => step(1);
  $("vPrint").onclick = () => { view = "print"; renderLb(); };
  $("vWall").onclick = () => { view = "wall"; renderLb(); };
  document.addEventListener("keydown", e => {
    if ($("lb").hidden) return;
    if (e.key === "Escape") close(false);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });
  let tx = null, ty = null;
  $("stage").addEventListener("touchstart", e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  $("stage").addEventListener("touchend", e => {
    if (tx == null) return; const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1); tx = null;
  });

  function renderLb() {
    const p = list[current]; if (!p) return;
    $("lb").style.setProperty("--tone", p.tone || "#2a2a2e");
    $("lbCount").textContent = pad(current + 1) + " / " + pad(list.length);
    $("lbNo").textContent = "No. " + pad(photos.indexOf(p) + 1);
    $("lbTitle").textContent = p.title || "Untitled";
    const tg = $("lbTags"); tg.textContent = "";
    (p.categories || []).map(id => [id, catName(id)]).filter(x => x[1]).forEach(([id, n]) => {
      const b = el("button", null, n); b.type = "button"; b.onclick = () => { close(false); setFilter(id, true); }; tg.append(b);
    });
    const f = $("lbFacts"); f.textContent = "";
    const facts = [];
    if (p.location) facts.push(["Place", p.location]);
    if (p.year) facts.push(["Year", p.year]);
    facts.push(["Format", orient(p.w, p.h) + " \u00b7 " + ratioLabel(p.w, p.h)]);
    if (site.showSettings !== false) {
      if (p.camera) facts.push(["Camera", p.camera]);
      if (p.lens) facts.push(["Lens", p.lens]);
      const set = [p.focal, p.aperture, p.shutter, p.iso].filter(Boolean).map(x => String(x).replace(/ /g, "\u00a0")).join(" \u00b7 ");
      if (set) facts.push(["Settings", set]);
    }
    facts.forEach(([k, v]) => f.append(el("dt", null, k), el("dd", null, v)));
    paragraphs($("lbDesc"), p.description);
    let pa = $("lbPrint");
    if (!pa) { pa = el("a", "print-ask"); pa.id = "lbPrint"; $("lbDesc").after(pa); }
    pa.hidden = !site.email || site.printEnquiries === false;
    if (!pa.hidden) {
      const t = p.title || "Untitled", link = location.origin + location.pathname + "#p/" + encodeURIComponent(p.id);
      pa.textContent = "Ask about a print";
      pa.href = "mailto:" + site.email + "?subject=" + encodeURIComponent("Print enquiry: " + t) +
        "&body=" + encodeURIComponent("Hello Grant,\n\nI'm interested in a print of \"" + t + "\".\n" + link + "\n\nSize I have in mind:\n\nThanks,\n");
    }
    $("prev").disabled = current <= 0; $("next").disabled = current >= list.length - 1;
    $("vPrint").setAttribute("aria-pressed", view === "print"); $("vWall").setAttribute("aria-pressed", view === "wall");
    $("wallCtl").hidden = view !== "wall";
    const st = $("stageInner"); st.textContent = "";
    if (view === "print") {
      const img = el("img", "print"); setSrc(img, p, lbSizes(p)); img.alt = p.title || "Untitled photograph"; img.width = p.w; img.height = p.h;
      st.append(img);
    } else { st.append(buildScene(p)); renderWallCtl(); }
  }

  /* ---------- wall scene (modelled in cm) ---------- */
  // Everything is laid out in real centimetres, then scaled to fit. The scene widens
  // when the arrangement or the furniture needs more room, so sizes stay true to life.
  const ROOMS = {
    sideboard: { name: "Sideboard", w: 170, top: 72, span: 210 },
    sofa:      { name: "Sofa",      w: 219, top: 79, span: 410 },
    bed:       { name: "Bed",       w: 270, top: 118 },
    desk:      { name: "Desk",      w: 140, top: 121 },
    fireplace: { name: "Fireplace", w: 150, top: 140 }
  };
  const SIZES = [30, 40, 50, 60, 70, 90, 100, 120];
  const MOUNTS = { none: ["None", 0], standard: ["Standard", 0.12], wide: ["Wide", 0.2] };
  const FINISH = { paint: "Paint", panel: "Panelling", brick: "Brick", plaster: "Plaster" };

  function migrateWall() {
    if (typeof wall.mat === "boolean") { if (!wall.mount) wall.mount = wall.mat ? "standard" : "none"; delete wall.mat; }
    if (!ROOMS[wall.furniture]) wall.furniture = "sideboard";
    if (!WALLS[wall.wall]) wall.wall = "chalk";
    if (!FRAMES[wall.frame] && wall.frame !== "canvas") wall.frame = "black";
    if (!MOUNTS[wall.mount]) wall.mount = "standard";
    if (!FINISH[wall.finish]) wall.finish = "paint";
    if (!SIZES.includes(wall.size)) wall.size = 50;
    delete wall.count;
    if (wall.light !== "evening") wall.light = "day";
    wall.person = !!wall.person;
    if (!SOFAS[wall.sofa]) wall.sofa = "gray";
  }

  function buildScene(p) {
    migrateWall();
    const room = ROOMS[wall.furniture];
    const canvas = wall.frame === "canvas";
    const L = wall.size;

    const n = 1, group = [p];
    // every print shares the height of the chosen one, so the row lines up
    const r0 = p.w / p.h, ih = r0 >= 1 ? L / r0 : L;
    const matCm = canvas ? 0 : Math.max(MOUNTS[wall.mount][1] ? 5 : 0, L * MOUNTS[wall.mount][1]);
    const mould = canvas ? 0 : (L >= 90 ? 4 : L >= 60 ? 3.2 : 2.4);
    const items = group.map(q => {
      const iw = ih * (q.w / q.h);
      return { q, iw, ih, fw: iw + 2 * (matCm + mould), fh: ih + 2 * (matCm + mould) };
    });
    const gap = n > 1 ? Math.max(6, L * 0.12) : 0;
    const groupW = items.reduce((s, it) => s + it.fw, 0) + gap * (n - 1);
    const groupH = Math.max(...items.map(it => it.fh));

    // hang with the centre near eye level, and at least 20 cm clear of the furniture
    const floorCm = 16, skirtCm = 9;
    const bottom = Math.max(room.top + 20, 150 - groupH / 2);
    let SW = Math.max(375, groupW + 120, room.w + 120, room.span || 0, wall.person ? Math.max(groupW, room.w) + 240 : 0);
    let SH = Math.max(SW / 1.5, floorCm + bottom + groupH + 30);
    SW = Math.max(SW, SH * 1.5); SH = SW / 1.5;

    const pc = (cm, t) => (cm / t * 100) + "%";
    const X = cm => pc(cm, SW), Y = cm => pc(cm, SH), yb = cm => pc(cm + floorCm, SH);
    const wrap = el("div", "scene-wrap");
    const sc = el("div", "scene" + (wall.light === "evening" ? " evening" : ""));
    sc.style.setProperty("--wall", WALLS[wall.wall][1]);
    sc.style.setProperty("--cm", `calc(100cqw / ${SW})`);
    sc.dataset.finish = wall.finish;
    wrap.append(sc);
    const add = (cls, style, parent) => { const d = el("div", cls); Object.assign(d.style, style); (parent || sc).append(d); return d; };

    add("finish", {});
    add("floor", { height: Y(floorCm) });
    add("skirt", { bottom: Y(floorCm), height: Y(skirtCm) });

    const cx = SW / 2;
    const furn = FURNITURE[wall.furniture];
    furn({ add, X, Y, yb, cx, SW, SH });

    // the person, for scale
    if (wall.person) {
      const ph = 175, pw = 48, px = Math.max(12, cx - Math.max(groupW, room.w) / 2 - 95 - pw);
      const fig = add("person", { left: X(px), bottom: yb(0), width: X(pw), height: Y(ph) });
      fig.innerHTML = PERSON_SVG;
      fig.title = "175 cm";
    }
    add("daylight", {});

    // the frames
    let x = cx - groupW / 2;
    const yTop = bottom + groupH;
    items.forEach((it, k) => {
      const fy = yTop - (groupH - it.fh) / 2 - it.fh;
      const fr = add("frame" + (canvas ? " canvas" : ""), { left: X(x), width: X(it.fw), bottom: yb(fy), height: Y(it.fh) });
      if (!canvas) {
        const [, c1, c2] = FRAMES[wall.frame];
        fr.style.setProperty("--f1", c1); fr.style.setProperty("--f2", c2);
      }
      const inner = (ix, iy, w, h) => ({ left: pc(ix, it.fw), top: pc(iy, it.fh), width: pc(w, it.fw), height: pc(h, it.fh) });
      if (matCm) add("mat", inner(mould, mould, it.fw - 2 * mould, it.fh - 2 * mould), fr);
      const img = el("img");
      setSrc(img, it.q, "60vw");
      img.alt = (it.q.title || "Photograph") + ", framed on a wall";
      img.loading = "eager"; img.decoding = "async";
      Object.assign(img.style, inner(mould + matCm, mould + matCm, it.iw, it.ih));
      if (matCm) img.classList.add("bevel");
      fr.append(img);
      if (!canvas) add("glass", {}, fr);
      if (wall.light === "evening") {
        add("lamp", { left: X(x + it.fw / 2 - Math.min(it.fw * 0.55, 60) / 2), width: X(Math.min(it.fw * 0.55, 60)), bottom: yb(fy + it.fh + 6), height: Y(3.2) });
        add("pool", { left: X(x - it.fw * 0.25), width: X(it.fw * 1.5), bottom: yb(fy - it.fh * 0.35), height: Y(it.fh * 1.45) });
      }
      x += it.fw + gap;
    });
    add("shade", {});

    const ea = items[group.indexOf(p)] || items[0];
    const bits = [
      `${n > 1 ? "Each print" : "Print"} ${Math.round(ea.iw)} × ${Math.round(ea.ih)} cm`,
      `${canvas ? "Canvas" : "Framed"} ${Math.round(ea.fw)} × ${Math.round(ea.fh)} cm`
    ];
    if (n > 1) bits.push(`Group ${Math.round(groupW)} cm wide`);
    bits.push(`${room.name} ${room.w} cm`);
    if (wall.person) bits.push("Person 175 cm");
    wrap.append(el("div", "scale-note", bits.join("  ·  ")));
    return wrap;
  }

  const PERSON_SVG = '<svg viewBox="0 0 48 175" preserveAspectRatio="none" aria-hidden="true"><g fill="currentColor">' +
    '<ellipse cx="24" cy="11" rx="8.5" ry="10.5"/>' +
    '<path d="M18 22h12l2 4c7 1.5 11 5 12 11l3 34c.3 3-4 4-4.6 1L39 44l-1 33 2 92c0 3-6 3-6.5 0L26 92h-4l-7.5 77c-.5 3-6.5 3-6.5 0l2-92-1-33-3.4 28c-.6 3-4.9 2-4.6-1l3-34c1-6 5-9.5 12-11z"/>' +
    '</g></svg>';

  /* ---------- rendered furniture ---------- */
  // Sideboard and sofa are 3D renders with their own soft shadows (transparent WebP).
  // Each image covers a known rectangle of wall, in cm from the furniture's centre line.
  const SOFAS = { gray: ["Grey", "#adadaa"], champagne: ["Taupe", "#8a7560"], navy: ["Navy", "#28407e"] };
  const ROOM_IMG = "assets/room/";
  function render3d(add, X, Y, yb, cx, file, r, alt) {
    const d = add("r3d", { left: X(cx + r[0]), width: X(r[1] - r[0]), bottom: yb(r[2]), height: Y(r[3] - r[2]) });
    const im = el("img"); im.src = ROOM_IMG + file; im.alt = ""; im.decoding = "async"; im.draggable = false;
    d.append(im);
    return d;
  }

  const FURNITURE = {
    sideboard({ add, X, Y, yb, cx }) {
      const eve = wall.light === "evening";
      render3d(add, X, Y, yb, cx, eve ? "sideboard-eve.webp" : "sideboard-day.webp", [-100, 100, -16, 150]);
      if (eve) {
        add("lampglow", { left: X(cx - 55 - 70), width: X(140), bottom: yb(64), height: Y(130) });
        render3d(add, X, Y, yb, cx, "lampshade.webp", [-75, -35, 106, 138]).classList.add("lit");
      }
    },
    sofa({ add, X, Y, yb, cx }) {
      render3d(add, X, Y, yb, cx, "sofa-" + wall.sofa + ".webp", [-128, 200, -16, 104]);
    },
    bed({ add, X, Y, yb, cx }) {
      const bw = 160, hb = 118, base = 30, mat = 24, tw = 45, th = 55;
      const hbx = cx - (bw + 10) / 2;
      const head = add("headboard", { left: X(hbx), width: X(bw + 10), bottom: yb(0), height: Y(hb) });
      head.innerHTML = "<span></span>".repeat(7);
      add("bedbase", { left: X(cx - bw / 2), width: X(bw), bottom: yb(6), height: Y(base - 6) });
      add("duvet", { left: X(cx - bw / 2 - 2), width: X(bw + 4), bottom: yb(base - 2), height: Y(mat + 6) });
      add("pillow", { left: X(cx - bw / 2 + 8), width: X(64), bottom: yb(base + mat + 2), height: Y(24) });
      add("pillow", { left: X(cx + bw / 2 - 72), width: X(64), bottom: yb(base + mat + 2), height: Y(24) });
      add("cushion", { left: X(cx - 22), width: X(44), bottom: yb(base + mat), height: Y(26) });
      [cx - bw / 2 - 12 - tw, cx + bw / 2 + 12].forEach(tx => {
        add("table", { left: X(tx), width: X(tw), bottom: yb(0), height: Y(th) });
        add("lamp-base", { left: X(tx + tw / 2 - 6), width: X(12), bottom: yb(th), height: Y(26) });
        add("lamp-shade", { left: X(tx + tw / 2 - 15), width: X(30), bottom: yb(th + 24), height: Y(22) });
      });
    },
    desk({ add, X, Y, yb, cx }) {
      const dw = 140, dh = 75, dx = cx - dw / 2;
      [dx + 4, dx + dw - 4 - 3].forEach(x => add("leg thin", { left: X(x), width: X(3), bottom: yb(0), height: Y(dh - 3) }));
      add("desktop", { left: X(dx), width: X(dw), bottom: yb(dh - 3), height: Y(3) });
      add("drawer", { left: X(dx + dw - 46), width: X(40), bottom: yb(dh - 15), height: Y(12) });
      add("stand", { left: X(cx - 4), width: X(8), bottom: yb(dh), height: Y(12) });
      add("monitor", { left: X(cx - 30), width: X(60), bottom: yb(dh + 12), height: Y(34) });
      add("mug", { left: X(cx + 38), width: X(8), bottom: yb(dh), height: Y(10) });
      add("pot small", { left: X(dx + 10), width: X(16), bottom: yb(dh), height: Y(16) });
      [[-20, 30], [0, 38], [22, 28]].forEach(([deg, len]) => {
        const s = add("frond", { left: X(dx + 15), width: X(7), bottom: yb(dh + 14), height: Y(len) }); s.style.transform = `rotate(${deg}deg)`;
      });
      add("chair", { left: X(cx - 25), width: X(50), bottom: yb(42), height: Y(52) });
      add("chairseat", { left: X(cx - 27), width: X(54), bottom: yb(42), height: Y(6) });
      add("chairpost", { left: X(cx - 2), width: X(4), bottom: yb(6), height: Y(36) });
      add("chairfoot", { left: X(cx - 28), width: X(56), bottom: yb(0), height: Y(6) });
    },
    fireplace({ add, X, Y, yb, cx }) {
      const sw_ = 150, sh = 112, fw = 74, fh = 66;
      add("breast", { left: X(cx - 95), width: X(190), bottom: yb(0), height: "100%" });
      add("hearth", { left: X(cx - 85), width: X(170), bottom: yb(0), height: Y(5) });
      const s = add("surround", { left: X(cx - sw_ / 2), width: X(sw_), bottom: yb(5), height: Y(sh - 5) });
      add("firebox", { left: X(cx - fw / 2), width: X(fw), bottom: yb(5), height: Y(fh) });
      add("logs", { left: X(cx - 22), width: X(44), bottom: yb(7), height: Y(10) });
      add("mantel", { left: X(cx - sw_ / 2 - 8), width: X(sw_ + 16), bottom: yb(sh), height: Y(6) });
      [cx - sw_ / 2 + 6, cx + sw_ / 2 - 12].forEach(x => {
        add("candle-stick", { left: X(x), width: X(5), bottom: yb(sh + 6), height: Y(16) });
        add("candle", { left: X(x + 0.8), width: X(3.4), bottom: yb(sh + 22), height: Y(12) });
      });
      add("vase", { left: X(cx + 34), width: X(10), height: Y(18), bottom: yb(sh + 6) });
      s.innerHTML = "<i></i>";
    }
  };

  function renderWallCtl() {
    migrateWall();
    const c = $("wallCtl"); c.textContent = "";
    const box = el("div", "wall-ctl");
    const save = () => { try { localStorage.setItem("wallPrefs", JSON.stringify(wall)); } catch (e) {} renderLb(); };
    const row = (label, items) => { const r = el("div", "ctl"); r.setAttribute("role", "group"); r.setAttribute("aria-label", label); r.append(el("span", null, label), ...items); box.append(r); };
    const chip = (label, on, fn, title) => { const b = el("button", "chip", label); b.type = "button"; b.setAttribute("aria-pressed", on); if (title) b.title = title; b.onclick = fn; return b; };
    const sw = (k, label, bg, key, cls) => { const b = el("button", "sw" + (cls ? " " + cls : "")); b.type = "button"; b.style.background = bg; b.title = label; b.setAttribute("aria-label", label); b.setAttribute("aria-pressed", wall[key] === k); b.onclick = () => { wall[key] = k; save(); }; return b; };

    row("Room", Object.entries(ROOMS).map(([k, r]) => chip(r.name, wall.furniture === k, () => { wall.furniture = k; save(); })));
    if (wall.furniture === "sofa") row("Sofa", Object.entries(SOFAS).map(([k, [n, col]]) => sw(k, n + " velvet", col, "sofa")));
    row("Wall", Object.entries(WALLS).map(([k, [n, col]]) => sw(k, n + " wall", col, "wall")));
    row("Finish", Object.entries(FINISH).map(([k, n]) => chip(n, wall.finish === k, () => { wall.finish = k; save(); })));
    row("Frame", [...Object.entries(FRAMES).map(([k, [n, a, b]]) => sw(k, n + " frame", `linear-gradient(135deg,${a},${b})`, "frame")),
      sw("canvas", "Canvas, no frame", "conic-gradient(from 210deg,#6f8b92,#c9b48c,#506a52,#6f8b92)", "frame", "canvas-sw")]);
    if (wall.frame !== "canvas") row("Mount", Object.entries(MOUNTS).map(([k, [n]]) => chip(n, wall.mount === k, () => { wall.mount = k; save(); })));
    row("Size", SIZES.map(s => chip(s + "", wall.size === s, () => { wall.size = s; save(); }, "Longest edge of the print, " + s + " cm")).concat(el("em", "unit", "cm")));
    row("Light", [chip("Day", wall.light === "day", () => { wall.light = "day"; save(); }), chip("Evening", wall.light === "evening", () => { wall.light = "evening"; save(); })]);
    row("Scale", [chip("Show a person", wall.person, () => { wall.person = !wall.person; save(); }, "A 175 cm figure for scale")]);
    c.append(box);
  }
})();
