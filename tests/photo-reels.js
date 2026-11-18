// End-to-end test of photo reels in the real desktop app: photo import (EXIF rotation, HEIC, very large photos),
// photo length, Ken Burns moves, every transition / new effect / text animation, Reel Maker with photos only and
// photos + video, speed ramps, and a full-quality 1080 × 1920 export.
// Run with: npm test   (needs a desktop session — GitHub's Windows runners have one)
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const media = (f) => path.join(__dirname, 'media', f);
const out = path.join(__dirname, 'output');
fs.mkdirSync(out, { recursive: true });

let failed = 0;
function check(cond, msg) {
  console.log((cond ? '  ✓ ' : '  ✗ FAILED: ') + msg);
  if (!cond) failed++;
}

(async () => {
  const app = await electron.launch({ args: [root], env: { ...process.env, EASYCUT_TEST: '1' } });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const count = (s) => page.locator(s).count();
  const waitCount = (s, n, t = 60000) => page.waitForFunction(([s, n]) => document.querySelectorAll(s).length >= n, [s, n], { timeout: t });
  const ec = (fn, arg) => page.evaluate(fn, arg);
  const makeReel = async () => {
    await page.click('[data-sa="make"]');
    await page.waitForFunction(() => !document.getElementById('studio').classList.contains('on') || document.getElementById('mUp')?.classList.contains('on'), null, { timeout: 90000 });
    if (await count('#mUp.on [data-sq="one"]')) await page.click('#mUp.on [data-sq="one"]');   // more than one song: use one
    await page.waitForFunction(() => !document.getElementById('studio').classList.contains('on'), null, { timeout: 90000 });
  };
  try {
    await page.waitForSelector('#bExport');
    await page.click('#home [data-h="templates"]'); await page.click('[data-act="closeSheet"]');

    // Photos onto the timeline
    const photos = ['photo-exif6.jpg', 'photo.heic', 'photo-big.jpg', 'photo-land.jpg', 'photo-port.webp'];
    await page.setInputFiles('#fileIn', photos.map(media));
    await waitCount('.vclip', photos.length);
    const info = await ec(() => Object.values(window.__ec.media).map((m) => ({ name: m.name, type: m.type, w: m.w, h: m.h, origW: m.origW || 0, thumb: (m.thumb || '').slice(0, 15) })));
    const byName = (n) => info.find((m) => m.name === n) || {};
    check(byName('photo-exif6.jpg').w === 800 && byName('photo-exif6.jpg').h === 1200, `EXIF rotation honoured (${byName('photo-exif6.jpg').w} × ${byName('photo-exif6.jpg').h})`);
    check(byName('photo.heic').w === 1000, `HEIC photo opened (${byName('photo.heic').w || 0} px)`);
    check(byName('photo-big.jpg').origW === 5000 && Math.max(byName('photo-big.jpg').w, byName('photo-big.jpg').h) === 4096, `very large photo kept sharp at 4096 px (${byName('photo-big.jpg').w} × ${byName('photo-big.jpg').h})`);
    check(info.every((m) => m.thumb.startsWith('data:image/jpeg')), 'small thumbnails for the timeline');

    // Photo length for all photos, and a Ken Burns move
    await page.locator('.vclip').first().click();
    await page.fill('#props input[data-k="len"]', '4.5');
    await page.click('[data-pa="photoLenAll"]');
    const lens = await ec(() => window.__ec.S.clips.map((c) => (c.out - c.in) / c.speed));
    check(lens.every((l) => Math.abs(l - 4.5) < .01), 'one length for all photos: ' + lens.map((l) => l.toFixed(1)).join(', '));
    await page.locator('.vclip').first().click();
    await page.click('#props [data-seg="motion"] button[data-val="diag"]');
    check(await ec(() => window.__ec.S.clips[0].motion) === 'diag', 'diagonal Ken Burns move picked');
    check(await count('#props [data-seg="motion"] button') >= 12, 'Ken Burns moves offered: ' + await count('#props [data-seg="motion"] button'));

    // Every transition, new effect and text animation draws without errors
    const drawn = await ec(() => {
      const E = window.__ec, S = E.S, bad = [], st = E.clipStarts();
      for (const [t] of E.TRANS){ S.clips[1].trans = t; S.clips[1].tdur = .8; for (const f of [.1, .4, .7]){ try { E.renderFrame(st[1] + f); } catch (e) { bad.push(t + ': ' + e.message); } } }
      S.clips[1].trans = 'fade';
      for (const id of ['filmburn', 'leaksweep', 'shine', 'datestamp', 'velblur', 'chromashift', 'tealgrade']){ if (!E.FX_BY_ID[id]){ bad.push('missing ' + id); continue; } S.effects.push({ id: 'x' + id, type: id, start: 0, dur: 3, k: 1 }); try { E.renderFrame(1); } catch (e) { bad.push(id + ': ' + e.message); } S.effects.pop(); }
      for (const a of ['word', 'bounce', 'zoom', 'blur']){ S.texts.push({ id: 't' + a, text: 'hello there world', font: 'Montserrat', size: 80, color: '#fff', align: 'center', anim: a, x: .5, y: .5, start: 0, dur: 3 }); try { E.renderFrame(.3); } catch (e) { bad.push(a + ': ' + e.message); } S.texts.pop(); }
      return { n: E.TRANS.length, bad };
    });
    check(drawn.n >= 27 && !drawn.bad.length, `${drawn.n} transitions, 7 new effects and 4 new text animations draw ${drawn.bad.length ? drawn.bad.join(' | ') : 'cleanly'}`);
    await page.click('[data-tab="templates"]');
    check(await page.locator('[data-tpl]', { hasText: 'Photo Dump' }).count() >= 1 || /Photo Dump/.test(await page.textContent('#panel')), 'new trend templates listed');
    await page.click('[data-act="closeSheet"]').catch(() => {});

    // Reel Maker with photos only: Photo Dump style on the beat
    await page.click('#bReel'); await page.waitForSelector('#studio.on');
    await page.setInputFiles('#fileReelMusic', [media('beat100.mp3')]);
    await page.waitForSelector('[data-songdel]', { timeout: 20000 });
    await page.click('[data-rsid="photodump"]');
    await page.click('[data-st="len"] button[data-val="15"]');
    await page.click('[data-st="photoLen"] button[data-val="2"]');
    await makeReel();
    const r1 = await ec(() => { const E = window.__ec, S = E.S; return { n: S.clips.length, types: [...new Set(S.clips.map((c) => E.media[c.mediaId].type))], motions: [...new Set(S.clips.map((c) => c.motion))], trans: S.clips.slice(1).map((c) => c.trans), fits: S.clips.map((c) => c.fit), bg: S.bg, size: E.canvasSize(), lens: S.clips.map((c) => (c.out - c.in) / c.speed), fx: S.effects.map((x) => x.type), aspect: S.aspect }; });
    check(r1.n === photos.length && r1.types.join() === 'image', `photo reel uses every photo once (${r1.n} clips)`);
    check(r1.motions.length >= 3, 'different camera moves per photo: ' + r1.motions.join(', '));
    check(r1.trans.some((t) => t !== 'none'), 'transitions between photos: ' + r1.trans.join(', '));
    check(r1.lens.every((l) => l >= 1.7), 'each photo stays about 2 s or more: ' + r1.lens.map((l) => l.toFixed(2)).join(', '));
    check(r1.aspect === '9:16' && r1.size[0] >= 1080 && r1.size[1] >= 1920, `9:16 reel at ${r1.size.join(' × ')}`);
    check(r1.fits.includes('fit') && r1.fits.includes('fill') && r1.bg === 'blur', 'wide photos shown whole on a blurred background, tall ones fill: ' + r1.fits.join(', '));
    check(r1.fx.includes('datestamp'), 'photo dump date stamp');
    await page.screenshot({ path: path.join(out, 'photo-reel.png') });

    // Reel Maker with photos + video: Velocity style with speed ramps
    await page.click('#bReel'); await page.waitForSelector('#studio.on');
    await page.setInputFiles('#fileReel', [media('clip1.mp4'), media('clip2.mp4')]);
    await page.waitForFunction(() => document.querySelectorAll('[data-si]').length >= 7, null, { timeout: 30000 });
    await page.click('[data-rsid="velocity"]');
    await page.click('[data-st="len"] button[data-val="15"]');
    await makeReel();
    const r2 = await ec(() => { const E = window.__ec, S = E.S; return { types: [...new Set(S.clips.map((c) => E.media[c.mediaId].type))].sort(), ramps: S.clips.filter((c) => c.ramp).map((c) => c.ramp), inv: S.clips.filter((c) => c.ramp).map((c) => { const L = (c.out - c.in) / c.speed; return [.1, .5, .9].map((q) => Math.abs(E.localOf(c, E.srcT(c, q * L)) - q * L)).reduce((a, b) => Math.max(a, b), 0); }) }; });
    check(r2.types.join() === 'image,video', 'mixed photo + video reel');
    check(r2.ramps.length > 0 && r2.inv.every((d) => d < .01), 'velocity speed ramps on video cuts: ' + r2.ramps.join(', '));

    // Play, then export at full quality
    await page.keyboard.press('Home'); await page.keyboard.press('Space'); await page.waitForTimeout(1500); await page.keyboard.press('Space');
    check(!(await page.textContent('#tc')).startsWith('0:00.0'), 'mixed reel plays');
    await page.click('#bExport');
    await page.click('#xRes button[data-val="1080"]').catch(() => {});
    await page.click('[data-x="go"]');
    await page.waitForSelector('#dlgExport video', { timeout: 240000 });
    const vsize = await page.evaluate(() => new Promise((ok) => { const v = document.querySelector('#dlgExport video'); const done = () => ok([v.videoWidth, v.videoHeight]); if (v.readyState >= 1) done(); else v.addEventListener('loadedmetadata', done, { once: true }); setTimeout(done, 8000); }));
    check(vsize[0] === 1080 && vsize[1] === 1920, `exported reel is ${vsize.join(' × ')}`);
    await page.screenshot({ path: path.join(out, 'photo-export.png') });
    check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  } catch (e) {
    failed++;
    console.error('  ✗ ' + e.message);
    await page.screenshot({ path: path.join(out, 'photo-failure.png') }).catch(() => {});
  } finally {
    await app.close();
  }
  console.log(failed ? `\n${failed} photo reel check(s) failed.` : '\nAll photo reel tests passed.');
  process.exitCode = failed ? 1 : 0;
})();
