// src/main/yandereDownloadManager.js
// yande.re 专用下载管理器
// 已优化：支持多并发下载（网站未严格限制）+ 可取消（无需关闭软件）
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { HttpsProxyAgent } from 'https-proxy-agent'
import pLimit from 'p-limit'

// 下载间隔（毫秒）—— 反爬友好，避免 429（从 2000ms 降到 800ms 提升吞吐）
const DEFAULT_DELAY_MS = 800
// 每张图最大重试次数
const DEFAULT_MAX_RETRIES = 3
// 下载超时：5 分钟（大图 + 慢速网络下 60 秒容易误判超时）
const DOWNLOAD_TIMEOUT_MS = 300000

// 获取 yande.re 独立代理（从 yandere 子配置读取，与 wallhaven 隔离）
// 使用 HttpsProxyAgent 方式（已验证可稳定下载 file_url 直链）
function getYandereProxyAgent() {
  const yandereConfig = global.config?.yandere || {}
  const useProxy = yandereConfig.useProxy ?? true
  const proxyPort = yandereConfig.proxyPort || 7890
  if (useProxy) {
    const proxyUrl = `http://127.0.0.1:${proxyPort}`
    console.log(`🌐 yande.re 下载使用代理: ${proxyUrl}`)
    return new HttpsProxyAgent(proxyUrl)
  }
  return null
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 下载单个文件（带取消检查）
async function downloadYandereImage(id, url, saveDir, onProgress, isCancelled) {
  const ext = path.extname(url) || '.jpg'
  const filePath = path.join(saveDir, `${id}${ext}`)

  if (fs.existsSync(filePath)) {
    onProgress(100, true)
    return { id, success: true, skipped: true, path: filePath }
  }

  const agent = getYandereProxyAgent()
  let lastError = null

  for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
    if (isCancelled && isCancelled()) {
      throw new Error('CANCELLED')
    }

    try {
      if (attempt > 0) {
        await sleep(1500)
        if (isCancelled && isCancelled()) throw new Error('CANCELLED')
        console.log(`🔄 yande.re 重试 ${id} (第${attempt}次)`)
      }

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: DOWNLOAD_TIMEOUT_MS,
        // 慢速网络下加大请求头/首字节等待（避免大图超时误判）
        maxRedirects: 5,
        httpsAgent: agent || undefined,
        ...(agent ? {} : { proxy: false }),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://yande.re/',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      })

      const totalLength = response.headers['content-length']
      let downloadedLength = 0
      let lastProgress = 0

      response.data.on('data', (chunk) => {
        if (isCancelled && isCancelled()) {
          // 取消时中断流
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

      return { id, success: true, skipped: false, path: filePath }
    } catch (error) {
      if (error?.message === 'CANCELLED') {
        // 取消：清理残留文件并抛出取消错误
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath) } catch (e) {}
        }
        throw error
      }
      lastError = error
      const status = error.response?.status
      console.error(`yande.re 下载失败 ${id} (第${attempt + 1}次):`, error.message, status ? `HTTP ${status}` : '')
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath) } catch (e) {}
      }
      // 429（被限流）时额外等待更久
      if (status === 429) {
        await sleep(15000)
      } else if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || /aborted|premature close/i.test(error?.message || '')) {
        // 网络中断/超时类错误：多为网络波动而非程序错误，重试前多等 3 秒
        console.log(`🌐 网络波动，${id} 等待 3 秒后重试...`)
        await sleep(3000)
      }
    }
  }

  throw lastError || new Error('下载失败')
}

// 获取单批并发数（从配置读取，默认 6；允许用户调整）
function getYandereConcurrency() {
  const yandereConfig = global.config?.yandere || {}
  return yandereConfig.concurrency || 6
}

// yande.re 下载管理器（多并发 + 可取消）
export async function yandereDownloadManager(imageIds, downloadDir, concurrency, progressCallback, imageData, isCancelled) {
  // 构建 id -> url 的映射表
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
      progressCallback({
        type: 'item',
        id,
        status: 'skipped',
        progress: 100,
        completed: results.completed,
        total: results.total
      })
    } else {
      toDownload.push(id)
    }
  }

  // ===== 多并发下载（网站未严格限制；并发数从配置读取，默认 3） =====
  const effectiveConcurrency = Math.max(1, Math.min(10, Number(concurrency) || getYandereConcurrency() || 6))
  console.log(`🎌 yande.re 多并发下载启动，并发=${effectiveConcurrency}，共 ${toDownload.length} 张`)
  const limit = pLimit(effectiveConcurrency)

  const tasks = toDownload.map(id =>
    limit(async () => {
      if (isCancelled && isCancelled()) {
        results.cancelled++
        results.completed++
        progressCallback({
          type: 'item',
          id,
          status: 'cancelled',
          completed: results.completed,
          total: results.total
        })
        return { id, success: false, cancelled: true }
      }

      try {
        const imageUrl = urlMap[id]
        if (!imageUrl) {
          throw new Error(`未知的图片 URL: ${id}`)
        }

        progressCallback({
          type: 'item',
          id,
          status: 'downloading',
          progress: 0,
          completed: results.completed,
          total: results.total
        })

        const downloadResult = await downloadYandereImage(id, imageUrl, downloadDir, (progress, skipped) => {
          progressCallback({
            type: 'progress',
            id,
            progress,
            completed: results.completed,
            total: results.total
          })
        }, isCancelled)

        if (downloadResult.success && !downloadResult.skipped) {
          global.history.push(id)
          results.details.push({ id, success: true })
        } else if (downloadResult.skipped) {
          results.details.push({ id, success: true, skipped: true })
        }

        results.completed++
        progressCallback({
          type: 'item',
          id,
          status: 'completed',
          progress: 100,
          completed: results.completed,
          total: results.total
        })
        return { id, success: true }
      } catch (error) {
        if (error?.message === 'CANCELLED') {
          results.cancelled++
          results.completed++
          progressCallback({
            type: 'item',
            id,
            status: 'cancelled',
            completed: results.completed,
            total: results.total
          })
          return { id, success: false, cancelled: true }
        }
        results.failed++
        results.completed++
        results.details.push({ id, success: false, error: error.message })
        progressCallback({
          type: 'item',
          id,
          status: 'failed',
          error: error.message,
          completed: results.completed,
          total: results.total
        })
        return { id, success: false, error: error.message }
      } finally {
        // 每张下载完成后短暂间隔，防反爬
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