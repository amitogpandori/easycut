// End-to-end test of the real desktop app: launches EasyCut (Electron), imports media,
// edits, plays and exports a video. Run with: npm test
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const media = (f) => path.join(__dirname, 'media', f);
const out = path.join(__dirname, 'output');
fs.mkdirSync(out, { recursive: true });

function check(cond, msg) {
  if (!cond) throw new Error('FAILED: ' + msg);
  console.log('  ✓ ' + msg);
}

(async () => {
  const app = await electron.launch({ args: [root], env: { ...process.env, EASYCUT_TEST: '1' } });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.waitForSelector('#bExport');
    check(await page.title() === 'EasyCut — Video Editor', 'app window opens');
    check(await page.evaluate(() => !!window.easycutDesktop), 'desktop save bridge is available');

    await page.setInputFiles('#fileIn', [media('clip1.mp4'), media('photo.png'), media('music.mp3')]);
    await page.waitForFunction(() => document.querySelectorAll('.vclip').length === 2 && document.querySelectorAll('.aitem').length === 1, null, { timeout: 30000 });
    check(true, 'video, photo and music imported onto the timeline');

    await page.click('[data-tab="text"]');
    await page.click('[data-tp="0"]');
    check(await page.locator('.titem').count() === 1, 'title text added');

    await page.click('.vclip');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('s');
    check(await page.locator('.vclip').count() === 3, 'clip split at playhead');
    await page.keyboard.press('Control+z');
    check(await page.locator('.vclip').count() === 2, 'undo works');

    await page.click('.junc');
    await page.click('[data-seg="trans"] button[data-val="fade"]');
    await page.keyboard.press('Space'); // stop the transition preview
    await page.keyboard.press('Home');
    await page.keyboard.press('Space');
    await page.waitForTimeout(2000);
    await page.keyboard.press('Space');
    const t = await page.textContent('#tc');
    check(!t.startsWith('0:00.0'), 'playback moves the playhead (' + t.split('/')[0].trim() + ')');
    await page.screenshot({ path: path.join(out, 'editor.png') });

    await page.click('#bExport');
    const fmt = await page.textContent('#dlgExport .kv');
    console.log('    export settings: ' + fmt.replace(/\s+/g, ' ').trim());
    await page.click('[data-x="go"]');
    await page.waitForSelector('#dlgExport video', { timeout: 120000 });
    const info = await page.evaluate(async () => {
      const v = document.querySelector('#dlgExport video');
      const b = await (await fetch(v.src)).blob();
      return { size: b.size, type: b.type, name: document.querySelector('#dlgExport .hint').textContent };
    });
    console.log('    exported: ' + info.name + ' (' + info.type + ')');
    check(info.size > 50000, 'export produced a video file');
    await page.screenshot({ path: path.join(out, 'export.png') });

    check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    console.log('\nAll desktop tests passed.');
  } catch (e) {
    console.error(e.message);
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await app.close();
  }
})();
