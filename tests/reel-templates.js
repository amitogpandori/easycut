// Reel template picker shows the current trend pack and applies its recipe.
const { _electron: electron } = require('playwright');
const path = require('path');

const root = path.join(__dirname, '..');
const media = (f) => path.join(__dirname, 'media', f);
let failed = 0;
function check(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ FAILED: ') + msg); if (!cond) failed++; }

(async () => {
  const app = await electron.launch({ args: [root], env: { ...process.env, EASYCUT_TEST: '1' } });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.waitForSelector('#bExport');
    await page.click('#home [data-h="templates"]');
    await page.click('[data-act="closeSheet"]');
    await page.setInputFiles('#fileIn', ['photo-land.jpg', 'photo-port.webp', 'wild-sunset.jpg'].map(media));
    await page.waitForFunction(() => window.__ec.S.clips.length === 3 && Object.values(window.__ec.media).every((m) => !m.loading));
    await page.click('#bReel');
    await page.waitForSelector('#studio.on');
    const trendIds = ['keepsake', 'pixelpop', 'slowburn', 'editorial', 'wonder'];
    const pack = await page.evaluate(() => ({
      heading: [...document.querySelectorAll('#studio h3')].some((h) => h.textContent.includes('Choose a reel template')),
      freshHeading: [...document.querySelectorAll('#studio h4')].some((h) => h.textContent.includes('Fresh creator trends')),
      ids: window.__ec.REEL_STYLES.filter((s) => s.pack === 'fresh').map((s) => s.id),
      missingFx: window.__ec.REEL_STYLES.filter((s) => s.pack === 'fresh').flatMap((s) => (window.__ec.REEL_FX[s.id] || []).map((fx) => fx.split(' ')[0]).filter((id) => !window.__ec.FX_BY_ID[id])),
      missingRecipeFx: window.__ec.EFFECT_TEMPLATES.flatMap((recipe) => recipe.fx.filter(([id]) => !window.__ec.FX_BY_ID[id]).map(([id]) => `${recipe.id}:${id}`)),
    }));
    check(pack.heading && pack.freshHeading && trendIds.every((id) => pack.ids.includes(id)), 'five trend templates are grouped and labeled inside Reel Maker');
    check(pack.missingFx.length === 0, 'every trend template effect is available');
    check(pack.missingRecipeFx.length === 0, `every effect recipe references available effects${pack.missingRecipeFx.length ? ` (${pack.missingRecipeFx.join(', ')})` : ''}`);
    const creativePlan = await page.evaluate(() => {
      const E = window.__ec, plan = E.creativeVersionPlan(E.reel.items, 'keepsake', 'story', 41);
      return { plan, names:plan.map((p) => E.REEL_STYLES.find((s) => s.id === p.style).name) };
    });
    check(creativePlan.plan.length === 3 && new Set(creativePlan.plan.map((p) => p.style)).size === 3
      && new Set(creativePlan.plan.map((p) => p.order)).size === 3
      && creativePlan.plan[0].style === 'keepsake' && creativePlan.plan[0].order === 'story',
    `creative variants preserve the chosen A direction and offer distinct styles and story orders (${creativePlan.names.join(' / ')})`);

    for (const id of trendIds){
      await page.click(`[data-rsid="${id}"]`);
      check(await page.evaluate((x) => window.__ec.reel.style === x, id), `${id} template can be selected`);
    }
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForFunction(() => document.body.classList.contains('mob'));
    await page.click('[data-rsid="wonder"]');
    check(await page.evaluate(() => window.__ec.reel.style === 'wonder'), 'trend templates remain selectable in the phone layout');
    await page.click('[data-rsid="keepsake"]');
    await page.click('[data-sa="make"]');
    await page.waitForFunction(() => !document.getElementById('studio').classList.contains('on'), null, { timeout: 60000 });
    const reel = await page.evaluate(() => ({
      clips: window.__ec.S.clips.length,
      filter: window.__ec.S.clips[0] && window.__ec.S.clips[0].filter,
      title: window.__ec.S.texts.some((t) => t.text === 'little moments, kept forever'),
      effects: window.__ec.S.effects.map((e) => e.type),
    }));
    check(reel.clips > 0 && reel.filter === 'vintage' && reel.title && reel.effects.includes('datestamp'), 'Keepsake Scrapbook builds a reel with its grade, title and date effect');

    await page.click('[data-tab="transitions"]');
    check(await page.locator('[data-trpreset]').count() >= 5 && await page.locator('[data-act="trScenes"]').count() === 1, 'transition templates include a scene-detect-and-smooth workflow');
    await page.click('[data-trpreset="soft-film"]');
    check(await page.evaluate(() => window.__ec.S.clips.slice(1).every((c) => c.trans === 'dissolve' && c.tdur === .7)), 'Soft Film applies a consistent eased dissolve to every cut');
    const sceneCuts = await page.evaluate(() => {
      const E = window.__ec;
      const cuts = E.sceneCutTimes([.02,.03,.65,.03,.02,.04,.72,.03], [.2,.4,.6,.8,1,1.2,1.4,1.6], 0, 2, .2);
      const motionOnly = E.sceneCutTimes([.03,.06,.05,.1,.04,.08,.07], [.2,.4,.6,.8,1,1.2,1.4], 0, 2, .2);
      return { cuts, motionOnly };
    });
    check(sceneCuts.cuts.length === 2 && sceneCuts.motionOnly.length === 0, 'scene detection finds isolated hard cuts and ignores smaller frame-motion changes');

    await page.click('[data-tab="effects"]');
    await page.click('[data-fxpreset="soft-film"]');
    check(await page.evaluate(() => ['oldfilm','leaksweep'].every((type) => window.__ec.S.effects.some((fx) => fx.type === type))), 'Soft Film effect template applies its layered recipe');
    await page.click('[data-act="closeSheet"]');
    await page.locator('.vclip').first().click();
    await page.click('[data-tab="filter"]');
    await page.click('[data-panel-look="cinematic"]');
    check(await page.evaluate(() => window.__ec.S.clips[0].grade && window.__ec.S.clips[0].grade.con === 18), 'Filter section applies researched color-look templates to the selected clip');

    const punjabiFonts = await page.evaluate(() => window.__ec.FONT_GROUPS.find(([name]) => name.includes('ਪੰਜਾਬੀ'))[1]);
    check(punjabiFonts.length >= 10, `10 Gurmukhi font styles are available (${punjabiFonts.length})`);
    const fontLoading = await page.evaluate(async () => {
      const fonts = window.__ec.FONT_GROUPS.find(([name]) => name.includes('ਪੰਜਾਬੀ'))[1];
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      const results = [];
      for (const name of fonts){
        const spec = window.__ec.fontCss(name, 500, 40);
        const loaded = await document.fonts.load(spec);
        ctx.font = `${spec}, sans-serif`;
        results.push({ name, loaded:loaded.length > 0, width:ctx.measureText('ਸਤ ਸ੍ਰੀ ਅਕਾਲ').width });
      }
      return results;
    });
    check(fontLoading.every((font) => font.loaded && font.width > 0), `all ten Gurmukhi font styles load and shape Punjabi text${fontLoading.every((font) => font.loaded && font.width > 0) ? '' : ` (${fontLoading.filter((font) => !font.loaded || !font.width).map((font) => font.name).join(', ')})`}`);

    const sceneVideo = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
      const ctx = canvas.getContext('2d'), stream = canvas.captureStream(10);
      const mimeType = ['video/webm;codecs=vp8','video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('WebM MediaRecorder is unavailable');
      const recorder = new MediaRecorder(stream, { mimeType }), chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start();
      for (let frame = 0; frame < 24; frame++){
        ctx.fillStyle = frame < 12 ? '#e31b23' : '#155eef'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      recorder.stop(); await stopped; stream.getTracks().forEach((track) => track.stop());
      const bytes = new Uint8Array(await new Blob(chunks, { type:mimeType }).arrayBuffer());
      return { mimeType, bytes:Array.from(bytes) };
    });
    const oldClipCount = await page.evaluate(() => window.__ec.S.clips.length);
    await page.setInputFiles('#fileIn', { name:'two-scenes.webm', mimeType:sceneVideo.mimeType, buffer:Buffer.from(sceneVideo.bytes) });
    await page.waitForFunction((count) => window.__ec.S.clips.length === count + 1 && Object.values(window.__ec.media).some((m) => m.name === 'two-scenes.webm' && !m.loading), oldClipCount, { timeout:10000 });
    const sceneMediaId = await page.evaluate(() => Object.values(window.__ec.media).find((m) => m.name === 'two-scenes.webm').id);
    await page.click('[data-tab="transitions"]');
    await page.click('[data-act="trScenes"]');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Detected 1 scene change'), null, { timeout:30000 });
    const sceneState = await page.evaluate(() => window.__ec.S.clips.map((c) => ({ id:c.id, mediaId:c.mediaId, name:window.__ec.media[c.mediaId].name, type:window.__ec.media[c.mediaId].type, in:c.in, out:c.out, trans:c.trans, tdur:c.tdur })));
    const sceneSplit = sceneState.filter((c) => c.mediaId === sceneMediaId);
    check(sceneSplit.length >= 2 && sceneSplit.slice(1).every((c) => c.trans === 'dissolve' && c.tdur === .65), `scene template detects a real hard cut, splits the video and applies smooth dissolves${sceneSplit.length < 2 ? ` (target ${sceneMediaId}; ${JSON.stringify(sceneState)})` : ''}`);
    await page.click('#bReel');
    await page.waitForSelector('#studio.on');
    await page.click('[data-sa="variants"]');
    await page.waitForFunction(() => window.__ec.variants && window.__ec.variants.list.length === 3, null, { timeout:90000 });
    const variants = await page.evaluate(() => window.__ec.variants.list.map((x) => ({ name:x.name, order:x.order })));
    check(new Set(variants.map((x) => x.name)).size === 3 && new Set(variants.map((x) => x.order)).size === 3,
      `3 versions are genuinely different creative directions (${variants.map((x) => `${x.name} · ${x.order}`).join(' / ')})`);
    await page.click('[data-var="keep"]');
    check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  } catch (e) {
    failed++;
    console.error('  ✗ ' + e.message + ' · ' + await page.locator('#toast').textContent().catch(() => '') + ' · ' + await page.evaluate(() => JSON.stringify({ clips:window.__ec.S.clips.length, media:Object.values(window.__ec.media).map((m) => ({ name:m.name, type:m.type, loading:m.loading, duration:m.duration })) })).catch(() => ''));
  } finally {
    await app.close();
  }
  console.log(failed ? `\n${failed} reel template check(s) failed.` : '\nAll reel template tests passed.');
  process.exitCode = failed ? 1 : 0;
})();
