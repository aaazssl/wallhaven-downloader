// src/main/store.js
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

// 惰性获取用户数据目录（避免模块加载时就访问 electron.app 导致启动错误）
function getUserDataPath() {
  return app.getPath('userData')
}

function getHistoryFile() {
  return path.join(getUserDataPath(), 'history.json')
}

function getConfigFile() {
  return path.join(getUserDataPath(), 'config.json')
}

export function loadHistory() {
  try {
    const file = getHistoryFile()
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('加载历史记录失败:', error)
  }
  return []
}

// 历史记录写盘防抖：下载过程中 saveHistory 会被高频调用（每张图完成一次），
// 每次都同步写整份文件会阻塞主进程（history 很大时尤其明显），
// 这里合并为"最多每 800ms 写一次"，并在退出前用 flushHistory() 强制落盘
let historySaveTimer = null
let pendingHistory = null

function writeHistoryNow(history) {
  try {
    fs.writeFileSync(getHistoryFile(), JSON.stringify(history, null, 2))
  } catch (error) {
    console.error('保存历史记录失败:', error)
  }
}

export function saveHistory(history) {
  pendingHistory = history
  if (historySaveTimer) return
  historySaveTimer = setTimeout(() => {
    historySaveTimer = null
    const data = pendingHistory
    pendingHistory = null
    if (data) writeHistoryNow(data)
  }, 800)
}

// 退出前强制落盘（避免防抖窗口内的数据丢失）
export function flushHistory() {
  if (historySaveTimer) {
    clearTimeout(historySaveTimer)
    historySaveTimer = null
  }
  if (pendingHistory) {
    writeHistoryNow(pendingHistory)
    pendingHistory = null
  }
}

// yande.re 独立配置默认值（与 wallhaven 配置完全隔离）
const defaultYandereConfig = {
  baseUrl: 'https://yande.re',
  useProxy: true,
  proxyPort: 7890,
  // yande.re 已支持多并发（默认 6，网站未严格限制）
  concurrency: 6,
  limit: 100,
  // 新增：yande.re 独立下载目录
  downloadDir: null,
}

// pixiv 独立配置默认值（与 wallhaven / yande.re 完全隔离）
const defaultPixivConfig = {
  baseUrl: 'https://www.pixiv.net',
  useProxy: true,
  proxyPort: 7890,
  concurrency: 6,
  limit: 100,
  // Pixiv 多数内容需登录态：填写登录后的 PHPSESSID
  cookie: '',
  // 排行榜模式：daily / weekly / monthly
  rankingMode: 'daily',
  // 新增：pixiv 独立下载目录
  downloadDir: null,
  // ⚠️ 命名别搞混：三站的"分级/过滤"用的不是同一套字段
  //    · pixiv  ：showR18 / showAI（本对象）↔ 接口字段 xRestrict(0/1/2) / aiType(1=非AI,2=AI)
  //    · wallhaven：purityFlags（顶层）+ 旧字段 purity('100'，仅兼容）
  //    · yande.re：无分级过滤
  // 显示过滤开关（客户端过滤；配合 pixiv 官网账号设置一起生效）
  showR18: true,
  showAI: true,
  // 主界面顶部显示的标签（可在 设置 → pixiv 里勾选，持久保存）
  visibleTabs: ['daily', 'weekly', 'monthly'],
  // 作品详情页"查看大图"时的预加载数量（向后多、向前少，因为多数是往后翻页）
  preloadForward: 4,
  preloadBackward: 1,
  // 查看大图的画质：auto=先中等图再无缝换原图 / regular=只看中等图 / original=直接原图
  previewQuality: 'auto',
}

export function loadConfig() {
  const defaultConfig = {
    apiKey: '',
    concurrency: 16,
    // Wallhaven 下载目录（三站各自独立，yande.re/pixiv 在各自子配置内）
    downloadDir: null,
    purity: '100',
    topRange: '1M',
    // 全局代理（作用于三站，保存时会同步写入 yandere/pixiv 子配置）
    useProxy: true,
    proxyPort: 12450,
    // 新增：默认打开的图片来源
    defaultSource: 'wallhaven',
    // 硬件加速（GPU）开关：默认关闭（软件渲染兼容性最好），可在系统设置里开启
    hardwareAcceleration: false,
    purityFlags: { sfw: true, sketchy: false, nsfw: false },
    yandere: { ...defaultYandereConfig },
    // 新增：pixiv 独立子配置
    pixiv: { ...defaultPixivConfig }
  }
  try {
    const file = getConfigFile()
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      // 深度合并：保留用户已有配置，yandere/pixiv 缺失字段自动补默认值
      return {
        ...defaultConfig,
        ...data,
        yandere: { ...defaultYandereConfig, ...(data.yandere || {}) },
        // 新增：pixiv 深度合并（不影响原有字段）
        pixiv: { ...defaultPixivConfig, ...(data.pixiv || {}) }
      }
    }
  } catch (error) {
    console.error('加载配置失败:', error)
  }
  return defaultConfig
}

export function saveConfig(config) {
  try {
    fs.writeFileSync(getConfigFile(), JSON.stringify(config, null, 2))
  } catch (error) {
    console.error('保存配置失败:', error)
  }
}