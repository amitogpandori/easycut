/* EasyCut Photo editor — a non-destructive photo editor (WebGL2 with a Canvas2D fallback).
   Inspired by the way mobile photo editors work (swipe up/down to pick a setting, left/right to change it,
   hold to compare, an editable stack of edits), written from scratch for EasyCut. No third-party assets.
   Loaded after app/index.html's main script; it uses a few of its functions (toast, saveBlob, importOne, …)
   when they exist, so it also works on its own. */
(() => {
'use strict';
const $p = (s, r = document) => r.querySelector(s), $$p = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uidp = () => Math.random().toString(36).slice(2, 10);
const escp = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const deep = o => JSON.parse(JSON.stringify(o));
const PREV_MAX = 2048, THUMB = 132;

/* ---------- tools ---------- */
// p(k, label, min, max, def)  — every value is stored as the number the user sees (e.g. -100…100)
const P = (k, label, min, max, def = 0, extra) => ({ k, label, min, max, def, ...extra });
const SEG = (k, label, opts, def) => ({ k, label, seg:opts, def:def != null ? def : opts[0][0] });
const TOOLS = {
  tune:   { name:'Tune', ico:'🎚️', grp:'adjust', params:[P('bright','Brightness',-100,100), P('contrast','Contrast',-100,100), P('sat','Saturation',-100,100), P('amb','Ambiance',-100,100), P('hi','Highlights',-100,100), P('sh','Shadows',-100,100), P('warm','Warmth',-100,100), P('vib','Vibrance',-100,100), P('fade','Fade',0,100)], auto:true },
  details:{ name:'Details', ico:'🔍', grp:'adjust', params:[P('struct','Structure',-100,100, 25), P('sharp','Sharpening',0,100, 20)] },
  curves: { name:'Curves', ico:'📈', grp:'adjust', params:[], ui:'curves' },
  wb:     { name:'White balance', ico:'🌡️', grp:'adjust', params:[P('temp','Temperature',-100,100), P('tint','Tint',-100,100)], ui:'wb' },
  dehaze: { name:'Dehaze', ico:'🌫️', grp:'adjust', params:[P('amt','Dehaze',-100,100, 35)] },
  vignette:{ name:'Vignette', ico:'⭕', grp:'adjust', params:[P('outer','Outer brightness',-100,100,-50), P('inner','Center brightness',-100,100,0), P('size','Size',5,100,55)], ui:'center' },
  lens:   { name:'Lens blur', ico:'🎯', grp:'adjust', params:[P('str','Blur strength',0,100,45), P('trans','Transition',0,100,35), P('vig','Vignette',0,100,15), P('bokeh','Bokeh highlights',0,100,35), P('size','Focus size',5,100,32), P('angle','Angle',-90,90,0), SEG('mode','Shape',[['radial','Round'],['linear','Linear']])], ui:'center' },
  crop:   { name:'Crop & rotate', ico:'✂️', grp:'fix', params:[P('angle','Straighten',-45,45,0, { step:.1 })], ui:'crop', geo:true },
  persp:  { name:'Perspective', ico:'🏛️', grp:'fix', params:[P('tv','Vertical tilt',-100,100), P('th','Horizontal tilt',-100,100), P('rot','Rotate',-100,100), P('scale','Scale',-100,100), SEG('fill','Fill edges',[['smart','Smart'],['white','White'],['black','Black']])], geo:true },
  expand: { name:'Expand', ico:'↔️', grp:'fix', params:[P('l','Left',0,60,0), P('r','Right',0,60,0), P('t','Top',0,60,0), P('b','Bottom',0,60,0), SEG('fill','Fill',[['smart','Smart'],['white','White'],['black','Black']])], geo:true },
  selective:{ name:'Selective', ico:'📍', grp:'fix', params:[P('b','Brightness',-100,100), P('c','Contrast',-100,100), P('s','Saturation',-100,100), P('st','Structure',-100,100)], ui:'points' },
  brush:  { name:'Brush', ico:'🖌️', grp:'fix', params:[SEG('mode','Effect',[['dodge','Dodge & burn'],['expo','Exposure'],['temp','Temperature'],['sat','Saturation']]), SEG('amt','Amount',[['10','+10'],['5','+5'],['-5','−5'],['-10','−10'],['0','Eraser']], '5'), P('size','Brush size',2,40,10)], ui:'brush' },
  heal:   { name:'Healing', ico:'🩹', grp:'fix', params:[P('size','Spot size',1,20,4)], ui:'heal' },
  hdr:    { name:'HDR scape', ico:'🏔️', grp:'style', params:[P('str','Filter strength',0,100,50), P('bright','Brightness',-100,100), P('sat','Saturation',-100,100), SEG('style','Style',[['nature','Nature'],['people','People'],['fine','Fine'],['strong','Strong']])] },
  drama:  { name:'Drama', ico:'🌩️', grp:'style', params:[P('str','Filter strength',0,100,50), P('sat','Saturation',-100,100), SEG('style','Style',[['bright','Bright'],['dark','Dark']])] },
  tonal:  { name:'Tonal contrast', ico:'🌗', grp:'style', params:[P('hi','High tones',0,100,30), P('mid','Mid tones',0,100,30), P('low','Low tones',0,100,30)] },
  glow:   { name:'Glow', ico:'✨', grp:'style', params:[P('glow','Glow',0,100,40), P('sat','Saturation',-100,100,10), P('warm','Warmth',-100,100), P('hal','Halation',0,100,0)] },
  grain:  { name:'Grainy film', ico:'🎞️', grp:'style', params:[P('grain','Grain',0,100,30), P('gsize','Grain size',0,100,30), P('stylek','Style strength',0,100,60), P('hal','Halation',0,100,0), SEG('style','Film',[['neutral','Neutral'],['warm','Warm 200'],['cool','Cool 400'],['faded','Faded'],['cross','Cross'],['silver','Silver']])] },
  retro:  { name:'Retro light', ico:'📷', grp:'style', params:[P('leak','Light leaks',0,100,40), P('scr','Scratches',0,100,25), P('seed','Leak style',1,12,3, { step:1 }), P('sat','Saturation',-100,100,-10), P('contrast','Contrast',-100,100,10), P('fade','Fade',0,100,25)] },
  bw:     { name:'Black & white', ico:'⚫', grp:'style', params:[P('bright','Brightness',-100,100), P('contrast','Contrast',-100,100, 15), P('grain','Grain',0,100,0), SEG('filter','Colour filter',[['neutral','Neutral'],['red','Red'],['orange','Orange'],['yellow','Yellow'],['green','Green'],['blue','Blue']]), SEG('tone','Toning',[['none','None'],['sepia','Sepia'],['selenium','Selenium'],['cyan','Cyan']])] },
  noir:   { name:'Noir', ico:'🎩', grp:'style', params:[P('str','Strength',0,100,60), P('wash','Wash',0,100,20), P('grain','Grain',0,100,40), P('vig','Vignette',0,100,40)] },
  frames: { name:'Frames', ico:'🖼️', grp:'creative', params:[P('w','Frame width',0,100,40), SEG('style','Style',[['thin','Thin'],['classic','Classic'],['rounded','Rounded'],['polaroid','Instant'],['film','Film strip'],['soft','Soft edge'],['double','Double line']], 'classic'), SEG('col','Colour',[['white','White'],['black','Black'],['cream','Cream']])] },
  text:   { name:'Text', ico:'🔤', grp:'creative', params:[P('size','Size',2,30,8), P('op','Opacity',0,100,100), SEG('style','Style',[['plain','Plain'],['shadow','Shadow'],['box','Box'],['outline','Outline'],['neon','Neon']], 'shadow')], ui:'text' },
  double: { name:'Double exposure', ico:'👥', grp:'creative', params:[P('op','Opacity',0,100,50), P('scale','Size',50,250,100), SEG('mode','Blend',[['screen','Lighten (screen)'],['normal','Normal'],['multiply','Darken (multiply)'],['overlay','Overlay'],['lighten','Lightest'],['darken','Darkest']])], ui:'double' },
  look:   { name:'Look', ico:'🎨', grp:'hidden', params:[P('amt','Strength',0,100,100)] },
};
const GROUPS = [['adjust','Adjust & correct'],['fix','Retouch & transform'],['style','Style'],['creative','Creative']];
const defaults = id => { const p = {}; for (const x of TOOLS[id].params) p[x.k] = x.def; if (id === 'crop') Object.assign(p, { rot:0, fh:false, fv:false, ratio:'free', rect:{ x:0, y:0, w:1, h:1 } }); if (id === 'lens' || id === 'vignette') Object.assign(p, { cx:.5, cy:.5 }); if (id === 'curves') p.pts = { rgb:[[0,0],[1,1]], r:[[0,0],[1,1]], g:[[0,0],[1,1]], b:[[0,0],[1,1]] }; if (id === 'selective') { p.points = []; p.cur = -1; } if (id === 'brush') p.strokes = []; if (id === 'heal') p.spots = []; if (id === 'text') Object.assign(p, { text:'Your text', font:'Plus Jakarta Sans', color:'#ffffff', x:.5, y:.82, weight:800 }); if (id === 'double') Object.assign(p, { img:'', ox:0, oy:0 }); return p; };
const isGeo = it => !!TOOLS[it.tool].geo;

/* ---------- colour maths shared by both engines ---------- */
// CSS filter string → 3×4 affine matrix (rows r,g,b: [a,b,c,offset]) — the same maths browsers use
function cssMatrix(str){
  let M = [[1,0,0,0],[0,1,0,0],[0,0,1,0]];
  const mul = A => { M = A.map(r => [0,1,2,3].map(j => r[0] * M[0][j] + r[1] * M[1][j] + r[2] * M[2][j] + (j === 3 ? r[3] : 0))); };
  const re = /([a-z-]+)\(([-\d.]+)(deg|%)?\)/g; let m;
  while ((m = re.exec(str || ''))){
    let a = +m[2]; if (m[3] === '%') a /= 100; const f = m[1];
    if (f === 'saturate'){ const s = a; mul([[.213 + .787 * s, .715 - .715 * s, .072 - .072 * s, 0], [.213 - .213 * s, .715 + .285 * s, .072 - .072 * s, 0], [.213 - .213 * s, .715 - .715 * s, .072 + .928 * s, 0]]); }
    else if (f === 'grayscale'){ const s = 1 - Math.min(1, a); mul([[.2126 + .7874 * s, .7152 - .7152 * s, .0722 - .0722 * s, 0], [.2126 - .2126 * s, .7152 + .2848 * s, .0722 - .0722 * s, 0], [.2126 - .2126 * s, .7152 - .7152 * s, .0722 + .9278 * s, 0]]); }
    else if (f === 'sepia'){ const s = 1 - Math.min(1, a); mul([[.393 + .607 * s, .769 - .769 * s, .189 - .189 * s, 0], [.349 - .349 * s, .686 + .314 * s, .168 - .168 * s, 0], [.272 - .272 * s, .534 - .534 * s, .131 + .869 * s, 0]]); }
    else if (f === 'hue-rotate'){ const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); mul([[.213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928, 0], [.213 - c * .213 + s * .143, .715 + c * .285 + s * .140, .072 - c * .072 - s * .283, 0], [.213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072, 0]]); }
    else if (f === 'contrast'){ const o = .5 - .5 * a; mul([[a,0,0,o],[0,a,0,o],[0,0,a,o]]); }
    else if (f === 'brightness'){ mul([[a,0,0,0],[0,a,0,0],[0,0,a,0]]); }
  }
  return M;
}
// monotone cubic curve through points → 256 values (0..1)
function curve256(pts){
  const p = [...pts].sort((a, b) => a[0] - b[0]), n = p.length, out = new Float32Array(256);
  if (n < 2){ for (let i = 0; i < 256; i++) out[i] = i / 255; return out; }
  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++){ dx.push(Math.max(1e-6, p[i + 1][0] - p[i][0])); dy.push((p[i + 1][1] - p[i][1]) / dx[i]); }
  m.push(dy[0]); for (let i = 1; i < n - 1; i++) m.push(dy[i - 1] * dy[i] <= 0 ? 0 : 3 * (dx[i - 1] + dx[i]) / ((2 * dx[i] + dx[i - 1]) / dy[i - 1] + (dx[i] + 2 * dx[i - 1]) / dy[i])); m.push(dy[n - 2]);
  for (let i = 0; i < 256; i++){
    const x = i / 255; let y;
    if (x <= p[0][0]) y = p[0][1]; else if (x >= p[n - 1][0]) y = p[n - 1][1];
    else { let k = 0; while (k < n - 2 && x > p[k + 1][0]) k++; const h = dx[k], t = (x - p[k][0]) / h, t2 = t * t, t3 = t2 * t;
      y = (2 * t3 - 3 * t2 + 1) * p[k][1] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * p[k + 1][1] + (t3 - t2) * h * m[k + 1]; }
    out[i] = clamp(y, 0, 1);
  }
  return out;
}
function curvesLUT(pts){
  const M = curve256(pts.rgb), ch = [curve256(pts.r), curve256(pts.g), curve256(pts.b)], u = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++){ for (let c = 0; c < 3; c++){ const x = M[i] * 255, a = Math.floor(x), f = x - a, v = ch[c][a] * (1 - f) + ch[c][Math.min(255, a + 1)] * f; u[i * 4 + c] = Math.round(v * 255); } u[i * 4 + 3] = 255; }
  return u;
}
const isIdCurve = pts => ['rgb','r','g','b'].every(k => pts[k].length === 2 && pts[k][0][0] === 0 && pts[k][0][1] === 0 && pts[k][1][0] === 1 && pts[k][1][1] === 1);

// 3×3 matrices (row-major) for geometry: output uv → input uv
const m3 = { mul:(A, B) => { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return r; },
  T:(x, y) => [1,0,x, 0,1,y, 0,0,1], S:(x, y) => [x,0,0, 0,y,0, 0,0,1], R:a => { const c = Math.cos(a), s = Math.sin(a); return [c,-s,0, s,c,0, 0,0,1]; },
  inv:(m) => { const [a,b,c,d,e,f,g,h,i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g), G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d, det = a * A + b * B + c * C; return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, I / det]; },
  ap:(m, x, y) => { const z = m[6] * x + m[7] * y + m[8]; return [(m[0] * x + m[1] * y + m[2]) / z, (m[3] * x + m[4] * y + m[5]) / z]; } };
// unit square → quad (x0..x3 = TL, TR, BR, BL)
function sq2quad(q){
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] = q, dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0, 1];
  const den = dx1 * dy2 - dx2 * dy1, g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
// the frame the crop works in: input rotated by 90° steps + flips, then straightened by `angle`
function cropFrame(p, W, H){ const odd = (p.rot & 1) === 1; return odd ? [H, W] : [W, H]; }
function cropMatrix(p, W, H, full){
  const [Fw, Fh] = cropFrame(p, W, H), r = full ? { x:0, y:0, w:1, h:1 } : p.rect;
  // output uv → frame px
  let M = m3.mul(m3.T(r.x * Fw, r.y * Fh), m3.S(r.w * Fw, r.h * Fh));
  // un-straighten about the frame centre
  M = m3.mul(m3.mul(m3.mul(m3.T(Fw / 2, Fh / 2), m3.R(-(p.angle || 0) * Math.PI / 180)), m3.T(-Fw / 2, -Fh / 2)), M);
  // frame px → input px: flip, then undo the 90° steps
  let G = m3.T(0, 0);
  if (p.fh) G = m3.mul(m3.mul(m3.T(Fw, 0), m3.S(-1, 1)), G);
  if (p.fv) G = m3.mul(m3.mul(m3.T(0, Fh), m3.S(1, -1)), G);
  const k = ((p.rot % 4) + 4) % 4; let Rk;
  if (k === 0) Rk = m3.T(0, 0); else if (k === 1) Rk = [0,1,0, -1,0,H, 0,0,1]; else if (k === 2) Rk = [-1,0,W, 0,-1,H, 0,0,1]; else Rk = [0,-1,W, 1,0,0, 0,0,1];
  M = m3.mul(Rk, m3.mul(G, M));
  return m3.mul(m3.S(1 / W, 1 / H), M);
}
// does the crop rect (in frame uv) stay inside the straightened picture?
function cropInside(p, W, H, r){
  const [Fw, Fh] = cropFrame(p, W, H), a = (p.angle || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  for (const [u, v] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]){
    const x = u * Fw - Fw / 2, y = v * Fh - Fh / 2, xr = c * x + s * y, yr = -s * x + c * y;
    if (Math.abs(xr) > Fw / 2 + .5 || Math.abs(yr) > Fh / 2 + .5) return false;
  }
  return true;
}
function fitCrop(p, W, H){
  const r = p.rect; r.w = clamp(r.w, .02, 1); r.h = clamp(r.h, .02, 1); r.x = clamp(r.x, 0, 1 - r.w); r.y = clamp(r.y, 0, 1 - r.h);
  if (cropInside(p, W, H, r)) return;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2; let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++){ const k = (lo + hi) / 2, t = { x:cx - r.w * k / 2, y:cy - r.h * k / 2, w:r.w * k, h:r.h * k }; if (cropInside(p, W, H, t)) lo = k; else hi = k; }
  let t = { x:cx - r.w * lo / 2, y:cy - r.h * lo / 2, w:r.w * lo, h:r.h * lo };
  if (lo < .05){ // pull toward the centre
    for (let j = 1; j <= 20 && !cropInside(p, W, H, t); j++){ const f = j / 20, nx = cx + (.5 - cx) * f, ny = cy + (.5 - cy) * f; let lo2 = 0, hi2 = 1; for (let i = 0; i < 20; i++){ const k = (lo2 + hi2) / 2, tt = { x:nx - r.w * k / 2, y:ny - r.h * k / 2, w:r.w * k, h:r.h * k }; if (cropInside(p, W, H, tt)) lo2 = k; else hi2 = k; } t = { x:nx - r.w * lo2 / 2, y:ny - r.h * lo2 / 2, w:r.w * lo2, h:r.h * lo2 }; }
  }
  Object.assign(r, t);
}
function perspMatrix(p, W, H){
  const tv = (p.tv || 0) / 100 * .3, th = (p.th || 0) / 100 * .3, a = (p.rot || 0) / 100 * 15 * Math.PI / 180, sc = Math.pow(2, -(p.scale || 0) / 100 * .6);
  let q = [[tv, 0], [1 - tv, 0], [1 + 0, 1], [0, 1]];           // vertical: pull the top corners in (fixes converging verticals when > 0)
  q = q.map(([x, y], i) => [x, y + (i === 0 || i === 3 ? th * (i === 0 ? 1 : -1) : 0)]);   // horizontal tilt on the left edge
  const Hm = sq2quad(q);
  // rotate + scale about the centre, in pixel space
  const A = m3.mul(m3.S(1 / W, 1 / H), m3.mul(m3.T(W / 2, H / 2), m3.mul(m3.R(a), m3.mul(m3.S(sc, sc), m3.mul(m3.T(-W / 2, -H / 2), m3.S(W, H))))));
  return m3.mul(Hm, A);
}

/* ---------- shaders (WebGL2). Each one has a JavaScript twin in CPU below, used when WebGL is not available ---------- */
const GH = `#version 300 es
precision highp float; precision highp int;
in vec2 v; out vec4 o; uniform sampler2D T; uniform vec2 uPx; uniform float uAsp;
float luma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 gam(vec3 c, float k){ return pow(max(c, 0.), vec3(exp2(-k))); }
vec3 satv(vec3 c, float k){ float l = luma(c); return l + (c - l) * (1. + k); }
vec3 conv(vec3 c, float k){ vec3 x = clamp(c, 0., 1.); vec3 s = x * x * (3. - 2. * x); return k >= 0. ? mix(c, s, k) + (c - .5) * k * .2 : mix(c, vec3(.5), -k * .5); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
`;
const FS = {
  copy:`void main(){ o = texture(T, v); }`,
  down:`void main(){ vec2 a = uPx * .25; o = .25 * (texture(T, v + vec2(-a.x,-a.y)) + texture(T, v + vec2(a.x,-a.y)) + texture(T, v + vec2(-a.x,a.y)) + texture(T, v + a)); }`,
  blur:`uniform vec2 uDir; uniform float uSig;
    void main(){ vec4 a = vec4(0); float ws = 0.; for (int i = -12; i <= 12; i++){ float x = float(i); float w = exp(-x * x / (2. * uSig * uSig)); a += texture(T, v + uDir * x) * w; ws += w; } o = a / ws; }`,
  color:`uniform sampler2D B; uniform sampler2D C; uniform int uUseB, uUseC, uUseM, uMono;
    uniform float uBri, uCon, uSat, uVib, uAmb, uHi, uSh, uWarm, uTint, uFade, uSplit, uToneAmt, uWash, uAmt;
    uniform mat4 uM; uniform vec4 uMo; uniform vec3 uMonoW, uToneS, uToneH;
    void main(){ vec4 s = texture(T, v); vec3 c = s.rgb;
      float Lb = uUseB == 1 ? luma(texture(B, v).rgb) : luma(c);
      c *= vec3(1. + uWarm * .14 + uTint * .05, 1. + uWarm * .03 - uTint * .10, 1. - uWarm * .16 + uTint * .05);
      if (uMono == 1) c = vec3(dot(c, uMonoW));
      float L = mix(luma(c), Lb, .7), ws = 1. - smoothstep(0., .55, L), wh = smoothstep(.45, 1., L);
      c *= exp2(uSh * ws * 1.3 + uHi * wh * 1.1);
      c *= 1. + uAmb * (.5 - Lb) * 1.2;
      c = gam(c, uBri * 1.1);
      c = conv(c, uCon);
      float l = luma(c), sa = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
      c = l + (c - l) * (1. + uSat + uVib * (1. - clamp(sa, 0., 1.)) * 1.2 + uAmb * .25);
      c += uSplit * (vec3(.07, 0., -.06) * smoothstep(.45, 1., l) + vec3(-.05, .01, .07) * (1. - smoothstep(0., .55, l)));
      c = mix(c, .06 + c * .86, uFade);
      if (uUseM == 1) c = (uM * vec4(c, 1.)).rgb;
      c = clamp(c, 0., 1.);
      if (uUseC == 1){ vec3 q = c * (255. / 256.) + .5 / 256.; c = vec3(texture(C, vec2(q.r, .5)).r, texture(C, vec2(q.g, .5)).g, texture(C, vec2(q.b, .5)).b); }
      if (uToneAmt > 0.){ float m = luma(c); c = mix(c, vec3(m) * mix(uToneS, uToneH, m), uToneAmt); }
      c = mix(c, vec3(1.), uWash);
      o = vec4(mix(s.rgb, clamp(c, 0., 1.), uAmt), s.a); }`,
  local:`uniform sampler2D B1, B2, B3; uniform float uSharp, uStruct, uTH, uTM, uTL, uHdr, uDrama, uHaze, uSatK, uBriK, uWarmK;
    void main(){ vec4 s = texture(T, v); vec3 c = s.rgb, b1 = texture(B1, v).rgb, b2 = texture(B2, v).rgb, b3 = texture(B3, v).rgb;
      c += (c - b1) * uSharp * 2.5;
      float edge = smoothstep(.04, .2, length(b2 - b3));
      c += (b1 - b2) * uStruct * 3. * (1. - .6 * edge);
      float L = luma(c), wl = 1. - smoothstep(0., .5, L), wm = 1. - abs(2. * L - 1.), wh = smoothstep(.5, 1., L), k = uTH * wh + uTM * wm + uTL * wl;
      c += (c - b2) * k * 2. + (b2 - b3) * k;
      c += (c - b3) * uHdr * 1.6 + (b1 - b2) * uHdr * 1.2;
      c += (c - b3) * uDrama * 2.2;
      float h = min(min(b3.r, b3.g), b3.b) * uHaze * .9; c = (c - h) / max(.15, 1. - h);
      c = satv(c, uSatK); c = gam(c, uBriK); c *= vec3(1. + uWarmK * .12, 1., 1. - uWarmK * .14);
      o = vec4(clamp(c, 0., 1.), s.a); }`,
  glow:`uniform sampler2D B; uniform float uGlow, uSat, uWarm, uHal;
    void main(){ vec4 s = texture(T, v); vec3 c = s.rgb, g = texture(B, v).rgb;
      c = mix(c, g, uGlow * .25); c = 1. - (1. - c) * (1. - g * uGlow * .85);
      float h = smoothstep(.55, 1., luma(g)); c += h * vec3(1., .3, .15) * uHal * .6;
      c = satv(c, uSat); c *= vec3(1. + uWarm * .12, 1., 1. - uWarm * .14);
      o = vec4(clamp(c, 0., 1.), s.a); }`,
  lens:`uniform sampler2D B; uniform vec2 uC; uniform float uR, uTr, uStr, uVig, uBok, uAng, uMaxR; uniform int uLin, uShow;
    void main(){ vec4 s = texture(T, v); vec2 q = v - uC; q.x *= uAsp; float ca = cos(uAng), sa = sin(uAng);
      float d = uLin == 1 ? abs(-sa * q.x + ca * q.y) / uR : length(q) / uR;
      float m = smoothstep(1., 1. + uTr * 3. + .05, d);
      float rad = m * uStr * uMaxR; vec3 c = s.rgb;
      if (rad > .5){ vec3 a = vec3(0); float ws = 0.; float rot = hash(v * 731.) * 6.2832;
        for (int i = 0; i < 40; i++){ float fi = float(i); float r = sqrt((fi + .5) / 40.) * rad; float an = fi * 2.39996 + rot; vec3 t = texture(B, v + vec2(cos(an), sin(an)) * r * uPx).rgb; float w = 1. + uBok * pow(luma(t), 4.) * 8.; a += t * w; ws += w; }
        c = mix(c, a / ws, smoothstep(.5, 2., rad)); }
      c *= 1. - m * uVig * .6;
      if (uShow == 1) c = mix(c, vec3(1., .2, .3), (1. - m) * .35);
      o = vec4(c, s.a); }`,
  fx:`uniform vec2 uVC; uniform float uVO, uVI, uVS, uGrain, uGF, uGAmp, uLeak, uScr, uSeed, uHal; uniform vec3 uFT; uniform float uFK, uFFade, uFCon, uFSat; uniform sampler2D B; uniform int uUseB;
    void main(){ vec4 s = texture(T, v); vec3 c = s.rgb;
      if (uHal > 0. && uUseB == 1){ vec3 g = texture(B, v).rgb; float h = smoothstep(.6, 1., luma(g)); c += h * vec3(1., .25, .1) * uHal * .55; }
      if (uFK > 0.){ vec3 f = conv(c, uFCon); f = satv(f, uFSat); f *= uFT; f = mix(f, .07 + f * .85, uFFade); c = mix(c, f, uFK); }
      if (uLeak > 0.){ vec3 lk = vec3(0); for (int i = 0; i < 3; i++){ float fi = float(i) + uSeed * 3.1; vec2 p = vec2(hash(vec2(fi, 1.7)), hash(vec2(fi, 9.2))); p = mix(p, step(.5, p), .65); vec2 q = (v - p) * vec2(uAsp, 1.); float r = .35 + .4 * hash(vec2(fi, 4.4)); vec3 col = mix(vec3(1., .35, .1), vec3(1., .75, .3), hash(vec2(fi, 7.))); lk += col * exp(-dot(q, q) / (r * r)); } c = 1. - (1. - c) * (1. - clamp(lk * uLeak * .8, 0., 1.)); }
      if (uScr > 0.){ float x = v.x * 900. + uSeed * 17.; float ln = step(.997, hash(vec2(floor(x), floor(uSeed)))) * (.5 + .5 * vnoise(vec2(x * .1, v.y * 6.))); float dust = step(.9993, hash(floor(v * vec2(uAsp, 1.) * 600.) + uSeed)); c = mix(c, vec3(.92), ln * uScr * .7); c = mix(c, vec3(.08), dust * uScr); }
      if (uVO != 0. || uVI != 0.){ vec2 q = (v - uVC) * vec2(uAsp, 1.) / max(uAsp, 1.); float d = length(q) / max(.05, uVS); float w = smoothstep(.3, 1.15, d); c *= exp2(uVO * w * 1.5 + uVI * (1. - w) * .8); }
      if (uGrain > 0.){ vec2 g = v * vec2(uAsp, 1.) * uGF; float n = vnoise(g + uSeed) * .6 + vnoise(g * 2.1 + 3.7) * .4; float L = luma(c); c += (n - .5) * uGrain * uGAmp * (.45 + .55 * (1. - abs(2. * L - 1.))); }
      o = vec4(clamp(c, 0., 1.), s.a); }`,
  frame:`uniform int uStyle; uniform float uW; uniform vec3 uCol; uniform vec2 uSize;
    void main(){ vec4 s = texture(T, v); vec3 c = s.rgb; float mn = min(uSize.x, uSize.y); vec2 p = v * uSize / mn, S = uSize / mn;
      float l = p.x, r = S.x - p.x, t = p.y, b = S.y - p.y, w = uW * .08 + .004, inside = 1.;
      if (uStyle == 0) inside = step(w * .35, min(min(l, r), min(t, b)));
      else if (uStyle == 1) inside = step(w, min(min(l, r), min(t, b)));
      else if (uStyle == 2){ vec2 hs = S * .5 - w; float rr = w * 1.6; vec2 d = abs(p - S * .5) - (hs - rr); float sd = length(max(d, 0.)) + min(max(d.x, d.y), 0.) - rr; inside = 1. - smoothstep(-.002, .002, sd); }
      else if (uStyle == 3) inside = step(w * .8, min(min(l, r), t)) * step(w * 3.2, b);
      else if (uStyle == 4){ float e = w * 1.4; inside = step(e, min(t, b)) * step(w * .3, min(l, r)); float hole = step(abs(fract(p.x / (e * .9)) - .5), .22) * step(e * .3, min(t, b)) * step(min(t, b), e * .7); c = mix(c, vec3(.95), 0.); if (inside < .5){ c = mix(uCol, vec3(.92), hole); o = vec4(c, s.a); return; } }
      else if (uStyle == 5){ float d = min(min(l, r), min(t, b)); inside = smoothstep(0., w * 2.2, d); }
      else if (uStyle == 6){ float d = min(min(l, r), min(t, b)); inside = step(w, d) * (1. - step(w * 1.25, d) * (1. - step(w * 1.45, d))); }
      o = vec4(mix(uCol, c, inside), s.a); }`,
  geo:`uniform mat3 uH; uniform int uFill; uniform sampler2D B;
    void main(){ vec3 p = uH * vec3(v, 1.); vec2 q = p.xy / p.z;
      if (q.x >= 0. && q.y >= 0. && q.x <= 1. && q.y <= 1.){ o = texture(T, q); return; }
      if (uFill == 2){ vec2 m = 1. - abs(1. - mod(q, 2.)); vec2 cq = clamp(q, 0., 1.); float dd = length((q - cq) * vec2(uAsp, 1.)); o = vec4(mix(texture(T, cq).rgb, texture(B, m).rgb, smoothstep(0., .06, dd)), 1.); o.rgb += (hash(v * 997.) - .5) * .012; return; }
      o = vec4(vec3(uFill == 1 ? 1. : 0.), 1.); }`,
  heal:`uniform sampler2D B; uniform vec4 uS[16]; uniform int uN;
    vec3 ring(vec2 c, float r){ vec3 a = vec3(0); for (int k = 0; k < 8; k++){ float an = float(k) * .7854; a += texture(B, c + vec2(cos(an) / uAsp, sin(an)) * r).rgb; } return a / 8.; }
    void main(){ vec4 s = texture(T, v); vec3 c = s.rgb;
      for (int i = 0; i < 16; i++){ if (i >= uN) break; vec2 ce = uS[i].xy; float r = uS[i].z; vec2 q = v - ce; q.x *= uAsp; float dd = length(q); if (dd >= r) continue;
        vec3 rm = ring(ce, r * 1.2); vec2 best = vec2(0); float bs = 1e9;
        for (int k = 0; k < 8; k++){ float an = float(k) * .7854 + .39; vec2 off = vec2(cos(an) / uAsp, sin(an)) * r * 2.4; vec2 cc = ce + off; if (cc.x < 0. || cc.y < 0. || cc.x > 1. || cc.y > 1.) continue; vec3 m2 = ring(cc, r * 1.2); vec3 dm = texture(B, cc).rgb; float sc = length(m2 - rm) + .5 * length(dm - m2); if (sc < bs){ bs = sc; best = off; } }
        vec3 acc = vec3(0); float wsum = 0.;
        for (int k = 0; k < 24; k++){ float an = float(k) * .2618; vec2 bq = vec2(cos(an), sin(an)) * r * 1.15; vec3 bc = texture(B, ce + vec2(bq.x / uAsp, bq.y)).rgb; float w = 1. / (dot(q - bq, q - bq) + 1e-6); acc += bc * w; wsum += w; }
        vec3 fill = acc / wsum; vec2 sp = v + best; fill += texture(T, sp).rgb - texture(B, sp).rgb;
        c = mix(c, fill, smoothstep(r, r * .55, dd)); }
      o = vec4(clamp(c, 0., 1.), s.a); }`,
  sel:`uniform sampler2D B; uniform vec4 uP[8]; uniform vec4 uA[8]; uniform int uN, uShow;
    void main(){ vec4 s = texture(T, v); vec3 c = s.rgb, base = texture(B, v).rgb; float ms = 0.;
      for (int i = 0; i < 8; i++){ if (i >= uN) break; vec4 P = uP[i], A = uA[i]; vec2 q = v - P.xy; q.x *= uAsp; float ds = length(q) / P.z; float wsp = exp(-ds * ds * 2.5);
        vec3 k = texture(B, P.xy).rgb; float dc = length(base - k); float w = wsp * mix(1., exp(-dc * dc / (2. * .14 * .14)), .8);
        vec3 a = gam(c, A.x * 1.1); a = conv(a, A.y); a = satv(a, A.z); a += (c - base) * A.w * 2.5;
        c = mix(c, a, w); ms = max(ms, w * P.w); }
      if (uShow == 1) c = mix(c, vec3(1., .15, .2), ms * .55);
      o = vec4(clamp(c, 0., 1.), s.a); }`,
  brush:`uniform sampler2D M; uniform int uShow;
    void main(){ vec4 s = texture(T, v); vec3 c = s.rgb; vec4 d = (texture(M, v) - .5) * 2.;
      c = gam(c, d.r * 1.0); c *= exp2(d.g * 1.2); c *= vec3(1. + d.b * .18, 1., 1. - d.b * .2); c = satv(c, d.a);
      if (uShow == 1) c = mix(c, vec3(1., .3, .1), clamp(length(d) * .8, 0., .6));
      o = vec4(clamp(c, 0., 1.), s.a); }`,
  mix:`uniform sampler2D A, M; uniform int uInv, uShow;
    void main(){ vec4 b = texture(T, v), a = texture(A, v); float m = texture(M, v).r; if (uInv == 1) m = 1. - m; o = mix(b, a, m); if (uShow == 1) o.rgb = mix(o.rgb, vec3(1., .2, .3), m * .45); }`,
  over:`uniform sampler2D O; uniform int uMode; uniform float uOp; uniform vec2 uSc, uOff;
    void main(){ vec4 s = texture(T, v); vec3 c = s.rgb; vec2 q = (v - .5 - uOff) / uSc + .5; if (q.x < 0. || q.y < 0. || q.x > 1. || q.y > 1.){ o = s; return; }
      vec4 t = texture(O, q); vec3 b = t.rgb, r = b;
      if (uMode == 1) r = 1. - (1. - c) * (1. - b); else if (uMode == 2) r = c * b; else if (uMode == 3) r = mix(2. * c * b, 1. - 2. * (1. - c) * (1. - b), step(.5, c)); else if (uMode == 4) r = max(c, b); else if (uMode == 5) r = min(c, b);
      o = vec4(mix(c, r, t.a * uOp), s.a); }`,
  disp:`uniform sampler2D T2; uniform float uSplit; uniform int uUse2;
    void main(){ vec2 q = vec2(v.x, 1. - v.y); o = (uUse2 == 1 && v.x < uSplit) ? texture(T2, q) : texture(T, q); o.a = 1.; }`,
};

class GLEngine {
  constructor(canvas, opts = {}){
    this.kind = 'webgl2'; this.cv = canvas;
    const gl = canvas.getContext('webgl2', { premultipliedAlpha:false, preserveDrawingBuffer:true, antialias:false, alpha:false });
    if (!gl) throw new Error('no webgl2');
    this.gl = gl; this.max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.half = !opts.lowMem && !!gl.getExtension('EXT_color_buffer_float'); gl.getExtension('OES_texture_float_linear');
    this.progs = {}; this.pool = []; this.live = 0;
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    this.vb = vb; this.fb = gl.createFramebuffer();
    this.dummy = this.fromData(new Uint8Array([128,128,128,255]), 1, 1);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
  }
  prog(name){
    if (this.progs[name]) return this.progs[name];
    const gl = this.gl, sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(name + ': ' + gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, `#version 300 es\nin vec2 p; out vec2 v; void main(){ v = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, GH + FS[name])); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ': ' + gl.getProgramInfoLog(p));
    const U = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++){ const a = gl.getActiveUniform(p, i), nm = a.name.replace(/\[0\]$/, ''); U[nm] = { loc:gl.getUniformLocation(p, a.name), type:a.type, size:a.size }; }
    return (this.progs[name] = { p, U });
  }
  alloc(w, h, fmt8){
    const gl = this.gl, i = this.pool.findIndex(t => t.w === w && t.h === h && t.f8 === !!fmt8);
    if (i >= 0){ const t = this.pool.splice(i, 1)[0]; this.live++; return t; }
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    const hf = this.half && !fmt8;
    gl.texImage2D(gl.TEXTURE_2D, 0, hf ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, hf ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    this.texParams(); this.live++;
    return { tex, w, h, f8:!!fmt8 };
  }
  texParams(){ const gl = this.gl; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
  free(t){ if (!t || t.keep || t === this.dummy) return; this.live--; this.pool.push(t); if (this.pool.length > 14){ const x = this.pool.shift(); this.gl.deleteTexture(x.tex); } }
  drop(t){ if (!t) return; if (t.keep){ t.keep = false; } this.gl.deleteTexture(t.tex); }
  fromSource(src, w, h){
    const gl = this.gl, tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src); this.texParams();
    return { tex, w, h, f8:true, keep:true };
  }
  fromData(u8, w, h){ const gl = this.gl, tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, u8); this.texParams(); return { tex, w, h, f8:true, keep:true }; }
  run(name, ins, U, w, h, out){
    const gl = this.gl, P = this.prog(name), t = out || this.alloc(w, h, U && U.__f8);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    gl.viewport(0, 0, w, h); this.draw(P, ins, { uPx:[1 / w, 1 / h], uAsp:w / h, ...U });
    return t;
  }
  draw(P, ins, U){
    const gl = this.gl; gl.useProgram(P.p); let unit = 0;
    for (const k in P.U){
      const u = P.U[k];
      if (u.type === gl.SAMPLER_2D){ const t = ins[k] || this.dummy; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.uniform1i(u.loc, unit++); continue; }
      let val = U[k]; if (val === undefined) val = 0;
      if (u.type === gl.FLOAT) gl.uniform1f(u.loc, val);
      else if (u.type === gl.INT || u.type === gl.BOOL) gl.uniform1i(u.loc, val | 0);
      else if (u.type === gl.FLOAT_VEC2) gl.uniform2fv(u.loc, val || [0, 0]);
      else if (u.type === gl.FLOAT_VEC3) gl.uniform3fv(u.loc, val || [0, 0, 0]);
      else if (u.type === gl.FLOAT_VEC4) gl.uniform4fv(u.loc, val.length ? val : new Float32Array(4 * u.size));
      else if (u.type === gl.FLOAT_MAT3) gl.uniformMatrix3fv(u.loc, true, val || [1,0,0,0,1,0,0,0,1]);
      else if (u.type === gl.FLOAT_MAT4) gl.uniformMatrix4fv(u.loc, false, val || [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  // gaussian blur with standard deviation `sig` (pixels of t); big blurs run on a smaller copy
  blur(t, sig){
    let cur = t, w = t.w, h = t.h, s = sig, made = [];
    while (s > 4 && w > 24 && h > 24){ const nw = Math.max(8, Math.round(w / 2)), nh = Math.max(8, Math.round(h / 2)); const d = this.run('down', { T:cur }, {}, nw, nh); if (cur !== t) made.push(cur); cur = d; s *= nw / w; w = nw; h = nh; }
    const a = this.run('blur', { T:cur }, { uDir:[1 / w, 0], uSig:Math.max(.3, s) }, w, h), b = this.run('blur', { T:a }, { uDir:[0, 1 / h], uSig:Math.max(.3, s) }, w, h);
    this.free(a); if (cur !== t) this.free(cur); made.forEach(x => this.free(x));
    return b;
  }
  read(t, x = 0, y = 0, w = t.w, h = t.h){
    const gl = this.gl; let src = t;
    if (!t.f8){ src = this.run('copy', { T:t }, { __f8:1 }, t.w, t.h); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, src.tex, 0);
    const u = new Uint8Array(w * h * 4); gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, u);
    if (src !== t) this.free(src);
    return u;
  }
  show(t, t2, split){
    const gl = this.gl, cv = this.cv; if (cv.width !== t.w || cv.height !== t.h){ cv.width = t.w; cv.height = t.h; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, t.w, t.h);
    this.draw(this.prog('disp'), { T:t, T2:t2 || t }, { uSplit:split || 0, uUse2:t2 ? 1 : 0, uPx:[1 / t.w, 1 / t.h], uAsp:t.w / t.h });
  }
  // small RGBA copy for the histogram / thumbnails
  small(t, W){ const w = Math.max(1, Math.min(W, t.w)), h = Math.max(1, Math.round(w * t.h / t.w)); let cur = t, cw = t.w, ch = t.h; const made = []; while (cw / 2 > w){ cw = Math.round(cw / 2); ch = Math.round(ch / 2); const d = this.run('down', { T:cur }, {}, cw, ch); made.push(d); cur = d; } const s = this.run('copy', { T:cur }, { __f8:1 }, w, h); const u = this.read(s); this.free(s); made.forEach(x => this.free(x)); return { d:u, w, h }; }
  destroy(){ const gl = this.gl; this.pool.forEach(t => gl.deleteTexture(t.tex)); this.pool = []; const x = gl.getExtension('WEBGL_lose_context'); if (x && this.kind === 'webgl2-offscreen') x.loseContext(); }
}

/* ---------- Canvas2D / CPU fallback: the same passes in plain JavaScript (slower, used only without WebGL2) ---------- */
const fract = x => x - Math.floor(x), sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }, mixf = (a, b, t) => a + (b - a) * t;
const lumaJ = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
function hashJ(x, y){ x = fract(x * 123.34); y = fract(y * 456.21); const d = x * (x + 45.32) + y * (y + 45.32); x += d; y += d; return fract(x * y); }
function vnoiseJ(x, y){ const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); return mixf(mixf(hashJ(ix, iy), hashJ(ix + 1, iy), fx), mixf(hashJ(ix, iy + 1), hashJ(ix + 1, iy + 1), fx), fy); }
const gamJ = (c, k) => { const e = Math.pow(2, -k); c[0] = Math.pow(Math.max(c[0], 0), e); c[1] = Math.pow(Math.max(c[1], 0), e); c[2] = Math.pow(Math.max(c[2], 0), e); };
const satJ = (c, k) => { const l = lumaJ(c[0], c[1], c[2]); for (let i = 0; i < 3; i++) c[i] = l + (c[i] - l) * (1 + k); };
const conJ = (c, k) => { for (let i = 0; i < 3; i++){ const x = clamp(c[i], 0, 1), s = x * x * (3 - 2 * x); c[i] = k >= 0 ? mixf(c[i], s, k) + (c[i] - .5) * k * .2 : mixf(c[i], .5, -k * .5); } };
function SMP(t, u, v, o){ // bilinear, clamp to edge; t.d is RGBA bytes
  const x = clamp(u * t.w - .5, 0, t.w - 1), y = clamp(v * t.h - .5, 0, t.h - 1), x0 = x | 0, y0 = y | 0, x1 = Math.min(t.w - 1, x0 + 1), y1 = Math.min(t.h - 1, y0 + 1), fx = x - x0, fy = y - y0, d = t.d, w = t.w;
  const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, e = (y1 * w + x1) * 4;
  for (let i = 0; i < 4; i++) o[i] = ((d[a + i] * (1 - fx) + d[b + i] * fx) * (1 - fy) + (d[c + i] * (1 - fx) + d[e + i] * fx) * fy) / 255;
  return o;
}
const CPUFX = {
  copy(o, x, y, I){ SMP(I.T, x, y, o); },
  color(o, u, v, I, U, t1){ SMP(I.T, u, v, o); const s0 = o[0], s1 = o[1], s2 = o[2]; const c = o;
    let Lb; if (U.uUseB){ SMP(I.B, u, v, t1); Lb = lumaJ(t1[0], t1[1], t1[2]); } else Lb = lumaJ(c[0], c[1], c[2]);
    c[0] *= 1 + U.uWarm * .14 + U.uTint * .05; c[1] *= 1 + U.uWarm * .03 - U.uTint * .1; c[2] *= 1 - U.uWarm * .16 + U.uTint * .05;
    if (U.uMono){ const m = c[0] * U.uMonoW[0] + c[1] * U.uMonoW[1] + c[2] * U.uMonoW[2]; c[0] = c[1] = c[2] = m; }
    const L = mixf(lumaJ(c[0], c[1], c[2]), Lb, .7), ws = 1 - sstep(0, .55, L), wh = sstep(.45, 1, L), g = Math.pow(2, U.uSh * ws * 1.3 + U.uHi * wh * 1.1) * (1 + U.uAmb * (.5 - Lb) * 1.2);
    c[0] *= g; c[1] *= g; c[2] *= g; gamJ(c, U.uBri * 1.1); conJ(c, U.uCon);
    const l = lumaJ(c[0], c[1], c[2]), sa = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]), k = 1 + U.uSat + U.uVib * (1 - clamp(sa, 0, 1)) * 1.2 + U.uAmb * .25;
    for (let i = 0; i < 3; i++) c[i] = l + (c[i] - l) * k;
    const hs = sstep(.45, 1, l), ss = 1 - sstep(0, .55, l); c[0] += U.uSplit * (.07 * hs - .05 * ss); c[1] += U.uSplit * (.01 * ss); c[2] += U.uSplit * (-.06 * hs + .07 * ss);
    for (let i = 0; i < 3; i++) c[i] = mixf(c[i], .06 + c[i] * .86, U.uFade);
    if (U.uUseM){ const M = U.M3, r = c[0], gg = c[1], b = c[2]; for (let i = 0; i < 3; i++) c[i] = M[i][0] * r + M[i][1] * gg + M[i][2] * b + M[i][3]; }
    for (let i = 0; i < 3; i++) c[i] = clamp(c[i], 0, 1);
    if (U.uUseC){ const C = U.lut; for (let i = 0; i < 3; i++){ const x = c[i] * 255, a = x | 0, f = x - a; c[i] = (C[a * 4 + i] * (1 - f) + C[Math.min(255, a + 1) * 4 + i] * f) / 255; } }
    if (U.uToneAmt > 0){ const m = lumaJ(c[0], c[1], c[2]); for (let i = 0; i < 3; i++) c[i] = mixf(c[i], m * mixf(U.uToneS[i], U.uToneH[i], m), U.uToneAmt); }
    for (let i = 0; i < 3; i++){ c[i] = mixf(c[i], 1, U.uWash); c[i] = mixf([s0, s1, s2][i], clamp(c[i], 0, 1), U.uAmt); }
  },
  local(o, u, v, I, U, t1, t2, t3){ SMP(I.T, u, v, o); SMP(I.B1, u, v, t1); SMP(I.B2, u, v, t2); SMP(I.B3, u, v, t3); const c = o;
    for (let i = 0; i < 3; i++) c[i] += (c[i] - t1[i]) * U.uSharp * 2.5;
    const edge = sstep(.04, .2, Math.hypot(t2[0] - t3[0], t2[1] - t3[1], t2[2] - t3[2]));
    for (let i = 0; i < 3; i++) c[i] += (t1[i] - t2[i]) * U.uStruct * 3 * (1 - .6 * edge);
    const L = lumaJ(c[0], c[1], c[2]), k = U.uTH * sstep(.5, 1, L) + U.uTM * (1 - Math.abs(2 * L - 1)) + U.uTL * (1 - sstep(0, .5, L));
    for (let i = 0; i < 3; i++){ c[i] += (c[i] - t2[i]) * k * 2 + (t2[i] - t3[i]) * k; c[i] += (c[i] - t3[i]) * U.uHdr * 1.6 + (t1[i] - t2[i]) * U.uHdr * 1.2; c[i] += (c[i] - t3[i]) * U.uDrama * 2.2; }
    const h = Math.min(t3[0], t3[1], t3[2]) * U.uHaze * .9; for (let i = 0; i < 3; i++) c[i] = (c[i] - h) / Math.max(.15, 1 - h);
    satJ(c, U.uSatK); gamJ(c, U.uBriK); c[0] *= 1 + U.uWarmK * .12; c[2] *= 1 - U.uWarmK * .14; for (let i = 0; i < 3; i++) c[i] = clamp(c[i], 0, 1);
  },
  glow(o, u, v, I, U, g){ SMP(I.T, u, v, o); SMP(I.B, u, v, g); const c = o;
    for (let i = 0; i < 3; i++){ c[i] = mixf(c[i], g[i], U.uGlow * .25); c[i] = 1 - (1 - c[i]) * (1 - g[i] * U.uGlow * .85); }
    const h = sstep(.55, 1, lumaJ(g[0], g[1], g[2])); c[0] += h * U.uHal * .6; c[1] += h * .3 * U.uHal * .6; c[2] += h * .15 * U.uHal * .6;
    satJ(c, U.uSat); c[0] *= 1 + U.uWarm * .12; c[2] *= 1 - U.uWarm * .14; for (let i = 0; i < 3; i++) c[i] = clamp(c[i], 0, 1);
  },
  lens(o, u, v, I, U, t1, t2, t3, W, H){ SMP(I.T, u, v, o); let qx = (u - U.uC[0]) * U.uAsp, qy = v - U.uC[1]; const ca = Math.cos(U.uAng), sa = Math.sin(U.uAng);
    const d = U.uLin ? Math.abs(-sa * qx + ca * qy) / U.uR : Math.hypot(qx, qy) / U.uR, m = sstep(1, 1 + U.uTr * 3 + .05, d), rad = m * U.uStr * U.uMaxR;
    if (rad > .5){ let a0 = 0, a1 = 0, a2 = 0, ws = 0; const rot = hashJ(u * 731, v * 731) * 6.2832;
      for (let i = 0; i < 24; i++){ const r = Math.sqrt((i + .5) / 24) * rad, an = i * 2.39996 + rot; SMP(I.B, u + Math.cos(an) * r / W, v + Math.sin(an) * r / H, t1); const w = 1 + U.uBok * Math.pow(lumaJ(t1[0], t1[1], t1[2]), 4) * 8; a0 += t1[0] * w; a1 += t1[1] * w; a2 += t1[2] * w; ws += w; }
      const k = sstep(.5, 2, rad); o[0] = mixf(o[0], a0 / ws, k); o[1] = mixf(o[1], a1 / ws, k); o[2] = mixf(o[2], a2 / ws, k); }
    for (let i = 0; i < 3; i++){ o[i] *= 1 - m * U.uVig * .6; if (U.uShow) o[i] = mixf(o[i], [1, .2, .3][i], (1 - m) * .35); }
  },
  fx(o, u, v, I, U, g){ SMP(I.T, u, v, o); const c = o, A = U.uAsp;
    if (U.uHal > 0 && U.uUseB){ SMP(I.B, u, v, g); const h = sstep(.6, 1, lumaJ(g[0], g[1], g[2])); c[0] += h * U.uHal * .55; c[1] += h * .25 * U.uHal * .55; c[2] += h * .1 * U.uHal * .55; }
    if (U.uFK > 0){ const f = [c[0], c[1], c[2]]; conJ(f, U.uFCon); satJ(f, U.uFSat); for (let i = 0; i < 3; i++){ f[i] *= U.uFT[i]; f[i] = mixf(f[i], .07 + f[i] * .85, U.uFFade); c[i] = mixf(c[i], f[i], U.uFK); } }
    if (U.uLeak > 0){ const lk = [0, 0, 0]; for (let i = 0; i < 3; i++){ const fi = i + U.uSeed * 3.1; let px = hashJ(fi, 1.7), py = hashJ(fi, 9.2); px = mixf(px, px >= .5 ? 1 : 0, .65); py = mixf(py, py >= .5 ? 1 : 0, .65); const qx = (u - px) * A, qy = v - py, r = .35 + .4 * hashJ(fi, 4.4), t = hashJ(fi, 7), e = Math.exp(-(qx * qx + qy * qy) / (r * r)); lk[0] += e; lk[1] += mixf(.35, .75, t) * e; lk[2] += mixf(.1, .3, t) * e; } for (let i = 0; i < 3; i++) c[i] = 1 - (1 - c[i]) * (1 - clamp(lk[i] * U.uLeak * .8, 0, 1)); }
    if (U.uScr > 0){ const x = u * 900 + U.uSeed * 17, ln = (hashJ(Math.floor(x), Math.floor(U.uSeed)) >= .997 ? 1 : 0) * (.5 + .5 * vnoiseJ(x * .1, v * 6)), dust = hashJ(Math.floor(u * A * 600) + U.uSeed, Math.floor(v * 600) + U.uSeed) >= .9993 ? 1 : 0; for (let i = 0; i < 3; i++){ c[i] = mixf(c[i], .92, ln * U.uScr * .7); c[i] = mixf(c[i], .08, dust * U.uScr); } }
    if (U.uVO || U.uVI){ const qx = (u - U.uVC[0]) * A / Math.max(A, 1), qy = (v - U.uVC[1]) / Math.max(A, 1), d = Math.hypot(qx, qy) / Math.max(.05, U.uVS), w = sstep(.3, 1.15, d), k = Math.pow(2, U.uVO * w * 1.5 + U.uVI * (1 - w) * .8); c[0] *= k; c[1] *= k; c[2] *= k; }
    if (U.uGrain > 0){ const gx = u * A * U.uGF, gy = v * U.uGF, n = vnoiseJ(gx + U.uSeed, gy + U.uSeed) * .6 + vnoiseJ(gx * 2.1 + 3.7, gy * 2.1 + 3.7) * .4, L = lumaJ(c[0], c[1], c[2]), k = (n - .5) * U.uGrain * U.uGAmp * (.45 + .55 * (1 - Math.abs(2 * L - 1))); c[0] += k; c[1] += k; c[2] += k; }
    for (let i = 0; i < 3; i++) c[i] = clamp(c[i], 0, 1);
  },
  frame(o, u, v, I, U){ SMP(I.T, u, v, o); const mn = Math.min(U.uSize[0], U.uSize[1]), px = u * U.uSize[0] / mn, py = v * U.uSize[1] / mn, Sx = U.uSize[0] / mn, Sy = U.uSize[1] / mn, l = px, r = Sx - px, t = py, b = Sy - py, w = U.uW * .08 + .004, st = U.uStyle, m4 = Math.min(l, r, t, b); let ins = 1;
    if (st === 0) ins = m4 >= w * .35 ? 1 : 0; else if (st === 1) ins = m4 >= w ? 1 : 0;
    else if (st === 2){ const rr = w * 1.6, dx = Math.abs(px - Sx / 2) - (Sx / 2 - w - rr), dy = Math.abs(py - Sy / 2) - (Sy / 2 - w - rr), sd = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - rr; ins = 1 - sstep(-.002, .002, sd); }
    else if (st === 3) ins = (Math.min(l, r, t) >= w * .8 && b >= w * 3.2) ? 1 : 0;
    else if (st === 4){ const e = w * 1.4; ins = (Math.min(t, b) >= e && Math.min(l, r) >= w * .3) ? 1 : 0; if (!ins){ const hole = (Math.abs(fract(px / (e * .9)) - .5) <= .22 && Math.min(t, b) >= e * .3 && Math.min(t, b) <= e * .7) ? 1 : 0; for (let i = 0; i < 3; i++) o[i] = mixf(U.uCol[i], .92, hole); return; } }
    else if (st === 5) ins = sstep(0, w * 2.2, m4); else if (st === 6) ins = (m4 >= w ? 1 : 0) * (1 - (m4 >= w * 1.25 ? 1 : 0) * (1 - (m4 >= w * 1.45 ? 1 : 0)));
    for (let i = 0; i < 3; i++) o[i] = mixf(U.uCol[i], o[i], ins);
  },
  geo(o, u, v, I, U, t1){ const M = U.uH, z = M[6] * u + M[7] * v + M[8], qx = (M[0] * u + M[1] * v + M[2]) / z, qy = (M[3] * u + M[4] * v + M[5]) / z;
    if (qx >= 0 && qy >= 0 && qx <= 1 && qy <= 1) return SMP(I.T, qx, qy, o);
    if (U.uFill === 2){ const mx = 1 - Math.abs(1 - (((qx % 2) + 2) % 2)), my = 1 - Math.abs(1 - (((qy % 2) + 2) % 2)), cx = clamp(qx, 0, 1), cy = clamp(qy, 0, 1), dd = Math.hypot((qx - cx) * U.uAsp, qy - cy); SMP(I.T, cx, cy, o); SMP(I.B, mx, my, t1); const k = sstep(0, .06, dd); for (let i = 0; i < 3; i++) o[i] = mixf(o[i], t1[i], k); o[3] = 1; return; }
    o[0] = o[1] = o[2] = U.uFill === 1 ? 1 : 0; o[3] = 1;
  },
  heal(o, u, v, I, U, t1, t2, t3){ SMP(I.T, u, v, o); const A = U.uAsp, ring = (cx, cy, r, out) => { out[0] = out[1] = out[2] = 0; for (let k = 0; k < 8; k++){ const an = k * .7854; SMP(I.B, cx + Math.cos(an) / A * r, cy + Math.sin(an) * r, t3); out[0] += t3[0] / 8; out[1] += t3[1] / 8; out[2] += t3[2] / 8; } return out; };
    for (let i = 0; i < U.uN; i++){ const cx = U.uS[i * 4], cy = U.uS[i * 4 + 1], r = U.uS[i * 4 + 2], qx = (u - cx) * A, qy = v - cy, dd = Math.hypot(qx, qy); if (dd >= r) continue;
      const rm = ring(cx, cy, r * 1.2, [0, 0, 0]); let bx = 0, by = 0, bs = 1e9;
      for (let k = 0; k < 8; k++){ const an = k * .7854 + .39, ox = Math.cos(an) / A * r * 2.4, oy = Math.sin(an) * r * 2.4, ccx = cx + ox, ccy = cy + oy; if (ccx < 0 || ccy < 0 || ccx > 1 || ccy > 1) continue; const m2 = ring(ccx, ccy, r * 1.2, [0, 0, 0]); SMP(I.B, ccx, ccy, t2); const sc = Math.hypot(m2[0] - rm[0], m2[1] - rm[1], m2[2] - rm[2]) + .5 * Math.hypot(t2[0] - m2[0], t2[1] - m2[1], t2[2] - m2[2]); if (sc < bs){ bs = sc; bx = ox; by = oy; } }
      let a0 = 0, a1 = 0, a2 = 0, ws = 0; for (let k = 0; k < 24; k++){ const an = k * .2618, bqx = Math.cos(an) * r * 1.15, bqy = Math.sin(an) * r * 1.15; SMP(I.B, cx + bqx / A, cy + bqy, t1); const w = 1 / ((qx - bqx) ** 2 + (qy - bqy) ** 2 + 1e-6); a0 += t1[0] * w; a1 += t1[1] * w; a2 += t1[2] * w; ws += w; }
      SMP(I.T, u + bx, v + by, t1); SMP(I.B, u + bx, v + by, t2); const f = sstep(r, r * .55, dd), fill = [a0 / ws + t1[0] - t2[0], a1 / ws + t1[1] - t2[1], a2 / ws + t1[2] - t2[2]];
      for (let j = 0; j < 3; j++) o[j] = clamp(mixf(o[j], fill[j], f), 0, 1); }
  },
  sel(o, u, v, I, U, base, k, a){ SMP(I.T, u, v, o); SMP(I.B, u, v, base); const c0 = [o[0], o[1], o[2]]; let ms = 0;
    for (let i = 0; i < U.uN; i++){ const P = U.uP.slice(i * 4, i * 4 + 4), Ad = U.uA.slice(i * 4, i * 4 + 4), qx = (u - P[0]) * U.uAsp, qy = v - P[1], ds = Math.hypot(qx, qy) / P[2], wsp = Math.exp(-ds * ds * 2.5);
      if (wsp < .002) continue; SMP(I.B, P[0], P[1], k); const dc = Math.hypot(base[0] - k[0], base[1] - k[1], base[2] - k[2]), w = wsp * mixf(1, Math.exp(-dc * dc / (2 * .14 * .14)), .8);
      a[0] = o[0]; a[1] = o[1]; a[2] = o[2]; gamJ(a, Ad[0] * 1.1); conJ(a, Ad[1]); satJ(a, Ad[2]); for (let j = 0; j < 3; j++){ a[j] += (c0[j] - base[j]) * Ad[3] * 2.5; o[j] = mixf(o[j], a[j], w); } ms = Math.max(ms, w * P[3]); }
    for (let j = 0; j < 3; j++){ if (U.uShow) o[j] = mixf(o[j], [1, .15, .2][j], ms * .55); o[j] = clamp(o[j], 0, 1); }
  },
  brush(o, u, v, I, U, m){ SMP(I.T, u, v, o); SMP(I.M, u, v, m); const d = [(m[0] - .5) * 2, (m[1] - .5) * 2, (m[2] - .5) * 2, (m[3] - .5) * 2];
    gamJ(o, d[0]); const e = Math.pow(2, d[1] * 1.2); o[0] *= e * (1 + d[2] * .18); o[1] *= e; o[2] *= e * (1 - d[2] * .2); satJ(o, d[3]);
    const sh = clamp(Math.hypot(d[0], d[1], d[2], d[3]) * .8, 0, .6); for (let j = 0; j < 3; j++){ if (U.uShow) o[j] = mixf(o[j], [1, .3, .1][j], sh); o[j] = clamp(o[j], 0, 1); }
  },
  mix(o, u, v, I, U, a, m){ SMP(I.T, u, v, o); SMP(I.A, u, v, a); SMP(I.M, u, v, m); let k = m[0]; if (U.uInv) k = 1 - k; for (let j = 0; j < 4; j++) o[j] = mixf(o[j], a[j], k); if (U.uShow) for (let j = 0; j < 3; j++) o[j] = mixf(o[j], [1, .2, .3][j], k * .45); },
  over(o, u, v, I, U, t){ SMP(I.T, u, v, o); const qx = (u - .5 - U.uOff[0]) / U.uSc[0] + .5, qy = (v - .5 - U.uOff[1]) / U.uSc[1] + .5; if (qx < 0 || qy < 0 || qx > 1 || qy > 1) return; SMP(I.O, qx, qy, t);
    for (let j = 0; j < 3; j++){ const c = o[j], b = t[j], md = U.uMode; let r = b; if (md === 1) r = 1 - (1 - c) * (1 - b); else if (md === 2) r = c * b; else if (md === 3) r = c < .5 ? 2 * c * b : 1 - 2 * (1 - c) * (1 - b); else if (md === 4) r = Math.max(c, b); else if (md === 5) r = Math.min(c, b); o[j] = mixf(c, r, t[3] * U.uOp); } },
};
class CPUEngine {
  constructor(canvas){ this.kind = 'canvas2d'; this.cv = canvas; this.max = 8192; this.live = 0; }
  alloc(w, h){ return { w, h, d:new Uint8ClampedArray(w * h * 4) }; }
  free(){} drop(){}
  fromSource(src, w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently:true }); g.drawImage(src, 0, 0, w, h); return { w, h, d:g.getImageData(0, 0, w, h).data, keep:true }; }
  fromData(u8, w, h){ return { w, h, d:new Uint8ClampedArray(u8.buffer ? u8.buffer.slice(0) : u8), keep:true }; }
  toCanvas(t){ const c = document.createElement('canvas'); c.width = t.w; c.height = t.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(t.d), t.w, t.h), 0, 0); return c; }
  run(name, ins, U, w, h){
    const out = this.alloc(w, h), d = out.d, f = CPUFX[name], o = [0, 0, 0, 1], a = [0, 0, 0, 0], b = [0, 0, 0, 0], c = [0, 0, 0, 0];
    U = { uAsp:w / h, ...U }; if (name === 'color' && U.uUseM) U.M3 = U.m3; if (name === 'color' && U.uUseC) U.lut = ins.C.d;
    for (const k in ins) if (!ins[k]) ins[k] = { w:1, h:1, d:new Uint8ClampedArray([128, 128, 128, 255]) };
    for (let y = 0; y < h; y++){ const vv = (y + .5) / h; for (let x = 0; x < w; x++){ const uu = (x + .5) / w; o[3] = 1; f(o, uu, vv, ins, U, a, b, c, w, h); const i = (y * w + x) * 4; d[i] = o[0] * 255; d[i + 1] = o[1] * 255; d[i + 2] = o[2] * 255; d[i + 3] = (o[3] == null ? 1 : o[3]) * 255; } }
    return out;
  }
  blur(t, sig){ const c = this.toCanvas(t), k = Math.max(1, sig / 6), w = Math.max(8, Math.round(t.w / k)), h = Math.max(8, Math.round(t.h / k)), c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const g = c2.getContext('2d', { willReadFrequently:true }); g.filter = `blur(${(sig / k).toFixed(2)}px)`; g.drawImage(c, -0, 0, w, h); return { w, h, d:g.getImageData(0, 0, w, h).data }; }
  read(t){ return new Uint8Array(t.d.buffer.slice(0)); }
  show(t, t2, split){ const cv = this.cv; if (cv.width !== t.w || cv.height !== t.h){ cv.width = t.w; cv.height = t.h; } const g = cv.getContext('2d'); g.putImageData(new ImageData(new Uint8ClampedArray(t.d), t.w, t.h), 0, 0); if (t2 && split > 0){ const c2 = this.toCanvas(t2); g.save(); g.beginPath(); g.rect(0, 0, t.w * split, t.h); g.clip(); g.drawImage(c2, 0, 0, t.w, t.h); g.restore(); } }
  small(t, W){ const w = Math.max(1, Math.min(W, t.w)), h = Math.max(1, Math.round(w * t.h / t.w)), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently:true }); g.imageSmoothingQuality = 'high'; g.drawImage(this.toCanvas(t), 0, 0, w, h); return { d:g.getImageData(0, 0, w, h).data, w, h }; }
  destroy(){}
}

/* ---------- the pipeline: each stack item becomes one or more passes ---------- */
const MONO_W = { neutral:[.2126,.7152,.0722], red:[.62,.33,.05], orange:[.48,.42,.10], yellow:[.38,.52,.10], green:[.22,.68,.10], blue:[.12,.30,.58] };
const TONES = { none:null, sepia:[[.92,.82,.68],[1.12,1.02,.86]], selenium:[[.86,.80,.92],[1.06,1.02,1.04]], cyan:[[.74,.92,1.04],[1.02,1.06,1.10]] };
const FILM = { neutral:{ t:[1,1,1], fade:.05, con:.08, sat:-.05 }, warm:{ t:[1.07,1.0,.88], fade:.1, con:.1, sat:.08 }, cool:{ t:[.92,1.0,1.08], fade:.08, con:.12, sat:-.1 }, faded:{ t:[1.02,1.0,.96], fade:.35, con:-.15, sat:-.25 }, cross:{ t:[1.05,1.08,.82], fade:.06, con:.25, sat:.2 }, silver:{ t:[1,1,1], fade:.1, con:.2, sat:-1 } };
const BL = { normal:0, screen:1, multiply:2, overlay:3, lighten:4, darken:5 };
const colorU = (o = {}) => ({ uBri:0, uCon:0, uSat:0, uVib:0, uAmb:0, uHi:0, uSh:0, uWarm:0, uTint:0, uFade:0, uSplit:0, uToneAmt:0, uWash:0, uAmt:1, uUseB:0, uUseC:0, uUseM:0, uMono:0, uMonoW:[.2126,.7152,.0722], uToneS:[1,1,1], uToneH:[1,1,1], ...o });
const localU = (o = {}) => ({ uSharp:0, uStruct:0, uTH:0, uTM:0, uTL:0, uHdr:0, uDrama:0, uHaze:0, uSatK:0, uBriK:0, uWarmK:0, ...o });
const fxU = (o = {}) => ({ uVC:[.5,.5], uVO:0, uVI:0, uVS:.6, uGrain:0, uGF:300, uGAmp:.22, uLeak:0, uScr:0, uSeed:1, uHal:0, uFT:[1,1,1], uFK:0, uFFade:0, uFCon:0, uFSat:0, uUseB:0, ...o });
const mat4of = M => [M[0][0], M[1][0], M[2][0], 0, M[0][1], M[1][1], M[2][1], 0, M[0][2], M[1][2], M[2][2], 0, M[0][3], M[1][3], M[2][3], 1];
const L_ = t => Math.max(t.w, t.h);
function colorPass(E, t, U, needB){
  let B = null; if (needB) B = E.blur(t, L_(t) * .02);
  const r = E.run('color', { T:t, B, C:U.__C || null }, colorU({ ...U, uUseB:B ? 1 : 0 }), t.w, t.h); E.free(B); return r;
}
function localPass(E, t, U, rad = [.0015, .006, .03]){
  const L = L_(t), B1 = E.blur(t, Math.max(.6, L * rad[0])), B2 = E.blur(t, Math.max(1.5, L * rad[1])), B3 = E.blur(t, Math.max(3, L * rad[2]));
  const r = E.run('local', { T:t, B1, B2, B3 }, localU(U), t.w, t.h); E.free(B1); E.free(B2); E.free(B3); return r;
}
function grainU(t, g, gs){ const L = L_(t), cells = mixf(1100, 220, gs / 100), px = L / cells; return { uGrain:g, uGF:cells / Math.max(1, t.w / t.h), uGAmp:.34 * (.65 + .35 * Math.min(1, px)) }; }
// masks: strokes (normalised to the frame) painted on a small canvas, cached
const maskCache = new Map();
function strokeCanvas(strokes, w, h, kind){
  const ML = 1024, k = ML / Math.max(w, h), cw = Math.max(8, Math.round(w * k)), ch = Math.max(8, Math.round(h * k)), mn = Math.min(cw, ch);
  const draw = (filter) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d', { willReadFrequently:true }); g.fillStyle = kind === 'mask' ? '#000' : 'rgb(128,128,128)'; g.fillRect(0, 0, cw, ch); g.lineCap = g.lineJoin = 'round';
    for (const s of strokes){ if (filter && s.mode !== filter) continue; const val = +s.v; let col;
      if (kind === 'mask') col = s.erase ? '0,0,0' : '255,255,255'; else col = val === 0 ? '128,128,128' : val > 0 ? '255,255,255' : '0,0,0';
      g.globalAlpha = kind === 'mask' ? (s.erase ? 1 : clamp(s.a == null ? 1 : s.a, 0, 1)) : (val === 0 ? 1 : Math.abs(val) / 10 * .7); g.strokeStyle = `rgb(${col})`; g.fillStyle = g.strokeStyle; const lw = Math.max(1, s.size * mn); g.lineWidth = lw; g.filter = `blur(${(lw * .18).toFixed(1)}px)`;
      g.beginPath(); s.pts.forEach(([x, y], i) => i ? g.lineTo(x * cw, y * ch) : g.moveTo(x * cw, y * ch)); if (s.pts.length === 1){ g.arc(s.pts[0][0] * cw, s.pts[0][1] * ch, lw / 2, 0, 7); g.fill(); } else g.stroke(); }
    return g.getImageData(0, 0, cw, ch).data; };
  const u = new Uint8Array(cw * ch * 4);
  if (kind === 'mask'){ const d = draw(); for (let i = 0; i < d.length; i += 4){ u[i] = u[i + 1] = u[i + 2] = d[i]; u[i + 3] = 255; } }
  else { const ch4 = ['dodge','expo','temp','sat'].map(m => draw(m)); for (let i = 0; i < u.length; i += 4){ u[i] = ch4[0][i]; u[i + 1] = ch4[1][i]; u[i + 2] = ch4[2][i]; u[i + 3] = ch4[3][i]; } }
  return { u, w:cw, h:ch };
}
function maskTex(E, key, strokes, w, h, kind){
  const sig = key + ':' + kind + ':' + (w / h).toFixed(4) + ':' + JSON.stringify(strokes).length + ':' + strokes.length + ':' + (strokes.length ? JSON.stringify(strokes[strokes.length - 1]).slice(-60) : '');
  let c = E.__mc || (E.__mc = new Map()), hit = c.get(key + kind);
  if (hit && hit.sig === sig) return hit.t;
  if (hit) E.drop(hit.t);
  const m = strokeCanvas(strokes, w, h, kind), t = E.fromData(m.u, m.w, m.h); c.set(key + kind, { sig, t }); return t;
}
const FONTS_OK = new Set();
function textCanvas(p, w, h){
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), mn = Math.min(w, h), fs = Math.max(6, p.size / 100 * mn);
  g.font = `${p.weight || 800} ${fs}px "${p.font}", "Plus Jakarta Sans", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = String(p.text || '').split('\n'), lh = fs * 1.18, x = p.x * w, y0 = p.y * h - (lines.length - 1) * lh / 2;
  lines.forEach((ln, i) => { const y = y0 + i * lh, tw = g.measureText(ln).width;
    if (p.style === 'box'){ g.fillStyle = 'rgba(0,0,0,.55)'; const pad = fs * .35; g.beginPath(); g.roundRect ? g.roundRect(x - tw / 2 - pad, y - lh / 2, tw + pad * 2, lh, fs * .2) : g.rect(x - tw / 2 - pad, y - lh / 2, tw + pad * 2, lh); g.fill(); }
    if (p.style === 'shadow'){ g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = fs * .25; g.shadowOffsetY = fs * .06; }
    if (p.style === 'neon'){ g.shadowColor = p.color; g.shadowBlur = fs * .6; }
    if (p.style === 'outline'){ g.lineWidth = Math.max(1, fs * .08); g.strokeStyle = '#000'; g.lineJoin = 'round'; g.strokeText(ln, x, y); }
    g.fillStyle = p.color; g.fillText(ln, x, y); if (p.style === 'neon'){ g.fillText(ln, x, y); } g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; });
  return c;
}
const RUN = {
  tune(E, t, p){ const U = { uBri:p.bright / 100, uCon:p.contrast / 100, uSat:p.sat / 100, uAmb:p.amb / 100, uHi:p.hi / 100, uSh:p.sh / 100, uWarm:p.warm / 100, uVib:(p.vib || 0) / 100, uFade:(p.fade || 0) / 100, uTint:(p.tint || 0) / 100, uSplit:(p.split || 0) / 100 };
    return colorPass(E, t, U, !!(p.amb || p.hi || p.sh)); },
  wb(E, t, p){ return colorPass(E, t, { uWarm:p.temp / 100, uTint:p.tint / 100 }); },
  curves(E, t, p, X){ if (isIdCurve(p.pts)) return E.run('copy', { T:t }, {}, t.w, t.h); const C = E.fromData(curvesLUT(p.pts), 256, 1); const r = colorPass(E, t, { uUseC:1, __C:C }); E.drop(C); return r; },
  look(E, t, p){ const a = (p.amt == null ? 100 : p.amt) / 100;
    if (p.css){ const M = cssMatrix(p.css); return colorPass(E, t, { uUseM:1, uM:mat4of(M), m3:M, uAmt:a }); }
    const g = p.grade || {}; return colorPass(E, t, { uBri:(g.exp || 0) / 100 * .8, uCon:(g.con || 0) / 100, uSat:(g.sat || 0) / 100, uVib:(g.vib || 0) / 100, uHi:(g.hi || 0) / 100, uSh:(g.sh || 0) / 100, uWarm:(g.temp || 0) / 100, uTint:(g.tint || 0) / 100, uFade:(g.fade || 0) / 100, uSplit:(g.split || 0) / 100, uAmt:a }, !!(g.hi || g.sh)); },
  details(E, t, p){ return localPass(E, t, { uStruct:p.struct / 100, uSharp:p.sharp / 100 }); },
  dehaze(E, t, p){ return localPass(E, t, { uHaze:p.amt / 100, uSatK:p.amt / 100 * .15 }); },
  tonal(E, t, p){ return localPass(E, t, { uTH:p.hi / 100 * .6, uTM:p.mid / 100 * .6, uTL:p.low / 100 * .6 }); },
  hdr(E, t, p){ const st = { nature:[1, .15, 0], people:[.6, 0, .05], fine:[.75, .05, 0], strong:[1.5, .25, -.05] }[p.style] || [1, .15, 0], k = p.str / 100 * st[0];
    return localPass(E, t, { uHdr:k * .55, uStruct:k * .25, uSatK:p.sat / 100 + st[1], uBriK:p.bright / 100 * .8 + st[2] + k * .12 }); },
  drama(E, t, p){ const dark = p.style === 'dark', k = p.str / 100; return localPass(E, t, { uDrama:k * .55, uStruct:k * .3, uSatK:p.sat / 100 - (dark ? .35 : .1) * k, uBriK:dark ? -k * .35 : k * .1 }, [.0015, .006, .045]); },
  glow(E, t, p){ const B = E.blur(t, L_(t) * .012), r = E.run('glow', { T:t, B }, { uGlow:p.glow / 100, uSat:p.sat / 100, uWarm:p.warm / 100, uHal:p.hal / 100 }, t.w, t.h); E.free(B); return r; },
  vignette(E, t, p){ return E.run('fx', { T:t }, fxU({ uVC:[p.cx, p.cy], uVO:p.outer / 100, uVI:p.inner / 100, uVS:p.size / 100 * 1.1 }), t.w, t.h); },
  grain(E, t, p){ const F = FILM[p.style] || FILM.neutral, B = p.hal ? E.blur(t, L_(t) * .008) : null, g = grainU(t, p.grain / 100, p.gsize);
    const r = E.run('fx', { T:t, B }, fxU({ ...g, uHal:p.hal / 100, uUseB:B ? 1 : 0, uFK:p.stylek / 100, uFT:F.t, uFFade:F.fade, uFCon:F.con, uFSat:F.sat, uSeed:7 }), t.w, t.h); E.free(B); return r; },
  retro(E, t, p){ const a = colorPass(E, t, { uSat:p.sat / 100, uCon:p.contrast / 100, uFade:p.fade / 100, uWarm:.12 }), r = E.run('fx', { T:a }, fxU({ uLeak:p.leak / 100, uScr:p.scr / 100, uSeed:p.seed, ...grainU(t, .25, 40), uVO:-.35 }), t.w, t.h); E.free(a); return r; },
  bw(E, t, p){ const tn = TONES[p.tone]; const a = colorPass(E, t, { uMono:1, uMonoW:MONO_W[p.filter] || MONO_W.neutral, uBri:p.bright / 100, uCon:p.contrast / 100, uToneAmt:tn ? .9 : 0, uToneS:tn ? tn[0] : [1,1,1], uToneH:tn ? tn[1] : [1,1,1] });
    if (!p.grain) return a; const r = E.run('fx', { T:a }, fxU(grainU(t, p.grain / 100, 35)), t.w, t.h); E.free(a); return r; },
  noir(E, t, p){ const k = p.str / 100, a = colorPass(E, t, { uMono:1, uCon:.35 + k * .55, uBri:-.1 * k, uWash:p.wash / 100 * .35, uFade:.08 }), r = E.run('fx', { T:a }, fxU({ ...grainU(t, p.grain / 100, 45), uVO:-p.vig / 100 * .9, uVS:.75 }), t.w, t.h); E.free(a); return r; },
  lens(E, t, p, X){ const L = L_(t), maxR = L * .036, B = E.blur(t, maxR * p.str / 100 * .22 + .5), ang = (p.angle || 0) * Math.PI / 180;
    const r = E.run('lens', { T:t, B }, { uC:[p.cx, p.cy], uR:p.size / 100 * .7, uTr:p.trans / 100, uStr:p.str / 100, uVig:p.vig / 100, uBok:p.bokeh / 100, uAng:ang, uMaxR:maxR, uLin:p.mode === 'linear' ? 1 : 0, uShow:X.showFocus ? 1 : 0 }, t.w, t.h); E.free(B); return r; },
  frames(E, t, p){ const col = { white:[.97,.97,.96], black:[.04,.04,.05], cream:[.95,.91,.82] }[p.col] || [1,1,1], st = ['thin','classic','rounded','polaroid','film','soft','double'].indexOf(p.style);
    return E.run('frame', { T:t }, { uStyle:Math.max(0, st), uW:p.w / 100, uCol:p.style === 'film' && p.col === 'white' ? [.04,.04,.05] : col, uSize:[t.w, t.h] }, t.w, t.h); },
  crop(E, t, p, X){ const H = cropMatrix(p, t.w, t.h, X.cropEditing), [Fw, Fh] = cropFrame(p, t.w, t.h), r = X.cropEditing ? { w:1, h:1 } : p.rect, w = Math.max(2, Math.round(Fw * r.w)), h = Math.max(2, Math.round(Fh * r.h));
    return E.run('geo', { T:t }, { uH:H, uFill:0 }, w, h); },
  persp(E, t, p){ const H = perspMatrix(p, t.w, t.h), fill = { smart:2, white:1, black:0 }[p.fill] || 0, B = fill === 2 ? E.blur(t, L_(t) * .02) : null; const r = E.run('geo', { T:t, B }, { uH:H, uFill:fill }, t.w, t.h); E.free(B); return r; },
  expand(E, t, p){ const l = p.l / 100, r = p.r / 100, tp = p.t / 100, b = p.b / 100, W = Math.round(t.w * (1 + l + r)), Hh = Math.round(t.h * (1 + tp + b)), fill = { smart:2, white:1, black:0 }[p.fill] || 0;
    const H = [1 + l + r, 0, -l, 0, 1 + tp + b, -tp, 0, 0, 1], B = fill === 2 ? E.blur(t, L_(t) * .03) : null; const o = E.run('geo', { T:t, B }, { uH:H, uFill:fill }, W, Hh); E.free(B); return o; },
  heal(E, t, p){ if (!p.spots.length) return E.run('copy', { T:t }, {}, t.w, t.h); const B = E.blur(t, Math.max(1, L_(t) * .0025)); let cur = t;
    for (let i = 0; i < p.spots.length; i += 16){ const ch = p.spots.slice(i, i + 16), S4 = new Float32Array(64); ch.forEach((s, j) => { S4[j * 4] = s.x; S4[j * 4 + 1] = s.y; S4[j * 4 + 2] = s.r; });
      const nx = E.run('heal', { T:cur, B }, { uS:S4, uN:ch.length }, t.w, t.h); if (cur !== t) E.free(cur); cur = nx; }
    E.free(B); return cur; },
  selective(E, t, p, X){ if (!p.points.length) return E.run('copy', { T:t }, {}, t.w, t.h); const B = E.blur(t, Math.max(1, L_(t) * .004)); let cur = t;
    for (let i = 0; i < p.points.length; i += 8){ const ch = p.points.slice(i, i + 8), Pp = new Float32Array(32), A = new Float32Array(32);
      ch.forEach((q, j) => { Pp.set([q.x, q.y, q.r, X.showSel && (i + j) === p.cur ? 1 : 0], j * 4); A.set([q.b / 100, q.c / 100, q.s / 100, q.st / 100], j * 4); });
      const nx = E.run('sel', { T:cur, B }, { uP:Pp, uA:A, uN:ch.length, uShow:X.showSel ? 1 : 0 }, t.w, t.h); if (cur !== t) E.free(cur); cur = nx; }
    E.free(B); return cur; },
  brush(E, t, p, X, it){ if (!p.strokes.length) return E.run('copy', { T:t }, {}, t.w, t.h); const M = maskTex(E, it.id, p.strokes, t.w, t.h, 'brush'); return E.run('brush', { T:t, M }, { uShow:X.showBrush ? 1 : 0 }, t.w, t.h); },
  text(E, t, p){ if (!String(p.text || '').trim()) return E.run('copy', { T:t }, {}, t.w, t.h); const c = textCanvas(p, t.w, t.h), O = E.fromSource(c, t.w, t.h); const r = E.run('over', { T:t, O }, { uMode:0, uOp:p.op / 100, uSc:[1, 1], uOff:[0, 0] }, t.w, t.h); E.drop(O); return r; },
  double(E, t, p, X){ const im = X.images && X.images[p.img]; if (!im) return E.run('copy', { T:t }, {}, t.w, t.h);
    let O = E.__imgs && E.__imgs[p.img]; if (!O){ const k = Math.min(1, Math.max(t.w, t.h) * 1.5 / Math.max(im.width, im.height)), w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k)), c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h); O = E.fromSource(c, w, h); (E.__imgs || (E.__imgs = {}))[p.img] = O; }
    const ia = O.w / O.h, oa = t.w / t.h, s = p.scale / 100, sc = ia > oa ? [ia / oa * s, s] : [s, oa / ia * s];
    return E.run('over', { T:t, O }, { uMode:BL[p.mode] || 0, uOp:p.op / 100, uSc:sc, uOff:[p.ox, p.oy] }, t.w, t.h); },
};
// render a list of items on top of `src`; returns a new texture (caller frees)
function runItems(E, src, items, X = {}, cache){
  let cur = src, start = 0;
  if (cache && cache.want != null && cache.want > 0 && cache.want <= items.length){
    const k = itemsKey(items.slice(0, cache.want), X);
    if (!(cache.t && cache.key === k)){
      if (cache.t){ cache.t.keep = false; E.free(cache.t); cache.t = null; }
      const pre = runItems(E, src, items.slice(0, cache.want), X); pre.keep = true; cache.t = pre; cache.key = k;
    }
    cur = cache.t; start = cache.want;
  }
  for (let i = start; i < items.length; i++){
    const it = items[i], f = RUN[it.tool]; if (!f) continue;
    let out = f(E, cur, it.p, X, it);
    if (it.mask && it.mask.strokes && (it.mask.strokes.length || it.mask.inv) && !isGeo(it)){
      const M = maskTex(E, it.id, it.mask.strokes, cur.w, cur.h, 'mask'), mixed = E.run('mix', { T:cur, A:out, M }, { uInv:it.mask.inv ? 1 : 0, uShow:X.showMask === it.id ? 1 : 0 }, cur.w, cur.h); E.free(out); out = mixed; }
    if (cur !== src && !cur.keep) E.free(cur);
    cur = out;
  }
  if (cur === src || cur.keep) cur = E.run('copy', { T:cur }, {}, cur.w, cur.h);
  return cur;
}
function dropCache(E, cache){ if (cache && cache.t){ cache.t.keep = false; E.free(cache.t); cache.t = null; cache.key = ''; } }
const itemsKey = (items, X) => JSON.stringify(items.map(i => [i.tool, i.p, i.mask])) + '|' + (X.srcKey || '');

/* ---------- EXIF: keep the camera info on export (orientation reset, since the pixels are already upright) ---------- */
function findTiff(u){
  const isT = j => (u[j] === 0x49 && u[j + 1] === 0x49 && u[j + 2] === 42 && u[j + 3] === 0) || (u[j] === 0x4d && u[j + 1] === 0x4d && u[j + 2] === 0 && u[j + 3] === 42);
  if (u[0] === 0xff && u[1] === 0xd8){ let i = 2; while (i + 4 < u.length && u[i] === 0xff){ const mk = u[i + 1], len = u[i + 2] << 8 | u[i + 3]; if (mk === 0xda) break; if (mk === 0xe1 && u[i + 4] === 0x45 && u[i + 5] === 0x78 && u[i + 6] === 0x69 && u[i + 7] === 0x66 && isT(i + 10)) return u.slice(i + 10, i + 2 + len); i += 2 + len; } return null; }
  if (u[0] === 0x89 && u[1] === 0x50){ let i = 8; while (i + 8 < u.length){ const len = (u[i] << 24 | u[i + 1] << 16 | u[i + 2] << 8 | u[i + 3]) >>> 0, ty = String.fromCharCode(u[i + 4], u[i + 5], u[i + 6], u[i + 7]); if (ty === 'eXIf') return u.slice(i + 8, i + 8 + len); if (ty === 'IDAT') break; i += 12 + len; } return null; }
  if (u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50){ let i = 12; while (i + 8 < u.length){ const ty = String.fromCharCode(u[i], u[i + 1], u[i + 2], u[i + 3]), sz = (u[i + 4] | u[i + 5] << 8 | u[i + 6] << 16 | u[i + 7] << 24) >>> 0; if (ty === 'EXIF'){ const s = u.slice(i + 8, i + 8 + sz); return (s[0] === 0x45 && s[1] === 0x78 && s[2] === 0x69 && s[3] === 0x66) ? s.slice(6) : s; } i += 8 + sz + (sz & 1); } return null; }
  return null;
}
function patchTiff(t, w, h){
  try {
    const u = new Uint8Array(t), dv = new DataView(u.buffer), le = u[0] === 0x49, r16 = o => dv.getUint16(o, le), r32 = o => dv.getUint32(o, le);
    const ifd0 = r32(4), n0 = r16(ifd0); let exif = 0;
    for (let i = 0; i < n0; i++){ const e = ifd0 + 2 + i * 12, tag = r16(e); if (tag === 0x0112) dv.setUint16(e + 8, 1, le); if (tag === 0x8769) exif = r32(e + 8); }
    dv.setUint32(ifd0 + 2 + n0 * 12, 0, le);    // drop the old thumbnail (it shows the unedited photo)
    if (exif && exif + 2 < u.length){ const n = r16(exif); for (let i = 0; i < n; i++){ const e = exif + 2 + i * 12, tag = r16(e), ty = r16(e + 2); if (tag === 0xa002 || tag === 0xa003){ const val = tag === 0xa002 ? w : h; if (ty === 3) dv.setUint16(e + 8, Math.min(65535, val), le); else dv.setUint32(e + 8, val, le); } } }
    return u;
  } catch (e) { return null; }
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
function withExif(u, tiff, mime){
  const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let p = 0; for (const x of a){ o.set(x, p); p += x.length; } return o; };
  if (mime === 'image/jpeg'){
    if (tiff.length + 8 > 65533) return u;
    const seg = new Uint8Array(4 + 6 + tiff.length), L = seg.length - 2; seg.set([0xff, 0xe1, L >> 8, L & 255, 0x45, 0x78, 0x69, 0x66, 0, 0]); seg.set(tiff, 10);
    let at = 2; if (u[2] === 0xff && u[3] === 0xe0) at = 4 + (u[4] << 8 | u[5]);
    return cat(u.slice(0, at), seg, u.slice(at));
  }
  if (mime === 'image/png'){
    let i = 8; while (i + 8 < u.length){ const len = (u[i] << 24 | u[i + 1] << 16 | u[i + 2] << 8 | u[i + 3]) >>> 0, ty = String.fromCharCode(u[i + 4], u[i + 5], u[i + 6], u[i + 7]); if (ty === 'IDAT') break; i += 12 + len; }
    const ch = new Uint8Array(12 + tiff.length), dv = new DataView(ch.buffer); dv.setUint32(0, tiff.length); ch.set([0x65, 0x58, 0x49, 0x66], 4); ch.set(tiff, 8); dv.setUint32(8 + tiff.length, CRC(ch.subarray(4, 8 + tiff.length)));
    return cat(u.slice(0, i), ch, u.slice(i));
  }
  if (mime === 'image/webp'){
    const ty = String.fromCharCode(u[12], u[13], u[14], u[15]); let body = u.slice(12), w = 0, h = 0;
    const pad = tiff.length & 1, ex = new Uint8Array(8 + tiff.length + pad); ex.set([0x45, 0x58, 0x49, 0x46], 0); new DataView(ex.buffer).setUint32(4, tiff.length, true); ex.set(tiff, 8);
    if (ty === 'VP8X'){ body = body.slice(); body[8] |= 0x08; }
    else {
      if (ty === 'VP8 '){ w = (u[26] | u[27] << 8) & 0x3fff; h = (u[28] | u[29] << 8) & 0x3fff; }
      else if (ty === 'VP8L'){ const b = u[21] | u[22] << 8 | u[23] << 16 | u[24] << 24; w = (b & 0x3fff) + 1; h = ((b >> 14) & 0x3fff) + 1; }
      else return u;
      const x = new Uint8Array(18); x.set([0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0x08 | (ty === 'VP8L' ? 0x10 : 0), 0, 0, 0]); const W = w - 1, H = h - 1; x.set([W & 255, W >> 8 & 255, W >> 16 & 255, H & 255, H >> 8 & 255, H >> 16 & 255], 12);
      body = cat(x, body);
    }
    const all = cat(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), body, ex); new DataView(all.buffer).setUint32(4, all.length - 8, true); return all;
  }
  return u;
}

/* ---------- link to the video editor (all optional, so this file also works alone) ---------- */
// app/index.html's main script lives inside an IIFE, so it hands us what we need as window.__ecHost
const HX = () => window.__ecHost || {};
const hf = n => (typeof HX()[n] === 'function' ? HX()[n] : null);
const H = {
  toast:(m, ms) => { const f = hf('toast'); if (f) f(m, ms); else console.log('[photo]', m); },
  media:() => HX().media || null,
  desk:() => HX().DESK || window.easycutDesktop || null,
  save:async (blob, name) => { const f = hf('saveBlob'); if (f) return f(blob, name); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); },
  filters:() => HX().FILTERS || {},
  looks:() => HX().LOOKS || {},
  exif:buf => { try { const x = hf('exifInfo'), p = hf('parseExif'); return x && p ? x(p(buf)) : null; } catch (e) { return null; } },
  heic:f => (hf('heicToJpeg') ? hf('heicToJpeg')(f) : Promise.reject(new Error('HEIC not supported'))),
  tiff:f => (hf('tiffToJpeg') ? hf('tiffToJpeg')(f) : Promise.reject(new Error('TIFF not supported'))),
  busy:(on, title, pct, sub) => { if (on && hf('progress')) hf('progress')(title, pct, sub || ''); else if (!on && hf('progressDone')) hf('progressDone')(); },
};

/* ---------- state ---------- */
const ST = { open:false, src:null, stack:[], past:[], future:[], sess:null, tab:'tools', split:false, splitX:.5, compare:false, hist:true, zoom:1, panX:0, panY:0,
  eng:null, srcTex:null, prevW:0, prevH:0, cache:{}, raf:0, images:{}, out:{ w:0, h:0 }, histData:null, force2d:false, exp:{ fmt:'jpeg', q:92, size:'full', exif:true } };
const LS = { get:(k, d) => { try { const v = localStorage.getItem('easycut.pe.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set:(k, v) => { try { localStorage.setItem('easycut.pe.' + k, JSON.stringify(v)); } catch (e) {} } };
let FAVES = LS.get('faves', ['tune', 'crop', 'selective', 'heal']);
Object.assign(ST.exp, LS.get('export', {}));
const snapStack = () => JSON.stringify(ST.stack);
function hpush(){ ST.past.push(snapStack()); if (ST.past.length > 100) ST.past.shift(); ST.future = []; updTop(); }
function undo(){ if (ST.sess) return cancelTool(); if (!ST.past.length) return; ST.future.push(snapStack()); ST.stack = JSON.parse(ST.past.pop()); afterStack(); }
function redo(){ if (ST.sess || !ST.future.length) return; ST.past.push(snapStack()); ST.stack = JSON.parse(ST.future.pop()); afterStack(); }
function afterStack(){ updTop(); renderSide(); renderStackPanel(); render(); }
const mkItem = (tool, p) => ({ id:uidp(), tool, on:true, p:{ ...defaults(tool), ...(p || {}) } });

/* ---------- looks ---------- */
const OWN_LOOKS = [
  ['pop', 'Pop', [['tune', { contrast:18, sat:22, amb:18 }], ['details', { struct:30, sharp:15 }]]],
  ['accent', 'Accentuate', [['curves', { pts:{ rgb:[[0,0],[.25,.2],[.75,.82],[1,1]], r:[[0,0],[1,1]], g:[[0,0],[1,1]], b:[[0,0],[1,1]] } }], ['details', { struct:35, sharp:10 }]]],
  ['softglow', 'Soft glow', [['glow', { glow:45, sat:5, warm:8 }], ['tune', { fade:15 }]]],
  ['morning', 'Morning', [['tune', { bright:12, warm:18, sh:15, fade:10, sat:-5 }]]],
  ['wild', 'Wild detail', [['tonal', { hi:35, mid:40, low:30 }], ['tune', { vib:20, warm:5 }], ['vignette', { outer:-30 }]]],
  ['matte', 'Matte', [['curves', { pts:{ rgb:[[0,.1],[.5,.5],[1,.92]], r:[[0,0],[1,1]], g:[[0,0],[1,1]], b:[[0,0],[1,1]] } }], ['tune', { sat:-10 }]]],
  ['film400', 'Film 400', [['grain', { grain:25, gsize:35, style:'warm', stylek:70, hal:25 }]]],
  ['fineart', 'Fine art B&W', [['bw', { filter:'red', contrast:30 }], ['vignette', { outer:-45 }], ['grain', { grain:18, style:'silver', stylek:30 }]]],
  ['moodynature', 'Moody nature', [['tune', { bright:-8, contrast:15, sat:-15, sh:-10, warm:-8 }], ['tonal', { hi:20, mid:30, low:10 }]]],
  ['hdrpop', 'HDR pop', [['hdr', { str:45, style:'nature' }]]],
  ['dramadark', 'Dark drama', [['drama', { str:55, style:'dark' }]]],
  ['retro', 'Retro light', [['retro', { leak:45, scr:20, seed:5 }]]],
];
function allLooks(){
  const L = OWN_LOOKS.map(([id, name, items]) => ({ id, name, items }));
  for (const [k, v] of Object.entries(H.filters())) if (k !== 'none' && v[1]) L.push({ id:'f-' + k, name:v[0], items:[['look', { css:v[1] }]] });
  for (const [k, v] of Object.entries(H.looks())) L.push({ id:'g-' + k, name:String(v[0]).replace(/^\S+\s/, ''), items:[['look', { grade:v[1] }]] });
  for (const u of LS.get('looks', [])) L.push({ id:'u-' + u.id, name:u.name, items:u.items, user:true });
  return L;
}
function applyLook(id){
  hpush(); ST.stack = ST.stack.filter(i => !i.look);
  if (id !== 'none'){ const L = allLooks().find(l => l.id === id); if (!L) return; for (const [tool, p] of L.items){ const it = mkItem(tool, deep(p)); it.look = id; ST.stack.push(it); } }
  ST.lookId = id; afterStack();
}
function saveLook(){
  const items = ST.stack.filter(i => i.on !== false && !isGeo(i) && !['heal','brush','text','double','selective'].includes(i.tool)).map(i => [i.tool, deep(i.p)]);
  if (!items.length) return H.toast('Add a few edits first (Tune, Curves, a style…), then save them as a look');
  const name = (prompt('Name for this look', 'My look') || '').trim(); if (!name) return;
  const L = LS.get('looks', []); L.push({ id:uidp(), name, items }); LS.set('looks', L); ST.thumbs = null; H.toast(`Look “${name}” saved`); renderSide();
}

/* ---------- DOM ---------- */
let root, view, stage, cv, ov, hud, plist, histC, side, stackP;
const ICO = { back:'M15 18l-6-6 6-6', undo:'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-1', redo:'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h1', layers:'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5', split:'M12 3v18M5 6h4M5 18h4M15 12h4', hist:'M4 20V10M9 20V4M14 20v-8M19 20v-5', eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z', compare:'M12 3a9 9 0 100 18V3z', x:'M18 6L6 18M6 6l12 12', check:'M5 12l5 5 9-10', open:'M3 7h6l2 2h10v10H3z', brush:'M4 20c3 0 5-2 5-5l9-9-3-3-9 9c-3 0-5 2-5 5z', trash:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', up:'M12 19V5M5 12l7-7 7 7', down:'M12 5v14M5 12l7 7 7-7', star:'M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.3 6.5 20.4l1-6.3L3 9.7l6.2-.9z', fit:'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', export:'M12 3v12M7 8l5-5 5 5M5 21h14' };
const ico = n => `<svg class="pe-i" viewBox="0 0 24 24"><path d="${ICO[n]}"/></svg>`;
function build(){
  if (root) return;
  root = document.createElement('div'); root.id = 'pe'; root.className = 'pe'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Photo editor');
  root.innerHTML = `
  <div class="pe-top">
    <button class="pe-ib" data-pe="close" title="Back to EasyCut">${ico('back')}</button>
    <div class="pe-ttl"><b>Photo editor</b><small id="peName"></small></div>
    <div class="pe-sp"></div>
    <button class="pe-ib pe-help" data-pe="help" title="Mouse & touchpad gestures (?)"><b>?</b></button>
    <button class="pe-ib" data-pe="undo" title="Undo (Ctrl+Z)">${ico('undo')}</button>
    <button class="pe-ib" data-pe="redo" title="Redo (Ctrl+Y)">${ico('redo')}</button>
    <button class="pe-ib" data-pe="compare" title="Hold to see the original (or hold anywhere on the photo, or hold Space)">${ico('compare')}</button>
    <button class="pe-ib" data-pe="split" title="Before / after split">${ico('split')}</button>
    <button class="pe-ib" data-pe="hist" title="Histogram">${ico('hist')}</button>
    <button class="pe-ib pe-stk" data-pe="stack" title="Edit stack: change, hide, brush or delete any edit">${ico('layers')}<span id="peStkN"></span></button>
    <button class="pe-btn pri" data-pe="exportTab">${ico('export')}<span>Export</span></button>
  </div>
  <div class="pe-main">
    <div class="pe-view" id="peView">
      <div class="pe-stage" id="peStage"><canvas id="peCv"></canvas><div class="pe-ov" id="peOv"></div><div class="pe-splitl" id="peSplitL"><i></i></div></div>
      <div class="pe-hud" id="peHud"></div><div class="pe-plist" id="pePList"></div>
      <canvas class="pe-hist" id="peHist" width="256" height="90"></canvas>
      <div class="pe-badge" id="peBadge">Original</div>
      <button class="pe-fit pe-ib" data-pe="fit" title="Fit to screen">${ico('fit')}</button>
      <div class="pe-empty" id="peEmpty"></div>
    </div>
    <div class="pe-side" id="peSide"></div>
  </div>
  <div class="pe-stackp" id="peStack"></div>
  <input type="file" id="peFile" accept="image/*,.heic,.heif,.avif,.tif,.tiff" hidden>
  <input type="file" id="peFile2" accept="image/*,.heic,.heif,.avif,.tif,.tiff" hidden>`;
  document.body.appendChild(root);
  view = $p('#peView', root); stage = $p('#peStage', root); cv = $p('#peCv', root); ov = $p('#peOv', root); hud = $p('#peHud', root); plist = $p('#pePList', root); histC = $p('#peHist', root); side = $p('#peSide', root); stackP = $p('#peStack', root);
  root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onChange);
  $p('#peFile', root).addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); });
  $p('#peFile2', root).addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) addSecondImage(f); });
  const cmp = $p('[data-pe="compare"]', root), on = e => { e.preventDefault(); setCompare(true); }, off = () => setCompare(false);
  cmp.addEventListener('pointerdown', on); cmp.addEventListener('pointerup', off); cmp.addEventListener('pointerleave', off); cmp.addEventListener('pointercancel', off);
  bindGestures(); stackP.addEventListener('click', onStackClick);
  root.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
  root.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); const f = [...(e.dataTransfer && e.dataTransfer.files || [])].find(f => /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name)); if (f) openFile(f); });
  window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKeyUp, true);
  new ResizeObserver(() => { if (ST.open){ layoutMode(); fitStage(); maybeResizePreview(); } }).observe(view);
  window.addEventListener('resize', () => ST.open && layoutMode());
}
const mobMQp = window.matchMedia('(max-width:860px), (max-height:500px) and (pointer:coarse)');
function layoutMode(){ const m = mobMQp.matches; root.classList.toggle('pe-mob', m); root.classList.toggle('pe-land', m && innerWidth > innerHeight); }

/* ---------- engine + source ---------- */
function makeEngine(canvas, opts){ if (!ST.force2d && !opts.force2d){ try { return new GLEngine(canvas, opts); } catch (e) { console.warn('photo editor: WebGL2 unavailable, using Canvas2D', e); } } return new CPUEngine(canvas); }
function ensureEngine(){
  if (ST.eng && ((ST.force2d && ST.eng.kind === 'canvas2d') || (!ST.force2d && ST.eng.kind !== 'canvas2d'))) return;
  if (ST.eng){ const old = cv; const nc = document.createElement('canvas'); nc.id = 'peCv'; old.replaceWith(nc); cv = nc; ST.srcTex = null; ST.cache = {}; }
  ST.eng = makeEngine(cv, {}); root.dataset.engine = ST.eng.kind;
}
function previewTarget(){ const r = view.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), cap = ST.eng && ST.eng.kind === 'canvas2d' ? 1000 : Math.min(PREV_MAX, ST.eng ? ST.eng.max : PREV_MAX); return clamp(Math.round(Math.max(r.width, r.height) * dpr * Math.max(1, Math.min(2.5, ST.zoom))), 700, cap); }
function uploadPreview(){
  const s = ST.src, E = ST.eng; if (!s) return; const tgt = previewTarget(), k = Math.min(1, tgt / Math.max(s.w, s.h)), w = Math.max(1, Math.round(s.w * k)), h = Math.max(1, Math.round(s.h * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(s.bmp, 0, 0, w, h);
  if (ST.srcTex) E.drop(ST.srcTex); dropCache(E, ST.cache); ST.srcTex = E.fromSource(c, w, h); ST.prevW = w; ST.prevH = h; ST.srcKey = uidp();
  const tc = document.createElement('canvas'), tk = THUMB / Math.max(w, h); tc.width = Math.max(1, Math.round(w * tk)); tc.height = Math.max(1, Math.round(h * tk)); tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height); ST.thumbSrc = tc; ST.thumbs = null;
}
let resizeT = 0;
function maybeResizePreview(){ clearTimeout(resizeT); resizeT = setTimeout(() => { if (!ST.src) return; const t = previewTarget(), cur = Math.max(ST.prevW, ST.prevH), full = Math.max(ST.src.w, ST.src.h); if ((t > cur * 1.25 && cur < full) || t < cur * .6){ uploadPreview(); render(); } }, 250); }
async function decodeBlob(blob, name){
  try { return await createImageBitmap(blob, { imageOrientation:'from-image' }); }
  catch (e) {
    if (/\.(heic|heif)$/i.test(name || '') || /hei[cf]/i.test(blob.type || '')){ const j = await H.heic(blob); return createImageBitmap(j, { imageOrientation:'from-image' }); }
    if (/\.(tif|tiff)$/i.test(name || '') || /image\/tiff/i.test(blob.type || '')){ const j = await H.tiff(blob); return createImageBitmap(j, { imageOrientation:'from-image' }); }
    throw e;
  }
}
async function loadSource(blob, name, opts = {}){
  const bytes = new Uint8Array(await blob.slice(0, 6e6).arrayBuffer()), bmp = await decodeBlob(blob, name);
  ST.src = { blob, name:name || 'photo.jpg', w:bmp.width, h:bmp.height, bmp, tiff:findTiff(bytes), info:H.exif(bytes.buffer), mediaId:opts.mediaId || '', clipId:opts.clipId || '', recentId:opts.recentId || '' };
  ST.stack = opts.stack ? deep(opts.stack) : []; ST.past = []; ST.future = []; ST.sess = null; ST.zoom = 1; ST.panX = ST.panY = 0; ST.lookId = ''; ST.images = opts.images || {};
  ensureEngine(); uploadPreview();
  $p('#peName', root).textContent = `${ST.src.name} · ${ST.src.w} × ${ST.src.h}`;
  root.classList.add('has-photo'); ST.tab = ST.tab === 'export' ? 'tools' : ST.tab;
  afterStack(); fitStage();
}
async function openFile(f, opts){ try { busy(true, 'Opening photo…'); await loadSource(f, f.name, opts); } catch (e) { H.toast('Couldn’t open that photo: ' + (e.message || e), 4000); } finally { busy(false); } }
const busy = (on, t) => H.busy(on, t || 'Working…', 50);

/* ---------- render ---------- */
function viewItems(){
  const on = l => l.filter(i => i.on !== false), s = ST.sess;
  if (ST.compare){ const base = s ? (s.idx < 0 ? ST.stack : ST.stack.slice(0, s.idx)) : ST.stack; return { items:on(base).filter(isGeo) }; }
  if (!s) return { items:on(ST.stack) };
  const base = on(s.idx < 0 ? ST.stack : ST.stack.slice(0, s.idx));
  if (s.mask) return { items:base.concat([s.item]), want:base.length };
  return { items:base.concat([s.item]), want:base.length };
}
function render(){ if (!ST.open || !ST.srcTex) return; cancelAnimationFrame(ST.raf); ST.raf = requestAnimationFrame(doRender); }
function doRender(){
  const E = ST.eng; if (!E || !ST.srcTex) return; const t0 = performance.now();
  try {
    const s = ST.sess, X = { srcKey:ST.srcKey, images:ST.images, cropEditing:!!(s && s.item.tool === 'crop' && !ST.compare), showSel:!!(s && s.item.tool === 'selective' && s.showMask), showBrush:!!(s && s.item.tool === 'brush' && s.showMask), showMask:s && s.mask && s.showMask ? s.item.id : '', showFocus:!!(s && s.item.tool === 'lens' && s.dragging) };
    const V = viewItems(); ST.cache.want = V.want != null ? V.want : null;
    const out = runItems(E, ST.srcTex, V.items, X, ST.cache);
    let before = null;
    if (ST.split && !ST.compare){ before = runItems(E, ST.srcTex, V.items.filter(isGeo).filter(i => !(X.cropEditing && i === s.item)), { ...X, cropEditing:false }); if (before.w !== out.w || before.h !== out.h){ E.free(before); before = null; } }
    E.show(out, before, ST.splitX); ST.out = { w:out.w, h:out.h };
    root.classList.toggle('pe-split-on', !!before);
    if (ST.hist) drawHist(E.small(out, 200));
    E.free(out); E.free(before);
  } catch (e) { console.error(e); H.toast('Photo editor: ' + e.message, 5000); }
  ST.lastMs = performance.now() - t0;
  fitStage(); drawOverlay();
  $p('#peBadge', root).classList.toggle('on', ST.compare);
}
function fitStage(){
  if (!ST.out.w) return; const r = view.getBoundingClientRect(), pad = root.classList.contains('pe-mob') ? 8 : 28, k = Math.min((r.width - pad * 2) / ST.out.w, (r.height - pad * 2) / ST.out.h), w = Math.max(10, ST.out.w * k), h = Math.max(10, ST.out.h * k);
  stage.style.width = w + 'px'; stage.style.height = h + 'px'; stage.style.left = (r.width - w) / 2 + 'px'; stage.style.top = (r.height - h) / 2 + 'px';
  stage.style.transform = `translate(${ST.panX}px, ${ST.panY}px) scale(${ST.zoom})`;
  $p('.pe-fit', root).classList.toggle('on', ST.zoom !== 1);
  $p('#peSplitL', root).style.left = (ST.splitX * 100) + '%';
}
function drawHist(sm){
  const d = sm.d, bins = [new Uint32Array(64), new Uint32Array(64), new Uint32Array(64), new Uint32Array(64)];
  for (let i = 0; i < d.length; i += 4){ bins[0][d[i] >> 2]++; bins[1][d[i + 1] >> 2]++; bins[2][d[i + 2] >> 2]++; bins[3][Math.round(lumaJ(d[i], d[i + 1], d[i + 2])) >> 2]++; }
  ST.histData = bins; const g = histC.getContext('2d'), W = histC.width, Hh = histC.height; g.clearRect(0, 0, W, Hh);
  const mx = Math.max(1, ...bins.slice(0, 3).map(b => Math.max(...b.slice(1, 63))));
  g.globalCompositeOperation = 'lighter';
  [['#ff4d4d', 0], ['#3ddc84', 1], ['#4d8dff', 2]].forEach(([c, j]) => { g.fillStyle = c + '99'; g.beginPath(); g.moveTo(0, Hh); for (let i = 0; i < 64; i++) g.lineTo(i / 63 * W, Hh - Math.min(1, bins[j][i] / mx) * (Hh - 4)); g.lineTo(W, Hh); g.fill(); });
  g.globalCompositeOperation = 'source-over';
}

/* ---------- top bar / side panel ---------- */
function updTop(){
  if (!root) return; $p('[data-pe="undo"]', root).disabled = !ST.past.length && !ST.sess; $p('[data-pe="redo"]', root).disabled = !ST.future.length || !!ST.sess;
  const n = ST.stack.length; $p('#peStkN', root).textContent = n ? n : ''; $p('[data-pe="split"]', root).classList.toggle('on', ST.split); $p('[data-pe="hist"]', root).classList.toggle('on', ST.hist);
  root.classList.toggle('pe-hist-on', ST.hist); root.classList.toggle('pe-in-tool', !!ST.sess);
}
const segH = (k, opts, cur, attr = 'data-seg') => `<div class="pe-seg" ${attr}="${k}">${opts.map(([v, l]) => `<button data-v="${escp(v)}" class="${String(cur) === String(v) ? 'on' : ''}">${escp(l)}</button>`).join('')}</div>`;
function renderSide(){
  if (!root) return; updTop();
  const empty = $p('#peEmpty', root);
  if (!ST.src){ root.classList.remove('has-photo'); empty.innerHTML = emptyHTML(); side.innerHTML = `<div class="pe-sideempty"><div class="pe-hint">Open a photo to start. Everything you do stays editable in the stack.</div></div>`; loadRecents(); return; }
  empty.innerHTML = '';
  if (ST.sess) { side.innerHTML = toolPanel(); afterToolPanel(); return; }
  const tabs = `<div class="pe-tabs">${[['looks','Looks'],['tools','Tools'],['export','Export']].map(([k, l]) => `<button data-tab="${k}" class="${ST.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (ST.tab === 'looks') body = looksHTML();
  else if (ST.tab === 'export') body = exportHTML();
  else body = toolsHTML();
  side.innerHTML = `<div class="pe-body">${body}</div>${tabs}`;
  if (ST.tab === 'looks') buildThumbs();
}
function emptyHTML(){
  const M = H.media(), photos = M ? Object.values(M).filter(m => m.type === 'image' && !m.loading && m.thumb) : [];
  return `<div class="pe-hello"><div class="pe-hello-ico">🖼️</div><h2>Photo editor</h2><p>Tune, retouch and style photos. Swipe up/down on the photo to pick a setting, left/right to change it, and hold to compare.</p>
    <button class="pe-btn pri big" data-pe="open">${ico('open')}<span>Open photo</span></button>
    ${photos.length ? `<h4>From your video project</h4><div class="pe-pgrid">${photos.slice(0, 12).map(m => `<button class="pe-pth" data-pmedia="${m.id}" style="background-image:url('${m.thumb}')" title="${escp(m.name)}"></button>`).join('')}</div>` : ''}
    <div id="peRecent"></div></div>`;
}
function toolsHTML(){
  const tile = id => { const T = TOOLS[id]; return `<button class="pe-tool" data-tool="${id}"><span class="pe-tico">${T.ico}</span><span class="pe-tn">${T.name}</span><i class="pe-fav ${FAVES.includes(id) ? 'on' : ''}" data-fav="${id}" title="Pin to Faves">★</i></button>`; };
  return `${FAVES.length ? `<h4 class="pe-gh">Faves</h4><div class="pe-tgrid">${FAVES.filter(f => TOOLS[f]).map(tile).join('')}</div>` : ''}`
    + GROUPS.map(([g, l]) => `<h4 class="pe-gh">${l}</h4><div class="pe-tgrid">${Object.keys(TOOLS).filter(k => TOOLS[k].grp === g).map(tile).join('')}</div>`).join('')
    + `<div class="pe-hint pe-tip">Tip: tap the layers button at the top to change, hide or brush any edit later. Nothing is baked in until you export.</div>`;
}
function looksHTML(){
  const L = allLooks();
  return `<div class="pe-lgrid"><button class="pe-look ${!ST.lookId || ST.lookId === 'none' ? 'on' : ''}" data-look="none"><span class="pe-lth" data-lth="none"></span><span>Original</span></button>${L.map(l => `<button class="pe-look ${ST.lookId === l.id ? 'on' : ''}" data-look="${l.id}"><span class="pe-lth" data-lth="${l.id}"></span><span>${escp(l.name)}${l.user ? ' ★' : ''}</span></button>`).join('')}</div>
    <div class="pe-row"><button class="pe-btn" data-pe="saveLook">＋ Save my edits as a look</button></div>`;
}
function buildThumbs(){
  const E = ST.eng; if (!E || !ST.thumbSrc) return;
  if (!ST.thumbs){ ST.thumbs = {}; ST.thumbQ = ['none', ...allLooks().map(l => l.id)]; }
  const paint = () => $$p('[data-lth]', side).forEach(el => { const u = ST.thumbs[el.dataset.lth]; if (u) el.style.backgroundImage = `url('${u}')`; });
  paint();
  const work = () => {
    if (!ST.open || ST.tab !== 'looks' || ST.sess) return; const t0 = performance.now();
    while (ST.thumbQ.length && performance.now() - t0 < 30){
      const id = ST.thumbQ.shift(); try {
        if (!ST.thumbTex){ ST.thumbTex = E.fromSource(ST.thumbSrc, ST.thumbSrc.width, ST.thumbSrc.height); }
        const geo = ST.stack.filter(i => i.on !== false && isGeo(i)), L = id === 'none' ? [] : allLooks().find(l => l.id === id).items.map(([tool, p]) => mkItem(tool, deep(p)));
        const o = runItems(E, ST.thumbTex, geo.concat(L), { images:{} }), sm = E.small(o, THUMB); E.free(o);
        const c = document.createElement('canvas'); c.width = sm.w; c.height = sm.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(sm.d), sm.w, sm.h), 0, 0); ST.thumbs[id] = c.toDataURL('image/jpeg', .8);
      } catch (e) { console.warn(e); }
    }
    paint(); if (ST.thumbQ.length) setTimeout(work, 16);
  };
  if (ST.thumbTex && ST.thumbTexSrc !== ST.thumbSrc){ E.drop(ST.thumbTex); ST.thumbTex = null; } ST.thumbTexSrc = ST.thumbSrc;
  setTimeout(work, 30);
}
function exportDims(){ if (!ST.src) return [0, 0]; const k = Math.max(ST.src.w, ST.src.h) / Math.max(ST.prevW, ST.prevH); let w = Math.round(ST.outFull ? ST.outFull[0] : ST.out.w * k), h = Math.round(ST.outFull ? ST.outFull[1] : ST.out.h * k); const lim = { full:0, '4096':4096, '2048':2048, '1080':1080 }[ST.exp.size] || 0; if (lim && Math.max(w, h) > lim){ const s = lim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); } return [w, h]; }
function exportHTML(){
  const e = ST.exp, [w, h] = exportDims(), M = H.media();
  return `<h4 class="pe-gh">Save a copy</h4>
    <div class="pe-prow"><label>Format</label>${segH('fmt', [['jpeg','JPG'],['png','PNG'],['webp','WebP']], e.fmt, 'data-ex')}</div>
    ${e.fmt !== 'png' ? `<div class="pe-prow"><label>Quality <b id="peQv">${e.q}</b></label><input type="range" min="50" max="100" value="${e.q}" data-exq></div>` : ''}
    <div class="pe-prow"><label>Size</label>${segH('size', [['full','Full'],['4096','4096'],['2048','2048'],['1080','1080']], e.size, 'data-ex')}</div>
    <label class="pe-chk"><input type="checkbox" data-exexif ${e.exif ? 'checked' : ''}> Keep camera info (EXIF)${ST.src.tiff ? '' : ' <small>— this photo has none</small>'}</label>
    <div class="pe-hint">${w} × ${h} px · edits are applied at full resolution${ST.src.info && ST.src.info.camera ? ` · 📷 ${escp(ST.src.info.camera)}` : ''}</div>
    <button class="pe-btn pri full" data-pe="save">${ico('export')}<span>Save photo</span></button>
    ${M ? `<h4 class="pe-gh">Use in your video</h4><div class="pe-row">${ST.src.clipId ? `<button class="pe-btn full" data-pe="replaceClip">Replace the photo in the timeline</button>` : ''}<button class="pe-btn full" data-pe="toVideo">＋ Add to the video timeline</button></div>` : ''}`;
}

/* ---------- tool sessions ---------- */
function openTool(id, idx = -1){
  if (!ST.src) return;
  if (id === 'crop' && idx < 0){ const j = ST.stack.findIndex(i => i.tool === 'crop'); if (j >= 0) idx = j; }
  const item = idx >= 0 ? deep(ST.stack[idx]) : mkItem(id);
  if (id === 'text' && idx < 0 && ST.src.info && ST.src.info.settings && false) item.p.text = ST.src.info.settings;
  const numeric = TOOLS[id].params.filter(x => !x.seg);
  ST.sess = { tool:id, idx, item, k:numeric.length ? numeric[0].k : '', showMask:false };
  if (id === 'tune' && idx < 0) ST.sess.k = 'bright';
  if (id === 'crop') ST.sess.k = 'angle';
  if (id === 'selective') ST.sess.k = 'b';
  renderSide(); render(); renderStackPanel(false);
  if (TOOLS[id].ui === 'points' && !item.p.points.length) showHud('Tap the photo to add a point', '', 2200);
  else if (TOOLS[id].ui === 'brush' || TOOLS[id].ui === 'heal') showHud(TOOLS[id].ui === 'heal' ? 'Paint over a spot to remove it' : 'Paint where you want the effect', '', 2200);
  else if (ST.sess.k && !mobMQp.matches) showHud('Swipe up/down to choose a setting · left/right to change it', '', 2000);
}
function openMask(idx){
  const it = ST.stack[idx]; if (!it || isGeo(it)) return H.toast('Geometry edits apply to the whole photo');
  const item = deep(it); item.mask = item.mask || { strokes:[], inv:false };
  ST.sess = { tool:item.tool, idx, item, mask:true, k:'', showMask:true, brushA:1, brushSize:8, erase:false };
  renderSide(); render(); renderStackPanel(false); showHud('Paint where “' + TOOLS[item.tool].name + '” should apply', '', 2400);
}
function applyTool(){
  const s = ST.sess; if (!s) return; hpush();
  if (s.idx >= 0) ST.stack[s.idx] = s.item; else ST.stack.push(s.item);
  if (s.item.tool === 'crop' && ST.src){ /* nothing extra */ }
  ST.sess = null; ST.lookId = ST.lookId || ''; afterStack();
}
function cancelTool(){ ST.sess = null; afterStack(); }
const curParam = () => { const s = ST.sess; if (!s) return null; return TOOLS[s.tool].params.find(x => x.k === s.k) || null; };
function paramTarget(){ const s = ST.sess; if (!s) return null; if (s.tool === 'selective'){ const pt = s.item.p.points[s.item.p.cur]; return pt || null; } return s.item.p; }
function setParam(k, v, quiet){
  const s = ST.sess; if (!s) return; const P = TOOLS[s.tool].params.find(x => x.k === k), tgt = paramTarget(); if (!P || !tgt) return;
  v = clamp(+v, P.min, P.max); if (P.step) v = Math.round(v / P.step) * P.step; else v = Math.round(v);
  if (tgt[k] === v) return; tgt[k] = v;
  if (s.tool === 'crop' && k === 'angle' && ST.src){ const [W, Hh] = [ST.prevW, ST.prevH]; fitCrop(s.item.p, W, Hh); }
  if (!quiet){ const el = $p(`[data-pk="${k}"]`, side); if (el){ el.value = v; const vl = $p(`[data-pv="${k}"]`, side); if (vl) vl.textContent = fmtV(P, v); } }
  render();
}
const fmtV = (P, v) => (P.step && P.step < 1 ? (+v).toFixed(1) : Math.round(v)) + (P.k === 'angle' && P.min === -45 ? '°' : '');
function toolPanel(){
  const s = ST.sess, T = TOOLS[s.tool], tgt = paramTarget();
  const title = s.mask ? `Brush: ${T.name}` : T.name;
  let h = `<div class="pe-th"><button class="pe-ib" data-pe="cancel" title="Cancel (Esc)">${ico('x')}</button><b>${T.ico} ${escp(title)}</b><button class="pe-ib ok" data-pe="apply" title="Apply (Enter)">${ico('check')}</button></div><div class="pe-body pe-tbody">`;
  if (s.mask){
    h += `<div class="pe-hint">Paint on the photo where this edit should show. Red shows where it applies.</div>
      <div class="pe-prow"><label>Strength</label>${segH('brushA', [['1','100'],['.75','75'],['.5','50'],['.25','25'],['0','Eraser']], s.erase ? '0' : String(s.brushA), 'data-mseg')}</div>
      <div class="pe-prow"><label>Brush size <b>${s.brushSize}</b></label><input type="range" min="2" max="40" value="${s.brushSize}" data-msize></div>
      <div class="pe-row"><button class="pe-btn ${s.item.mask.inv ? 'on' : ''}" data-pe="maskInv">Invert</button><button class="pe-btn ${s.showMask ? 'on' : ''}" data-pe="showMask">${ico('eye')}<span>Show mask</span></button><button class="pe-btn" data-pe="maskClear">Clear</button></div></div>`;
    return h;
  }
  if (s.tool === 'selective'){
    const pts = s.item.p.points;
    h += `<div class="pe-hint">${pts.length ? 'Drag a point to move it. Swipe up/down on the photo to pick Brightness, Contrast, Saturation or Structure, left/right to change it.' : 'Tap the photo where you want to adjust. The point picks up that colour and the area around it.'}</div>
      <div class="pe-row"><button class="pe-btn" data-pe="ptAdd">＋ Add point</button>${pts.length ? `<button class="pe-btn" data-pe="ptDel">${ico('trash')}<span>Delete point</span></button><button class="pe-btn ${s.showMask ? 'on' : ''}" data-pe="showMask">${ico('eye')}<span>Show area</span></button>` : ''}</div>
      ${tgt ? `<div class="pe-prow"><label>Point size <b data-pv="r">${Math.round(tgt.r * 100)}</b></label><input type="range" min="3" max="80" value="${Math.round(tgt.r * 100)}" data-ptr></div>` : ''}`;
    if (!tgt){ h += '</div>'; return h; }
  }
  if (s.tool === 'crop'){
    const p = s.item.p;
    h += `<div class="pe-prow"><label>Aspect</label>${segH('ratio', [['free','Free'],['orig','Original'],['1','1:1'],['0.8','4:5'],['0.75','3:4'],['1.5','3:2'],['1.7778','16:9'],['0.5625','9:16']], p.ratio, 'data-crop')}</div>
      <div class="pe-row"><button class="pe-btn" data-pe="rot">⟳ Rotate 90°</button><button class="pe-btn" data-pe="flipH">⇋ Flip</button><button class="pe-btn" data-pe="flipV">⇅ Flip</button><button class="pe-btn" data-pe="cropReset">Reset</button></div>`;
  }
  if (s.tool === 'curves') h += curvesHTML();
  if (s.tool === 'wb') h += `<div class="pe-row"><button class="pe-btn ${s.pick ? 'on' : ''}" data-pe="wbPick">💧 Pick something white or grey</button><button class="pe-btn" data-pe="wbAuto">Auto</button></div>`;
  if (s.tool === 'tune') h += `<div class="pe-row"><button class="pe-btn" data-pe="auto">✨ Auto</button></div>`;
  if (s.tool === 'brush') h += `<div class="pe-hint">Paint on the photo. Pick the effect and amount below; the eraser removes strokes.</div><div class="pe-row"><button class="pe-btn ${s.showMask ? 'on' : ''}" data-pe="showMask">${ico('eye')}<span>Show strokes</span></button><button class="pe-btn" data-pe="strokeUndo">Undo stroke</button></div>`;
  if (s.tool === 'heal') h += `<div class="pe-hint">Paint over a dust spot, blemish or small object. Zoom in (pinch or Ctrl+wheel) for precise work. ${s.item.p.spots.length} spot${s.item.p.spots.length === 1 ? '' : 's'} fixed.</div><div class="pe-row"><button class="pe-btn" data-pe="healUndo">Undo spot</button><button class="pe-btn" data-pe="healClear">Clear all</button></div>`;
  if (s.tool === 'lens' || s.tool === 'vignette') h += `<div class="pe-hint">Drag the dot on the photo to move the centre.</div>`;
  if (s.tool === 'text'){
    const p = s.item.p, info = ST.src.info, sw = ['#ffffff','#000000','#ffd23f','#ff4d6d','#3ddc84','#4d8dff','#f5e6c8'];
    h += `<textarea class="pe-ta" data-text rows="2">${escp(p.text)}</textarea>
      <div class="pe-row">${info && (info.settings || info.camera) ? `<button class="pe-btn sm" data-tpre="exif">📷 Camera settings</button>` : ''}${info && info.date ? `<button class="pe-btn sm" data-tpre="date">📅 Date</button>` : ''}${info && info.place ? `<button class="pe-btn sm" data-tpre="place">📍 Place</button>` : ''}<button class="pe-btn sm" data-tpre="caption">Caption</button></div>
      <div class="pe-prow"><label>Font</label><select data-font>${['Plus Jakarta Sans','Montserrat','Poppins','Playfair Display','Bebas Neue','Anton','Oswald','Pacifico','Dancing Script','Caveat','Permanent Marker','Georgia','Courier New'].map(f => `<option ${f === p.font ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
      <div class="pe-row pe-sw">${sw.map(c => `<button data-tcol="${c}" class="${p.color === c ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div><div class="pe-hint">Drag the text on the photo to move it.</div>`;
  }
  if (s.tool === 'double') h += `<div class="pe-row"><button class="pe-btn pri" data-pe="pick2">${ico('open')}<span>${s.item.p.img ? 'Change photo' : 'Choose a second photo'}</span></button></div><div class="pe-hint">Drag on the photo to move the second picture.</div>`;
  for (const P of T.params){
    if (P.seg){ h += `<div class="pe-prow"><label>${P.label}</label>${segH(P.k, P.seg, s.item.p[P.k])}</div>`; continue; }
    const v = tgt[P.k] != null ? tgt[P.k] : P.def;
    h += `<div class="pe-prow pe-num ${s.k === P.k ? 'cur' : ''}" data-row="${P.k}"><label data-pick="${P.k}">${P.label} <b data-pv="${P.k}">${fmtV(P, v)}</b></label><input type="range" min="${P.min}" max="${P.max}" step="${P.step || 1}" value="${v}" data-pk="${P.k}"></div>`;
  }
  const numeric = T.params.filter(x => !x.seg);
  if (numeric.length > 1) h += `<div class="pe-chips">${numeric.map(P => `<button data-pick="${P.k}" class="${s.k === P.k ? 'on' : ''}">${P.label}</button>`).join('')}</div>`;
  return h + '</div>';
}
function afterToolPanel(){ if (ST.sess && ST.sess.tool === 'curves' && !ST.sess.mask) drawCurves(); }

/* ---------- curves editor ---------- */
const CURVE_PRE = { linear:[[0,0],[1,1]], contrast:[[0,0],[.25,.2],[.75,.8],[1,1]], strong:[[0,0],[.25,.15],[.75,.87],[1,1]], bright:[[0,0],[.5,.62],[1,1]], dark:[[0,0],[.5,.4],[1,1]], matte:[[0,.12],[.3,.3],[.75,.78],[1,.94]], cross:null };
function curvesHTML(){ const s = ST.sess, ch = s.ch || 'rgb'; return `<div class="pe-prow"><label>Channel</label>${segH('ch', [['rgb','RGB'],['r','Red'],['g','Green'],['b','Blue']], ch, 'data-cch')}</div><canvas class="pe-curve" id="peCurve" width="520" height="520"></canvas>
  <div class="pe-row pe-wrap">${[['linear','Reset'],['contrast','Contrast'],['strong','Strong'],['bright','Brighten'],['dark','Darken'],['matte','Matte'],['cross','Cross process']].map(([k, l]) => `<button class="pe-btn sm" data-cpre="${k}">${l}</button>`).join('')}</div><div class="pe-hint">Drag the line to add a point. Drag a point out of the box to remove it.</div>`; }
function drawCurves(){
  const c = $p('#peCurve', side); if (!c) return; const g = c.getContext('2d'), W = c.width, s = ST.sess, ch = s.ch || 'rgb', pts = s.item.p.pts;
  g.clearRect(0, 0, W, W); g.fillStyle = '#11141c'; g.fillRect(0, 0, W, W);
  if (ST.histData){ const b = ST.histData[3], mx = Math.max(1, ...b.slice(1, 63)); g.fillStyle = '#ffffff14'; g.beginPath(); g.moveTo(0, W); for (let i = 0; i < 64; i++) g.lineTo(i / 63 * W, W - Math.min(1, b[i] / mx) * W * .9); g.lineTo(W, W); g.fill(); }
  g.strokeStyle = '#ffffff1a'; g.lineWidth = 2; for (let i = 1; i < 4; i++){ g.beginPath(); g.moveTo(i * W / 4, 0); g.lineTo(i * W / 4, W); g.moveTo(0, i * W / 4); g.lineTo(W, i * W / 4); g.stroke(); }
  const col = { rgb:'#ffffff', r:'#ff5a5a', g:'#3ddc84', b:'#5a9bff' };
  for (const k of ['r', 'g', 'b', 'rgb']){ const cur = curve256(pts[k]); g.strokeStyle = k === ch ? col[k] : col[k] + '44'; g.lineWidth = k === ch ? 4 : 2; g.beginPath(); for (let i = 0; i < 256; i++){ const x = i / 255 * W, y = W - cur[i] * W; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  g.fillStyle = col[ch]; for (const [x, y] of pts[ch]){ g.beginPath(); g.arc(x * W, W - y * W, 12, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 3; g.stroke(); }
}
function curvePointer(e){
  const c = e.target.closest('#peCurve'); if (!c || !ST.sess) return; e.preventDefault(); const s = ST.sess, ch = s.ch || 'rgb', pts = s.item.p.pts[ch];
  const pos = ev => { const r = c.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width, 1 - (ev.clientY - r.top) / r.height]; };
  let [x, y] = pos(e), i = pts.findIndex(p => Math.hypot(p[0] - x, p[1] - y) < .06);
  if (i < 0){ const cur = curve256(pts); pts.push([clamp(x, 0, 1), cur[Math.round(clamp(x, 0, 1) * 255)]]); pts.sort((a, b) => a[0] - b[0]); i = pts.findIndex(p => p[0] === clamp(x, 0, 1)); }
  const end = i === 0 || i === pts.length - 1, P = pts[i]; c.setPointerCapture(e.pointerId);
  const mv = ev => { const [nx, ny] = pos(ev); const lo = i > 0 ? pts[i - 1][0] + .01 : 0, hi = i < pts.length - 1 ? pts[i + 1][0] - .01 : 1; P[0] = end ? P[0] : clamp(nx, lo, hi); P[1] = clamp(ny, 0, 1); P.out = !end && (ny < -.15 || ny > 1.15 || nx < -.1 || nx > 1.1); drawCurves(); render(); };
  const up = () => { c.removeEventListener('pointermove', mv); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); const j = pts.indexOf(P); if (P.out && j > 0) pts.splice(j, 1); delete P.out; drawCurves(); render(); };
  c.addEventListener('pointermove', mv); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
}

/* ---------- clicks ---------- */
async function onClick(e){
  const b = e.target.closest('button,[data-pick],[data-tool],[data-look],[data-pmedia],[data-recent]'); if (!b || !root.contains(b)) return;
  const d = b.dataset, s = ST.sess;
  if (d.fav){ e.stopPropagation(); const id = d.fav; FAVES = FAVES.includes(id) ? FAVES.filter(x => x !== id) : [...FAVES, id].slice(-6); LS.set('faves', FAVES); return renderSide(); }
  if (d.tool) return openTool(d.tool);
  if (d.look) return applyLook(d.look);
  if (d.tab){ ST.tab = d.tab; return renderSide(); }
  if (d.pmedia) return openMedia(d.pmedia);
  if (d.recent) return openRecent(d.recent);
  if (d.pick && s){ s.k = d.pick; $$p('[data-row]', side).forEach(r => r.classList.toggle('cur', r.dataset.row === s.k)); $$p('.pe-chips [data-pick]', side).forEach(r => r.classList.toggle('on', r.dataset.pick === s.k)); const P = curParam(), tg = paramTarget(); if (P && tg) showHud(P.label, fmtV(P, tg[P.k]), 900, P, tg[P.k]); return; }
  if (d.v != null){ const grp = b.parentElement, k = grp.dataset.seg, ex = grp.dataset.ex, cr = grp.dataset.crop, cc = grp.dataset.cch, ms = grp.dataset.mseg;
    if (k && s){ s.item.p[k] = d.v; renderSide(); return render(); }
    if (ex){ ST.exp[ex] = d.v; LS.set('export', ST.exp); return renderSide(); }
    if (cr && s){ setRatio(d.v); return; }
    if (cc && s){ s.ch = d.v; renderSide(); return; }
    if (ms && s){ s.erase = d.v === '0'; if (!s.erase) s.brushA = +d.v; return renderSide(); }
  }
  if (d.cpre && s){ const pts = s.item.p.pts, ch = s.ch || 'rgb'; if (d.cpre === 'cross'){ pts.rgb = [[0,0],[1,1]]; pts.r = [[0,0],[.25,.18],[.75,.85],[1,1]]; pts.g = [[0,0],[.25,.2],[.75,.82],[1,1]]; pts.b = [[0,.12],[1,.85]]; } else if (d.cpre === 'linear'){ pts[ch] = [[0,0],[1,1]]; } else pts[ch] = deep(CURVE_PRE[d.cpre]); drawCurves(); return render(); }
  if (d.tcol && s){ s.item.p.color = d.tcol; renderSide(); return render(); }
  if (d.tpre && s){ const info = ST.src.info || {}, p = s.item.p;
    if (d.tpre === 'exif'){ p.text = [info.camera, info.lens].filter(Boolean).join(' · ') + (info.settings ? '\n' + info.settings : ''); p.size = 3.4; p.y = .9; p.style = 'shadow'; p.font = 'Montserrat'; p.weight = 600; }
    if (d.tpre === 'date'){ p.text = new Date(info.date).toLocaleDateString(undefined, { day:'numeric', month:'long', year:'numeric' }); p.size = 4; p.y = .92; }
    if (d.tpre === 'place'){ p.text = '📍 ' + info.place; p.size = 3.5; p.y = .93; }
    if (d.tpre === 'caption'){ p.text = 'Your caption'; p.size = 7; p.y = .82; p.style = 'shadow'; p.font = 'Plus Jakarta Sans'; p.weight = 800; }
    p.text = p.text.trim(); renderSide(); return render(); }
  const a = d.pe; if (!a) return;
  if (a === 'close') return close();
  if (a === 'open') return $p('#peFile', root).click();
  if (a === 'undo') return undo(); if (a === 'redo') return redo();
  if (a === 'split'){ ST.split = !ST.split; updTop(); return render(); }
  if (a === 'hist'){ ST.hist = !ST.hist; updTop(); return render(); }
  if (a === 'help'){ const g = GX(); if (g) g.help('photo'); return; }
  if (a === 'stack') return toggleStack();
  if (a === 'fit'){ ST.zoom = 1; ST.panX = ST.panY = 0; fitStage(); return maybeResizePreview(); }
  if (a === 'exportTab'){ if (!ST.src) return $p('#peFile', root).click(); if (ST.sess) applyTool(); ST.tab = 'export'; await computeOutFull(); return renderSide(); }
  if (a === 'apply') return applyTool(); if (a === 'cancel') return cancelTool();
  if (a === 'saveLook') return saveLook();
  if (a === 'save') return exportPhoto('save');
  if (a === 'toVideo') return exportPhoto('add'); if (a === 'replaceClip') return exportPhoto('replace');
  if (!s) return;
  const p = s.item.p;
  if (a === 'auto'){ Object.assign(p, autoTune()); renderSide(); return render(); }
  if (a === 'wbPick'){ s.pick = !s.pick; renderSide(); if (s.pick) showHud('Tap something that should be white or grey', '', 2000); return; }
  if (a === 'wbAuto'){ Object.assign(p, autoWB()); renderSide(); return render(); }
  if (a === 'rot'){ p.rot = (p.rot + 1) % 4; const r = p.rect; Object.assign(p.rect, { x:r.y, y:1 - r.x - r.w, w:r.h, h:r.w }); fitCrop(p, ST.prevW, ST.prevH); return render(); }
  if (a === 'flipH'){ p.fh = !p.fh; p.rect.x = 1 - p.rect.x - p.rect.w; return render(); }
  if (a === 'flipV'){ p.fv = !p.fv; p.rect.y = 1 - p.rect.y - p.rect.h; return render(); }
  if (a === 'cropReset'){ Object.assign(p, { rot:0, fh:false, fv:false, angle:0, ratio:'free', rect:{ x:0, y:0, w:1, h:1 } }); renderSide(); return render(); }
  if (a === 'ptAdd'){ s.addArmed = true; showHud('Tap the photo to place the point', '', 1600); return; }
  if (a === 'ptDel'){ p.points.splice(p.cur, 1); p.cur = p.points.length - 1; renderSide(); return render(); }
  if (a === 'showMask'){ s.showMask = !s.showMask; renderSide(); return render(); }
  if (a === 'maskInv'){ s.item.mask.inv = !s.item.mask.inv; renderSide(); return render(); }
  if (a === 'maskClear'){ s.item.mask.strokes = []; return render(); }
  if (a === 'strokeUndo'){ p.strokes.pop(); return render(); }
  if (a === 'healUndo'){ p.spots.pop(); renderSide(); return render(); }
  if (a === 'healClear'){ p.spots = []; renderSide(); return render(); }
  if (a === 'pick2') return $p('#peFile2', root).click();
}
function onInput(e){
  const t = e.target, s = ST.sess;
  if (t.dataset.pk && s){ if (s.k !== t.dataset.pk){ s.k = t.dataset.pk; $$p('[data-row]', side).forEach(r => r.classList.toggle('cur', r.dataset.row === s.k)); } setParam(t.dataset.pk, t.value, true); const P = curParam(); const vl = $p(`[data-pv="${t.dataset.pk}"]`, side); if (vl && P) vl.textContent = fmtV(P, paramTarget()[P.k]); return; }
  if (t.dataset.ptr != null && s){ const pt = paramTarget(); if (pt){ pt.r = +t.value / 100; const vl = $p('[data-pv="r"]', side); if (vl) vl.textContent = t.value; render(); } return; }
  if (t.dataset.msize != null && s){ s.brushSize = +t.value; t.previousElementSibling.querySelector('b').textContent = t.value; return; }
  if (t.dataset.text != null && s){ s.item.p.text = t.value; return render(); }
  if (t.dataset.exq != null){ ST.exp.q = +t.value; $p('#peQv', side).textContent = t.value; LS.set('export', ST.exp); }
}
function onChange(e){ const t = e.target, s = ST.sess; if (t.dataset.font != null && s){ s.item.p.font = t.value; document.fonts && document.fonts.load(`800 40px "${t.value}"`).then(render, render); render(); } if (t.dataset.exexif != null){ ST.exp.exif = t.checked; LS.set('export', ST.exp); } }
function setRatio(v){
  const s = ST.sess, p = s.item.p; p.ratio = v; const [Fw, Fh] = cropFrame(p, ST.prevW, ST.prevH);
  if (v !== 'free'){ const R = v === 'orig' ? ST.src.w / ST.src.h : +v, cur = p.rect, cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2; let w = 1, h = (Fw / R) / Fh; if (h > 1){ h = 1; w = (Fh * R) / Fw; } p.rect = { x:clamp(cx - w / 2, 0, 1 - w), y:clamp(cy - h / 2, 0, 1 - h), w, h }; fitCrop(p, ST.prevW, ST.prevH); }
  renderSide(); render();
}
function autoTune(){
  const b = ST.histData; if (!b) return {}; const L = b[3], n = L.reduce((a, x) => a + x, 0) || 1; let acc = 0, p5 = 0, p95 = 63, mean = 0;
  for (let i = 0; i < 64; i++){ acc += L[i]; mean += L[i] * (i + .5) / 64; if (acc < n * .05) p5 = i; if (acc < n * .95) p95 = i + 1; }
  mean /= n; const r = b[0].reduce((a, x, i) => a + x * i, 0) / n, bl = b[2].reduce((a, x, i) => a + x * i, 0) / n;
  return { bright:Math.round(clamp(Math.log2(.46 / Math.max(.05, mean)) * 55, -50, 50)), contrast:Math.round(clamp((.85 / Math.max(.2, (p95 - p5) / 64) - 1) * 45, -15, 35)), sh:Math.round(clamp((.18 - p5 / 64) * 120, 0, 30)), hi:-Math.round(clamp((p95 / 64 - .9) * 200, 0, 30)), warm:Math.round(clamp((bl - r) / 64 * 120, -25, 25)), sat:8, amb:10 };
}
function autoWB(){ const b = ST.histData; if (!b) return {}; const n = b[0].reduce((a, x) => a + x, 0) || 1, m = j => b[j].reduce((a, x, i) => a + x * i, 0) / n; return wbFor([m(0), m(1), m(2)].map(x => x / 63), .6); }
function wbFor(c, k = 1){ let best = { temp:0, tint:0 }, bs = 1e9; for (let w = -1; w <= 1.001; w += .05) for (let t = -1; t <= 1.001; t += .05){ const r = c[0] * (1 + w * .14 + t * .05), g = c[1] * (1 + w * .03 - t * .1), bb = c[2] * (1 - w * .16 + t * .05), m = (r + g + bb) / 3, sc = (r - m) ** 2 + (g - m) ** 2 + (bb - m) ** 2; if (sc < bs){ bs = sc; best = { temp:w, tint:t }; } } return { temp:Math.round(best.temp * 100 * k), tint:Math.round(best.tint * 100 * k) }; }
async function addSecondImage(f){ try { const bmp = await decodeBlob(f, f.name), id = uidp(); ST.images[id] = bmp; if (ST.sess && ST.sess.tool === 'double'){ ST.sess.item.p.img = id; renderSide(); render(); } } catch (e) { H.toast('Couldn’t open that photo'); } }

/* ---------- overlays on the photo (crop box, points, centres, text) ---------- */
function drawOverlay(){
  const s = ST.sess; let h = '';
  if (s && !ST.compare && !s.mask){
    const p = s.item.p, t = s.tool;
    if (t === 'crop'){ const r = p.rect; h = `<div class="pe-crop" style="left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%" data-ov="move"><i class="g1"></i><i class="g2"></i><i class="g3"></i><i class="g4"></i>${['nw','ne','sw','se','n','s','w','e'].map(k => `<b class="h ${k}" data-ov="${k}"></b>`).join('')}</div>`; }
    else if (t === 'lens' || t === 'vignette'){ const ar = ST.out.w / ST.out.h, rr = t === 'lens' ? p.size / 100 * .7 : p.size / 100 * 1.1 * Math.max(1, ar) * .5; const ring = t === 'lens' ? (p.mode === 'linear' ? `<div class="pe-lline" style="left:${p.cx * 100}%;top:${p.cy * 100}%;width:300%;height:${rr * 200}%;transform:translate(-50%,-50%) rotate(${p.angle}deg)"></div>` : `<div class="pe-ring" style="left:${p.cx * 100}%;top:${p.cy * 100}%;width:${rr * 200 / ar}%;height:${rr * 200}%"></div>`) : ''; h = ring + `<div class="pe-dot" style="left:${p.cx * 100}%;top:${p.cy * 100}%" data-ov="center"></div>`; }
    else if (t === 'selective') h = p.points.map((q, i) => `<div class="pe-pt ${i === p.cur ? 'on' : ''}" data-ov="pt" data-i="${i}" style="left:${q.x * 100}%;top:${q.y * 100}%">${i === p.cur ? ({ b:'B', c:'C', s:'S', st:'St' }[s.k] || 'B') : ''}</div>${i === p.cur && s.showR ? `<div class="pe-ring" style="left:${q.x * 100}%;top:${q.y * 100}%;width:${q.r * 200 * ST.out.h / ST.out.w}%;height:${q.r * 200}%"></div>` : ''}`).join('');
    else if (t === 'text' && String(p.text).trim()) h = `<div class="pe-tbox" data-ov="text" style="left:${p.x * 100}%;top:${p.y * 100}%;width:${Math.min(96, String(p.text).split('\n').reduce((a, l) => Math.max(a, l.length), 1) * p.size * .62 * Math.min(ST.out.w, ST.out.h) / ST.out.w)}%;height:${String(p.text).split('\n').length * p.size * 1.2 * Math.min(ST.out.w, ST.out.h) / ST.out.h}%"></div>`;
  }
  if (ov.__h !== h){ ov.innerHTML = h; ov.__h = h; }
}
let ovDrag = null;
function ovDown(e){
  const el = e.target.closest('[data-ov]'); if (!el || !ST.sess) return false;
  e.preventDefault(); e.stopPropagation(); const k = el.dataset.ov, s = ST.sess, p = s.item.p, r0 = stage.getBoundingClientRect();
  ovDrag = { k, id:e.pointerId, x0:e.clientX, y0:e.clientY, rw:r0.width, rh:r0.height, start:deep(p), i:+el.dataset.i, moved:false };
  if (k === 'pt'){ p.cur = ovDrag.i; s.showR = true; renderSide(); drawOverlay(); }
  if (s.tool === 'lens'){ s.dragging = true; render(); }
  view.setPointerCapture(e.pointerId); return true;
}
function ovMove(e){
  const d = ovDrag, s = ST.sess; if (!d || !s || e.pointerId !== d.id) return false; const p = s.item.p, dx = (e.clientX - d.x0) / d.rw, dy = (e.clientY - d.y0) / d.rh; if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 3) d.moved = true;
  if (d.k === 'center'){ p.cx = clamp(d.start.cx + dx, 0, 1); p.cy = clamp(d.start.cy + dy, 0, 1); }
  else if (d.k === 'pt'){ const q = p.points[d.i], q0 = d.start.points[d.i]; q.x = clamp(q0.x + dx, 0, 1); q.y = clamp(q0.y + dy, 0, 1); }
  else if (d.k === 'text'){ p.x = clamp(d.start.x + dx, 0, 1); p.y = clamp(d.start.y + dy, 0, 1); }
  else { const r = { ...d.start.rect }, R = p.ratio === 'free' ? 0 : (p.ratio === 'orig' ? ST.src.w / ST.src.h : +p.ratio), [Fw, Fh] = cropFrame(p, ST.prevW, ST.prevH), ra = R ? R * Fh / Fw : 0;
    if (d.k === 'move'){ r.x = clamp(r.x + dx, 0, 1 - r.w); r.y = clamp(r.y + dy, 0, 1 - r.h); }
    else { let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h; if (d.k.includes('w')) x0 = clamp(x0 + dx, 0, x1 - .03); if (d.k.includes('e')) x1 = clamp(x1 + dx, x0 + .03, 1); if (d.k.includes('n')) y0 = clamp(y0 + dy, 0, y1 - .03); if (d.k.includes('s')) y1 = clamp(y1 + dy, y0 + .03, 1);
      if (ra){ let w = x1 - x0, h = y1 - y0; if (d.k === 'n' || d.k === 's') w = h * ra; else h = w / ra; if (d.k.includes('n')) y0 = y1 - h; else y1 = y0 + h; if (d.k.includes('w')) x0 = x1 - w; else x1 = x0 + w; if (x0 < 0 || y0 < 0 || x1 > 1 || y1 > 1){ return true; } }
      Object.assign(r, { x:x0, y:y0, w:x1 - x0, h:y1 - y0 }); }
    if (cropInside(p, ST.prevW, ST.prevH, r)) p.rect = r; drawOverlay(); return true; }
  render(); return true;
}
function ovUp(e){ const d = ovDrag; if (!d || e.pointerId !== d.id) return false; ovDrag = null; const s = ST.sess; if (s){ s.showR = false; if (s.tool === 'lens'){ s.dragging = false; } render(); } return true; }

/* ---------- gestures: swipe ↕ picks a setting, ↔ changes it, hold compares, pinch zooms, paint for brushes ---------- */
const G = { ptrs:new Map(), mode:'', holdT:0 };
const normPos = e => { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
const numericParams = () => ST.sess ? TOOLS[ST.sess.tool].params.filter(x => !x.seg) : [];
function bindGestures(){
  view.style.touchAction = 'none';
  side.addEventListener('pointerdown', curvePointer);
  view.addEventListener('pointerdown', e => {
    if (!ST.src || e.button > 2) return;
    if (e.target.closest('.pe-fit')) return;
    if (e.button === 1 || (e.button === 0 && G.space && e.pointerType === 'mouse')){   // middle-drag or Space + drag: pan
      e.preventDefault(); G.ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY }); view.setPointerCapture(e.pointerId); setCompare(false); if (G.space) G.spaceUsed = true;
      G.x0 = e.clientX; G.y0 = e.clientY; G.mode = 'pan'; G.pan0 = [ST.panX, ST.panY]; view.classList.add('pe-panning'); return; }
    if (e.button === 2){   // right button: hold = compare, drag = Snapseed swipe (works in brush tools too)
      e.preventDefault(); G.ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY }); view.setPointerCapture(e.pointerId);
      G.x0 = e.clientX; G.y0 = e.clientY; G.t0 = performance.now(); G.mode = 'pending'; G.right = true;
      G.holdT = setTimeout(() => { if (G.mode === 'pending'){ G.mode = 'hold'; setCompare(true); } }, 260); return; }
    G.right = false;
    if (e.target.closest('#peSplitL')){ e.preventDefault(); G.mode = 'splitdrag'; G.ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY }); view.setPointerCapture(e.pointerId); return; }
    G.ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY });
    if (G.ptrs.size === 2){ clearTimeout(G.holdT); setCompare(false); if (G.mode === 'paint') endPaint(true); const [a, b] = [...G.ptrs.values()]; G.mode = 'pinch'; G.pinch = { d:Math.hypot(a.x - b.x, a.y - b.y), z:ST.zoom, px:ST.panX, py:ST.panY, cx:(a.x + b.x) / 2, cy:(a.y + b.y) / 2, r:ST.sess && ST.sess.tool === 'selective' ? (paramTarget() || {}).r : null }; return; }
    if (G.ptrs.size > 2) return;
    if (ovDown(e)) { G.mode = 'ov'; return; }
    e.preventDefault(); view.setPointerCapture(e.pointerId);
    const s = ST.sess, ui = s && (s.mask ? 'mask' : TOOLS[s.tool].ui);
    G.x0 = e.clientX; G.y0 = e.clientY; G.t0 = performance.now(); G.mode = 'pending';
    if (s && (ui === 'brush' || ui === 'heal' || ui === 'mask') && !e.altKey){ startPaint(e); return; }
    if (s && s.tool === 'double' && s.item.p.img){ G.mode = 'dbl'; G.start = { ox:s.item.p.ox, oy:s.item.p.oy }; return; }
    G.holdT = setTimeout(() => { if (G.mode === 'pending'){ G.mode = 'hold'; setCompare(true); } }, 420);
  });
  view.addEventListener('pointermove', e => {
    if (G.mode === 'ov'){ ovMove(e); return; }
    const pt = G.ptrs.get(e.pointerId); if (!pt) { if (ST.sess && !G.mode) brushCursor(e); return; } pt.x = e.clientX; pt.y = e.clientY;
    if (G.mode === 'splitdrag'){ const r = stage.getBoundingClientRect(); ST.splitX = clamp((e.clientX - r.left) / r.width, 0, 1); fitStage(); render(); return; }
    if (G.mode === 'pinch' && G.ptrs.size >= 2){ const [a, b] = [...G.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), k = d / Math.max(10, G.pinch.d);
      if (G.pinch.r != null && paramTarget()){ paramTarget().r = clamp(G.pinch.r * k, .03, .8); ST.sess.showR = true; render(); return; }
      ST.zoom = clamp(G.pinch.z * k, 1, 8); ST.panX = G.pinch.px + ((a.x + b.x) / 2 - G.pinch.cx); ST.panY = G.pinch.py + ((a.y + b.y) / 2 - G.pinch.cy); clampPan(); fitStage(); return; }
    if (G.mode === 'paint'){ paintMove(e); return; }
    if (G.mode === 'dbl'){ const r = stage.getBoundingClientRect(), p = ST.sess.item.p; p.ox = G.start.ox + (e.clientX - G.x0) / r.width; p.oy = G.start.oy + (e.clientY - G.y0) / r.height; render(); return; }
    const dx = e.clientX - G.x0, dy = e.clientY - G.y0;
    if (G.mode === 'pending' && Math.hypot(dx, dy) > 8){ clearTimeout(G.holdT);
      const s = ST.sess, nums = numericParams();
      if (!s || !nums.length || (s.tool === 'selective' && !paramTarget())){ G.mode = ST.zoom > 1 ? 'pan' : 'none'; G.pan0 = [ST.panX, ST.panY]; }
      else if (Math.abs(dx) > Math.abs(dy)){ G.mode = 'adj'; G.v0 = paramTarget()[s.k]; G.xs = e.clientX; }
      else { G.mode = 'pickp'; G.i0 = Math.max(0, nums.findIndex(x => x.k === s.k)); G.ys = e.clientY; showPList(G.i0); }
    }
    if (G.mode === 'pan'){ ST.panX = G.pan0[0] + dx; ST.panY = G.pan0[1] + dy; clampPan(); fitStage(); }
    if (G.mode === 'adj'){ const P = curParam(), w = view.getBoundingClientRect().width, v = G.v0 + (e.clientX - G.xs) / Math.max(200, w) * (P.max - P.min) * 1.1; setParam(P.k, v); const tg = paramTarget(); showHud(P.label, fmtV(P, tg[P.k]), 0, P, tg[P.k]); }
    if (G.mode === 'pickp'){ const nums = numericParams(), i = clamp(G.i0 + Math.round((e.clientY - G.ys) / 34), 0, nums.length - 1); if (nums[i].k !== ST.sess.k){ ST.sess.k = nums[i].k; navigator.vibrate && navigator.vibrate(4); } showPList(i); }
  });
  const up = e => {
    if (G.mode === 'ov'){ ovUp(e); G.mode = ''; return; }
    const had = G.ptrs.delete(e.pointerId); if (!had) return; clearTimeout(G.holdT); view.classList.remove('pe-panning');
    if (G.mode === 'pinch'){ if (G.ptrs.size < 2){ G.mode = G.ptrs.size ? 'none' : ''; if (ST.sess) ST.sess.showR = false; maybeResizePreview(); render(); } return; }
    if (G.ptrs.size) return;
    const m = G.mode; G.mode = '';
    if (m === 'hold') setCompare(false);
    if (m === 'paint') endPaint();
    if (m === 'pickp'){ hidePList(); renderSide(); const P = curParam(), tg = paramTarget(); if (P && tg) showHud(P.label, fmtV(P, tg[P.k]), 900, P, tg[P.k]); }
    if (m === 'adj'){ hideHud(900); syncSliders(); }
    if (m === 'pending' && e.type === 'pointerup' && !G.right) tap(e);
    G.right = false;
  };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  view.addEventListener('pointerleave', () => { const c = $p('.pe-bcur', view); if (c) c.remove(); });
  view.addEventListener('wheel', onWheel, { passive:false });
  view.addEventListener('contextmenu', e => e.preventDefault());
  view.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
  view.addEventListener('dblclick', onDblClick);
  side.addEventListener('wheel', onSideWheel, { passive:false });
}
/* ---------- mouse wheel & touchpad (app/gestures.js tells them apart; without it every wheel counts as a mouse) ---------- */
const GX = () => window.ECGestures || null;
const wheelKind = e => { const g = GX(); return g ? g.wheelKind(e) : { tp:false, pinch:false, mouse:true, dx:e.deltaX, dy:e.deltaY }; };
const W = { zoom:1, cx:0, cy:0, adj:0, pick:0, swipe:0, swiped:false, endT:0, raf:0 };
function zoomAtView(cx, cy, z){
  const z0 = ST.zoom; z = clamp(z, 1, 8); if (z === z0) return; const vr = view.getBoundingClientRect(), x = cx - (vr.left + vr.width / 2) - ST.panX, y = cy - (vr.top + vr.height / 2) - ST.panY;
  ST.panX -= x * (z / z0 - 1); ST.panY -= y * (z / z0 - 1); ST.zoom = z; if (z === 1) ST.panX = ST.panY = 0; clampPan(); fitStage(); maybeResizePreview();
}
function wheelFlush(){
  W.raf = 0;
  if (W.zoom !== 1){ zoomAtView(W.cx, W.cy, ST.zoom * W.zoom); W.zoom = 1; }
  if (W.pick){ const n = Math.trunc(W.pick / 40); if (n){ W.pick -= n * 40; stepParam(Math.sign(n)); } }
  if (W.adj && ST.sess){ const P = curParam(), tg = paramTarget(); if (P && tg){ const unit = Math.max(P.step || 1, (P.max - P.min) / 200); const n = W.adj / 6; W.adj = 0; setParam(P.k, tg[P.k] + n * unit); showHud(P.label, fmtV(P, tg[P.k]), 900, P, tg[P.k]); syncSliders(); } else W.adj = 0; }
}
const wheelSoon = () => { if (!W.raf) W.raf = requestAnimationFrame(wheelFlush); };
function onWheel(e){
  if (!ST.src) return; e.preventDefault();
  const k = wheelKind(e), s = ST.sess, nums = numericParams();
  if (e.target.closest && e.target.closest('[data-ov]') && s && s.tool === 'crop' && nudgeCrop(e.target.closest('[data-ov]').dataset.ov, k, e.shiftKey)) return;
  if (e.ctrlKey || e.metaKey){   // pinch or Ctrl + wheel: zoom toward the pointer
    W.zoom *= Math.exp(-clamp(k.dy, -300, 300) * (k.tp ? .012 : .0025)); W.cx = e.clientX; W.cy = e.clientY; return wheelSoon(); }
  if (k.tp){
    clearTimeout(W.endT); W.endT = setTimeout(() => { W.swipe = 0; W.swiped = false; W.pick = 0; hideHud(300); }, 260);
    if (s && nums.length && !(s.tool === 'selective' && !paramTarget())){   // in a tool: ↔ changes the setting, ↕ picks another (Snapseed's swipes)
      if (Math.abs(k.dx) > Math.abs(k.dy)) W.adj += -k.dx; else W.pick += k.dy; return wheelSoon(); }
    if (ST.zoom > 1 && !(Math.abs(k.dx) > Math.abs(k.dy) * 2 && Math.abs(k.dx) > 6 && !W.panning)){ W.panning = true; clearTimeout(W.panT); W.panT = setTimeout(() => { W.panning = false; }, 260); ST.panX -= k.dx; ST.panY -= k.dy; clampPan(); fitStage(); return; }
    // outside a tool: a clear two-finger swipe left / right = undo / redo (once per swipe)
    const g = GX(); if (!g || !g.prefs.swipeUndo || W.swiped || Math.abs(k.dx) < Math.abs(k.dy)) return;
    W.swipe += k.dx; const TH = 140, back = W.swipe < 0;
    if (Math.abs(W.swipe) > 30) showHud(back ? '↶ Undo' : '↷ Redo', Math.min(100, Math.round(Math.abs(W.swipe) / TH * 100)) + '%', 0);
    if (Math.abs(W.swipe) >= TH){ W.swiped = true; const can = back ? ST.past.length : ST.future.length; if (can){ back ? undo() : redo(); showHud(back ? '↶ Undone' : '↷ Redone', '', 700); } else showHud(back ? 'Nothing to undo' : 'Nothing to redo', '', 700); }
    return;
  }
  if (!s || !nums.length){ W.zoom *= Math.exp(-clamp(k.dy, -300, 300) * .0025); W.cx = e.clientX; W.cy = e.clientY; return wheelSoon(); }
  if (e.shiftKey){ stepParam((k.dy || k.dx) > 0 ? 1 : -1); return; }
  const P = curParam(), tg = paramTarget(); if (!P || !tg) return; setParam(P.k, tg[P.k] + (k.dy < 0 ? 1 : -1) * Math.max(P.step || 1, (P.max - P.min) / 100) * (Math.abs(k.dy) > 150 ? 2 : 1)); showHud(P.label, fmtV(P, tg[P.k]), 900, P, tg[P.k]); syncSliders();
}
// double-click: 100 % (one photo pixel per screen pixel, at least 2×) / back to fit. Tools that use taps keep them.
function onDblClick(e){
  if (!ST.src || e.target.closest('[data-ov]') || e.target.closest('.pe-fit')) return; const s = ST.sess;
  if (s && (['selective','heal','brush','text','lens','vignette','double'].includes(s.tool) || s.mask || s.pick)) return;
  if (ST.zoom > 1.01){ ST.zoom = 1; ST.panX = ST.panY = 0; clampPan(); fitStage(); maybeResizePreview(); return; }
  const r = stage.getBoundingClientRect(), z = clamp(ST.out.w / Math.max(1, r.width / (window.devicePixelRatio || 1)), 2, 8); zoomAtView(e.clientX, e.clientY, z);
}
// wheel over a curve point: move it up / down a little (Shift = faster); over a crop edge: move that edge one pixel at a time
function onSideWheel(e){
  const c = e.target.closest && e.target.closest('#peCurve'); if (!c || !ST.sess || ST.sess.tool !== 'curves') return; e.preventDefault(); e.stopPropagation();
  const k = wheelKind(e), r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, ch = ST.sess.ch || 'rgb', pts = ST.sess.item.p.pts[ch];
  let i = -1, bd = .08; pts.forEach((p, j) => { const d = Math.abs(p[0] - x); if (d < bd){ bd = d; i = j; } });
  if (i < 0){ const cur = curve256(pts), xx = clamp(x, 0, 1); pts.push([xx, cur[Math.round(xx * 255)]]); pts.sort((a, b) => a[0] - b[0]); i = pts.findIndex(p => p[0] === xx); }
  const d = k.tp ? -k.dy / 600 : (k.dy < 0 ? 1 : -1) * .004; pts[i][1] = +clamp(pts[i][1] + d * (e.shiftKey ? 5 : 1), 0, 1).toFixed(4);
  drawCurves(); render(); showHud('Curve point', Math.round(pts[i][0] * 255) + ' → ' + Math.round(pts[i][1] * 255), 900);
}
function nudgeCrop(h, k, fast){
  if (!/^[nsew]{1,2}$/.test(h)) return false; const px = (k.tp ? -k.dy / 4 : (k.dy < 0 ? 1 : -1)) * (fast ? 10 : 1);   // wheel up = that edge moves outward
  const sx = h.includes('w') ? -px : h.includes('e') ? px : 0, sy = h.includes('n') ? -px : h.includes('s') ? px : 0, r0 = stage.getBoundingClientRect();
  ovDrag = { k:h, id:-1, x0:0, y0:0, rw:r0.width, rh:r0.height, start:deep(ST.sess.item.p), moved:true };
  ovMove({ pointerId:-1, clientX:sx, clientY:sy }); ovDrag = null; render(); return true;
}
function clampPan(){ const r = view.getBoundingClientRect(), mx = r.width * (ST.zoom - 1) / 2 + 40, my = r.height * (ST.zoom - 1) / 2 + 40; ST.panX = clamp(ST.panX, -mx, mx); ST.panY = clamp(ST.panY, -my, my); }
function stepParam(d){ const nums = numericParams(); if (!nums.length) return; const i = clamp(nums.findIndex(x => x.k === ST.sess.k) + d, 0, nums.length - 1); ST.sess.k = nums[i].k; renderSide(); const P = curParam(), tg = paramTarget(); showHud(P.label, fmtV(P, tg[P.k]), 900, P, tg[P.k]); }
function syncSliders(){ const tg = paramTarget(); if (!tg) return; for (const P of numericParams()){ const el = $p(`[data-pk="${P.k}"]`, side); if (el && +el.value !== tg[P.k]){ el.value = tg[P.k]; const vl = $p(`[data-pv="${P.k}"]`, side); if (vl) vl.textContent = fmtV(P, tg[P.k]); } } }
function tap(e){
  const s = ST.sess; if (!s) return; const [x, y] = normPos(e); if (x < 0 || y < 0 || x > 1 || y > 1) return;
  if (s.tool === 'selective'){ const p = s.item.p; if (s.addArmed || !p.points.length || true){ p.points.push({ x, y, r:.18, b:0, c:0, s:0, st:0 }); p.cur = p.points.length - 1; s.addArmed = false; s.k = 'b'; renderSide(); render(); showHud('Swipe left/right to change brightness', '', 1500); } return; }
  if (s.tool === 'wb' && s.pick){ pickWB(x, y); return; }
  if (s.tool === 'lens' || s.tool === 'vignette'){ s.item.p.cx = x; s.item.p.cy = y; render(); return; }
  if (s.tool === 'text'){ s.item.p.x = x; s.item.p.y = y; render(); }
}
function pickWB(x, y){
  const s = ST.sess, E = ST.eng, base = (s.idx < 0 ? ST.stack : ST.stack.slice(0, s.idx)).filter(i => i.on !== false), o = runItems(E, ST.srcTex, base, { srcKey:ST.srcKey, images:ST.images }), sm = E.small(o, 256); E.free(o);
  const px = clamp(Math.round(x * sm.w), 0, sm.w - 1), py = clamp(Math.round(y * sm.h), 0, sm.h - 1); let r = 0, g = 0, b = 0, n = 0;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++){ const X = clamp(px + i, 0, sm.w - 1), Y = clamp(py + j, 0, sm.h - 1), k = (Y * sm.w + X) * 4; r += sm.d[k]; g += sm.d[k + 1]; b += sm.d[k + 2]; n++; }
  Object.assign(s.item.p, wbFor([r / n / 255, g / n / 255, b / n / 255])); s.pick = false; renderSide(); render(); H.toast('White balance set from that spot');
}
// painting (Brush, Healing, and the stack brush that limits any edit to an area)
function startPaint(e){
  const s = ST.sess, [x, y] = normPos(e); G.mode = 'paint';
  const mn = Math.min(ST.out.w, ST.out.h), toFrac = ST.out.w > ST.out.h ? ST.out.h / ST.out.w : 1;
  if (s.mask){ G.stroke = { pts:[[x, y]], size:s.brushSize / 100 * .9 * (1 / ST.zoom), a:s.brushA, erase:s.erase }; s.item.mask.strokes.push(G.stroke); }
  else if (s.tool === 'brush'){ const p = s.item.p; G.stroke = { pts:[[x, y]], size:p.size / 100 * .9 * (1 / ST.zoom), mode:p.mode, v:+p.amt }; if (+p.amt === 0){ for (const m of ['dodge','expo','temp','sat']) if (m !== p.mode) {} } p.strokes.push(G.stroke); }
  else if (s.tool === 'heal'){ const p = s.item.p, r = p.size / 100 * .5 / ST.zoom; G.stroke = { r, x0:x, y0:y }; p.spots.push({ x, y, r }); }
  render();
}
function paintMove(e){
  const s = ST.sess, [x, y] = normPos(e); brushCursor(e);
  if (s.tool === 'heal' && !s.mask){ const p = s.item.p, sp = p.spots[p.spots.length - 1], r = G.stroke.r, d = Math.hypot((x - sp.x) * ST.out.w / ST.out.h, y - sp.y); if (d > r * .8){ p.spots.push({ x, y, r }); render(); } return; }
  const st = G.stroke, last = st.pts[st.pts.length - 1]; if (Math.hypot(x - last[0], y - last[1]) < .003) return; st.pts.push([+x.toFixed(4), +y.toFixed(4)]); render();
}
function endPaint(){ G.stroke = null; if (ST.sess && ST.sess.tool === 'heal') renderSide(); render(); }
function brushCursor(e){
  const s = ST.sess; if (!s) return; const ui = s.mask ? 'mask' : TOOLS[s.tool].ui; let c = $p('.pe-bcur', view);
  if (!(ui === 'brush' || ui === 'heal' || ui === 'mask') || e.pointerType === 'touch'){ if (c) c.remove(); return; }
  if (!c){ c = document.createElement('div'); c.className = 'pe-bcur'; view.appendChild(c); }
  const r = stage.getBoundingClientRect(), vr = view.getBoundingClientRect(), mn = Math.min(r.width, r.height), size = s.mask ? s.brushSize / 100 * .9 * mn : ui === 'heal' ? s.item.p.size / 100 * r.height : s.item.p.size / 100 * .9 * mn;
  c.style.width = c.style.height = size + 'px'; c.style.left = (e.clientX - vr.left) + 'px'; c.style.top = (e.clientY - vr.top) + 'px';
}
function setCompare(on){ if (ST.compare === on || !ST.src) return; ST.compare = on; $p('[data-pe="compare"]', root).classList.toggle('on', on); render(); }
let hudT = 0;
function showHud(label, val, ms, P, v){
  clearTimeout(hudT); const bar = P ? `<i style="--a:${((0 - P.min) / (P.max - P.min)) * 100}%;--b:${((v - P.min) / (P.max - P.min)) * 100}%"></i>` : '';
  hud.innerHTML = `<span>${escp(label)}</span>${val !== '' ? `<b>${escp(String(val))}</b>` : ''}${bar}`; hud.classList.add('on'); if (ms) hideHud(ms);
}
function hideHud(ms){ clearTimeout(hudT); hudT = setTimeout(() => hud.classList.remove('on'), ms || 0); }
function showPList(i){ const nums = numericParams(), tg = paramTarget(); plist.innerHTML = nums.map((P, j) => `<div class="${j === i ? 'on' : ''}"><span>${P.label}</span><b>${fmtV(P, tg[P.k])}</b></div>`).join(''); plist.style.setProperty('--i', i); plist.classList.add('on'); }
function hidePList(){ plist.classList.remove('on'); }

/* ---------- stack panel ---------- */
function toggleStack(force){ const on = force != null ? force : !stackP.classList.contains('on'); if (on && ST.sess) return H.toast('Finish this tool first (✓ or ✕)'); stackP.classList.toggle('on', on); $p('[data-pe="stack"]', root).classList.toggle('on', on); if (on) renderStackPanel(true); }
function sumOf(it){ const T = TOOLS[it.tool], p = it.p; if (it.tool === 'look') return 'Look'; if (it.tool === 'crop') return `${p.rot ? p.rot * 90 + '° · ' : ''}${p.angle ? p.angle.toFixed(1) + '° · ' : ''}${Math.round(p.rect.w * 100)}×${Math.round(p.rect.h * 100)}%`; if (it.tool === 'selective') return `${p.points.length} point${p.points.length === 1 ? '' : 's'}`; if (it.tool === 'brush') return `${p.strokes.length} stroke${p.strokes.length === 1 ? '' : 's'}`; if (it.tool === 'heal') return `${p.spots.length} spot${p.spots.length === 1 ? '' : 's'}`; if (it.tool === 'text') return String(p.text).slice(0, 24);
  return T.params.filter(x => !x.seg && p[x.k] !== x.def && p[x.k] != null).slice(0, 3).map(x => `${x.label} ${p[x.k] > 0 && x.min < 0 ? '+' : ''}${Math.round(p[x.k])}`).join(' · ') || T.params.filter(x => x.seg).map(x => (x.seg.find(o => o[0] === p[x.k]) || [])[1]).filter(Boolean).join(' · '); }
function renderStackPanel(force){
  if (!stackP || (!force && !stackP.classList.contains('on'))) return;
  const rows = ST.stack.map((it, i) => ({ it, i })).reverse();
  stackP.innerHTML = `<div class="pe-sh"><b>Edit stack</b><small>${ST.stack.length} edit${ST.stack.length === 1 ? '' : 's'} · newest on top</small><button class="pe-ib" data-sk="close">${ico('x')}</button></div>
    <div class="pe-slist">${rows.map(({ it, i }) => { const T = TOOLS[it.tool], name = it.look ? (allLooks().find(l => l.id === it.look) || {}).name || T.name : T.name; return `<div class="pe-si ${it.on === false ? 'off' : ''}" data-si="${i}"><span class="pe-sico">${T.ico}</span><div class="pe-sinfo" data-sk="edit"><b>${escp(name)}${it.look ? ' <small>look</small>' : ''}${it.mask && (it.mask.strokes.length || it.mask.inv) ? ' <small>🖌 masked</small>' : ''}</b><small>${escp(sumOf(it))}</small></div>
      <button class="pe-ib" data-sk="eye" title="${it.on === false ? 'Show' : 'Hide'} this edit">${ico('eye')}</button>${!isGeo(it) ? `<button class="pe-ib" data-sk="mask" title="Brush where this edit applies">${ico('brush')}</button>` : ''}<button class="pe-ib" data-sk="up" title="Move up" ${i === ST.stack.length - 1 ? 'disabled' : ''}>${ico('up')}</button><button class="pe-ib" data-sk="down" title="Move down" ${i === 0 ? 'disabled' : ''}>${ico('down')}</button><button class="pe-ib" data-sk="del" title="Delete this edit">${ico('trash')}</button></div>`; }).join('')}
    <div class="pe-si orig"><span class="pe-sico">📷</span><div class="pe-sinfo"><b>Original</b><small>${ST.src ? `${ST.src.w} × ${ST.src.h}` : ''}</small></div></div></div>
    ${ST.stack.length ? `<div class="pe-row"><button class="pe-btn" data-sk="copy">Copy edits</button>${PE_CLIP ? `<button class="pe-btn" data-sk="paste">Paste edits</button>` : ''}<button class="pe-btn danger" data-sk="clear">Remove all</button></div>` : (PE_CLIP ? `<div class="pe-row"><button class="pe-btn" data-sk="paste">Paste edits</button></div>` : '<div class="pe-hint" style="padding:10px 14px">No edits yet.</div>')}`;
}
let PE_CLIP = LS.get('clip', null);
function onStackClick(e){
  const b = e.target.closest('[data-sk]'); if (!b) return; const k = b.dataset.sk, row = b.closest('[data-si]'), i = row ? +row.dataset.si : -1;
  if (k === 'close') return toggleStack(false);
  if (k === 'copy'){ PE_CLIP = ST.stack.filter(x => !['heal','brush','text','double','selective'].includes(x.tool)).map(x => ({ tool:x.tool, p:deep(x.p), look:x.look })); LS.set('clip', PE_CLIP); H.toast('Edits copied — open another photo and paste them'); return renderStackPanel(true); }
  if (k === 'paste' && PE_CLIP){ hpush(); for (const c of PE_CLIP){ const it = mkItem(c.tool, c.p); if (c.look) it.look = c.look; ST.stack.push(it); } return afterStack(); }
  if (k === 'clear'){ hpush(); ST.stack = []; ST.lookId = ''; return afterStack(); }
  if (i < 0) return;
  if (k === 'edit'){ toggleStack(false); return openTool(ST.stack[i].tool, i); }
  if (k === 'mask'){ toggleStack(false); return openMask(i); }
  hpush();
  if (k === 'eye') ST.stack[i].on = ST.stack[i].on === false;
  if (k === 'del'){ ST.stack.splice(i, 1); }
  if (k === 'up' && i < ST.stack.length - 1) [ST.stack[i], ST.stack[i + 1]] = [ST.stack[i + 1], ST.stack[i]];
  if (k === 'down' && i > 0) [ST.stack[i], ST.stack[i - 1]] = [ST.stack[i - 1], ST.stack[i]];
  afterStack();
}

/* ---------- keys ---------- */
function onKey(e){
  if (!ST.open) return; const tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' && e.target.type !== 'range' || tag === 'textarea' || tag === 'select';
  const c = e.ctrlKey || e.metaKey; e.stopPropagation();
  if (typing){ if (e.key === 'Escape') e.target.blur(); return; }
  if (c && e.key.toLowerCase() === 'z'){ e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (c && e.key.toLowerCase() === 'y'){ e.preventDefault(); return redo(); }
  if (c && e.key.toLowerCase() === 's'){ e.preventDefault(); return exportPhoto('save'); }
  if (c && e.key.toLowerCase() === 'o'){ e.preventDefault(); return $p('#peFile', root).click(); }
  if (e.key === 'Escape'){ e.preventDefault(); if (stackP.classList.contains('on')) return toggleStack(false); if (ST.sess) return cancelTool(); return close(); }
  if (e.key === 'Enter' && ST.sess && tag !== 'button'){ e.preventDefault(); return applyTool(); }
  if (e.key === '?'){ e.preventDefault(); const g = GX(); if (g) g.help('photo'); return; }
  if (e.key === '\\' && !e.repeat){ e.preventDefault(); return setCompare(true); }
  if (e.key === ' ' && !e.repeat){ e.preventDefault(); G.space = true; G.spaceUsed = false; return setCompare(true); }
  if (e.key === ' '){ e.preventDefault(); return; }
  if (ST.sess && tag !== 'input'){
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown'){ e.preventDefault(); return stepParam(e.key === 'ArrowUp' ? -1 : 1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight'){ e.preventDefault(); const P = curParam(), tg = paramTarget(); if (!P || !tg) return; setParam(P.k, tg[P.k] + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1) * (P.step || 1)); syncSliders(); return showHud(P.label, fmtV(P, tg[P.k]), 900, P, tg[P.k]); }
  }
}
function onKeyUp(e){ if (!ST.open) return; e.stopPropagation(); if (e.key === ' '){ G.space = false; setCompare(false); } if (e.key === '\\') setCompare(false); }

/* ---------- export at full resolution ---------- */
async function computeOutFull(){ if (!ST.src) return; ST.outFull = null; try { let w = ST.src.w, h = ST.src.h; for (const it of ST.stack.filter(i => i.on !== false && isGeo(i))){ if (it.tool === 'crop'){ const [Fw, Fh] = cropFrame(it.p, w, h); w = Math.max(2, Math.round(Fw * it.p.rect.w)); h = Math.max(2, Math.round(Fh * it.p.rect.h)); } else if (it.tool === 'expand'){ const p = it.p; w = Math.round(w * (1 + p.l / 100 + p.r / 100)); h = Math.round(h * (1 + p.t / 100 + p.b / 100)); } } ST.outFull = [w, h]; } catch (e) {} }
async function renderFull(opts = {}){
  const s = ST.src, items = ST.stack.filter(i => i.on !== false); let w = s.w, h = s.h;
  const off = document.createElement('canvas'); off.width = 1; off.height = 1;
  const big = w * h > 16e6, E = makeEngine(off, { lowMem:big, force2d:ST.force2d });
  try {
    const lim = Math.min(E.max, 16384), k = Math.min(1, lim / Math.max(w, h)); if (k < 1){ w = Math.round(w * k); h = Math.round(h * k); H.toast(`This device can edit up to ${lim} px, so the photo is saved at ${w} × ${h}`, 4000); }
    let srcObj = s.bmp; if (k < 1){ const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(s.bmp, 0, 0, w, h); srcObj = c; }
    const src = E.fromSource(srcObj, w, h), out = runItems(E, src, items, { images:ST.images, srcKey:'full' });
    let ow = out.w, oh = out.h; const px = E.read(out); E.free(out); E.drop(src);
    const lim2 = { full:0, '4096':4096, '2048':2048, '1080':1080 }[opts.size || 'full'] || 0;
    let c = document.createElement('canvas'); c.width = ow; c.height = oh; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer), ow, oh), 0, 0);
    if (lim2 && Math.max(ow, oh) > lim2){ const sc = lim2 / Math.max(ow, oh), c2 = document.createElement('canvas'); c2.width = Math.round(ow * sc); c2.height = Math.round(oh * sc); const g = c2.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, c2.width, c2.height); c = c2; ow = c.width; oh = c.height; }
    return { canvas:c, w:ow, h:oh };
  } finally { E.destroy(); }
}
async function encode(opts = {}){
  const fmt = opts.fmt || ST.exp.fmt, q = (opts.q || ST.exp.q) / 100, mime = 'image/' + fmt, r = await renderFull({ size:opts.size || ST.exp.size });
  if (fmt === 'jpeg'){ const g = r.canvas.getContext('2d'); g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, r.w, r.h); }
  let blob = await new Promise(ok => r.canvas.toBlob(ok, mime, fmt === 'png' ? undefined : q)); if (!blob) throw new Error('could not encode ' + fmt);
  const keep = opts.exif != null ? opts.exif : ST.exp.exif;
  if (keep && ST.src.tiff){ const t = patchTiff(ST.src.tiff.slice(), r.w, r.h); if (t){ const u = withExif(new Uint8Array(await blob.arrayBuffer()), t, mime); blob = new Blob([u], { type:mime }); } }
  const base = ST.src.name.replace(/\.[^.]+$/, '').replace(/[-_ ]?edited$/i, ''), ext = fmt === 'jpeg' ? 'jpg' : fmt;
  return { blob, name:`${base}-edited.${ext}`, w:r.w, h:r.h };
}
async function exportPhoto(how){
  if (!ST.src) return; if (ST.sess) applyTool();
  try {
    H.busy(true, how === 'save' ? 'Saving your photo…' : 'Preparing your photo…', 60, 'Full resolution');
    await new Promise(r => setTimeout(r, 30));
    const out = await encode(how === 'save' ? {} : { fmt:'jpeg', q:95, size:'full' });
    await saveRecent();
    if (how === 'save'){ H.busy(false); await H.save(out.blob, out.name); }
    else { H.busy(false); await sendToVideo(out, how); }
    ST.lastExport = { name:out.name, w:out.w, h:out.h, size:out.blob.size, type:out.blob.type };
    return out;
  } catch (e) { H.busy(false); console.error(e); H.toast('Couldn’t export: ' + (e.message || e), 5000); }
}
async function sendToVideo(out, how){
  const imp = hf('importOne'); if (!imp) return H.toast('Open EasyCut’s video editor to use photos in a video');
  const f = new File([out.blob], out.name, { type:out.blob.type }), m = await imp(f); if (!m) return;
  m.peEdit = { blob:ST.src.blob, name:ST.src.name, stack:deep(ST.stack), images:ST.images };
  const S_ = HX().S || null, refresh = () => { const r = hf('refreshAll'); if (r) r(); };
  if (how === 'replace' && S_ && ST.src.clipId){ const c = S_.clips.find(x => x.id === ST.src.clipId); if (c){ if (hf('push')) hf('push')(); c.mediaId = m.id; refresh(); close(); return H.toast('Edited photo is now in your video'); } }
  if (hf('addToTimeline')){ hf('addToTimeline')(m.id); refresh(); }   // addToTimeline records its own undo step
  close(); H.toast('Edited photo added to the end of your video');
}

/* ---------- recent edits (like a gallery): original + stack kept on this device, so edits stay editable ---------- */
const RDB = { db:null, open(){ if (this.db) return this.db; this.db = new Promise((ok, bad) => { const r = indexedDB.open('easycut-photo', 1); r.onupgradeneeded = () => r.result.createObjectStore('recent', { keyPath:'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); }); return this.db; },
  async tx(mode, fn){ const db = await this.open(); return new Promise((ok, bad) => { const t = db.transaction('recent', mode), st = t.objectStore('recent'), res = fn(st); t.oncomplete = () => ok(res && res.result); t.onerror = () => bad(t.error); }); },
  all(){ return this.tx('readonly', s => s.getAll()); }, put(v){ return this.tx('readwrite', s => s.put(v)); }, get(id){ return this.tx('readonly', s => s.get(id)); }, del(id){ return this.tx('readwrite', s => s.delete(id)); } };
async function saveRecent(){
  try { if (!ST.src || !ST.stack.length) return; const id = ST.src.recentId || (ST.src.recentId = uidp()), E = ST.eng;
    const o = runItems(E, ST.srcTex, ST.stack.filter(i => i.on !== false), { images:ST.images, srcKey:ST.srcKey }), sm = E.small(o, 240); E.free(o);
    const c = document.createElement('canvas'); c.width = sm.w; c.height = sm.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(sm.d), sm.w, sm.h), 0, 0);
    await RDB.put({ id, name:ST.src.name, at:Date.now(), thumb:c.toDataURL('image/jpeg', .8), blob:ST.src.blob, stack:JSON.parse(JSON.stringify(ST.stack.filter(i => i.tool !== 'double'))) });
    const all = (await RDB.all()).sort((a, b) => b.at - a.at); for (const x of all.slice(12)) await RDB.del(x.id);
  } catch (e) { console.warn('recent edits', e); }
}
async function loadRecents(){ const el = $p('#peRecent', root); if (!el) return; try { const all = (await RDB.all()).sort((a, b) => b.at - a.at); if (!all.length) return; el.innerHTML = `<h4>Recent edits <small>— still editable</small></h4><div class="pe-pgrid">${all.map(r => `<button class="pe-pth" data-recent="${r.id}" style="background-image:url('${r.thumb}')" title="${escp(r.name)}"></button>`).join('')}</div>`; } catch (e) {} }
async function openRecent(id){ const r = await RDB.get(id); if (!r) return; await openFile(new File([r.blob], r.name, { type:r.blob.type }), { stack:r.stack, recentId:r.id }); }

/* ---------- open / close ---------- */
function open(opts = {}){
  build(); layoutMode(); ST.open = true; ST.force2d = !!opts.force2d || ST.force2d; root.classList.add('on'); document.body.classList.add('pe-open');
  if (!ST.src) renderSide(); else { ensureEngine(); if (!ST.srcTex) uploadPreview(); afterStack(); }
  requestAnimationFrame(() => { fitStage(); render(); });
  if (!LS.get('gestHint', false) && matchMedia('(pointer:fine)').matches && GX()){ LS.set('gestHint', true); setTimeout(() => H.toast('🖱️ Tip: drag on the photo, scroll to adjust, pinch to zoom, hold right-click to compare. Press ? for all gestures', 6500), 600); }
  return true;
}
function close(){ if (!root) return; if (ST.sess) ST.sess = null; ST.open = false; root.classList.remove('on'); document.body.classList.remove('pe-open'); toggleStack(false); if (ST.stack.length) saveRecent(); }
async function openMedia(mid, clipId){
  const M = H.media(), m = M && M[mid]; if (!m) return H.toast('That photo isn’t loaded');
  open(); busy(true, 'Opening photo…');
  try {
    if (m.peEdit){ await loadSource(m.peEdit.blob, m.peEdit.name, { stack:m.peEdit.stack, images:m.peEdit.images, mediaId:mid, clipId }); return; }
    let blob = null; const D = H.desk();
    if (m.path && D && D.readFile){ try { const buf = await D.readFile(m.path); if (buf) blob = new Blob([buf], { type:/\.png$/i.test(m.name) ? 'image/png' : /\.webp$/i.test(m.name) ? 'image/webp' : 'image/jpeg' }); } catch (e) {} }
    if (!blob) blob = await (await fetch(m.url)).blob();
    await loadSource(blob, m.name, { mediaId:mid, clipId });
  } catch (e) { H.toast('Couldn’t open ' + m.name + ': ' + (e.message || e), 4000); }
  finally { busy(false); }
}
// Android back button / host "back": close a tool, the stack, or the editor
function back(){ if (!ST.open) return false; if (stackP && stackP.classList.contains('on')){ toggleStack(false); return true; } if (ST.sess){ cancelTool(); return true; } close(); return true; }

window.PhotoEditor = { open, close, back, openFile:(f, o) => { open(); return openFile(f, o); }, openMedia, get isOpen(){ return ST.open; },
  // for tests and scripts
  __:{ ST, TOOLS, RUN, openTool, applyTool, cancelTool, setParam, applyLook, allLooks, encode, exportPhoto, render:() => doRender(), undo, redo, toggleStack, openMask, setCompare, cssMatrix, curvesLUT, findTiff, withExif, patchTiff, runItems, mkItem, LS } };
})();
