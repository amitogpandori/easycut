/* EasyCut — mouse & touchpad gestures for PC and laptop.
   Video editor: timeline (two-finger scroll with inertia, pinch / Ctrl / Alt + wheel zoom, Shift + wheel, middle-drag pan,
   right-drag or Alt-drag scrub, double-click a clip for its settings, mouse back/forward = undo/redo, wheel over a value field)
   and preview (pinch / Ctrl + wheel zoom, drag to pan when zoomed, double-click fit / 100 %, wheel resizes the selected text
   or overlay, Shift + wheel rotates it).
   Also the shared wheel/touchpad classifier and the "Gestures" help (? key) used by the photo editor (app/photo-editor.js).
   Loaded after app/index.html's main script; everything it needs comes from window.__ecHost. */
(() => {
'use strict';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = s => document.querySelector(s);
const H = () => window.__ecHost || {};
const T = () => H().tl || null;

/* ---------- settings ---------- */
const LSK = 'easycut.gestures';
const PREF = Object.assign({ swipeUndo:true, hinted:false }, (() => { try { return JSON.parse(localStorage.getItem(LSK)) || {}; } catch (e) { return {}; } })());
const savePref = () => { try { localStorage.setItem(LSK, JSON.stringify(PREF)); } catch (e) {} };

/* ---------- mouse wheel or touchpad? ----------
   Chromium gives no flag, so guess: touchpads send pixel deltas that are small, fractional, or on both axes at once,
   in a fast stream; a mouse wheel sends whole "notches" (≥ 50 px, or line/page mode). Once a stream looks like a touchpad
   it stays one until it pauses, so the big deltas of a fast fling are not mistaken for a mouse.
   A touchpad pinch arrives as a wheel event with ctrlKey set (and a fractional deltaY). */
let tpUntil = 0;
function wheelKind(e){
  const now = performance.now(), dx = e.deltaX, dy = e.deltaY;
  let tp;
  if (e.deltaMode) tp = false;
  else if (now < tpUntil) tp = true;
  else tp = (dx % 1 !== 0) || (dy % 1 !== 0) || (dx !== 0 && dy !== 0) || (dx !== 0 && !e.shiftKey) || Math.max(Math.abs(dx), Math.abs(dy)) < 50;
  tpUntil = tp ? now + 350 : 0;
  const px = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
  return { tp, pinch:tp && e.ctrlKey, mouse:!tp, dx:dx * px, dy:dy * px };
}
/* one zoom factor for a wheel event: smooth for a pinch, about 15 % per mouse notch */
const zoomFactor = (e, k) => Math.exp(-clamp(k.dy, -300, 300) * (k.tp ? .012 : .0014));

/* ---------- small helpers ---------- */
function raf1(fn){ let id = 0; return () => { if (!id) id = requestAnimationFrame(() => { id = 0; fn(); }); }; }
const typing = el => el && el.matches && el.matches('input:not([type=range]):not([type=checkbox]),textarea,select,[contenteditable="true"]');
const isPhoto = () => !!(window.PhotoEditor && PhotoEditor.isOpen);

/* nudge a slider / number field and tell the app, exactly as if it was dragged */
function nudgeInput(el, notches, opts = {}){
  if (!el || el.disabled) return false;
  const min = el.min !== '' ? +el.min : -Infinity, max = el.max !== '' ? +el.max : Infinity, stp = el.step && el.step !== 'any' ? +el.step : 0;
  const span = isFinite(max - min) ? max - min : 100;
  let step = stp || span / 100; if (span / step > 400) step = span / 200;   // very fine sliders: 200 wheel notches end to end
  const v0 = +el.value || 0; let v = opts.mul ? v0 * Math.pow(opts.mul, notches) : v0 + notches * step * (opts.fast ? 10 : 1);
  v = clamp(v, min, max); if (stp) v = Math.round(v / stp) * stp; v = +v.toFixed(6);
  if (v === v0) return true;
  el.value = v; el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true }));
  return true;
}

/* ---------- wheel over a value field (any slider or number box, both editors) ----------
   Rest the pointer on a field and scroll to nudge it (Shift = ×10). While the panel itself is being scrolled the wheel
   keeps scrolling it, so a field passing under the pointer is never changed by accident. Alt + wheel always nudges. */
let panelScrollT = 0, fieldAcc = 0;
document.addEventListener('wheel', e => {
  if (e.defaultPrevented) return;
  const el = e.target.closest && e.target.closest('input[type=range],input[type=number]');
  const now = performance.now();
  if (!el){ if (Math.abs(e.deltaY) > 0 && e.target.closest && e.target.closest('#props,#panel,.pe-side,.pe-stack,.sheet,.studio')) panelScrollT = now; return; }
  if (!e.altKey && now - panelScrollT < 450){ panelScrollT = now; return; }
  const k = wheelKind(e), d = Math.abs(k.dy) >= Math.abs(k.dx) ? k.dy : (e.shiftKey ? k.dx : -k.dx);
  e.preventDefault(); e.stopPropagation();
  let n;
  if (k.tp){ fieldAcc += d; n = Math.trunc(fieldAcc / 24); if (!n) return; fieldAcc -= n * 24; } else n = Math.sign(d) * Math.max(1, Math.round(Math.abs(d) / 100));
  nudgeInput(el, -n, { fast:e.shiftKey });
  G.stats.fieldNudges++;
}, { passive:false, capture:true });

/* ---------- mouse back / forward buttons = undo / redo (and they never navigate away) ---------- */
function backFwd(e){
  if (e.button !== 3 && e.button !== 4) return;
  e.preventDefault(); e.stopPropagation();
  if (e.type !== 'mouseup') return;
  const redo = e.button === 4;
  if (isPhoto()){ const P = PhotoEditor.__; redo ? P.redo() : P.undo(); }
  else { const f = H()[redo ? 'redo' : 'undo'] || (T() && T()[redo ? 'redo' : 'undo']); if (f) f(); }
  hint(redo ? '↷ Redo' : '↶ Undo');
}
for (const t of ['mousedown', 'mouseup', 'auxclick']) window.addEventListener(t, backFwd, true);

/* ---------- small on-screen confirmation ---------- */
let hintEl = null, hintT = 0;
function hint(text, ms = 900){
  if (!hintEl){ hintEl = document.createElement('div'); hintEl.className = 'gx-hint'; document.body.appendChild(hintEl); }
  hintEl.textContent = text; hintEl.classList.add('on'); clearTimeout(hintT); hintT = setTimeout(() => hintEl.classList.remove('on'), ms);
}

/* ---------- styles ---------- */
const css = document.createElement('style');
css.textContent = `
.pv{overflow:hidden}
#cv.gx-zoomed{border-radius:0;box-shadow:none}
.pv.gx-pan,#tlScroll.gx-pan{cursor:grabbing!important}
.pv.gx-pan *,#tlScroll.gx-pan *{cursor:grabbing!important}
.gx-zbadge{position:absolute;right:26px;top:24px;z-index:5;padding:5px 10px;border-radius:999px;background:#000b;color:#fff;font:600 12px/1.2 inherit;pointer-events:auto;cursor:pointer;display:none;backdrop-filter:blur(6px)}
.gx-zbadge.on{display:block}
body:not(.mob) .item:hover > .h{background:#ffffff30}
body:not(.mob) .item > .h:hover{background:#fff;box-shadow:0 0 0 1px #0006}
.gx-hint{position:fixed;left:50%;bottom:22%;transform:translateX(-50%) scale(.96);z-index:2147483000;padding:9px 16px;border-radius:999px;background:#000c;color:#fff;font:700 14px/1.2 system-ui,sans-serif;opacity:0;transition:opacity .15s,transform .15s;pointer-events:none}
.gx-hint.on{opacity:1;transform:translateX(-50%) scale(1)}
.gx-help{position:fixed;inset:0;z-index:2147482000;background:#05070bcc;display:none;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
.gx-help.on{display:flex}
.gx-card{background:#141823;color:#e8ebf2;border:1px solid #ffffff1a;border-radius:18px;max-width:980px;width:100%;max-height:calc(100vh - 40px);overflow:auto;padding:22px 24px;box-shadow:0 30px 80px #000a;font:13px/1.45 'Plus Jakarta Sans',system-ui,sans-serif}
.gx-card h2{margin:0 0 4px;font-size:20px}.gx-card .gx-sub{color:#9aa3b5;margin:0 0 16px}
.gx-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px}
.gx-sec{background:#0e1119;border:1px solid #ffffff12;border-radius:14px;padding:12px 14px}
.gx-sec.cur{border-color:#ff4d6d88}
.gx-sec h3{margin:0 0 8px;font-size:13px;letter-spacing:.4px;text-transform:uppercase;color:#ff8aa0}
.gx-row{display:flex;gap:10px;padding:4px 0;border-top:1px solid #ffffff0d}.gx-row:first-of-type{border-top:0}
.gx-row b{flex:0 0 46%;font-weight:700;color:#fff}.gx-row span{color:#c3c9d6}
.gx-foot{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-top:16px}
.gx-foot label{display:flex;gap:8px;align-items:center;cursor:pointer}
.gx-foot button{background:#ff4d6d;color:#fff;border:0;border-radius:10px;padding:9px 18px;font-weight:700;cursor:pointer}
`;
document.head.appendChild(css);

/* ---------- the Gestures help (? key) ---------- */
const HELP = [
  ['video', 'Timeline', [
    ['Two-finger swipe', 'scroll left / right (glides to a stop)'],
    ['Pinch, Ctrl + wheel or Alt + wheel', 'zoom in / out around the pointer'],
    ['Shift + wheel', 'scroll left / right'],
    ['Middle-button drag', 'pan the timeline'],
    ['Right-drag, or Alt-drag on empty space', 'scrub the playhead'],
    ['Double-click a clip', 'open its settings'],
    ['Hover a clip edge', 'trim handle: drag to trim'],
    ['Mouse back / forward buttons', 'undo / redo'],
    ['Wheel over a slider or number', 'nudge it (Shift = ×10, Alt = always)'],
  ]],
  ['video', 'Preview', [
    ['Pinch or Ctrl + wheel', 'zoom the preview around the pointer'],
    ['Drag (when zoomed)', 'pan; middle-drag pans too'],
    ['Double-click', 'zoom to 100 % / back to fit'],
    ['Wheel over selected text / overlay', 'resize it'],
    ['Shift + wheel', 'rotate the selected text / overlay'],
  ]],
  ['photo', 'Photo editor', [
    ['Drag up / down on the photo', 'choose a setting (Snapseed style)'],
    ['Drag left / right', 'change it; Alt-drag or right-drag in brush tools'],
    ['Wheel / two-finger scroll', 'change the setting; Shift + wheel or vertical swipe picks another'],
    ['Pinch or Ctrl + wheel', 'zoom toward the pointer'],
    ['Space + drag, middle-drag', 'pan'],
    ['Double-click', 'zoom to 100 % / fit'],
    ['Hold right button, Space or \\', 'compare with the original'],
    ['Two-finger swipe left / right', 'undo / redo (outside a tool, if on below)'],
    ['Wheel over a curve point / crop edge', 'fine-tune it (Shift = faster)'],
    ['Mouse back / forward buttons', 'undo / redo'],
  ]],
];
let helpEl = null;
function help(ctx){
  if (!helpEl){
    helpEl = document.createElement('div'); helpEl.className = 'gx-help'; helpEl.id = 'gxHelp';
    helpEl.innerHTML = `<div class="gx-card" role="dialog" aria-label="Mouse and touchpad gestures"><h2>🖱️ Mouse & touchpad gestures</h2><p class="gx-sub">Works with a mouse, a laptop touchpad and touch screens. Press <b>?</b> any time to see this again.</p>
      <div class="gx-cols">${HELP.map(([c, t, rows]) => `<div class="gx-sec" data-ctx="${c}"><h3>${t}</h3>${rows.map(([a, b]) => `<div class="gx-row"><b>${a}</b><span>${b}</span></div>`).join('')}</div>`).join('')}</div>
      <div class="gx-foot"><label><input type="checkbox" id="gxSwipeUndo"> Touchpad two-finger swipe left / right = undo / redo in the photo editor</label><button id="gxClose">Got it</button></div></div>`;
    document.body.appendChild(helpEl);
    helpEl.addEventListener('click', e => { if (e.target === helpEl || e.target.id === 'gxClose') closeHelp(); });
    helpEl.querySelector('#gxSwipeUndo').addEventListener('change', e => { PREF.swipeUndo = e.target.checked; savePref(); });
  }
  helpEl.querySelector('#gxSwipeUndo').checked = PREF.swipeUndo;
  const c = ctx || (isPhoto() ? 'photo' : 'video');
  helpEl.querySelectorAll('.gx-sec').forEach(s => s.classList.toggle('cur', s.dataset.ctx === c));
  helpEl.classList.add('on'); PREF.hinted = true; savePref();
}
const closeHelp = () => { if (helpEl) helpEl.classList.remove('on'); };
const helpOpen = () => !!(helpEl && helpEl.classList.contains('on'));
window.addEventListener('keydown', e => {
  if (helpOpen() && (e.key === 'Escape' || e.key === '?')){ e.preventDefault(); e.stopImmediatePropagation(); closeHelp(); return; }
  if (e.key === '?' && !typing(e.target) && !e.ctrlKey && !e.metaKey){ e.preventDefault(); e.stopImmediatePropagation(); help(); }
}, true);

/* first use on a computer: one gentle tip */
function firstHint(){
  if (PREF.hinted || !matchMedia('(pointer:fine)').matches) return;
  PREF.hinted = true; savePref();
  const t = H().toast; if (t) t('🖱️ Tip: pinch, swipe and right-drag work here. Press ? to see all mouse & touchpad gestures', 6500);
}

/* ---------- timeline ---------- */
const G = { stats:{ fieldNudges:0 }, prefs:PREF, wheelKind, zoomFactor, nudgeInput, help, closeHelp, helpOpen, hint, pz:null };
function initTimeline(){
  const t = T(); if (!t) return; const sc = t.scroll;
  // horizontal scroll with inertia (touchpad), eased scrolling for a mouse wheel
  const S = { tx:0, ty:0, vx:0, last:0, inertia:0, ease:null };
  const flush = raf1(() => { if (S.tx || S.ty){ sc.scrollLeft += S.tx; sc.scrollTop += S.ty; S.tx = S.ty = 0; } });
  function startInertia(){
    cancelAnimationFrame(S.inertia); let prev = performance.now();
    const step = now => { const dt = Math.min(48, now - prev); prev = now; S.vx *= Math.pow(.93, dt / 16.7); if (Math.abs(S.vx) < .05){ S.inertia = 0; return; }
      const before = sc.scrollLeft; sc.scrollLeft += S.vx * dt; if (sc.scrollLeft === before){ S.inertia = 0; return; } S.inertia = requestAnimationFrame(step); };
    S.inertia = requestAnimationFrame(step);
  }
  let endT = 0;
  function easeTo(dx){
    const E = S.ease || (S.ease = { target:sc.scrollLeft, id:0 }); E.target = clamp(E.target + dx, 0, sc.scrollWidth - sc.clientWidth);
    if (E.id) return; const step = () => { const d = E.target - sc.scrollLeft; if (Math.abs(d) < .6){ sc.scrollLeft = E.target; E.id = 0; S.ease = null; return; } const b = sc.scrollLeft; sc.scrollLeft += d * .28; if (sc.scrollLeft === b){ E.id = 0; S.ease = null; return; } E.id = requestAnimationFrame(step); };
    E.id = requestAnimationFrame(step);
  }
  sc.addEventListener('wheel', e => {
    const k = wheelKind(e);
    if (e.ctrlKey || e.metaKey || e.altKey){   // pinch, Ctrl + wheel, Alt + wheel: zoom around the pointer
      e.preventDefault(); t.zoomBy(zoomFactor(e, k), t.xToTime(e.clientX)); return;
    }
    let dx = k.dx, dy = k.dy;
    if (e.shiftKey && !dx){ dx = dy; dy = 0; }
    const noV = sc.scrollHeight <= sc.clientHeight + 1;
    if (!k.tp && !dx && noV){ dx = dy; dy = 0; }   // nothing to scroll up/down: the mouse wheel scrolls along the timeline
    if (!dx) return;   // plain vertical scroll: leave it to the browser
    e.preventDefault(); cancelAnimationFrame(S.inertia); S.inertia = 0;
    if (k.tp){
      const now = performance.now(), dt = Math.max(4, now - (S.last || now - 16)); S.last = now;
      const v = dx / dt; S.vx = Math.abs(v) > Math.abs(S.vx) * 3 + 2 ? v : S.vx * .6 + v * .4;
      S.tx += dx; S.ty += dy; flush();
      clearTimeout(endT); endT = setTimeout(() => { S.last = 0; if (Math.abs(S.vx) > .12) startInertia(); }, 70);
    } else easeTo(dx);
  }, { passive:false });

  // middle-drag pans; right-drag or Alt-drag (not on a video clip, where Alt-drag slips) scrubs
  let pd = null, noMenu = 0;
  let lastDown = null;
  sc.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    if (e.button === 0 && !e.altKey){   // double-click an item: open its settings
      const it = e.target.closest('.item'), now = performance.now(), L = lastDown;
      lastDown = it && !e.target.closest('.h') ? { id:it.dataset.id, type:it.dataset.type, t:now, x:e.clientX, y:e.clientY } : null;
      if (it && L && L.id === it.dataset.id && now - L.t < 450 && Math.hypot(e.clientX - L.x, e.clientY - L.y) < 6){ lastDown = null; setTimeout(() => t.openSettings(L.type, L.id), 0); }
    }
    const onClip = e.target.closest('.vclip'), onMk = e.target.closest('[data-mk]');
    const mode = e.button === 1 ? 'pan' : e.button === 2 ? 'scrub' : (e.button === 0 && e.altKey && !onClip && !onMk) ? 'scrub' : null;
    if (!mode) return;
    e.preventDefault(); e.stopPropagation();
    pd = { mode, id:e.pointerId, x:e.clientX, y:e.clientY, sl:sc.scrollLeft, st:sc.scrollTop, moved:false };
    try { sc.setPointerCapture(e.pointerId); } catch (er) {}
    if (mode === 'pan') sc.classList.add('gx-pan');
    else { t.pause(); t.scrubTo(clamp(t.xToTime(e.clientX), 0, t.totalDur())); }
  }, true);
  const mv = raf1(() => { if (!pd || !pd.ev) return; const e = pd.ev;
    if (pd.mode === 'pan'){ sc.scrollLeft = pd.sl - (e.clientX - pd.x); sc.scrollTop = pd.st - (e.clientY - pd.y); }
    else t.scrubTo(clamp(t.xToTime(e.clientX), 0, t.totalDur())); });
  sc.addEventListener('pointermove', e => { if (!pd || e.pointerId !== pd.id) return; e.stopPropagation(); if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 3) pd.moved = true; pd.ev = { clientX:e.clientX, clientY:e.clientY }; mv(); }, true);
  const up = e => { if (!pd || e.pointerId !== pd.id) return; e.stopPropagation(); if (pd.mode === 'scrub' || pd.moved) noMenu = performance.now(); sc.classList.remove('gx-pan'); pd = null; };
  sc.addEventListener('pointerup', up, true); sc.addEventListener('pointercancel', up, true);
  sc.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });   // no auto-scroll compass
  sc.addEventListener('contextmenu', e => { e.preventDefault(); });
  void noMenu;

}

/* ---------- preview ---------- */
function initPreview(){
  const t = T(); if (!t) return; const cv = t.cv, pv = t.pv;
  const PZ = G.pz = { k:1, x:0, y:0 };
  const badge = document.createElement('div'); badge.className = 'gx-zbadge'; badge.title = 'Double-click the preview to fit'; pv.appendChild(badge);
  badge.addEventListener('click', () => setZoom(1));
  // the canvas box before our transform (fitCanvas() keeps setting left/top/width/height)
  const base = () => { const r = cv.getBoundingClientRect(); return { left:r.left - PZ.x, top:r.top - PZ.y, w:r.width / PZ.k, h:r.height / PZ.k }; };
  const apply = raf1(() => {
    if (PZ.k <= 1.001){ PZ.k = 1; PZ.x = PZ.y = 0; cv.style.transform = ''; cv.classList.remove('gx-zoomed'); badge.classList.remove('on'); return; }
    cv.style.transformOrigin = '0 0'; cv.style.transform = `translate(${PZ.x.toFixed(1)}px,${PZ.y.toFixed(1)}px) scale(${PZ.k.toFixed(4)})`;
    cv.classList.add('gx-zoomed'); badge.textContent = Math.round(PZ.k * 100) + '% · double-click to fit'; badge.classList.add('on');
  });
  const clampPan = b => { PZ.x = clamp(PZ.x, b.w * (1 - PZ.k), 0); PZ.y = clamp(PZ.y, b.h * (1 - PZ.k), 0); };
  function zoomAt(cx, cy, k2){
    const b = base(); k2 = clamp(k2, 1, 8);
    const lx = (cx - b.left - PZ.x) / PZ.k, ly = (cy - b.top - PZ.y) / PZ.k;
    PZ.x = cx - b.left - lx * k2; PZ.y = cy - b.top - ly * k2; PZ.k = k2; clampPan(b); apply();
  }
  function setZoom(k2, cx, cy){ if (k2 <= 1){ PZ.k = 1; PZ.x = PZ.y = 0; apply(); return; } const b = base(); zoomAt(cx == null ? b.left + b.w / 2 : cx, cy == null ? b.top + b.h / 2 : cy, k2); }
  G.previewZoom = (k, cx, cy) => setZoom(k, cx, cy);
  let acc = 0;
  pv.addEventListener('wheel', e => {
    if (!e.target.closest('#cv') && !e.target.closest('.gx-zbadge')) return;
    const k = wheelKind(e);
    if (e.ctrlKey || e.metaKey){ e.preventDefault(); e.stopPropagation(); zoomAt(e.clientX, e.clientY, PZ.k * zoomFactor(e, k)); return; }
    const s = t.sel(), o = s && (s.type === 'text' || s.type === 'overlay') && !t.cropMode() ? t.getSel() : null;
    if (o){   // resize / rotate the selected text or overlay through its own slider, so undo and keyframes keep working
      e.preventDefault(); e.stopPropagation();
      const d = (Math.abs(k.dy) >= Math.abs(k.dx) ? k.dy : k.dx); let n;
      if (k.tp){ acc += d; n = Math.trunc(acc / 20); if (!n) return; acc -= n * 20; } else n = Math.sign(d) * Math.max(1, Math.round(Math.abs(d) / 100));
      const rot = e.shiftKey, key = rot ? (s.type === 'text' ? 'rot' : 'rotate') : (s.type === 'text' ? 'size' : 'scale');
      const el = document.querySelector(`#props input[type=range][data-k="${key}"]`);
      if (el) nudgeInput(el, -n * (rot ? 4 : 1), rot ? {} : { mul:1.06 });
      return;
    }
    if (PZ.k > 1){ e.preventDefault(); e.stopPropagation(); let dx = k.dx, dy = k.dy; if (e.shiftKey && !dx){ dx = dy; dy = 0; } PZ.x -= dx; PZ.y -= dy; clampPan(base()); apply(); }
  }, { passive:false, capture:true });
  // drag to pan when zoomed (on empty picture; texts and overlays still drag), middle-drag always pans
  let pd = null, lastDown = null;
  pv.addEventListener('pointerdown', e => {
    if (!e.target.closest('#cv')) return;
    if (e.button === 0 && e.pointerType === 'mouse'){   // double-click on the picture (not on a text / overlay): 100 % ⇄ fit
      const now = performance.now(), L = lastDown, hit = t.pvHit(e); lastDown = hit ? null : { t:now, x:e.clientX, y:e.clientY };
      if (!hit && L && now - L.t < 450 && Math.hypot(e.clientX - L.x, e.clientY - L.y) < 6){ lastDown = null; e.preventDefault(); e.stopPropagation(); dbl(e); return; }
    }
    if (PZ.k <= 1) return;
    if (!(e.button === 1 || (e.button === 0 && !t.pvHit(e)))) return;
    e.preventDefault(); e.stopPropagation(); pd = { id:e.pointerId, x:e.clientX, y:e.clientY, px:PZ.x, py:PZ.y };
    try { pv.setPointerCapture(e.pointerId); } catch (er) {} pv.classList.add('gx-pan');
  }, true);
  pv.addEventListener('pointermove', e => { if (!pd || e.pointerId !== pd.id) return; e.stopPropagation(); PZ.x = pd.px + e.clientX - pd.x; PZ.y = pd.py + e.clientY - pd.y; clampPan(base()); apply(); }, true);
  const up = e => { if (!pd || e.pointerId !== pd.id) return; pd = null; pv.classList.remove('gx-pan'); };
  pv.addEventListener('pointerup', up, true); pv.addEventListener('pointercancel', up, true);
  pv.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
  // double-click: 100 % (one project pixel per screen pixel; 200 % if the preview is already that big) / back to fit
  function dbl(e){
    if (PZ.k > 1){ setZoom(1); return; }
    const b = base(), full = t.canvasSize()[0] / b.w; setZoom(full >= 1.25 ? full : 2, e.clientX, e.clientY);
  }
  new ResizeObserver(() => { if (PZ.k > 1){ clampPan(base()); apply(); } }).observe(pv);
}

function init(){
  if (!H().tl){ setTimeout(init, 50); return; }
  initTimeline(); initPreview();
  setTimeout(firstHint, 1500);
}
window.ECGestures = G;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
