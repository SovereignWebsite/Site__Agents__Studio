// Motion: the Studio's animations as data. One ES module, no dependency, no build step, Canvas 2D.
// Contract: a scene type is define(type, { defaults, seconds(vars), render(ctx, t, vars, L) }); render is a pure
// function of t (seconds from the scene's start), so scrubbing, stills and frame capture all agree. Any randomness
// is seeded. Scenes file schema: "motion.scene/v1" (see DESIGN.md). Apache-2.0. By c.motion (an AI agent).

export const SCHEMA = 'motion.scene/v1';
const TYPES = {};
export const define = (type, def) => { TYPES[type] = { defaults: {}, ...def }; };

// ---------- small helpers (shared by the types) ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
function prng(seed) {
  let s = typeof seed === 'string' ? [...seed].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) : seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${clamp(a)})`; };
const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

const THEMES = {
  ink: { dark: true, bg0: '#0b1420', bg1: '#13243a', text: '#f4f1e8', muted: '#a9b4c2', person: '#ffc857', agent: '#5fd0c5', file: '#f4f1e8' },
  paper: { dark: false, bg0: '#f8f4e9', bg1: '#ebe4d0', text: '#1d1d1b', muted: '#55544f', person: '#c27a00', agent: '#137a70', file: '#4a483f' },
};
function palette(name, over) {
  const dark = name === 'auto' ? !(matchMedia && matchMedia('(prefers-color-scheme: light)').matches) : name !== 'paper';
  const base = THEMES[dark ? 'ink' : 'paper'];
  return { ...base, ...(over && dark ? over : {}) };
}
export const PALETTE = { amber: '#ffc857', teal: '#5fd0c5', ink: '#f4f1e8', rose: '#ff8fa3', violet: '#b69cff', blue: '#7db4ff' };
const roleColour = (L, role, name) => (PALETTE[name] ? PALETTE[name] : role === 'person' ? L.c.person : role === 'file' ? L.c.file : L.c.agent);

// ---------- policy: what a buyer may change, and what stays locked ----------
const T = (max) => ({ kind: 'text', max }), ROLE = { kind: 'enum', values: ['person', 'agent', 'file'] }, COL = { kind: 'colour' };
const LOCKED = ['timings beyond the ranges given (a scene lasts 2 to 40 seconds)', 'layout and orientation', 'fonts and sizes', 'colours outside the palette', 'any variable not listed as open'];
export function enforce(type, vars) {
  const def = TYPES[type], notes = [], out = {};
  if (!def) return { vars: {}, notes: [`Unknown type "${type}".`] };
  const open = def.policy.open, src = vars && typeof vars === 'object' ? vars : {};
  const clean = (rule, val, path) => {
    const say = (m) => notes.push(`${path}: ${m}`);
    switch (rule.kind) {
      case 'text': { const s = String(val ?? '').replace(/[\u0000-\u001f]/g, ' ').trim(); if (s.length > rule.max) { say(`shortened to ${rule.max} characters`); return s.slice(0, rule.max); } return s; }
      case 'id': { const s = String(val ?? ''); if (!/^[\w-]{1,12}$/.test(s)) { say('not a short id, dropped'); return undefined; } return s; }
      case 'number': { const n = Number(val); if (val === '' || val == null || !Number.isFinite(n)) { say('not a number, dropped'); return undefined; } const c = Math.min(rule.max, Math.max(rule.min, n)); if (c !== n) say(`${n} moved to ${c} (allowed ${rule.min} to ${rule.max})`); return rule.int ? Math.round(c) : c; }
      case 'enum': { const vals = rule.values === 'actors' ? (out.actors || []).map((a) => a.id) : rule.values; if (!vals.includes(val)) { if (val != null && val !== '') say(`"${val}" is not allowed (${vals.join(', ')}), dropped`); return undefined; } return val; }
      case 'colour': { if (val == null || val === '') return undefined; if (!(val in PALETTE)) { say(`"${val}" is not in the palette (${Object.keys(PALETTE).join(', ')}), dropped`); return undefined; } return val; }
      case 'url': { try { const u = new URL(String(val), typeof location !== 'undefined' ? location.href : 'http://x.invalid/'); if (typeof location !== 'undefined' ? u.origin === location.origin : String(val).startsWith('/') || !/^[a-z]+:/i.test(String(val))) return String(val); } catch (e) { /* fall through */ } say('only an address on this site is allowed, dropped'); return undefined; }
      case 'list': {
        if (!Array.isArray(val)) { say('a list was expected, dropped'); return undefined; }
        let a = val; if (a.length > rule.max) { a = a.slice(0, rule.max); say(`kept the first ${rule.max} (most allowed)`); }
        const seen = new Set(), res = [];
        a.forEach((x, i) => { const c = clean(rule.item, x, `${path}[${i + 1}]`); if (c === undefined || c === '') return;
          if (rule.item.autoId && c && typeof c === 'object') { if (!c.id || seen.has(c.id)) c.id = rule.item.autoId + (i + 1); seen.add(c.id); }
          if (rule.item.required && !rule.item.required.every((k) => c[k] != null && c[k] !== '')) { say(`entry ${i + 1} is missing ${rule.item.required.join(' or ')}, dropped`); return; }
          res.push(c); });
        if (rule.ascending && res.some((x, i) => i && x < res[i - 1])) { res.sort((p, q) => p - q); say('put in rising order'); }
        if (res.length < rule.min) say(`needs at least ${rule.min}`);
        return res;
      }
      case 'object': {
        if (!val || typeof val !== 'object' || Array.isArray(val)) { say('an object was expected, dropped'); return undefined; }
        const o = {}; Object.keys(val).forEach((k) => { if (!(k in rule.fields)) { say(`"${k}" is locked, removed`); return; } const c = clean(rule.fields[k], val[k], `${path}.${k}`); if (c !== undefined) o[k] = c; });
        return o;
      }
    }
  };
  Object.keys(open).forEach((k) => { if (src[k] == null) return; const c = clean(open[k], src[k], k); if (c !== undefined) out[k] = c; });
  Object.keys(src).forEach((k) => { if (!(k in open) && src[k] != null && !(src[k] === '' )) notes.push(`${k}: locked, removed`); });
  return { vars: out, notes };
}
export const policy = () => ({
  schema: 'motion.policy/v1', palette: PALETTE, scene: { seconds: { min: 2, max: 40 } }, locked: LOCKED,
  types: Object.fromEntries(Object.entries(TYPES).map(([k, d]) => [k, { open: d.policy.open, locked: d.policy.locked || LOCKED }])),
});

function glow(ctx, x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(0.4, rgba(col, a * 0.35)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
}
function light(ctx, L, x, y, r, col, a = 1) {
  if (a <= 0.01 || r <= 0.2) return;
  glow(ctx, x, y, r * (L.c.dark ? 4.2 : 3), col, a * (L.c.dark ? 0.55 : 0.4));
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, rgba('#ffffff', a * 0.95)); g.addColorStop(0.35, rgba(col, a)); g.addColorStop(1, rgba(col, a * 0.85));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
}
function wrap(ctx, text, maxW) {
  const out = []; let line = '';
  for (const w of String(text).split(/\s+/)) {
    const tryLine = line ? line + ' ' + w : w;
    if (line && ctx.measureText(tryLine).width > maxW) { out.push(line); line = w; } else line = tryLine;
  }
  if (line) out.push(line);
  return out;
}
// Draws wrapped text; returns the height used. o: size, weight, col, align, a, maxW, lh, plate (backing colour)
function text(ctx, str, x, y, o = {}) {
  const size = o.size || 30, lh = (o.lh || 1.25) * size, a = o.a ?? 1;
  if (a <= 0.01 || !str) return 0;
  ctx.font = `${o.weight || 500} ${size}px ${FONT}`; ctx.textBaseline = 'top'; ctx.textAlign = o.align || 'left';
  const lines = wrap(ctx, str, o.maxW || 600), h = lines.length * lh;
  const wmax = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const left = o.align === 'center' ? x - wmax / 2 : o.align === 'right' ? x - wmax : x;
  if (o.plate) { ctx.fillStyle = rgba(o.plate, 0.72 * a); ctx.beginPath(); ctx.roundRect(left - 10, y - 5, wmax + 20, h + 8, 10); ctx.fill(); }
  ctx.fillStyle = rgba(o.col || '#ffffff', a);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  return h;
}
function backdrop(ctx, L) {
  const g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, L.c.bg0); g.addColorStop(1, L.c.bg1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.w, L.h);
  const v = ctx.createRadialGradient(L.w / 2, L.h / 2, Math.min(L.w, L.h) * 0.4, L.w / 2, L.h / 2, Math.max(L.w, L.h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, L.c.dark ? 'rgba(0,0,0,0.35)' : 'rgba(90,70,30,0.12)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, L.w, L.h);
}
function heading(ctx, L, a = 1) {
  if (L.title) text(ctx, L.title, L.w / 2, L.portrait ? 58 : 34, { size: L.portrait ? 38 : 32, weight: 700, col: L.c.text, align: 'center', maxW: L.w - 80, a: a * smooth(L.t / 0.6) });
}
function endLine(ctx, L, str, t0) {
  if (!str) return;
  const k = smooth(seg(L.t, t0, t0 + 0.9));
  text(ctx, str, L.w / 2, L.h - (L.portrait ? 150 : 100) + (1 - k) * 14, { size: L.portrait ? 36 : 32, weight: 600, col: L.c.text, align: 'center', maxW: L.w - 100, a: k, plate: L.c.bg0 });
}

// ---------- handoff ----------
define('handoff', {
  policy: { open: {
    actors: { kind: 'list', min: 2, max: 7, item: { kind: 'object', autoId: 'a', fields: { id: { kind: 'id' }, label: T(90), role: ROLE, note: T(60), colour: COL } } },
    links: { kind: 'list', min: 0, max: 12, item: { kind: 'object', required: ['from', 'to'], fields: { from: { kind: 'enum', values: 'actors' }, to: { kind: 'enum', values: 'actors' }, label: T(30), carry: T(40) } } },
    direction: { kind: 'enum', values: ['auto', 'down', 'across'] }, step: { kind: 'number', min: 0.3, max: 3 }, carry: T(80), end: T(80) } },
  defaults: { actors: [], links: null, direction: 'auto', step: null, carry: '', end: '' },
  seconds: (v) => 0.5 + Math.max(1, v.actors.length) * (v.step ?? 1.2) + 2.4,
  render(ctx, t, v, L) {
    const A = v.actors, n = A.length; backdrop(ctx, L); heading(ctx, L);
    if (!n) return;
    const idx = Object.fromEntries(A.map((a, i) => [a.id, i]));
    const links = (v.links && v.links.length ? v.links : A.slice(1).map((a, i) => ({ from: A[i].id, to: a.id }))).filter((k) => k.from in idx && k.to in idx);
    const parent = {}; links.forEach((k) => { if (!(k.to in parent)) parent[k.to] = k; });
    const depth = A.map(() => 0);
    for (let pass = 0; pass < n; pass++) A.forEach((a, i) => { const p = parent[a.id]; if (p) depth[i] = Math.min(n, depth[idx[p.from]] + 1); });
    const R = Math.max(...depth) + 1, rows = [...Array(R)].map(() => []);
    A.forEach((a, i) => rows[depth[i]].push(i));
    const down = v.direction === 'down' || (v.direction !== 'across' && L.portrait), pos = [], side = [];
    const span = down ? L.h - (L.portrait ? 420 : 260) : L.w - 300, gap = R > 1 ? Math.min(down ? 190 : 260, span / (R - 1)) : 0;
    const x0 = down ? 0 : (L.w - gap * (R - 1)) / 2, y0 = down ? (L.h - gap * (R - 1)) / 2 + (L.portrait ? 10 : 20) : 0;
    rows.forEach((row, r) => row.forEach((i, j) => {
      const m = row.length, off = (j - (m - 1) / 2);
      if (down) { pos[i] = [m === 1 ? L.w * (L.portrait ? 0.2 : 0.3) : L.w * (0.5 + off * Math.min(0.3, 0.8 / m)), y0 + r * gap]; side[i] = m === 1 ? 'right' : 'below'; }
      else { pos[i] = [x0 + r * gap, L.h * 0.46 + off * Math.min(170, (L.h - 300) / m)]; side[i] = 'below'; }
    }));
    const step = v.step ?? clamp((L.seconds - 2.9) / n, 0.35, 1.6), pd = Math.min(0.9, step * 0.85);
    const arrive = (i) => 0.5 + i * step, lastIn = arrive(n - 1);
    const rad = L.portrait ? 24 : 20, fs = L.portrait ? 30 : 26, colW = down ? Math.min(250, L.w * 0.34) : Math.min(230, gap * 0.9 || 230);
    // links first, so lights and labels sit on top of them
    links.forEach((k) => {
      const i = idx[k.to], p = idx[k.from], a = parent[k.to] === k ? arrive(i) : 0;
      if (parent[k.to] !== k) return;
      const [px, py] = pos[p], [cx, cy] = pos[i], head = smooth(seg(t, a - pd, a));
      if (head <= 0) return;
      const hx = lerp(px, cx, head), hy = lerp(py, cy, head), col = roleColour(L, A[i].role, A[i].colour), settle = 0.45 + 0.4 * (1 - smooth(seg(t, a, a + 1.2)));
      const lg = ctx.createLinearGradient(px, py, hx, hy);
      lg.addColorStop(0, rgba(col, 0.4)); lg.addColorStop(1, rgba(col, settle));
      ctx.strokeStyle = lg; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(hx, hy); ctx.stroke();
      const fade = 1 - smooth(seg(t, a, a + 0.5));
      if (fade > 0.01) glow(ctx, hx, hy, 46, col, 0.95 * fade);
      const word = k.carry ?? v.carry;
      if (word && fade > 0.01) text(ctx, word, hx + (down ? 22 : 0), hy + (down ? -14 : -50), { size: L.portrait ? 26 : 23, weight: 600, col: L.c.text, a: fade, maxW: colW + 80, plate: L.c.bg0, align: down ? 'left' : 'center' });
      if (k.label && t > a) text(ctx, k.label, (px + cx) / 2 + 14, (py + cy) / 2 - 10, { size: 22, col: L.c.muted, a: smooth(seg(t, a, a + 0.6)), maxW: 220 });
    });
    A.forEach((a, i) => {
      const t0 = arrive(i), k = smooth(seg(t, t0, t0 + 0.55)), [x, y] = pos[i], col = roleColour(L, a.role, a.colour);
      if (k <= 0) return;
      const breathe = 1 + 0.06 * Math.sin(t * 2.2 + i * 1.7), ring = seg(t, t0, t0 + 0.9);
      if (ring < 1) { ctx.strokeStyle = rgba(col, 0.8 * (1 - ring)); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, rad * (1 + ring * 2.6), 0, 6.2832); ctx.stroke(); }
      light(ctx, L, x, y, rad * k * breathe, col, k);
      const lk = smooth(seg(t, t0 + 0.2, t0 + 0.8)), dy = (1 - lk) * 10, right = side[i] === 'right';
      const lx = right ? x + rad + 22 : x, ly = (right ? y - fs * 0.62 : y + rad + 16) + dy, w = right ? L.w - lx - 30 : colW;
      const h = text(ctx, a.label, lx, ly, { size: fs, weight: 700, col: L.c.text, a: lk, maxW: w, align: right ? 'left' : 'center', plate: L.c.bg0 });
      if (a.note) text(ctx, a.note, lx, ly + h + 2, { size: fs * 0.72, col: L.c.muted, a: lk, maxW: w, align: right ? 'left' : 'center' });
    });
    endLine(ctx, L, v.end, lastIn + 0.9);
  },
});

// ---------- cell ----------
define('cell', {
  policy: { open: {
    lead: { kind: 'object', fields: { label: T(30), role: ROLE, colour: COL } },
    members: { kind: 'list', min: 0, max: 6, item: { kind: 'object', fields: { label: T(30), role: ROLE, colour: COL } } },
    files: { kind: 'list', min: 0, max: 4, item: T(20) }, growth: { kind: 'list', min: 0, max: 6, ascending: true, item: { kind: 'number', min: 1, max: 100, int: true } },
    close: { kind: 'enum', values: ['fold', 'keep', 'none'] }, unit: T(20), end: T(80) } },
  defaults: { lead: { label: 'Lead', role: 'person' }, members: [], files: [], growth: [], close: 'none', unit: 'roles', end: '' },
  seconds: (v) => 14 + (v.growth || []).length * 1.6,
  render(ctx, t, v, L) {
    backdrop(ctx, L); heading(ctx, L);
    const S = L.seconds, T = (f) => f * S, M = v.members, nM = M.length, G = v.growth || [], F = v.files || [];
    const P = L.portrait, cx = P ? L.w / 2 : L.w * 0.3, cy = P ? L.h * 0.35 : L.h * 0.5;
    const tM0 = T(0.1), tF0 = T(0.3), tG0 = T(G.length ? 0.45 : 2), tG1 = T(0.8), tFold = T(0.82), tEnd = T(0.9);
    const stageT = G.length ? (tG1 - tG0) / G.length : 1;
    const spacing = P ? 31 : 27, ringR = P ? 130 : 104;
    // how many lights are showing, as a smooth number
    let count = 1 + nM * smooth(seg(t, tM0, tM0 + 0.35 * (tF0 - tM0) + nM * 0.3));
    if (G.length && t >= tG0) {
      const ti = (t - tG0) / stageT, s = clamp(Math.floor(ti), 0, G.length - 1), prev = s ? G[s - 1] : 1 + nM;
      count = lerp(prev, G[s], smooth((ti - s) / 0.55)); if (ti >= G.length) count = G[G.length - 1];
    }
    const morph = G.length ? smooth(seg(t, tG0 - 0.3, tG0 + 0.9)) : 0, N = Math.max(...G, 1 + nM);
    const foldK = v.close === 'fold' && F.length ? smooth(seg(t, tFold, tFold + (tEnd - tFold) * 0.9)) : 0;
    const Rgrow = spacing * Math.sqrt(count) + 46, R0 = (ringR + 72) * (P ? 1 : 0.95);
    const R = lerp(R0, Math.max(Rgrow, 96), morph) * (1 - foldK * 0.75) * smooth(seg(t, 0.1, 1.2));
    // file cards (final slots first, so the lights can fly to them)
    const cw = Math.min(P ? 150 : 130, (P ? L.w * 0.9 : L.w * 0.4) / Math.max(1, F.length) - 12), ch = cw * 0.72;
    const slot = (j) => P ? [L.w / 2 + (j - (F.length - 1) / 2) * (cw + 16), L.h * 0.8] : [L.w * 0.68 + (j - (F.length - 1) / 2) * (cw + 16), L.h * 0.78];
    // membrane: a smooth blob, bulging where a member crosses it
    const lights = [];
    for (let k = 0; k < Math.max(1, Math.ceil(count)); k++) {
      const ph = k * 2.39996, pr = spacing * Math.sqrt(k + 0.5), phyllo = [Math.cos(ph) * pr, Math.sin(ph) * pr];
      let ring = [0, 0], a = 1, r = k === 0 ? rad(P, 1.1) : rad(P, 1);
      if (k >= 1 && k <= nM) {
        const ang = nM === 1 ? 0 : -Math.PI / 2 + ((k - 0.5) / nM) * 6.2832, arr = seg(t, tM0 + (k - 1) * 0.35, tM0 + (k - 1) * 0.35 + 1.2), e = easeOut(arr);
        ring = [Math.cos(ang) * ringR * e + Math.cos(ang) * (1 - e) * L.w * 0.7, Math.sin(ang) * ringR * e + Math.sin(ang) * (1 - e) * L.h * 0.5]; a = smooth(arr * 3);
        phyllo[2] = ang;
      } else if (k > nM) { a = clamp(count - k); ring = phyllo; }
      const x = cx + lerp(ring[0], phyllo[0], morph), y = cy + lerp(ring[1], phyllo[1], morph);
      lights.push({ k, x, y, a, ring, ang: phyllo[2], r: lerp(r, k === 0 ? 17 : 12, morph) });
    }
    const pts = 72; ctx.beginPath();
    for (let j = 0; j <= pts; j++) {
      const th = (j / pts) * 6.2832; let rr = R * (1 + 0.035 * Math.sin(3 * th + t * 0.9) + 0.025 * Math.sin(5 * th - t * 1.2));
      if (morph < 1) for (const m of lights) if (m.ang !== undefined && m.k <= nM && m.k >= 1) {
        const dx = m.x - cx, dy = m.y - cy, d = Math.hypot(dx, dy), da = Math.atan2(Math.sin(th - Math.atan2(dy, dx)), Math.cos(th - Math.atan2(dy, dx)));
        rr += 26 * Math.max(0, 1 - Math.abs(d - R) / 90) * Math.exp(-da * da / 0.2) * (1 - morph);
      }
      const px = cx + Math.cos(th) * rr, py = cy + Math.sin(th) * rr;
      j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    const mg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.05);
    mg.addColorStop(0, rgba(L.c.agent, 0.02)); mg.addColorStop(1, rgba(L.c.agent, L.c.dark ? 0.2 : 0.14));
    ctx.fillStyle = mg; ctx.fill();
    ctx.save(); ctx.shadowColor = rgba(L.c.agent, 0.9); ctx.shadowBlur = L.c.dark ? 28 : 10; ctx.strokeStyle = rgba(L.c.agent, 0.85 * (1 - foldK * 0.6)); ctx.lineWidth = 3.5; ctx.stroke(); ctx.restore();
    // chart of the growth steps
    if (G.length) {
      const cw0 = P ? L.w * 0.78 : L.w * 0.36, cx0 = P ? (L.w - cw0) / 2 : L.w * 0.56, cb = P ? L.h * 0.69 : L.h * 0.48, chh = P ? 120 : 130, bw = cw0 / G.length;
      const ka = smooth(seg(t, tG0 - 0.2, tG0 + 0.6)) * (1 - foldK);
      G.forEach((g, s) => {
        const reach = clamp((count - (s ? G[s - 1] : 0)) / (g - (s ? G[s - 1] : 0))), full = count >= g - 0.01, hh = Math.max(4, (g / N) * chh * (s ? 1 : 1));
        const hx = cx0 + s * bw + bw * 0.18;
        ctx.fillStyle = rgba(L.c.agent, (full ? 0.85 : 0.18 + 0.4 * reach) * ka); ctx.beginPath(); ctx.roundRect(hx, cb - hh, bw * 0.64, hh, 5); ctx.fill();
        text(ctx, String(g), hx + bw * 0.32, cb + 8, { size: P ? 26 : 22, weight: full ? 700 : 500, col: L.c.text, align: 'center', a: ka * (full ? 1 : 0.55) });
      });
      text(ctx, `${Math.round(count)} ${v.unit}`, cx0 + cw0 / 2, cb - chh - (P ? 56 : 52), { size: P ? 38 : 32, weight: 700, col: L.c.person, align: 'center', a: ka });
    }
    // files: slide out from the membrane, settle into slots
    F.forEach((f, j) => {
      const k = smooth(seg(t, tF0 + j * 0.5, tF0 + j * 0.5 + 1.1)); if (k <= 0) return;
      const [sx, sy] = slot(j), ox = cx, oy = cy + R * 0.8, x = lerp(ox, sx, k), y = lerp(oy, sy, k), pulse = foldK > 0 ? Math.sin(clamp(foldK * 1.4 - j * 0.1) * 3.14) : 0;
      glow(ctx, x, y, cw * (0.9 + pulse * 0.5), L.c.file, (0.14 + 0.5 * pulse + (foldK >= 1 ? 0.14 : 0)) * k);
      ctx.fillStyle = rgba(L.c.dark ? '#16273d' : '#fffdf6', 0.96 * k); ctx.strokeStyle = rgba(L.c.file, 0.9 * k); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(x - cw / 2, y - ch / 2, cw, ch, 10); ctx.fill(); ctx.stroke();
      for (let q = 0; q < 3; q++) { ctx.fillStyle = rgba(L.c.file, 0.4 * k); ctx.fillRect(x - cw / 2 + 14, y - ch / 2 + 16 + q * 14, (cw - 28) * (q === 2 ? 0.5 : 0.9 - 0.12 * ((j + q) % 2)), 5); }
      text(ctx, f, x, y + ch / 2 + 10, { size: P ? 28 : 24, weight: 600, col: L.c.text, align: 'center', a: k, maxW: cw + 30 });
    });
    // lights, drawn last so they glow over the membrane; folding sends each to a card
    for (const m of lights) {
      let { x, y, r } = m, a = m.a;
      if (foldK > 0 && F.length) { const [sx, sy] = slot(m.k % F.length), e = smooth(clamp(foldK * 1.6 - (m.k / (N + 1)) * 0.6)); x = lerp(x, sx, e); y = lerp(y, sy, e); r *= 1 - e * 0.8; a *= 1 - smooth(clamp((e - 0.75) * 4)); }
      const col = m.k === 0 ? roleColour(L, v.lead.role, v.lead.colour) : m.k <= nM ? roleColour(L, M[m.k - 1].role, M[m.k - 1].colour) : L.c.agent;
      light(ctx, L, x, y, r * (1 + 0.07 * Math.sin(t * 2.4 + m.k * 1.3)), col, a);
    }
    // names, while the group is small
    const ln = (1 - morph) * (1 - foldK);
    if (ln > 0.01) {
      const fs = P ? 28 : 24, lead = lights[0];
      text(ctx, v.lead.label, lead.x, lead.y + 34, { size: fs, weight: 700, col: L.c.text, align: 'center', a: ln * smooth(seg(t, 0.4, 1.2)), maxW: 170 });
      M.forEach((mem, i) => {
        const m = lights[i + 1]; if (!m) return; const dx = Math.cos(m.ang), al = ln * smooth(seg(t, tM0 + i * 0.35 + 0.9, tM0 + i * 0.35 + 1.6));
        const out = P ? L.w : L.w * 0.6, ax = dx > 0.35 ? 'left' : dx < -0.35 ? 'right' : 'center';
        const lx = ax === 'left' ? m.x + 34 : ax === 'right' ? m.x - 34 : m.x, ly = Math.abs(dx) > 0.35 ? m.y - fs * 0.6 : m.y + (Math.sin(m.ang) < 0 ? -fs * 2 - 24 : 34);
        text(ctx, mem.label, lx, ly, { size: fs, weight: 600, col: L.c.text, align: ax, a: al, maxW: Math.min(210, ax === 'left' ? out - lx - 10 : ax === 'right' ? lx - 10 : 210), plate: L.c.bg0 });
      });
    }
    endLine(ctx, L, v.end, tEnd);
  },
});
function rad(P, k) { return (P ? 24 : 20) * k; }

// ---------- title and count ----------
define('title', {
  policy: { open: { text: T(80), sub: T(100) } },
  defaults: { text: '', sub: '' },
  seconds: () => 3,
  render(ctx, t, v, L) {
    backdrop(ctx, L);
    const k = smooth(seg(t, 0, 0.7)), P = L.portrait;
    glow(ctx, L.w / 2, L.h * 0.36, Math.min(L.w, L.h) * 0.55, L.c.person, 0.16 * k);
    const h = text(ctx, v.text, L.w / 2, L.h * 0.4 - (1 - k) * -14, { size: P ? 68 : 62, weight: 800, col: L.c.text, align: 'center', maxW: L.w - 100, a: k, lh: 1.15 });
    text(ctx, v.sub, L.w / 2, L.h * 0.4 + h + 24, { size: P ? 32 : 28, col: L.c.muted, align: 'center', maxW: L.w - 120, a: smooth(seg(t, 0.5, 1.3)) });
  },
});
define('count', {
  policy: { open: { from: { kind: 'number', min: 0, max: 1000000, int: true }, to: { kind: 'number', min: 0, max: 1000000, int: true }, unit: T(20), label: T(60), lines: { kind: 'list', min: 0, max: 4, item: T(60) } } },
  defaults: { from: 0, to: 0, unit: '', label: '', lines: null },
  seconds: () => 5,
  render(ctx, t, v, L) {
    backdrop(ctx, L); heading(ctx, L);
    const k = easeOut(seg(t, 0.3, 2.4)), n = Math.round(lerp(v.from, v.to, k)), P = L.portrait, a = smooth(seg(t, 0, 0.6));
    glow(ctx, L.w / 2, L.h * 0.4, Math.min(L.w, L.h) * 0.5, L.c.agent, 0.15 * a);
    text(ctx, String(n), L.w / 2, L.h * 0.28, { size: P ? 190 : 170, weight: 800, col: L.c.person, align: 'center', a });
    text(ctx, [v.unit, v.label].filter(Boolean).join(' '), L.w / 2, L.h * 0.28 + (P ? 230 : 205), { size: P ? 40 : 34, weight: 600, col: L.c.text, align: 'center', maxW: L.w - 100, a });
    (v.lines || []).forEach((ln, i) => text(ctx, ln, L.w / 2, L.h * 0.62 + i * (P ? 54 : 46), { size: P ? 32 : 28, col: L.c.muted, align: 'center', maxW: L.w - 100, a: smooth(seg(t, 2 + i * 0.35, 2.8 + i * 0.35)) }));
  },
});

// ---------- validation and the player ----------
export function validate(data) {
  if (!data || typeof data !== 'object') return 'This is not a scenes file: it is not a JSON object.';
  if (data.schema !== SCHEMA) return `This player reads "${SCHEMA}", but the file says "${data.schema}".`;
  if (!Array.isArray(data.scenes) || !data.scenes.length) return 'The file has no scenes.';
  for (let i = 0; i < data.scenes.length; i++) {
    const s = data.scenes[i];
    if (!s || !TYPES[s.type]) return `Scene ${i + 1} has the type "${s && s.type}", which this player does not know. Known types: ${Object.keys(TYPES).join(', ')}.`;
    if (s.vars != null && (typeof s.vars !== 'object' || Array.isArray(s.vars))) return `Scene ${i + 1}: "vars" must be an object.`;
    const v = s.vars || {};
    if (['handoff', 'cell'].includes(s.type) && ((s.type === 'handoff' && v.actors != null && !Array.isArray(v.actors)) || (s.type === 'cell' && ['members', 'files', 'growth'].some((k) => v[k] != null && !Array.isArray(v[k])))))
      return `Scene ${i + 1}: a list is expected where the file gives something else.`;
  }
  return '';
}
const prepare = (data, notes) => {
  let start = 0;
  return data.scenes.map((s, i) => {
    const def = TYPES[s.type], ef = enforce(s.type, s.vars || {}); ef.notes.forEach((n) => notes.push(`Scene ${i + 1}, ${n}`));
    const vars = { ...def.defaults, ...ef.vars };
    const seconds = clamp(Number(s.seconds) || def.seconds(vars), 2, 40), o = { ...s, i, def, vars, seconds, start };
    o.still = s.still != null ? s.still : seconds * 0.9; start += seconds; return o;
  });
};
function el_(tag, props = {}, kids = []) { const e = Object.assign(document.createElement(tag), props); kids.forEach((k) => e.append(k)); return e; }

export function play(el, data, opts = {}) {
  const S = { notes: [], say: false, voice: false, data: null, scenes: [], total: 0, t: 0, playing: false, raf: 0, last: 0, idx: -1, dead: false };
  const fail = (msg) => { el.replaceChildren(el_('p', { className: 'bad', role: 'alert', textContent: msg })); throw new Error(msg); };
  const err = validate(data); if (err) fail(err);
  el.textContent = ''; el.classList.add('player');
  const canvas = el_('canvas', { role: 'img' }), ctx = canvas.getContext('2d');
  const cap = el_('p', { className: 'cap' }); cap.setAttribute('aria-live', 'polite');
  const mk = (txt, fn, cls = '') => el_('button', { type: 'button', textContent: txt, className: cls, onclick: fn });
  const bPlay = mk('Play', () => (S.playing ? pause() : (S.t >= S.total - 0.05 && (S.t = 0), start()))), bReplay = mk('Replay', () => { S.t = 0; start(); });
  const bVoice = mk('Voice: off', () => { S.voice = !S.voice; bVoice.textContent = 'Voice: ' + (S.voice ? 'browser' : 'off'); bVoice.setAttribute('aria-pressed', String(S.voice)); if (S.voice) { S.say = true; S.idx = -1; draw(); } else hush(); });
  bVoice.setAttribute('aria-pressed', 'false'); bVoice.hidden = !('speechSynthesis' in window);
  let audio = null; const hush = () => { try { speechSynthesis.cancel(); if (audio) audio.pause(); } catch (e) { /* no speech here */ } };
  const announce = (sc) => {
    if (!S.voice) return; hush();
    try {
      if (sc.audio && new URL(sc.audio, location.href).origin === location.origin) { audio = new Audio(sc.audio); audio.play().catch(() => {}); return; }
      if (sc.narration) { const u = new SpeechSynthesisUtterance(sc.narration); u.lang = 'en-GB'; speechSynthesis.speak(u); }
    } catch (e) { /* speech is optional */ }
  };
  const bBack = mk('Back', () => step(-1)), bNext = mk('Next', () => step(1));
  const id = 'mo' + Math.random().toString(36).slice(2, 7);
  const seek = el_('input', { type: 'range', id, min: 0, max: 1, step: 0.05, value: 0 }), seekL = el_('label', { className: 'vh', htmlFor: id, textContent: 'Position in the film' });
  const time = el_('output', { htmlFor: id }), chips = el_('div', { className: 'bar' }); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Scenes');
  const bar = el_('div', { className: 'bar', role: 'group' }, [bPlay, bReplay, bBack, bNext, bVoice, seekL, seek, time]); bar.setAttribute('aria-label', 'Controls');
  const stage = el_('div', { className: 'stage' }, [canvas]); el.append(stage, cap, bar, chips);
  const rmq = matchMedia('(prefers-reduced-motion: reduce)'), cq = matchMedia('(prefers-color-scheme: dark)');
  const reduced = () => (opts.reduced != null ? opts.reduced : rmq.matches);
  const FORMS = { portrait: { w: 720, h: 1280 }, landscape: { w: 1280, h: 720 } };
  const orient = () => (opts.orientation && opts.orientation !== 'auto' ? opts.orientation : (stage.clientWidth || 800) < 700 ? 'portrait' : 'landscape');
  const fmt = () => opts.format || FORMS[orient()];
  const theme = () => opts.theme || S.data.theme || 'auto';
  const sceneAt = (t) => { let k = S.scenes.length - 1; for (let i = 0; i < S.scenes.length; i++) if (t < S.scenes[i].start + S.scenes[i].seconds) { k = i; break; } return S.scenes[k]; };
  const stillT = (sc) => sc.start + sc.still;

  function size() {
    const f = fmt(), r = f.w / f.h, dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.cssText = `display:block;margin:0 auto;height:auto;aspect-ratio:${f.w}/${f.h};width:${f.h > f.w ? `min(100%,${(82 * r).toFixed(1)}vh)` : '100%'}`;
    const w = Math.max(1, canvas.clientWidth || el.clientWidth || f.w), bw = Math.round(w * dpr); const bh = Math.round(bw / r); if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  }
  function draw() {
    if (S.dead) return; const f = fmt(), sc = sceneAt(S.t), local = clamp(S.t - sc.start, 0, sc.seconds);
    const L = { w: f.w, h: f.h, portrait: f.h > f.w, c: palette(theme(), S.data.palette), t: local, seconds: sc.seconds, id: sc.id || String(sc.i), title: sc.title || '' };
    const k = canvas.width / f.w; ctx.setTransform(k, 0, 0, k, 0, 0); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, f.w, f.h); ctx.clip();
    sc.def.render(ctx, local, sc.vars, L); ctx.restore();
    if (sc.i !== S.idx) {
      S.idx = sc.i; if (S.playing || S.say) announce(sc); S.say = false; cap.textContent = sc.narration || sc.title || '';
      canvas.setAttribute('aria-label', `${S.data.title || 'Film'}, scene ${sc.i + 1} of ${S.scenes.length}: ${sc.title || sc.type}`);
      [...chips.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === sc.i)));
    }
    seek.value = S.t; time.textContent = `${S.t.toFixed(1)} s of ${S.total.toFixed(0)} s`;
    bPlay.textContent = S.playing ? 'Pause' : 'Play'; bBack.disabled = sc.i === 0; bNext.disabled = sc.i === S.scenes.length - 1;
  }
  function tick(now) {
    if (!S.playing) return; S.t = Math.min(S.total, S.t + (now - S.last) / 1000); S.last = now; draw();
    if (S.t >= S.total) { S.playing = false; draw(); return; } S.raf = requestAnimationFrame(tick);
  }
  function start() { if (reduced()) return; S.playing = true; S.last = performance.now(); cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(tick); draw(); }
  function pause() { S.playing = false; hush(); cancelAnimationFrame(S.raf); draw(); }
  function step(d) { S.say = true; const i = clamp(sceneAt(S.t).i + d, 0, S.scenes.length - 1); S.t = stillT(S.scenes[i]); draw(); }
  function mode() {
    const r = reduced(); [bPlay, bReplay, seek, seekL, time].forEach((e) => { e.hidden = r; }); [bBack, bNext].forEach((e) => { e.hidden = !r; });
    if (r) { pause(); S.t = stillT(sceneAt(S.t)); }
  }
  function load(d) {
    const e = validate(d); if (e) fail(e);
    S.data = d; S.notes = []; S.scenes = prepare(d, S.notes); S.total = S.scenes.reduce((a, s) => a + s.seconds, 0); S.idx = -1; seek.max = S.total;
    chips.replaceChildren(...S.scenes.map((s) => mk(s.title || s.type, () => { S.say = true; S.t = reduced() ? stillT(s) : s.start; draw(); })));
    size(); mode();
  }
  load(data);
  const film = {
    get duration() { return S.total; },
    get notes() { return S.notes; },
    get starts() { return S.scenes.map((x) => x.start); },
    seek(t) { S.t = clamp(t, 0, S.total); draw(); }, play: start, pause,
    replay(d) { if (d) { pause(); load(d); } S.say = true; S.idx = -1; S.t = reduced() ? stillT(S.scenes[0]) : 0; draw(); start(); },
    destroy() { S.dead = true; hush(); cancelAnimationFrame(S.raf); ro.disconnect(); },
  };
  seek.oninput = () => film.seek(+seek.value);
  const ro = new ResizeObserver(() => { size(); draw(); }); ro.observe(stage);
  cq.addEventListener('change', draw); rmq.addEventListener('change', () => { mode(); draw(); });
  if (reduced()) { S.t = stillT(S.scenes[0]); draw(); } else { draw(); if (opts.autoplay !== false) start(); }
  return film;
}

if (typeof document !== 'undefined') {
  const mount = () => document.querySelectorAll('[data-motion]').forEach(async (el) => {
    try {
      const r = await fetch(el.dataset.motion); if (!r.ok) throw new Error(`The scenes file ${el.dataset.motion} could not be loaded (${r.status}).`);
      el.film = play(el, await r.json());
    } catch (e) { if (!el.querySelector('[role=alert]')) el.replaceChildren(el_('p', { className: 'bad', role: 'alert', textContent: e.message })); }
  });
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', mount) : mount();
}
