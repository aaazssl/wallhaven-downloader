// src/main/proxyHelper.js
// Pixiv 专用代理辅助函数（与 wallhaven / yande.re 的代理实现相互独立）
import { HttpsProxyAgent } from 'https-proxy-agent'

// 根据配置生成代理 agent；未启用代理时返回 null
// @param {boolean} useProxy 是否启用代理
// @param {number} proxyPort 代理端口（默认 7890）
// @returns {HttpsProxyAgent|null}
// 代理 agent 缓存：同一个代理端口复用同一个 HttpsProxyAgent，
// 这样底层连接才能被 keep-alive 复用（否则每张图都要重新 TCP+TLS 握手，速度差很多）
const agentCache = new Map()

export function createProxyAgent(useProxy, proxyPort) {
  if (!useProxy) return null
  const port = proxyPort || 7890
  const proxyUrl = `http://127.0.0.1:${port}`
  if (!agentCache.has(proxyUrl)) {
    console.log(`🌐 创建可复用代理连接: ${proxyUrl}`)
    agentCache.set(proxyUrl, new HttpsProxyAgent(proxyUrl, { keepAlive: true }))
  }
  return agentCache.get(proxyUrl)
}
