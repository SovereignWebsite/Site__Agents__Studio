// The productions player: scenes drawn with plain WebGL on the viewer's GPU, a voice track, timed captions,
// a capture button (MediaRecorder) and a teleprompter experiment (camera and microphone, local only).
// No dependencies, no network calls except this version's own files. Apache-2.0. By c.productions (an AI agent).
const N = 7000, TAU = Math.PI * 2;
const IMGS = {}; // pictures a production names (a brand logo, a cover mark), loaded once before the first frame
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const THEMES = {
  ink: { bg1: '#0b1420', bg2: '#12263a', ink: '#f4f1e8', dim: '#b9c3cc', accent: '#ffc857', pA: '#ffb347', pB: '#5fd0c5' },
  space: { bg1: '#07060f', bg2: '#151033', ink: '#f6f3ff', dim: '#bdb8d9', accent: '#ffd166', pA: '#ffb03a', pB: '#7fb7ff' },
};
function prng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SEED = new Float32Array(N * 4); { const r = prng(20261127); for (let i = 0; i < N * 4; i++) SEED[i] = r(); }

// ---- layout shared by the text layer and the particle shapes
function layout(W, H) {
  const U = Math.min(W, H) / 100, M = 8 * U, portrait = H > W;
  const top = portrait ? 0.13 * H : 0.115 * H, yA = top + 11 * U, yB = H - 17 * U;
  return { W, H, U, M, portrait, top, yA, yB, a: W / H };
}
function rowYs(n, L, max = 13) { const sp = Math.min((L.yB - L.yA) / n, max * L.U), y0 = (L.yA + L.yB) / 2 - (sp * (n - 1)) / 2; return Array.from({ length: n }, (_, k) => y0 + k * sp); }
const wx = (px, L) => (px / L.W * 2 - 1) * L.a, wy = (py, L) => 1 - py / L.H * 2;
function reveal(k, n, tl, d, still) { if (still) return 1; const step = Math.min(1.1, (0.6 * d) / Math.max(1, n)); return clamp((tl - (0.08 * d + k * step)) / 0.5); }
const count = (sc) => (sc.items || sc.names || sc.values || sc.numbers || sc.lines || []).length || 1;

// ---- particle shapes: each writes x, y, size, hue, alpha for particle i
function dust(o, s, t, L, al = 0.13) { o.x = (s[0] * 2 - 1) * L.a + 0.02 * Math.sin(t * 0.2 + s[2] * 40); o.y = s[1] * 2 - 1 + 0.02 * Math.cos(t * 0.17 + s[3] * 40); o.s = 1 + s[2] * 1.5; o.h = s[3]; o.al = al; }
function blob(o, s, cx, cy, r) { const g = Math.sqrt(-2 * Math.log(s[1] + 1e-4)) * r, an = TAU * s[2]; o.x = cx + Math.cos(an) * g; o.y = cy + Math.sin(an) * g; }
const SHAPES = {
  swirl(o, s, t, sc, L) { const r = Math.pow(s[0], 0.6) * 0.95, an = r * 5 + Math.floor(s[1] * 3) * TAU / 3 + t * 0.05 + (s[2] - 0.5) * 0.5, k = Math.min(L.a, 1) * 1.1; o.x = Math.cos(an) * r * k * (L.portrait ? 1 : 1.5); o.y = Math.sin(an) * r * (L.portrait ? 1 : 0.62); o.s = 1 + 2.2 * s[3]; o.h = s[2]; o.al = 0.42 * (1 - r * 0.6); },
  spine(o, s, t, sc, L, tl, d, still) {
    const n = count(sc), ys = rowYs(n, L), x = wx(L.M + 1.5 * L.U, L);
    if (s[3] < 0.5) { const k = Math.min(n - 1, Math.floor(s[0] * n)); blob(o, s, x, wy(ys[k], L), 0.014); o.s = 1.4 + 1.6 * s[2]; o.h = 0.1; o.al = 0.15 + 0.6 * reveal(k, n, tl, d, still); }
    else if (s[3] < 0.68) { o.x = x + (s[1] - 0.5) * 0.01; o.y = wy(ys[0] + s[0] * (ys[n - 1] - ys[0]), L); o.s = 1.4; o.h = 0.9; o.al = 0.35; }
    else dust(o, s, t, L);
  },
  ring(o, s, t, sc, L) { if (s[3] < 0.6) { const an = TAU * s[0] + t * 0.03, j = 1 + (s[1] - 0.5) * 0.09; o.x = Math.cos(an) * L.a * 0.9 * j; o.y = Math.sin(an) * 0.84 * j; o.s = 1.2 + 2 * s[2]; o.h = s[2] * 0.5; o.al = 0.34; } else dust(o, s, t, L); },
  constellation(o, s, t, sc, L, tl, d, still) {
    const n = sc.n || count(sc), cols = L.portrait ? 2 : 3, rows = Math.ceil(n / cols), ys = rowYs(rows, L, 8.5), cw = (L.W - 2 * L.M) / cols;
    if (s[3] < 0.5) { const k = Math.min(n - 1, Math.floor(s[0] * n)); blob(o, s, wx(L.M + Math.floor(k / rows) * cw + 1.2 * L.U, L), wy(ys[k % rows], L), 0.009); o.s = 1.2 + 1.5 * s[2]; o.h = 0.05 + 0.2 * s[2]; o.al = 0.7 * reveal(k, n * 1.6, tl, d, still); }
    else dust(o, s, t, L);
  },
  streams(o, s, t, sc, L) { const n = count(sc), ys = rowYs(n, L, 20), k = Math.min(n - 1, Math.floor(s[3] * n)), u = (s[0] + t * 0.025 * (0.5 + s[1])) % 1; o.x = (u * 2 - 1) * L.a; o.y = wy(ys[k] + 5.6 * L.U, L) + (s[2] - 0.5) * 0.02; o.s = 1.2 + 1.6 * s[1]; o.h = u; o.al = 0.07 + 0.4 * (1 - u) * (1 - u); },
  bars(o, s, t, sc, L, tl, d, still) {
    const v = (sc.numbers || []).map((x) => x.v || 1), n = v.length || 1, ys = rowYs(n, L, 20), mx = Math.max(...v, 1);
    if (s[3] < 0.7) { const k = Math.min(n - 1, Math.floor(s[0] * n)), len = (v[k] / mx) * (L.W - 2 * L.M) * reveal(k, n, tl, d, still); o.x = wx(L.M + s[1] * len, L); o.y = wy(ys[k] + 6.2 * L.U, L) + (s[2] - 0.5) * 0.03; o.s = 1.5 + s[2]; o.h = 0.15; o.al = 0.4; }
    else dust(o, s, t, L);
  },
  page(o, s, t, sc, L) {
    if (s[3] < 0.5) { const h = L.portrait ? 1.25 : 1.62, w = L.portrait ? L.a * 1.72 : h * 0.86, p = s[0] * 2 * (w + h); let x, y; if (p < w) { x = p - w / 2; y = h / 2; } else if (p < w + h) { x = w / 2; y = h / 2 - (p - w); } else if (p < 2 * w + h) { x = w / 2 - (p - w - h); y = -h / 2; } else { x = -w / 2; y = -h / 2 + (p - 2 * w - h); } o.x = x + (s[1] - 0.5) * 0.02; o.y = y + (s[2] - 0.5) * 0.02 + 0.03; o.s = 1.4 + s[2]; o.h = 0.8; o.al = 0.3; }
    else dust(o, s, t, L);
  },
  galaxy(o, s, t, sc, L, tl, d, still, i) {
    const suns = sc.suns || 6, planets = sc.planets ?? 117, k = Math.min(L.a, 1 / L.a) > 0.7 ? 1 : 0.8, rx = L.portrait ? L.a * 0.56 : L.a * 0.58, ry = L.portrait ? 0.5 : 0.52;
    const sun = (j) => { const an = TAU * j / suns + 0.4; return [Math.cos(an) * rx, Math.sin(an) * ry + 0.04]; };
    if (i < suns * 200) { const j = i % suns, c = sun(j); blob(o, s, c[0], c[1], 0.03 * k); o.s = 3 + 3 * s[3]; o.h = 0.02 + 0.12 * s[3]; o.al = 0.5; }
    else if (i < suns * 200 + planets * 14) {
      const p = Math.floor((i - suns * 200) / 14), j = p % suns, ring = Math.floor(p / suns), c = sun(j), q = prng(p * 7919 + 13), r = (0.085 + 0.019 * ring + 0.01 * q()) * k, an = TAU * q() + (still ? 0 : t * (0.5 + 0.5 * q()) * 0.35 / (1 + ring * 0.35));
      blob(o, s, c[0] + Math.cos(an) * r, c[1] + Math.sin(an) * r * 0.92, 0.0045); o.s = 1.6 + 1.2 * s[3]; o.h = 0.75 + 0.25 * q();
      const shown = sc.grow && !still ? planets * clamp(tl / (d * 0.75)) : planets; o.al = p < shown ? 0.85 : 0;
    } else { const r = Math.sqrt(s[0]) * 1.5 * Math.max(L.a, 1), an = TAU * s[1] + t * 0.004; o.x = Math.cos(an) * r; o.y = Math.sin(an) * r; o.s = 0.8 + 1.4 * s[2]; o.h = 0.6 + 0.4 * s[3]; o.al = 0.1 + 0.12 * s[2]; }
  },
};
const DEFAULT_SHAPE = { title: 'swirl', years: 'spine', quote: 'ring', names: 'constellation', values: 'streams', numbers: 'bars', credits: 'page', list: 'spine', stat: 'ring' };

// ---- the text layer (a 2D canvas, uploaded as one texture so a capture holds it)
function drawText(c, L, P, sc, tl, d, still, meta) {
  const { W, H, U, M } = L, T = P.theme, maxW = W - 2 * M;
  c.clearRect(0, 0, W, H);
  const font = (size, weight = 600, serif = false) => { c.font = `${weight} ${Math.round(size * U)}px ${serif ? 'Georgia, "Times New Roman", serif' : 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'}`; return size * U; };
  const wrap = (text, w) => { const out = []; let line = ''; for (const word of String(text).split(/\s+/)) { const t2 = line ? line + ' ' + word : word; if (c.measureText(t2).width > w && line) { out.push(line); line = word; } else line = t2; } if (line) out.push(line); return out; };
  const put = (text, x, y, col, al = 1, align = 'left') => { c.globalAlpha = clamp(al) * G; c.fillStyle = col; c.textAlign = align; c.fillText(text, x, y + (1 - clamp(al)) * 1.5 * U); };
  const block = (text, x, y, w, lh, col, al, align = 'left') => { const ls = wrap(text, w); ls.forEach((l, k) => put(l, x, y + k * lh, col, al, align)); return ls.length * lh; };
  const rv = (k, n) => reveal(k, n, tl, d, still);
  const G = still ? 1 : Math.min(clamp(tl / 0.35), clamp((d - tl) / 0.3));
  c.textBaseline = 'middle'; c.shadowColor = T.bg1; c.shadowBlur = 2.2 * U;
  if (meta.cam && meta.cam.mode === 'full') drawCam(c, L, meta.cam);
  // top line: the production and the scene count
  if (sc.kind === 'component') { // a soft shade under the bottom lines, so they read over any picture
    c.save(); c.shadowBlur = 0; c.globalAlpha = 1; const g = c.createLinearGradient(0, H - 20 * U, 0, H); g.addColorStop(0, 'rgba(6,10,18,0)'); g.addColorStop(1, 'rgba(6,10,18,.82)'); c.fillStyle = g; c.fillRect(0, H - 20 * U, W, 20 * U); c.restore();
  } else if (!P.brand) { font(2.3, 700); put(P.title.toUpperCase(), M, 5.5 * U, T.accent, 1); put(`${meta.i + 1} / ${meta.n}`, W - M, 5.5 * U, T.dim, 1, 'right'); }
  // branding, when the production names one: the same top line on every scene, over a soft shade
  const logo = P.brand_logo && IMGS[P.brand_logo];
  if (P.brand || logo) { c.save(); c.shadowBlur = 0; const g2 = c.createLinearGradient(0, 0, 0, 10 * U); g2.addColorStop(0, 'rgba(6,10,18,.78)'); g2.addColorStop(1, 'rgba(6,10,18,0)'); c.fillStyle = g2; c.fillRect(0, 0, W, 10 * U); c.restore();
    if (logo && P.brand_corner) { /* the chapter line has the top; no scene count */ }
    else if (logo) { const lw = (L.portrait ? 0.4 : 0.24) * W, lh = lw * logo.height / logo.width; c.shadowBlur = 0; c.globalAlpha = 1; c.drawImage(logo, (W - lw) / 2, 2.4 * U, lw, lh); font(2.3, 700); put(`${meta.i + 1} / ${meta.n}`, W - M, 2.4 * U + lh / 2, T.dim, 1, 'right'); }
    else { font(2.3, 700); put(P.brand.toUpperCase(), M, 4.6 * U, T.accent, 1); put(`${meta.i + 1} / ${meta.n}`, W - M, 4.6 * U, T.dim, 1, 'right'); } }
  const kind = sc.kind, cx = W / 2;
  if (kind === 'component') {
    // the picture is a scene component; only an optional line of words sits over it
    if (sc.caption) { const big = !!P.brand, lh = (big ? font(P.captions_in_frame ? 3.6 : 4.7, 700) : font(3.3, 500, true)) * 1.3, ls = wrap(sc.caption, maxW); c.shadowBlur = 3 * U; ls.forEach((l, k) => put(l, cx, P.captions_in_frame ? (P.brand_corner ? 5 : 11) * U + k * lh : H - (big ? 14.5 : 13.2) * U - (ls.length - 1 - k) * lh, big ? T.accent : T.ink, big ? 1 : rv(1, 3), 'center')); }
  } else if (kind === 'title') {
    const lh = font(L.portrait ? 7.4 : 7, 700) * 1.16, ls = wrap(sc.title, maxW), y0 = H * 0.46 - (ls.length - 1) * lh / 2;
    const mk = sc.mark && IMGS[sc.mark]; if (mk) { const ms = 24 * U; c.save(); c.shadowBlur = 0; c.globalAlpha = rv(0, ls.length + 2); c.drawImage(mk, cx - ms / 2, y0 - lh - ms - 2 * U, ms, ms); c.restore(); }
    ls.forEach((l, k) => put(l, cx, y0 + k * lh, T.ink, rv(k, ls.length + 2), 'center'));
    if (sc.caption) { const lh2 = font(3.5, 500) * 1.3; block(sc.caption, cx, y0 + ls.length * lh + 3 * U, maxW, lh2, T.dim, rv(ls.length + 1, ls.length + 2), 'center'); }
  } else if (kind === 'stat') {
    font(26, 800); put(sc.value, cx, H * 0.42, T.accent, rv(0, 3), 'center');
    const lh = font(4.2, 600) * 1.25; block(sc.label, cx, H * 0.42 + 19 * U, maxW, lh, T.ink, rv(1, 3), 'center');
    if (sc.small) { const lh2 = font(2.8, 500) * 1.3; block(sc.small, cx, L.yB - 2 * U, maxW, lh2, T.dim, rv(2, 3), 'center'); }
  } else {
    const lh = font(5, 700) * 1.15; block(sc.title, M, L.top, maxW, lh, T.ink, 1);
    if (kind === 'years' || kind === 'list') {
      const n = sc.items.length, ys = rowYs(n, L), x0 = M + 6 * U, yw = kind === 'years' ? 17 * U : 0;
      sc.items.forEach((it, k) => { const al = rv(k, n); if (kind === 'years') { font(4.4, 800); put(it.year, x0, ys[k], T.accent, al); } const lh2 = font(3.7, 500) * 1.2, ls = wrap(it.text || it, maxW - 6 * U - yw); ls.forEach((l, j) => put(l, x0 + yw, ys[k] + (j - (ls.length - 1) / 2) * lh2, T.ink, al)); });
    } else if (kind === 'quote') {
      const q = sc.quotes[0], lh2 = font(L.portrait ? 5.2 : 4.9, 500, true) * 1.32, ls = wrap('“' + q.quote + '”', maxW - 4 * U), y0 = (L.yA + L.yB) / 2 - 4 * U - (ls.length - 1) * lh2 / 2;
      ls.forEach((l, k) => put(l, M + 2 * U, y0 + k * lh2, T.ink, rv(k * 0.6, ls.length + 2)));
      font(3.3, 700); put(q.by, M + 2 * U, y0 + ls.length * lh2 + 2.5 * U, T.accent, rv(ls.length * 0.6 + 1, ls.length + 2));
    } else if (kind === 'names') {
      const n = sc.names.length, cols = L.portrait ? 2 : 3, rows = Math.ceil(n / cols), ys = rowYs(rows, L, 8.5), cw = maxW / cols; font(L.portrait ? 3.5 : 3.3, 600);
      sc.names.forEach((nm, k) => { const col = Math.floor(k / rows), row = k % rows; put(nm, M + col * cw + 4 * U, ys[row], T.ink, rv(k, n * 1.6)); });
    } else if (kind === 'values') {
      const n = sc.values.length, ys = rowYs(n, L, 20);
      sc.values.forEach((v, k) => { const al = rv(k, n); font(4.3, 700); put(v[0], M, ys[k] - 2.6 * U, T.ink, al); font(3.4, 700); const ow = c.measureText('over ').width; put('over', M, ys[k] + 2.6 * U, T.accent, al); font(3.6, 500); put(v[1], M + ow + U, ys[k] + 2.6 * U, T.dim, al); });
    } else if (kind === 'numbers') {
      const n = sc.numbers.length, ys = rowYs(n, L, 20);
      sc.numbers.forEach((x, k) => { const al = rv(k, n); font(7.2, 800); const w = c.measureText(x.n).width; put(x.n, M, ys[k], T.accent, al); font(3.7, 500); put(x.text, M + w + 3 * U, ys[k] + 0.6 * U, T.ink, al); });
      if (sc.small) { const lh2 = font(2.7, 500) * 1.3; block(sc.small, M, L.yB + 1.5 * U, maxW, lh2, T.dim, rv(n, n + 1)); }
    } else if (kind === 'credits') {
      const lines = sc.lines, n = lines.length; let y = L.yA + 3 * U; const lh2 = font(3.3, 500) * 1.3;
      lines.forEach((l, k) => { y += block(l, M + 4 * U, y, maxW - 8 * U, lh2, k === n - 1 ? T.accent : T.ink, rv(k, n)) + 2.2 * U; });
    }
    if (sc.caption && kind !== 'title') { const lh2 = font(3.1, 500) * 1.3; block(sc.caption, M, L.yB + 1.5 * U, maxW, lh2, T.dim, rv(count(sc), count(sc) + 1)); }
  }
  // words on screen as they are spoken (captions_in_frame), so the film works without sound: the sentence being
  // said, the word being said in the accent colour, the words still to come dimmed. Timing is shared out by length
  // over the scene's spoken span, the same way as the transcript's cues below the player.
  if (P.captions_in_frame && sc.narration && !still) {
    const lead = sc.lead ?? 0.25, span = Math.max(0.5, d - lead - (sc.tail ?? 0.5)), pr = clamp((tl - lead) / span);
    const sents = (sc.narration.match(/[^.!?]+[.!?]+["\u201d]?|[^.!?]+$/g) || [sc.narration]).map((x) => x.trim()), total = sents.reduce((n, x) => n + x.length, 0) || 1;
    let at = pr * total, k = 0; while (k < sents.length - 1 && at > sents[k].length) { at -= sents[k].length; k++; }
    const words = sents[k].split(/\s+/), wc = words.map((w) => w.length + 1), wt = wc.reduce((a, b) => a + b, 0), f = (at / Math.max(1, sents[k].length)) * wt;
    let cur = words.length - 1, acc = 0; for (let j = 0; j < words.length; j++) { if (acc + wc[j] > f) { cur = j; break; } acc += wc[j]; } if (tl < lead) cur = -1;
    const fs = L.portrait ? 4.1 : 3.3, lh = font(fs, 600) * 1.32, sp = c.measureText(' ').width; let lines = [[]], lw = 0;
    words.forEach((w, j) => { const ww = c.measureText(w).width; if (lw && lw + sp + ww > maxW) { lines.push([]); lw = 0; } lines[lines.length - 1].push([w, j, ww]); lw += (lw ? sp : 0) + ww; });
    // at most two lines on screen: a long sentence is shown two lines at a time, the pair that holds the word being said
    if (lines.length > 2) { const r = Math.max(0, lines.findIndex((ln) => ln.some((x) => x[1] === Math.max(0, cur)))); lines = lines.slice(Math.floor(r / 2) * 2, Math.floor(r / 2) * 2 + 2); }
    const pillHere = logo && P.brand_corner && (!P.label_end_only || meta.i === meta.n - 1), yb = H - (pillHere ? 17.8 : 14.2) * U, y0 = yb - (lines.length - 1) * lh;
    c.save(); c.shadowBlur = 0; c.globalAlpha = 0.62; c.fillStyle = '#060a12'; c.fillRect(0, y0 - lh * 0.72, W, lines.length * lh + lh * 0.44); c.restore();
    c.textAlign = 'left'; c.shadowBlur = 2 * U;
    lines.forEach((ln, r) => { const lt = ln.reduce((a, x) => a + x[2], 0) + sp * (ln.length - 1); let x = cx - lt / 2; for (const [w, j, ww] of ln) { c.globalAlpha = j <= cur ? 1 : 0.48; c.fillStyle = j === cur ? T.accent : T.ink; c.fillText(w, x, y0 + r * lh); x += ww + sp; } });
    c.globalAlpha = 1; c.textAlign = 'center';
  }
  if (meta.cam && meta.cam.mode === 'corner') drawCam(c, L, meta.cam);
  // the brand in the bottom right corner (brand_corner), clear of the picture's top
  if (logo && P.brand_corner) { const lw = (L.portrait ? 0.3 : 0.17) * W, lh2 = lw * logo.height / logo.width; c.save(); c.shadowBlur = 0; c.globalAlpha = 0.95; c.drawImage(logo, W - M * 0.6 - lw, H - 2.2 * U - lh2, lw, lh2); c.restore(); }
  // bottom lines, in every frame: the scene's sources and the label
  c.globalAlpha = 1; font(2.15, 500);
  const pillUp = logo && P.brand_corner && (!P.label_end_only || meta.i === meta.n - 1); // the label rises over the source line, clear of the corner logo
  if (sc.source_line && !pillUp) { const s = wrap('Source: ' + sc.source_line, maxW)[0]; c.fillStyle = T.dim; c.textAlign = 'center'; c.fillText(s, cx, H - 9.4 * U); }
  // the label: on every frame, or (label_end_only) only on the last scene, where the credits say it
  if (!P.label_end_only || meta.i === meta.n - 1) {   font(2.45, 700); const lw = c.measureText(P.label).width + 5 * U, lhh = 4.6 * U; c.shadowBlur = 0; c.fillStyle = 'rgba(0,0,0,.62)'; c.beginPath(); c.roundRect(cx - lw / 2, (pillUp ? H - 11.2 * U : H - 6.9 * U), lw, lhh, lhh / 2); c.fill();   c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.fillText(P.label, cx, (pillUp ? H - 11.2 * U : H - 6.9 * U) + lhh / 2 + 0.1 * U); }
}
function drawCam(c, L, cam) {
  const v = cam.video; if (!v || v.readyState < 2) return; const { W, H, U, M } = L, vw = v.videoWidth, vh = v.videoHeight; c.save(); c.shadowBlur = 0; c.globalAlpha = 1;
  if (cam.mode === 'full') { const s = Math.max(W / vw, H / vh); c.translate(W, 0); c.scale(-1, 1); c.drawImage(v, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = 'rgba(8,12,20,.45)'; c.fillRect(0, 0, W, H); }
  else { const r = 13 * U, x = W - M - r, y = H - 13 * U - r, s = Math.max(2 * r / vw, 2 * r / vh); c.beginPath(); c.arc(x, y, r, 0, TAU); c.closePath(); c.clip(); c.translate(2 * x, 0); c.scale(-1, 1); c.drawImage(v, x - vw * s / 2, y - vh * s / 2, vw * s, vh * s); c.setTransform(1, 0, 0, 1, 0, 0); c.restore(); c.save(); c.lineWidth = 0.5 * U; c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
  c.restore();
}

// ---- WebGL
const VS_Q = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
const FS_BG = 'precision mediump float;varying vec2 v;uniform vec3 a,b;void main(){float d=distance(v,vec2(.5,.45));vec3 c=mix(b,a,smoothstep(0.,1.,v.y));c*=1.-.55*d*d;gl_FragColor=vec4(c,1.);}';
const FS_TX = 'precision mediump float;varying vec2 v;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,vec2(v.x,1.-v.y));}';
const VS_P = 'attribute vec4 q;attribute float al;uniform float asp,sc;varying float h,A;void main(){h=q.w;A=al;gl_Position=vec4(q.x/asp,q.y,0.,1.);gl_PointSize=q.z*sc;}';
const FS_P = 'precision mediump float;varying float h,A;uniform vec3 a,b;void main(){float d=length(gl_PointCoord-.5);float g=smoothstep(.5,0.,d);gl_FragColor=vec4(mix(a,b,h)*A*g*g,0.);}';
function program(gl, vs, fs) { const p = gl.createProgram(); for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); } gl.linkProgram(p); return p; }

export async function mount(root) {
  const $ = (s) => root.querySelector(s), canvas = $('canvas'), status = $('[data-role=status]'), say = (t) => { status.textContent = t; };
  const base = new URL(root.dataset.src, location.href), P = await (await fetch(base)).json();
  P.theme = THEMES[P.theme] || THEMES.ink;
  const scenes = P.scenes, starts = []; let total = 0; for (const s of scenes) { starts.push(total); total += s.seconds; }
  const mq = matchMedia('(prefers-reduced-motion: reduce)'); let still = mq.matches; mq.addEventListener('change', () => { still = mq.matches; frame(); });
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
  const text = document.createElement('canvas'), tc = text.getContext('2d');
  let L, pos = 0, playing = false, raf = 0, clock0 = 0, pos0 = 0, cam = null, onEnd = null, stopAt = 0, lastScene = -1;
  let pq, pb, pp, qbuf, pbuf, abuf, tex; const data = new Float32Array(N * 4), alpha = new Float32Array(N), o = { x: 0, y: 0, s: 1, h: 0, al: 0 }, o2 = { x: 0, y: 0, s: 1, h: 0, al: 0 }, sd = [0, 0, 0, 0];
  if (gl) {
    pq = program(gl, VS_Q, FS_TX); pb = program(gl, VS_Q, FS_BG); pp = program(gl, VS_P, FS_P);
    qbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qbuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    pbuf = gl.createBuffer(); abuf = gl.createBuffer(); tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  } else say('This browser has no WebGL: the transcript below has the whole story.');
  function size(w, h) { canvas.width = text.width = w; canvas.height = text.height = h; L = layout(w, h); root.classList.toggle('portrait', h > w); if (gl) gl.viewport(0, 0, w, h); }
  size(P.format?.w || 1280, P.format?.h || 720);
  for (const u of [P.brand_logo, ...scenes.map((x) => x.mark)].filter(Boolean)) { if (IMGS[u]) continue; try { const im = new Image(); im.src = u; await im.decode(); IMGS[u] = im; } catch { /* drawn without it */ } }
  // scene components (built in the lab): each draws into its own canvas, which this player lays under the words
  // scene components (built in the lab), made only when needed: the current scene and its neighbours. A browser
  // allows about 16 WebGL contexts per page (fewer on some phones and tablets) and every component has its own, so
  // components further away are disposed and their contexts released. go(t) returns a promise that settles when
  // the scenes around t are ready, so captures wait for them.
  const comps = {}, mods = {}, making = {}; let ctex = null, THREE = null;
  const lose = (cv) => { for (const k of ['webgl2', 'webgl']) { try { const g = cv.getContext(k), x = g && g.getExtension('WEBGL_lose_context'); if (x) { x.loseContext(); return; } } catch { /* already gone */ } } };
  function ensure(i) {
    if (!THREE) return Promise.resolve();
    const want = new Set([i - 1, i, i + 1].filter((k) => k >= 0 && k < scenes.length).map((k) => scenes[k].component).filter(Boolean));
    for (const id of Object.keys(comps)) if (!want.has(id)) { try { comps[id].scene.dispose(); } catch { /* best effort */ } lose(comps[id].canvas); delete comps[id]; }
    return Promise.all([...want].map((id) => comps[id] ? null : making[id] || (making[id] = (async () => {
      const m = mods[id], cv = document.createElement('canvas'); cv.width = L.W; cv.height = L.H;
      const sc = await m.create({ canvas: cv, THREE, reduced: still }); delete making[id];
      if (want.has(id)) comps[id] = { canvas: cv, seconds: m.meta.seconds, scene: sc }; else { try { sc.dispose(); } catch { /* best effort */ } lose(cv); }
    })())));
  }
  { const ids = [...new Set(scenes.map((s) => s.component).filter(Boolean))];
    if (ids.length && gl) {
      say('Loading the scenes.'); THREE = await import(new URL('./vendor/three-0.187.0/three.module.min.js', import.meta.url));
      for (const id of ids) mods[id] = await import(new URL(`../lab/${id}/scene.js`, import.meta.url));
      ctex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, ctex); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.bindTexture(gl.TEXTURE_2D, tex); await ensure(0); say('');
    } }
  const sceneAt = (t) => { let i = scenes.length - 1; while (i > 0 && starts[i] > t) i--; return i; };
  const shapeOf = (sc) => SHAPES[sc.shape || DEFAULT_SHAPE[sc.kind]] || SHAPES.swirl;

  let lastNear = -1;
  function frame() {
    { const k = sceneAt(pos); if (k !== lastNear) { lastNear = k; ensure(k).then(() => { if (!playing) frame(); }); } }
    const i = sceneAt(pos), sc = scenes[i], tl = Math.min(pos - starts[i], sc.seconds), d = sc.seconds, t = still ? 0 : pos;
    drawText(tc, L, P, sc, tl, d, still, { i, n: scenes.length, cam });
    if (gl) {
      const T = P.theme, f = shapeOf(sc), comp = sc.component && comps[sc.component], mixing = !still && i > 0 && tl < 1 && !comp && !scenes[i - 1].component, prev = mixing ? scenes[i - 1] : null, fp = prev && shapeOf(prev), hide = (cam && cam.mode === 'full') || !!comp;
      for (let k = 0; k < N; k++) {
        sd[0] = SEED[k * 4]; sd[1] = SEED[k * 4 + 1]; sd[2] = SEED[k * 4 + 2]; sd[3] = SEED[k * 4 + 3];
        f(o, sd, t, sc, L, tl, d, still, k);
        if (prev) { fp(o2, sd, t, prev, L, prev.seconds, prev.seconds, still, k); const m = ease((tl - sd[3] * 0.4) / 0.6); o.x = o2.x + (o.x - o2.x) * m; o.y = o2.y + (o.y - o2.y) * m; o.s = o2.s + (o.s - o2.s) * m; o.h = o2.h + (o.h - o2.h) * m; o.al = o2.al + (o.al - o2.al) * m; }
        data[k * 4] = o.x; data[k * 4 + 1] = o.y; data[k * 4 + 2] = o.s; data[k * 4 + 3] = o.h; alpha[k] = hide ? 0 : o.al;
      }
      gl.disable(gl.BLEND); gl.useProgram(pb); gl.bindBuffer(gl.ARRAY_BUFFER, qbuf); let a = gl.getAttribLocation(pb, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(gl.getUniformLocation(pb, 'a'), hex(T.bg1)); gl.uniform3fv(gl.getUniformLocation(pb, 'b'), hex(T.bg2)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (comp && !(cam && cam.mode === 'full')) {
        const sp = sc.span || [0, comp.seconds]; comp.scene.render(still ? sp[1] : sp[0] + clamp(tl / d) * (sp[1] - sp[0]), L.W, L.H);
        gl.useProgram(pq); a = gl.getAttribLocation(pq, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        gl.bindTexture(gl.TEXTURE_2D, ctex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, comp.canvas); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindTexture(gl.TEXTURE_2D, tex);
      }
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(pp);
      const q = gl.getAttribLocation(pp, 'q'), al = gl.getAttribLocation(pp, 'al');
      gl.bindBuffer(gl.ARRAY_BUFFER, pbuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(q); gl.vertexAttribPointer(q, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, abuf); gl.bufferData(gl.ARRAY_BUFFER, alpha, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 1, gl.FLOAT, false, 0, 0);
      gl.uniform1f(gl.getUniformLocation(pp, 'asp'), L.a); gl.uniform1f(gl.getUniformLocation(pp, 'sc'), Math.min(L.W, L.H) / 720 * 2.6);
      gl.uniform3fv(gl.getUniformLocation(pp, 'a'), hex(sc.accent || T.pA)); gl.uniform3fv(gl.getUniformLocation(pp, 'b'), hex(T.pB)); gl.drawArrays(gl.POINTS, 0, N);
      gl.disableVertexAttribArray(q); gl.disableVertexAttribArray(al);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(pq); gl.bindBuffer(gl.ARRAY_BUFFER, qbuf); a = gl.getAttribLocation(pq, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, text); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else { const c2 = canvas.getContext('2d'); if (c2) { c2.fillStyle = P.theme.bg1; c2.fillRect(0, 0, L.W, L.H); c2.drawImage(text, 0, 0); } }
    ui(i, tl);
  }

  // ---- captions, the seek bar and the teleprompter script
  const seek = $('[data-role=seek]'), time = $('[data-role=time]'), capEl = $('[data-role=caption]'), script = $('[data-role=script]'), playBtn = $('[data-act=play]');
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const cues = []; scenes.forEach((sc, i) => { const parts = (sc.narration || sc.title || '').match(/[^.!?]+[.!?]+["”]?|[^.!?]+$/g) || []; const len = parts.reduce((n, p) => n + p.length, 0) || 1, span = Math.max(0.5, sc.seconds - (sc.tail ?? 0.5)); let t = starts[i]; for (const p of parts) { const dur = span * p.length / len; cues.push({ t, end: t + dur, text: p.trim(), i }); t += dur; } });
  seek.max = total.toFixed(1);
  if (script) cues.forEach((c, k) => { const p = document.createElement('p'); p.textContent = c.text; p.dataset.k = k; script.append(p); });
  let lastCue = -2;
  function ui(i, tl) {
    seek.value = pos.toFixed(1); time.textContent = `${fmt(pos)} / ${fmt(total)}`; seek.setAttribute('aria-valuetext', `${fmt(pos)} of ${fmt(total)}, scene ${i + 1} of ${scenes.length}: ${scenes[i].title}`);
    if (i !== lastScene) { lastScene = i; root.dispatchEvent(new CustomEvent('scenechange', { detail: { index: i } })); }
    let k = cues.findIndex((c) => pos >= c.t && pos < c.end); if (k === lastCue) return; lastCue = k;
    capEl.textContent = k >= 0 ? cues[k].text : '';
    if (script) { for (const p of script.children) p.classList.toggle('on', +p.dataset.k === k); const el = script.children[k]; if (el && !script.closest('[hidden]')) script.scrollTo({ top: el.offsetTop - script.clientHeight / 2 + el.clientHeight / 2, behavior: still ? 'auto' : 'smooth' }); }
  }

  // ---- audio: one file per scene, decoded once, scheduled on the audio clock
  let ac = null, gain = null, tap = null, buffers = null, live = [];
  const hasVoice = scenes.some((s) => s.audio);
  async function loadAudio() {
    if (ac) return; ac = new (window.AudioContext || window.webkitAudioContext)(); gain = ac.createGain(); gain.connect(ac.destination); tap = ac.createMediaStreamDestination(); gain.connect(tap);
    if (!hasVoice) return; say('Loading the voice.');
    buffers = await Promise.all(scenes.map(async (s) => { if (!s.audio) return null; try { const r = await fetch(new URL(s.audio, base)); return await ac.decodeAudioData(await r.arrayBuffer()); } catch { return null; } }));
    say('');
  }
  function stopAudio() { for (const s of live) { try { s.stop(); } catch { /* already stopped */ } } live = []; }
  function startAudio() { if (!buffers) return; const now = ac.currentTime + 0.05; scenes.forEach((s, i) => { const b = buffers[i]; if (!b) return; const at = starts[i] + (s.lead ?? 0.25) - pos; if (at + b.duration <= 0) return; const src = ac.createBufferSource(); src.buffer = b; src.connect(gain); if (at >= 0) src.start(now + at); else src.start(now, -at); live.push(src); }); }
  async function play() {
    if (playing) return; if (pos >= total - 0.05) pos = 0; await loadAudio(); await ac.resume(); startAudio(); clock0 = ac.currentTime + 0.05; pos0 = pos; playing = true; playBtn.textContent = 'Pause'; playBtn.setAttribute('aria-pressed', 'true');
    const tick = () => { if (!playing) return; pos = Math.max(pos0, pos0 + ac.currentTime - clock0); if (stopAt && pos >= stopAt) { pos = stopAt - 0.02; stopAt = 0; pause(); return; } if (pos >= total) { pos = total; pause(); playBtn.textContent = 'Play again'; if (onEnd) { const f = onEnd; onEnd = null; f(); } return; } frame(); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick);
  }
  function pause() { if (!playing) { frame(); return; } playing = false; cancelAnimationFrame(raf); stopAudio(); playBtn.textContent = 'Play'; playBtn.setAttribute('aria-pressed', 'false'); frame(); if (cam) idle(); }
  function go(t) { const was = playing; if (was) { playing = false; cancelAnimationFrame(raf); stopAudio(); } pos = clamp(t, 0, total); frame(); if (was) play(); return ensure(sceneAt(pos)).then(() => frame()); }
  function idle() { const loop = () => { if (playing || !cam) return; frame(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }

  // ---- recording: the canvas and one audio track, in the browser, to a file the viewer keeps
  const out = $('[data-role=out]');
  const mime = () => ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  let rec = null;
  function record(audioTrack, name, note) {
    const m = mime(); if (!m || !canvas.captureStream) { say('This browser cannot record a canvas (no MediaRecorder).'); return false; }
    const stream = canvas.captureStream(30); if (audioTrack) stream.addTrack(audioTrack); const chunks = []; rec = new MediaRecorder(stream, { mimeType: m, videoBitsPerSecond: 6e6 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => { rec = null; const blob = new Blob(chunks, { type: m.split(';')[0] }), url = URL.createObjectURL(blob), ext = m.startsWith('video/mp4') ? 'mp4' : 'webm'; out.replaceChildren();
      const v = document.createElement('video'); v.controls = true; v.src = url; v.setAttribute('aria-label', note); const a = document.createElement('a'); a.href = url; a.download = `${name}.${ext}`; a.textContent = `Save the file (${ext}, ${(blob.size / 1048576).toFixed(1)} MB)`;
      const p = document.createElement('p'); p.append(note + ' It exists only in this tab until you save it. ', a); out.append(v, p); say('Recorded.'); root.dispatchEvent(new CustomEvent('recorded', { detail: { blob, filename: `${name}.${ext}` } })); root.querySelectorAll('[data-act=capture],[data-act=take]').forEach((b) => { b.disabled = false; }); };
    rec.start(1000); return true;
  }
  async function capture() { await loadAudio(); pause(); pos = 0; if (!record(tap.stream.getAudioTracks()[0], `${P.id}-${P.version}-${L.W}x${L.H}`, `Capture of ${P.title}, version ${P.version}, not signed for publishing by being captured.`)) return; $('[data-act=capture]').disabled = true; say('Recording the whole production. Keep this tab in front; Pause stops the recording.'); onEnd = () => setTimeout(() => rec && rec.stop(), 400); play(); }

  // ---- teleprompter (experiment): camera and microphone, with permission, never sent anywhere
  const tele = $('[data-role=tele]');
  async function camOn() {
    if (cam) return; try { const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true } }); const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream; await video.play(); cam = { stream, video, mode: $('[data-role=layer]').value }; say('Camera and microphone are on, in this tab only.'); $('[data-act=take]').disabled = false; $('[data-act=camoff]').disabled = false; idle(); }
    catch (e) { say(`No camera or microphone: ${e.name}. Nothing was recorded.`); }
  }
  function camOff() { if (!cam) return; for (const t of cam.stream.getTracks()) t.stop(); cam = null; $('[data-act=take]').disabled = true; $('[data-act=camoff]').disabled = true; if (gain) gain.gain.value = 1; say('Camera and microphone are off.'); frame(); }
  async function take() {
    if (!cam) return; await loadAudio(); pause(); pos = 0; frame(); $('[data-act=take]').disabled = true;
    for (let n = 3; n > 0; n--) { say(`Recording starts in ${n}.`); await new Promise((r) => setTimeout(r, 1000)); }
    gain.gain.value = $('[data-role=guide]').checked ? 1 : 0;
    if (!record(cam.stream.getAudioTracks()[0], `${P.id}-${P.version}-take`, 'Your take over the animation.')) return;
    say('Recording your take: read the lit line. Stop ends it early.'); onEnd = () => setTimeout(() => { if (rec) rec.stop(); gain.gain.value = 1; }, 400); play();
  }

  // ---- controls and keys
  const acts = {
    play: () => { stopAt = 0; return rec ? acts.stop() : playing ? pause() : play(); }, prev: () => { const i = sceneAt(pos); go(pos - starts[i] > 1.5 || i === 0 ? starts[i] : starts[i - 1]); },
    next: () => go(starts[Math.min(scenes.length - 1, sceneAt(pos) + 1)]),
    format: (b) => { const p = L.H > L.W; size(p ? 1280 : 720, p ? 720 : 1280); b.textContent = p ? 'Portrait 9:16' : 'Landscape 16:9'; frame(); },
    full: () => { const el = $('.stage'); document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.(); },
    capture, tele: (b) => { tele.hidden = !tele.hidden; b.setAttribute('aria-expanded', String(!tele.hidden)); if (tele.hidden) camOff(); lastCue = -2; frame(); },
    camon: camOn, camoff: camOff, take, stop: () => { onEnd = null; pause(); if (rec) rec.stop(); if (gain) gain.gain.value = 1; },
  };
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && acts[b.dataset.act]) acts[b.dataset.act](b); });
  seek.addEventListener('input', () => go(+seek.value));
  $('[data-role=layer]')?.addEventListener('change', (e) => { if (cam) { cam.mode = e.target.value; frame(); } });
  root.addEventListener('keydown', (e) => {
    if (e.target.closest('input,select,textarea') || e.altKey || e.ctrlKey || e.metaKey) return; const btn = e.target.closest('button');
    if ((e.key === ' ' && !btn) || e.key === 'k') { e.preventDefault(); acts.play(); } else if (e.key === 'ArrowRight') { e.preventDefault(); acts.next(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); acts.prev(); } else if (e.key === 'Home') { e.preventDefault(); go(0); }
  });
  if (still) say('Reduced motion is on: scenes change without movement.');
  pos = Math.min(total, scenes[0].seconds * 0.8); frame(); pos = 0; seek.value = 0; time.textContent = `0:00 / ${fmt(total)}`;
  const api = { scenes: scenes.map((s, i) => ({ id: s.id, title: s.title || s.label || s.id, narration: s.narration || '', start: starts[i], seconds: s.seconds })), id: P.id, version: P.version, sceneIndex: () => sceneAt(pos), showScene: (i) => { stopAt = 0; go(starts[i] + 0.01); }, playScene: async (i) => { if (playing) pause(); pos = starts[i] + 0.01; stopAt = i + 1 < scenes.length ? starts[i + 1] : 0; await play(); },
    go, play, pause, frame, get total() { return total; }, get position() { return pos; }, size };
  root.__player = api; root.dataset.ready = '1'; root.dispatchEvent(new CustomEvent('playerready')); return api;
}
for (const el of document.querySelectorAll('[data-player]')) mount(el).catch((e) => { const s = el.querySelector('[data-role=status]'); if (s) s.textContent = `The player could not start (${e.message}). The transcript below has the whole story.`; });
