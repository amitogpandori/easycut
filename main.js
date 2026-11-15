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

  ipcMain.handle('save-file', async (e, { name, data }) => {
    const ext = (path.extname(name).slice(1) || 'mp4').toLowerCase();
    const r = await dialog.showSaveDialog(win, {
      title: 'Save video',
      defaultPath: path.join(app.getPath('videos'), name),
      filters: [{ name: ext.toUpperCase() + ' video', extensions: [ext] }],
    });
    if (r.canceled || !r.filePath) return { ok: false };
    await fs.writeFile(r.filePath, Buffer.from(data));
    return { ok: true, path: r.filePath };
  });
  ipcMain.handle('show-in-folder', (e, p) => { if (typeof p === 'string') shell.showItemInFolder(p); });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
