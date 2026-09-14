// src/main/pixivDownloadManager.js
// Pixiv 专用下载管理器（与 wallhaven / yande.re 完全隔离）
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import pLimit from 'p-limit'
import { createProxyAgent } from './proxyHelper'
import { getIllustPages } from './pixivApi'

// 每张图下载后的间隔（防反爬）：从 1000ms 降到 300ms，明显提升批量下载吞吐
const DEFAULT_DELAY_MS = 300
const DEFAULT_MAX_RETRIES = 3
const DOWNLOAD_TIMEOUT_MS = 300000
// i.pximg.net 强制校验 Referer，否则返回 403
const PIXIV_REFERER = 'https://www.pixiv.net/'

// 取 pixiv 独立代理（从 pixiv 子配置读取，与另两站隔离）
function getPixivProxyAgent() {
  const pixivConfig = global.config?.pixiv || {}
  const useProxy = pixivConfig.useProxy ?? true
  const proxyPort = pixivConfig.proxyPort || 7890
  return createProxyAgent(useProxy, proxyPort)
}

// 取 pixiv 登录 Cookie（下载受限内容必需；由"登录 pixiv"功能自动写入）
function getPixivCookie() {
  const pixivConfig = global.config?.pixiv || {}
  return pixivConfig.cookie || ''
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 下载单个文件到指定路径（带取消检查 + 重试）
async function downloadFileToPath(url, filePath, onProgress, isCancelled) {
  const label = path.basename(filePath)
  if (fs.existsSync(filePath)) {
    onProgress(100, true)
    return { skipped: true }
  }

  const agent = getPixivProxyAgent()
  const pixivCookie = getPixivCookie()
  let lastError = null

  for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
    if (isCancelled && isCancelled()) throw new Error('CANCELLED')

    try {
      if (attempt > 0) {
        await sleep(1500)
        if (isCancelled && isCancelled()) throw new Error('CANCELLED')
        console.log(`🔄 pixiv 重试 ${label} (第${attempt}次)`)
      }

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxRedirects: 5,
        httpsAgent: agent || undefined,
        ...(agent ? {} : { proxy: false }),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': PIXIV_REFERER,
          ...(pixivCookie ? { 'Cookie': pixivCookie } : {}),
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      })

      const totalLength = response.headers['content-length']
      let downloadedLength = 0
      let lastProgress = 0

      response.data.on('data', (chunk) => {
        if (isCancelled && isCancelled()) {
          response.data.destroy()
          return
        }
        downloadedLength += chunk.length
        if (totalLength) {
          const progress = (downloadedLength / totalLength) * 100
          if (progress - lastProgress >= 5) {
            lastProgress = progress
            onProgress(progress, false)
          }
        }
      })

      const writer = createWriteStream(filePath)
      await pipeline(response.data, writer)
      if (isCancelled && isCancelled()) throw new Error('CANCELLED')
      onProgress(100, false)

      return { skipped: false }
    } catch (error) {
      if (error?.message === 'CANCELLED') {
        if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath) } catch (e) {} }
        throw error
      }
      lastError = error
      const status = error.response?.status
      console.error(`pixiv 下载失败 ${label} (第${attempt + 1}次):`, error.message, status ? `HTTP ${status}` : '')
      if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath) } catch (e) {} }
      if (status === 429) {
        await sleep(15000)
      } else if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || /aborted|premature close/i.test(error?.message || '')) {
        console.log(`🌐 网络波动，${label} 等待 3 秒后重试...`)
        await sleep(3000)
      }
    }
  }

  throw lastError || new Error('下载失败')
}

// 下载一个作品（可能是多页）：
// 先用官方接口 /ajax/illust/{id}/pages 获取每页真实原图地址，再逐页下载
async function downloadPixivIllust(illustId, saveDir, onProgress, isCancelled) {
  const pages = await getIllustPages(illustId)
  if (!pages || pages.length === 0) {
    throw new Error('未获取到图片地址（可能需要登录，或该作品不可见）')
  }

  const total = pages.length
  let skippedPages = 0

  for (let i = 0; i < total; i++) {
    if (isCancelled && isCancelled()) throw new Error('CANCELLED')
    const p = pages[i]
    const clean = String(p.url).split('?')[0]
    const ext = path.extname(clean) || '.jpg'
    // 多页作品命名为 {id}_p{n}.{ext}，单页为 {id}.{ext}
    const fileName = total > 1 ? `${illustId}_p${p.page}${ext}` : `${illustId}${ext}`
    const filePath = path.join(saveDir, fileName)

    const res = await downloadFileToPath(p.url, filePath, (prog) => {
      const overall = ((i + prog / 100) / total) * 100
      onProgress(Math.min(99, overall), false)
    }, isCancelled)
    if (res && res.skipped) skippedPages++
  }

  onProgress(100, skippedPages === total)
  return { success: true, skipped: skippedPages === total, pages: total }
}

// 取并发数（从 pixiv 配置读取，默认 6）
function getPixivConcurrency() {
  const pixivConfig = global.config?.pixiv || {}
  return pixivConfig.concurrency || 6
}

// Pixiv 下载管理器（多并发 + 可取消）
export async function pixivDownloadManager(imageIds, downloadDir, concurrency, progressCallback, imageData, isCancelled) {
  // 构建 id -> url 映射表
  const urlMap = {}
  if (imageData) {
    for (const item of imageData) {
      urlMap[item.id] = item.url
    }
  }

  const results = {
    total: imageIds.length,
    completed: 0,
    skipped: 0,
    failed: 0,
    cancelled: 0,
    details: []
  }

  // 下载历史去重
  const historySet = new Set(global.history || [])
  const toDownload = []
  const skippedIds = []

  for (const id of imageIds) {
    if (historySet.has(id)) {
      skippedIds.push(id)
      results.skipped++
      results.completed++
      progressCallback({ type: 'item', id, status: 'skipped', progress: 100, completed: results.completed, total: results.total })
    } else {
      toDownload.push(id)
    }
  }

  // 多并发下载（并发数从配置读取，默认 3，范围 1-6）
  const effectiveConcurrency = Math.max(1, Math.min(12, Number(concurrency) || getPixivConcurrency() || 6))
  console.log(`🎨 pixiv 多并发下载启动，并发=${effectiveConcurrency}，共 ${toDownload.length} 张`)
  const limit = pLimit(effectiveConcurrency)

  const tasks = toDownload.map(id =>
    limit(async () => {
      if (isCancelled && isCancelled()) {
        results.cancelled++
        results.completed++
        progressCallback({ type: 'item', id, status: 'cancelled', completed: results.completed, total: results.total })
        return { id, success: false, cancelled: true }
      }

      try {
        progressCallback({ type: 'item', id, status: 'downloading', progress: 0, completed: results.completed, total: results.total })

        const downloadResult = await downloadPixivIllust(id, downloadDir, (progress, skipped) => {
          progressCallback({ type: 'progress', id, progress, completed: results.completed, total: results.total })
        }, isCancelled)

        if (downloadResult.success && !downloadResult.skipped) {
          global.history.push(id)
          results.details.push({ id, success: true })
        } else if (downloadResult.skipped) {
          results.details.push({ id, success: true, skipped: true })
        }

        results.completed++
        progressCallback({ type: 'item', id, status: 'completed', progress: 100, completed: results.completed, total: results.total })
        return { id, success: true }
      } catch (error) {
        if (error?.message === 'CANCELLED') {
          results.cancelled++
          results.completed++
          progressCallback({ type: 'item', id, status: 'cancelled', completed: results.completed, total: results.total })
          return { id, success: false, cancelled: true }
        }
        results.failed++
        results.completed++
        results.details.push({ id, success: false, error: error.message })
        progressCallback({ type: 'item', id, status: 'failed', error: error.message, completed: results.completed, total: results.total })
        return { id, success: false, error: error.message }
      } finally {
        // 每张下载完短暂间隔，防反爬
        await sleep(DEFAULT_DELAY_MS)
      }
    })
  )

  await Promise.allSettled(tasks)

  for (const id of skippedIds) {
    results.details.push({ id, success: true, skipped: true })
  }

  progressCallback({
    type: 'complete',
    total: results.total,
    completed: results.completed,
    skipped: results.skipped,
    failed: results.failed,
    cancelled: results.cancelled
  })

  return results
}

// 直接下载给定的图片 URL 列表（用于"作品详情页里选中的页"）
export async function pixivDownloadUrls(urls, saveDir, progressCallback, isCancelled) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : []
  const results = { total: list.length, completed: 0, skipped: 0, failed: 0, cancelled: 0 }

  for (let i = 0; i < list.length; i++) {
    const url = list[i]
    const name = decodeURIComponent(String(url).split('?')[0].split('/').pop()) || `pixiv_page_${i}.jpg`
    const filePath = path.join(saveDir, name)

    if (isCancelled && isCancelled()) {
      results.cancelled++
      results.completed++
      progressCallback({ type: 'item', id: name, status: 'cancelled', completed: results.completed, total: results.total })
      continue
    }

    progressCallback({ type: 'item', id: name, status: 'downloading', progress: 0, completed: results.completed, total: results.total })
    try {
      const res = await downloadFileToPath(url, filePath, (prog) => {
        progressCallback({ type: 'progress', id: name, progress: prog, completed: results.completed, total: results.total })
      }, isCancelled)
      if (res && res.skipped) results.skipped++
      results.completed++
      progressCallback({ type: 'item', id: name, status: 'completed', progress: 100, completed: results.completed, total: results.total })
    } catch (e) {
      if (e && e.message === 'CANCELLED') {
        results.cancelled++
        results.completed++
        progressCallback({ type: 'item', id: name, status: 'cancelled', completed: results.completed, total: results.total })
      } else {
        results.failed++
        results.completed++
        progressCallback({ type: 'item', id: name, status: 'failed', error: e.message, completed: results.completed, total: results.total })
      }
    }

    await sleep(DEFAULT_DELAY_MS)
  }

  progressCallback({
    type: 'complete',
    total: results.total,
    completed: results.completed,
    skipped: results.skipped,
    failed: results.failed,
    cancelled: results.cancelled
  })

  return results
}

