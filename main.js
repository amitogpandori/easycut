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

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
