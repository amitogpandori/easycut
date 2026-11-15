// EasyCut desktop shell (Electron). The editor itself lives in app/index.html.
const { app, BrowserWindow, ipcMain, dialog, session, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let win = null;

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
    if (process.env.EASYCUT_TEST) { e.preventDefault(); return; }
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
    const isImg = ['png', 'jpg', 'jpeg'].includes(ext);
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

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
