(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pad = n => String(n).padStart(2, "0");
  const setUrl = u => { try { history.replaceState(null, "", u); } catch (e) {} };
  const DOT = " \u00b7 ";
  let lessons = [], photos = [], current = -1, lastFocus = null, glossary = [], siteName = "", learnTitle = "";

  const minutes = l => Math.max(1, Math.ceil(((l.summary || "") + " " + (l.body || "")).split(/\s+/).filter(Boolean).length / 200)) + (/\[\[exposure\]\]/.test(l.body || "") ? 2 : 0) + ((l.body || "").match(/\[\[guide:/g) || []).length;
  const photoFor = l => photos.find(p => p.id === l.cover) || null;

  function init(data) {
    photos = (data.photos || []).filter(p => p && p.file);
    glossary = ((data.site || {}).glossary || []).filter(g => g && g.term && g.def);
    siteName = (data.site || {}).name || ""; learnTitle = (data.site || {}).learnTitle || "Learn";
    lessons = (data.lessons || []).filter(l => l && l.id && l.title && !l.draft);
    const site = data.site || {};
    $("learn").hidden = !lessons.length; $("learnLink").hidden = !lessons.length;
    $("learnIntro").textContent = site.learnIntro || "";
    $("learnIntro").hidden = !site.learnIntro;
    if (site.learnTitle) { const t = $("learnTitle"); t.textContent = ""; const w = site.learnTitle.trim().split(/\s+/); t.append(w.length > 1 ? w.slice(0, -1).join(" ") + " " : ""); t.append(el("i", null, w[w.length - 1])); }
    topics = (site.lessonTopics || []).filter(t => t && t.id && t.name && lessons.some(l => l.topic === t.id));
    if (!topics.some(t => t.id === topic)) topic = "all";
    renderTopics(); renderList();
  }
  let topics = [], topic = "all";
  function renderTopics() {
    let bar = $("ltopics");
    if (!bar) { bar = el("div", "ltopics"); bar.id = "ltopics"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "Filter lessons by topic"); $("lessons").before(bar); }
    bar.textContent = ""; bar.hidden = topics.length < 2;
    [["all", "All lessons", lessons.length]].concat(topics.map(t => [t.id, t.name, lessons.filter(l => l.topic === t.id).length])).forEach(([id, name, n]) => {
      const b = el("button"); b.type = "button"; b.dataset.id = id; b.append(name, el("sup", null, pad(n)));
      b.setAttribute("aria-pressed", topic === id);
      b.onclick = () => { topic = id; [...bar.children].forEach(x => x.setAttribute("aria-pressed", x.dataset.id === id)); renderList(); };
      bar.append(b);
    });
  }
  function renderList() {
    const list = $("lessons"); list.textContent = "";
    lessons.filter(l => topic === "all" || l.topic === topic).forEach((l, i) => {
      const li = el("li", "lesson"); const b = el("button"); b.type = "button";
      const ph = photoFor(l); if (ph && ph.tone) b.style.setProperty("--tone", ph.tone);
      const lt = el("div", "lt"); lt.append(el("h3", null, l.title), el("p", null, l.summary || ""));
      const lm = el("div", "lm"); const tn = (topics.find(t => t.id === l.topic) || {}).name;
      if (topic === "all" && tn) lm.append(el("span", "lvl", tn)); else if (l.level) lm.append(el("span", "lvl", l.level));
      lm.append(el("span", null, minutes(l) + " min read"));
      const lc = el("div", "lc"); if (ph) { const im = el("img"); im.src = ph.thumb || ph.file; im.alt = ""; im.loading = "lazy"; lc.append(im); }
      b.append(el("span", "ln", pad(i + 1)), lt, lm, lc);
      b.onclick = () => open(l.id);
      li.append(b); list.append(li);
    });
  }

  /* ---------- light markdown: ## heading, - list, > quote, **bold**, *italic*, [[exposure]] ---------- */
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>");
  function renderBody(target, text, lesson) {
    target.textContent = "";
    (text || "").replace(/\r/g, "").split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).forEach(block => {
      if (block === "[[exposure]]") { target.append(exposure(lesson)); return; }
      const sm = block.match(/^\[\[shot:(.+)\]\]$/);
      if (sm) { const key = sm[1].trim().toLowerCase(); const ph = photos.find(p => p.id.toLowerCase() === key || (p.title || "").trim().toLowerCase() === key);
        if (ph) { const f = el("figure", "rd-fig shot"); const im = el("img"); im.src = ph.file; im.alt = ph.title || ""; im.width = ph.w; im.height = ph.h; f.append(im);
          const dl = el("dl", "shot-facts"); const add = (k, v) => { if (v) dl.append(el("dt", null, k), el("dd", null, v)); };
          add("Photograph", ph.title); add("Place", ph.location); add("Year", ph.year); add("Camera", ph.camera); add("Lens", ph.lens);
          add("Settings", [ph.focal, ph.aperture, ph.shutter, ph.iso].filter(Boolean).map(x => String(x).replace(/ /g, "\u00a0")).join(" \u00b7 "));
          f.append(dl); target.append(f); }
        return; }
      const pm = block.match(/^\[\[photo:(.+)\]\]$/);
      if (pm) { const key = pm[1].trim().toLowerCase(); const ph = photos.find(p => p.id.toLowerCase() === key || (p.title || "").trim().toLowerCase() === key);
        if (ph) { const f = el("figure", "rd-fig"); const im = el("img"); im.src = ph.file; im.alt = ph.title || ""; im.loading = "lazy"; im.width = ph.w; im.height = ph.h;
          const cap = el("figcaption"); cap.append(el("b", null, ph.title || "Untitled")); if (ph.location) cap.append(" \u00b7 " + ph.location); f.append(im, cap); target.append(f); }
        return; }
      const gm = block.match(/^\[\[guide:([a-z]+)\]\]$/); if (gm) { target.append(guide(gm[1], lesson)); return; }
      if (block.startsWith("## ")) { const h = el("h2"); h.innerHTML = inline(block.slice(3)); target.append(h); return; }
      const lines = block.split("\n");
      if (lines.every(x => /^\d+\. /.test(x.trim()))) { const ol = el("ol"); lines.forEach(x => { const li = el("li"); li.innerHTML = inline(x.trim().replace(/^\d+\.\s+/, "")); ol.append(li); }); target.append(ol); return; }
      if (lines.every(x => /^[-*] /.test(x.trim()))) { const ul = el("ul"); lines.forEach(x => { const li = el("li"); li.innerHTML = inline(x.trim().slice(2)); ul.append(li); }); target.append(ul); return; }
      if (lines.every(x => x.trim().startsWith(">"))) { const q = el("blockquote"); q.innerHTML = inline(lines.map(x => x.trim().replace(/^>\s?/, "")).join(" ")); target.append(q); return; }
      const p = el("p"); p.innerHTML = lines.map(inline).join("<br>"); target.append(p);
    });
  }

  /* ---------- reader ---------- */
  function open(id) {
    const i = lessons.findIndex(l => l.id === id); if (i < 0) return;
    if ($("reader").hidden) lastFocus = document.activeElement;
    current = i; const l = lessons[i];
    $("reader").hidden = false; document.body.style.overflow = "hidden"; $("reader").scrollTop = 0;
    setUrl("#l/" + encodeURIComponent(l.id));
    $("rdCount").textContent = "Lesson " + pad(i + 1) + " / " + pad(lessons.length);
    const cov = $("rdCover"); cov.textContent = ""; const ph = photoFor(l);
    cov.classList.toggle("none", !ph);
    cov.classList.remove("fit");
    if (ph) {
      const im = el("img"); im.src = ph.file; im.alt = ph.title || "";
      /* A file narrower than the band would be stretched and look soft, so show it whole over a blurred copy of itself instead */
      if (ph.w && ph.w < cov.clientWidth * 1.2) {
        cov.classList.add("fit"); const bg = el("img", "bg"); bg.src = ph.thumb || ph.file; bg.alt = ""; bg.setAttribute("aria-hidden", "true");
        im.className = "fg"; cov.append(bg, im);
      } else cov.append(im);
    }
    $("rdMeta").textContent = [l.level, minutes(l) + " min read"].filter(Boolean).join(DOT);
    $("rdTitle").textContent = l.title; $("rdSum").textContent = l.summary || ""; $("rdSum").hidden = !l.summary;
    renderBody($("rdBody"), l.body, l);
    toc($("rdBody"));
    linkGlossary($("rdBody"));
    extras($("rdBody"), l);
    const nx = $("rdNext"); nx.textContent = "";
    const next = lessons[i + 1] || (lessons.length > 1 ? lessons[0] : null);
    if (next) { const b = el("button"); b.type = "button"; b.append(el("small", null, lessons[i + 1] ? "Next lesson" : "Back to the first lesson"), el("span", null, next.title)); b.onclick = () => open(next.id); nx.append(b); }
    $("rdClose").focus({ preventScroll: true });
    progress();
  }
  function close() {
    $("reader").hidden = true; document.body.style.overflow = ""; current = -1;
    setUrl(location.pathname + "#learn");
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function progress() { const r = $("reader"); const max = r.scrollHeight - r.clientHeight; $("rdProgress").style.width = (max > 0 ? r.scrollTop / max * 100 : 0) + "%"; }
  $("reader").addEventListener("scroll", progress, { passive: true });
  $("rdClose").onclick = close;
  document.addEventListener("keydown", e => { if (!$("reader").hidden && e.key === "Escape") close(); });

  /* ---------- exposure simulator ---------- */
  const APS = [1.8, 2.8, 4, 5.6, 8, 11, 16, 22];
  const SHS = [1/1000, 1/500, 1/250, 1/125, 1/60, 1/30, 1/15, 1/8, 1/4, 1/2, 1];
  const ISOS = [100, 200, 400, 800, 1600, 3200, 6400];
  const DOFPX = [11, 8, 5.5, 3.5, 2, 1, .4, 0];
  const shLabel = t => t >= 1 ? t + " s" : "1/" + Math.round(1 / t);
  function exposure(lesson) {
    const ph = photoFor(lesson) || photos.find(p => p.w >= p.h) || photos[0];
    const box = el("div", "exp"); box.setAttribute("role", "group"); box.setAttribute("aria-label", "Exposure simulator");
    const view = el("div", "exp-view");
    let bg, fg;
    if (ph) { bg = el("img", "bg"); fg = el("img", "fg"); bg.src = fg.src = ph.file; bg.alt = ""; fg.alt = "Simulated exposure of " + (ph.title || "a photograph"); view.append(bg, fg); }
    const cv = document.createElement("canvas"); cv.width = 1200; cv.height = 800;
    const cx = cv.getContext("2d"); const id = cx.createImageData(1200, 800);
    for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 70; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    cx.putImageData(id, 0, 0); view.append(cv, el("div", "focus"));
    const hud = el("div", "exp-hud"); const set = el("span"); const meter = el("span", "meter"); const evt = el("span");
    for (let k = -4; k <= 4; k++) { const m = el("i"); if (k === 0) m.className = "mid"; meter.append(m); }
    const right = el("span"); right.style.cssText = "display:flex;gap:12px;align-items:center"; right.append(meter, evt);
    hud.append(set, right); view.append(hud); box.append(view);

    const st = { a: 4, s: 3, i: 2 };   // f/8, 1/125, ISO 400: the reference exposure
    const ctl = el("div", "exp-ctl"); const outs = {};
    const uid = "x" + Math.random().toString(36).slice(2, 7);
    [["a", "Aperture", APS.length], ["s", "Shutter", SHS.length], ["i", "ISO", ISOS.length]].forEach(([k, label, n]) => {
      const r = el("div", "exp-row"); const lab = el("label", null, label); const inp = el("input"); inp.type = "range"; inp.min = 0; inp.max = n - 1; inp.step = 1; inp.value = st[k]; inp.id = uid + k; lab.htmlFor = inp.id;
      const o = el("output"); outs[k] = o; inp.oninput = () => { st[k] = +inp.value; update(); };
      r.append(lab, inp, o); ctl.append(r); outs[k + "in"] = inp;
    });
    const note = el("p", "exp-note"); const reset = el("button", "exp-reset", "Reset to correct exposure"); reset.type = "button";
    reset.onclick = () => { st.a = 4; st.s = 3; st.i = 2; ["a", "s", "i"].forEach(k => outs[k + "in"].value = st[k]); update(); };
    box.append(ctl, note); const rr = el("div"); rr.style.marginTop = "12px"; rr.append(reset); box.append(rr);

    function update() {
      const N = APS[st.a], t = SHS[st.s], iso = ISOS[st.i];
      const ev = Math.log2((8 * 8) / (N * N)) + Math.log2(t * 125) + Math.log2(iso / 400);
      const evr = Math.round(ev * 3) / 3;
      outs.a.textContent = "f/" + N; outs.s.textContent = shLabel(t); outs.i.textContent = iso;
      set.textContent = "f/" + N + DOT + shLabel(t) + DOT + "ISO " + iso;
      evt.textContent = (Math.abs(evr) < 0.17 ? "\u00b10" : (evr > 0 ? "+" : "\u2212") + Math.abs(evr).toFixed(1).replace(/\.0$/, "")) + " EV";
      [...meter.children].forEach((m, k) => { const pos = k - 4; m.classList.toggle("on", pos !== 0 && (evr > 0 ? pos > 0 && pos <= Math.round(evr) : pos < 0 && pos >= Math.round(evr))); });
      const bright = Math.pow(2, Math.max(-4, Math.min(4, ev)) * 0.8);
      const shake = t >= 1/30 ? Math.min(14, Math.log2(t / (1/60)) * 2.6) : 0;
      document.getElementById("mblurStd").setAttribute("stdDeviation", shake.toFixed(1) + " 0");
      const base = `brightness(${bright.toFixed(3)}) contrast(${ev > 1 ? 0.85 : 1})` + (shake ? " url(#mblur)" : "");
      if (bg) { bg.style.filter = base + ` blur(${DOFPX[st.a]}px)`; fg.style.filter = base; }
      else view.style.filter = `brightness(${bright.toFixed(3)})`;
      cv.style.opacity = Math.max(0, Math.log2(iso / 400) * 0.16).toFixed(3);
      const parts = [];
      parts.push(Math.abs(evr) < 0.17 ? "<b>Correct exposure.</b> " : evr > 0 ? `<b>Over by ${Math.abs(evr).toFixed(1).replace(/\.0$/, "")} stop${Math.abs(evr) >= 1.5 ? "s" : ""}.</b> Highlights are blowing out. ` : `<b>Under by ${Math.abs(evr).toFixed(1).replace(/\.0$/, "")} stop${Math.abs(evr) >= 1.5 ? "s" : ""}.</b> Shadows are filling in. `);
      parts.push(N <= 2.8 ? "A wide aperture throws the background out of focus. " : N >= 16 ? "A narrow aperture keeps near and far sharp. " : "");
      parts.push(t >= 1/30 ? "At this shutter speed a handheld camera will shake: use a tripod. " : t <= 1/500 ? "A fast shutter freezes movement. " : "");
      parts.push(iso >= 1600 ? "High ISO adds visible grain." : "");
      note.innerHTML = parts.join("");
    }
    update();
    return box;
  }


  /* ---------- composition guides ---------- */
  const NS = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  function chips(defs, onPick, initial) {
    const row = el("div", "ctl"); row.style.marginTop = "16px";
    const btns = defs.map(([key, label]) => { const b = el("button", "chip", label); b.type = "button"; b.setAttribute("aria-pressed", key === initial); b.onclick = () => { btns.forEach(x => x.setAttribute("aria-pressed", x === b)); onPick(key); }; row.append(b); return b; });
    return row;
  }
  function photoView(lesson, prefer) {
    const ph = photoFor(lesson) || (prefer ? photos.find(prefer) : null) || photos.find(p => p.w >= p.h) || photos[0];
    const view = el("div", "gview");
    const r = ph ? Math.min(2, Math.max(0.8, ph.w / ph.h)) : 1.5;
    view.style.aspectRatio = r.toFixed(4); view.style.width = `min(100%, calc(74svh * ${r.toFixed(4)}))`;
    if (ph) { const im = el("img", "gimg"); im.src = ph.file; im.alt = ph.title || ""; view.append(im); }
    return { view, ph, r };
  }
  function overlay(view, r) {
    const W = 1000, H = Math.round(1000 / r);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "gsvg", "aria-hidden": "true" });
    view.append(svg); return { svg, W, H };
  }
  function guide(type, lesson) {
    const box = el("div", "exp guide"); box.setAttribute("role", "group");
    const cap = el("p", "exp-note");
    const say = t => { cap.innerHTML = t; };
    if (type === "horizon") return horizon(box, cap);
    if (type === "mist") return mist(box, cap);
    if (type === "space") return space(box, cap);
    if (type === "zone") return zone(box, cap);
    if (type === "longexp") return longexp(box, cap);
    const T = window.LearnTools;
    if (T && type === "focal") return T.focal(box, cap);
    if (T && type === "polariser") return T.polariser(box, cap);
    if (T && type === "planner") return T.planner(box, cap);
    if (T && type === "beforeafter") return T.beforeafter(box, cap, photoFor(lesson) || photos.find(p => p.w >= p.h) || photos[0]);

    const { view, ph, r } = photoView(lesson, type === "symmetry" ? (p => p.w > p.h) : null);
    box.append(view);
    const { svg, W, H } = overlay(view, r);
    const clear = () => { while (svg.firstChild) svg.firstChild.remove(); };
    const line = (x1, y1, x2, y2, cls) => svg.append(sv("line", { x1, y1, x2, y2, class: cls || "gl" }));

    if (type === "thirds") {
      box.setAttribute("aria-label", "Rule of thirds overlay");
      const draw = mode => {
        clear(); if (mode === "off") { say("Guides off. Look at where your eye goes first."); return; }
        const f = mode === "phi" ? [0.382, 0.618] : [1/3, 2/3];
        f.forEach(t => { line(W * t, 0, W * t, H); line(0, H * t, W, H * t); });
        f.forEach(a => f.forEach(b => svg.append(sv("circle", { cx: W * a, cy: H * b, r: 11, class: "gdot" }))));
        say(mode === "phi" ? "<b>Phi grid.</b> Lines at 38% and 62%, drawn from the golden ratio. It sits a little closer to the centre than thirds." : "<b>Thirds grid.</b> Put the main subject on one of the four points, and a horizon along one of the lines.");
      };
      box.append(chips([["thirds", "Thirds grid"], ["phi", "Phi grid"], ["off", "Off"]], draw, "thirds"), cap); draw("thirds");
    }

    else if (type === "golden") {
      box.setAttribute("aria-label", "Golden spiral overlay");
      const g = sv("g", { class: "gspiral" }); svg.append(g);
      // build the spiral in a golden rectangle, then stretch it to the frame
      const GW = 1618, GH = 1000; let x = 0, y = 0, w = GW, h = GH, d = "", sq = "";
      for (let k = 0; k < 10; k++) {
        const dir = k % 4; let s, sx, sy, ex, ey;
        if (dir === 0) { s = h; sx = x; sy = y + s; ex = x + s; ey = y; sq += `M${x} ${y}h${s}v${s}h${-s}z`; x += s; w -= s; }
        else if (dir === 1) { s = w; sx = x; sy = y; ex = x + s; ey = y + s; sq += `M${x} ${y}h${s}v${s}h${-s}z`; y += s; h -= s; }
        else if (dir === 2) { s = h; sx = x + w; sy = y; ex = x + w - s; ey = y + s; sq += `M${x + w - s} ${y}h${s}v${s}h${-s}z`; w -= s; }
        else { s = w; sx = x + w; sy = y + h; ex = x; ey = y + h - s; sq += `M${x} ${y + h - s}h${s}v${s}h${-s}z`; h -= s; }
        d += (k === 0 ? `M${sx} ${sy}` : "") + `A${s} ${s} 0 0 1 ${ex} ${ey}`;
      }
      const inner = sv("g", { transform: `scale(${W / GW} ${H / GH})` });
      inner.append(sv("path", { d: sq, class: "gsq" }), sv("path", { d, class: "garc" }));
      g.append(inner);
      const orient = { a: [1, 1], b: [-1, 1], c: [1, -1], d: [-1, -1] };
      const set = k => {
        if (k === "off") { g.style.display = "none"; say("Spiral off."); return; }
        g.style.display = ""; const [fx, fy] = orient[k];
        g.setAttribute("transform", `translate(${fx < 0 ? W : 0} ${fy < 0 ? H : 0}) scale(${fx} ${fy})`);
        say("<b>Golden spiral.</b> The eye is drawn round the curve to where it tightens. Flip it until that point lands on your subject.");
      };
      box.append(chips([["a", "Spiral \u2198"], ["b", "Spiral \u2199"], ["c", "Spiral \u2197"], ["d", "Spiral \u2196"], ["off", "Off"]], set, "a"), cap); set("a");
    }

    else if (type === "lines") {
      box.setAttribute("aria-label", "Leading lines overlay. Tap the photograph to move the point the lines lead to.");
      let vx = W * 0.62, vy = H * 0.42, on = true;
      const starts = [[-0.05, 1], [0.12, 1], [0.32, 1], [0.7, 1], [0.92, 1], [1.05, 0.88]];
      const draw = () => {
        clear(); if (!on) { say("Lines off."); return; }
        starts.forEach(([a, b], i) => { const l = sv("line", { x1: W * a, y1: H * b, x2: vx, y2: vy, class: "gl lead" }); l.style.animationDelay = (i * 0.08) + "s"; svg.append(l); });
        svg.append(sv("circle", { cx: vx, cy: vy, r: 16, class: "gdot" }));
        say("<b>Tap the photograph</b> to move the point the lines lead to. Put it on your subject and every line in the frame does the work of pointing at it.");
      };
      view.style.cursor = "crosshair";
      view.addEventListener("click", e => { const b = view.getBoundingClientRect(); vx = (e.clientX - b.left) / b.width * W; vy = (e.clientY - b.top) / b.height * H; on = true; btns.querySelectorAll(".chip").forEach((c, i) => c.setAttribute("aria-pressed", i === 0)); draw(); });
      const btns = chips([["on", "Show lines"], ["off", "Off"]], k => { on = k === "on"; draw(); }, "on");
      box.append(btns, cap); draw();
    }

    else if (type === "frame") {
      box.setAttribute("aria-label", "Framing overlay");
      const draw = k => {
        clear(); if (k === "none") { say("No frame. The eye wanders off the edges."); return; }
        let d;
        if (k === "door") { const ax = W * 0.22, aw = W * 0.56, top = H * 0.16, rad = aw / 2; d = `M0 0H${W}V${H}H0Z M${ax} ${H}V${top + rad}A${rad} ${rad} 0 0 1 ${ax + aw} ${top + rad}V${H}Z`; }
        else { const m = W * 0.08, t = H * 0.1, iw = W - 2 * m, ih = H - 2 * t, bar = W * 0.012; d = `M0 0H${W}V${H}H0Z M${m} ${t}h${iw / 2 - bar}v${ih / 2 - bar}h${-(iw / 2 - bar)}Z M${m + iw / 2 + bar} ${t}h${iw / 2 - bar}v${ih / 2 - bar}h${-(iw / 2 - bar)}Z M${m} ${t + ih / 2 + bar}h${iw / 2 - bar}v${ih / 2 - bar}h${-(iw / 2 - bar)}Z M${m + iw / 2 + bar} ${t + ih / 2 + bar}h${iw / 2 - bar}v${ih / 2 - bar}h${-(iw / 2 - bar)}Z`; }
        svg.append(sv("path", { d, class: "gframe", "fill-rule": "evenodd" }));
        say(k === "door" ? "<b>An archway.</b> The dark edge holds the eye in and adds a layer of depth in front of the view." : "<b>A window.</b> Even a busy frame works if it is darker than the view through it.");
      };
      box.append(chips([["door", "Archway"], ["window", "Window"], ["none", "No frame"]], draw, "door"), cap); draw("door");
    }

    else if (type === "symmetry") {
      box.setAttribute("aria-label", "Symmetry mirror");
      const mirror = el("div", "gmirror"); view.insertBefore(mirror, svg);
      const set = k => {
        clear(); mirror.textContent = ""; mirror.className = "gmirror";
        if (ph && k !== "axis" && k !== "off") {
          mirror.classList.add(k); const im = el("img"); im.src = ph.file; im.alt = ""; mirror.append(im);
        }
        if (k === "lr" || k === "axis") line(W / 2, 0, W / 2, H, "gl axis");
        if (k === "tb") line(0, H / 2, W, H / 2, "gl axis");
        say(k === "lr" ? "<b>Mirrored left to right.</b> Perfect symmetry is calm and formal. Real scenes are rarely this exact, which is what makes it striking when you find it." :
            k === "tb" ? "<b>Mirrored top to bottom.</b> This is what still water does. For reflections, centre the horizon and let the two halves balance." :
            k === "axis" ? "<b>The centre line.</b> For symmetry, this is the one time to put the subject dead centre." : "Guides off.");
      };
      box.append(chips([["axis", "Centre line"], ["lr", "Mirror left to right"], ["tb", "Mirror as a reflection"], ["off", "Off"]], set, "axis"), cap); set("axis");
    }
    else if (type === "focus") {
      box.setAttribute("aria-label", "Macro depth of field");
      const blur = view.querySelector(".gimg"); svg.remove();
      let sharp = null; if (ph) { sharp = el("img", "gimg"); sharp.src = ph.file; sharp.alt = ""; view.append(sharp); }
      const plane = el("div", "gplane"); view.append(plane);
      const st = { pos: 62, ap: "8", stack: false };
      const HALF = { "2.8": 3, "8": 8, "16": 14 }, DOF = { "2.8": "0.3", "8": "1", "16": "2" };
      const row = el("div", "exp-row"); row.style.marginTop = "18px";
      const lab = el("label", null, "Focus"); const inp = el("input"); inp.type = "range"; inp.min = 8; inp.max = 92; inp.value = st.pos; inp.id = "fc" + Math.random().toString(36).slice(2, 6); lab.htmlFor = inp.id;
      const out = el("output"); row.append(lab, inp, out);
      const draw = () => {
        const h = HALF[st.ap], p = st.pos;
        if (blur) blur.style.filter = st.stack ? "none" : "blur(7px)";
        if (sharp) {
          const m = st.stack ? "none" : `linear-gradient(to bottom, transparent ${p - h - 5}%, #000 ${p - h}%, #000 ${p + h}%, transparent ${p + h + 5}%)`;
          sharp.style.webkitMaskImage = m; sharp.style.maskImage = m;
          sharp.style.filter = st.ap === "16" ? "blur(.6px)" : "none";
        }
        plane.style.top = p + "%"; plane.hidden = st.stack;
        out.textContent = st.stack ? "stacked" : "f/" + st.ap;
        say(st.stack ? "<b>Focus stacked.</b> Several frames, each focused a little further back, blended into one that is sharp throughout. It needs a still subject and a tripod." :
          `<b>At life size, f/${st.ap} gives about ${DOF[st.ap]} mm in focus.</b> ` + (st.ap === "2.8" ? "Barely the thickness of a petal. Move the slider to see how little is sharp." : st.ap === "16" ? "More depth, but diffraction is starting to soften the whole image." : "f/8 is a sensible starting point: more depth without much softening."));
      };
      inp.oninput = () => { st.pos = +inp.value; draw(); };
      box.append(row, chips([["2.8", "f/2.8"], ["8", "f/8"], ["16", "f/16"], ["stack", "Focus stack"]], k => { if (k === "stack") st.stack = true; else { st.stack = false; st.ap = k; } draw(); }, "8"), cap);
      draw();
    }

    else if (type === "crop") {
      box.setAttribute("aria-label", "Find the abstract. Drag the square across the photograph.");
      svg.remove();
      const win = el("div", "gcrop"); view.append(win); view.style.touchAction = "none";
      const res = el("div", "gres"); if (ph) res.style.backgroundImage = `url("${ph.file}")`;
      let fx = 0.55, fy = 0.4, size = 0.3;
      const place = () => {
        const b = view.getBoundingClientRect(); if (!b.width) return;
        const sz = size * Math.min(b.width, b.height);
        const left = Math.max(0, Math.min(b.width - sz, fx * b.width - sz / 2)), top = Math.max(0, Math.min(b.height - sz, fy * b.height - sz / 2));
        Object.assign(win.style, { width: sz + "px", height: sz + "px", left: left + "px", top: top + "px" });
        res.style.backgroundSize = `${b.width / sz * 100}% ${b.height / sz * 100}%`;
        res.style.backgroundPosition = `${b.width - sz ? left / (b.width - sz) * 100 : 0}% ${b.height - sz ? top / (b.height - sz) * 100 : 0}%`;
      };
      let drag = false;
      const move = e => { const b = view.getBoundingClientRect(); fx = (e.clientX - b.left) / b.width; fy = (e.clientY - b.top) / b.height; place(); };
      view.addEventListener("pointerdown", e => { drag = true; view.setPointerCapture(e.pointerId); move(e); });
      view.addEventListener("pointermove", e => { if (drag) move(e); });
      view.addEventListener("pointerup", () => { drag = false; }); view.addEventListener("pointercancel", () => { drag = false; });
      new ResizeObserver(place).observe(view);
      say("<b>Drag the square</b> across the photograph. Cut away the context and a hillside becomes texture, a shoreline becomes two bands of tone.");
      box.append(chips([["0.18", "Tight"], ["0.3", "Medium"], ["0.45", "Loose"]], k => { size = +k; place(); }, "0.3"), res, cap);
      requestAnimationFrame(place);
    }

    else if (type === "verticals") {
      box.setAttribute("aria-label", "Correcting converging verticals");
      const im = view.querySelector(".gimg"); svg.remove();
      if (im) { im.style.transformOrigin = "50% 50%"; im.style.transition = "transform .25s ease-out"; }
      const guides = document.createElementNS(NS, "svg"); guides.setAttribute("viewBox", "0 0 100 100"); guides.setAttribute("preserveAspectRatio", "none"); guides.setAttribute("class", "gsvg"); guides.setAttribute("aria-hidden", "true");
      [20, 40, 60, 80].forEach(x => guides.append(sv("line", { x1: x, x2: x, y1: 0, y2: 100, class: "gl faint" })));
      view.append(guides);
      const row = el("div", "exp-row"); row.style.marginTop = "18px";
      const lab = el("label", null, "Correct"); const inp = el("input"); inp.type = "range"; inp.min = 0; inp.max = 100; inp.value = 0; inp.id = "vt" + Math.random().toString(36).slice(2, 6); lab.htmlFor = inp.id;
      const out = el("output"); row.append(lab, inp, out);
      const draw = () => {
        const k = +inp.value / 100, ang = -22 * k, sc = 1 + 0.32 * k;
        if (im) im.style.transform = `perspective(900px) rotateX(${ang}deg) scale(${sc.toFixed(3)})`;
        out.textContent = Math.round(k * 100) + "%";
        say(k < 0.05 ? "<b>As shot.</b> Pointing the camera up makes parallel walls lean in towards the top. Compare them with the straight guide lines." :
          k < 0.95 ? "<b>Partly corrected.</b> Many photographers stop here. A little lean keeps the sense of height without looking like a falling building." :
          "<b>Fully corrected.</b> The walls are vertical, but look at the edges: the correction stretches the top and crops into the frame. Leave room around the building when you shoot.");
      };
      inp.oninput = draw; box.append(row, cap); draw();
    }

    else if (type === "mono") {
      box.setAttribute("aria-label", "Black and white conversion with colour filters");
      const im = view.querySelector(".gimg"); svg.remove();
      const fid = "mono" + Math.random().toString(36).slice(2, 7);
      const fs = document.createElementNS(NS, "svg"); fs.setAttribute("width", "0"); fs.setAttribute("height", "0"); fs.style.position = "absolute";
      const filt = sv("filter", { id: fid, "color-interpolation-filters": "sRGB" }); const cm = sv("feColorMatrix", { type: "matrix" }); filt.append(cm); fs.append(filt); box.append(fs);
      const W = { neutral: [0.299, 0.587, 0.114], red: [1.3, 0.05, -0.35], yellow: [0.75, 0.4, -0.15], green: [0.2, 0.75, 0.05], blue: [0.05, 0.25, 0.7] };
      const NOTE = { colour: "<b>Colour.</b> Pick a filter to see how differently the same scene converts.",
        neutral: "<b>Straight conversion.</b> Every colour becomes grey by its brightness. Often flat: colours that looked different can end up the same grey.",
        red: "<b>Red filter.</b> Blue sky goes dark, warm stone and sand go light. The classic for dramatic skies.",
        yellow: "<b>Yellow filter.</b> A gentler version of red. Darkens the sky a little and lifts warm tones.",
        green: "<b>Green filter.</b> Lightens foliage and darkens reds. Useful in woodland and for skin.",
        blue: "<b>Blue filter.</b> Lightens the sky and darkens warm tones. Adds haze and mood." };
      const st = { mode: "red", c: 1.15 };
      const row = el("div", "exp-row"); row.style.marginTop = "18px";
      const lab = el("label", null, "Contrast"); const inp = el("input"); inp.type = "range"; inp.min = 70; inp.max = 170; inp.value = 115; inp.id = "mc" + fid; lab.htmlFor = inp.id;
      const out = el("output"); row.append(lab, inp, out);
      const draw = () => {
        out.textContent = (st.c * 100 - 100 >= 0 ? "+" : "") + Math.round(st.c * 100 - 100);
        if (st.mode === "colour") { if (im) im.style.filter = "none"; }
        else { const [r, g, b] = W[st.mode]; const rowv = `${r} ${g} ${b} 0 0`; cm.setAttribute("values", `${rowv} ${rowv} ${rowv} 0 0 0 1 0`); if (im) im.style.filter = `url(#${fid}) contrast(${st.c})`; }
        say(NOTE[st.mode]);
      };
      inp.oninput = () => { st.c = +inp.value / 100; draw(); };
      box.append(chips([["colour", "Colour"], ["neutral", "Neutral"], ["red", "Red"], ["yellow", "Yellow"], ["green", "Green"], ["blue", "Blue"]], k => { st.mode = k; draw(); }, "red"), row, cap);
      draw();
    }

    else if (type === "icm") {
      box.setAttribute("aria-label", "Intentional camera movement simulator");
      const im = view.querySelector(".gimg"); svg.remove();
      const cv = document.createElement("canvas"); cv.className = "gimg"; view.append(cv);
      const SH = [1/60, 1/30, 1/15, 1/8, 1/4, 1/2, 1];
      const st = { s: 4, dir: "v" };
      const row = el("div", "exp-row"); row.style.marginTop = "18px";
      const lab = el("label", null, "Shutter"); const inp = el("input"); inp.type = "range"; inp.min = 0; inp.max = SH.length - 1; inp.value = st.s; inp.id = "ic" + Math.random().toString(36).slice(2, 6); lab.htmlFor = inp.id;
      const out = el("output"); row.append(lab, inp, out);
      const render = () => {
        const t = SH[st.s]; out.textContent = t >= 1 ? "1 s" : "1/" + Math.round(1 / t) + " s";
        if (!im || !im.complete || !im.naturalWidth) return;
        const b = view.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.round(b.width * dpr), h = Math.round(b.height * dpr); if (!w || !h) return;
        cv.width = w; cv.height = h; const c = cv.getContext("2d");
        const ir = im.naturalWidth / im.naturalHeight, vr = w / h;
        const dw = ir > vr ? h * ir : w, dh = ir > vr ? h : w / ir, ox = (w - dw) / 2, oy = (h - dh) / 2;
        const len = Math.max(0, Math.log2(t / (1/60))) * 0.028 * (st.dir === "v" ? h : w);
        const n = len ? 28 : 1;
        for (let k = 0; k < n; k++) {
          const o = n > 1 ? (k / (n - 1) - 0.5) * len : 0;
          c.globalAlpha = 1 / (k + 1);
          c.drawImage(im, ox + (st.dir === "h" ? o : 0), oy + (st.dir === "v" ? o : 0), dw, dh);
        }
        c.globalAlpha = 1;
        say(t <= 1/60 ? "<b>1/60 s with a pan.</b> Too fast to blur much. Slow the shutter down." :
          `<b>${out.textContent}, ${st.dir === "v" ? "vertical" : "horizontal"} sweep.</b> ` + (st.dir === "v" ? "Up and down along tree trunks turns a wood into streaks of light and colour." : "Sideways along a horizon smears the coast into bands of sea, land and sky.") + (t >= 1/8 ? " In daylight you will need f/16, ISO 100 and often an ND filter to get this slow." : ""));
      };
      im && im.addEventListener("load", render);
      inp.oninput = () => { st.s = +inp.value; render(); };
      new ResizeObserver(render).observe(view);
      box.append(row, chips([["v", "Vertical sweep"], ["h", "Horizontal sweep"]], k => { st.dir = k; render(); }, "v"), cap);
      render();
    }
    return box;
  }



  function slider(box, label, min, max, val) {
    const row = el("div", "exp-row"); row.style.marginTop = "18px";
    const lab = el("label", null, label); const inp = el("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.value = val; inp.id = "sl" + Math.random().toString(36).slice(2, 7); lab.htmlFor = inp.id;
    const out = el("output"); row.append(lab, inp, out); box.append(row); return { inp, out };
  }
  const mix = (a, b, t) => "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",") + ")";

  function mist(box, cap) {
    const say = t => { cap.innerHTML = t; };
    box.setAttribute("aria-label", "Mist in a wood");
    const W = 1000, H = 640;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "hsvg", role: "img", "aria-label": "A wood with adjustable mist" });
    const bgR = sv("rect", { x: 0, y: 0, width: W, height: H }); svg.append(bgR);
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const layers = [];
    for (let i = 0; i < 6; i++) {
      const g = sv("g", {}); const n = 16 - i * 2, wBase = 6 + i * i * 4.5;
      for (let k = 0; k < n; k++) {
        const x = rnd() * (W + 80) - 40, w = wBase * (0.7 + rnd() * 0.6), lean = (rnd() - 0.5) * 14;
        g.append(sv("path", { d: `M${x - w / 2} ${H}L${x - w * 0.35 + lean} 0H${x + w * 0.35 + lean}L${x + w / 2} ${H}Z` }));
        if (i < 4 && rnd() > 0.4) { const by = 120 + rnd() * 260, dir = rnd() > 0.5 ? 1 : -1; g.append(sv("path", { d: `M${x + lean * 0.5} ${by}l${dir * (30 + i * 12)} ${-20 - rnd() * 30}`, "stroke-width": 2 + i, fill: "none", class: "br" })); }
      }
      svg.append(g); layers.push(g);
    }
    const ground = sv("rect", { x: 0, y: H * 0.9, width: W, height: H * 0.1 }); svg.append(ground);
    const view = el("div", "gview"); view.style.aspectRatio = (W / H).toFixed(4); view.style.width = `min(100%, calc(74svh * ${(W / H).toFixed(4)}))`; view.append(svg); box.append(view);
    const { inp, out } = slider(box, "Mist", 0, 100, 70); box.append(cap);
    const DARK = [30, 38, 31], FOG = [204, 206, 198], BUSY = [58, 74, 56];
    const draw = () => {
      const m = +inp.value / 100; out.textContent = Math.round(m * 100) + "%";
      bgR.setAttribute("fill", mix(BUSY, FOG, Math.min(1, m * 1.1)));
      layers.forEach((g, i) => { const depth = (5 - i) / 5; const c = mix(DARK, FOG, m * depth * 0.92); g.setAttribute("fill", c); g.setAttribute("stroke", c); });
      ground.setAttribute("fill", mix([22, 26, 20], [150, 152, 140], m * 0.6));
      say(m < 0.25 ? "<b>No mist.</b> Every trunk is the same dark tone, near and far. The eye cannot tell what is close and what is far, so the wood reads as clutter." :
        m < 0.65 ? "<b>Some mist.</b> The far trees start to fade. Layers appear, and with them depth." :
        "<b>Thick mist.</b> Each row of trees is paler than the one in front. The nearest trunks stand out on their own. This is the morning to be in the wood.");
    };
    inp.oninput = draw; draw(); return box;
  }

  function space(box, cap) {
    const say = t => { cap.innerHTML = t; };
    box.setAttribute("aria-label", "Minimalism. Simplify the scene.");
    const W = 1000, H = 640, hy = H * 0.58;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "hsvg", role: "img", "aria-label": "A seascape that can be simplified" });
    const defs = sv("defs", {}); const g1 = sv("linearGradient", { id: "msky", x1: 0, y1: 0, x2: 0, y2: 1 });
    [["0", "#c9ccc8"], ["1", "#e8e5dd"]].forEach(([o, c]) => g1.append(sv("stop", { offset: o, "stop-color": c })));
    const g2 = sv("linearGradient", { id: "msea", x1: 0, y1: 0, x2: 0, y2: 1 });
    [["0", "#a9b1b2"], ["1", "#7f898c"]].forEach(([o, c]) => g2.append(sv("stop", { offset: o, "stop-color": c })));
    defs.append(g1, g2); svg.append(defs, sv("rect", { width: W, height: hy, fill: "url(#msky)" }), sv("rect", { y: hy, width: W, height: H - hy, fill: "url(#msea)" }));
    const ink = "#2b3034";
    const parts = [
      ["a jagged headland", `<path d="M0 ${hy}V${hy - 70}L60 ${hy - 110}L120 ${hy - 80}L170 ${hy - 120}L250 ${hy - 40}L300 ${hy}Z" fill="#59605f"/>`],
      ["rocks in the foreground", `<path d="M0 ${H}V${H - 70}Q60 ${H - 120} 140 ${H - 80}Q200 ${H - 110} 260 ${H - 60}L300 ${H}Z M820 ${H}Q860 ${H - 90} 940 ${H - 70}Q980 ${H - 100} 1000 ${H - 80}V${H}Z" fill="${ink}"/>`],
      ["a second boat", `<path d="M190 ${hy + 90}h70l-12 14h-48z M222 ${hy + 90}v-40l22 34z" fill="${ink}"/>`],
      ["pier posts", [0, 1, 2, 3, 4].map(k => `<rect x="${760 + k * 34}" y="${hy + 30 + k * 22}" width="8" height="${40 + k * 10}" fill="${ink}"/>`).join("")],
      ["a row of buoys", [0, 1, 2].map(k => `<circle cx="${380 + k * 70}" cy="${hy + 140 + k * 8}" r="8" fill="#b4523f"/>`).join("")],
      ["gulls", [[420, 120], [470, 150], [520, 110], [860, 90]].map(([x, y]) => `<path d="M${x} ${y}q10 -10 20 0q10 -10 20 0" fill="none" stroke="${ink}" stroke-width="3"/>`).join("")],
      ["clouds", `<g fill="#f3f1ec" opacity=".8"><ellipse cx="300" cy="90" rx="140" ry="26"/><ellipse cx="760" cy="150" rx="120" ry="20"/></g>`],
    ];
    const groups = parts.map(([, html]) => { const g = sv("g", { class: "mpart" }); g.innerHTML = html; svg.append(g); return g; });
    const boat = sv("g", {}); boat.innerHTML = `<path d="M600 ${hy + 52}h44l-8 9h-28z M620 ${hy + 52}v-26l15 22z" fill="${ink}"/>`; svg.append(boat);
    const view = el("div", "gview"); view.style.aspectRatio = (W / H).toFixed(4); view.style.width = `min(100%, calc(74svh * ${(W / H).toFixed(4)}))`; view.append(svg); box.append(view);
    const { inp, out } = slider(box, "Simplify", 0, parts.length, 0); box.append(cap);
    const draw = () => {
      const k = +inp.value; groups.forEach((g, i) => g.classList.toggle("gone", i < k));
      const left = parts.length - k; out.textContent = (left + 1) + (left ? " things" : " thing");
      say(k === 0 ? "<b>Everything in.</b> Eight things compete for attention and the boat is lost. Drag the slider to remove them one at a time." :
        left ? `<b>Removed ${parts[k - 1][0]}.</b> ${left} distraction${left > 1 ? "s" : ""} left. Notice how the boat gets stronger without getting any bigger.` :
        "<b>One subject, all space.</b> The empty sea and sky are not wasted. They are what makes the small boat matter.");
    };
    inp.oninput = draw; draw(); return box;
  }


  function zone(box, cap) {
    const say = t => { cap.innerHTML = t; };
    box.setAttribute("aria-label", "Zone focusing calculator");
    const W = 1000, H = 300, X0 = 70, X1 = 960, MAXM = 15;
    const xm = m => X0 + Math.min(m, MAXM) / MAXM * (X1 - X0);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "hsvg zsvg", role: "img" });
    const band = sv("rect", { y: 70, height: 150, class: "zband" });
    const axis = sv("line", { x1: X0, x2: X1, y1: 240, y2: 240, class: "zaxis" });
    svg.append(band, axis);
    for (let m = 0; m <= MAXM; m++) { const x = xm(m); svg.append(sv("line", { x1: x, x2: x, y1: 240, y2: m % 5 ? 246 : 254, class: "zaxis" })); if (m % 5 === 0 || m <= 3) { const t = sv("text", { x, y: 276, class: "ztxt", "text-anchor": "middle" }); t.textContent = m + (m === MAXM ? "+ m" : ""); svg.append(t); } }
    const cam = sv("path", { d: `M18 128h40v30H18z M30 122h16v6H30z M58 136l10 -6v26l-10 -6z`, class: "zcam" }); svg.append(cam);
    const people = [1.2, 2.5, 4, 6.5, 11].map(m => { const g = sv("g", { class: "zp" }); const x = xm(m), sc = 1.15 - m / 30;
      g.innerHTML = `<circle cx="${x}" cy="${240 - 118 * sc}" r="${11 * sc}"/><path d="M${x - 13 * sc} ${240 - 100 * sc}h${26 * sc}l${4 * sc} ${58 * sc}h${-8 * sc}l-2 ${42 * sc}h${-6 * sc}l-2 -${30 * sc}l-2 ${30 * sc}h${-6 * sc}l-2 -${42 * sc}h${-8 * sc}z"/>`; g.dataset.m = m; svg.append(g); return g; });
    const fl = sv("line", { y1: 60, y2: 240, class: "zfocus" }); svg.append(fl);
    const nearT = sv("text", { y: 56, class: "ztxt zacc", "text-anchor": "middle" }), farT = sv("text", { y: 56, class: "ztxt zacc", "text-anchor": "middle" }); svg.append(nearT, farT);
    const view = el("div", "gview"); view.style.aspectRatio = (W / H).toFixed(4); view.append(svg); box.append(view);
    const st = { f: 35, N: 8 };
    const d = slider(box, "Focus at", 10, 100, 30);
    const fRow = chips([["28", "28 mm"], ["35", "35 mm"], ["50", "50 mm"]], k => { st.f = +k; draw(); }, "35");
    const nRow = chips([["5.6", "f/5.6"], ["8", "f/8"], ["11", "f/11"], ["16", "f/16"]], k => { st.N = +k; draw(); }, "8");
    nRow.style.marginTop = "8px"; box.append(fRow, nRow, cap);
    const draw = () => {
      const sm = +d.inp.value / 10, s = sm * 1000, f = st.f, N = st.N, c = 0.03;
      const Hf = f * f / (N * c) + f;
      const near = s * (Hf - f) / (Hf + s - 2 * f) / 1000;
      const far = s < Hf ? s * (Hf - f) / (Hf - s) / 1000 : Infinity;
      d.out.textContent = sm.toFixed(1) + " m";
      const xa = xm(near), xb = far === Infinity ? X1 + 30 : xm(far);
      band.setAttribute("x", xa); band.setAttribute("width", Math.max(2, xb - xa));
      fl.setAttribute("x1", xm(sm)); fl.setAttribute("x2", xm(sm));
      nearT.setAttribute("x", xa); nearT.textContent = near.toFixed(1) + " m";
      farT.setAttribute("x", Math.min(xb, X1 - 20)); farT.textContent = far === Infinity ? "\u221e" : far.toFixed(1) + " m";
      people.forEach(g => g.classList.toggle("in", +g.dataset.m >= near && +g.dataset.m <= far));
      const fmt = v => v === Infinity ? "infinity" : (v < 10 ? v.toFixed(1) : Math.round(v)) + " m";
      say(`<b>${f} mm at f/${N}, focused at ${sm.toFixed(1)} m:</b> sharp from ${fmt(near)} to ${fmt(far)}. ` + (far === Infinity ? "You are at or beyond the hyperfocal distance, so everything to the horizon is sharp." : "Anyone who walks into that zone is in focus without you touching the camera.") + ` (Full-frame figures; hyperfocal distance ${(Hf / 1000).toFixed(1)} m.)`);
    };
    d.inp.oninput = draw; draw(); return box;
  }


  function longexp(box, cap) {
    const say = t => { cap.innerHTML = t; };
    box.setAttribute("aria-label", "Long exposure simulator");
    const W = 1000, H = 640, hy = H * 0.52, fid = "le" + Math.random().toString(36).slice(2, 7);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "hsvg", role: "img", "aria-label": "A seascape at different shutter speeds" });
    const defs = sv("defs", {});
    const mk = (id, std) => { const f = sv("filter", { id: fid + id, x: "-20%", y: "-20%", width: "140%", height: "140%" }); const g = sv("feGaussianBlur", { stdDeviation: std }); f.append(g); defs.append(f); return g; };
    const cloudBlur = mk("c", "0 0"), seaBlur = mk("s", "0 0"), boatBlur = mk("b", "0 0");
    const gs = sv("linearGradient", { id: fid + "sky", x1: 0, y1: 0, x2: 0, y2: 1 }); [["0", "#5b6f86"], ["1", "#c9c3b8"]].forEach(([o, c]) => gs.append(sv("stop", { offset: o, "stop-color": c })));
    const gw = sv("linearGradient", { id: fid + "sea", x1: 0, y1: 0, x2: 0, y2: 1 }); [["0", "#7d8d96"], ["1", "#3c4a52"]].forEach(([o, c]) => gw.append(sv("stop", { offset: o, "stop-color": c })));
    defs.append(gs, gw); svg.append(defs, sv("rect", { width: W, height: hy, fill: `url(#${fid}sky)` }));
    const clouds = sv("g", { filter: `url(#${fid}c)`, fill: "#eef0ee", opacity: ".85" });
    [[180, 90, 120, 22], [430, 150, 160, 26], [720, 80, 140, 20], [880, 190, 110, 18], [300, 230, 90, 14]].forEach(([x, y, rx, ry]) => clouds.append(sv("ellipse", { cx: x, cy: y, rx, ry })));
    svg.append(clouds, sv("rect", { y: hy, width: W, height: H - hy, fill: `url(#${fid}sea)` }));
    const sea = sv("g", { filter: `url(#${fid}s)`, stroke: "#e9eef0", fill: "none", "stroke-linecap": "round" });
    let seed = 3; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 70; i++) { const y = hy + 8 + Math.pow(rnd(), 1.4) * (H - hy - 10), x = rnd() * W, w = 20 + (y - hy) * 0.35 * rnd() + 10, sw = 1 + (y - hy) / 90; sea.append(sv("path", { d: `M${x} ${y}q${w / 2} ${-4 - sw * 2} ${w} 0`, "stroke-width": sw.toFixed(1), opacity: (0.35 + rnd() * 0.5).toFixed(2) })); }
    const sheen = sv("rect", { y: hy, width: W, height: H - hy, fill: "#aab4b8", opacity: 0 });
    svg.append(sea, sheen);
    const boat = sv("g", { filter: `url(#${fid}b)` }); boat.innerHTML = `<path d="M560 ${hy + 46}h70l-12 14h-46z M592 ${hy + 46}v-42l24 38z" fill="#20272b"/>`;
    svg.append(boat);
    svg.append(sv("path", { d: `M0 ${H}V${H - 150}Q70 ${H - 210} 150 ${H - 170}Q210 ${H - 230} 280 ${H - 160}Q330 ${H - 120} 360 ${H}Z`, fill: "#15191b" }));
    svg.append(sv("path", { d: `M760 ${hy - 4}h240v10H760z`, fill: "#1d2326" }));
    [790, 840, 890, 940, 990].forEach(x => svg.append(sv("rect", { x: x - 3, y: hy + 4, width: 6, height: 44, fill: "#1d2326" })));
    const view = el("div", "gview"); view.style.aspectRatio = (W / H).toFixed(4); view.style.width = `min(100%, calc(74svh * ${(W / H).toFixed(4)}))`; view.append(svg); box.append(view);
    const T = [1/500, 1/125, 1/30, 1/8, 1/2, 2, 8, 30, 120];
    const lab = t => t >= 1 ? (t >= 60 ? (t / 60) + " min" : t + " s") : "1/" + Math.round(1 / t) + " s";
    const row = el("div", "exp-row"); row.style.marginTop = "18px";
    const l = el("label", null, "Shutter"); const inp = el("input"); inp.type = "range"; inp.min = 0; inp.max = T.length - 1; inp.value = 1; inp.id = fid + "in"; l.htmlFor = inp.id;
    const out = el("output"); row.append(l, inp, out); box.append(row, cap);
    const draw = () => {
      const t = T[+inp.value], k = Math.max(0, Math.min(1, (Math.log2(t) + 9) / 16));
      out.textContent = lab(t);
      cloudBlur.setAttribute("stdDeviation", `${(Math.max(0, Math.log2(t) + 1) * 14).toFixed(1)} ${(Math.max(0, Math.log2(t) + 1) * 1.5).toFixed(1)}`);
      seaBlur.setAttribute("stdDeviation", `${(k * 26).toFixed(1)} ${(k * 6).toFixed(1)}`);
      sea.setAttribute("opacity", (1 - Math.min(1, k * 1.15)).toFixed(2)); sheen.setAttribute("opacity", Math.min(0.75, k * 0.85).toFixed(2));
      boatBlur.setAttribute("stdDeviation", `${Math.min(60, Math.max(0, Math.log2(t * 30)) * 9).toFixed(1)} 0`); boat.setAttribute("opacity", t >= 8 ? "0" : t >= 1 ? "0.4" : "1");
      const nd = Math.max(0, Math.round(Math.log2(t * 125)));
      const ndTxt = nd === 0 ? "No filter needed in daylight." : `In daylight at f/11 and ISO 100 the meter gives about 1/125 s, so this needs roughly ${nd} stop${nd > 1 ? "s" : ""} of ND${nd >= 11 ? " (more than a 10-stop filter gives: stack a 3-stop with it, or wait for lower light)" : nd >= 9 ? " (a 10-stop filter)" : nd >= 5 ? " (a 6-stop filter, or more)" : nd >= 2 ? " (a 3-stop filter, or a polariser and a smaller aperture)" : ""}.`;
      say((t <= 1/125 ? "<b>Fast shutter.</b> Every wave is frozen. The boat is sharp. " : t < 1 ? "<b>Slower.</b> Wave crests start to streak. " : t < 8 ? "<b>Seconds.</b> The sea turns to texture and the moving boat has vanished into a ghost. " : "<b>Long exposure.</b> Water flattens to mist, clouds stretch into streaks, anything moving disappears. Only the rocks and pier stay sharp. ") + ndTxt);
    };
    inp.oninput = draw; draw(); return box;
  }

  function horizon(box, cap) {
    box.setAttribute("aria-label", "Horizon placement");
    const W = 1000, H = 640;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "hsvg", role: "img", "aria-label": "A landscape with a movable horizon" });
    const defs = sv("defs", {});
    const gs = sv("linearGradient", { id: "hsky", x1: 0, y1: 0, x2: 0, y2: 1 });
    [["0", "#1d2a44"], ["0.6", "#8f7d93"], ["1", "#f0b48a"]].forEach(([o, c]) => gs.append(sv("stop", { offset: o, "stop-color": c })));
    const gl = sv("linearGradient", { id: "hland", x1: 0, y1: 0, x2: 0, y2: 1 });
    [["0", "#2b3a33"], ["1", "#0e1412"]].forEach(([o, c]) => gl.append(sv("stop", { offset: o, "stop-color": c })));
    defs.append(gs, gl); svg.append(defs);
    const sky = sv("rect", { x: 0, y: 0, width: W, fill: "url(#hsky)" });
    const sun = sv("circle", { r: 34, fill: "#ffd9a8" });
    const clouds = sv("g", { fill: "rgba(255,240,230,.18)" });
    [[180, .3, 120], [520, .18, 160], [800, .4, 110]].forEach(([cx, fy, rw]) => clouds.append(sv("ellipse", { cx, rx: rw, ry: 16, "data-fy": fy })));
    const land = sv("rect", { x: 0, width: W, fill: "url(#hland)" });
    const hills = sv("path", { fill: "#34463c" });
    const rocks = sv("path", { fill: "#0a0d0c" });
    const hl = sv("line", { x1: 0, x2: W, class: "gl axis" });
    const thirds = sv("g", {}); [1/3, 2/3].forEach(t => thirds.append(sv("line", { x1: 0, x2: W, y1: H * t, y2: H * t, class: "gl faint" })));
    svg.append(sky, clouds, sun, land, hills, rocks, thirds, hl);
    const view = el("div", "gview"); view.style.aspectRatio = (W / H).toFixed(4); view.append(svg); box.append(view);
    const row = el("div", "exp-row"); row.style.marginTop = "18px";
    const lab = el("label", null, "Horizon"); const inp = el("input"); inp.type = "range"; inp.min = 18; inp.max = 82; inp.value = 66; inp.id = "hz" + Math.random().toString(36).slice(2, 6); lab.htmlFor = inp.id;
    const out = el("output"); row.append(lab, inp, out); box.append(row, cap);
    const draw = () => {
      const t = +inp.value / 100, y = H * t;
      sky.setAttribute("height", y); land.setAttribute("y", y); land.setAttribute("height", H - y);
      sun.setAttribute("cx", 690); sun.setAttribute("cy", y - 46);
      [...clouds.children].forEach(c => c.setAttribute("cy", y * +c.getAttribute("data-fy")));
      hills.setAttribute("d", `M0 ${y}L0 ${y - 30}Q160 ${y - 70} 300 ${y - 26}T600 ${y - 18}Q760 ${y - 60} 1000 ${y - 22}V${y}Z`);
      const fy = y + (H - y) * 0.55;
      rocks.setAttribute("d", `M0 ${H}V${fy}Q90 ${fy - 40} 170 ${fy + 10}Q260 ${fy - 18} 330 ${fy + 30}L420 ${H}Z M760 ${H}L820 ${fy + 40}Q900 ${fy} 1000 ${fy + 16}V${H}Z`);
      hl.setAttribute("y1", y); hl.setAttribute("y2", y);
      let name, text;
      if (t < 0.42) { name = "High horizon"; text = "<b>High horizon.</b> Two thirds land. Use it when the foreground is the story: rocks, patterns, water, a path leading in."; }
      else if (t <= 0.58) { name = "Centred"; text = "<b>Centred horizon.</b> Balanced and still. It works for reflections and symmetry, and tends to feel static anywhere else."; }
      else { name = "Low horizon"; text = "<b>Low horizon.</b> Two thirds sky. Use it when the sky is doing something worth showing."; }
      out.textContent = Math.round(100 - t * 100) + "% up"; svg.setAttribute("aria-label", name + " landscape"); cap.innerHTML = text;
    };
    inp.oninput = draw; draw();
    return box;
  }


  /* ---------- try this, self-check, cheat sheet ---------- */
  function parseQuiz(text) {
    const qs = []; let q = null;
    (text || "").replace(/\r/g, "").split("\n").map(x => x.trim()).filter(Boolean).forEach(line => {
      if (/^q:/i.test(line)) { q = { q: line.replace(/^q:\s*/i, ""), opts: [] }; qs.push(q); }
      else if (q && /^[*-]\s+/.test(line)) q.opts.push({ t: line.replace(/^[*-]\s+/, ""), ok: line[0] === "*" });
    });
    return qs.filter(x => x.q && x.opts.length >= 2 && x.opts.some(o => o.ok));
  }
  function extras(target, l) {
    if (l.challenge) {
      const c = el("section", "try"); c.append(el("p", "eyebrow", "Try this"), el("p", "try-t", l.challenge)); target.append(c);
    }
    const qs = parseQuiz(l.quiz);
    if (qs.length) {
      const sec = el("section", "quiz"); sec.append(el("p", "eyebrow", "Quick check"));
      let right = 0, answered = 0; const score = el("p", "quiz-score");
      qs.forEach((x, qi) => {
        for (let i = x.opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x.opts[i], x.opts[j]] = [x.opts[j], x.opts[i]]; }
        const block = el("div", "quiz-q"); block.append(el("p", "quiz-qt", (qi + 1) + ". " + x.q));
        const opts = el("div", "quiz-opts"); const fb = el("p", "quiz-fb");
        x.opts.forEach(o => {
          const b = el("button", "quiz-o", o.t); b.type = "button";
          b.onclick = () => {
            if (block.dataset.done) return; block.dataset.done = "1"; answered++;
            [...opts.children].forEach((bb, k) => { bb.disabled = true; if (x.opts[k].ok) bb.classList.add("ok"); });
            if (o.ok) { right++; b.classList.add("ok"); fb.textContent = "Correct."; }
            else { b.classList.add("no"); fb.textContent = "Not quite. The right answer is highlighted."; }
            if (answered === qs.length) score.textContent = right + " out of " + qs.length + (right === qs.length ? ". Well done." : ".");
          };
          opts.append(b);
        });
        block.append(opts, fb); sec.append(block);
      });
      sec.append(score); target.append(sec);
    }
    if (cheatSections(l).length) {
      const pr = el("div", "print-row"); const pb = el("button", "b", "Print cheat sheet"); pb.type = "button";
      pb.onclick = () => printCheat(l); pr.append(pb); target.append(pr);
    }
  }
  /* ---------- printable one-page cheat sheet ---------- */
  function cheatSections(l) {
    // Optional hand-written sheet: "## Heading" then "- item" lines
    const src = (l.cheat || "").trim();
    const secs = [];
    if (src) {
      let cur = null;
      src.replace(/\r/g, "").split("\n").map(x => x.trim()).filter(Boolean).forEach(x => {
        if (x.startsWith("## ")) { cur = { h: x.slice(3), items: [], num: false }; secs.push(cur); }
        else if (/^([-*]|\d+\.) /.test(x)) { if (!cur) { cur = { h: "Key points", items: [], num: false }; secs.push(cur); } if (/^\d+\./.test(x)) cur.num = true; cur.items.push(x.replace(/^([-*]|\d+\.)\s+/, "")); }
      });
      return secs;
    }
    // Otherwise build it from the lesson: each section's lists, cut down to their first sentence
    const short = t => {
      const m = t.match(/^\*\*([^*]+)\*\*\s*(.*)$/);
      const first = x => { const k = x.search(/\.\s+[A-Z]/); return (k > 0 ? x.slice(0, k + 1) : x).replace(/\.$/, ""); };
      if (m) { const rest = first(m[2]).replace(/^[,:;]\s*/, ""); return "**" + m[1].replace(/[.:,]\s*$/, "") + (rest ? ":** " + rest : "**"); }
      return first(t);
    };
    let head = "Key points";
    (l.body || "").replace(/\r/g, "").split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).forEach(b => {
      if (b.startsWith("## ")) { head = b.slice(3); return; }
      const lines = b.split("\n").map(x => x.trim());
      const num = lines.every(x => /^\d+\. /.test(x)), bul = lines.every(x => /^[-*] /.test(x));
      if (!num && !bul) return;
      if (lines.filter(x => / = /.test(x)).length * 2 > lines.length) return; // a list of sums is a worked example, not a checklist
      const items = lines.map(x => { const t = x.replace(/^([-*]|\d+\.)\s+/, ""); return num && t.length <= 150 ? t.replace(/\.$/, "") : short(t); }).slice(0, num ? 8 : 6);
      const last = secs[secs.length - 1];
      if (last && last.h === head) last.items.push(...items); else secs.push({ h: head, items, num });
    });
    // Practical sections first, and keep it to one page
    const rank = h => /worked|example|scenario/i.test(h) ? 9 : /method|step|field|setting|need|kit|mistake|check|working out|exposure/i.test(h) ? 0 : /further/i.test(h) ? 2 : 1;
    const order = secs.map((x, i) => [x, i]).sort((a, b) => rank(a[0].h) - rank(b[0].h) || a[1] - b[1]).map(x => x[0]);
    const out = []; let budget = 2400;
    for (const x of order) {
      const cost = x.h.length + x.items.reduce((n, t) => n + t.length + 20, 0);
      if (rank(x.h) === 9 || out.length >= 6 || cost > budget) continue;
      out.push(x); budget -= cost;
    }
    return secs.filter(x => out.includes(x));
  }
  function printCheat(l) {
    const old = document.getElementById("cheat"); if (old) old.remove();
    const c = el("div"); c.id = "cheat";
    const head = el("header", "ch-head");
    const idx = lessons.indexOf(l);
    head.append(el("p", "ch-name", [siteName, learnTitle].filter(Boolean).join(" \u00b7 ")), el("p", "ch-no", "Lesson " + pad(idx + 1) + " of " + pad(lessons.length)));
    c.append(head, el("h1", null, l.title));
    if (l.summary) c.append(el("p", "ch-sum", l.summary));
    const grid = el("div", "ch-grid"), colA = el("div", "ch-col"), colB = el("div", "ch-col");
    grid.append(colA, colB);
    const boxes = cheatSections(l).map(x => {
      const box = el("section", "ch-box"); box.append(el("h2", null, x.h));
      const list = el(x.num ? "ol" : "ul");
      x.items.forEach(t => { const li = el("li"); li.innerHTML = inline(t); list.append(li); });
      box.append(list); return box;
    });
    c.append(grid);
    const foot = el("div", "ch-end");
    const q = ((l.body || "").match(/^>\s?(.+)$/m) || [])[1];
    if (q) foot.append(el("blockquote", null, q));
    if (l.challenge) { const t = el("div", "ch-try"); t.append(el("h2", null, "Try this"), el("p", null, l.challenge)); foot.append(t); }
    c.append(foot);
    c.append(el("p", "ch-foot", (location.hostname ? location.hostname + "/#l/" + l.id : "")));
    document.body.append(c); document.body.classList.add("cheat-print");
    // Lay the boxes out in two fixed columns (browsers balance print columns unpredictably),
    // then measure the whole sheet and shrink it if it would run onto a second page.
    // The target leaves room for US Letter paper and browser headers and footers.
    c.classList.add("measure");
    boxes.forEach(bx => colA.append(bx));
    const hs = boxes.map(bx => bx.offsetHeight); colA.textContent = "";
    let ha = 0, hb = 0;
    boxes.forEach((bx, i) => { if (ha <= hb) { colA.append(bx); ha += hs[i]; } else { colB.append(bx); hb += hs[i]; } });
    const mm = 96 / 25.4, room = 245 * mm, h = c.offsetHeight;
    c.classList.remove("measure");
    c.style.zoom = h > room ? (room / h).toFixed(3) : "";
    const done = () => { c.remove(); document.body.classList.remove("cheat-print"); removeEventListener("afterprint", done); };
    addEventListener("afterprint", done);
    try { window.print(); } catch (e) {}
  }

  /* ---------- contents list for longer lessons ---------- */
  function toc(root) {
    const hs = [...root.querySelectorAll(":scope > h2")]; if (hs.length < 6) return;
    const nav = el("nav", "toc"); nav.setAttribute("aria-label", "In this lesson"); nav.append(el("p", "eyebrow", "In this lesson"));
    const ol = el("ol");
    hs.forEach((h, i) => { h.id = "s" + (i + 1); const b = el("button", null, h.textContent); b.type = "button";
      b.onclick = () => { const r = $("reader"); r.scrollTo({ top: h.getBoundingClientRect().top - r.getBoundingClientRect().top + r.scrollTop - 84, behavior: "smooth" }); };
      const li = el("li"); li.append(b); ol.append(li); });
    nav.append(ol); root.prepend(nav);
  }
  /* ---------- glossary ---------- */
  let glPop = null;
  function linkGlossary(root) {
    if (!glossary.length) return;
    const used = new Set();
    const terms = glossary.slice().sort((a, b) => b.term.length - a.term.length);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => {
      const p = n.parentElement; if (!p || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (p.closest(".exp, h2, button, figure, blockquote, .quiz, .try, .gl-term")) return NodeFilter.FILTER_REJECT;
      return p.closest("p, li") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      let text = node.nodeValue;
      for (const g of terms) {
        if (used.has(g.term.toLowerCase())) continue;
        const re = new RegExp("\\b(" + g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(s?)\\b", "i");
        const m = re.exec(text); if (!m) continue;
        used.add(g.term.toLowerCase());
        const before = text.slice(0, m.index), word = m[0], after = text.slice(m.index + word.length);
        const b = el("button", "gl-term", word); b.type = "button"; b.dataset.term = g.term; b.setAttribute("aria-expanded", "false");
        b.onclick = e => { e.stopPropagation(); showGloss(b, g); };
        const parent = node.parentNode;
        parent.insertBefore(document.createTextNode(before), node);
        parent.insertBefore(b, node);
        node.nodeValue = after; text = after;
      }
    });
  }
  function showGloss(btn, g) {
    if (glPop && glPop._for === btn) { hideGloss(); return; }
    hideGloss();
    const pop = el("div", "gl-pop"); pop.setAttribute("role", "dialog"); pop.append(el("b", null, g.term), el("p", null, g.def));
    pop._for = btn; btn.setAttribute("aria-expanded", "true");
    $("reader").append(pop);
    const r = btn.getBoundingClientRect(), R = $("reader").getBoundingClientRect();
    const w = Math.min(320, R.width - 32); pop.style.width = w + "px";
    let left = r.left - R.left + r.width / 2 - w / 2; left = Math.max(16, Math.min(R.width - w - 16, left));
    pop.style.left = left + "px"; pop.style.top = (r.bottom - R.top + $("reader").scrollTop + 8) + "px";
    glPop = pop;
  }
  function hideGloss() { if (glPop) { glPop._for.setAttribute("aria-expanded", "false"); glPop.remove(); glPop = null; } }
  document.addEventListener("click", e => { if (glPop && !glPop.contains(e.target)) hideGloss(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") hideGloss(); });

  window.Learn = { init, open, close, isOpen: () => !$("reader").hidden };
})();
