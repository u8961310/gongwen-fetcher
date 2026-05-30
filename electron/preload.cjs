const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('get-state'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (v) => ipcRenderer.invoke('save-settings', v),
  startDownload: () => ipcRenderer.invoke('start-download'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  getSchedule: () => ipcRenderer.invoke('get-schedule'),
  setSchedule: (on) => ipcRenderer.invoke('set-schedule', on),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, data) => cb(data)),
});
