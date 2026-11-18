// EasyCut desktop shell (Electron). The editor itself lives in app/index.html.
const { app, BrowserWindow, ipcMain, dialog, session, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let win = null;

// Laptops with two graphics chips (e.g. AMD Radeon + NVIDIA GTX): ask Windows for the fast one,
// so preview, effects, color grading and export run on the dedicated GPU.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('enable-gpu-rasterization');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0c0e13',
    title: 'EasyCut',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // The editor asks before leaving when there is unsaved work; show a real dialog for it.
  win.webContents.on('will-prevent-unload', (e) => {
    if (process.env.EASYCUT_TEST || updInstalling) { e.preventDefault(); return; }
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Close anyway', 'Keep editing'],
      defaultId: 1,
      cancelId: 1,
      title: 'Close EasyCut?',
      message: 'Close EasyCut?',
      detail: 'Your timeline will be lost. Export your video first if you need it.',
    });
    if (choice === 0) e.preventDefault();
  });

  // Links open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });

  win.on('closed', () => { win = null; });
}

// ---------- automatic updates (Windows installer from GitHub releases, via electron-updater) ----------
// Checks a few seconds after launch and every 4 hours, downloads in the background, then shows a small banner.
// The update installs when EasyCut closes, or right away with "Restart now". The app isn't code-signed, so there is
// no publisher check (no publisherName in app-update.yml, and the signature check is switched off below).
const UPD_EVERY = 4 * 60 * 60 * 1000;
const UPD = { state: 'idle', version: null, percent: 0, error: null, auto: true };
let updater = null, updInstalling = false, updTimer = null;
const updFile = () => path.join(app.getPath('userData'), 'update-settings.json');
function updLoad() { try { UPD.auto = JSON.parse(require('fs').readFileSync(updFile(), 'utf8')).auto !== false; } catch (e) { UPD.auto = true; } }
function updStore() { try { require('fs').mkdirSync(path.dirname(updFile()), { recursive: true }); require('fs').writeFileSync(updFile(), JSON.stringify({ auto: UPD.auto })); } catch (e) {} }
const updState = () => ({ ...UPD, current: app.getVersion(), supported: !!updater });
function updSend() { if (win && !win.isDestroyed()) win.webContents.send('upd-status', updState()); }
function updSet(patch) { Object.assign(UPD, patch); updSend(); }

// In tests (EASYCUT_FAKE_UPDATE=1.99.0) a pretend updater walks through checking → downloading → ready.
function fakeUpdater(version) {
  const EventEmitter = require('events');
  const f = new EventEmitter();
  f.installed = false;
  f.checkForUpdates = async () => {
    f.emit('checking-for-update');
    if (version === 'none') { setTimeout(() => f.emit('update-not-available', { version: app.getVersion() }), 50); return {}; }
    setTimeout(() => { f.emit('update-available', { version }); f.emit('download-progress', { percent: 50 }); }, 50);
    setTimeout(() => f.emit('update-downloaded', { version }), 250);
    return {};
  };
  f.quitAndInstall = () => { f.installed = true; global.__easycutFakeInstalled = true; };
  return f;
}

function setupUpdater() {
  updLoad();
  const fake = process.env.EASYCUT_TEST && process.env.EASYCUT_FAKE_UPDATE;
  if (fake) updater = fakeUpdater(fake);
  else if (!process.env.EASYCUT_TEST && app.isPackaged && process.platform === 'win32') {
    try { updater = require('electron-updater').autoUpdater; } catch (e) { updater = null; }
  }
  if (!updater) { UPD.state = 'unsupported'; return; }
  if (!fake) {
    updater.autoDownload = true;           // download quietly in the background
    updater.autoInstallOnAppQuit = true;   // ...and install when EasyCut is closed
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.logger = null;
    try { updater.verifyUpdateCodeSignature = () => Promise.resolve(null); } catch (e) {} // unsigned app: nothing to verify against
  }
  updater.on('checking-for-update', () => { if (UPD.state !== 'ready') updSet({ state: 'checking', error: null }); });
  updater.on('update-available', (i) => updSet({ state: 'downloading', version: i && i.version, percent: 0 }));
  updater.on('update-not-available', () => { if (UPD.state !== 'ready') updSet({ state: 'none' }); });
  updater.on('download-progress', (p) => { if (UPD.state !== 'ready') updSet({ state: 'downloading', percent: (p && p.percent) || 0 }); });
  updater.on('update-downloaded', (i) => updSet({ state: 'ready', version: i && i.version, percent: 100 }));
  updater.on('error', (e) => { if (UPD.state !== 'ready') updSet({ state: 'error', error: String((e && e.message) || e).split('\n')[0] }); });
  const auto = () => { if (UPD.auto) updCheck().catch(() => {}); };
  setTimeout(auto, fake ? 1500 : 8000);
  updTimer = setInterval(auto, UPD_EVERY);
}
async function updCheck() {
  if (!updater) return updState();
  if (UPD.state === 'ready' || UPD.state === 'downloading') { updSend(); return updState(); }
  try { await updater.checkForUpdates(); } catch (e) { updSet({ state: 'error', error: String((e && e.message) || e).split('\n')[0] }); }
  return updState();
}

app.whenReady().then(() => {
  // Allow the microphone (voiceover) and nothing else.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media');

  Menu.setApplicationMenu(null);

  // In automated tests, dialogs are replaced by files in a temp folder.
  const TEST_DIR = process.env.EASYCUT_TEST ? path.join(require('os').tmpdir(), 'easycut-test') : null;
  if (TEST_DIR) { require('fs').rmSync(TEST_DIR, { recursive: true, force: true }); require('fs').mkdirSync(TEST_DIR, { recursive: true }); }

  ipcMain.handle('save-file', async (e, { name, data }) => {
    const ext = (path.extname(name).slice(1) || 'mp4').toLowerCase();
    const isImg = ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
    let filePath = TEST_DIR ? path.join(TEST_DIR, name) : null;
    if (!filePath) {
      const r = await dialog.showSaveDialog(win, {
        title: isImg ? 'Save image' : 'Save video',
        defaultPath: path.join(app.getPath(isImg ? 'pictures' : 'videos'), name),
        filters: [{ name: ext.toUpperCase() + (isImg ? ' image' : ' video'), extensions: [ext] }],
      });
      if (r.canceled || !r.filePath) return { ok: false };
      filePath = r.filePath;
    }
    await fs.writeFile(filePath, Buffer.from(data));
    return { ok: true, path: filePath };
  });

  ipcMain.handle('choose-project-save', async (e, name) => {
    if (TEST_DIR) return path.join(TEST_DIR, name);
    const r = await dialog.showSaveDialog(win, {
      title: 'Save EasyCut project',
      defaultPath: path.join(app.getPath('documents'), name),
      filters: [{ name: 'EasyCut project', extensions: ['easycut'] }],
    });
    return r.canceled ? null : r.filePath;
  });
  ipcMain.handle('open-project', async () => {
    let p;
    if (TEST_DIR) {
      const f = require('fs').readdirSync(TEST_DIR).find((n) => n.endsWith('.easycut'));
      if (!f) return null; p = path.join(TEST_DIR, f);
    } else {
      const r = await dialog.showOpenDialog(win, { title: 'Open EasyCut project', properties: ['openFile'], filters: [{ name: 'EasyCut project', extensions: ['easycut'] }] });
      if (r.canceled || !r.filePaths.length) return null; p = r.filePaths[0];
    }
    return { path: p, text: await fs.readFile(p, 'utf8') };
  });
  ipcMain.handle('open-project-path', async (e, p) => {
    if (typeof p !== 'string' || !p.toLowerCase().endsWith('.easycut')) throw new Error('not a project');
    return { path: p, text: await fs.readFile(p, 'utf8') };
  });
  ipcMain.handle('write-file', async (e, { filePath, data }) => {
    if (typeof filePath !== 'string') throw new Error('bad path');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, typeof data === 'string' ? data : Buffer.from(data));
    return true;
  });
  ipcMain.handle('read-file', async (e, filePath) => {
    if (typeof filePath !== 'string') throw new Error('bad path');
    const b = await fs.readFile(filePath);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  });
  ipcMain.handle('show-in-folder', (e, p) => { if (typeof p === 'string' && !process.env.EASYCUT_TEST) shell.showItemInFolder(p); });

  // ---------- Local AI (Ollama, free, runs on this PC) ----------
  const OLLAMA = (process.env.OLLAMA_HOST && /^https?:/.test(process.env.OLLAMA_HOST) ? process.env.OLLAMA_HOST : 'http://127.0.0.1:11434').replace(/\/$/, '');
  const ollamaExe = () => {
    const cands = [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'), path.join(process.env.ProgramFiles || '', 'Ollama', 'ollama.exe'), process.env.EASYCUT_OLLAMA_EXE || ''];
    for (const c of cands) { try { if (c && require('fs').existsSync(c)) return c; } catch (e) {} }
    try { const r = require('child_process').spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ollama'], { encoding: 'utf8' }); const p = (r.stdout || '').split(/\r?\n/)[0].trim(); if (p) return p; } catch (e) {}
    return null;
  };
  const tags = async () => { const r = await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(2500) }); const j = await r.json(); return (j.models || []).map((m) => ({ name: m.name, size: m.size })); };
  ipcMain.handle('ai-status', async () => {
    try { return { running: true, models: await tags() }; }
    catch (e) { return { running: false, installed: !!ollamaExe() }; }
  });
  ipcMain.handle('ai-start', async () => {
    const exe = ollamaExe(); if (!exe) return { ok: false, reason: 'not-installed' };
    try { require('child_process').spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch (e) { return { ok: false, reason: e.message }; }
    for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 500)); try { await tags(); return { ok: true }; } catch (e) {} }
    return { ok: false, reason: 'timeout' };
  });
  ipcMain.handle('ai-chat', async (e, { model, messages }) => {
    const body = (think) => JSON.stringify({ model, messages, stream: false, format: 'json', ...(think === false ? { think: false } : {}), keep_alive: '10m', options: { temperature: 0.2, num_ctx: 8192 } });
    let r = await fetch(OLLAMA + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(false) });
    let j = await r.json();
    if (j.error && /think/i.test(j.error)) { r = await fetch(OLLAMA + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body() }); j = await r.json(); }
    if (j.error) throw new Error(j.error);
    return (j.message && j.message.content) || '';
  });
  ipcMain.handle('ai-pull', async (e, model) => {
    const r = await fetch(OLLAMA + '/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: model, model, stream: true }) });
    if (!r.ok || !r.body) throw new Error('Download failed (' + r.status + ')');
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', last = null;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; try { last = JSON.parse(line); } catch (er) { continue; } if (last.error) throw new Error(last.error); if (win) win.webContents.send('ai-pull-progress', { model, status: last.status, completed: last.completed || 0, total: last.total || 0 }); }
    }
    return { ok: true };
  });
  ipcMain.handle('ai-get-ollama', () => shell.openExternal('https://ollama.com/download/windows'));

  // automatic updates
  ipcMain.handle('upd-state', () => updState());
  ipcMain.handle('upd-check', () => updCheck());
  ipcMain.handle('upd-set-auto', (e, on) => { UPD.auto = !!on; updStore(); return updState(); });
  ipcMain.handle('upd-install', () => {
    if (!updater || UPD.state !== 'ready') return false;
    updInstalling = true; // the editor already asked about unsaved work
    setImmediate(() => updater.quitAndInstall(true, true)); // silent install, then reopen EasyCut
    return true;
  });
  ipcMain.handle('upd-open-page', (e, url) => { if (typeof url === 'string' && url.startsWith('https://github.com/amitogpandori/easycut/') && !process.env.EASYCUT_TEST) shell.openExternal(url); return true; });
  ipcMain.handle('upd-test-installed', () => !!global.__easycutFakeInstalled);
  setupUpdater();

  require('./upscale').register(ipcMain, () => win);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
