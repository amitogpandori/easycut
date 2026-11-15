// Small, safe bridge between the editor page and Windows (save dialog, open folder).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easycutDesktop', {
  saveFile: (name, data) => ipcRenderer.invoke('save-file', { name, data }),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  platform: process.platform,
});
