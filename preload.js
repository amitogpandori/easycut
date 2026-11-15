// Small, safe bridge between the editor page and Windows (save dialogs, project files).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('easycutDesktop', {
  saveFile: (name, data) => ipcRenderer.invoke('save-file', { name, data }),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file) || ''; } catch (e) { return ''; } },
  chooseProjectSave: (name) => ipcRenderer.invoke('choose-project-save', name),
  openProject: () => ipcRenderer.invoke('open-project'),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', { filePath, data }),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  platform: process.platform,
});
