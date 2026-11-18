// Phone smoothness benchmark: runs the real app in a phone-sized window with the CPU slowed down 4× (like a mid-range phone)
// and measures frame times while swiping the timeline, pinch-zooming, playing, and how long tool panels take to open.
// Uses real touch input through Chrome DevTools (Input.synthesizeScrollGesture / synthesizePinchGesture).
// Run alone with: node tests/mobile-bench.js [out.json]   — also used by tests/mobile-smooth.js
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const media = (f) => path.join(__dirname, 'media', f);

const stats = (iv) => {
  const a = [...iv].sort((x, y) => x - y), q = (p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
  return { frames: a.length, median: +q(.5).toFixed(1), p95: +q(.95).toFixed(1), jank: a.length ? +(100 * a.filter((x) => x > 34).length / a.length).toFixed(1) : 0, fps: a.length ? +(1000 / (a.reduce((s, x) => s + x, 0) / a.length)).toFixed(1) : 0 };
};

async function setupPhone(app, page, w = 412, h = 915, throttle = 4) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.unmaximize(); win.setMinimumSize(300, 300); win.setContentSize(w, h); }, [w, h]);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2.625, mobile: true });
  await page.waitForFunction(() => document.body.classList.contains('mob'), null, { timeout: 5000 });
  CDP = cdp; await cdp.send('Performance.enable');
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  return cdp;
}

// record frame intervals in the page while `act` runs
let CDP = null;
const perfM = async () => { if (!CDP) return {}; const { metrics } = await CDP.send('Performance.getMetrics'); const o = {}; for (const m of metrics) o[m.name] = m.value; return o; };
async function frames(page, act, extraMs = 400) {
  const m0 = await perfM(), w0 = Date.now();
  await page.evaluate(() => { const r = window.__fr = { t: [], lt: 0, on: true }; const loop = (ts) => { if (!r.on) return; r.t.push(ts); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    try { r.po = new PerformanceObserver((l) => { for (const e of l.getEntries()) r.lt += e.duration > 50 ? 1 : 0; }); r.po.observe({ entryTypes: ['longtask'] }); } catch (e) {} });
  await act();
  await page.waitForTimeout(extraMs);
  const t = await page.evaluate(() => { const r = window.__fr; r.on = false; try { r.po.disconnect(); } catch (e) {} return { t: r.t, lt: r.lt }; });
  const iv = []; for (let i = 1; i < t.t.length; i++) iv.push(t.t[i] - t.t[i - 1]);
  const m1 = await perfM(), wall = Date.now() - w0, d = (k) => +(((m1[k] || 0) - (m0[k] || 0)) * 1000).toFixed(0);
  return { ...stats(iv.slice(1)), longTasks: t.lt, busyMs: d('TaskDuration'), scriptMs: d('ScriptDuration'), layoutMs: d('LayoutDuration'), styleMs: d('RecalcStyleDuration'), busyPct: wall ? +(100 * d('TaskDuration') / wall).toFixed(0) : 0 };
}

async function loadProject(page) {
  await page.waitForSelector('#bExport');
  if (await page.locator('#home.on').count()){ await page.click('#home [data-h="templates"]'); await page.click('[data-act="closeSheet"]'); }
  await page.setInputFiles('#fileIn', ['clip1.mp4', 'clip2.mp4', 'photo-land.jpg', 'photo-port.webp', 'wild-bird.jpg', 'wild-sunset.jpg', 'wild.mp4', 'clip1.mp4', 'photo.png', 'wild-wide.jpg'].map(media));
  await page.waitForFunction(() => window.__ec.S.clips.length >= 10 && Object.values(window.__ec.media).every((m) => !m.loading), null, { timeout: 90000 });
  await page.setInputFiles('#fileAud', [media('music.mp3')]);
  await page.waitForFunction(() => window.__ec.S.audios.length >= 1 && Object.values(window.__ec.media).every((m) => !m.loading), null, { timeout: 60000 });
  await page.evaluate(() => { const E = window.__ec; E.S.clips.forEach((c, i) => { if (i % 2) c.trans = 'fade'; }); });
  await page.waitForTimeout(600);
}

async function bench(app, page, cdp) {
  const R = {};
  const box = await page.locator('#tlScroll').boundingBox();
  const y = Math.round(box.y + 12), cx = Math.round(box.x + box.width / 2 + 50);
  const desel = () => page.evaluate(() => { const b = document.querySelector('[data-pa="mclose"]'); if (b && b.offsetParent) b.click(); const c = document.querySelector('[data-act="closeSheet"]'); if (c && c.offsetParent) c.click(); });
  await desel(); await page.evaluate(() => { window.__ec.playT = 0; }); await page.waitForTimeout(300);
  // 1. swipe the timeline (fling with momentum) — the preview follows the playhead
  const s0 = await page.evaluate(() => document.getElementById('tlScroll').scrollLeft);
  const drag = async (x0, yy, dx, steps = 20, hold = 0) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: yy }] });
    if (hold) await page.waitForTimeout(hold);
    for (let i = 1; i <= steps; i++){ await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 + dx * i / steps), y: yy }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  R.swipe = await frames(page, async () => { for (let i = 0; i < 3; i++) await drag(cx + 100, y, -220, 14); }, 900);
  R.swipe.moved = Math.round(await page.evaluate(() => document.getElementById('tlScroll').scrollLeft) - s0);
  R.swipe.playT = +(await page.evaluate(() => window.__ec.playT)).toFixed(2);
  await desel();
  // 2. pinch to zoom the timeline
  const z0 = await page.evaluate(() => +document.getElementById('zoom').value);
  const pinch = async (from, to, steps = 24) => {
    const pts = (d) => [{ x: cx - d, y, id: 1 }, { x: cx + d, y, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
    for (let i = 1; i <= steps; i++){ await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(Math.round(from + (to - from) * i / steps)) }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  let zMid = 0;
  R.pinch = await frames(page, async () => { await pinch(30, 120); await page.waitForTimeout(100); zMid = await page.evaluate(() => +document.getElementById('zoom').value); await pinch(120, 50); }, 500);
  R.pinch.zoomMid = +zMid.toFixed(0);
  R.pinch.zoomFrom = +z0.toFixed(0); R.pinch.zoomTo = +(await page.evaluate(() => +document.getElementById('zoom').value)).toFixed(0);
  await desel();
  // 3. scrub by dragging slowly (a finger held on the timeline)
  R.scrub = await frames(page, async () => { await drag(cx + 100, y, -240, 40); }, 500);
  // swipe that starts on a clip (should scroll, not open the clip settings)
  // start from the left edge, so the earlier swipes/scrubs can't leave the timeline already scrolled to its end (that read as "0 px")
  await desel(); await page.evaluate(() => { document.getElementById('tlScroll').scrollLeft = 0; }); await page.waitForTimeout(250);
  { const vb = await page.locator('#trkV').boundingBox(), vy = Math.round(vb.y + vb.height / 2); const before = await page.evaluate(() => document.getElementById('tlScroll').scrollLeft);
    const selBefore = await page.evaluate(() => {
      const log = (window.__swLog = {}); const t = document.getElementById('tlInner'), sc = document.getElementById('tlScroll');
      const add = (n) => (ev) => { log[n] = (log[n] || 0) + 1; };
      window.__swOff = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchmove', 'touchend'].map((n) => { const f = add(n); t.addEventListener(n, f, { passive: true }); return () => t.removeEventListener(n, f); });
      const fs = add('scroll'); sc.addEventListener('scroll', fs, { passive: true }); window.__swOff.push(() => sc.removeEventListener('scroll', fs));
      return document.body.classList.contains('has-sel');
    });
    await drag(cx + 100, vy, -150, 12); await page.waitForTimeout(300);
    R.swipeOnClip = { moved: Math.round(await page.evaluate(() => document.getElementById('tlScroll').scrollLeft) - before), openedSheet: await page.evaluate(() => document.body.classList.contains('has-sel')), selBefore,
      events: await page.evaluate(() => { window.__swOff.forEach((f) => f()); return JSON.stringify(window.__swLog); }) }; }
  await desel();
  // 4. playback
  await desel(); await page.evaluate(() => { window.__ec.playT = 0; }); await page.waitForTimeout(300);
  const clickPlay = () => page.evaluate(() => document.getElementById('bPlay').click());
  R.play = await frames(page, async () => { await clickPlay(); await page.waitForTimeout(2500); await clickPlay(); }, 200);
  // 5. open tool panels (tap → panel painted)
  R.open = {};
  { const tb = await page.locator('#tlScroll').boundingBox(), vb = await page.locator('#trkV').boundingBox(); const ty = Math.round(vb.y + vb.height / 2), tx = Math.round(tb.x + tb.width / 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(300);
    R.selected = await page.evaluate(() => document.body.classList.contains('has-sel'));
    const d = page.locator('[data-pa="mclose"]'); if (await d.isVisible()) await d.click(); await page.waitForTimeout(200); }
  for (const k of ['templates', 'effects', 'filter', 'media', 'text']){
    const ms = [];
    for (let i = 0; i < 3; i++){
      ms.push(await page.evaluate((k) => new Promise((ok) => { const b = document.querySelector(`#rail [data-tab="${k}"]`), t0 = performance.now(); b.click(); requestAnimationFrame(() => requestAnimationFrame(() => ok(performance.now() - t0))); }), k));
      await page.evaluate(() => { const b = document.querySelector('[data-act="closeSheet"]'); if (b) b.click(); });
      await page.waitForTimeout(250);
    }
    ms.sort((a, b) => a - b); R.open[k] = +ms[1].toFixed(0);
  }
  return R;
}

module.exports = { bench, setupPhone, loadProject, frames, stats };

if (require.main === module) (async () => {
  const app = await electron.launch({ args: [root], env: { ...process.env, EASYCUT_TEST: '1' } });
  const page = await app.firstWindow();
  try {
    await loadProject(page);
    const cdp = await setupPhone(app, page);
    await page.waitForTimeout(800);
    const r = await bench(app, page, cdp);
    console.log(JSON.stringify(r, null, 1));
    if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(r, null, 1));
  } catch (e) { console.log('bench error', e); process.exitCode = 1; }
  await app.close();
})();
