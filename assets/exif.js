/* Minimal EXIF reader for JPEG. Reads camera, lens and exposure settings only.
   GPS and other personal data are never read. Returns {} when nothing is found. */
(function (root) {
  "use strict";
  function readExif(buf) {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return {};
    let off = 2;
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xFF00) !== 0xFF00) break;
      const len = v.getUint16(off + 2);
      if (marker === 0xFFE1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
      if (marker === 0xFFDA) break;
      off += 2 + len;
    }
    return {};
  }
  function parseTiff(v, t) {
    const le = v.getUint16(t) === 0x4949;
    const u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le), s32 = o => v.getInt32(o, le);
    const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    function ifd(start) {
      const out = {}; if (start <= 0 || t + start + 2 > v.byteLength) return out;
      const n = u16(t + start);
      for (let i = 0; i < n; i++) {
        const e = t + start + 2 + i * 12; if (e + 12 > v.byteLength) break;
        const tag = u16(e), type = u16(e + 2), count = u32(e + 4), size = (SIZES[type] || 1) * count;
        const p = size > 4 ? t + u32(e + 8) : e + 8;
        if (p + size > v.byteLength) continue;
        let val;
        if (type === 2) { let s = ""; for (let k = 0; k < count; k++) { const c = v.getUint8(p + k); if (!c) break; s += String.fromCharCode(c); } val = s.trim(); }
        else if (type === 3) val = u16(p);
        else if (type === 4) val = u32(p);
        else if (type === 5) val = u32(p + 4) ? u32(p) / u32(p + 4) : 0;
        else if (type === 10) val = s32(p + 4) ? s32(p) / s32(p + 4) : 0;
        else continue;
        out[tag] = val;
      }
      return out;
    }
    const ifd0 = ifd(u32(t + 4));
    const ex = ifd0[0x8769] ? ifd(ifd0[0x8769]) : {};
    const make = ifd0[0x010F] || "", model = ifd0[0x0110] || "";
    const camera = model ? (model.toLowerCase().startsWith(make.toLowerCase().split(" ")[0]) || !make ? model : make + " " + model) : make;
    const r = {};
    if (camera) r.camera = camera;
    if (ex[0xA434]) r.lens = ex[0xA434];
    if (ex[0x920A]) r.focal = Math.round(ex[0x920A]) + " mm";
    if (ex[0x829D]) r.aperture = "f/" + (Math.round(ex[0x829D] * 10) / 10);
    if (ex[0x829A]) { const s = ex[0x829A]; r.shutter = s >= 1 ? (Math.round(s * 10) / 10) + " s" : "1/" + Math.round(1 / s) + " s"; }
    const iso = ex[0x8827] || ex[0x8833]; if (iso) r.iso = "ISO " + iso;
    const d = ex[0x9003] || ifd0[0x0132]; if (d && /^\d{4}/.test(d)) r.year = d.slice(0, 4);
    return r;
  }
  root.readExif = readExif;
  if (typeof module !== "undefined") module.exports = readExif;
})(typeof window !== "undefined" ? window : globalThis);
