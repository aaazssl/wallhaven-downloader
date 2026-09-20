import { app, BrowserWindow, ipcMain, dialog, Menu, session, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { downloadManager } from './downloadManager'
import { yandereDownloadManager } from './yandereDownloadManager'
import { pixivDownloadManager, pixivDownloadUrls } from './pixivDownloadManager'
import { createProxyAgent } from './proxyHelper'
import { pixivGet, getRanking, getIllustPages, getIllustDetail, getDiscovery, getFollowLatest, setFollowUser, collectIllustUrls } from './pixivApi'
import { clearAllCaches } from './cache'
import { loadHistory, saveHistory, loadConfig, saveConfig, flushHistory } from './store'
import { setupUpdater } from './updater'

// ===== GPU 硬件加速开关 =====
// 说明：Electron 默认使用 GPU 渲染，但在部分机器/驱动（尤其老旧显卡、虚拟机）上
// GPU 合成不稳定，会出现 "GPU state invalid after WaitForGetOffsetInRange" 并导致
// 加载图片后严重卡顿。因此默认关闭硬件加速（改用软件渲染，稳定性最好）。
// 如果你的机器没问题，可以在「设置 → 系统设置」里开启，换取更流畅的滚动/动画。
// 注意：必须在 app ready 之前决定，所以这里同步读取 config.json
function shouldEnableHardwareAcceleration() {
  try {
    const cfgPath = path.join(app.getPath('userData'), 'config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    return cfg.hardwareAcceleration === true
  } catch (e) {
    return false
  }
}

if (!shouldEnableHardwareAcceleration()) {
  app.disableHardwareAcceleration()
}

let mainWindow

function createWindow() {
  // 隐藏系统菜单栏
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Wallhaven Downloader'
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  global.history = loadHistory()
  global.config = loadConfig()
  setupPixivImageNetworking()
  createWindow()
  // 自动更新：检查 GitHub Release 里的 latest.yml（打包环境下启动 8 秒后静默检查一次）
  setupUpdater(() => mainWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 退出前把防抖中的历史记录强制落盘
app.on('before-quit', () => {
  try { flushHistory() } catch (e) {}
})

// ==================== 统一请求函数（支持代理） ====================
async function request(url, options = {}) {
  const config = global.config || {}
  const useProxy = config.useProxy || false
  const proxyPort = config.proxyPort || 7890

  let agent = null
  if (useProxy) {
    const proxyUrl = `http://127.0.0.1:${proxyPort}`
    agent = new HttpsProxyAgent(proxyUrl)
    console.log(`🌐 使用代理: ${proxyUrl}`)
  } else {
    console.log('🌐 直接连接 (不使用代理)')
  }

  try {
    const response = await axios.get(url, {
      ...options,
      httpsAgent: agent,
      httpAgent: agent,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...options.headers,
      }
    })
    return response.data
  } catch (error) {
    console.error(`❌ 请求失败 (${url}):`, error.message)
    throw error
  }
}
// ==================== 结束 ====================

// ==================== （已移除）pixiv 图片自定义协议 ====================
// 早期实现：用自定义协议 pixiv-img:// 让主进程代拉图片（带 Referer + 代理）。
// 现已改为让 <img> 直连 https://i.pximg.net（见下方 setupPixivImageNetworking 注入 Referer），
// 以获得与浏览器一致的 HTTP/2 多路复用 + 磁盘缓存 + 高并发，因此该协议与其内存缓存已删除。
// 如需回退：恢复协议注册（registerSchemesAsPrivileged + protocol.handle）
// 并把渲染层图片地址包成 `pixiv-img://img/?u=${encodeURIComponent(url)}`。

// ==================== pixiv 图片直连优化 ====================
// 让 <img src="https://i.pximg.net/..."> 直接走 Chromium 的网络栈（与浏览器一致的
// HTTP/2 多路复用 + 磁盘缓存 + 高并发），而不是绕到主进程做代理：
//   1) 整个会话启用代理（wallhaven / yande.re / pixiv 三站统一）
//   2) 给 pximg 请求注入 Referer（+ 登录 Cookie），绕过防盗链
//   3) 给 electron-updater 的独立 session 同步代理（自动更新要能连上 GitHub）
// ⚠️ 命名说明：函数名沿用历史（最初只服务 pixiv），但它现在做的是
// "整个会话（wallhaven / yande.re / pixiv 三个图源）的代理设置" + "pximg 防盗链 Referer 注入"。
function setupPixivImageNetworking() {
  try {
    const ses = session.defaultSession
    const pixivConfig = global.config?.pixiv || {}
    const useProxy = pixivConfig.useProxy ?? true
    const proxyPort = pixivConfig.proxyPort || 7890

    // 1) 代理设置：三个图源（wallhaven / yande.re / pixiv）都需要走本地代理，
    //    因此对整个会话启用代理（本地地址 Chromium 默认会绕过，不影响 dev 服务器）。
    //    ⚠️ 之前用 PAC 按域名分流只让 pixiv 走代理，导致 wallhaven / yande.re 图片直连超时，已废弃
    const proxyRules = `http=127.0.0.1:${proxyPort};https=127.0.0.1:${proxyPort}`
    if (useProxy) {
      ses.setProxy({ proxyRules }).catch((e) => console.warn('设置会话代理失败:', e.message))
    } else {
      ses.setProxy({ mode: 'direct' }).catch(() => {})
    }

    // 3) 自动更新用的独立 session：
    //    electron-updater 内部固定用 session.fromPartition('electron-updater', { cache: false })
    //    发起请求（见 node_modules/electron-updater/out/electronHttpExecutor.js），
    //    它【不会】继承上面 defaultSession 的代理 —— 不同步设置的话，
    //    国内用户点「检查更新」会直连 GitHub 而超时/失败。
    //    ⚠️ 分区名与 cache 参数必须与 electron-updater 内部完全一致，否则拿到的是另一个 session
    try {
      const updaterSession = session.fromPartition('electron-updater', { cache: false })
      updaterSession
        .setProxy(useProxy ? { proxyRules } : { mode: 'direct' })
        .catch((e) => console.warn('设置更新会话代理失败:', e.message))
    } catch (e) {
      console.warn('设置更新会话代理异常:', e.message)
    }

    // 2) 注入 Referer / Cookie（i.pximg.net 防盗链校验）
    ses.webRequest.onBeforeSendHeaders(
      { urls: ['*://*.pximg.net/*', '*://pximg.net/*'] },
      (details, callback) => {
        try {
          const cfg = global.config?.pixiv || {}
          details.requestHeaders['Referer'] = 'https://www.pixiv.net/'
          details.requestHeaders['User-Agent'] =
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          if (cfg.cookie) details.requestHeaders['Cookie'] = cfg.cookie
        } catch (e) {}
        callback({ requestHeaders: details.requestHeaders })
      }
    )

    console.log(`🌐 会话代理已设置（${useProxy ? `全部请求走 127.0.0.1:${proxyPort}` : '不使用代理'}）`)
  } catch (e) {
    console.error('setupPixivImageNetworking 失败:', e.message)
  }
}

// ==================== pixiv 登录（内嵌窗口 + 自动抓取 Cookie） ====================
// 打开一个独立会话的浏览器窗口，用户在真实登录页完成登录（可过验证码），
// 程序检测到 PHPSESSID 后自动把 .pixiv.net 域下的全部 cookie 保存进配置
let pixivLoginWindow = null

ipcMain.handle('pixiv-login', async () => {
  const pixivConfig = global.config?.pixiv || {}
  const useProxy = pixivConfig.useProxy ?? true
  const proxyPort = pixivConfig.proxyPort || 7890

  // 独立会话分区，避免影响主窗口
  const loginSession = session.fromPartition('pixiv-login')

  // 先为会话设置好代理（pixiv 需要挂代理），再打开登录窗口
  const proxyRules = useProxy
    ? `http=127.0.0.1:${proxyPort};https=127.0.0.1:${proxyPort}`
    : 'direct://'
  try { await loginSession.setProxy({ proxyRules }) } catch (e) {}

  return new Promise((resolve) => {
    try {
      if (pixivLoginWindow && !pixivLoginWindow.isDestroyed()) {
        pixivLoginWindow.focus()
        resolve({ success: false, alreadyOpen: true })
        return
      }

      pixivLoginWindow = new BrowserWindow({
        width: 920,
        height: 780,
        title: '登录 pixiv',
        parent: mainWindow,
        webPreferences: {
          partition: 'pixiv-login',
          contextIsolation: true,
          nodeIntegration: false
        }
      })

      let finished = false
      let timer = null

      const collectCookieString = async () => {
        const all = await loginSession.cookies.get({})
        const pixivCookies = all.filter(c => (c.domain || '').includes('pixiv'))
        if (!pixivCookies.some(c => c.name === 'PHPSESSID')) return null
        return pixivCookies.map(c => `${c.name}=${c.value}`).join('; ')
      }

      const finish = async (ok) => {
        if (finished) return
        finished = true
        if (timer) { clearInterval(timer); timer = null }

        let saved = false
        if (ok) {
          const cookieStr = await collectCookieString()
          if (cookieStr) {
            global.config = { ...global.config, pixiv: { ...global.config.pixiv, cookie: cookieStr } }
            saveConfig(global.config)
            // 换了登录态 → 清空作品缓存，避免继续用旧账号的数据
            clearAllCaches()
            saved = true
            console.log(`🎨 pixiv 登录成功，已保存 Cookie（${cookieStr.length} 字符）`)
          }
        }
        if (pixivLoginWindow && !pixivLoginWindow.isDestroyed()) pixivLoginWindow.close()
        pixivLoginWindow = null
        resolve(saved ? { success: true } : { success: false })
      }

      // 轮询判断：pixiv 对【未登录访客】也会下发 PHPSESSID（匿名会话），
      // 所以不能用"存在 PHPSESSID"判定登录；改为判断窗口是否已回到
      // www.pixiv.net 主站（非 accounts 登录页）—— 这才是真正登录成功
      // 判定登录成功：必须"先进入过登录页(accounts.pixiv.net) → 再回到主站"，
      // 这样匿名访问主站时不会被误判
      let visitedLoginPage = false
      timer = setInterval(async () => {
        if (finished) return
        if (!pixivLoginWindow || pixivLoginWindow.isDestroyed()) return
        let url = ''
        try { url = pixivLoginWindow.webContents.getURL() } catch (e) { return }
        if (!url) return
        if (url.includes('accounts.pixiv.net') || url.includes('/login')) {
          visitedLoginPage = true
          return
        }
        if (visitedLoginPage && url.includes('www.pixiv.net')) {
          const cookieStr = await collectCookieString()
          if (cookieStr) finish(true)
        }
      }, 2000)

      pixivLoginWindow.on('closed', () => { finish(false) })

      pixivLoginWindow.loadURL('https://www.pixiv.net/')
    } catch (e) {
      console.error('pixiv 登录窗口打开失败:', e.message)
      resolve({ success: false, error: e.message })
    }
  })
})

// ==================== IPC 处理 ====================
ipcMain.handle('select-download-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择下载目录'
  })
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

ipcMain.handle('get-config', () => {
  return global.config
})

ipcMain.handle('save-config', (event, config) => {
  global.config = { ...global.config, ...config }
  saveConfig(global.config)
  return true
})

// ==================== 下载取消标记 ====================
let downloadCancelFlag = false

export function isDownloadCancelled() {
  return downloadCancelFlag
}

export function resetDownloadCancelFlag() {
  downloadCancelFlag = false
}

// ==================== yande.re 独立配置（与 wallhaven 配置隔离） ====================
ipcMain.handle('get-yandere-config', () => {
  return global.config.yandere
})

ipcMain.handle('save-yandere-config', (event, yandereConfig) => {
  // 代理项（useProxy / proxyPort）由「系统设置」统一管理，这里忽略，
  // 避免子配置把旧代理值写回来覆盖全局设置
  const { useProxy: _u, proxyPort: _p, ...rest } = yandereConfig || {}
  global.config = {
    ...global.config,
    yandere: { ...global.config.yandere, ...rest }
  }
  saveConfig(global.config)
  console.log('🔧 yande.re 配置已保存:', global.config.yandere)
  return true
})
// ==================== 结束 ====================

// ==================== pixiv 独立配置（与 wallhaven / yande.re 隔离） ====================
ipcMain.handle('get-pixiv-config', () => {
  return global.config.pixiv
})

ipcMain.handle('save-pixiv-config', (event, pixivConfig) => {
  const prevCookie = global.config.pixiv?.cookie || ''
  // 代理项由「系统设置」统一管理，这里忽略，避免子配置写回旧代理值
  const { useProxy: _u, proxyPort: _p, ...rest } = pixivConfig || {}
  global.config = {
    ...global.config,
    pixiv: { ...global.config.pixiv, ...rest }
  }
  saveConfig(global.config)
  // 登录态发生变化（cookie 改了）时清空缓存，避免命中上一个账号的数据
  const nextCookie = global.config.pixiv?.cookie || ''
  if (nextCookie !== prevCookie) {
    clearAllCaches()
  }
  // 代理开关/端口可能变化，重新应用 pixiv 图片的网络设置
  setupPixivImageNetworking()
  console.log('pixiv 配置已保存:', global.config.pixiv)
  return true
})

// ==================== 统一提交「全局配置」 ====================
// 渲染层只提交全局项（默认来源 / 全局代理 / 硬件加速），由主进程统一负责：
//   合并 → 同步到三站子配置（代理作用于全软件）→ 重设会话代理 → 落盘
// 这样"同一份值有多条写入路径"被收敛到一处，避免不同步（历史上出现过端口被写回旧值）
ipcMain.handle('save-app-config', (event, patch) => {
  try {
    if (!patch || typeof patch !== 'object') return { success: false, error: '无效配置' }
    global.config = { ...global.config, ...patch }

    const touchProxy = Object.prototype.hasOwnProperty.call(patch, 'useProxy') ||
                       Object.prototype.hasOwnProperty.call(patch, 'proxyPort')
    if (touchProxy) {
      const useProxy = global.config.useProxy
      const proxyPort = global.config.proxyPort
      global.config.yandere = { ...global.config.yandere, useProxy, proxyPort }
      global.config.pixiv = { ...global.config.pixiv, useProxy, proxyPort }
      setupPixivImageNetworking()
    }

    saveConfig(global.config)
    return { success: true }
  } catch (e) {
    console.error('保存全局配置失败:', e.message)
    return { success: false, error: e.message }
  }
})

ipcMain.handle('get-history', () => {
  return global.history
})

// ==================== 下载进度节流 ====================
// 下载时进度事件非常高频（每张图每 5% 一次），直接逐条 IPC 会拖慢渲染层。
// 这里把 progress 类事件按 id 合并、每 150ms 批量推送一次；item/complete 立即发送
function createProgressSender() {
  let timer = null
  const pending = new Map()

  const flush = () => {
    timer = null
    if (!mainWindow || mainWindow.isDestroyed()) { pending.clear(); return }
    for (const update of pending.values()) {
      mainWindow.webContents.send('download-progress', update)
    }
    pending.clear()
  }

  return (update) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (update && update.type === 'progress') {
      pending.set(update.id, update)
      if (!timer) timer = setTimeout(flush, 150)
      return
    }
    // 状态变化立即发送，先把积压的进度冲刷出去，保证顺序
    if (pending.size > 0) flush()
    mainWindow.webContents.send('download-progress', update)
  }
}

ipcMain.handle('download-images', async (event, imageIds, downloadDir, concurrency, source, imageData) => {
  // 开始新下载时重置取消标记
  downloadCancelFlag = false
  const sendProgress = createProgressSender()
  let result
  if (source === 'yandere') {
    // yande.re 使用独立下载管理器（多并发 + 支持取消）
    console.log(`🎌 yande.re 下载启动，共 ${imageIds.length} 张`)
    result = await yandereDownloadManager(imageIds, downloadDir, concurrency, sendProgress, imageData, isDownloadCancelled)
  } else if (source === 'pixiv') {
    // pixiv 使用独立下载管理器（多并发 + 支持取消）
    console.log(`pixiv 下载启动，共 ${imageIds.length} 张`)
    result = await pixivDownloadManager(imageIds, downloadDir, concurrency, sendProgress, imageData, isDownloadCancelled)
  } else {
    // Wallhaven 使用原下载管理器（逻辑不变）
    result = await downloadManager(imageIds, downloadDir, concurrency, sendProgress, source, imageData)
  }
  saveHistory(global.history)
  return result
})

// ==================== 取消下载 ====================
ipcMain.handle('cancel-download', () => {
  downloadCancelFlag = true
  console.log('⏹ 下载已请求取消（完成当前任务后停止）')
  return { success: true }
})

// ==================== 清空下载缓存 ====================
// ==================== 清理并删除（三站下载目录内的文件 + 下载记录） ====================
ipcMain.handle('delete-all-downloads', () => {
  const config = global.config || {}
  const dirs = [
    config.downloadDir,            // Wallhaven
    config.yandere?.downloadDir,   // yande.re
    config.pixiv?.downloadDir      // pixiv
  ].filter(d => typeof d === 'string' && d.trim())

  const cleaned = []
  for (const dir of dirs) {
    try {
      const rootResolved = path.resolve(dir)
      if (!fs.existsSync(rootResolved)) continue
      const entries = fs.readdirSync(rootResolved)
      for (const name of entries) {
        const targetResolved = path.resolve(path.join(rootResolved, name))
        // 严格限定在该目录内，绝不越界删除目录外的内容
        if (targetResolved !== rootResolved && !targetResolved.startsWith(rootResolved + path.sep)) {
          continue
        }
        fs.rmSync(targetResolved, { recursive: true, force: true })
      }
      cleaned.push(rootResolved)
      console.log(`🗑️ 已清空目录内容: ${rootResolved}`)
    } catch (e) {
      console.error(`清空目录失败 ${dir}:`, e.message)
    }
  }

  // 同时清空三站共用的下载记录
  global.history = []
  saveHistory([])
  clearAllCaches()

  return { success: true, message: `已删除 ${cleaned.length} 个目录内的下载内容，并清空下载缓存` }
})

ipcMain.handle('clear-download-cache', () => {
  global.history = []
  saveHistory([])
  clearAllCaches()
  console.log('🗑️ 下载缓存已清空')
  return { success: true, message: '下载缓存已清空' }
})

// ==================== 获取图片详情（用于预览）- 已携带 API Key ====================
ipcMain.handle('fetch-image-detail', async (event, imageId) => {
  const config = global.config || {}
  const apiKey = config.apiKey || ''
  
  let url = `https://wallhaven.cc/api/v1/w/${imageId}`
  if (apiKey) {
    url += `?apikey=${apiKey}`
  }
  console.log(`📡 预览请求: ${url}`)
  
  const data = await request(url)
  return data
})
// ==================== 结束 ====================

// ==================== yande.re 数据获取（纯网页抓取，无 API 兜底） ====================
// 原理：直接请求 popular_recent/popular_by_day/popular_by_week/popular_by_month/latest 页面并解析 HTML
// URL 规律（已验证，与浏览器地址栏一致）：
//   popular_recent:  无参数（前24小时）
//   popular_by_day:  无参数=今天；指定日 ?day=X&month=X&year=X
//   popular_by_week: 无参数=本周；指定周 ?day=该周周一&month=X&year=X（day 必须是周一）
//   popular_by_month:无参数=本月；指定月 ?month=X&year=X（忽略 day）
//   latest:          ?page=N（网站全图列表，按页浏览，与 popular 页同款 HTML 结构）
ipcMain.handle('fetch-yandere-posts', async (event, tags, page = 1, limit = 100) => {
  try {
    const yandereConfig = global.config?.yandere || {}
    const baseUrl = yandereConfig.baseUrl || 'https://yande.re'
    const useProxy = yandereConfig.useProxy ?? true
    const proxyPort = yandereConfig.proxyPort || 7890

    const requestConfig = {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': `${baseUrl}/`
      }
    }
    if (useProxy) {
      requestConfig.proxy = { protocol: 'http', host: '127.0.0.1', port: proxyPort }
      console.log(`🌐 yande.re 网页抓取使用代理: http://127.0.0.1:${proxyPort}`)
    } else {
      console.log('🌐 yande.re 直接连接 (不使用代理)')
    }

    // ===== 解析 tags 参数为页面类型与参数 =====
    // 渲染进程传来的 tags 格式: "type[:value]"
    //   前24小时:  "popular_recent"
    //   按日:      "popular_by_day:2026-08-04"（不传日期=今天）
    //   按周:      "popular_by_week:2026-08-04"（用户选任意一天，主进程转为该周周一）
    //   按月:      "popular_by_month:2026-08-04"（日期只取年/月）
    //   最新:      "latest:123"（值=页码，忽略日期，请求 /post?page=123）
    let [hotType, hotValue] = (tags || '').split(':')

    // 兼容旧协议：day → popular_by_day，week → popular_by_week（防御性映射）
    const TYPE_MAP = { day: 'popular_by_day', week: 'popular_by_week' }
    if (TYPE_MAP[hotType]) {
      console.log(`🔄 兼容旧热门类型 ${hotType} → ${TYPE_MAP[hotType]}`)
      hotType = TYPE_MAP[hotType]
    }

    const VALID_TYPES = ['popular_recent', 'popular_by_day', 'popular_by_week', 'popular_by_month', 'latest']
    if (!VALID_TYPES.includes(hotType)) {
      return { success: false, error: `未知的热门类型: ${hotType}`, images: [] }
    }

    // ===== 构建页面 URL（对齐浏览器地址栏规律） =====
    let popularUrl

    if (hotType === 'latest') {
      // 最新：全图列表页 /post?page=N（忽略日期，值=页码）
      const pageNum = parseInt(hotValue, 10)
      const validPage = !isNaN(pageNum) && pageNum >= 1 ? pageNum : 1
      popularUrl = `${baseUrl}/post?page=${validPage}`
      console.log(`📄 最新: 页 ${validPage}`)
    } else {
      popularUrl = `${baseUrl}/post/${hotType}`
      if (hotValue) {
        const dateObj = new Date(`${hotValue}T00:00:00`)
        if (isNaN(dateObj.getTime())) {
          return { success: false, error: `无效日期: ${hotValue}`, images: [] }
        }

        const y = dateObj.getFullYear()
        const m = dateObj.getMonth() + 1
        let d = dateObj.getDate()

        if (hotType === 'popular_by_month') {
          // 按月：只使用 年/月，忽略 day（与浏览器一致）
          popularUrl += `?month=${m}&year=${y}`
        } else if (hotType === 'popular_by_week') {
          // 按周：day 必须为该周的周一（已验证：本周 8/3 周一、上周 7/27 周一）
          // JS getDay(): 周日=0, 周一=1 ... 周六=6；yande.re 认为周一是一周开始
          let dayOfWeek = dateObj.getDay() // 0=周日
          if (dayOfWeek === 0) dayOfWeek = 7   // 周日按一周第7天处理
          const mondayOffset = dayOfWeek - 1    // 距周一的偏移（周一=0, 周二=1, ..., 周日=6）
          const mondayDate = new Date(dateObj)
          mondayDate.setDate(dateObj.getDate() - mondayOffset)
          popularUrl += `?day=${mondayDate.getDate()}&month=${mondayDate.getMonth() + 1}&year=${mondayDate.getFullYear()}`
          console.log(`📅 按周: 用户选 ${hotValue} → 该周周一 ${mondayDate.getFullYear()}-${mondayDate.getMonth() + 1}-${mondayDate.getDate()}`)
        } else {
          // 按日：直接使用 年/月/日
          popularUrl += `?day=${d}&month=${m}&year=${y}`
        }
      }
    }
    console.log(`📡 yande.re 网页抓取: ${popularUrl}`)

    const response = await axios.get(popularUrl, requestConfig)
    const html = typeof response.data === 'string' ? response.data : ''

    // 解析 HTML：每张图片是一行 Post.register({...}) 内嵌的 JSON 数据（源码已验证）
    // 规律：{"id":..., "file_url":"原图直链", "preview_url":"缩略图", "file_ext":..., "rating":..., "width":..., "height":...}
    //   图片ID   : "id":数字
    //   原图直链  : "file_url":"https://files.yande.re/image/...（真实文件直连）"
    //   缩略图    : "preview_url":"https://assets.yande.re/data/preview/..."
    //   分级/尺寸 : "rating":"s|q|e", "width":..., "height":...
    const images = []
    // 逐行匹配 Post.register({ "id":数字, ... })
    const postPattern = /Post\.register\(\s*(\{[\s\S]*?\})\s*\)/g
    let postMatch
    while ((postMatch = postPattern.exec(html)) !== null) {
      try {
        const post = JSON.parse(postMatch[1])
        const id = String(post.id)
        const fullUrl = post.file_url || ''
        if (!fullUrl || !id) continue

        images.push({
          id: id,
          url: fullUrl,                    // ★ file_url 真实原图直链（浏览器星标下载、IDM 用的就是它）
          thumb: post.preview_url || post.sample_url || '',
          source: 'yandere',
          score: post.score,
          rating: post.rating,
          width: post.width,
          height: post.height,
          fileExt: post.file_ext
        })
        if (images.length >= (limit || 100)) break
      } catch (e) {
        // 单条 JSON 解析失败跳过（不影响其他图片）
      }
    }

    if (images.length === 0) {
      console.error(`❌ yande.re 网页解析失败（${popularUrl}）`)
      return { success: false, error: '网页解析失败，可能页面结构已变化或该日期无数据', images: [] }
    }

    console.log(`📡 yande.re 网页抓取成功，解析出 ${images.length} 张图片 (${hotType}, ${hotValue})`)
    return { success: true, images, source: 'web' }
  } catch (error) {
    console.error(`❌ yande.re 热门数据获取失败:`, error.message)
    return { success: false, error: error.message, images: [] }
  }
})
// ==================== 结束 ====================

// ==================== pixiv 数据获取（网页 JSON 接口，无官方 API） ====================
// tags 协议："ranking:daily|weekly|monthly" 或 "search:关键词"
// 原理：
//   1) 排行榜：/ranking.php?mode=daily&format=json&p=N（公开 JSON，一般无需登录）
//   2) 搜索：/ajax/search/artworks/{kw}?word=...&p=N（多数需要 cookie）
//   JSON 里给的是缩略图 URL，原图直链可按路径规则推导：
//     缩略图 .../c/240x480/img-master/img/.../{id}_p0_master1200.jpg
//     原图   https://i.pximg.net/img-original/img/.../{id}_p0.jpg
function derivePixivOriginalUrl(thumbUrl) {
  if (!thumbUrl || typeof thumbUrl !== 'string') return ''
  const m = thumbUrl.match(/\/img-master\/(.+)_master1200\.(jpg|png|gif|jpeg)/i)
  if (m) {
    return `https://i.pximg.net/img-original/${m[1]}.${m[2]}`
  }
  return ''
}

ipcMain.handle('fetch-pixiv-posts', async (event, tags, page = 1, limit = 100) => {
  try {
    const pixivConfig = global.config?.pixiv || {}
    const baseUrl = pixivConfig.baseUrl || 'https://www.pixiv.net'

    const parts = (tags || '').split(':')
    const rawType = parts[0] || ''
    // ranking 使用 "ranking:mode:date"（date 可选，格式 YYYYMMDD）
    // search  使用 "search:关键词"（关键词可能含冒号，故用 join 还原）
    const value = rawType === 'ranking' ? (parts[1] || '') : parts.slice(1).join(':')
    const rankingDate = rawType === 'ranking' ? (parts[2] || '') : ''
    const pageNum = Math.max(1, Number(page) || 1)

    // 支持的排行榜模式（含 _r18 限制级榜单）
    // ⚠️ 必须与前端 components/TypeTabs.jsx 的 PIXIV_TABS 保持同步：
    //    不在此白名单里的 mode 会被替换成 pixivConfig.rankingMode（默认 daily），
    //    表现就是"点了某个榜单却显示日榜"（新增 daily_ai 时就踩过这个坑）
    const RANKING_MODES = [
      'daily', 'weekly', 'monthly', 'rookie', 'original', 'male', 'female',
      'daily_r18', 'weekly_r18', 'monthly_r18', 'male_r18', 'female_r18',
      'daily_ai', 'daily_r18_ai'
    ]

    let rawItems = []
    let usedMode = 'ranking'
    if (rawType === 'search') {
      // 关键词搜索（pixiv 网页 ajax 接口）
      usedMode = 'search'
      // 关键词去掉首尾空白，避免把空格带进 URL 导致搜不到结果
      const keyword = encodeURIComponent((value || '').trim())
      const listUrl = `${baseUrl}/ajax/search/artworks/${keyword}?word=${keyword}&order=date_d&mode=all&p=${pageNum}&s_mode=s_tag&type=all`
      console.log(`🎨 pixiv 搜索: ${listUrl}`)
      const data = await pixivGet(listUrl)
      // 注意：新版 pixiv 搜索接口把"插画+漫画"合并到了 body.illustManga.data
      //（旧版为 body.illust.data，这里两种都兼容）
      const illusts =
        (data && data.body && data.body.illustManga && data.body.illustManga.data) ||
        (data && data.body && data.body.illust && data.body.illust.data) ||
        []
      rawItems = illusts.map(it => ({
        id: String(it.id),
        thumb: it.url || '',
        title: it.title || '',
        author: it.userName || '',
        userId: it.userId ? String(it.userId) : '',
        pageCount: it.pageCount || 1,
        width: it.width,
        height: it.height,
        xRestrict: it.xRestrict || 0,
        aiType: it.aiType || 0
      }))
    } else if (rawType === 'discovery') {
      // 推荐（发现）流
      usedMode = 'discovery'
      console.log(`🎨 pixiv 推荐流: page=${pageNum}`)
      rawItems = await getDiscovery(pageNum)
    } else if (rawType === 'follow') {
      // 关注画师的最新作品（需要登录）
      usedMode = 'follow'
      console.log(`🎨 pixiv 关注流: page=${pageNum}`)
      rawItems = await getFollowLatest(pageNum, Math.min(limit || 100, 24))
    } else {
      // 排行榜（支持 daily_r18 / weekly_r18 / monthly_r18 等限制级榜单）
      usedMode = RANKING_MODES.includes(value) ? value : (pixivConfig.rankingMode || 'daily')
      console.log(`🎨 pixiv 排行榜: mode=${usedMode} page=${pageNum}`)
      rawItems = await getRanking(usedMode, pageNum, rankingDate)
    }

    // 缩略图直接使用 i.pximg.net 原始地址（由会话注入 Referer 并走会话代理，
    // 从而走 Chromium 网络栈、享受 HTTP/2 与磁盘缓存）；
    // 原图地址不在这里给，而是在预览/下载/生成链接时按需调用官方接口
    // （/ajax/illust/{id}/pages）获取，保证地址真实且支持多页
    const images = rawItems.slice(0, limit || 100).map(it => ({
      id: it.id,
      url: '',                 // 原图直链留空，按需通过 fetch-pixiv-pages 获取
      thumb: it.thumb || '',   // 直连 i.pximg.net（走 Chromium 网络栈，主进程已注入 Referer + 分流代理）
      preview: '',
      source: 'pixiv',
      title: it.title,
      author: it.author || '',
      userId: it.userId || '',
      pageCount: it.pageCount || 1,
      width: it.width,
      height: it.height,
      xRestrict: it.xRestrict || 0,   // 0=全年龄 1=R18 2=R18G
      aiType: it.aiType || 0          // 1=非AI 2=AI生成
    }))

    if (images.length === 0) {
      console.error(`pixiv 解析失败（mode=${usedMode}）`)
      return { success: false, error: '未获取到 Pixiv 数据（可能需要登录，或该榜单当前无内容）', images: [] }
    }

    console.log(`🎨 pixiv 抓取成功，共 ${images.length} 张 (${rawType}, ${value})`)
    return { success: true, images, source: 'api' }
  } catch (error) {
    console.error('pixiv 数据获取失败:', error.message)
    return { success: false, error: error.message, images: [] }
  }
})

// ==================== pixiv 官方接口：真实原图地址 / 作品详情 ====================
// 取作品每一页的真实原图地址（预览、下载、IDM 链接都用它，保证地址真实且支持多页）
ipcMain.handle('fetch-pixiv-pages', async (event, illustId) => {
  try {
    const pages = await getIllustPages(illustId)
    return { success: true, pages }
  } catch (e) {
    console.error(`pixiv 取页失败 ${illustId}:`, e.message)
    return { success: false, error: e.message, pages: [] }
  }
})

// 取作品详情（分级 xRestrict、标签、作者、真实原图）
ipcMain.handle('fetch-pixiv-detail', async (event, illustId) => {
  try {
    const detail = await getIllustDetail(illustId)
    if (!detail) return { success: false, error: '未获取到作品详情' }
    return { success: true, detail }
  } catch (e) {
    console.error(`pixiv 取详情失败 ${illustId}:`, e.message)
    return { success: false, error: e.message }
  }
})

// 关注 / 取消关注画师（需要登录）
ipcMain.handle('pixiv-follow-user', async (event, userId, follow = true) => {
  try {
    const data = await setFollowUser(userId, follow)
    return { success: true, data }
  } catch (e) {
    console.error(`pixiv 关注失败 ${userId}:`, e.message)
    return { success: false, error: e.message }
  }
})

// 批量收集多个作品的原图直链（并发，带进度推送）
ipcMain.handle('pixiv-collect-links', async (event, ids) => {
  try {
    const urls = await collectIllustUrls(ids, 8, (done, total) => {
      try { event.sender.send('pixiv-links-progress', { done, total }) } catch (e) {}
    })
    return { success: true, urls }
  } catch (e) {
    console.error('pixiv 批量取直链失败:', e.message)
    return { success: false, error: e.message, urls: [] }
  }
})

// 用系统默认浏览器打开链接（如 pixiv 作者主页）
ipcMain.handle('open-external', async (event, url) => {
  try {
    if (!url || typeof url !== 'string') return { success: false, error: '无效链接' }
    // 安全：只允许 http/https，避免 file://、自定义协议等被意外打开
    let parsed = null
    try { parsed = new URL(url) } catch (e) { return { success: false, error: '无效链接' } }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { success: false, error: '仅支持 http/https 链接' }
    }
    await shell.openExternal(url)
    return { success: true }
  } catch (e) {
    console.error('打开外部链接失败:', e.message)
    return { success: false, error: e.message }
  }
})

// 直接下载指定的 pixiv 图片 URL 列表（作品详情页里选中的页）
ipcMain.handle('pixiv-download-pages', async (event, urls, downloadDir) => {
  try {
    if (!downloadDir) return { success: false, error: '未设置 pixiv 下载目录' }
    downloadCancelFlag = false
    const sendProgress = createProgressSender()
    const result = await pixivDownloadUrls(urls, downloadDir, sendProgress, isDownloadCancelled)
    saveHistory(global.history)
    return { success: true, result }
  } catch (e) {
    console.error('pixiv 指定页下载失败:', e.message)
    return { success: false, error: e.message }
  }
})
// ==================== 结束 ====================

