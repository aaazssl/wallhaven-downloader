// src/main/pixivApi.js
// pixiv 官方网页接口封装（JSON 接口，替代原来的 HTML 正则解析）
// 关键接口（实测匿名即可用，登录后可访问受限内容）：
//   /ajax/illust/{id}         作品详情：urls.original 真实原图、xRestrict 分级、标签、作者
//   /ajax/illust/{id}/pages   作品每一页的真实原图地址（支持多页作品）
//   /ranking.php?format=json  排行榜（mode: daily / weekly / monthly / *_r18 等）
import axios from 'axios'
import { createProxyAgent } from './proxyHelper'

const PIXIV_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function getPixivSettings() {
  const pixivConfig = global.config?.pixiv || {}

  // 容错：站点地址必须是以 pixiv.net 结尾的 http(s) 地址。
  // 设置页里该字段可被随意修改，改错会导致全部请求失败（用户侧表现为"突然全都用不了"），
  // 因此这里做一次校验，非法就回退到默认值并给出提示。
  let baseUrl = pixivConfig.baseUrl || 'https://www.pixiv.net'
  try {
    const u = new URL(baseUrl)
    const okProtocol = u.protocol === 'http:' || u.protocol === 'https:'
    const okHost = /(^|\.)pixiv\.net$/i.test(u.hostname)
    if (!okProtocol || !okHost) {
      console.warn(`⚠️ pixiv 站点地址非法，已回退默认值：${baseUrl}`)
      baseUrl = 'https://www.pixiv.net'
    }
  } catch (e) {
    console.warn(`⚠️ pixiv 站点地址解析失败，已回退默认值：${baseUrl}`)
    baseUrl = 'https://www.pixiv.net'
  }

  return {
    baseUrl,
    useProxy: pixivConfig.useProxy ?? true,
    proxyPort: pixivConfig.proxyPort || 7890,
    cookie: pixivConfig.cookie || ''
  }
}

// 统一的 pixiv 接口 GET（自动带 Cookie / Referer / 代理）
export async function pixivGet(url, options = {}) {
  const { useProxy, proxyPort, cookie } = getPixivSettings()
  const agent = createProxyAgent(useProxy, proxyPort)
  const resp = await axios.get(url, {
    timeout: options.timeout || 30000,
    responseType: options.responseType || 'json',
    httpsAgent: agent || undefined,
    ...(agent ? {} : { proxy: false }),
    headers: {
      'Referer': 'https://www.pixiv.net/',
      'User-Agent': PIXIV_UA,
      'Accept': 'application/json,text/plain,*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...(cookie ? { 'Cookie': cookie } : {}),
      ...(options.headers || {})
    }
  })
  return resp.data
}

// 作品"每页原图地址"与"作品详情"的缓存统一在 cache.js 里管理（TTL + LRU + 可整体清空）
// 这样"清理下载缓存 / 换账号登录"时能一次性清掉，避免命中旧数据
export { pagesCache, illustDetailCache } from './cache'
import { pagesCache, illustDetailCache } from './cache'

// 获取作品每一页的真实原图地址（多页作品返回多条；带缓存）
export async function getIllustPages(illustId, useCache = true) {
  const key = String(illustId)
  if (useCache) {
    const hit = pagesCache.get(key)
    if (hit) return hit
  }

  const data = await pixivGet(`https://www.pixiv.net/ajax/illust/${illustId}/pages`)
  if (!data || data.error || !Array.isArray(data.body)) return []

  const pages = data.body
    .map((p, i) => ({
      page: i,
      url: (p.urls && (p.urls.original || p.urls.regular)) || '',  // 原图（点击查看全屏大图时用）
      regular: (p.urls && p.urls.regular) || '',                   // 中等尺寸（列表默认显示，加载快）
      small: (p.urls && p.urls.small) || '',
      thumb: (p.urls && (p.urls.thumb_mini || p.urls.small)) || '',
      width: p.width,
      height: p.height
    }))
    .filter(x => x.url)

  pagesCache.set(key, pages)
  return pages
}

// 获取作品详情（真实原图、分级、标签、作者等；带缓存）
export async function getIllustDetail(illustId, useCache = true) {
  const key = String(illustId)
  if (useCache) {
    const hit = illustDetailCache.get(key)
    if (hit) return hit
  }

  const data = await pixivGet(`https://www.pixiv.net/ajax/illust/${illustId}`)
  if (!data || data.error || !data.body) return null
  const b = data.body
  const detail = {
    id: String(b.illustId || b.id),
    title: b.illustTitle || b.title || '',
    xRestrict: b.xRestrict || 0,        // 0=全年龄 1=R18 2=R18G
    aiType: b.aiType || 0,              // 1=非AI 2=AI生成
    illustType: b.illustType,           // 0=插画 1=漫画 2=动图
    userId: b.userId ? String(b.userId) : '',
    userName: b.userName || '',
    userAccount: b.userAccount || '',
    pageCount: b.pageCount || 1,
    tags: ((b.tags && b.tags.tags) || []).map(t => t.tag),
    thumb: (b.urls && (b.urls.thumb || b.urls.mini || b.urls.small)) || '',
    original: (b.urls && b.urls.original) || ''
  }

  illustDetailCache.set(key, detail)
  return detail
}

// 排行榜（mode 支持：daily / weekly / monthly / rookie / original /
//   daily_r18 / weekly_r18 / monthly_r18 / male / female 等）
// date：可选，格式 YYYYMMDD（用于查看历史榜单，例如昨天的日榜）
export async function getRanking(mode, page = 1, date = '') {
  const { baseUrl } = getPixivSettings()
  let url = `${baseUrl}/ranking.php?mode=${encodeURIComponent(mode)}&format=json&p=${page}`
  if (date) url += `&date=${encodeURIComponent(date)}`
  console.log(`🎨 pixiv 排行榜请求: ${url}`)
  const data = await pixivGet(url)
  const contents = (data && data.contents) || []
  // AI 专属榜单（daily_ai / daily_r18_ai）里的作品本身就是 AI 生成的，
  // 而 ranking 接口不返回 aiType，这里直接标记为 2（AI），让卡片能显示 AI 角标
  const isAiRanking = typeof mode === 'string' && mode.endsWith('_ai')

  return contents.map(it => ({
    id: String(it.illust_id),
    thumb: it.url || '',
    title: it.title || '',
    author: it.user_name || '',
    userId: it.user_id ? String(it.user_id) : '',
    pageCount: Number(it.illust_page_count) || 1,
    width: it.width,
    height: it.height,
    rank: it.rank,
    ratingCount: it.rating_count,
    viewCount: it.view_count,
    // ranking 接口没有 xRestrict/aiType，用 illust_content_type.sexual 近似判断限制级
    xRestrict: (it.illust_content_type && it.illust_content_type.sexual) ? 1 : 0,
    aiType: isAiRanking ? 2 : (it.aiType || 0)
  }))
}

// 统一把 ajax 接口返回的作品映射成前端使用的结构
function mapAjaxIllust(it) {
  if (!it) return null
  return {
    id: String(it.id),
    thumb: it.url || '',
    title: it.title || '',
    author: it.userName || '',
    userId: it.userId ? String(it.userId) : '',
    pageCount: it.pageCount || 1,
    width: it.width,
    height: it.height,
    xRestrict: it.xRestrict || 0,      // 0=全年龄 1=R18 2=R18G
    aiType: it.aiType || 0             // 1=非AI 2=AI生成
  }
}

// 发现流（对应官网 /discovery 的"发现"分区，无尽插画流；会结合账号喜好）
// 该接口每页约 30 条，这里一次合并多页让首屏更饱满，配合前端滚动加载即为无尽瀑布流
export async function getDiscovery(page = 1, pagesPerFetch = 3) {
  const start = (Math.max(1, page) - 1) * pagesPerFetch + 1
  const out = []
  for (let i = 0; i < pagesPerFetch; i++) {
    try {
      const data = await pixivGet(`https://www.pixiv.net/ajax/illust/discovery?mode=all&p=${start + i}`)
      const illusts = (data && data.body && data.body.illusts) || []
      out.push(...illusts.map(mapAjaxIllust).filter(Boolean))
    } catch (e) {
      console.warn(`pixiv 发现流第 ${start + i} 页失败:`, e.message)
    }
  }
  const seen = new Set()
  return out.filter(x => {
    if (!x || seen.has(x.id)) return false
    seen.add(x.id)
    return true
  })
}

// 关注画师的最新作品（需要登录）
// 实测该接口只返回作品 ID 列表：body.page.ids
// 因此这里再用"作品详情"接口把每个 id 补齐成完整信息（并发 5，取前 limit 个）
export async function getFollowLatest(page = 1, limit = 24) {
  const data = await pixivGet(`https://www.pixiv.net/ajax/follow_latest/illust?p=${page}&mode=all&lang=zh`)
  const ids = (data && data.body && data.body.page && data.body.page.ids) || []

  if (!Array.isArray(ids)) {
    throw new Error(`关注流返回结构异常：${JSON.stringify(data).slice(0, 400)}`)
  }
  if (ids.length === 0) {
    console.log(`🎨 pixiv 关注流: page=${page} 无内容（可能没有关注的画师）`)
    return []
  }

  const target = ids.slice(0, limit)
  const cachedCount = target.filter(id => !!illustDetailCache.peek(String(id))).length
  const CONCURRENCY = 8
  console.log(`🎨 pixiv 关注流: page=${page} 共 ${ids.length} 个作品，取前 ${target.length} 个补齐信息（并发 ${CONCURRENCY}，已缓存 ${cachedCount} 个）`)

  const out = []
  for (let i = 0; i < target.length; i += CONCURRENCY) {
    const chunk = target.slice(i, i + CONCURRENCY)
    const part = await Promise.all(chunk.map(async (id) => {
      try {
        const d = await getIllustDetail(String(id))
        if (!d) return null
        return {
          id: d.id,
          thumb: d.thumb,
          title: d.title,
          author: d.userName,
          userId: d.userId,
          pageCount: d.pageCount,
          xRestrict: d.xRestrict || 0,
          aiType: d.aiType || 0
        }
      } catch (e) {
        return null
      }
    }))
    out.push(...part.filter(Boolean))
  }

  return out
}

// 取当前登录用户自己的 id（pixiv 的关注接口需要 x-user-id 请求头）
// 依次尝试：首页 HTML 里的 userId → /ajax/user/extra
export async function getSelfUserId() {
  try {
    const html = await pixivGet('https://www.pixiv.net/', { responseType: 'text' })
    if (typeof html === 'string') {
      const m = html.match(/"userId":"(\d+)"/) ||
                html.match(/"user_id":"(\d+)"/) ||
                html.match(/name="user_id"\s+content="(\d+)"/)
      if (m && m[1] && m[1] !== '0') return m[1]
    }
  } catch (e) {
    console.warn('pixiv 从首页取 userId 失败:', e.message)
  }

  try {
    const data = await pixivGet('https://www.pixiv.net/ajax/user/extra')
    const id = data && data.body && (data.body.userId || data.body.user_id)
    if (id) return String(id)
  } catch (e) {
    console.warn('pixiv /ajax/user/extra 取 userId 失败:', e.message)
  }

  return ''
}

// 关注 / 取消关注某画师（需要登录）
export async function setFollowUser(userId, follow = true) {
  const { useProxy, proxyPort, cookie } = getPixivSettings()
  if (!cookie) throw new Error('需要先登录 pixiv')
  const agent = createProxyAgent(useProxy, proxyPort)
  const selfId = await getSelfUserId()

  const url = follow
    ? `https://www.pixiv.net/ajax/user/${userId}/follow`
    : `https://www.pixiv.net/ajax/user/${userId}/follow/delete`

  const body = new URLSearchParams({
    ...(selfId ? { user_id: selfId } : {}),
    restrict: 'public'
  }).toString()

  const headers = {
    'Referer': `https://www.pixiv.net/users/${userId}`,
    'Origin': 'https://www.pixiv.net',
    'User-Agent': PIXIV_UA,
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Cookie': cookie
  }
  if (selfId) headers['x-user-id'] = selfId

  try {
    const resp = await axios.post(url, body, {
      timeout: 30000,
      httpsAgent: agent || undefined,
      ...(agent ? {} : { proxy: false }),
      headers
    })
    console.log('pixiv 关注响应:', resp.status, JSON.stringify(resp.data).slice(0, 200))
    return resp.data
  } catch (e) {
    const status = e.response && e.response.status
    const respSnippet = (e.response && e.response.data)
      ? JSON.stringify(e.response.data).slice(0, 300)
      : ''
    console.error(`pixiv 关注请求失败 (HTTP ${status || '?'}): ${url} - ${e.message}`, respSnippet)
    throw new Error(
      `关注失败（HTTP ${status || '网络错误'}）\n` +
      `自身 userId: ${selfId || '未取到'}\n` +
      `请求地址: ${url}\n` +
      (respSnippet ? `接口返回: ${respSnippet}` : '')
    )
  }
}

// 批量收集多个作品的全部原图直链（用于"生成批量下载链接"）
// 主进程内并发请求，避免前端逐个 IPC 串行等待
export async function collectIllustUrls(ids, concurrency = 8, onProgress) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : []
  const urls = []
  let done = 0
  // peek：只查缓存是否存在（不影响命中统计与 LRU 顺序）
  const cacheHits = list.filter(id => !!pagesCache.peek(String(id))).length
  console.log(`🎨 pixiv 批量取直链：共 ${list.length} 个作品，并发 ${concurrency}，其中 ${cacheHits} 个命中缓存（秒出）`)

  for (let i = 0; i < list.length; i += concurrency) {
    const chunk = list.slice(i, i + concurrency)
    const parts = await Promise.all(chunk.map(async (id) => {
      try {
        return await getIllustPages(String(id))
      } catch (e) {
        return []
      }
    }))

    for (const pages of parts) {
      if (Array.isArray(pages)) {
        for (const p of pages) {
          if (p && p.url) urls.push(p.url)
        }
      }
    }

    done += chunk.length
    if (onProgress) {
      try { onProgress(done, list.length) } catch (e) {}
    }
  }

  return [...new Set(urls)]
}
