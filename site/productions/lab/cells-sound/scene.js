// The values are sound: four warm lights (the four values of the Manifesto) glow in a living membrane, linked by threads,
// under Ron Jeffries' 2018 line that the values and principles still offer the best way he knows to build software.
// Then, as the voice says what hardens is the word and the way it is run, grey-blue plates accrete round the cell, layer
// on layer, each one sliding in soft and luminous, locking, then stiffening into a dull hard slab; the outer layers are
// thicker, riveted, braced and more angular. The four lights never dim: their warmth shows on the inner face of every
// plate and leaks out through the gaps between plates as narrow rays, so the end holds a hard shell with sound values inside.
// One full-screen fragment shader draws the picture (backdrop, lights, threads, membrane, shell and rays); the words are a
// 2D canvas laid over it. Composed for 720x1280 first; 1280x720 is a second layout. render(t) is a pure function of t.
// A lab scene component (see ../harness.js for the contract). Apache-2.0. By c.productions.
export const meta = {
  id: 'cells-sound',
  title: 'The values are sound',
  beat: 'Four warm lights, the four values, keep glowing while a hard grey shell of process accretes round them, layer on layer; their light still shows through the gaps.',
  seconds: 12,
  sources: [
    { title: 'Developers Should Abandon Agile (Ron Jeffries, 2018)', url: 'https://ronjeffries.com/articles/018-01ff/abandon-1/' },
    { title: 'The Agile history site: Jeffries still holds to the Manifesto', url: 'https://agile.history.sovereignweb.site/facts/#jeffries-still-manifesto' },
  ],
};

const QUOTE = '“the values and principles of the Manifesto for Agile Software Development still offer the best way I know to build software”';
const CREDIT = 'Ron Jeffries, 2018';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const NL = 7; // layers of the shell
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;

// the shell, in design pixels at scale 1: centre-line radius (apothem), thickness, polygon sides, plates, gap half-width
const TH = [], R = [], SIDES = [48, 36, 24, 18, 12, 12, 6], PLATES = [24, 18, 12, 12, 12, 6, 6], GAP = [], BORN = [];
for (let k = 0; k < NL; k++) { TH.push(7 + 3.7 * k); GAP.push(3.6 + 0.6 * k); BORN.push(6.05 + 0.6 * k); }
R.push(112); for (let k = 1; k < NL; k++) R.push(R[k - 1] + TH[k - 1] / 2 + 7 + TH[k] / 2);

const LAY = {
  port: { W: 720, H: 1280, c0: [360, 790], c1: [360, 646], sc: 1.0, z0: 1.32, text: { x: 56, w: 608, top: 156, maxH: 400, fs: 40, cfs: 30 } },
  land: { W: 1280, H: 720, c0: [640, 470], c1: [640, 352], sc: 0.76, z0: 1.12, text: { x: 130, w: 1020, top: 88, maxH: 250, fs: 42, cfs: 28 } },
};

export async function create({ canvas, THREE, reduced }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1); renderer.setClearColor(0x0b1420, 1);
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const disposables = [], keep = (x) => { disposables.push(x); return x; };
  const quad = keep(new THREE.PlaneGeometry(2, 2));
  const VERT = 'varying vec2 v; void main(){ v = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const f = (a) => a.map((x) => x.toFixed(3)).join(', ');

  const U = { uRes: { value: new THREE.Vector2(720, 1280) }, uView: { value: new THREE.Vector3(1, 0, 0) }, uT: { value: 0 },
    uC: { value: new THREE.Vector2(360, 646) }, uSc: { value: 1 }, uSpin: { value: 0 } };
  const pic = new THREE.Mesh(quad, keep(new THREE.ShaderMaterial({ vertexShader: VERT, uniforms: U, depthTest: false, depthWrite: false, fragmentShader: `
    precision highp float; uniform vec2 uRes, uC; uniform vec3 uView; uniform float uT, uSc, uSpin;
    const float PI = 3.14159265;
    const vec3 VAL = vec3(1.0, 0.80, 0.48), AMB = vec3(1.0, 0.784, 0.341), TEAL = vec3(0.373, 0.816, 0.773);
    float hash(float n){ return fract(sin(n * 91.345) * 47453.21); }
    float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float ss(float x){ x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
    float segD(vec2 p, vec2 a, vec2 b, out float h){ vec2 pa = p - a, ba = b - a; h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
    float TH[${NL}]; float RR[${NL}]; float SD[${NL}]; float PL[${NL}]; float GP[${NL}]; float BN[${NL}];
    void main(){
      TH = float[${NL}](${f(TH)}); RR = float[${NL}](${f(R)}); SD = float[${NL}](${f(SIDES)}); PL = float[${NL}](${f(PLATES)});
      GP = float[${NL}](${f(GAP)}); BN = float[${NL}](${f(BORN)});
      vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y), p = (fc - uView.yz) / uView.x, uv = fc / uRes;
      float t = uT;
      // backdrop: navy, lighter across the middle, vignette, grain
      vec3 col = mix(vec3(0.043, 0.078, 0.125), vec3(0.071, 0.149, 0.227), 0.85 * exp(-pow((uv.y - 0.52) / 0.42, 2.0)));
      vec2 vc = (uv - 0.5) * vec2(uRes.x, uRes.y) / max(uRes.x, uRes.y) * 1.5;
      col *= 1.0 - 0.42 * smoothstep(0.25, 0.85, length(vc));
      // dust: slow motes
      for (int l = 0; l < 2; l++) { float cs = l == 0 ? 96.0 : 61.0; vec2 q = p / cs + vec2(0.02 * t * (1.0 + float(l)), -0.035 * t); vec2 id = floor(q), fq = fract(q) - 0.5;
        float hh = hash2(id + float(l) * 17.0); if (hh < 0.35) { vec2 o = vec2(hash2(id + 3.1), hash2(id + 7.7)) - 0.5; float d = length((fq - o * 0.7) * cs);
          col += vec3(0.6, 0.72, 0.85) * exp(-d * d / 6.0) * (0.05 + 0.08 * hh) * (0.7 + 0.3 * sin(t * 1.3 + hh * 40.0)); } }

      vec2 q = (p - uC) / uSc; float rho = length(q), ang = atan(q.y, q.x); if (ang < 0.0) ang += 2.0 * PI;
      float breathe = 1.0 + 0.05 * sin(t * 1.25);
      // the shell first works out how much warm light gets through to this point (T), layer by layer from the inside
      float T = 1.0, T2 = 1.0; vec3 plates = vec3(0.0); float plA = 0.0; vec3 addG = vec3(0.0);
      float prevOuter = -1.0;
      for (int k = 0; k < ${NL}; k++) {
        if (t < BN[k] - 0.05) break;
        float n = SD[k], P = PL[k], th = TH[k];
        float a = ang + uSpin * (k % 2 == 0 ? 1.0 : -1.0) * 0.0;
        float segA = 2.0 * PI / n, loc = mod(a, segA) - segA * 0.5, fp = rho * cos(loc);
        float plA_ = 2.0 * PI / P, pj = floor(a / plA_), fr = a / plA_ - pj;
        float tb = BN[k] + hash(float(k) * 31.0 + pj * 1.7) * 0.62;
        float e = ss((t - tb) / 0.7), st = ss((t - tb - 0.62) / 0.75);
        float off = (1.0 - e) * (1.0 - e) * (60.0 + 10.0 * float(k));
        float r = RR[k] + off;
        float db = min(fr, 1.0 - fr) * plA_ * max(rho, 1.0);
        float gw = GP[k] + 4.0 * (1.0 - e);
        float mask = smoothstep(gw, gw + 1.2, db);
        float present = ss(e * 1.6) * mask;
        float dd = abs(fp - r) - th * 0.5;
        float ins = smoothstep(0.8, -0.8, dd);
        float u = clamp((fp - (r - th * 0.5)) / th, 0.0, 1.0);
        // lattice: braces from the layer inside to this one, through the middle of each plate, once both are hard
        if (k >= 2 && prevOuter > 0.0) {
          float dm = abs(fr - 0.5) * plA_ * rho, inner = r - th * 0.5;
          float bs = st * ss((t - BN[k - 1] - 1.4) / 0.6);
          float inB = step(prevOuter, rho * cos(mod(a, 2.0 * PI / SD[k - 1]) - PI / SD[k - 1])) * step(fp, inner + 0.5);
          float bd = smoothstep(2.6, 1.6, dm) * inB * bs;
          vec3 bc = mix(vec3(0.33, 0.40, 0.48), vec3(0.50, 0.58, 0.66), smoothstep(1.4, 0.0, dm));
          col = mix(col, bc, bd * 0.95);
        }
        prevOuter = RR[k] + th * 0.5;
        // the plate itself
        float alpha = ins * present * mix(0.30, 0.97, st);
        float hardDark = ss((t - tb - 2.2) / 2.5);
        vec3 fill = mix(vec3(0.36, 0.44, 0.53), vec3(0.24, 0.30, 0.37), u) * (1.0 - 0.18 * hardDark) * (0.92 + 0.08 * float(k) / 6.0);
        // facets: a slight change of tone along each side of the polygon, so the outer slabs read as flat and angular
        fill *= 0.9 + 0.12 * (loc / (segA * 0.5)) * step(SD[k], 13.0) + 0.05 * hash(pj + float(k) * 9.0);
        float edgeIn = u * th, edgeOut = (1.0 - u) * th;
        fill += vec3(0.62, 0.70, 0.78) * exp(-edgeOut / 1.0) * 0.55 * st;          // hard outer bevel
        fill += AMB * exp(-edgeIn / (1.6 + 0.12 * float(k))) * (0.85 * T) * breathe;    // the values' warmth on the inner face
        fill += VAL * exp(-db / 1.6) * 0.35 * T;                                     // and along the plate ends at the gaps
        // rivets on the heavy outer layers
        if (k >= 3) { float rv = exp(-(pow(db - 0.30 * th - 6.0, 2.0) + pow(fp - r, 2.0)) / 3.5); fill += vec3(0.70, 0.76, 0.82) * rv * 0.7 * st; }
        // soft, luminous while it arrives; a flash as it locks
        vec3 soft = vec3(0.55, 0.74, 0.90) * (exp(-abs(dd) / 1.4) * 0.9 + ins * 0.18) * present * (1.0 - st);
        float lock = exp(-pow((t - tb - 0.72) / 0.12, 2.0));
        soft += vec3(0.75, 0.86, 0.95) * exp(-abs(dd) / 2.5) * lock * 0.8 * mask;
        col = mix(col, fill, alpha); addG += soft;
        // light that gets past this layer
        float outside = smoothstep(r - th * 0.5, r + th * 0.5, fp);
        float fe = max(fp - r - th * 0.5, 0.0), maskT = smoothstep(gw, gw + 1.5 + 0.10 * fe, db + 0.03 * fe);
        T *= mix(1.0, 1.0 - ss(e * 1.6) * maskT * mix(0.75, 0.99, st), outside);
        float maskW = smoothstep(gw - 2.0, gw + 10.0 + 0.22 * fe, db + 0.02 * fe);
        T2 *= mix(1.0, 1.0 - ss(e * 1.6) * maskW * mix(0.6, 0.97, st), outside);
      }
      col += addG;
      // the warm light of the values, everywhere it reaches: a halo near, long rays far, both cut by the shell
      float boost = mix(0.30, 1.0, ss((t - 6.4) / 2.5));
      float sh = (0.95 * exp(-rho / 115.0) + 0.30 * exp(-rho / 330.0)) * boost, core = smoothstep(80.0, 112.0, rho);
      vec3 RAY = vec3(1.0, 0.72, 0.32);
      float calm = smoothstep(0.97, 0.80, uv.y) * smoothstep(0.0, 0.12, uv.y);
      col += RAY * sh * (T + 0.45 * T2) * breathe * core * mix(1.0, calm, ss((t - 6.0) / 1.0)) + AMB * (0.30 * exp(-rho / 95.0) + 0.16 * exp(-rho / 260.0)) * (1.0 - core) * 0.6;

      // the membrane: alive, wobbling, a cream double edge round a faint teal fill
      float mr = 92.0 * (1.0 + 0.012 * sin(t * 1.25));
      float sm = rho - mr + 2.2 * sin(ang * 5.0 + t * 1.1) + 1.2 * sin(ang * 9.0 - t * 1.7) + 1.6 * sin(ang * 3.0 + t * 0.6);
      float am = abs(sm), mIn = smoothstep(1.0, -2.0, sm);
      float edge = exp(-am / 1.3) * 0.9 + exp(-abs(sm + 6.5) / 1.1) * 0.30 + exp(-am / 10.0) * 0.20 + exp(-am / 40.0) * 0.06;
      float nz = sin(q.x * 0.045 + t * 0.3) * sin(q.y * 0.05 - t * 0.25) + 0.6 * sin((q.x + q.y) * 0.021 + t * 0.2);
      col += vec3(1.0, 0.89, 0.70) * edge * 0.85 + TEAL * mIn * (0.05 + 0.10 * exp(sm / 24.0) + 0.012 * nz) * 0.9;

      // the four values: steady warm lights on a gently turning diamond, linked in a ring, a pulse going round
      vec2 L[4]; float rot = 0.12 * sin(t * 0.25);
      for (int i = 0; i < 4; i++) { float a = float(i) * PI * 0.5 + PI * 0.25 + rot; L[i] = vec2(cos(a), sin(a)) * (44.0 + 1.5 * sin(t * 0.9 + float(i) * 1.7)); }
      for (int i = 0; i < 4; i++) { vec2 A = L[i], B = L[(i + 1) % 4]; float h, d = segD(q, A, B, h);
        col += mix(VAL, vec3(0.96, 0.95, 0.91), 0.4) * (exp(-d / 1.1) * 0.45 + exp(-d / 6.0) * 0.12);
        float pu = fract(t * 0.32 + float(i) * 0.25), pd = length(q - mix(A, B, pu));
        col += VAL * exp(-pd * pd / 30.0) * 0.7 * sin(PI * pu); }
      { float h, d = segD(q, L[0], L[2], h); col += VAL * exp(-d / 1.0) * 0.12; d = segD(q, L[1], L[3], h); col += VAL * exp(-d / 1.0) * 0.12; }
      for (int i = 0; i < 4; i++) { vec2 dq = q - L[i]; float d = length(dq), br = breathe * (1.0 + 0.04 * sin(t * 1.9 + float(i) * 1.3));
        col += VAL * (exp(-d * d / 50.0) * 1.5 + exp(-d / 13.0) * 0.55 + exp(-d / 38.0) * 0.20) * br;
        col += vec3(1.0, 0.96, 0.88) * exp(-d * d / 9.0) * 0.7;
        col += VAL * exp(-abs(dq.y) / 1.2 - abs(dq.x) / 26.0) * 0.18 * br; }
      col += (hash2(fc + fract(t) * 0.0) - 0.5) * 2.5 / 255.0;
      gl_FragColor = vec4(col, 1.0); }` })));
  pic.frustumCulled = false; pic.renderOrder = 0; scene.add(pic);

  // the words: a 2D canvas laid over the picture, redrawn only when the frame size changes
  const hudCv = document.createElement('canvas'), hud = hudCv.getContext('2d'), hudTex = keep(new THREE.CanvasTexture(hudCv));
  hudTex.minFilter = THREE.LinearFilter; hudTex.magFilter = THREE.LinearFilter; hudTex.generateMipmaps = false;
  const hU = { map: { value: hudTex }, uA: { value: 1 } };
  const hudMesh = new THREE.Mesh(quad, keep(new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: hU,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, vertexShader: VERT,
    fragmentShader: 'uniform sampler2D map; uniform float uA; varying vec2 v; void main(){ vec4 c = texture2D(map, v); gl_FragColor = vec4(c.rgb * c.a, c.a) * uA; }' })));
  hudMesh.frustumCulled = false; hudMesh.renderOrder = 10; scene.add(hudMesh);

  function wrap(ctx, words, maxW) { const lines = []; let cur = '';
    for (const w of words) { const tryL = cur ? cur + ' ' + w : w; if (ctx.measureText(tryL).width <= maxW || !cur) cur = tryL; else { lines.push(cur); cur = w; } }
    if (cur) lines.push(cur); return lines; }
  function drawHud(w, h, L, S, X0, Y0) {
    hudCv.width = w; hudCv.height = h; const ctx = hud; ctx.clearRect(0, 0, w, h);
    const T = L.text, words = QUOTE.split(' ');
    let fs = T.fs, lines, lh;
    for (;;) { ctx.font = `600 ${fs * S}px ${FONT}`; lines = wrap(ctx, words, T.w * S); lh = fs * 1.3; if (lines.length * lh + T.cfs * 2.2 <= T.maxH || fs <= 30) break; fs -= 1; }
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    const cx = X0 + (T.x + T.w / 2) * S;
    ctx.shadowColor = 'rgba(6,12,20,0.85)';
    // each line drawn whole (keeps kerning), its curly quotes overdrawn in amber
    lines.forEach((ln, i) => { const y = Y0 + (T.top + fs + i * lh) * S; ctx.font = `600 ${fs * S}px ${FONT}`; ctx.textAlign = 'left';
      const full = ctx.measureText(ln).width, x0 = cx - full / 2;
      ctx.fillStyle = '#f4f1e8'; ctx.shadowBlur = 14 * S; ctx.fillText(ln, x0, y);
      if (ln.startsWith('“')) { ctx.fillStyle = '#ffc857'; ctx.shadowBlur = 0; ctx.fillText('“', x0, y); }
      if (ln.endsWith('”')) { const wq = ctx.measureText('”').width; ctx.fillStyle = '#ffc857'; ctx.shadowBlur = 0; ctx.fillText('”', x0 + full - wq, y); } });
    const yEnd = T.top + fs + (lines.length - 1) * lh, ruleY = Y0 + (yEnd + fs * 0.75) * S;
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,200,87,0.75)'; ctx.fillRect(cx - 28 * S, ruleY, 56 * S, 2 * S);
    ctx.font = `500 ${T.cfs * S}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffc857'; ctx.shadowColor = 'rgba(6,12,20,0.85)'; ctx.shadowBlur = 10 * S;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${0.04 * T.cfs * S}px`;
    ctx.fillText(CREDIT, cx, ruleY + (T.cfs * 1.55) * S);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    hudTex.needsUpdate = true;
  }

  let key = '';
  function render(time, w, h) {
    const portrait = h > w, L = portrait ? LAY.port : LAY.land;
    if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false); renderer.setViewport(0, 0, w, h);
    const S = Math.min(w / L.W, h / L.H), X0 = (w - L.W * S) / 2, Y0 = (h - L.H * S) / 2;
    if (key !== `${w}x${h}`) { key = `${w}x${h}`; drawHud(w, h, L, S, X0, Y0); }
    const t = reduced ? meta.seconds : clamp(time, 0, meta.seconds);
    const m = sstep((t - 5.8) / 1.5);
    U.uRes.value.set(w, h); U.uView.value.set(S, X0, Y0); U.uT.value = t; U.uSc.value = L.sc * lerp(L.z0, 1, sstep((t - 5.6) / 2.2));
    U.uC.value.set(lerp(L.c0[0], L.c1[0], m), lerp(L.c0[1], L.c1[1], m));
    hU.uA.value = sstep(t / 0.6) * (1 - sstep((t - 5.7) / 0.7));
    hudMesh.visible = hU.uA.value > 0.002;
    renderer.render(scene, camera);
  }
  function dispose() { for (const d of disposables) d.dispose(); renderer.dispose(); }
  return { render, dispose };
}
