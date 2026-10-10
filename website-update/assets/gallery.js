(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  let site = {}, photos = [], cats = [];
  let filter = "all", list = [], current = -1, view = "print";
  const wall = { wall: "chalk", frame: "black", mat: true, size: 50, furniture: "sideboard" };
  try { Object.assign(wall, JSON.parse(localStorage.getItem("wallPrefs") || "{}")); } catch (e) {}

  const WALLS = { chalk:["Chalk","#ECEAE4"], stone:["Stone","#CFC9BE"], sage:["Sage","#B9C2AF"], slate:["Slate","#58616B"], forest:["Forest","#2C3A32"], ink:["Ink","#22252B"] };
  const FRAMES = { black:["Black","#1A1A1A","#2A2A2A"], oak:["Oak","#C79D66","#A47A47"], walnut:["Walnut","#5C3F2B","#3F2A1C"], white:["White","#F5F4F0","#DCDAD3"], brass:["Brass","#C9A75E","#8E7134"] };
  const SIZES = [30, 50, 70, 100];

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
  const SW = 375, SH = 250;
  function buildScene(p) {
    const pc = (cm, t) => (cm / t * 100) + "%";
    const floorCm = 16, skirtCm = 9;
    const yb = cm => pc(cm + floorCm, SH);
    const wrap = el("div", "scene-wrap"); const sc = el("div", "scene"); sc.style.background = WALLS[wall.wall][1]; wrap.append(sc);
    const add = (cls, style) => { const d = el("div", cls); Object.assign(d.style, style); sc.append(d); return d; };
    add("floor", { height: pc(floorCm, SH) });
    add("skirt", { bottom: pc(floorCm, SH), height: pc(skirtCm, SH) });
    let top, furnLabel;
    if (wall.furniture === "sofa") {
      // three-seat sofa, 214 cm wide: seat 44 cm, arms 62 cm, back 84 cm
      const sw_ = 214, sx = (SW - sw_) / 2, legH = 9, armW = 20, seatH = 44, armH = 62, backH = 84;
      [sx + 8, sx + sw_ - 8 - 3].forEach(x => add("sleg", { left: pc(x, SW), bottom: yb(0), height: pc(legH, SH) }));
      add("sback", { left: pc(sx + armW - 4, SW), width: pc(sw_ - 2 * armW + 8, SW), bottom: yb(legH + 16), height: pc(backH - legH - 16, SH) });
      add("sbase", { left: pc(sx, SW), width: pc(sw_, SW), bottom: yb(legH), height: pc(16, SH) });
      const cw = (sw_ - 2 * armW) / 3;
      [0, 1, 2].forEach(k => add("scush", { left: pc(sx + armW + k * cw + 0.6, SW), width: pc(cw - 1.2, SW), bottom: yb(legH + 16), height: pc(seatH - legH - 16, SH) }));
      [sx, sx + sw_ - armW].forEach(x => add("sarm", { left: pc(x, SW), width: pc(armW, SW), bottom: yb(legH), height: pc(armH - legH, SH) }));
      add("spillow", { left: pc(sx + armW + 6, SW), width: pc(34, SW), bottom: yb(seatH - 2), height: pc(30, SH) });
      add("spillow b", { left: pc(sx + sw_ - armW - 40, SW), width: pc(34, SW), bottom: yb(seatH - 2), height: pc(30, SH) });
      top = backH; furnLabel = "Sofa 214 cm";
    } else {
      const bw = 170, bh = 56, legH = 14, bx = (SW - bw) / 2;
      const board = add("board", { left: pc(bx, SW), width: pc(bw, SW), bottom: yb(legH), height: pc(bh, SH) });
      board.innerHTML = '<div class="doors"><span></span><span></span><span></span></div>';
      [bx + 7, bx + bw - 7 - 3.3].forEach(x => add("leg", { left: pc(x, SW), bottom: yb(0), height: pc(legH, SH) }));
      top = legH + bh;
      const vx = bx + bw - 36;
      [[-14, 52], [6, 60], [22, 46], [-30, 40]].forEach(([deg, len]) => {
        const s = add("stem", { left: pc(vx + 6.5, SW), bottom: yb(top + 18), height: pc(len, SH) }); s.style.transform = `rotate(${deg}deg)`;
      });
      add("vase", { left: pc(vx, SW), width: pc(14, SW), height: pc(26, SH), bottom: yb(top) });
      const bk = add("books", { left: pc(bx + 14, SW), bottom: yb(top), height: pc(24, SH), width: pc(22, SW) });
      [["#3d4a57", 18, 100], ["#b8a07a", 14, 88], ["#6d3b33", 22, 94], ["#d6d0c4", 12, 80]].forEach(([c, w, h]) => { const s = el("span"); s.style.cssText = `background:${c};width:${w}%;height:${h}%`; bk.append(s); });
      furnLabel = "Sideboard 170 cm";
    }

    const r = p.w / p.h, L = wall.size;
    const iw = r >= 1 ? L : L * r, ih = r >= 1 ? L / r : L;
    const mat = wall.mat ? Math.max(5, L * 0.12) : 0, mould = L >= 70 ? 3.5 : 2.5;
    const fw = iw + 2 * (mat + mould), fh = ih + 2 * (mat + mould);
    let bottom = top + 24;
    if (bottom + fh > SH - floorCm - 6) bottom = Math.max(top + 6, SH - floorCm - 6 - fh);
    const [, c1, c2] = FRAMES[wall.frame];
    const fr = add("frame", { left: pc((SW - fw) / 2, SW), width: pc(fw, SW), bottom: yb(bottom), height: pc(fh, SH), background: `linear-gradient(135deg, ${c1}, ${c2})` });
    const inner = (x, y, w, h) => ({ left: pc(x, fw), top: pc(y, fh), width: pc(w, fw), height: pc(h, fh) });
    if (wall.mat) { const m = el("div", "mat"); Object.assign(m.style, inner(mould, mould, fw - 2 * mould, fh - 2 * mould)); fr.append(m); }
    const img = el("img"); img.src = p.file; img.alt = (p.title || "Photograph") + ", framed on a wall";
    Object.assign(img.style, inner(mould + mat, mould + mat, iw, ih)); fr.append(img);
    sc.append(el("div", "wallgrain"));
    wrap.append(el("div", "scale-note", `Print ${Math.round(iw)} \u00d7 ${Math.round(ih)} cm  \u00b7  Framed ${Math.round(fw)} \u00d7 ${Math.round(fh)} cm  \u00b7  ${furnLabel}`));
    return wrap;
  }
  function renderWallCtl() {
    const c = $("wallCtl"); c.textContent = "";
    const box = el("div", "wall-ctl");
    const row = (label, items) => { const r = el("div", "ctl"); r.append(el("span", null, label), ...items); box.append(r); };
    const save = () => { try { localStorage.setItem("wallPrefs", JSON.stringify(wall)); } catch (e) {} renderLb(); };
    const sw = (k, label, bg, key) => { const b = el("button", "sw"); b.type = "button"; b.style.background = bg; b.title = label; b.setAttribute("aria-label", label); b.setAttribute("aria-pressed", wall[key] === k); b.onclick = () => { wall[key] = k; save(); }; return b; };
    const chipF = (label, on, fn) => { const b = el("button", "chip", label); b.type = "button"; b.setAttribute("aria-pressed", on); b.onclick = fn; return b; };
    row("Room", [chipF("Sideboard", wall.furniture !== "sofa", () => { wall.furniture = "sideboard"; save(); }), chipF("Sofa", wall.furniture === "sofa", () => { wall.furniture = "sofa"; save(); })]);
    row("Wall", Object.entries(WALLS).map(([k, [n, col]]) => sw(k, n + " wall", col, "wall")));
    row("Frame", Object.entries(FRAMES).map(([k, [n, a, b]]) => sw(k, n + " frame", `linear-gradient(135deg,${a},${b})`, "frame")));
    const chip = (label, on, fn) => { const b = el("button", "chip", label); b.type = "button"; b.setAttribute("aria-pressed", on); b.onclick = fn; return b; };
    row("Mount", [chip("Mounted", wall.mat, () => { wall.mat = true; save(); }), chip("Full bleed", !wall.mat, () => { wall.mat = false; save(); })]);
    row("Size", SIZES.map(s => chip(s + " cm", wall.size === s, () => { wall.size = s; save(); })));
    c.append(box);
  }
})();
