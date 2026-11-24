// End-to-end test of the Photo editor (app/photo-editor.js) in the real desktop app:
// open a photo, use the swipe gestures, apply every tool, hold-to-compare, split view, the edit stack, looks,
// export JPG/PNG/WebP at full resolution with EXIF, the Canvas2D fallback, sending a photo to the video, and the phone layout.
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const media = (f) => path.join(__dirname, 'media', f);
const out = path.join(__dirname, 'output');
const testDir = path.join(os.tmpdir(), 'easycut-test');
fs.mkdirSync(out, { recursive: true });

let failed = 0;
function check(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ FAILED: ') + msg); if (!cond) failed++; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// tiny readers for the saved files
function jpegInfo(buf) {
  let i = 2, w = 0, h = 0, exif = null;
  while (i < buf.length) {
    if (buf[i] !== 0xff) break; const mk = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (mk === 0xe1 && buf.slice(i + 4, i + 8).toString() === 'Exif') exif = buf.slice(i + 10, i + 2 + len);
    if (mk >= 0xc0 && mk <= 0xc2) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; }
    i += 2 + len;
  }
  return { w, h, exif };
}
function tiffTag(t, tag) {
  if (!t) return null; const le = t[0] === 0x49, r16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o)), r32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const ifd = r32(4), n = r16(ifd);
  for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (r16(e) === tag) { const ty = r16(e + 2); if (ty === 3) return r16(e + 8); if (ty === 2) { const c = r32(e + 4), o = c > 4 ? r32(e + 8) : e + 8; return t.slice(o, o + c - 1).toString(); } return r32(e + 8); } }
  return null;
}
function pngInfo(buf) { const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); let i = 8, exif = null; while (i < buf.length) { const len = buf.readUInt32BE(i), ty = buf.slice(i + 4, i + 8).toString(); if (ty === 'eXIf') exif = buf.slice(i + 8, i + 8 + len); if (ty === 'IEND') break; i += 12 + len; } return { w, h, exif }; }
function webpInfo(buf) { let i = 12, w = 0, h = 0, exif = null; while (i + 8 <= buf.length) { const ty = buf.slice(i, i + 4).toString(), sz = buf.readUInt32LE(i + 4); if (ty === 'VP8X') { w = 1 + buf.readUIntLE(i + 12, 3); h = 1 + buf.readUIntLE(i + 15, 3); } if (ty === 'EXIF') exif = buf.slice(i + 8, i + 8 + sz); i += 8 + sz + (sz & 1); } return { w, h, exif }; }

(async () => {
  const app = await electron.launch({ args: [root], env: { ...process.env, EASYCUT_TEST: '1' } });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const X = (fn, a) => page.evaluate(fn, a);
  const ST = () => X(() => { const s = PhotoEditor.__.ST; return { n: s.stack.length, sess: s.sess && s.sess.tool, k: s.sess && s.sess.k, compare: s.compare, out: s.out, prev: [s.prevW, s.prevH], src: s.src && [s.src.w, s.src.h], eng: s.eng && s.eng.kind }; });
  // 48×48 grey-level fingerprint of what is on the screen canvas
  const shot = () => X(() => { PhotoEditor.__.render(); const c = document.getElementById('peCv'), t = document.createElement('canvas'); t.width = 48; t.height = 48; const g = t.getContext('2d'); g.drawImage(c, 0, 0, 48, 48); const d = g.getImageData(0, 0, 48, 48).data, o = []; for (let i = 0; i < d.length; i += 4) o.push((d[i] + d[i + 1] + d[i + 2]) / 3); return o; });
  const diff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const viewBox = async () => page.locator('#peStage').boundingBox();
  const saved = (name) => { const f = path.join(testDir, name); return fs.existsSync(f) ? fs.readFileSync(f) : null; };
  const waitSaved = async (name, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const f = saved(name); if (f) return f; await wait(150); } return saved(name); };
  const clearSaved = () => { for (const f of fs.readdirSync(testDir)) if (/-edited\./.test(f)) fs.rmSync(path.join(testDir, f)); };
  try {
    await page.waitForSelector('#bExport');
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setContentSize(1366, 768); });
    await wait(500);

    // ---- open ----
    check(await page.locator('#home [data-h="photo"]').count() === 1, 'home screen has a Photo editor tile');
    await page.click('#home [data-h="photo"]');
    check(await page.locator('#pe.on').isVisible(), 'photo editor opens');
    check(await page.locator('#pe [data-pe="open"]').isVisible(), 'empty editor offers "Open photo"');
    await page.setInputFiles('#peFile', media('wild-bird.jpg'));
    await page.waitForFunction(() => PhotoEditor.__.ST.srcTex && PhotoEditor.__.ST.out.w > 0, null, { timeout: 30000 });
    let s = await ST();
    check(s.eng === 'webgl2', 'renders with WebGL2 (' + s.eng + ')');
    check(s.src[0] === 1600 && s.src[1] === 1066, 'photo opened at full size 1600×1066');
    check(await X(() => !!(PhotoEditor.__.ST.src.info && /Canon/.test(PhotoEditor.__.ST.src.info.camera || ''))), 'camera info (EXIF) is read');
    const orig = await shot();
    check(mean(orig) > 20, 'photo is drawn on the screen');
    check(await X(() => { const c = document.getElementById('peHist'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n > 500; }), 'histogram is drawn');
    await page.screenshot({ path: path.join(out, 'photo-1-open.png') });

    check(await page.locator('#pe .pe-tabs [data-tab="quickTune"]').textContent() === 'AI Enhance', 'photo tool panel exposes AI Enhance');
    await page.click('#pe .pe-tabs [data-tab="quickTune"]');
    check((await ST()).sess === 'tune', 'AI Enhance shortcut opens the editable auto-tune tool');
    await page.click('#pe [data-pe="cancel"]');

    // ---- Tune with the swipe gestures ----
    await page.click('#pe [data-tool="tune"]');
    s = await ST(); check(s.sess === 'tune' && s.k === 'bright', 'Tune opens on Brightness');
    let b = await viewBox(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 40, cy + 2, { steps: 4 }); await page.mouse.move(cx + 160, cy + 4, { steps: 8 });
    check(await page.locator('#peHud.on').isVisible(), 'swiping shows the value bubble');
    await page.mouse.up();
    const bright = await X(() => PhotoEditor.__.ST.sess.item.p.bright);
    check(bright > 15, 'swipe right raises Brightness (' + bright + ')');
    const afterBright = await shot(); check(mean(afterBright) > mean(orig) + 3, 'the photo gets brighter while adjusting');
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 2, cy + 20, { steps: 3 });
    check(await page.locator('#pePList.on').isVisible(), 'swiping down shows the list of settings');
    await page.mouse.move(cx + 2, cy + 74, { steps: 6 }); await page.mouse.up();
    s = await ST(); check(s.k !== 'bright', 'swiping down picks another setting (' + s.k + ')');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await page.click('#pe [data-pe="apply"]');
    s = await ST(); check(s.n === 1 && !s.sess, 'apply adds Tune to the edit stack');
    await page.click('#pe [data-pe="undo"]'); s = await ST(); check(s.n === 0, 'undo removes it');
    await page.click('#pe [data-pe="redo"]'); s = await ST(); check(s.n === 1, 'redo brings it back');

    // ---- hold to compare, split view ----
    const edited = await shot();
    await page.mouse.move(cx, cy); await page.mouse.down(); await wait(650);
    s = await ST(); const cmp = await shot();
    check(s.compare && await page.locator('#peBadge.on').isVisible(), 'press and hold shows the original');
    check(diff(cmp, orig) < 2 && diff(cmp, edited) > 3, 'the held view matches the original photo');
    await page.mouse.up(); s = await ST(); check(!s.compare, 'releasing shows the edit again');
    await page.keyboard.down(' '); await wait(80); s = await ST(); check(s.compare, 'holding Space compares too'); await page.keyboard.up(' ');
    await page.click('#pe [data-pe="split"]'); await wait(200);
    check(await page.locator('#pe.pe-split-on').count() === 1 && await page.locator('#peSplitL').isVisible(), 'before/after split view');
    const sp = await shot(); check(diff(sp.slice(0, 48 * 48).filter((_, i) => i % 48 < 20), orig.filter((_, i) => i % 48 < 20)) < 2, 'left side of the split is the original');
    await page.screenshot({ path: path.join(out, 'photo-2-split.png') });
    await page.click('#pe [data-pe="split"]');

    // ---- every tool ----
    const toolRuns = {
      heal: async () => { b = await viewBox(); await page.mouse.click(b.x + b.width * .743, b.y + b.height * .398); await page.mouse.click(b.x + b.width * .2, b.y + b.height * .2); },   // first, before any geometry change: the bird's eye + a plain spot
      details: async () => X(() => PhotoEditor.__.setParam('struct', 80)),
      curves: async () => X(() => { const p = PhotoEditor.__.ST.sess.item.p; p.pts.rgb = [[0, 0], [.25, .12], [.75, .9], [1, 1]]; }),
      wb: async () => X(() => PhotoEditor.__.setParam('temp', 60)),
      dehaze: async () => X(() => PhotoEditor.__.setParam('amt', 80)),
      vignette: async () => X(() => PhotoEditor.__.setParam('outer', -100)),
      lens: async () => X(() => PhotoEditor.__.setParam('str', 100)),
      persp: async () => X(() => PhotoEditor.__.setParam('tv', 60)),
      selective: async () => { b = await viewBox(); await page.mouse.click(b.x + b.width * .3, b.y + b.height * .4); await page.mouse.move(b.x + b.width * .6, b.y + b.height * .6); await page.mouse.down(); await page.mouse.move(b.x + b.width * .6 + 30, b.y + b.height * .6 + 2, { steps: 3 }); await page.mouse.move(b.x + b.width * .6 + 200, b.y + b.height * .6 + 4, { steps: 6 }); await page.mouse.up(); },
      brush: async () => { await page.click('#pe [data-seg="mode"] [data-v="expo"]'); await page.click('#pe [data-seg="amt"] [data-v="10"]'); b = await viewBox(); await page.mouse.move(b.x + b.width * .2, b.y + b.height * .3); await page.mouse.down(); await page.mouse.move(b.x + b.width * .8, b.y + b.height * .7, { steps: 12 }); await page.mouse.up(); },
      hdr: async () => X(() => PhotoEditor.__.setParam('str', 100)),
      drama: async () => X(() => PhotoEditor.__.setParam('str', 100)),
      tonal: async () => X(() => { PhotoEditor.__.setParam('hi', 100); PhotoEditor.__.setParam('mid', 100); }),
      glow: async () => X(() => PhotoEditor.__.setParam('glow', 100)),
      grain: async () => X(() => PhotoEditor.__.setParam('grain', 100)),
      retro: async () => X(() => PhotoEditor.__.setParam('leak', 100)),
      bw: async () => {},
      noir: async () => {},
      frames: async () => X(() => PhotoEditor.__.setParam('w', 80)),
      text: async () => { await page.fill('#pe [data-text]', 'Kingfisher'); },
      double: async () => { await page.setInputFiles('#peFile2', media('wild-sunset.jpg')); await page.waitForFunction(() => PhotoEditor.__.ST.sess.item.p.img, null, { timeout: 10000 }); },
    };
    for (const [tool, run] of Object.entries(toolRuns)) {
      const before = await shot();
      await page.click(`#pe [data-tool="${tool}"]`);
      await run(); await wait(120);
      const after = await shot();
      await page.click('#pe [data-pe="apply"]');
      // local tools (one point, two small spots, a caption) only change part of the picture: look at the most-changed cell
      const local = ['selective', 'heal', 'text'].includes(tool), dv = local ? Math.max(...before.map((v, i) => Math.abs(v - after[i]))) : diff(before, after);
      check(dv > (local ? 6 : 1.2), `${tool}: changes the photo (${dv.toFixed(1)})`);
    }
    s = await ST(); check(s.n === 1 + Object.keys(toolRuns).length, 'every tool is in the edit stack (' + s.n + ')');
    check(await X(() => PhotoEditor.__.ST.stack.find((i) => i.tool === 'selective').p.points[0].b) > 15, 'selective: tap adds a point and a swipe brightens it');
    check(await X(() => PhotoEditor.__.ST.stack.find((i) => i.tool === 'heal').p.spots.length) === 2, 'healing: two spots fixed');
    await page.screenshot({ path: path.join(out, 'photo-3-tools.png') });

    // ---- crop & rotate, expand ----
    await page.click('#pe [data-tool="crop"]');
    await page.click('#pe [data-crop="ratio"] [data-v="1"]');
    await page.click('#pe [data-pe="rot"]');
    await X(() => PhotoEditor.__.setParam('angle', 8));
    await page.click('#pe [data-pe="apply"]'); await wait(150);
    s = await ST(); check(Math.abs(s.out.w - s.out.h) <= 2, `crop 1:1 + rotate + straighten → square (${s.out.w}×${s.out.h})`);
    await page.click('#pe [data-tool="expand"]'); await X(() => { PhotoEditor.__.setParam('l', 20); PhotoEditor.__.setParam('r', 20); }); await page.click('#pe [data-pe="apply"]'); await wait(150);
    s = await ST(); check(s.out.w > s.out.h * 1.3, 'expand makes the photo wider');
    await page.click('#pe [data-pe="undo"]');

    // ---- the edit stack ----
    await page.click('#pe [data-pe="stack"]');
    check(await page.locator('#peStack.on').isVisible(), 'edit stack opens');
    s = await ST(); check(await page.locator('#peStack .pe-si').count() === s.n + 1, 'stack lists every edit plus the original');
    const st1 = await shot();
    await page.locator('#peStack .pe-si').nth(1).locator('[data-sk="eye"]').click();
    check(diff(st1, await shot()) > .5, 'hiding an edit in the stack changes the photo');
    await page.locator('#peStack .pe-si').nth(1).locator('[data-sk="eye"]').click();
    const nBefore = (await ST()).n; await page.locator('#peStack .pe-si').first().locator('[data-sk="del"]').click();
    check((await ST()).n === nBefore - 1, 'deleting an edit from the stack');
    await page.locator('#peStack .pe-si').nth(2).locator('[data-sk="edit"]').click();
    s = await ST(); check(!!s.sess, 'tapping an edit in the stack opens it again (' + s.sess + ')');
    await page.click('#pe [data-pe="cancel"]');
    // stack brush: limit an edit to where you paint
    await page.click('#pe [data-pe="stack"]');
    const ti = await X(() => PhotoEditor.__.ST.stack.findIndex((i) => i.tool === 'tune'));
    await page.locator(`#peStack .pe-si[data-si="${ti}"] [data-sk="mask"]`).click();
    s = await ST(); check(s.sess === 'tune', 'stack brush opens for Tune');
    b = await viewBox(); await page.mouse.move(b.x + b.width * .3, b.y + b.height * .5); await page.mouse.down(); await page.mouse.move(b.x + b.width * .7, b.y + b.height * .5, { steps: 10 }); await page.mouse.up();
    await page.click('#pe [data-pe="apply"]');
    check(await X((i) => PhotoEditor.__.ST.stack[i].mask.strokes.length, ti) === 1, 'Tune now only applies where it was brushed');

    // ---- looks ----
    await page.click('#pe .pe-tabs [data-tab="looks"]');
    await page.waitForFunction(() => [...document.querySelectorAll('#pe [data-lth]')].filter((e) => e.style.backgroundImage).length > 8, null, { timeout: 30000 });
    check(true, 'look thumbnails are drawn');
    check(await page.locator('#pe [data-look="f-docu"]').count() === 1 && await page.locator('#pe [data-look="g-cinematic"]').count() === 1, 'EasyCut colour looks are in the Looks tab');
    const nl = (await ST()).n; await page.click('#pe [data-look="pop"]');
    check((await ST()).n === nl + 2, 'applying a look adds its edits');
    await page.click('#pe [data-look="f-docu"]'); check((await ST()).n === nl + 1, 'another look replaces the first');
    await page.screenshot({ path: path.join(out, 'photo-4-looks.png') });

    // ---- export at full resolution with EXIF ----
    clearSaved();
    await page.click('#pe .pe-tabs [data-tab="export"]');
    await page.click('#pe [data-ex="fmt"] [data-v="jpeg"]');
    const full = await X(() => { const s = PhotoEditor.__.ST; return [s.out.w * s.src.w / s.prevW, s.out.h * s.src.h / s.prevH]; });
    await page.click('#pe [data-pe="save"]');
    await page.waitForFunction(() => PhotoEditor.__.ST.lastExport, null, { timeout: 60000 }); await wait(400);
    let f = await waitSaved('wild-bird-edited.jpg'); check(!!f, 'JPG saved');
    if (f) { const j = jpegInfo(f); check(Math.abs(j.w - full[0]) <= 3 && Math.abs(j.h - full[1]) <= 3, `JPG is full resolution (${j.w}×${j.h})`); check(!!j.exif && tiffTag(j.exif, 0x0110) === 'Canon EOS R5', 'JPG keeps the camera EXIF'); }
    for (const [fmt, ext, rd] of [['png', 'png', pngInfo], ['webp', 'webp', webpInfo]]) {
      await X(() => { PhotoEditor.__.ST.lastExport = null; });
      await page.click(`#pe [data-ex="fmt"] [data-v="${fmt}"]`); await page.click('#pe [data-pe="save"]');
      await page.waitForFunction(() => PhotoEditor.__.ST.lastExport, null, { timeout: 60000 }); await wait(400);
      f = await waitSaved('wild-bird-edited.' + ext); check(!!f, ext.toUpperCase() + ' saved');
      if (f) { const r = rd(f); check(Math.abs(r.w - full[0]) <= 3 && Math.abs(r.h - full[1]) <= 3, `${ext.toUpperCase()} is full resolution (${r.w}×${r.h})`); check(!!r.exif && tiffTag(r.exif, 0x010f) === 'Canon', ext.toUpperCase() + ' keeps EXIF'); }
    }
    await page.click('#pe [data-ex="fmt"] [data-v="jpeg"]');

    // big photo: small preview, full-size export; EXIF rotation baked in and reset
    await page.setInputFiles('#peFile', media('photo-big.jpg'));
    await page.waitForFunction(() => PhotoEditor.__.ST.src && PhotoEditor.__.ST.src.w === 5000, null, { timeout: 30000 });
    s = await ST(); check(Math.max(...s.prev) <= 2048 && s.prev[0] < 5000, `big photo previews at ${s.prev[0]}×${s.prev[1]} (smooth)`);
    await X(() => { const P = PhotoEditor.__; P.openTool('tune'); P.setParam('contrast', 30); P.applyTool(); });
    const big = await X(async () => { const r = await PhotoEditor.__.encode({ fmt: 'jpeg', q: 85, size: 'full' }); return [r.w, r.h, r.blob.size]; });
    check(big[0] === 5000 && big[1] === 3400, `5000×3400 photo exports at full resolution (${big[0]}×${big[1]})`);
    await page.setInputFiles('#peFile', media('photo-exif6.jpg'));
    await page.waitForFunction(() => PhotoEditor.__.ST.src && PhotoEditor.__.ST.src.name === 'photo-exif6.jpg', null, { timeout: 30000 });
    s = await ST(); check(s.src[0] === 800 && s.src[1] === 1200, 'phone photo with EXIF rotation opens upright');
    const rot = await X(async () => { const r = await PhotoEditor.__.encode({ fmt: 'jpeg', q: 90, size: 'full', exif: true }); return Array.from(new Uint8Array(await r.blob.arrayBuffer())); });
    const rj = jpegInfo(Buffer.from(rot)); check(rj.w === 800 && rj.h === 1200 && tiffTag(rj.exif, 0x0112) === 1, 'export is upright and its EXIF orientation is reset');

    // ---- Canvas2D fallback ----
    const fb = await X(async () => {
      const P = PhotoEditor.__; P.ST.force2d = true; PhotoEditor.close(); PhotoEditor.open({ force2d: true });
      const blob = await (await fetch('../tests/media/photo-land.jpg')).blob(); await PhotoEditor.openFile(new File([blob], 'land.jpg', { type: 'image/jpeg' }));
      const kind = P.ST.eng.kind; const c = document.getElementById('peCv'), m = () => { P.render(); const t = document.createElement('canvas'); t.width = 32; t.height = 32; const g = t.getContext('2d'); g.drawImage(c, 0, 0, 32, 32); const d = g.getImageData(0, 0, 32, 32).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / 3072; };
      const a = m(); P.openTool('tune'); P.setParam('bright', 50); P.applyTool(); P.openTool('vignette'); P.applyTool(); P.openTool('crop'); P.ST.sess.item.p.rect = { x: .1, y: .1, w: .5, h: .5 }; P.applyTool(); const bb = m();
      const r = await P.encode({ fmt: 'png', size: 'full' }); P.ST.force2d = false; return { kind, a, b: bb, w: r.w, h: r.h };
    });
    check(fb.kind === 'canvas2d', 'Canvas2D fallback engine runs without WebGL');
    check(fb.b > fb.a + 2, 'fallback applies edits');
    check(fb.w === 800 && fb.h === 500, `fallback exports at full resolution (${fb.w}×${fb.h})`);

    // ---- to and from the video timeline ----
    await X(() => { PhotoEditor.close(); PhotoEditor.__.ST.force2d = false; });
    await page.setInputFiles('#fileIn', [media('wild-sunset.jpg')]);
    await page.waitForFunction(() => document.querySelectorAll('.vclip').length >= 1, null, { timeout: 30000 });
    await page.locator('.vclip').first().click();
    check(await page.locator('[data-pa="editPhoto"]').isVisible(), 'photo clips have an "Edit photo" button');
    await page.click('[data-pa="editPhoto"]');
    await page.waitForFunction(() => PhotoEditor.isOpen && PhotoEditor.__.ST.src && PhotoEditor.__.ST.src.name === 'wild-sunset.jpg' && PhotoEditor.__.ST.srcTex, null, { timeout: 30000 });
    s = await ST(); check(s.src[0] === 1600, 'Edit photo opens the clip’s photo in the editor');
    await X(() => { const P = PhotoEditor.__; P.applyLook('f-goldenhr'); P.openTool('vignette'); P.applyTool(); });
    await page.click('#pe [data-pe="exportTab"]');
    await page.click('#pe [data-pe="replaceClip"]');
    await page.waitForFunction(() => !PhotoEditor.isOpen, null, { timeout: 60000 }); await wait(500);
    check(await X(() => { const E = window.__ec, c = E.S.clips[0]; return /-edited\.jpg$/.test(E.media[c.mediaId].name); }), 'edited photo replaces the clip in the timeline');
    await page.locator('.vclip').first().click(); await page.click('[data-pa="editPhoto"]');
    await page.waitForFunction(() => PhotoEditor.isOpen && PhotoEditor.__.ST.srcTex, null, { timeout: 30000 });
    s = await ST(); check(s.n === 2, 'editing it again reopens the original with its edit stack (non-destructive)');
    const nClips = await page.locator('.vclip').count();
    await page.click('#pe [data-pe="exportTab"]'); await page.click('#pe [data-pe="toVideo"]');
    await page.waitForFunction((n) => document.querySelectorAll('.vclip').length === n + 1, nClips, { timeout: 60000 });
    check(true, '"Add to the video timeline" adds the edited photo as a new clip');

    // ---- phone layout ----
    const cdp = await page.context().newCDPSession(page);
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setMinimumSize(300, 300); w.setContentSize(412, 915); });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
    await wait(800);
    // a real finger tap (touchstart/touchend from the touch screen), so the buttons are tested the way a phone uses them
    const tap = async (sel) => { const bb = await page.locator(sel).first().boundingBox(), p = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }); await wait(40); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(250); };
    await X(() => PhotoEditor.open()); await wait(300);
    check(await page.locator('#pe.pe-mob').count() === 1, 'phone layout switches on at 412×915');
    const tabs = await page.locator('#pe .pe-tabs').boundingBox(), sideB = await page.locator('#peSide').boundingBox(), vB = await page.locator('#peView').boundingBox();
    check(tabs && tabs.y + tabs.height <= 915 + 1 && tabs.y > 600, 'Looks / Tools / Export tabs sit at the bottom');
    check(vB.height > 915 * .45 && sideB.height < 915 * .5, `photo gets most of the screen (${Math.round(vB.height)} px)`);
    await tap('#pe .pe-tabs [data-tab="tools"]');
    check(await X(() => !!PhotoEditor.__.ST.src), 'the photo is still open after reopening the editor');
    await tap('#pe [data-tool="tune"]');
    check(await page.locator('#pe .pe-num:visible').count() === 1 && await page.locator('#pe .pe-chips').isVisible(), 'in a tool: one big slider and setting chips');
    const small = await X(() => [...document.querySelectorAll('#pe button')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 32 && e.getBoundingClientRect().width < 32).map((e) => e.className + ':' + e.textContent.slice(0, 12)));
    check(small.length === 0, 'touch targets are at least 32 px (' + small.slice(0, 3).join(', ') + ')');
    b = await viewBox(); const tx = b.x + b.width / 2, ty = b.y + b.height / 2, v0 = await X(() => PhotoEditor.__.ST.sess.item.p.bright);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx + i * 14, y: ty + 1 }] }); await wait(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check(await X(() => PhotoEditor.__.ST.sess.item.p.bright) > v0 + 10, 'touch swipe adjusts the setting');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] }); await wait(650);
    check((await ST()).compare, 'touch and hold compares with the original');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(50);
    check(!(await ST()).compare, 'lifting the finger shows the edit again');
    await page.screenshot({ path: path.join(out, 'photo-5-phone.png') });
    await tap('#pe [data-pe="apply"]');
    await tap('#pe [data-pe="stack"]');
    const sb = await page.locator('#peStack').boundingBox(); check(sb && sb.y + sb.height <= 915 && sb.width > 380, 'edit stack is a bottom sheet on the phone');
    await tap('#peStack [data-sk="close"]');
    check(await X(() => PhotoEditor.back()) && !(await X(() => PhotoEditor.isOpen)), 'back button closes the editor');
  } catch (e) {
    console.log('  ✗ FAILED: ' + (e && e.stack || e)); failed++;
    try { await page.screenshot({ path: path.join(out, 'photo-error.png') }); } catch (e2) {}
  }
  check(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await app.close();
  console.log(failed ? `\n${failed} photo editor check(s) failed` : '\nAll photo editor checks passed');
  process.exit(failed ? 1 : 0);
})();
