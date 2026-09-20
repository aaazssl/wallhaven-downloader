import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectDownloadDir: () => ipcRenderer.invoke('select-download-dir'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  saveAppConfig: (patch) => ipcRenderer.invoke('save-app-config', patch),
  getHistory: () => ipcRenderer.invoke('get-history'),
  downloadImages: (imageIds, downloadDir, concurrency, source, imageData) => 
    ipcRenderer.invoke('download-images', imageIds, downloadDir, concurrency, source, imageData),
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data))
  },
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  removeDownloadProgressListener: () => {
    ipcRenderer.removeAllListeners('download-progress')
  },
  clearDownloadCache: () => ipcRenderer.invoke('clear-download-cache'),
  deleteAllDownloads: () => ipcRenderer.invoke('delete-all-downloads'),
  fetchImageDetail: (imageId) => ipcRenderer.invoke('fetch-image-detail', imageId),
  fetchYanderePosts: (tags, page, limit) => ipcRenderer.invoke('fetch-yandere-posts', tags, page, limit),
  // ===== yande.re 独立配置（与 wallhaven 隔离） =====
  getYandereConfig: () => ipcRenderer.invoke('get-yandere-config'),
  saveYandereConfig: (yandereConfig) => ipcRenderer.invoke('save-yandere-config', yandereConfig),
  // ===== pixiv 独立配置（与 wallhaven / yande.re 隔离） =====
  getPixivConfig: () => ipcRenderer.invoke('get-pixiv-config'),
  savePixivConfig: (pixivConfig) => ipcRenderer.invoke('save-pixiv-config', pixivConfig),
  fetchPixivPosts: (tags, page, limit) => ipcRenderer.invoke('fetch-pixiv-posts', tags, page, limit),
  pixivLogin: () => ipcRenderer.invoke('pixiv-login'),
  fetchPixivPages: (illustId) => ipcRenderer.invoke('fetch-pixiv-pages', illustId),
  fetchPixivDetail: (illustId) => ipcRenderer.invoke('fetch-pixiv-detail', illustId),
  pixivFollowUser: (userId, follow) => ipcRenderer.invoke('pixiv-follow-user', userId, follow),
  pixivDownloadPages: (urls, downloadDir) => ipcRenderer.invoke('pixiv-download-pages', urls, downloadDir),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  pixivCollectLinks: (ids) => ipcRenderer.invoke('pixiv-collect-links', ids),
  onPixivLinksProgress: (callback) => {
    ipcRenderer.on('pixiv-links-progress', (event, data) => callback(data))
  },
  removePixivLinksProgressListener: () => {
    ipcRenderer.removeAllListeners('pixiv-links-progress')
  },
  // ===== 自动更新 =====
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  // 监听更新状态；返回「取消监听」函数。
  // ⚠️ 这里不用 removeAllListeners：同一频道可能被 App 和设置页同时监听，
  //    整体清空会误伤另一个监听者。
  onUpdateStatus: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('update-status', handler)
    return () => ipcRenderer.removeListener('update-status', handler)
  }
})
