// Android media providers can return a generic MIME type for a photo. Verify the
// filename fallback still recognizes HEIF and imports it into the editor.
const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const heif = path.join(__dirname, 'media', 'photo.heic');
let failed = 0;
function check(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ FAILED: ') + msg); if (!cond) failed++; }

function tinyTiff(){
  const b = Buffer.alloc(146);
  b.write('II', 0); b.writeUInt16LE(42, 2); b.writeUInt32LE(8, 4); b.writeUInt16LE(10, 8);
  const entries = [
    [256, 4, 1, 2], [257, 4, 1, 1], [258, 3, 3, 134], [259, 3, 1, 1], [262, 3, 1, 2],
    [273, 4, 1, 140], [277, 3, 1, 3], [278, 4, 1, 1], [279, 4, 1, 6], [284, 3, 1, 1],
  ];
  entries.forEach(([tag, type, count, value], i) => {
    const o = 10 + i * 12; b.writeUInt16LE(tag, o); b.writeUInt16LE(type, o + 2); b.writeUInt32LE(count, o + 4);
    if (type === 3 && count === 1) b.writeUInt16LE(value, o + 8); else b.writeUInt32LE(value, o + 8);
  });
  b.writeUInt32LE(0, 130); [8, 8, 8].forEach((v, i) => { b.writeUInt16LE(v, 134 + i * 2); });
  [255, 0, 0, 0, 255, 0].forEach((v, i) => { b[140 + i] = v; });
  return b;
}

(async () => {
  const app = await electron.launch({ args: [root], env: { ...process.env, EASYCUT_TEST: '1' } });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.waitForSelector('#bExport');
    await page.setInputFiles('#fileIn', [{
      name: 'android-photo.heif',
      mimeType: 'application/octet-stream',
      buffer: fs.readFileSync(heif),
    }]);
    await page.waitForFunction(() => {
      const m = Object.values(window.__ec.media).find((x) => x.name === 'android-photo.heif');
      return m && !m.loading && m.type === 'image' && window.__ec.S.clips.some((c) => c.mediaId === m.id);
    }, null, { timeout: 30000 });
    check(true, 'generic-MIME HEIF photo is recognized and added to the timeline');
    await page.setInputFiles('#fileIn', [{
      name: 'camera-photo.tiff',
      mimeType: 'application/octet-stream',
      buffer: tinyTiff(),
    }]);
    await page.waitForFunction(() => {
      const m = Object.values(window.__ec.media).find((x) => x.name === 'camera-photo.tiff');
      return m && !m.loading && m.type === 'image' && window.__ec.S.clips.some((c) => c.mediaId === m.id);
    }, null, { timeout: 30000 });
    const tiff = await page.evaluate(() => Object.values(window.__ec.media).find((x) => x.name === 'camera-photo.tiff'));
    check(tiff.w === 2 && tiff.h === 1 && tiff.converted === 'tiff', 'generic-MIME TIFF photo is decoded and converted for editing');
    await page.evaluate(() => PhotoEditor.open());
    await page.setInputFiles('#peFile', {
      name: 'direct-photo.tiff',
      mimeType: 'application/octet-stream',
      buffer: tinyTiff(),
    });
    await page.waitForFunction(() => PhotoEditor.__.ST.src && PhotoEditor.__.ST.src.name === 'direct-photo.tiff' && PhotoEditor.__.ST.src.w === 2, null, { timeout: 30000 });
    check(true, 'TIFF opens directly in the photo editor too');
    await page.setInputFiles('#fileIn', {
      name: 'camera-photo.dng',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from([0]),
    });
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('RAW photo format .dng is not supported yet'), null, { timeout: 5000 });
    check(true, 'unsupported DSLR RAW files get a specific convert-to-JPG/TIFF message');
    await page.evaluate(() => PhotoEditor.close());
    await page.setInputFiles('#fileIn', [
      path.join(__dirname, 'media', 'clip2.mp4'),
      path.join(__dirname, 'media', 'wild-sunset.jpg'),
    ]);
    await page.waitForFunction(() => window.__ec.S.clips.length === 4, null, { timeout: 30000 });
    const timelineTypes = await page.evaluate(() => window.__ec.S.clips.slice(-2).map(c => window.__ec.media[c.mediaId].type).sort());
    check(timelineTypes.join(',') === 'image,video', 'main timeline accepts photos and videos together');
    await page.setInputFiles('#fileOv', [
      path.join(__dirname, 'media', 'clip1.mp4'),
      path.join(__dirname, 'media', 'photo-land.jpg'),
    ]);
    await page.waitForFunction(() => window.__ec.S.overlays.length === 2, null, { timeout: 30000 });
    const overlayTypes = await page.evaluate(() => window.__ec.S.overlays.map(o => window.__ec.media[o.mediaId].type).sort());
    check(overlayTypes.join(',') === 'image,video', 'overlay picker accepts photos and videos together');
    await page.evaluate(() => document.querySelector('#rail [data-tab="templates"]').click());
    await page.evaluate(() => document.querySelector('[data-layout="pip"]').click());
    await page.setInputFiles('#fileLayout', [
      path.join(__dirname, 'media', 'clip2.mp4'),
      path.join(__dirname, 'media', 'photo-land.jpg'),
    ]);
    await page.waitForFunction(() => window.__ec.S.overlays.length === 3 && window.__ec.S.clips.length === 5, null, { timeout: 30000 });
    const layoutTypes = await page.evaluate(() => [window.__ec.media[window.__ec.S.clips.at(-1).mediaId].type, ...window.__ec.S.overlays.slice(-1).map(o => window.__ec.media[o.mediaId].type)].sort());
    check(layoutTypes.join(',') === 'image,video', 'picture-in-picture layout accepts a photo and video together');
    await page.evaluate(() => document.getElementById('bExport').click());
    check(await page.locator('#xQual [data-val="max"].on').count() === 1, 'maximum export quality is selected by default');
    await page.click('#xRes [data-val="2160"]');
    check(await page.evaluate(() => window.__ec.S.res) === 2160, '4K export resolution applies to the shared composition');
    check(await page.locator('#xQual [data-val="max"].on').count() === 1, '4K keeps maximum quality selected');
    await page.click('#mExport [data-x="close"]');
    check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  } catch (e) {
    failed++;
    console.error('  ✗ ' + e.message, await page.locator('#toast').textContent().catch(() => ''));
  } finally {
    await app.close();
  }
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll mobile import tests passed.');
  process.exitCode = failed ? 1 : 0;
})();
