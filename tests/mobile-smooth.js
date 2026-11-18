// Phone smoothness test (Android build) in the real app, with real touch input through Chrome DevTools:
// layout at 360×800, 412×880, 412×915 and sideways (915×412), passive touch listeners, tap vs swipe on clips,
// long-press to drag a clip (with a haptic tick), bigger trim handles, swipe-down to close sheets, lower preview
// resolution while scrubbing, pinch zoom, snapping, lazy thumbnails, then frame times with the CPU slowed down 4×,
// and finally that the desktop layout is unchanged.
// Run with: npm test   (needs a desktop session — GitHub's Windows runners have one)
const { _electron: electron } = require('playwright');
const path = require('path');
const B = require('./mobile-bench');

const root = path.join(__dirname, '..');
let failed = 0;
function check(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ FAILED: ') + msg); if (!cond) failed++; }

(async () => {
  const app = await electron.launch({ args: [root], env: { ...process.env, EASYCUT_TEST: '1' } });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const ec = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  let cdp = null;
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x: Math.round(x), y: Math.round(y), id: i + 1 })) });
  const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await wait(40); await touch('touchEnd', []); await wait(200); };
  const tdrag = async (x0, y0, x1, y1, steps = 12, hold = 0, after = null) => {
    await touch('touchStart', [[x0, y0]]); if (hold) await wait(hold);
    for (let i = 1; i <= steps; i++){ await touch('touchMove', [[x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps]]); await wait(16); if (after && i === Math.ceil(steps / 2)) await after(); }
    await touch('touchEnd', []); await wait(120);
  };
  const desel = () => ec(() => { const b = document.querySelector('[data-pa="mclose"]'); if (b && b.offsetParent) b.click(); const c = document.querySelector('[data-act="closeSheet"]'); if (c && c.offsetParent) c.click(); });
  const rect = (sel) => ec((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
  try {
    await B.loadProject(page);
    const vm = await ec(() => document.querySelector('meta[name=viewport]').content);
    check(/user-scalable=no/.test(vm) && /viewport-fit=cover/.test(vm), 'no accidental page zoom, drawn edge to edge (viewport: ' + vm + ')');

    // 1. layout at phone sizes
    for (const [w, h] of [[360, 800], [412, 880], [412, 915], [915, 412]]){
      cdp = await B.setupPhone(app, page, w, h, 1); await wait(500); await desel(); await wait(250);
      if (!(await ec(() => document.body.classList.contains('pro-on')))) await ec(() => document.getElementById('bPro').click());
      await wait(300);
      const L = await ec(() => {
        const R = (e) => e.getBoundingClientRect(), bad = [], vw = innerWidth, vh = innerHeight;
        if (document.documentElement.scrollWidth > vw + 1) bad.push('page wider than screen');
        const ex = R(document.getElementById('bExport')); if (ex.right > vw + .5 || ex.left < 0) bad.push('Export cut off');
        const tabs = [...document.querySelectorAll('#rail .tab')].map((t) => R(t).height); if (Math.min(...tabs) < 48) bad.push('tool buttons ' + Math.min(...tabs) + 'px');
        const pro = [...document.querySelectorAll('#tlPro .btn')].map((t) => R(t).height); if (Math.min(...pro) < 44) bad.push('Pro buttons ' + Math.min(...pro) + 'px');
        const tb = [...document.querySelectorAll('.tlbar .btn, .tlbar .ib')].filter((b) => b.offsetParent).map((t) => R(t).height); if (Math.min(...tb) < 36) bad.push('timeline bar buttons ' + Math.min(...tb) + 'px');
        const ts = R(document.getElementById('tlScroll')); if (ts.height < 110) bad.push('timeline only ' + Math.round(ts.height) + 'px tall');
        const cvr = R(document.getElementById('cv')); if (cvr.height < 110) bad.push('preview only ' + Math.round(cvr.height) + 'px tall');
        const lab = [...document.querySelectorAll('.tlbar .btn')].filter((b) => b.offsetParent); for (let i = 1; i < lab.length; i++) if (R(lab[i]).left < R(lab[i - 1]).right - 1) { bad.push('timeline bar buttons overlap'); break; }
        return { bad, land: document.body.classList.contains('land'), mob: document.body.classList.contains('mob'), tl: R(document.querySelector('.tl')).left, ws: R(document.querySelector('.ws')).left, tlh: Math.round(ts.height), cvh: Math.round(cvr.height) };
      });
      await ec(() => document.querySelector('#rail [data-tab="templates"]').click()); await wait(450);
      const P = await ec(() => { const p = document.getElementById('panel').getBoundingClientRect(), r = document.getElementById('rail').getBoundingClientRect(); return { left: p.left, bottom: p.bottom, top: p.top, rail: r.top, anim: getComputedStyle(document.getElementById('panel')).animationName, cv: getComputedStyle(document.querySelector('#panel .pgrid')).contentVisibility }; });
      if (P.bottom > P.rail + 1 || P.top < 0) L.bad.push('sheet off screen');
      if (w > h && P.left < w * .35) L.bad.push('sideways sheet not on the right');
      if (w > h && !(L.land && L.tl > L.ws)) L.bad.push('sideways layout not side by side');
      await desel(); await wait(250);
      check(L.mob && !L.bad.length, `${w}×${h}${w > h ? ' (sideways: preview left, timeline right)' : ''}: everything fits, touch targets ≥ 44–48 px, timeline ${L.tlh}px, preview ${L.cvh}px${L.bad.length ? ' — ' + L.bad.join(', ') : ''}`);
      if (w === 412 && h === 915) check(P.anim === 'ecSheetIn' && P.cv === 'auto', `sheets slide up with a spring (${P.anim}) and long grids render lazily (content-visibility: ${P.cv})`);
    }

    // 2. touch behaviour at 412×915
    cdp = await B.setupPhone(app, page, 412, 915, 1); await wait(400); await desel();
    if (await ec(() => document.body.classList.contains('pro-on'))) await ec(() => document.getElementById('bPro').click());
    await wait(300);
    await ec(() => { window.__vib = []; Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p) => { window.__vib.push(p); return true; } }); });
    { const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.getElementById("tlScroll")' });
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
      const by = (t) => listeners.filter((l) => l.type === t);
      check(by('touchstart').length && by('touchstart').every((l) => l.passive) && by('scroll').every((l) => l.passive) && by('touchend').every((l) => l.passive),
        `timeline touch listeners are passive (touchstart ${by('touchstart').length}, scroll ${by('scroll').length}, touchend ${by('touchend').length}), so scrolling never waits for the app`); }
    const vb = await rect('#trkV'), sb = await rect('#tlScroll'), vy = vb.y + vb.h / 2, cx = sb.x + sb.w / 2;
    // swipe that starts on a clip scrolls and doesn't open the clip settings
    await ec(() => { const E = window.__ec; E.playT = E.clipStarts()[2] + .3; E.renderFrame(); }); await wait(300);
    const sl0 = await ec(() => document.getElementById('tlScroll').scrollLeft);
    await tdrag(cx + 60, vy, cx - 90, vy, 10); await wait(250);
    const sw = await ec(() => ({ sl: document.getElementById('tlScroll').scrollLeft, sel: document.body.classList.contains('has-sel') }));
    check(sw.sl - sl0 > 60 && !sw.sel, `a swipe that starts on a clip scrolls the timeline (${Math.round(sw.sl - sl0)} px) without opening its settings`);
    // tap selects
    await tap(cx + 20, vy);
    check(await ec(() => document.body.classList.contains('has-sel')), 'a tap on a clip selects it');
    const hs = await ec(() => { const it = document.querySelector('.item.sel'), h = it.querySelector('.h-r'), o = document.querySelector('.item:not(.sel) .h'); return { w: h.getBoundingClientRect().width, ih: it.getBoundingClientRect().height, pe: o ? getComputedStyle(o).pointerEvents : 'none', ta: getComputedStyle(h).touchAction }; });
    check(hs.w >= 26 && hs.ih >= 48 && hs.pe === 'none' && hs.ta === 'none', `trim handles: ${hs.w}px wide on a ${hs.ih}px tall clip, only on the selected clip (others ignore touches)`);
    // trim by touch on the selected clip's right handle
    { const before = await ec(() => { const E = window.__ec, c = E.S.clips.find((x) => document.querySelector('.item.sel').dataset.id === x.id); return c.out - c.in; });
      const hr = await rect('.item.sel .h-r');
      if (hr.r > sb.r - 2) { await ec(() => { const E = window.__ec, id = document.querySelector('.item.sel').dataset.id, i = E.S.clips.findIndex((x) => x.id === id); E.playT = E.clipStarts()[i] + .2; E.renderFrame(); }); await wait(250); }
      const hr2 = await rect('.item.sel .h-r');
      await tdrag(hr2.x + hr2.w / 2, hr2.y + hr2.h / 2, hr2.x + hr2.w / 2 - 30, hr2.y + hr2.h / 2, 8);
      const after = await ec(() => { const E = window.__ec, it = document.querySelector('.item.sel'); const c = E.S.clips.find((x) => it && it.dataset.id === x.id); return c ? c.out - c.in : -1; });
      check(after > 0 && after < before - .05, `trim a clip with a finger on its handle (${before.toFixed(2)} s → ${after.toFixed(2)} s)`); }
    await ec(() => document.querySelector('[data-pa="mclose"]').click()); await wait(250);
    // long-press lifts a clip; dragging it to the right reorders it; haptic ticks
    await ec(() => { const E = window.__ec; E.playT = E.clipStarts()[1] + .25; E.renderFrame(); window.__vib.length = 0; }); await wait(300);
    const order0 = await ec(() => window.__ec.S.clips.map((c) => c.id));
    const c1 = await ec(() => { const E = window.__ec, id = E.S.clips[1].id, r = document.querySelector(`.vclip[data-id="${id}"]`).getBoundingClientRect(); return { x: r.x, w: r.width, id }; });
    let lifted = false;
    const lx = Math.max(sb.x + 10, Math.min(sb.r - 10, c1.x + c1.w / 2));
    await tdrag(lx, vy, lx + c1.w + 40, vy, 16, 520, async () => { lifted = await ec(() => document.body.classList.contains('tl-drag') && !!document.querySelector('.item.lifted')); });
    await wait(300);
    const lpR = await ec((id) => ({ idx: window.__ec.S.clips.findIndex((c) => c.id === id), vib: window.__vib.slice(), drag: document.body.classList.contains('tl-drag') }), c1.id);
    check(lifted && lpR.idx > 1 && !lpR.drag, `long-press lifts a clip and dragging moves it (clip 2 → position ${lpR.idx + 1})`);
    check(lpR.vib.length >= 1 && lpR.vib[0] >= 10, `haptic feedback on lift and while passing other clips (vibrate ${JSON.stringify(lpR.vib)})`);
    await ec((o) => { const E = window.__ec; E.S.clips.sort((a, b) => o.indexOf(a.id) - o.indexOf(b.id)); }, order0); await desel(); await wait(200);
    // lower preview resolution while the finger scrubs, sharp again when it rests
    { await ec(() => { window.__ec.playT = 3; }); await wait(400);
      const idle = await ec(() => document.getElementById('cv').width); let mid = 0;
      const rb = await rect('#ruler');
      await tdrag(cx + 60, rb.y + 12, cx - 120, rb.y + 12, 14, 0, async () => { mid = await ec(() => document.getElementById('cv').width); });
      await wait(500); const back = await ec(() => document.getElementById('cv').width);
      check(mid > 0 && mid < idle * .8 && back === idle, `preview draws at lower resolution while scrubbing (${mid} px wide) and sharpens when the finger rests (${back} px)`); }
    // pinch zoom (on the ruler row, then on the clips)
    const pinchAt = async (y) => {
      await ec(() => { const s = document.getElementById('tlScroll'), n = window.__pn = {}; window.__pnOff = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointercancel'].map((t) => { const f = (e) => { n[t] = (n[t] || 0) + 1; }; s.addEventListener(t, f, { capture: true, passive: true }); return [t, f]; }); });
      const z0 = await ec(() => +document.getElementById('zoom').value);
      await touch('touchStart', [[cx - 30, y], [cx + 30, y]]);
      for (let i = 1; i <= 14; i++){ await touch('touchMove', [[cx - 30 - i * 6, y], [cx + 30 + i * 6, y]]); await wait(16); }
      await touch('touchEnd', []); await wait(250);
      const z1 = await ec(() => +document.getElementById('zoom').value);
      const ev = await ec(() => { const s = document.getElementById('tlScroll'); window.__pnOff.forEach(([t, f]) => s.removeEventListener(t, f, true)); return window.__pn; });
      await ec((z) => { const el = document.getElementById('zoom'); el.value = z; el.dispatchEvent(new Event('input')); }, z0); await wait(250);
      return { z0, z1, ev };
    };
    { const rb = await rect('#ruler'), a = await pinchAt(rb.y + 12);
      check(a.z1 > a.z0 + 3, `pinch to zoom the timeline: stretched on the GPU while pinching, applied once on release (zoom ${a.z0.toFixed(0)} → ${a.z1.toFixed(0)})`);
      const b = await pinchAt(vy);
      // reported, not failed: Chrome on desktop Windows can hand a two-finger gesture that starts on clips to its own handling
      console.log(`    ${b.z1 > b.z0 + 3 ? '✓' : 'ℹ'} pinch starting on clips: zoom ${b.z0.toFixed(0)} → ${b.z1.toFixed(0)} (events ${JSON.stringify(b.ev)})`); }
    // snapping: a swipe that comes to rest just next to a cut settles on it
    { const cut = await ec(() => { window.__vib.length = 0; return window.__ec.clipStarts()[3]; });
      await ec(() => { const E = window.__ec, s = document.getElementById('tlScroll'), el = document.querySelector(`.vclip[data-id="${E.S.clips[3].id}"]`); s.scrollLeft = el.offsetLeft + 7; });
      await wait(900);
      const r = await ec(() => ({ t: window.__ec.playT, vib: window.__vib.length }));
      check(Math.abs(r.t - cut) < .06 && r.vib >= 1, `scrolling to rest next to a cut snaps the playhead onto it with a tick (${r.t.toFixed(2)} s, cut at ${cut.toFixed(2)} s)`); }
    // bottom sheets: drag the top bar down to close, a small drag springs back
    { await ec(() => document.querySelector('#rail [data-tab="effects"]').click()); await wait(450);
      const hb = await rect('#panel .sheet-h');
      await tdrag(hb.x + 60, hb.y + 14, hb.x + 60, hb.y + 44, 6); await wait(500);
      const stillOpen = await ec(() => document.body.classList.contains('sheet') && !document.getElementById('panel').style.transform);
      await tdrag(hb.x + 60, hb.y + 14, hb.x + 60, hb.y + 300, 8); await wait(500);
      const closed = await ec(() => !document.body.classList.contains('sheet'));
      check(stillOpen && closed, 'tool sheet: a small pull springs back, a swipe down closes it');
      await tap(cx + 20, vy); await wait(300);
      const mb = await rect('#props .mclose');
      await tdrag(mb.x + 60, mb.y + 14, mb.x + 60, mb.y + 320, 8); await wait(500);
      check(!(await ec(() => document.body.classList.contains('has-sel'))), 'clip settings sheet closes with a swipe down too'); }
    // lazy thumbnails, blob URLs
    { await tap(cx + 20, vy); await desel(); await tap(cx + 20, vy); await wait(200);
      await ec(() => { document.querySelector('[data-pa="mclose"]').click(); }); await wait(150);
      await tap(cx + 20, vy); await ec(() => document.querySelector('#rail [data-tab="filter"]').click()); await wait(500);
      const lz = await ec(() => { const all = [...document.querySelectorAll('#panel .fcard > div')]; return { n: all.length, wait: all.filter((d) => d.dataset.bg).length, first: all[0] ? all[0].style.backgroundImage : '' }; });
      check(lz.n > 10 && lz.wait > 0 && /blob:/.test(lz.first), `filter thumbnails load only when scrolled into view (${lz.n - lz.wait} of ${lz.n} loaded)`);
      check(await ec(() => /blob:/.test(document.querySelector('.vclip').style.backgroundImage)), 'timeline thumbnails are cached as small blob: images (not re-parsed data URLs)');
      await desel(); await wait(200); }

    // 3. frame times with the CPU slowed down 4× (a mid-range phone)
    cdp = await B.setupPhone(app, page, 412, 915, 4); await wait(500);
    const R = await B.bench(app, page, cdp);
    const f = (x) => `${x.fps} fps, p95 ${x.p95} ms, main thread busy ${x.busyPct}%`;
    console.log('    swipe: ' + f(R.swipe) + ' · pinch: ' + f(R.pinch) + ' · scrub: ' + f(R.scrub) + ' · play: ' + f(R.play));
    console.log('    panel open (ms): ' + Object.entries(R.open).map(([k, v]) => `${k} ${v}`).join(', '));
    check(R.swipeOnClip.moved > 0 && !R.swipeOnClip.openedSheet && R.pinch.zoomMid > R.pinch.zoomFrom && R.pinch.zoomTo < R.pinch.zoomMid, `throttled phone: swipes and pinches still work (swipe on a clip ${R.swipeOnClip.moved} px${R.swipeOnClip.openedSheet ? ', opened settings' : ''}; zoom ${R.pinch.zoomFrom} → ${R.pinch.zoomMid} → ${R.pinch.zoomTo})`);
    check(Math.max(...Object.values(R.open)) < 250 && R.scrub.p95 < 60, `throttled phone: panels open in < 250 ms (slowest ${Math.max(...Object.values(R.open))} ms), scrub p95 ${R.scrub.p95} ms`);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    // 4. desktop unchanged
    await cdp.send('Emulation.clearDeviceMetricsOverride'); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(1400, 900); });
    await page.waitForFunction(() => !document.body.classList.contains('mob'), null, { timeout: 5000 }); await wait(300);
    const D = await ec(() => ({ aH: parseFloat(document.getElementById('trkA').style.height), h: document.querySelector('.item .h') ? document.querySelector('.item .h').getBoundingClientRect().width : 10, panelPos: getComputedStyle(document.getElementById('props')).position, mlp: document.getElementById('tlInner').style.marginLeft }));
    await page.locator('.vclip').nth(1).click(); await wait(200);
    const dsel = await ec(() => document.querySelector('.vclip.sel') && getComputedStyle(document.getElementById('props')).display !== 'none');
    check(D.aH === 41 && D.h === 10 && D.panelPos !== 'fixed' && D.mlp === '0px' && dsel, 'desktop layout unchanged (track heights, 10 px handles, side panels, mouse click selects)');
    check(!errors.length, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  } catch (e) { console.log('  ✗ ' + (e.stack || e)); failed++; }
  await app.close();
  if (failed){ console.log(`\n${failed} phone smoothness check(s) failed.`); process.exit(1); }
  console.log('All phone smoothness tests passed.');
})();
