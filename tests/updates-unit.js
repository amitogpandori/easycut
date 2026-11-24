// Unit tests for the update logic shared by the Windows and Android apps (app/updates.js), with a fake GitHub API.
// Run with: node tests/updates-unit.js   (no app window needed)
const U = require('../app/updates.js');
const fs = require('fs');
const path = require('path');

let failed = 0;
function check(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ FAILED: ') + msg); if (!cond) failed++; }

const DL = U.DOWNLOAD_PREFIX;
const release = (tag, extra = {}) => ({
  tag_name: tag, name: 'EasyCut ' + tag.replace(/^v/, ''), draft: false, prerelease: false,
  html_url: 'https://github.com/amitogpandori/easycut/releases/tag/' + tag,
  body: "## What's new\n- **Faster** export\n- <img src=x onerror=alert(1)>\n\nRead [more](https://github.com/amitogpandori/easycut) or [bad](javascript:alert(1))",
  assets: [
    { name: 'EasyCut-Setup-' + tag.slice(1) + '.exe', browser_download_url: DL + tag + '/EasyCut-Setup-' + tag.slice(1) + '.exe', size: 90e6 },
    { name: 'latest.yml', browser_download_url: DL + tag + '/latest.yml', size: 400 },
    { name: 'EasyCut-' + tag.slice(1) + '.apk', browser_download_url: DL + tag + '/EasyCut-' + tag.slice(1) + '.apk', size: 3.4e6 },
  ],
  ...extra,
});
const fakeFetch = (status, json) => async (url, opts) => { fakeFetch.last = { url, opts }; return { ok: status === 200, status, json: async () => json }; };

(async () => {
  console.log('Version compare');
  check(U.compareVersions('1.16.0', '1.15.0') === 1 && U.compareVersions('1.15.0', '1.16.0') === -1, '1.16.0 is newer than 1.15.0');
  check(U.compareVersions('1.10.0', '1.9.9') === 1, '1.10.0 is newer than 1.9.9 (numbers, not text)');
  check(U.compareVersions('v1.16.0', '1.16.0') === 0, '"v1.16.0" equals "1.16.0"');
  check(U.compareVersions('2.0.0', '1.99.99') === 1, 'major version wins');
  check(U.compareVersions('1.16.0-beta.1', '1.16.0') === -1, 'a beta is older than the release');
  check(U.compareVersions('1.16', '1.16.0') === 0, '"1.16" equals "1.16.0"');
  check(!U.isNewer('garbage', '1.0.0') && !U.isNewer('', '1.0.0'), 'unreadable versions are never "newer"');
  check(U.isNewer('1.16.1', '1.16.0') && !U.isNewer('1.16.0', '1.16.0') && !U.isNewer('1.15.0', '1.16.0'), 'isNewer: patch bump yes, same or older no');

  console.log('Reading the GitHub release');
  const info = U.parseRelease(release('v1.17.0'), '1.16.0');
  check(info && info.version === '1.17.0' && info.newer, 'v1.17.0 is offered to 1.16.0');
  check(info.apkUrl === DL + 'v1.17.0/EasyCut-1.17.0.apk' && info.apkName === 'EasyCut-1.17.0.apk' && info.apkSize === 3.4e6, 'picks the APK asset (' + info.apkName + ')');
  check(info.exeUrl && /EasyCut-Setup-1\.17\.0\.exe$/.test(info.exeUrl), 'finds the Windows installer too');
  check(info.pageUrl.endsWith('/releases/tag/v1.17.0'), 'release page link');
  check(U.parseRelease(release('v1.16.0'), '1.16.0').newer === false, 'same version is not offered');
  check(U.parseRelease(release('v1.17.0', { draft: true }), '1.16.0') === null && U.parseRelease(release('v1.17.0', { prerelease: true }), '1.16.0') === null, 'drafts and pre-releases are ignored');
  const evil = U.parseRelease(release('v1.17.0', { assets: [{ name: 'EasyCut-1.17.0.apk', browser_download_url: 'https://evil.example/EasyCut.apk' }], html_url: 'https://evil.example/' }), '1.16.0');
  check(evil.apkUrl === null && evil.pageUrl === U.RELEASES_PAGE, 'APKs and links from anywhere but this repo are refused');
  const noApk = U.parseRelease(release('v1.17.0', { assets: [] }), '1.16.0');
  check(noApk.newer && noApk.apkUrl === null, 'release without APK yet: newer, but no APK');
  check(U.parseRelease({}, '1.16.0') === null && U.parseRelease(null, '1.16.0') === null, 'empty answers are ignored');

  console.log('When to check and when to pop up');
  const H = 3600e3, now = 1e12;
  check(U.shouldAutoCheck({ enabled: true, last: 0, now, reason: 'launch' }), 'first launch checks');
  check(!U.shouldAutoCheck({ enabled: true, last: now - 10 * 60e3, now, reason: 'launch' }), 'no second check within an hour of launching');
  check(!U.shouldAutoCheck({ enabled: true, last: now - 2 * H, now, reason: 'resume' }) && U.shouldAutoCheck({ enabled: true, last: now - 7 * H, now, reason: 'resume' }), 'coming back to the app checks at most every 6 hours');
  check(!U.shouldAutoCheck({ enabled: false, last: 0, now, reason: 'launch' }), 'auto-check off means no automatic checks');
  check(U.shouldShowAuto(info, {}, now), 'newer release with APK pops up');
  check(!U.shouldShowAuto(noApk, {}, now), 'no pop-up while the APK is still being built');
  check(!U.shouldShowAuto(info, { snoozed: '1.17.0', snoozedAt: now - H }, now) && U.shouldShowAuto(info, { snoozed: '1.17.0', snoozedAt: now - 25 * H }, now), '"Later" hides that version for a day');
  check(U.shouldShowAuto(U.parseRelease(release('v1.18.0'), '1.16.0'), { snoozed: '1.17.0', snoozedAt: now - H }, now), 'a newer version shows even after "Later"');

  console.log('Release notes');
  const html = U.notesToHtml(info.notes);
  check(/<h4>What's new<\/h4>/.test(html.replace(/&#39;/g, "'")) && /<li><b>Faster<\/b> export<\/li>/.test(html), 'headings, bullets and bold are shown');
  check(!/<img/i.test(html) && /&lt;img/.test(html), 'HTML in notes is shown as text, never run');
  check(/<a href="https:\/\/github.com\/amitogpandori\/easycut"/.test(html) && !/href="javascript/.test(html), 'only https links become links');

  console.log('Speed labels');
  check(U.fmtSpeed(0.6125000000000004) === '0.61', '0.6125000000000004 → 0.61');
  check(U.fmtSpeed(2) === '2' && U.fmtSpeed(1.5) === '1.5' && U.fmtSpeed(0.25) === '0.25' && U.fmtSpeed(1.005) === '1' && U.fmtSpeed(3.999) === '4', 'trailing zeros trimmed, max 2 decimals');
  const html2 = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  check(!/\$\{c\.speed\}x/.test(html2) && /\$\{fmtSpeed\(c\.speed\)\}x/.test(html2), 'timeline clip label uses the rounded speed');

  console.log('Asking GitHub (fake API)');
  const f1 = fakeFetch(200, release('v1.17.0'));
  const got = await U.checkLatest(f1, '1.16.0');
  check(fakeFetch.last.url === 'https://api.github.com/repos/amitogpandori/easycut/releases/latest', 'asks /releases/latest of amitogpandori/easycut');
  check(got.newer && got.version === '1.17.0', 'returns the newer version');
  let err = null; try { await U.checkLatest(fakeFetch(403, {}), '1.16.0'); } catch (e) { err = e; }
  check(err && /rate limit/i.test(err.message), 'GitHub rate limit gives a clear message');
  err = null; try { await U.checkLatest(fakeFetch(500, {}), '1.16.0'); } catch (e) { err = e; }
  check(err && /Could not reach GitHub/.test(err.message), 'server errors give a clear message');

  console.log('Versions line up');
  const pkg = require('../package.json');
  const [MA, MI, PA] = pkg.version.split('.').map(Number);
  check(pkg.version === '1.20.0', 'app version is 1.20.0');
  check(MA * 10000 + MI * 100 + PA > 11600, 'Android versionCode ' + (MA * 10000 + MI * 100 + PA) + ' is above 1.16.0 (11600), so it installs over the old app');
  check(pkg.dependencies && pkg.dependencies['electron-updater'], 'electron-updater ships with the Windows app');
  const pub = (pkg.build.publish || [])[0] || {};
  check(pub.provider === 'github' && pub.owner === 'amitogpandori' && pub.repo === 'easycut' && !pub.token, 'updates come from public GitHub releases, no token in the app');
  check(!pkg.build.win.publisherName && pkg.build.win.verifyUpdateCodeSignature === false, 'no publisher check (the app is not code-signed)');

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll update logic checks passed');
  process.exit(failed ? 1 : 0);
})();
