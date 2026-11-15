// End-to-end test of the real desktop app: launches EasyCut (Electron) and uses it like a person would.
// Run with: npm test   (needs a desktop session — GitHub's Windows runners have one)
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
  const waitCount = (s, n, t = 30000) => page.waitForFunction(([s, n]) => document.querySelectorAll(s).length >= n, [s, n], { timeout: t });
  try {
    await page.waitForSelector('#bExport');
    check(await page.title() === 'EasyCut — Video Editor', 'app window opens');
    check(await page.evaluate(() => !!window.easycutDesktop && document.body.classList.contains('is-desk')), 'desktop features are switched on');
    check(await count('#home.on') === 1, 'home screen shows at start');
    await page.click('#home [data-h="templates"]'); await page.click('[data-act="closeSheet"]');
    check(await count('#home.on') === 0, 'home → editor');

    // Import & basic editing
    await page.setInputFiles('#fileIn', [media('logo.mp4'), media('photo.png'), media('clip2.mp4'), media('music.mp3')]);
    await waitCount('.vclip', 3); await waitCount('.aitem', 1);
    check(true, 'videos, photo and music imported onto the timeline');
    await page.locator('.vclip').first().click();
    await page.keyboard.press('Home'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('s');
    check(await count('.vclip') === 4, 'split at playhead');
    await page.keyboard.press('Control+z');
    check(await count('.vclip') === 3, 'undo');

    // Fill canvas 9:16 with no bars
    await page.click('[data-tab="canvas"]');
    await page.click('[data-gseg="fit"] button[data-val="fill"]');
    await page.click('[data-aspect="9:16"]');
    await page.keyboard.press('Home'); await page.waitForTimeout(500);
    const edges = await page.evaluate(() => { const c = document.getElementById('cv'), g = c.getContext('2d'); return [[4, 4], [c.width - 4, c.height - 4], [4, c.height / 2]].map(([x, y]) => Array.from(g.getImageData(x, y, 1, 1).data).slice(0, 3).reduce((a, b) => a + b)); });
    check(edges.every((v) => v > 40), '9:16 fills the frame with no bars');
    await page.click('[data-aspect="16:9"]');

    // Crop + logo removal
    await page.locator('.vclip').first().click();
    await page.click('[data-pa="crop"]'); await page.click('[data-cropr] button[data-val="1"]'); await page.click('[data-pa="boxDone"]');
    check((await page.locator('.vclip').first().innerText()).includes('CROP'), 'crop');
    await page.click('[data-pa="logo"]'); await page.click('[data-pa="boxDone"]');
    check((await page.locator('.vclip').first().innerText()).includes('LOGO'), 'logo remover');

    // Overlay with green screen, layout, template
    await page.click('[data-tab="overlay"]');
    await page.setInputFiles('#fileOv', [media('green.mp4')]); await waitCount('.oitem', 1);
    await page.locator('#props input[data-k="chroma"]').check();
    check(true, 'picture-in-picture overlay with green screen removal');
    await page.click('[data-tab="templates"]');
    await page.click('[data-tpl="6"]'); await waitCount('.titem', 2);
    check(true, 'lower-third template');
    // Transitions, GIFs, stickers and logos
    await page.locator('.vclip').nth(1).click();
    await page.click('#props [data-seg="trans"] button[data-val="dissolve"]');
    check(await count('#props [data-seg="trans"] button') === 16, '16 transitions available');
    await page.click('[data-tab="effects"]');
    await page.click('[data-fx="shake"]'); await waitCount('.eitem', 1);
    await page.click('[data-tab="effects"]').catch(() => {});
    check(await count('.eitem') === 1, 'effect added on the Effects track');
    await page.keyboard.press('Space');
    const o0 = await count('.oitem');
    await page.setInputFiles('#fileOv', [media('anim.gif'), media('sticker.webp')]); await waitCount('.oitem', o0 + 2);
    check(true, 'animated GIF and WebP sticker added as overlays');
    await page.click('[data-tab="logos"]');
    await page.setInputFiles('#fileLogo', [media('logo.png')]); await page.waitForSelector('[data-logo]');
    await page.locator('[data-logo]').first().click(); await waitCount('.oitem', o0 + 3);
    check(true, 'logo saved and added to the video');
    await page.screenshot({ path: path.join(out, 'editor.png') });

    // Save project, then open it again
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Project saved'), null, { timeout: 30000 });
    const proj = fs.readdirSync(testDir).find((f) => f.endsWith('.easycut'));
    check(!!proj, 'project saved to a .easycut file');
    const before = { v: await count('.vclip'), t: await count('.titem'), o: await count('.oitem') };
    await page.keyboard.press('Control+o');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Project opened') || document.getElementById('toast').textContent.includes('missing'), null, { timeout: 60000 });
    const after = { v: await count('.vclip'), t: await count('.titem'), o: await count('.oitem') };
    check(JSON.stringify(before) === JSON.stringify(after), `project re-opened with everything in place ${JSON.stringify(after)}`);

    // Reel Maker: automatic (beat) and manual
    await page.click('#bReel'); await page.waitForSelector('#studio.on');
    await page.setInputFiles('#fileReelMusic', [media('beat100.mp3')]);
    await page.waitForSelector('[data-sa="nomusic"]', { timeout: 20000 });
    await page.click('[data-rsid="beat"]'); await page.click('[data-st="len"] button[data-val="15"]');
    await page.click('[data-sa="make"]');
    await page.waitForFunction(() => !document.getElementById('studio').classList.contains('on'), null, { timeout: 60000 });
    const toast = await page.textContent('#toast');
    check((await count('.vclip')) >= 8 && /\d+ BPM/.test(toast), 'Reel Maker (automatic): ' + toast.trim());
    await page.click('#bReel'); await page.waitForSelector('#studio.on');
    await page.click('[data-st="mode"] button[data-val="manual"]');
    const nItems = await count('[data-si]');
    await page.click('[data-sa="make"]');
    await page.waitForFunction(() => !document.getElementById('studio').classList.contains('on'), null, { timeout: 60000 });
    check((await count('.vclip')) === nItems, `Reel Maker (manual): ${nItems} clips in order`);

    // Play, export and save the video
    await page.keyboard.press('Home'); await page.keyboard.press('Space'); await page.waitForTimeout(1500); await page.keyboard.press('Space');
    check(!(await page.textContent('#tc')).startsWith('0:00.0'), 'playback');
    await page.click('#bExport');
    console.log('    export settings: ' + (await page.textContent('#dlgExport .kv')).replace(/\s+/g, ' ').trim());
    await page.click('[data-x="go"]');
    await page.waitForSelector('#dlgExport video', { timeout: 180000 });
    await page.screenshot({ path: path.join(out, 'export.png') });
    await page.click('[data-x="save"]');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Saved to'), null, { timeout: 30000 });
    const vid = fs.readdirSync(testDir).find((f) => /\.(mp4|webm)$/.test(f));
    const size = vid ? fs.statSync(path.join(testDir, vid)).size : 0;
    check(size > 50000, `exported video saved: ${vid} (${(size / 1048576).toFixed(1)} MB)`);
    if (vid) fs.copyFileSync(path.join(testDir, vid), path.join(out, vid));

    check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  } catch (e) {
    failed++;
    console.error('  ✗ ' + e.message);
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  } finally {
    await app.close();
  }
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll desktop tests passed.');
  process.exitCode = failed ? 1 : 0;
})();
