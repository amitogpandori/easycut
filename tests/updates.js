// Automatic updates in the real app.
// Windows: a pretend updater (EASYCUT_FAKE_UPDATE) goes checking → downloading → ready, the banner appears, and
// "Restart now" asks the updater to install. Android: the same editor page with a pretend Capacitor and a fake
// GitHub API, through the update sheet, the first-time "Allow from this source" step, download and install.
// Also: menu items, the auto-check switch, and rounded speed labels on the timeline.
// Run with: npm test   (needs a desktop session — GitHub's Windows runners have one)
const { _electron: electron } = require('playwright');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'output');
require('fs').mkdirSync(out, { recursive: true });
const media = (f) => path.join(__dirname, 'media', f);
let failed = 0;
function check(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ FAILED: ') + msg); if (!cond) failed++; }

// Pretend Android: Capacitor with the EasyCutUpdater plugin, and GitHub's API answering from window.__release.
const ANDROID_FAKE = () => {
  if (!/android=1/.test(location.search)) return;
  try { localStorage.removeItem('ec-upd'); } catch (e) {}
  const L = (window.__capL = {}), P = (window.__updL = {});
  window.__upd = { canInstall: true, openedSettings: 0, installed: [], downloads: 0, failDownload: false, opened: [] };
  const DL = 'https://github.com/amitogpandori/easycut/releases/download/';
  window.__release = { tag_name: 'v1.19.1', draft: false, prerelease: false, html_url: 'https://github.com/amitogpandori/easycut/releases/tag/v1.19.1',
    body: "## What's new\n- **Faster** exports\n- <img src=x onerror=window.__xss=1>",
    assets: [{ name: 'EasyCut-1.19.1.apk', size: 3500000, browser_download_url: DL + 'v1.19.1/EasyCut-1.19.1.apk' }] };
  window.__apiCalls = 0;
  const realFetch = window.fetch.bind(window);
  window.fetch = (u, o) => {
    if (String(u).startsWith('https://api.github.com/')) { window.__apiCalls++; return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(window.__release)) }); }
    return realFetch(u, o);
  };
  window.open = (u) => { window.__upd.opened.push(u); return null; };
  const add = (store) => (ev, cb) => { (store[ev] = store[ev] || []).push(cb); return Promise.resolve({ remove() { store[ev] = store[ev].filter((f) => f !== cb); } }); };
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      App: { addListener: add(L), getInfo: async () => ({ version: '1.16.0' }), exitApp() {} },
      Filesystem: {}, Share: {},
      EasyCutUpdater: {
        addListener: add(P),
        getInfo: async () => ({ versionName: '1.16.0', versionCode: 11600, canInstall: window.__upd.canInstall }),
        openInstallSettings: async () => { window.__upd.openedSettings++; },
        download: async ({ url, fileName }) => {
          window.__upd.downloads++; window.__upd.lastUrl = url;
          if (window.__upd.failDownload) throw new Error('network down');
          for (const n of [1, 2, 3, 4]) { await new Promise((r) => setTimeout(r, 60)); (P.progress || []).forEach((f) => f({ loaded: n * 875000, total: 3500000 })); }
          return { path: '/data/cache/updates/' + fileName, versionName: '1.19.1', versionCode: 11901 };
        },
        install: async ({ path }) => { window.__upd.installed.push(path); return { canInstall: true }; },
        openUrl: async ({ url }) => { window.__upd.opened.push(url); },
      },
    },
  };
  window.__fire = (ev) => (L[ev] || []).forEach((f) => f({}));
};

(async () => {
  // ---------- Windows ----------
  console.log('Windows: background download and "restart to install" banner');
  let app = await electron.launch({ args: [root], env: { ...process.env, EASYCUT_TEST: '1', EASYCUT_FAKE_UPDATE: '1.99.0' } });
  let page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.waitForSelector('#bExport');
    check(await page.evaluate(() => !!(window.easycutDesktop && window.easycutDesktop.updates && window.EasyCutUpdates)), 'updater bridge is there');
    await page.waitForSelector('#updbar.on', { timeout: 15000 });
    const txt = await page.textContent('#updbar');
    check(/Update 1\.99\.0 ready/.test(txt) && /restart to install/i.test(txt) && /installs when you close/i.test(txt), 'banner: "' + txt.trim().replace(/\s+/g, ' ') + '"');
    const bar = await page.evaluate(() => { const r = document.getElementById('updbar').getBoundingClientRect(); return { w: r.width, h: r.height, right: innerWidth - r.right, bottom: innerHeight - r.bottom }; });
    check(bar.h < 80 && bar.w < 600 && bar.right < 40 && bar.bottom < 40, `banner is small and tucked in the corner (${Math.round(bar.w)}×${Math.round(bar.h)})`);
    await page.screenshot({ path: path.join(out, 'update-banner-windows.png') });
    await page.click('#updbar [data-upd="hide"]');
    check(!(await page.locator('#updbar.on').count()), '✕ hides the banner (it still installs on close)');
    // menu
    await page.evaluate(() => { const h = document.getElementById('home'); if (h.classList.contains('on')) h.classList.remove('on'); });
    await page.click('#bProj');
    const items = await page.$$eval('#pmenu [data-pm]', (b) => b.map((x) => x.dataset.pm));
    check(items.includes('updcheck') && items.includes('updauto'), 'Project menu has "Check for updates" and "Check automatically"');
    check(/EasyCut 1\.19\.1/.test(await page.textContent('#pmenu')), 'menu shows the app version (1.19.1)');
    await page.click('#pmenu [data-pm="updcheck"]');
    await page.waitForSelector('#updbar.on', { timeout: 5000 });
    check(/1\.99\.0 ready/.test(await page.textContent('#updbar')), 'manual check brings the ready banner back');
    // auto-check switch persists in the main process
    await page.click('#bProj'); await page.click('#pmenu [data-pm="updauto"]');
    let st = await page.evaluate(() => window.easycutDesktop.updates.state());
    check(st.auto === false, 'switching "Check automatically" off is saved');
    await page.click('#bProj');
    check(/⬜ Check automatically/.test(await page.textContent('#pmenu')), 'menu shows it as off');
    await page.click('#pmenu [data-pm="updauto"]');
    st = await page.evaluate(() => window.easycutDesktop.updates.state());
    check(st.auto === true, 'and back on');
    // speed labels
    await page.setInputFiles('#fileIn', [media('clip1.mp4')]);
    await page.waitForFunction(() => window.__ec.S.clips.length >= 1 && Object.values(window.__ec.media).every((m) => !m.loading), null, { timeout: 60000 });
    const lbl = await page.evaluate(() => { const E = window.__ec; E.S.clips[0].speed = 0.6125000000000004; E.renderTimeline(); const b = document.querySelector('.vclip .lbl b'); return b ? b.textContent : null; });
    check(lbl === '0.61x', 'timeline speed label is rounded: ' + lbl);
    await page.evaluate(() => { const E = window.__ec; E.S.clips[0].speed = 1.5; E.renderTimeline(); });
    check(await page.evaluate(() => document.querySelector('.vclip .lbl b').textContent) === '1.5x', '1.5 stays "1.5x"');
    await page.evaluate(() => { const E = window.__ec; E.S.clips[0].speed = 1; E.renderTimeline(); });
    // restart now
    await page.click('#updbar [data-upd="restart"]').catch(() => {});
    await page.waitForTimeout(400);
    const dlg = await page.locator('#mUp.on [data-cl="discard"]').count();
    if (dlg) await page.click('#mUp.on [data-cl="discard"]'); // unsaved project: "Don't save"
    await page.waitForTimeout(400);
    check(await page.evaluate(() => window.easycutDesktop.updates.testInstalled()), '"Restart now" asks about unsaved work, then installs the update');
    check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  } catch (e) { check(false, 'Windows part crashed: ' + e.message); }
  await app.close().catch(() => {});

  console.log('Windows: already up to date');
  app = await electron.launch({ args: [root], env: { ...process.env, EASYCUT_TEST: '1', EASYCUT_FAKE_UPDATE: 'none' } });
  page = await app.firstWindow();
  try {
    await page.waitForSelector('#bExport');
    await page.waitForTimeout(2200);
    check(!(await page.locator('#updbar.on').count()), 'no banner when there is nothing new');
    await page.click('#home [data-hupd="check"]');
    await page.waitForFunction(() => /latest version \(1\.19\.1\)/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
    check(true, 'home screen "Check for updates" says you have the latest version');
  } catch (e) { check(false, 'up-to-date part: ' + e.message); }

  // ---------- Android (same page, pretend Capacitor) ----------
  console.log('Android: update sheet, permission step, download, installer');
  try {
    await app.context().addInitScript(ANDROID_FAKE);
    const winP = app.waitForEvent('window');
    await app.evaluate(({ BrowserWindow }, file) => { const w = new BrowserWindow({ width: 412, height: 915, show: true, webPreferences: { contextIsolation: true, sandbox: true } }); w.loadFile(file, { query: { android: '1' } }); }, path.join(root, 'app', 'index.html'));
    const ap = await winP;
    const aerr = []; ap.on('pageerror', (e) => aerr.push(String(e)));
    await ap.waitForSelector('#bExport');
    check(await ap.evaluate(() => document.body.classList.contains('is-android')), 'runs as the Android app');
    await ap.waitForSelector('#mUpd.on', { timeout: 12000 });
    check(await ap.evaluate(() => window.__apiCalls) === 1, 'asked GitHub once on launch');
    const sheet = await ap.evaluate(() => ({ h: document.querySelector('#dlgUpd h2').textContent, notes: document.querySelector('.updnotes').innerHTML, hint: document.querySelector('#dlgUpd .hint').textContent }));
    check(/1\.19\.1 is here/.test(sheet.h) && /You have 1\.16\.0/.test(sheet.hint) && /3\.3 MB/.test(sheet.hint), `sheet: "${sheet.h}" · ${sheet.hint}`);
    check(/<b>Faster<\/b> exports/.test(sheet.notes) && !/<img/.test(sheet.notes) && !(await ap.evaluate(() => window.__xss)), 'release notes shown, HTML in them not run');
    await ap.screenshot({ path: path.join(out, 'update-sheet-android.png') });
    // first time: needs "Allow from this source"
    await ap.evaluate(() => { window.__upd.canInstall = false; });
    await ap.click('#dlgUpd [data-upd="go"]');
    await ap.waitForSelector('.updperm');
    check(/Allow from this source/.test(await ap.textContent('.updperm')), 'first time: explains "Allow from this source"');
    await ap.screenshot({ path: path.join(out, 'update-permission-android.png') });
    await ap.click('#dlgUpd [data-upd="perm"]');
    check(await ap.evaluate(() => window.__upd.openedSettings) === 1, '"Open settings" opens Android\'s install-apps setting for EasyCut');
    await ap.evaluate(() => { window.__upd.canInstall = true; window.__fire('resume'); });
    await ap.waitForFunction(() => window.__upd.installed.length === 1, null, { timeout: 5000 });
    const ins = await ap.evaluate(() => ({ p: window.__upd.installed[0], url: window.__upd.lastUrl, w: document.querySelector('#updProg') && document.querySelector('#dlgUpd').textContent }));
    check(ins.url.endsWith('/v1.19.1/EasyCut-1.19.1.apk') && ins.p.endsWith('EasyCut-1.19.1.apk'), 'after allowing: downloads the APK and opens the system installer');
    check(/tap Update/.test(ins.w), 'tells you to confirm in Android\'s installer');
    check(await ap.evaluate(() => window.__apiCalls) === 1, 'coming back from settings did not ask GitHub again');
    // later + throttling
    await ap.click('#dlgUpd [data-upd="later"]');
    await ap.evaluate(() => window.__fire('resume')); await ap.waitForTimeout(300);
    check(await ap.evaluate(() => window.__apiCalls) === 1 && !(await ap.locator('#mUpd.on').count()), 'resuming soon after does not check again (throttled)');
    // manual check from the menu ignores snooze; download failure falls back to the browser
    await ap.evaluate(() => { document.getElementById('home').classList.remove('on'); });
    await ap.evaluate(() => document.getElementById('bProj').click());
    await ap.evaluate(() => document.querySelector('#pmenu [data-pm="updcheck"]').click());
    await ap.waitForSelector('#mUpd.on', { timeout: 5000 });
    check(await ap.evaluate(() => window.__apiCalls) === 2, 'menu "Check for updates" checks right away');
    await ap.evaluate(() => { window.__upd.failDownload = true; });
    await ap.click('#dlgUpd [data-upd="go"]');
    await ap.waitForFunction(() => window.__upd.opened.length > 0, null, { timeout: 5000 });
    check(await ap.evaluate(() => window.__upd.opened[0].endsWith('/EasyCut-1.19.1.apk')), 'if the in-app download fails, opens the APK in the browser instead');
    await ap.evaluate(() => document.querySelector('#dlgUpd [data-upd="later"]') && document.querySelector('#dlgUpd [data-upd="later"]').click());
    // up to date
    await ap.evaluate(() => { window.__release.tag_name = 'v1.16.0'; document.getElementById('bProj').click(); document.querySelector('#pmenu [data-pm="updcheck"]').click(); });
    await ap.waitForFunction(() => /latest version \(1\.16\.0\)/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
    check(!(await ap.locator('#mUpd.on').count()), 'same version: "You have the latest version", no sheet');
    // switch off
    await ap.evaluate(() => { document.getElementById('bProj').click(); document.querySelector('#pmenu [data-pm="updauto"]').click(); });
    check(await ap.evaluate(() => JSON.parse(localStorage.getItem('ec-upd')).auto === false), '"Check automatically" off is remembered');
    await ap.evaluate(() => { const s = JSON.parse(localStorage.getItem('ec-upd')); s.last = 0; localStorage.setItem('ec-upd', JSON.stringify(s)); window.__fire('resume'); });
    await ap.waitForTimeout(300);
    check(await ap.evaluate(() => window.__apiCalls) === 3, 'with it off, coming back to the app does not check');
    check(!aerr.length, 'no page errors on Android' + (aerr.length ? ': ' + aerr.join(' | ') : ''));
  } catch (e) { check(false, 'Android part crashed: ' + e.message); }
  await app.close().catch(() => {});

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll update checks passed');
  process.exit(failed ? 1 : 0);
})();
