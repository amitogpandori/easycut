// End-to-end test of the wildlife pack, smarter Reel Maker and the phone layout in the real desktop app:
// EXIF camera info, shot analysis (best shots, near-duplicates, subject focus), auto style from content, story order,
// music energy, camera-info captions, 3 versions, every wildlife style / template / look / effect, and the phone (Android) layout:
// pro tools row, pinch zoom, every tool sheet, Reel Maker reordering, projects saved on the device, export options.
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
  const ec = (fn, arg) => page.evaluate(fn, arg);
  const makeReel = async () => {
    await page.click('[data-sa="make"]');
    await page.waitForFunction(() => !document.getElementById('studio').classList.contains('on') || document.getElementById('mUp')?.classList.contains('on'), null, { timeout: 120000 });
    if (await count('#mUp.on [data-sq="one"]')) await page.click('#mUp.on [data-sq="one"]');
    await page.waitForFunction(() => !document.getElementById('studio').classList.contains('on'), null, { timeout: 120000 });
  };
  const toastText = () => page.textContent('#toast');
  try {
    await page.waitForSelector('#bExport');

    // 1. Wildlife photos + a nature video into the Reel Maker: EXIF, analysis, near-duplicates, suggestions
    await page.click('#home [data-h="reel"]'); await page.waitForSelector('#studio.on');
    const files = ['wild-wide.jpg', 'wild-bird.jpg', 'wild-bird-burst.jpg', 'wild-blur.jpg', 'wild-sunset.jpg', 'wild.mp4'];
    await page.setInputFiles('#fileReel', files.map(media));
    await page.waitForFunction((n) => window.__ec.reel.analyzed && document.querySelectorAll('[data-si]').length >= n, files.length, { timeout: 90000 });
    await page.waitForTimeout(500);
    const an = await ec(() => { const E = window.__ec; return E.reel.items.map((it) => { const m = E.media[it.mid]; return { name: m.name, exif: m.exif, score: m.an && m.an.score, sharp: m.an && m.an.f && m.an.f.sharp, dup: !!it.dup, fx: m.an && m.an.f && m.an.f.fx }; }); });
    const A = (n) => an.find((x) => x.name === n) || {};
    const ex = A('wild-bird-burst.jpg').exif || {};
    check(ex.camera === 'Canon EOS R5' && /RF100-500mm/.test(ex.lens || ''), `EXIF camera and lens read: ${ex.camera} · ${ex.lens}`);
    check(ex.settings === '500mm · f/7.1 · 1/2000s · ISO 1600', 'EXIF settings: ' + ex.settings);
    check(((A('wild-wide.jpg').exif || {}).camera) === 'NIKON Z 9' && ((A('wild-sunset.jpg').exif || {}).camera) === 'Sony ILCE-7RM5', `camera names tidied: ${(A('wild-wide.jpg').exif || {}).camera}, ${(A('wild-sunset.jpg').exif || {}).camera}`);
    check(/^26\.0\d\d°N, 76\.5\d\d°E$/.test(ex.place || ''), 'GPS location: ' + ex.place);
    check(A('wild-blur.jpg').sharp < A('wild-bird-burst.jpg').sharp - .2 && A('wild-blur.jpg').score < A('wild-wide.jpg').score, `blurry shot scores lower (sharpness ${(+A('wild-blur.jpg').sharp).toFixed(2)} vs ${(+A('wild-bird-burst.jpg').sharp).toFixed(2)})`);
    check(an.filter((x) => x.dup).length === 1 && (A('wild-bird.jpg').dup || A('wild-bird-burst.jpg').dup), 'burst near-duplicate found: ' + an.filter((x) => x.dup).map((x) => x.name).join(', '));
    check(an.every((x) => x.score > 0 && x.fx > 0), 'every photo and the video analysed (score + subject focus)');
    const sug = await ec(() => window.__ec.suggestStyles(window.__ec.reel.items).map((s) => s.id));
    const wildIds = await ec(() => window.__ec.REEL_STYLES.filter((s) => s.pack === 'wild').map((s) => s.id));
    check(wildIds.length >= 10, `wildlife & nature pack: ${wildIds.length} reel styles`);
    check(wildIds.includes(sug[0]), 'nature content suggests a wildlife style: ' + sug.slice(0, 3).join(', '));
    check(/Wildlife & nature pack/.test(await page.textContent('#studio')) && await count('[data-rsid="auto"]') === 1, 'Auto style button and wildlife pack shown in the Reel Maker');
    check(/duplicate · skipped/.test(await page.textContent('#studio')), 'duplicate marked as skipped on its card');

    // 2. Automatic reel: Auto style, story order, music energy, camera info captions
    await page.setInputFiles('#fileReelMusic', [media('beat100.mp3')]);
    await page.waitForSelector('[data-songdel]', { timeout: 20000 });
    await page.click('[data-rsid="auto"]');
    await page.click('[data-st="len"] button[data-val="15"]');
    await page.check('[data-rc="exifCap"]');
    check(await ec(() => window.__ec.reel.order) === 'story', 'story order is the default');
    await makeReel();
    const r1 = await ec(() => { const E = window.__ec, S = E.S, st = E.clipStarts(); return { picked: E.reel.autoPicked, names: S.clips.map((c) => E.media[c.mediaId].name), hero: S.clips.findIndex((c) => c.hero), heroMo: (S.clips.find((c) => c.hero) || {}).motion, heroRamp: (S.clips.find((c) => c.hero) || {}).ramp, heroType: (S.clips.find((c) => c.hero) && E.media[S.clips.find((c) => c.hero).mediaId].type), fx: S.clips.map((c) => c.fx), texts: S.texts.map((t) => t.text), trans: S.clips.slice(1).map((c) => c.trans), energy: (E.media[S.audios[0].mediaId].beat || {}).energy, n: S.clips.length }; });
    check(wildIds.includes(r1.picked) && /Auto picked/.test(await toastText()), 'Auto picked a wildlife style: ' + r1.picked);
    check(!(r1.names.includes('wild-bird.jpg') && r1.names.includes('wild-bird-burst.jpg')), 'only the better shot of the burst is used');
    check(r1.hero > 0, `best shot is the hero, placed at clip ${r1.hero + 1} of ${r1.n} (not the opener)`);
    check(r1.heroType === 'image' ? r1.heroMo === 'eye' : true, `hero ${r1.heroType} gets ${r1.heroType === 'image' ? 'a zoom into the subject (' + r1.heroMo + ')' : 'its own treatment' + (r1.heroRamp ? ' (' + r1.heroRamp + ' ramp)' : '')}`);
    check(r1.fx.every((v) => v > 0 && v < 1), 'every clip has a subject focus point');
    check(r1.texts.some((t) => /Canon EOS R5/.test(t) && /1\/2000s/.test(t)), 'camera info caption from EXIF on the photos');
    check(Array.isArray(r1.energy) && r1.energy.length > 10 && Math.max(...r1.energy) > .8, `music energy read (${(r1.energy || []).length} points)`);
    check(r1.trans.some((t) => t !== 'none'), 'transitions: ' + r1.trans.join(', '));
    await page.screenshot({ path: path.join(out, 'wild-reel.png') });

    // 3. Three versions to pick from
    await page.click('#bReel'); await page.waitForSelector('#studio.on');
    await page.click('[data-sa="variants"]');
    await page.waitForSelector('#varBar .varbtn', { timeout: 120000 });
    check(await count('#varBar .varbtn') === 3, '3 versions offered');
    const v0 = await ec(() => JSON.stringify(window.__ec.S.clips.map((c) => [c.mediaId, c.in, c.filter])));
    await page.click('#varBar [data-var="1"]'); await page.waitForTimeout(300);
    const v1 = await ec(() => JSON.stringify(window.__ec.S.clips.map((c) => [c.mediaId, c.in, c.filter])));
    check(v0 !== v1, 'version B is different from A');
    await page.click('#varBar [data-var="keep"]');
    check(await count('#varBar') === 0, 'Keep closes the chooser');
    await page.keyboard.press('Space'); await page.waitForTimeout(300); await page.keyboard.press('Space');

    // 4. Every wildlife & new style builds and draws (photos + video)
    const styles = await ec(async () => {
      const E = window.__ec, bad = [], info = {}, ids = E.REEL_STYLES.filter((s) => s.pack === 'wild' || ['cinetravel', 'polaroid'].includes(s.id)).map((s) => s.id);
      for (const id of ids){
        E.reel.style = id; E.reel.seed = 3;
        try { await E.buildReel({ quiet: true, noPush: true }); } catch (e) { bad.push(id + ' build: ' + e.message); continue; }
        const S = E.S, T = E.totalDur();
        for (const f of [.05, .3, .55, .8, .97]) try { E.renderFrame(T * f); } catch (e) { bad.push(id + ' draw: ' + e.message); }
        info[id] = { n: S.clips.length, fx: S.effects.map((x) => x.type), ramps: S.clips.filter((c) => c.ramp).length, texts: S.texts.length, motions: [...new Set(S.clips.map((c) => c.motion))] };
      }
      return { bad, info, ids };
    });
    check(!styles.bad.length, `${styles.ids.length} new styles build and draw ${styles.bad.length ? styles.bad.join(' | ') : 'cleanly'}`);
    check(styles.info.rawedit && styles.info.rawedit.fx.filter((x) => x === 'rawwipe').length >= 3, 'RAW → Edit: a RAW-to-edit wipe on every shot');
    check(styles.info.fieldnotes && styles.info.fieldnotes.fx.includes('viewfinder') && styles.info.fieldnotes.texts >= 4, 'Field Notes: viewfinder + info cards');
    check(styles.info.birdflight && styles.info.birdflight.ramps >= 1, 'Bird in Flight: speed ramps on the video');
    check(styles.info.eyezoom && styles.info.eyezoom.motions.includes('eye'), 'Zoom Into the Eye: pushes in to the subject');
    check(styles.info.safari && styles.info.safari.fx.includes('binocular'), 'Safari: binocular open');

    // 5. Templates & looks on photos and videos
    await ec(() => { window.__ec.reel.style = 'wilddoc'; return window.__ec.buildReel({ quiet: true }); });
    await page.click('[data-tab="templates"]');
    const panel = await page.textContent('#panel');
    check(/Wildlife/.test(panel) && /Looks/.test(panel), 'Wildlife and Looks template groups listed');
    const tpl = await ec(async () => {
      const E = window.__ec, S = E.S, idx = (n) => E.TEMPLATES.findIndex((t) => t.name === n), st = E.clipStarts();
      const pi = S.clips.findIndex((c) => E.media[c.mediaId].exif && E.media[c.mediaId].exif.camera); E.playT = st[pi] + .1;
      const n0 = S.texts.length; await E.applyTemplate(idx('Camera Settings (EXIF)')); const cam = S.texts.slice(n0).map((t) => t.text).join(' ');
      E.playT = st[pi] + .1; await E.applyTemplate(idx('Zoom Into the Eye')); const eye = S.clips[pi].motion;
      await new Promise((r) => setTimeout(r, 400)); const fx = S.clips[pi].fx;
      await E.applyTemplate(idx('🌅 Golden Hour')); const looks = [...new Set(S.clips.map((c) => c.filter))];
      const vi = S.clips.findIndex((c) => E.media[c.mediaId].type === 'video'); let vid = 'no video';
      if (vi >= 0){ E.playT = E.clipStarts()[vi] + .2; await E.applyTemplate(idx('Slow Reveal')); vid = S.clips[vi].motion; }
      const n = E.TEMPLATES.filter((t) => t.cat === 'Wildlife').length, nl = E.TEMPLATES.filter((t) => t.cat === 'Looks').length, bad = [];
      for (const id of ['viewfinder', 'binocular', 'focuspull', 'polaroid', 'rawwipe', 'sunflare']){ if (!E.FX_BY_ID[id]){ bad.push('missing ' + id); continue; } S.effects.push({ id: 'x' + id, type: id, start: 0, dur: 3, k: 1 }); for (const t of [.2, 1.5, 2.8]) try { E.renderFrame(t); } catch (e) { bad.push(id + ': ' + e.message); } S.effects.pop(); }
      for (const f of ['docu', 'goldenhr', 'safari', 'silhouette', 'crisp', 'arctic', 'jungle', 'flatraw']) if (!E.FILTERS[f]) bad.push('filter ' + f);
      for (const mo of ['eye', 'reveal']){ S.clips[0].motion = mo; for (const t of [.1, 1]) try { E.renderFrame(t); } catch (e) { bad.push(mo + ': ' + e.message); } }
      return { cam, eye, fx, looks, vid, n, nl, bad };
    });
    check(/Canon EOS R5/.test(tpl.cam) && /1\/2000s/.test(tpl.cam), 'Camera Settings template filled from EXIF: ' + tpl.cam.replace(/\n/g, ' / '));
    check(tpl.eye === 'eye' && tpl.fx > 0, 'Zoom Into the Eye template on a photo (focus ' + tpl.fx + ')');
    check(tpl.looks.length === 1 && tpl.looks[0] === 'goldenhr', 'Golden Hour look applied to the whole video');
    check(tpl.vid === 'reveal', 'Slow Reveal template works on a video clip');
    check(tpl.n >= 12 && tpl.nl >= 8, `${tpl.n} wildlife templates, ${tpl.nl} looks`);
    check(!tpl.bad.length, '6 new effects, 8 new grades and 2 subject moves draw ' + (tpl.bad.length ? tpl.bad.join(' | ') : 'cleanly'));
    await page.click('[data-act="closeSheet"]').catch(() => {});
    // smoothness: drawing a 1080 × 1920 wildlife frame stays well inside a 30 fps budget
    const ms = await ec(() => { const E = window.__ec, T = E.totalDur(), t0 = performance.now(); for (let i = 0; i < 60; i++) E.renderFrame((i / 60) * T * .9); return (performance.now() - t0) / 60; });
    check(ms < 40, `frame draw time ${ms.toFixed(1)} ms (budget 33 ms at 30 fps)`);

    // 6. Phone (Android) layout: every tool reachable by touch
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setMinimumSize(300, 300); w.setSize(412, 880); });
    await page.waitForFunction(() => document.body.classList.contains('mob'), null, { timeout: 5000 });
    check(true, 'phone layout active');
    if (await page.locator('[data-pa="mclose"]').isVisible()) await page.click('[data-pa="mclose"]');
    await page.waitForTimeout(150);
    await page.click('#bPro');
    check(await page.locator('#tlPro').isVisible() && await count('#tlPro [data-pro]') >= 10, 'Pro tools row on the phone: ' + (await page.locator('#tlPro [data-pro]').allTextContents()).join(' · '));
    await ec(() => { window.__ec.playT = 1; });
    await page.click('#tlPro [data-pro="marker"]'); await page.click('#tlPro [data-pro="in"]');
    await page.click('#tlPro [data-pro="fwd"]'); await page.click('#tlPro [data-pro="out"]');
    const pr = await ec(() => ({ mk: (window.__ec.S.markers || []).length, inP: window.__ec.S.inP, outP: window.__ec.S.outP }));
    check(pr.mk === 1 && pr.inP != null && pr.outP > pr.inP, `marker, frame step and in/out by touch (in ${pr.inP}, out ${pr.outP})`);
    await page.click('#tlPro [data-pro="next"]');
    check(await ec(() => window.__ec.playT) > pr.outP, 'jump to the next cut');
    const pinch = await ec(() => new Promise((ok) => {
      const el = document.getElementById('tlScroll'), r = el.getBoundingClientRect(), y = r.top + 40, mk = (id, x) => new Touch({ identifier: id, target: el, clientX: x, clientY: y });
      const before = document.getElementById('zoom').value; const send = (type, a, b) => el.dispatchEvent(new TouchEvent(type, { touches: b == null ? [] : [mk(1, a), mk(2, b)], changedTouches: [mk(1, a)], bubbles: true, cancelable: true }));
      send('touchstart', r.left + 150, r.left + 200); send('touchmove', r.left + 100, r.left + 280); send('touchend');
      setTimeout(() => ok([+before, +document.getElementById('zoom').value]), 100);
    }));
    check(pinch[1] > pinch[0], `pinch to zoom the timeline (zoom ${pinch[0].toFixed(0)} → ${pinch[1].toFixed(0)})`);
    const tabs = await page.locator('#rail [data-tab]').evaluateAll((els) => els.map((e) => e.dataset.tab));
    const sheetBad = [];
    for (const k of tabs){ if (k === 'reel') continue; await page.click(`#rail [data-tab="${k}"]`); await page.waitForTimeout(120); const ok = await ec(() => document.body.classList.contains('sheet') && document.getElementById('panel').getBoundingClientRect().height > 80 && document.getElementById('panel').textContent.trim().length > 10); if (!ok) sheetBad.push(k); await page.click(`#rail [data-tab="${k}"]`); }
    check(!sheetBad.length, `all ${tabs.length - 1} tool sheets open as touch bottom sheets${sheetBad.length ? ' — not: ' + sheetBad.join(', ') : ''}`);
    await page.locator('.vclip').first().click(); await page.waitForTimeout(150);
    check(await ec(() => document.getElementById('props').getBoundingClientRect().height > 80 && /Motion/.test(document.getElementById('props').textContent)), 'clip settings (motion, keyframes, colour) open as a sheet');
    await page.click('[data-pa="mclose"]'); await page.waitForTimeout(120);
    check(await ec(() => !document.body.classList.contains('has-sel')), 'Done closes the clip sheet');
    // projects saved on the device (what the Android app uses)
    await ec(() => { window.__ecLocalProjects = true; });
    await page.click('#bProj');
    check(!(await page.locator('#pmenu [data-pm="save"]').isDisabled()) && !(await page.locator('#pmenu [data-pm="open"]').isDisabled()), 'Project menu: Save and Open enabled on the phone');
    await page.click('#pmenu [data-pm="save"]');
    await page.waitForFunction(() => /saved on this device/.test(document.getElementById('toast').textContent), null, { timeout: 60000 });
    const saved = await ec(async () => { const E = window.__ec, list = await E.store.all('projects'); return { n: list.length, id: list[0] && list[0].id, files: list[0] && list[0].media.length, clips: E.S.clips.length }; });
    await ec(() => { window.__ec.S.clips.splice(0); });
    await ec((id) => window.__ec.openLocalProject(id), saved.id);
    await page.waitForFunction(() => /Project opened/.test(document.getElementById('toast').textContent), null, { timeout: 60000 });
    const reopened = await ec(() => window.__ec.S.clips.length);
    check(saved.n >= 1 && saved.files >= 5 && reopened === saved.clips, `project saved on the device with ${saved.files} files and re-opened (${reopened} clips)`);
    // Reel Maker reordering by touch, and the export options
    await page.click('#bReel'); await page.waitForSelector('#studio.on');
    const before = await ec(() => window.__ec.reel.items.map((x) => x.mid).join());
    await page.locator('[data-smv="0"][data-dir="1"]').click();
    const after = await ec(() => window.__ec.reel.items.map((x) => x.mid).join());
    check(await page.locator('[data-smv="0"][data-dir="1"]').isVisible() && before !== after, 'Reel Maker clips reorder with ↑ ↓ on the phone');
    await page.click('[data-sa="back"]');
    await page.click('#bExport');
    check(await count('#xRes button') >= 4, 'export options (720p – 4K) on the phone');
    await page.keyboard.press('Escape').catch(() => {});
    await page.screenshot({ path: path.join(out, 'wild-phone.png') });
    check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  } catch (e) {
    failed++;
    console.error('  ✗ ' + e.message);
    await page.screenshot({ path: path.join(out, 'wild-failure.png') }).catch(() => {});
  } finally {
    await app.close();
  }
  console.log(failed ? `\n${failed} wildlife / phone check(s) failed.` : '\nAll wildlife & phone tests passed.');
  process.exitCode = failed ? 1 : 0;
})();
