// Small, safe bridge between the editor page and Windows (save dialogs, project files).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('easycutDesktop', {
  saveFile: (name, data) => ipcRenderer.invoke('save-file', { name, data }),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file) || ''; } catch (e) { return ''; } },
  chooseProjectSave: (name) => ipcRenderer.invoke('choose-project-save', name),
  openProject: () => ipcRenderer.invoke('open-project'),
  openProjectPath: (p) => ipcRenderer.invoke('open-project-path', p),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', { filePath, data }),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  ai: {
    status: () => ipcRenderer.invoke('ai-status'),
    start: () => ipcRenderer.invoke('ai-start'),
    chat: (model, messages) => ipcRenderer.invoke('ai-chat', { model, messages }),
    pull: (model) => ipcRenderer.invoke('ai-pull', model),
    onPullProgress: (cb) => { const f = (e, d) => cb(d); ipcRenderer.on('ai-pull-progress', f); return () => ipcRenderer.removeListener('ai-pull-progress', f); },
    getOllama: () => ipcRenderer.invoke('ai-get-ollama'),
  },
  platform: process.platform,
});
