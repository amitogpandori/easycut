// One-tap Auto color applies to every timeline clip as a single undoable edit.
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
    await page.setInputFiles('#fileIn', [media('clip1.mp4'), media('photo.png')]);
    await page.waitForFunction(() => window.__ec.S.clips.length === 2 && Object.values(window.__ec.media).every((m) => !m.loading));
    await page.click('#rail [data-tab="media"]');
    const before = await page.evaluate(() => JSON.stringify(window.__ec.S.clips.map((c) => c.grade || null)));
    await page.click('[data-act="autoColorAll"]');
    await page.waitForFunction(() => /Auto color applied to 2 clips/.test(document.getElementById('toast').textContent));
    check(await page.evaluate(() => window.__ec.S.clips.every((c) => c.grade && c.grade.vib === 15)), 'Auto color analyzes and improves every timeline clip');
    await page.keyboard.press('Control+z');
    await page.waitForFunction((state) => JSON.stringify(window.__ec.S.clips.map((c) => c.grade || null)) === state, before);
    check(true, 'one undo restores every clip together');

    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForFunction(() => document.body.classList.contains('mob'));
    await page.waitForSelector('[data-act="autoColorAll"]');
    check(true, 'the same batch action is available in the phone layout');
    await page.click('[data-act="autoColorAll"]');
    await page.waitForFunction(() => /Auto color applied to 2 clips/.test(document.getElementById('toast').textContent));
    check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  } catch (e) {
    failed++;
    console.error('  ✗ ' + e.message);
  } finally {
    await app.close();
  }
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll auto-polish tests passed.');
  process.exitCode = failed ? 1 : 0;
})();
