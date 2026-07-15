// src/main/downloadManager.js
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import pLimit from 'p-limit'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'

// 获取图片详情（原图URL）
async function fetchImageDetails(id, apiKey) {
  try {
    const url = `https://wallhaven.cc/api/v1/w/${id}`
    const response = await axios.get(url, {
      params: apiKey ? { apikey: apiKey } : {},
      timeout: 10000
    })
    if (response.data && response.data.data) {
      return {
        id: id,
        url: response.data.data.path,
        ext: path.extname(response.data.data.path) || '.jpg'
      }
    }
    throw new Error('Invalid response')
  } catch (error) {
    console.error(`获取图片详情失败 ${id}:`, error.message)
    throw error
  }
}

// 下载单个文件
async function downloadImage(detail, saveDir, onProgress) {
  const { id, url, ext } = detail
  const filePath = path.join(saveDir, `${id}${ext}`)
  
  // 检查是否已存在
  if (fs.existsSync(filePath)) {
    onProgress(100, true) // 100% 且跳过
    return { id, success: true, skipped: true, path: filePath }
  }
  
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    const totalLength = response.headers['content-length']
    let downloadedLength = 0
    let lastProgress = 0
    
    response.data.on('data', (chunk) => {
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
    onProgress(100, false)
    return { id, success: true, skipped: false, path: filePath }
  } catch (error) {
    console.error(`下载失败 ${id}:`, error.message)
    // 删除不完整的文件
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    throw error
  }
}

export async function downloadManager(imageIds, downloadDir, concurrency, progressCallback) {
  const results = {
    total: imageIds.length,
    completed: 0,
    skipped: 0,
    failed: 0,
    details: []
  }
  
  const limit = pLimit(Math.min(concurrency, 16, Math.max(8, concurrency)))
  const apiKey = global.config?.apiKey || ''
  
  // 过滤已下载的历史记录
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
  
  // 并发下载未下载的图片
  const tasks = toDownload.map(id => 
    limit(async () => {
      try {
        // 获取原图URL
        const detail = await fetchImageDetails(id, apiKey)
        // 更新全局进度 - 开始
        progressCallback({
          type: 'item',
          id,
          status: 'downloading',
          progress: 0,
          completed: results.completed,
          total: results.total
        })
        
        // 下载文件，传入进度回调
        const downloadResult = await downloadImage(detail, downloadDir, (progress, skipped) => {
          progressCallback({
            type: 'progress',
            id,
            progress,
            completed: results.completed,
            total: results.total
          })
        })
        
        if (downloadResult.success && !downloadResult.skipped) {
          // 记录到历史
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
      }
    })
  )
  
  await Promise.allSettled(tasks)
  
  // 添加跳过的图片到详情
  for (const id of skippedIds) {
    results.details.push({ id, success: true, skipped: true })
  }
  
  progressCallback({
    type: 'complete',
    total: results.total,
    completed: results.completed,
    skipped: results.skipped,
    failed: results.failed
  })
  
  return results
}