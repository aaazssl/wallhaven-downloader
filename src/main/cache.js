// src/main/cache.js
// 统一的轻量缓存（TTL + LRU 淘汰），供主进程各处复用，避免"每个模块自己维护一套 Map"。
// 提供 clearAllCaches()，用于：清理下载缓存、删除下载、重新登录（换账号）等场景，
// 防止"换了账号仍命中旧账号缓存"这类隐蔽问题。

export class TTLCache {
  constructor(maxSize = 500, ttlMs = 30 * 60 * 1000) {
    this.maxSize = maxSize
    this.ttlMs = ttlMs
    this.map = new Map()
    this.hits = 0
    this.misses = 0
  }

  // 取缓存（会刷新 LRU 位置并统计命中）
  get(key) {
    const k = String(key)
    const hit = this.map.get(k)
    if (!hit || Date.now() - hit.time >= this.ttlMs) {
      if (hit) this.map.delete(k)
      this.misses++
      return undefined
    }
    // LRU：命中后移到末尾
    this.map.delete(k)
    this.map.set(k, hit)
    this.hits++
    return hit.value
  }

  // 只查看是否命中（不刷新 LRU、不影响统计），用于打印"命中数量"
  peek(key) {
    const hit = this.map.get(String(key))
    if (!hit || Date.now() - hit.time >= this.ttlMs) return undefined
    return hit.value
  }

  set(key, value) {
    const k = String(key)
    this.map.delete(k)
    this.map.set(k, { value, time: Date.now() })
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value
      this.map.delete(oldest)
    }
  }

  clear() {
    this.map.clear()
    this.hits = 0
    this.misses = 0
  }

  get size() {
    return this.map.size
  }

  stats() {
    return { size: this.map.size, hits: this.hits, misses: this.misses }
  }
}

// ===== 全局缓存实例（集中管理，便于整体清理与观测）=====
// 作品"每页原图地址"（生成直链/详情页会用到）
export const pagesCache = new TTLCache(800, 30 * 60 * 1000)
// 作品详情（"我的关注"补齐信息会用到）
export const illustDetailCache = new TTLCache(800, 30 * 60 * 1000)

export function clearAllCaches() {
  pagesCache.clear()
  illustDetailCache.clear()
  console.log('🧹 已清空作品/图片接口缓存')
}
