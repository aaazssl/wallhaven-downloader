"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  selectDownloadDir: () => electron.ipcRenderer.invoke("select-download-dir"),
  getConfig: () => electron.ipcRenderer.invoke("get-config"),
  saveConfig: (config) => electron.ipcRenderer.invoke("save-config", config),
  getHistory: () => electron.ipcRenderer.invoke("get-history"),
  downloadImages: (imageIds, downloadDir, concurrency) => electron.ipcRenderer.invoke("download-images", imageIds, downloadDir, concurrency),
  onDownloadProgress: (callback) => {
    electron.ipcRenderer.on("download-progress", (event, data) => callback(data));
  },
  removeDownloadProgressListener: () => {
    electron.ipcRenderer.removeAllListeners("download-progress");
  }
});
