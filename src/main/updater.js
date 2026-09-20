// src/main/updater.js
// 自动更新模块（electron-updater + GitHub Releases）
//
// 工作方式：
//   1) 软件启动后（或用户点「检查更新」）向 GitHub 拉取 Release 里的 latest.yml
//   2) 用 latest.yml 里的 version 与当前 app.getVersion() 比较
//   3) 有新版 → 通知界面 → 用户点下载（支持差分，只下变化部分）→ 重启安装
//
// ⚠️ 三个必须守住的点：
//   1) 发版前必须先改 package.json 的 version，否则永远判定为"已是最新"
//   2) Release 里必须带 latest.yml（npm run release 会自动上传，手动传容易漏）
//   3) electron-updater 使用独立的 partition session，不继承 defaultSession 的代理，
//      因此每次检查/下载前都会给它同步一次用户配置的代理（国内必需）
import { app, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'

// electron-updater 是 CommonJS 包，ESM 下通过默认导入解构拿 autoUpdater
const { autoUpdater } = electronUpdater

// 由 index.js 注入的「取主窗口」函数，用于把状态推给渲染层
let getWindow = () => null
// 最近一次状态：设置页打开时可主动拉取一次，避免错过事件
let lastStatus = { state: 'idle' }

function pushStatus(payload) {
  lastStatus = { ...payload, currentVersion: app.getVersion() }
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('update-status', lastStatus)
  }
  console.log('🔄 更新状态:', JSON.stringify(lastStatus))
}

// 给 electron-updater 的独立 session 同步代理（否则国内直连 GitHub 会超时/失败）
function applyProxyToUpdaterSession() {
  try {
    const pixivConfig = global.config?.pixiv || {}
    const useProxy = pixivConfig.useProxy ?? true
    const proxyPort = pixivConfig.proxyPort || 7890
    const proxyRules = `http=127.0.0.1:${proxyPort};https=127.0.0.1:${proxyPort}`
    autoUpdater.netSession
      .setProxy(useProxy ? { proxyRules } : { mode: 'direct' })
      .catch((e) => console.warn('更新会话代理设置失败:', e.message))
  } catch (e) {
    console.warn('更新会话代理设置异常:', e.message)
  }
}

// 检查更新（其余状态由下面的 autoUpdater 事件回调推送）
async function checkForUpdates({ silent = false } = {}) {
  const currentVersion = app.getVersion()

  // 开发模式（未打包）下 electron-updater 无法工作，给友好提示而不是抛错
  if (!app.isPackaged) {
    const message = '开发模式（未打包）不检查更新'
    if (!silent) pushStatus({ state: 'dev', message })
    return { success: false, state: 'dev', currentVersion, message }
  }

  try {
    applyProxyToUpdaterSession()
    const result = await autoUpdater.checkForUpdates()
    return {
      success: true,
      currentVersion,
      latestVersion: result?.updateInfo?.version || ''
    }
  } catch (e) {
    pushStatus({ state: 'error', message: e.message })
    return { success: false, currentVersion, message: e.message }
  }
}

// 开始下载更新（NSIS + blockmap → 支持差分下载，通常只有几百 KB）
async function downloadUpdate() {
  try {
    applyProxyToUpdaterSession()
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (e) {
    pushStatus({ state: 'error', message: e.message })
    return { success: false, message: e.message }
  }
}

export function setupUpdater(windowGetter) {
  getWindow = windowGetter

  autoUpdater.autoDownload = false        // 发现新版不自动下载，等用户点（省流量、可控）
  autoUpdater.autoInstallOnAppQuit = true // 已下载但用户没马上安装，退出软件时自动装

  // ===== 事件 → 渲染层 =====
  autoUpdater.on('checking-for-update', () => pushStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    pushStatus({ state: 'available', version: info?.version || '', notes: info?.releaseNotes || '' })
  )
  autoUpdater.on('update-not-available', (info) =>
    pushStatus({ state: 'not-available', version: info?.version || '' })
  )
  autoUpdater.on('download-progress', (p) =>
    pushStatus({
      state: 'downloading',
      percent: Math.round(p?.percent || 0),
      transferred: p?.transferred || 0,
      total: p?.total || 0,
      bytesPerSecond: p?.bytesPerSecond || 0
    })
  )
  autoUpdater.on('update-downloaded', (info) =>
    pushStatus({ state: 'downloaded', version: info?.version || '' })
  )
  autoUpdater.on('error', (err) =>
    pushStatus({ state: 'error', message: err?.message || String(err) })
  )

  // ===== IPC =====
  ipcMain.handle('get-app-version', () => app.getVersion())
  ipcMain.handle('get-update-status', () => lastStatus)
  ipcMain.handle('check-update', () => checkForUpdates({ silent: false }))
  ipcMain.handle('download-update', () => downloadUpdate())
  ipcMain.handle('install-update', () => {
    try {
      // 先让 IPC 正常返回，再退出安装（否则渲染层会看到"连接异常"）
      setImmediate(() => {
        // 参数：isSilent=false → 弹出安装向导（用户看得见进度，失败也看得见）
        //       isForceRunAfter=true → 安装完成后自动把软件打开
        autoUpdater.quitAndInstall(false, true)
      })
      return { success: true }
    } catch (e) {
      return { success: false, message: e.message }
    }
  })

  // ===== 启动后静默检查一次（仅打包环境）=====
  // 延迟 8 秒，避开启动时的图片/数据请求高峰
  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdates({ silent: true }).catch(() => {})
    }, 8000)
  }

  console.log('🔄 自动更新模块已就绪')
}
