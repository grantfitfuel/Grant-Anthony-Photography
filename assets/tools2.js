/* Extra lesson tools: focal length, polariser, before/after, light planner.
   Registered on window.LearnTools and called from learn.js. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const uid = () => Math.random().toString(36).slice(2, 8);
  function slider(box, label, min, max, val, step) {
    const row = el("div", "exp-row"); row.style.marginTop = "18px";
    const lab = el("label", null, label); const inp = el("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.value = val; if (step) inp.step = step; inp.id = "t2" + uid(); lab.htmlFor = inp.id;
    const out = el("output"); row.append(lab, inp, out); box.append(row); return { inp, out };
  }
  function chips(defs, onPick, initial) {
    const row = el("div", "ctl"); row.style.marginTop = "14px";
    const btns = defs.map(([key, label]) => { const b = el("button", "chip", label); b.type = "button"; b.setAttribute("aria-pressed", key === initial); b.onclick = () => { btns.forEach(x => x.setAttribute("aria-pressed", x === b)); onPick(key); }; row.append(b); return b; });
    return row;
  }
  function frame(W, H) {
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "hsvg", role: "img" });
    const view = el("div", "gview"); view.style.aspectRatio = (W / H).toFixed(4); view.style.width = `min(100%, calc(74svh * ${(W / H).toFixed(4)}))`; view.append(svg);
    return { svg, view };
  }

  /* ---------- focal length and compression ---------- */
  function focal(box, cap) {
    const say = t => { cap.innerHTML = t; };
    box.setAttribute("aria-label", "Focal length and background compression");
    const W = 1000, H = 667, SENSOR = 36, CAM = 1.6, TREE = 2.2, BG_DIST = 450, DUNE_H = 34, DUNE_W = 260;
    const { svg, view } = frame(W, H);
    const id = "f" + uid();
    const defs = sv("defs", {});
    const gs = sv("linearGradient", { id: id + "s", x1: 0, y1: 0, x2: 0, y2: 1 }); [["0", "#4b78b8"], ["1", "#a9c7e6"]].forEach(([o, c]) => gs.append(sv("stop", { offset: o, "stop-color": c })));
    const gd = sv("linearGradient", { id: id + "d", x1: 0, y1: 0, x2: 1, y2: 0 }); [["0", "#c7642c"], ["0.55", "#e79a52"], ["1", "#f2b46d"]].forEach(([o, c]) => gd.append(sv("stop", { offset: o, "stop-color": c })));
    defs.append(gs, gd); svg.append(defs);
    svg.append(sv("rect", { width: W, height: H, fill: `url(#${id}s)` }));
    const dune = sv("path", { fill: `url(#${id}d)` }); svg.append(dune);
    const pan = sv("rect", { x: 0, width: W, fill: "#e7ddd0" }); svg.append(pan);
    const tree = sv("g", { fill: "#2a1f19", stroke: "#2a1f19", "stroke-linecap": "round" }); svg.append(tree);
    view.append(); box.append(view);
    const STEPS = [16, 24, 35, 50, 70, 100, 135, 200, 300, 400];
    const { inp, out } = slider(box, "Focal length", 0, STEPS.length - 1, 4);
    box.append(cap);
    const draw = () => {
      const f = STEPS[+inp.value];
      const d = TREE * 0.9 * f / 24;                       // walk back so the tree stays the same size in the frame
      const px = (size, dist) => W * size * f / (SENSOR * dist);
      const horizon = H * 0.42;
      const dd = d + BG_DIST;
      const dh = px(DUNE_H, dd), dw = px(DUNE_W, dd), dbase = horizon + px(CAM, dd);
      const cx = W * 0.5;
      dune.setAttribute("d", `M${cx - dw * 0.6} ${dbase} C ${cx - dw * 0.3} ${dbase - dh * 0.15}, ${cx - dw * 0.12} ${dbase - dh}, ${cx + dw * 0.05} ${dbase - dh} C ${cx + dw * 0.22} ${dbase - dh * 0.95}, ${cx + dw * 0.4} ${dbase - dh * 0.25}, ${cx + dw * 0.6} ${dbase} Z`);
      pan.setAttribute("y", dbase); pan.setAttribute("height", H - dbase);
      const th = px(TREE, d), tb = horizon + px(CAM, d), tx = W * 0.33, tw = th * 0.05;
      tree.innerHTML = `<path d="M${tx} ${tb} L${tx} ${tb - th * 0.55}" stroke-width="${tw * 2}"/>` +
        `<path d="M${tx} ${tb - th * 0.5} Q${tx - th * 0.2} ${tb - th * 0.75} ${tx - th * 0.32} ${tb - th}" stroke-width="${tw}" fill="none"/>` +
        `<path d="M${tx} ${tb - th * 0.55} Q${tx + th * 0.12} ${tb - th * 0.8} ${tx + th * 0.28} ${tb - th * 0.95}" stroke-width="${tw}" fill="none"/>` +
        `<path d="M${tx - th * 0.08} ${tb - th * 0.72} L${tx - th * 0.25} ${tb - th * 0.78}" stroke-width="${tw * 0.6}" fill="none"/>` +
        `<ellipse cx="${tx}" cy="${tb}" rx="${th * 0.22}" ry="${th * 0.02}" fill="rgba(0,0,0,.18)" stroke="none"/>`;
      out.textContent = f + " mm";
      const ratio = (f / (0.9 * TREE * f / 24 + BG_DIST)) / (16 / (0.9 * TREE * 16 / 24 + BG_DIST));
      say(`<b>${f} mm, standing about ${d < 10 ? d.toFixed(1) : Math.round(d)} m from the tree.</b> The tree stays the same size because you walk back as you zoom in. The dune ${f <= 24 ? "is a distant bump on the horizon." : f >= 200 ? "towers over it, about " + Math.round(ratio) + " times larger than at 16 mm." : "grows, about " + Math.round(ratio) + " times larger than at 16 mm."} The lens has not squashed anything: the change comes from where you stand.`);
    };
    inp.oninput = draw; draw(); return box;
  }

  /* ---------- polariser ---------- */
  function polariser(box, cap) {
    const say = t => { cap.innerHTML = t; };
    box.setAttribute("aria-label", "Polarising filter");
    const W = 1000, H = 640, hy = H * 0.5;
    const { svg, view } = frame(W, H);
    const id = "p" + uid();
    const defs = sv("defs", {});
    const gs = sv("linearGradient", { id: id + "s", x1: 0, y1: 0, x2: 0, y2: 1 }); [["0", "#5d8fcf"], ["1", "#c8dcef"]].forEach(([o, c]) => gs.append(sv("stop", { offset: o, "stop-color": c })));
    const gdeep = sv("linearGradient", { id: id + "k", x1: 0, y1: 0, x2: 0, y2: 1 }); [["0", "#1d3f78"], ["1", "#5f86b8"]].forEach(([o, c]) => gdeep.append(sv("stop", { offset: o, "stop-color": c })));
    const gw = sv("linearGradient", { id: id + "w", x1: 0, y1: 0, x2: 0, y2: 1 }); [["0", "#5b6b55"], ["1", "#26302a"]].forEach(([o, c]) => gw.append(sv("stop", { offset: o, "stop-color": c })));
    defs.append(gs, gdeep, gw); svg.append(defs);
    svg.append(sv("rect", { width: W, height: hy, fill: `url(#${id}s)` }));
    const deep = sv("rect", { width: W, height: hy, fill: `url(#${id}k)`, opacity: 0 }); svg.append(deep);
    const clouds = sv("g", { fill: "#ffffff" });
    [[220, 110, 120, 30], [300, 95, 80, 26], [640, 150, 150, 32], [720, 130, 90, 24], [860, 80, 80, 18]].forEach(([x, y, rx, ry]) => clouds.append(sv("ellipse", { cx: x, cy: y, rx, ry })));
    svg.append(clouds);
    svg.append(sv("path", { d: `M0 ${hy}L0 ${hy - 70}Q120 ${hy - 140} 260 ${hy - 60}Q380 ${hy - 120} 520 ${hy - 40}Q700 ${hy - 110} 860 ${hy - 50}Q930 ${hy - 70} 1000 ${hy - 40}V${hy}Z`, fill: "#3d5a3f" }));
    svg.append(sv("rect", { y: hy, width: W, height: H - hy, fill: `url(#${id}w)` }));
    const stones = sv("g", { fill: "#8a7a5e", opacity: 0.15 });
    [[150, 560, 70, 22], [320, 600, 90, 26], [520, 545, 60, 18], [700, 590, 110, 30], [880, 555, 70, 20], [430, 610, 50, 14]].forEach(([x, y, rx, ry]) => stones.append(sv("ellipse", { cx: x, cy: y, rx, ry })));
    svg.append(stones);
    const refl = sv("g", {});
    refl.append(sv("rect", { y: hy, width: W, height: H - hy, fill: "#c8dcef", opacity: 0.55 }));
    [[220, 110, 120, 30], [640, 150, 150, 32], [860, 80, 80, 18]].forEach(([x, y, rx, ry]) => refl.append(sv("ellipse", { cx: x, cy: 2 * hy - y, rx, ry: ry * 0.7, fill: "#ffffff", opacity: 0.6 })));
    refl.append(sv("ellipse", { cx: 760, cy: hy + 70, rx: 120, ry: 14, fill: "#ffffff", opacity: 0.8 }));
    svg.append(refl);
    box.append(view);
    const st = { sun: "side" };
    const { inp, out } = slider(box, "Rotate", 0, 90, 0);
    box.append(chips([["side", "Sun to the side"], ["behind", "Sun behind you"], ["ahead", "Facing the sun"]], k => { st.sun = k; draw(); }, "side"), cap);
    const draw = () => {
      const r = +inp.value; out.textContent = r + "°";
      const reach = st.sun === "side" ? 1 : st.sun === "behind" ? 0.25 : 0.1;
      const k = Math.pow(Math.sin(r * Math.PI / 180), 2) * reach;
      deep.setAttribute("opacity", (k * 0.85).toFixed(2));
      clouds.setAttribute("opacity", (1 - k * 0.05).toFixed(2));
      refl.setAttribute("opacity", (1 - k * 0.9).toFixed(2));
      stones.setAttribute("opacity", (0.15 + k * 0.8).toFixed(2));
      say(r < 8 ? "<b>Filter not doing much.</b> Turn the ring and watch the sky and the water." :
        st.sun === "side" ? (k > 0.8 ? "<b>Full effect.</b> With the sun at right angles to you, the sky deepens, the clouds stand out and the glare on the water disappears so you can see the stones below." : "<b>Turning.</b> The effect builds as you rotate the filter.") :
        st.sun === "behind" ? "<b>Sun behind you.</b> The effect is weaker. A polariser works best with the sun at 90 degrees to where you point the camera." :
        "<b>Facing the sun.</b> Almost no effect on the sky. Polarisers do little when you shoot towards or directly away from the sun.");
    };
    inp.oninput = draw; draw(); return box;
  }

  /* ---------- before and after ---------- */
  function beforeafter(box, cap, ph) {
    const say = t => { cap.innerHTML = t; };
    box.setAttribute("aria-label", "Before and after editing. Drag to compare.");
    const r = ph ? Math.min(2, Math.max(0.8, ph.w / ph.h)) : 1.5;
    const view = el("div", "gview ba"); view.style.aspectRatio = r.toFixed(4); view.style.width = `min(100%, calc(74svh * ${r.toFixed(4)}))`; view.style.touchAction = "none";
    if (ph) {
      const after = el("img", "gimg"); after.src = ph.file; after.alt = (ph.title || "Photograph") + ", edited";
      const wrap = el("div", "ba-before"); const before = el("img", "gimg"); before.src = ph.file; before.alt = ""; wrap.append(before);
      view.append(after, wrap);
      const handle = el("div", "ba-handle"); view.append(handle, el("span", "ba-lab l", "As shot"), el("span", "ba-lab r", "Edited"));
      let pos = 0.5;
      const set = p => { pos = Math.max(0, Math.min(1, p)); wrap.style.clipPath = `inset(0 ${(100 - pos * 100).toFixed(2)}% 0 0)`; handle.style.left = (pos * 100) + "%"; };
      let drag = false;
      const move = e => { const b = view.getBoundingClientRect(); set((e.clientX - b.left) / b.width); };
      view.addEventListener("pointerdown", e => { drag = true; view.setPointerCapture(e.pointerId); move(e); });
      view.addEventListener("pointermove", e => { if (drag) move(e); });
      view.addEventListener("pointerup", () => drag = false); view.addEventListener("pointercancel", () => drag = false);
      view.tabIndex = 0; view.addEventListener("keydown", e => { if (e.key === "ArrowLeft") set(pos - 0.05); if (e.key === "ArrowRight") set(pos + 0.05); });
      set(0.5);
    }
    box.append(view, cap);
    say("<b>Drag across the photograph.</b> A RAW file straight from the camera looks flat: low contrast, muted colour. A few small adjustments bring it back to what you saw. The “as shot” side here is simulated to show the typical difference.");
    return box;
  }

  /* ---------- light planner ---------- */
  const PLACES = [
    ["Paisley", 55.846, -4.424, "Europe/London", "Scotland"],
    ["Glasgow", 55.861, -4.25, "Europe/London", "Scotland"],
    ["Edinburgh", 55.953, -3.188, "Europe/London", "Scotland"],
    ["Aberdeen", 57.15, -2.094, "Europe/London", "Scotland"],
    ["Dundee", 56.462, -2.971, "Europe/London", "Scotland"],
    ["Stirling", 56.117, -3.937, "Europe/London", "Scotland"],
    ["Perth", 56.396, -3.437, "Europe/London", "Scotland"],
    ["Inverness", 57.478, -4.224, "Europe/London", "Scotland"],
    ["St Andrews", 56.34, -2.795, "Europe/London", "Scotland"],
    ["The Kelpies, Falkirk", 56.019, -3.755, "Europe/London", "Scotland"],
    ["North Berwick and Bass Rock", 56.058, -2.717, "Europe/London", "Scotland"],
    ["Dunnottar Castle", 56.946, -2.197, "Europe/London", "Scotland"],
    ["Loch Lomond", 56.1, -4.62, "Europe/London", "Scotland"],
    ["Glen Coe", 56.68, -5.1, "Europe/London", "Scotland"],
    ["Glen Etive", 56.59, -5.03, "Europe/London", "Scotland"],
    ["Rannoch Moor", 56.64, -4.75, "Europe/London", "Scotland"],
    ["Fort William and Ben Nevis", 56.819, -5.105, "Europe/London", "Scotland"],
    ["Glenfinnan", 56.872, -5.438, "Europe/London", "Scotland"],
    ["Oban", 56.415, -5.471, "Europe/London", "Scotland"],
    ["Eilean Donan", 57.274, -5.516, "Europe/London", "Scotland"],
    ["Cairngorms", 57.08, -3.66, "Europe/London", "Scotland"],
    ["Torridon", 57.545, -5.513, "Europe/London", "Scotland"],
    ["Loch Maree", 57.68, -5.45, "Europe/London", "Scotland"],
    ["Applecross", 57.433, -5.812, "Europe/London", "Scotland"],
    ["Assynt and Lochinver", 58.148, -5.243, "Europe/London", "Scotland"],
    ["Durness", 58.567, -4.746, "Europe/London", "Scotland"],
    ["John o' Groats", 58.644, -3.07, "Europe/London", "Scotland"],
    ["Isle of Skye, Portree", 57.413, -6.196, "Europe/London", "Scotland"],
    ["Old Man of Storr", 57.507, -6.183, "Europe/London", "Scotland"],
    ["Quiraing", 57.64, -6.27, "Europe/London", "Scotland"],
    ["Neist Point", 57.423, -6.788, "Europe/London", "Scotland"],
    ["Elgol", 57.146, -6.104, "Europe/London", "Scotland"],
    ["Isle of Mull", 56.622, -6.067, "Europe/London", "Scotland"],
    ["Iona", 56.333, -6.392, "Europe/London", "Scotland"],
    ["Isle of Arran", 55.58, -5.2, "Europe/London", "Scotland"],
    ["Islay", 55.8, -6.2, "Europe/London", "Scotland"],
    ["Luskentyre, Harris", 57.89, -6.94, "Europe/London", "Scotland"],
    ["Callanish, Lewis", 58.197, -6.745, "Europe/London", "Scotland"],
    ["South Uist", 57.25, -7.33, "Europe/London", "Scotland"],
    ["Orkney, Kirkwall", 58.981, -2.96, "Europe/London", "Scotland"],
    ["Shetland, Lerwick", 60.155, -1.145, "Europe/London", "Scotland"],
    ["Kirkcudbright, Galloway", 54.836, -4.05, "Europe/London", "Scotland"],
    ["London", 51.507, -0.128, "Europe/London", "England"],
    ["Birmingham", 52.486, -1.89, "Europe/London", "England"],
    ["Manchester", 53.48, -2.242, "Europe/London", "England"],
    ["Liverpool", 53.408, -2.991, "Europe/London", "England"],
    ["Leeds", 53.8, -1.549, "Europe/London", "England"],
    ["York", 53.958, -1.08, "Europe/London", "England"],
    ["Newcastle", 54.978, -1.618, "Europe/London", "England"],
    ["Gateshead", 54.952, -1.603, "Europe/London", "England"],
    ["Angel of the North", 54.914, -1.589, "Europe/London", "England"],
    ["Bristol", 51.455, -2.588, "Europe/London", "England"],
    ["Bath", 51.381, -2.359, "Europe/London", "England"],
    ["Oxford", 51.752, -1.258, "Europe/London", "England"],
    ["Cambridge", 52.205, 0.122, "Europe/London", "England"],
    ["Brighton", 50.822, -0.137, "Europe/London", "England"],
    ["Seven Sisters", 50.762, 0.15, "Europe/London", "England"],
    ["Durdle Door", 50.621, -2.277, "Europe/London", "England"],
    ["Old Harry Rocks", 50.643, -1.924, "Europe/London", "England"],
    ["Botallack, Cornwall", 50.14, -5.69, "Europe/London", "England"],
    ["St Ives, Cornwall", 50.211, -5.48, "Europe/London", "England"],
    ["Dartmoor, Haytor", 50.58, -3.756, "Europe/London", "England"],
    ["Stonehenge", 51.179, -1.826, "Europe/London", "England"],
    ["Cotswolds, Bibury", 51.76, -1.833, "Europe/London", "England"],
    ["New Forest", 50.872, -1.574, "Europe/London", "England"],
    ["Norfolk coast, Holkham", 52.968, 0.809, "Europe/London", "England"],
    ["Peak District, Edale", 53.367, -1.817, "Europe/London", "England"],
    ["Yorkshire Dales, Malham", 54.061, -2.152, "Europe/London", "England"],
    ["Whitby", 54.486, -0.615, "Europe/London", "England"],
    ["Lake District, Keswick", 54.601, -3.135, "Europe/London", "England"],
    ["Buttermere", 54.541, -3.276, "Europe/London", "England"],
    ["Hadrian's Wall", 55.003, -2.373, "Europe/London", "England"],
    ["Dunstanburgh Castle", 55.489, -1.595, "Europe/London", "England"],
    ["Bamburgh", 55.609, -1.71, "Europe/London", "England"],
    ["Lindisfarne", 55.669, -1.801, "Europe/London", "England"],
    ["Cardiff", 51.481, -3.179, "Europe/London", "Wales"],
    ["Conwy", 53.28, -3.828, "Europe/London", "Wales"],
    ["Eryri (Snowdonia)", 53.068, -4.076, "Europe/London", "Wales"],
    ["Anglesey, Llanddwyn", 53.138, -4.41, "Europe/London", "Wales"],
    ["Bannau Brycheiniog (Brecon Beacons)", 51.884, -3.437, "Europe/London", "Wales"],
    ["Pembrokeshire, St Davids", 51.882, -5.269, "Europe/London", "Wales"],
    ["Belfast", 54.597, -5.93, "Europe/London", "Ireland and Northern Ireland"],
    ["Giant's Causeway", 55.241, -6.512, "Europe/London", "Ireland and Northern Ireland"],
    ["Dublin", 53.35, -6.26, "Europe/Dublin", "Ireland and Northern Ireland"],
    ["Galway", 53.271, -9.057, "Europe/Dublin", "Ireland and Northern Ireland"],
    ["Connemara, Clifden", 53.489, -10.019, "Europe/Dublin", "Ireland and Northern Ireland"],
    ["Cliffs of Moher", 52.972, -9.426, "Europe/Dublin", "Ireland and Northern Ireland"],
    ["Killarney", 52.059, -9.505, "Europe/Dublin", "Ireland and Northern Ireland"],
    ["Dingle", 52.141, -10.269, "Europe/Dublin", "Ireland and Northern Ireland"],
    ["Amsterdam", 52.37, 4.895, "Europe/Amsterdam", "Europe"],
    ["Brussels", 50.85, 4.352, "Europe/Brussels", "Europe"],
    ["Bruges", 51.209, 3.225, "Europe/Brussels", "Europe"],
    ["Paris", 48.857, 2.352, "Europe/Paris", "Europe"],
    ["Mont Saint-Michel", 48.636, -1.511, "Europe/Paris", "Europe"],
    ["Provence, Valensole", 43.837, 5.983, "Europe/Paris", "Europe"],
    ["Hamburg", 53.551, 9.994, "Europe/Berlin", "Europe"],
    ["Berlin", 52.52, 13.405, "Europe/Berlin", "Europe"],
    ["Munich", 48.137, 11.576, "Europe/Berlin", "Europe"],
    ["Copenhagen", 55.676, 12.568, "Europe/Copenhagen", "Europe"],
    ["Prague", 50.075, 14.438, "Europe/Prague", "Europe"],
    ["Vienna", 48.208, 16.373, "Europe/Vienna", "Europe"],
    ["Budapest", 47.498, 19.04, "Europe/Budapest", "Europe"],
    ["Krakow", 50.065, 19.945, "Europe/Warsaw", "Europe"],
    ["Zurich", 47.377, 8.54, "Europe/Zurich", "Europe"],
    ["Zermatt", 46.02, 7.749, "Europe/Zurich", "Europe"],
    ["Dolomites", 46.6, 11.72, "Europe/Rome", "Europe"],
    ["Lake Como", 46.0, 9.26, "Europe/Rome", "Europe"],
    ["Venice", 45.441, 12.316, "Europe/Rome", "Europe"],
    ["Florence", 43.77, 11.256, "Europe/Rome", "Europe"],
    ["Tuscany, Val d'Orcia", 43.05, 11.6, "Europe/Rome", "Europe"],
    ["Rome", 41.902, 12.496, "Europe/Rome", "Europe"],
    ["Amalfi Coast", 40.634, 14.602, "Europe/Rome", "Europe"],
    ["Dubrovnik", 42.65, 18.094, "Europe/Zagreb", "Europe"],
    ["Split", 43.508, 16.44, "Europe/Zagreb", "Europe"],
    ["Plitvice Lakes", 44.88, 15.616, "Europe/Zagreb", "Europe"],
    ["Athens", 37.984, 23.728, "Europe/Athens", "Europe"],
    ["Santorini", 36.416, 25.432, "Europe/Athens", "Europe"],
    ["Barcelona", 41.388, 2.17, "Europe/Madrid", "Europe"],
    ["Madrid", 40.417, -3.704, "Europe/Madrid", "Europe"],
    ["Seville", 37.389, -5.984, "Europe/Madrid", "Europe"],
    ["Mallorca, Palma", 39.57, 2.65, "Europe/Madrid", "Europe"],
    ["Lisbon", 38.722, -9.139, "Europe/Lisbon", "Europe"],
    ["Porto", 41.15, -8.611, "Europe/Lisbon", "Europe"],
    ["Madeira, Funchal", 32.65, -16.908, "Atlantic/Madeira", "Europe"],
    ["Azores, Ponta Delgada", 37.741, -25.676, "Atlantic/Azores", "Europe"],
    ["Tenerife, Teide", 28.272, -16.642, "Atlantic/Canary", "Europe"],
    ["Lanzarote", 29.046, -13.59, "Atlantic/Canary", "Europe"],
    ["Reykjavik", 64.146, -21.942, "Atlantic/Reykjavik", "Iceland, Scandinavia and the Arctic"],
    ["Kirkjufell", 64.942, -23.307, "Atlantic/Reykjavik", "Iceland, Scandinavia and the Arctic"],
    ["Vik, south Iceland", 63.419, -19.006, "Atlantic/Reykjavik", "Iceland, Scandinavia and the Arctic"],
    ["Jokulsarlon", 64.048, -16.179, "Atlantic/Reykjavik", "Iceland, Scandinavia and the Arctic"],
    ["Faroe Islands, Torshavn", 62.009, -6.772, "Atlantic/Faroe", "Iceland, Scandinavia and the Arctic"],
    ["Oslo", 59.913, 10.752, "Europe/Oslo", "Iceland, Scandinavia and the Arctic"],
    ["Bergen", 60.391, 5.322, "Europe/Oslo", "Iceland, Scandinavia and the Arctic"],
    ["Geiranger", 62.101, 7.206, "Europe/Oslo", "Iceland, Scandinavia and the Arctic"],
    ["Lofoten", 68.15, 13.6, "Europe/Oslo", "Iceland, Scandinavia and the Arctic"],
    ["Senja", 69.3, 17.4, "Europe/Oslo", "Iceland, Scandinavia and the Arctic"],
    ["Tromso", 69.649, 18.956, "Europe/Oslo", "Iceland, Scandinavia and the Arctic"],
    ["Stockholm", 59.329, 18.069, "Europe/Stockholm", "Iceland, Scandinavia and the Arctic"],
    ["Abisko", 68.349, 18.831, "Europe/Stockholm", "Iceland, Scandinavia and the Arctic"],
    ["Helsinki", 60.169, 24.938, "Europe/Helsinki", "Iceland, Scandinavia and the Arctic"],
    ["Rovaniemi", 66.503, 25.729, "Europe/Helsinki", "Iceland, Scandinavia and the Arctic"],
    ["Svalbard, Longyearbyen", 78.223, 15.627, "Arctic/Longyearbyen", "Iceland, Scandinavia and the Arctic"],
    ["New York", 40.713, -74.006, "America/New_York", "North America"],
    ["Boston", 42.36, -71.058, "America/New_York", "North America"],
    ["Washington DC", 38.907, -77.037, "America/New_York", "North America"],
    ["Toronto", 43.653, -79.383, "America/Toronto", "North America"],
    ["Niagara Falls", 43.083, -79.074, "America/Toronto", "North America"],
    ["Chicago", 41.878, -87.63, "America/Chicago", "North America"],
    ["Banff", 51.178, -115.571, "America/Edmonton", "North America"],
    ["Vancouver", 49.283, -123.121, "America/Vancouver", "North America"],
    ["Yellowstone", 44.428, -110.588, "America/Denver", "North America"],
    ["Monument Valley", 36.998, -110.098, "America/Denver", "North America"],
    ["Grand Canyon, South Rim", 36.057, -112.14, "America/Phoenix", "North America"],
    ["Las Vegas", 36.17, -115.14, "America/Los_Angeles", "North America"],
    ["Yosemite", 37.746, -119.533, "America/Los_Angeles", "North America"],
    ["San Francisco", 37.775, -122.419, "America/Los_Angeles", "North America"],
    ["Los Angeles", 34.052, -118.244, "America/Los_Angeles", "North America"],
    ["Deadvlei, Namibia", -24.759, 15.293, "Africa/Windhoek", "Rest of the world"],
    ["Cape Town", -33.925, 18.424, "Africa/Johannesburg", "Rest of the world"],
    ["Marrakech", 31.629, -7.981, "Africa/Casablanca", "Rest of the world"],
    ["Sahara, Merzouga", 31.08, -4.01, "Africa/Casablanca", "Rest of the world"],
    ["Petra", 30.329, 35.444, "Asia/Amman", "Rest of the world"],
    ["Dubai", 25.205, 55.271, "Asia/Dubai", "Rest of the world"],
    ["Tokyo", 35.676, 139.65, "Asia/Tokyo", "Rest of the world"],
    ["Kyoto", 35.012, 135.768, "Asia/Tokyo", "Rest of the world"],
    ["Hong Kong", 22.319, 114.169, "Asia/Hong_Kong", "Rest of the world"],
    ["Singapore", 1.352, 103.82, "Asia/Singapore", "Rest of the world"],
    ["Bangkok", 13.756, 100.502, "Asia/Bangkok", "Rest of the world"],
    ["Bali", -8.409, 115.189, "Asia/Makassar", "Rest of the world"],
    ["Sydney", -33.869, 151.209, "Australia/Sydney", "Rest of the world"],
    ["Uluru", -25.344, 131.036, "Australia/Darwin", "Rest of the world"],
    ["Queenstown, New Zealand", -45.031, 168.663, "Pacific/Auckland", "Rest of the world"],
    ["Torres del Paine, Patagonia", -50.942, -72.989, "America/Punta_Arenas", "Rest of the world"],
    ["Rio de Janeiro", -22.907, -43.173, "America/Sao_Paulo", "Rest of the world"],
    ["Machu Picchu", -13.163, -72.545, "America/Lima", "Rest of the world"]
  ];
  // NOAA solar position (accurate to within a few minutes)
  function elevation(lat, lng, t) {
    const d = new Date(t), start = Date.UTC(d.getUTCFullYear(), 0, 1);
    const doy = Math.floor((t - start) / 864e5) + 1;
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    const g = 2 * Math.PI / 365 * (doy - 1 + (hour - 12) / 24);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const tst = hour * 60 + eqt + 4 * lng;
    const ha = (tst / 4 - 180) * Math.PI / 180, la = lat * Math.PI / 180;
    const cz = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha);
    return 90 - Math.acos(Math.max(-1, Math.min(1, cz))) * 180 / Math.PI;
  }
  function localMidnightUTC(dateStr, tz) {
    const [y, m, dd] = dateStr.split("-").map(Number);
    const off = tzOffsetMin(Date.UTC(y, m - 1, dd, 12), tz);
    return Date.UTC(y, m - 1, dd) - off * 60000;
  }
  function tzOffsetMin(t, tz) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t));
    const get = k => +parts.find(p => p.type === k).value;
    return (Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - Math.floor(t / 60000) * 60000) / 60000;
  }
  function crossings(lat, lng, t0) {
    const step = 60000, out = []; let prev = elevation(lat, lng, t0);
    for (let t = t0 + step; t <= t0 + 864e5; t += step) { const e = elevation(lat, lng, t); out.push([t, prev, e]); prev = e; }
    const find = (level, rising) => { for (const [t, a, b] of out) { if (rising ? (a < level && b >= level) : (a >= level && b < level)) return t; } return null; };
    let maxE = -90; for (const [, , e] of out) maxE = Math.max(maxE, e);
    let minE = 90; for (const [, , e] of out) minE = Math.min(minE, e);
    return { find, maxE, minE };
  }
  function planner(box, cap) {
    const say = t => { cap.innerHTML = t; };
    box.setAttribute("aria-label", "Golden hour and blue hour planner"); box.classList.add("planner");
    const top = el("div", "pl-ctl");
    const sel = el("select"); sel.id = "pl" + uid(); const groups = {}; PLACES.forEach(([n, , , , g], i) => { if (!groups[g]) { groups[g] = el("optgroup"); groups[g].label = g; sel.append(groups[g]); } const o = el("option", null, n); o.value = i; groups[g].append(o); });
    const lab1 = el("label", null, "Place"); lab1.htmlFor = sel.id;
    const date = el("input"); date.type = "date"; date.id = "pd" + uid(); const lab2 = el("label", null, "Date"); lab2.htmlFor = date.id;
    const now = new Date(); date.value = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    const f1 = el("div", "field"); f1.append(lab1, sel); const f2 = el("div", "field"); f2.append(lab2, date);
    top.append(f1, f2); box.append(top);
    const bar = el("div", "pl-bar"); const axis = el("div", "pl-axis"); box.append(bar, axis);
    const rows = el("div", "pl-rows"); box.append(rows, cap);
    const fmt = (t, tz) => t == null ? "None" : new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t));
    const draw = () => {
      const [name, lat, lng, tz] = PLACES[+sel.value];
      if (!date.value) return;
      const t0 = localMidnightUTC(date.value, tz);
      const c = crossings(lat, lng, t0);
      const ev = {
        bmS: c.find(-6, true), bmE: c.find(-4, true), rise: c.find(-0.833, true), gmE: c.find(6, true),
        geS: c.find(6, false), set: c.find(-0.833, false), beS: c.find(-4, false), beE: c.find(-6, false)
      };
      rows.textContent = "";
      const row = (k, v, cls) => { const r = el("div", "pl-row " + (cls || "")); r.append(el("span", null, k), el("b", null, v)); rows.append(r); };
      const range = (a, b) => (a == null && b == null) ? "None today" : fmt(a, tz) + " to " + fmt(b, tz);
      row("Morning blue hour", range(ev.bmS, ev.bmE), "blue");
      row("Morning golden hour", range(ev.bmE, ev.gmE), "gold");
      row("Sunrise", fmt(ev.rise, tz));
      row("Sunset", fmt(ev.set, tz));
      row("Evening golden hour", range(ev.geS, ev.beS), "gold");
      row("Evening blue hour", range(ev.beS, ev.beE), "blue");
      // day bar
      bar.textContent = "";
      const seg = (a, b, cls) => { if (a == null || b == null) return; const s = el("i", cls); s.style.left = ((a - t0) / 864e5 * 100) + "%"; s.style.width = Math.max(0.3, (b - a) / 864e5 * 100) + "%"; bar.append(s); };
      if (ev.rise != null && ev.set != null) seg(ev.rise, ev.set, "day");
      seg(ev.bmS, ev.bmE, "blue"); seg(ev.bmE, ev.gmE, "gold"); seg(ev.geS, ev.beS, "gold"); seg(ev.beS, ev.beE, "blue");
      if (c.minE > -0.833) { const s = el("i", "day"); s.style.left = "0"; s.style.width = "100%"; bar.prepend(s); }
      axis.textContent = ""; ["00", "06", "12", "18", "24"].forEach(h => axis.append(el("span", null, h)));
      const tzName = tz.split("/").pop().replace(/_/g, " ");
      say(c.minE > -0.833 ? `<b>The sun does not set in ${name} on this date.</b> Golden light can last for hours around midnight.` :
        c.maxE < -0.833 ? `<b>The sun does not rise in ${name} on this date.</b> Expect long blue hours around midday.` :
        `<b>Times are local to ${name}</b> (${tzName} time). Golden hour here means the sun between 6° above and 4° below the horizon; blue hour between 4° and 6° below. Times are accurate to within a few minutes. Hills and cloud change what you actually get, so arrive early.`);
    };
    sel.onchange = draw; date.onchange = draw; draw();
    return box;
  }

  window.LearnTools = { focal, polariser, beforeafter, planner, _elevation: elevation, _localMidnightUTC: localMidnightUTC, _crossings: crossings, PLACES };
})();
