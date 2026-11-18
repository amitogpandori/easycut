// EasyCut updates: the shared, testable part of "is there a newer version?".
// Used by the Android app (asks GitHub directly) and by the desktop banner. No network or DOM in here,
// so tests can run it in plain Node with a fake release.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EasyCutUpdates = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const REPO = 'amitogpandori/easycut';
  const API_LATEST = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  const RELEASES_PAGE = 'https://github.com/' + REPO + '/releases/latest';
  const DOWNLOAD_PREFIX = 'https://github.com/' + REPO + '/releases/download/';
  const HOUR = 3600 * 1000;
  // automatic checks: at most once an hour on launch, once every 6 hours when the app comes back to the front
  const LAUNCH_GAP = HOUR, RESUME_GAP = 6 * HOUR, SNOOZE = 24 * HOUR;

  function parseVersion(v) {
    const m = /^\s*v?(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/.exec(String(v == null ? '' : v));
    if (!m) return null;
    return { major: +m[1], minor: +m[2], patch: +(m[3] || 0), pre: m[4] || '' };
  }
  // -1 if a < b, 0 if equal, 1 if a > b. "1.16.0-beta" is older than "1.16.0". Unreadable versions count as 0.0.0.
  function compareVersions(a, b) {
    const x = parseVersion(a) || { major: 0, minor: 0, patch: 0, pre: '' };
    const y = parseVersion(b) || { major: 0, minor: 0, patch: 0, pre: '' };
    for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] > y[k] ? 1 : -1;
    if (x.pre === y.pre) return 0;
    if (!x.pre) return 1;
    if (!y.pre) return -1;
    return x.pre > y.pre ? 1 : -1;
  }
  const isNewer = (latest, current) => !!parseVersion(latest) && compareVersions(latest, current) > 0;

  // The APK attached to a release (EasyCut-1.16.0.apk). Only trusted if it lives in this repo's releases.
  function pickApk(release) {
    const assets = (release && Array.isArray(release.assets)) ? release.assets : [];
    const ok = (a) => a && typeof a.name === 'string' && /\.apk$/i.test(a.name) && typeof a.browser_download_url === 'string' && a.browser_download_url.indexOf(DOWNLOAD_PREFIX) === 0;
    return assets.find((a) => ok(a) && /^EasyCut-[\d.]+\.apk$/i.test(a.name)) || assets.find(ok) || null;
  }
  const pickExe = (release) => ((release && release.assets) || []).find((a) => a && /^EasyCut-Setup-.*\.exe$/i.test(a.name || '')) || null;

  // Turn GitHub's /releases/latest answer into what the app needs.
  function parseRelease(json, current) {
    if (!json || typeof json !== 'object' || json.draft || json.prerelease) return null;
    const version = String(json.tag_name || json.name || '').replace(/^EasyCut\s+/i, '').replace(/^v/i, '').trim();
    if (!parseVersion(version)) return null;
    const apk = pickApk(json), exe = pickExe(json);
    return {
      version,
      newer: isNewer(version, current),
      notes: String(json.body || '').trim(),
      pageUrl: typeof json.html_url === 'string' && json.html_url.indexOf('https://github.com/' + REPO + '/') === 0 ? json.html_url : RELEASES_PAGE,
      apkUrl: apk ? apk.browser_download_url : null,
      apkName: apk ? apk.name : null,
      apkSize: apk ? (apk.size || 0) : 0,
      exeUrl: exe ? exe.browser_download_url : null,
      publishedAt: json.published_at || null,
    };
  }

  // Should an automatic (not user-asked) check run now?
  function shouldAutoCheck(opts) {
    const o = opts || {};
    if (o.enabled === false) return false;
    const gap = o.reason === 'resume' ? RESUME_GAP : LAUNCH_GAP;
    return !o.last || (o.now || Date.now()) - o.last >= gap;
  }
  // Should the update sheet pop up by itself for this release? (User-asked checks always show it.)
  function shouldShowAuto(info, settings, now) {
    if (!info || !info.newer || !info.apkUrl) return false; // APK not attached yet (it lands a few minutes after the .exe)
    const s = settings || {};
    if (s.snoozed === info.version && s.snoozedAt && (now || Date.now()) - s.snoozedAt < SNOOZE) return false;
    return true;
  }

  // Tiny, safe Markdown → HTML for release notes (bold, italics, code, links to https, bullets, headings).
  function notesToHtml(md, maxLines) {
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const inline = (s) => esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const lines = String(md || '').replace(/\r/g, '').split('\n').slice(0, maxLines || 60);
    let html = '', inList = false;
    for (const raw of lines) {
      const l = raw.trim();
      const li = /^[-*•]\s+(.*)$/.exec(l);
      if (li) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(li[1]) + '</li>'; continue; }
      if (inList) { html += '</ul>'; inList = false; }
      if (!l) continue;
      const h = /^#{1,6}\s+(.*)$/.exec(l);
      html += h ? '<h4>' + inline(h[1]) + '</h4>' : '<p>' + inline(l) + '</p>';
    }
    if (inList) html += '</ul>';
    return html;
  }

  // Speed shown to people: at most 2 decimals, no trailing zeros (0.6125000000000004 → "0.61").
  function fmtSpeed(v) {
    const n = Number(v);
    if (!isFinite(n)) return '1';
    return String(Math.round(n * 100) / 100);
  }

  // Ask GitHub for the latest release. fetchFn is window.fetch in the app, a fake in tests.
  async function checkLatest(fetchFn, current) {
    const r = await fetchFn(API_LATEST, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r || !r.ok) throw new Error(r && r.status === 403 ? 'GitHub is busy (rate limit). Try again later.' : 'Could not reach GitHub (' + (r ? r.status : 'offline') + ')');
    const info = parseRelease(await r.json(), current);
    if (!info) throw new Error('No release found');
    return info;
  }

  return { REPO, API_LATEST, RELEASES_PAGE, DOWNLOAD_PREFIX, LAUNCH_GAP, RESUME_GAP, SNOOZE, parseVersion, compareVersions, isNewer, pickApk, parseRelease, shouldAutoCheck, shouldShowAuto, notesToHtml, fmtSpeed, checkLatest };
});
