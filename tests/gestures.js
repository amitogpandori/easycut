// Mouse & touchpad gestures (app/gestures.js + the photo editor): synthesised wheel, Ctrl/Alt/Shift + wheel, touchpad
// pinch and two-finger swipes (fractional pixel deltas), middle / right / back / forward mouse buttons, double-clicks.
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const media = (f) => path.join(__dirname, 'media', f);
const out = path.join(__dirname, 'output');
fs.mkdirSync(out, { recursive: true });
let failed = 0;
function check(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ FAILED: ') + msg); if (!cond) failed++; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const app = await electron.launch({ args: [root], env: { ...process.env, EASYCUT_TEST: '1' } });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const X = (fn, a) => page.evaluate(fn, a);
  const cdp = await page.context().newCDPSession(page);
  // a real (trusted) mouse wheel notch; modifiers: Alt 1, Ctrl 2, Meta 4, Shift 8
  const mwheel = async (x, y, dy, mods = 0, dx = 0) => { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: dx, deltaY: dy, modifiers: mods }); await wait(60); };
  // a touchpad stream: many small, fractional pixel deltas ~60 times a second (pinch = ctrlKey, as Chromium sends it)
  const pad = async (x, y, n, o) => { for (let i = 0; i < n; i++) { await X(({ x, y, o }) => { const el = document.elementFromPoint(x, y); el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, deltaMode: 0, ...o })); }, { x, y, o }); await wait(16); } };
  const button = async (x, y, b) => { for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: b, buttons: 0, clickCount: 1 }); await wait(150); };
  const center = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  const T = (fn) => X(fn);
  try {
    await page.waitForSelector('#bExport');
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setContentSize(1366, 768); });
    await wait(500);
    check(await X(() => !!window.ECGestures && !!window.__ecHost.tl), 'gestures are loaded');

    // ---------- classifier ----------
    const kinds = await X(() => { const k = (o) => window.ECGestures.wheelKind(new WheelEvent('wheel', o)); const a = k({ deltaY: 100 }); performance.mark('x'); const r = [a.tp]; return r; });
    check(kinds[0] === false, 'a 100 px wheel notch counts as a mouse');
    await wait(400);
    check(await X(() => window.ECGestures.wheelKind(new WheelEvent('wheel', { deltaX: 3.5, deltaY: 0.25 })).tp), 'small fractional deltas count as a touchpad');
    await wait(400);
    check(await X(() => window.ECGestures.wheelKind(new WheelEvent('wheel', { deltaY: -2.7, ctrlKey: true })).pinch), 'ctrl + fractional delta counts as a pinch');
    await wait(400);

    // ---------- video editor ----------
    await page.click('#home [data-h="video"]').catch(() => {});
    await page.setInputFiles('#fileIn', [media('clip1.mp4'), media('wild-sunset.jpg'), media('clip2.mp4')]);
    await page.waitForFunction(() => document.querySelectorAll('.vclip').length >= 3, null, { timeout: 30000 });
    await X(() => { const h = document.querySelector('#home'); if (h) h.classList.remove('on'); });
    await wait(600);
    const sc = await center('#tlScroll'); const tx = sc.b.x + sc.b.width * .4, ty = (await center('#trkV')).y;
    const pps = () => X(() => window.__ecHost.tl.pps);
    let p0 = await pps(); await mwheel(tx, ty, -100, 2); await wait(120);
    let p1 = await pps(); check(p1 > p0 * 1.1, `Ctrl + wheel zooms the timeline in (${p0.toFixed(0)} → ${p1.toFixed(0)} px/s)`);
    const tAt = await X((x) => window.__ecHost.tl.xToTime(x), tx);
    await pad(tx, ty, 12, { deltaY: -3.4, ctrlKey: true }); await wait(120);
    const p2 = await pps(), tAt2 = await X((x) => window.__ecHost.tl.xToTime(x), tx);
    check(p2 > p1 * 1.2, `touchpad pinch zooms smoothly (${p1.toFixed(0)} → ${p2.toFixed(0)})`);
    check(Math.abs(tAt2 - tAt) < .15, `zoom keeps the moment under the pointer in place (${tAt.toFixed(2)} s → ${tAt2.toFixed(2)} s)`);
    await mwheel(tx, ty, 100, 1); await wait(120);
    check(await pps() < p2, 'Alt + wheel zooms out');
    await X(() => window.__ecHost.tl.zoomBy(4, 0)); await wait(200);
    const sl = () => X(() => document.getElementById('tlScroll').scrollLeft);
    await X(() => { document.getElementById('tlScroll').scrollLeft = 0; }); await wait(50);
    await pad(tx, ty, 10, { deltaX: 9.5, deltaY: 0.5 });
    const s1 = await sl(); await wait(400); const s2 = await sl();
    check(s1 > 60, `two-finger swipe scrolls the timeline (${Math.round(s1)} px)`);
    check(s2 > s1 + 15, `…and glides on after the fingers lift (inertia: ${Math.round(s1)} → ${Math.round(s2)} px)`);
    await wait(800); const s3 = await sl(); await mwheel(tx, ty, 100, 8); await wait(450);
    check(await sl() > s3 + 30, 'Shift + wheel scrolls along the timeline');
    // middle-drag pans
    const s4 = await sl(); await page.mouse.move(tx, ty); await page.mouse.down({ button: 'middle' }); await page.mouse.move(tx - 220, ty, { steps: 6 }); await page.mouse.up({ button: 'middle' });
    check(await sl() > s4 + 150, `middle-button drag pans the timeline (${Math.round(s4)} → ${Math.round(await sl())})`);
    // right-drag scrubs
    const pT = () => X(() => window.__ec.playT);
    const t0 = await pT(); await page.mouse.move(tx, ty); await page.mouse.down({ button: 'right' }); await page.mouse.move(tx + 160, ty, { steps: 6 });
    const t1 = await pT(); await page.mouse.up({ button: 'right' });
    check(Math.abs(t1 - t0) > .3, `right-drag scrubs the playhead (${t0.toFixed(2)} → ${t1.toFixed(2)} s)`);
    // Alt-drag on the ruler scrubs too
    const rb = { y: Math.max((await page.locator('#ruler').boundingBox()).y, sc.b.y) + 6 }; check(await X(({ x, y }) => !!document.elementFromPoint(x, y).closest('#ruler'), { x: tx, y: rb.y }), 'the ruler is under the pointer'); await page.keyboard.down('Alt'); await page.mouse.move(tx - 100, rb.y); await page.mouse.down(); await page.mouse.move(tx + 100, rb.y, { steps: 6 }); const t2 = await pT(); await page.mouse.up(); await page.keyboard.up('Alt');
    const tEnd = await X((x) => window.__ecHost.tl.xToTime(x), tx + 100), tBeg = await X((x) => window.__ecHost.tl.xToTime(x), tx - 100);
    check(Math.abs(t2 - tEnd) < .1 && tEnd - tBeg > .3, `Alt-drag on the ruler scrubs (playhead at ${t2.toFixed(2)} s, pointer at ${tEnd.toFixed(2)} s)`);
    // double-click a clip opens its settings
    await X(() => { window.__ecHost.tl.scroll.scrollLeft = 0; }); await wait(100);
    await X(() => window.__ecHost.tl.zoomBy(.25, 0)); await wait(200);
    const clip = await center('.vclip >> nth=1'); const cid = await page.locator('.vclip').nth(1).getAttribute('data-id');
    await page.mouse.dblclick(clip.x, clip.y); await wait(250);
    check(await X(() => { const s = window.__ecHost.tl.sel(); return s && s.id; }) === cid && await X(() => document.getElementById('props').classList.contains('flash')), 'double-clicking a clip opens its settings');
    // trim cursor on a clip edge
    const hb = await page.locator('.vclip >> nth=1').locator('.h-r').boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await wait(50);
    check(await X(({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)).cursor, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }) === 'ew-resize', 'hovering a clip edge shows the trim cursor');
    // mouse back / forward = undo / redo
    const n0 = await page.locator('.vclip').count(); await page.keyboard.press('s'); await wait(150);
    const n1 = await page.locator('.vclip').count();
    await button(tx, ty, 'back'); const n2 = await page.locator('.vclip').count();
    await button(tx, ty, 'forward'); const n3 = await page.locator('.vclip').count();
    check(n1 === n0 + 1 && n2 === n0 && n3 === n1, `mouse back / forward buttons undo / redo (${n0} → ${n1} → ${n2} → ${n3} clips)`);
    // wheel over a value field nudges it — but not while the panel is being scrolled
    await page.locator('.vclip').first().click(); await wait(400);
    const rng = page.locator('#props input[type=range]').first(); await rng.scrollIntoViewIfNeeded(); await wait(600);
    const rb2 = await rng.boundingBox(), v0 = +(await rng.inputValue());
    await mwheel(rb2.x + rb2.width / 2, rb2.y + rb2.height / 2, -100);
    const v1 = +(await rng.inputValue()); check(v1 > v0, `wheel over a slider nudges it (${v0} → ${v1})`);
    await X(() => document.getElementById('props').dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100 })));
    await mwheel(rb2.x + rb2.width / 2, rb2.y + rb2.height / 2, -100); const v2 = +(await rng.inputValue());
    check(v2 === v1, 'a wheel that is scrolling the panel does not change a slider passing under the pointer');

    // ---------- preview ----------
    const cvb = await center('#cv'); const pz = () => X(() => ({ ...window.ECGestures.pz }));
    await mwheel(cvb.x + 60, cvb.y + 30, -100, 2); await mwheel(cvb.x + 60, cvb.y + 30, -100, 2); await wait(100);
    let z = await pz(); check(z.k > 1.2 && /scale/.test(await X(() => document.getElementById('cv').style.transform)), `Ctrl + wheel zooms the preview (${z.k.toFixed(2)}×)`);
    await pad(cvb.x, cvb.y, 8, { deltaY: -4.2, ctrlKey: true }); await wait(60);
    const zp = await pz(); check(zp.k > z.k, 'touchpad pinch zooms the preview');
    await page.mouse.move(cvb.x, cvb.y); await page.mouse.down({ button: 'middle' }); await page.mouse.move(cvb.x + 80, cvb.y + 40, { steps: 5 }); await page.mouse.up({ button: 'middle' });
    const zm = await pz(); check(zm.x !== zp.x || zm.y !== zp.y, 'dragging pans the zoomed preview');
    await page.screenshot({ path: path.join(out, 'gestures-preview-zoom.png') });
    await page.mouse.dblclick(cvb.x, cvb.y + 60); await wait(120);
    check((await pz()).k === 1, 'double-click fits the preview again');
    await page.mouse.dblclick(cvb.x, cvb.y + 60); await wait(120);
    check((await pz()).k >= 1.25, `double-click zooms to 100 % (${(await pz()).k.toFixed(2)}×)`);
    await page.mouse.dblclick(cvb.x, cvb.y + 60); await wait(120);
    // text: wheel resizes, Shift + wheel rotates
    await page.click('[data-tab="text"]'); await page.click('[data-tp="0"]'); await wait(400);
    const txt = () => X(() => { const o = window.__ecHost.tl.getSel(); return o && { size: o.size, rot: o.rot || 0 }; });
    const a0 = await txt(); await mwheel(cvb.x, cvb.y, -100); await mwheel(cvb.x, cvb.y, -100);
    const a1 = await txt(); check(a0 && a1.size > a0.size, `wheel over the selected text resizes it (${a0 && a0.size} → ${a1 && a1.size})`);
    await mwheel(cvb.x, cvb.y, -100, 8); const a2 = await txt(); check(a2.rot !== a1.rot, `Shift + wheel rotates it (${a1.rot}° → ${a2.rot}°)`);
    await page.keyboard.press('Control+z'); await wait(100); const a3 = await txt(); check(a3 && (a3.rot !== a2.rot || a3.size !== a2.size), 'those wheel changes can be undone');
    await X(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

    // ---------- help ----------
    await page.mouse.click(5, 300).catch(() => {});
    await page.keyboard.press('?'); await wait(200);
    check(await page.locator('#gxHelp.on').isVisible(), '? opens the Gestures help');
    await page.screenshot({ path: path.join(out, 'gestures-help.png') });
    await page.locator('#gxSwipeUndo').uncheck(); check(await X(() => JSON.parse(localStorage.getItem('easycut.gestures')).swipeUndo === false), 'the touchpad swipe undo / redo setting is saved');
    await page.locator('#gxSwipeUndo').check();
    await page.keyboard.press('Escape'); check(!(await page.locator('#gxHelp.on').count()), 'Esc closes it');

    // ---------- photo editor ----------
    await X(() => PhotoEditor.open()); await page.setInputFiles('#peFile', media('wild-bird.jpg'));
    await page.waitForFunction(() => PhotoEditor.__.ST.srcTex && PhotoEditor.__.ST.out.w > 0, null, { timeout: 30000 }); await wait(300);
    const ST = () => X(() => { const s = PhotoEditor.__.ST; return { zoom: s.zoom, px: s.panX, py: s.panY, n: s.stack.length, past: s.past.length, compare: s.compare, k: s.sess && s.sess.k, sess: s.sess && s.sess.tool }; });
    const vb = await center('#peStage');
    check(await page.locator('#pe [data-pe="help"]').isVisible(), 'photo editor has a Gestures (?) button');
    await mwheel(vb.x + 120, vb.y - 60, -100, 2); await mwheel(vb.x + 120, vb.y - 60, -100, 2); await wait(80);
    let s = await ST(); check(s.zoom > 1.3, `Ctrl + wheel zooms the photo (${s.zoom.toFixed(2)}×)`);
    check(s.px < 0 && s.py > 0, 'it zooms toward the pointer');
    await pad(vb.x, vb.y, 8, { deltaY: -4, ctrlKey: true }); await wait(60);
    const s2p = await ST(); check(s2p.zoom > s.zoom, 'touchpad pinch zooms the photo');
    await page.mouse.move(vb.x, vb.y); await page.mouse.down({ button: 'middle' }); await page.mouse.move(vb.x - 70, vb.y - 30, { steps: 5 }); await page.mouse.up({ button: 'middle' });
    let s3p = await ST(); check(s3p.px !== s2p.px, 'middle-drag pans');
    await page.keyboard.down(' '); await page.mouse.move(vb.x, vb.y); await page.mouse.down(); await page.mouse.move(vb.x + 60, vb.y + 20, { steps: 5 }); await page.mouse.up(); await page.keyboard.up(' ');
    const s4p = await ST(); check(s4p.px !== s3p.px && !s4p.compare, 'Space + drag pans (and stops comparing)');
    await page.mouse.dblclick(vb.x, vb.y); await wait(80); check((await ST()).zoom === 1, 'double-click fits the photo');
    await page.mouse.dblclick(vb.x, vb.y); await wait(80); check((await ST()).zoom >= 2, 'double-click zooms to 100 %');
    await page.mouse.dblclick(vb.x, vb.y); await wait(80);
    // Tune: wheel, touchpad swipes
    await page.click('#pe [data-tool="tune"]');
    const pv = () => X(() => PhotoEditor.__.ST.sess.item.p[PhotoEditor.__.ST.sess.k]);
    const b0 = await pv(); await mwheel(vb.x, vb.y, -100); await mwheel(vb.x, vb.y, -100);
    const b1 = await pv(); check(b1 > b0, `wheel adjusts the active setting (${b0} → ${b1})`);
    await pad(vb.x, vb.y, 10, { deltaX: -7.5, deltaY: 0.3 }); await wait(80);
    const b2 = await pv(); check(b2 > b1 + 3, `two-finger swipe right raises it (${b1} → ${b2})`);
    await wait(400); const k0 = (await ST()).k; await pad(vb.x, vb.y, 6, { deltaY: 14.5, deltaX: 0.2 }); await wait(80);
    check((await ST()).k !== k0, `two-finger swipe down picks the next setting (${k0} → ${(await ST()).k})`);
    const k1 = (await ST()).k; await mwheel(vb.x, vb.y, 100, 8); check((await ST()).k !== k1, `Shift + wheel picks a setting (${k1} → ${(await ST()).k})`);
    // right button: hold compares, drag adjusts
    await page.mouse.move(vb.x, vb.y); await page.mouse.down({ button: 'right' }); await wait(400);
    check((await ST()).compare, 'holding the right button shows the original'); await page.mouse.up({ button: 'right' }); await wait(50);
    check(!(await ST()).compare, '…releasing it shows the edit');
    await page.keyboard.down('\\'); await wait(50); check((await ST()).compare, 'holding \\ compares too'); await page.keyboard.up('\\'); await wait(30);
    check(!(await ST()).compare, '…and letting go of \\ ends it');
    await page.click('#pe [data-pe="apply"]');
    await page.click('#pe [data-tool="brush"]');
    const st0 = await X(() => PhotoEditor.__.ST.sess.item.p.strokes.length), bs0 = await pv();
    await page.mouse.move(vb.x, vb.y); await page.mouse.down({ button: 'right' }); await page.mouse.move(vb.x + 20, vb.y + 1, { steps: 3 }); await page.mouse.move(vb.x + 140, vb.y + 2, { steps: 6 }); await page.mouse.up({ button: 'right' });
    check(await X(() => PhotoEditor.__.ST.sess.item.p.strokes.length) === st0 && (await pv()) !== bs0, 'right-drag in a brush tool changes the setting instead of painting');
    await page.click('#pe [data-pe="cancel"]').catch(async () => { await X(() => PhotoEditor.__.cancelTool()); });
    // curves: wheel over a point
    await page.click('#pe [data-tool="curves"]'); await wait(200);
    const cb = await page.locator('#peCurve').boundingBox(); const cx = cb.x + cb.width * .75, cy = cb.y + cb.height * .25;
    await page.mouse.move(cx, cy); await mwheel(cx, cy, -100); await mwheel(cx, cy, -100, 8);
    const cp = await X(() => PhotoEditor.__.ST.sess.item.p.pts.rgb.find((p) => Math.abs(p[0] - .75) < .1));
    check(cp && cp[1] > .75, `wheel over the curve lifts the nearest point (${cp && cp[1]})`);
    await page.click('#pe [data-pe="apply"]');
    // crop: wheel over an edge handle
    await page.click('#pe [data-tool="crop"]'); await wait(300);
    const eh = page.locator('#pe [data-ov="e"]'); const ehb = await eh.boundingBox();
    if (ehb) {
      await mwheel(ehb.x + ehb.width / 2, ehb.y + ehb.height / 2, 100); await mwheel(ehb.x + ehb.width / 2, ehb.y + ehb.height / 2, 100, 8);
      const w = await X(() => PhotoEditor.__.ST.sess.item.p.rect.w); check(w < 1 && w > .9, `wheel over a crop edge moves it a pixel at a time (width ${w.toFixed(3)})`);
    } else check(false, 'crop edge handle found');
    await page.click('#pe [data-pe="apply"]'); await wait(200);
    // two-finger swipe = undo / redo outside a tool
    const u0 = (await ST()).n; await wait(400);
    await pad(vb.x, vb.y, 14, { deltaX: -14.5, deltaY: 0.4 }); await wait(350);
    const u1 = (await ST()).n; check(u1 === u0 - 1, `two-finger swipe right undoes (${u0} → ${u1} edits)`);
    await pad(vb.x, vb.y, 14, { deltaX: 14.5, deltaY: 0.4 }); await wait(350);
    check((await ST()).n === u0, 'two-finger swipe left redoes');
    await pad(vb.x, vb.y, 3, { deltaX: -9.5, deltaY: 0.2 }); await wait(350);
    check((await ST()).n === u0, 'a short swipe below the threshold does nothing');
    await X(() => { window.ECGestures.prefs.swipeUndo = false; });
    await pad(vb.x, vb.y, 14, { deltaX: -14.5, deltaY: 0.4 }); await wait(350);
    check((await ST()).n === u0, 'with the setting off, swipes do not undo');
    await X(() => { window.ECGestures.prefs.swipeUndo = true; });
    await button(vb.x, vb.y, 'back'); check((await ST()).n === u0 - 1, 'mouse back button undoes in the photo editor');
    await button(vb.x, vb.y, 'forward'); check((await ST()).n === u0, 'mouse forward button redoes');
    await page.keyboard.press('?'); await wait(150);
    check(await page.locator('#gxHelp.on .gx-sec.cur[data-ctx="photo"]').count() === 1, '? in the photo editor opens the help on the photo section');
    await page.keyboard.press('Escape'); await wait(100);
    check(await X(() => PhotoEditor.isOpen) && !(await page.locator('#gxHelp.on').count()), 'Esc closes the help, not the editor');
  } catch (e) {
    console.log('  ✗ FAILED: ' + (e && e.stack || e)); failed++;
    try { await page.screenshot({ path: path.join(out, 'gestures-error.png') }); } catch (e2) {}
  }
  check(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await app.close();
  console.log(failed ? `\n${failed} gesture check(s) failed` : '\nAll gesture checks passed');
  process.exit(failed ? 1 : 0);
})();
