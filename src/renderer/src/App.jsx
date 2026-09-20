import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Sidebar from './components/Sidebar'
import ImageGrid from './components/ImageGrid'
import DownloadPanel from './components/DownloadPanel'
import SettingsPanel from './components/SettingsPanel'
import ImagePreview from './components/ImagePreview'
import YandeRePanel from './components/YandeRePanel'
import PixivPanel from './components/PixivPanel'
import PixivIllustDetail from './components/PixivIllustDetail'
import TypeTabs from './components/TypeTabs'
import { ToastHost, toast } from './components/Toast'

// 根据环境自动切换 API 地址
const API_BASE = process.env.NODE_ENV === 'development' 
  ? '/api/v1' 
  : 'https://wallhaven.cc/api/v1'

// 把 Date 或 'YYYY-MM-DD' 统一转成 pixiv 榜单需要的 YYYYMMDD
function formatRankingDate(d) {
  if (!d) return ''
  if (typeof d === 'string') return d.replace(/-/g, '')
  try {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}${m}${day}`
  } catch (e) {
    return ''
  }
}

function App() {
  // ===== 来源切换 =====
  const [source, setSource] = useState('wallhaven')
  // 默认打开的图片来源（可在系统设置里修改，持久化到配置文件）
  const [defaultSource, setDefaultSource] = useState('wallhaven')
  // 硬件加速（GPU）开关：默认关闭，开启后需重启软件生效
  const [hardwareAcceleration, setHardwareAcceleration] = useState(false)

  // 配置是否已从磁盘加载完成（防止初始渲染时用默认值覆盖已保存的配置）
  const configLoadedRef = useRef(false)
  // 用 ref 持有最新列表，让 useCallback 回调保持引用稳定（配合 ImageCard 的 memo，避免无谓重渲染）
  const imagesRef = useRef([])
  const visibleImagesRef = useRef([])

  // ===== Wallhaven 状态 =====
  const [images, setImages] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [downloadDir, setDownloadDir] = useState(null)
  const [concurrency, setConcurrency] = useState(16)
  const [apiKey, setApiKey] = useState('')
  const [purityFlags, setPurityFlags] = useState({ sfw: true, sketchy: false, nsfw: false })
  const [downloading, setDownloading] = useState(false)
  const [downloadTasks, setDownloadTasks] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [topRange, setTopRange] = useState('1M')
  const [categories, setCategories] = useState({ general: true, anime: true, people: true })
  const [showSettings, setShowSettings] = useState(false)
  const [extraFilters, setExtraFilters] = useState({ resolution: '', ratio: '' })

  // ===== 全局代理状态（作用于三站） =====
  const [useProxy, setUseProxy] = useState(true)
  const [proxyPort, setProxyPort] = useState(12450)

  // ===== 预览相关状态 =====
  const [previewId, setPreviewId] = useState(null)
  const [previewIndex, setPreviewIndex] = useState(-1)

  // ===== yande.re 相关状态 =====
  const [yandereHotType, setYandereHotType] = useState('popular_by_day')
  const [yandereDate, setYandereDate] = useState(new Date())
  const [yanderePage, setYanderePage] = useState(1)   // 最新列表页码（latest 类型使用）

  // ===== yande.re 独立配置状态（与 wallhaven 配置隔离） =====
  const [yandereConfig, setYandereConfig] = useState({
    baseUrl: 'https://yande.re',
    useProxy: true,
    proxyPort: 12450,
    concurrency: 6,
    limit: 100,
    downloadDir: null
  })

  // ===== pixiv 相关状态（与另两站隔离） =====
  const [pixivConfig, setPixivConfig] = useState({
    baseUrl: 'https://www.pixiv.net',
    useProxy: true,
    proxyPort: 12450,
    concurrency: 6,
    limit: 100,
    cookie: '',
    rankingMode: 'daily',
    downloadDir: null,
    showR18: true,
    showAI: true,
    visibleTabs: ['daily', 'weekly', 'monthly'],
    preloadForward: 4,
    preloadBackward: 1,
    previewQuality: 'auto'
  })
  const [pixivRankingMode, setPixivRankingMode] = useState('daily')
  const [pixivDate, setPixivDate] = useState(new Date())
  const [pixivPage, setPixivPage] = useState(1)
  const [pixivKeyword, setPixivKeyword] = useState('')
  const [pixivHasMore, setPixivHasMore] = useState(true)
  // 榜单日期（Date 对象，null = 最新榜单）
  const [pixivRankingDate, setPixivRankingDate] = useState(null)
  // 打开的作品详情（点开作品后进入独立详情页）
  const [pixivDetailImage, setPixivDetailImage] = useState(null)

  // ===== 背景设置 =====
  const [bgColor, setBgColor] = useState('')
  const [bgImage, setBgImage] = useState('')

  // 从 localStorage 加载背景设置
  useEffect(() => {
    try {
      const savedBgColor = localStorage.getItem('bg_color')
      const savedBgImage = localStorage.getItem('bg_image')
      if (savedBgColor) setBgColor(savedBgColor)
      if (savedBgImage) setBgImage(savedBgImage)
    } catch (e) {}
  }, [])

  const getPurityParam = () => {
    const sfw = purityFlags.sfw ? '1' : '0'
    const sketchy = purityFlags.sketchy ? '1' : '0'
    const nsfw = purityFlags.nsfw ? '1' : '0'
    return `${sfw}${sketchy}${nsfw}`
  }

  useEffect(() => {
    const init = async () => {
      const config = await window.electronAPI.getConfig()
      if (config) {
        setApiKey(config.apiKey || '')
        setConcurrency(config.concurrency || 16)
        setDownloadDir(config.downloadDir || null)
        if (config.purityFlags) {
          setPurityFlags(config.purityFlags)
        } else if (config.purity) {
          const str = config.purity.padStart(3, '0')
          setPurityFlags({
            sfw: str[0] === '1',
            sketchy: str[1] === '1',
            nsfw: str[2] === '1'
          })
        }
        setTopRange(config.topRange || '1M')
        setUseProxy(config.useProxy || false)
        setProxyPort(config.proxyPort || 7890)
        // 读取 yande.re 独立配置（与 wallhaven 配置隔离）
        if (config.yandere) {
          setYandereConfig({
            baseUrl: config.yandere.baseUrl || 'https://yande.re',
            useProxy: config.yandere.useProxy ?? true,
            proxyPort: config.yandere.proxyPort || 7890,
            concurrency: config.yandere.concurrency || 6,
            limit: config.yandere.limit || 100,
            downloadDir: config.yandere.downloadDir || null
          })
        }
        // 读取 pixiv 独立配置（与 wallhaven / yande.re 隔离）
        if (config.pixiv) {
          setPixivConfig({
            baseUrl: config.pixiv.baseUrl || 'https://www.pixiv.net',
            useProxy: config.pixiv.useProxy ?? true,
            proxyPort: config.pixiv.proxyPort || 7890,
            concurrency: config.pixiv.concurrency || 6,
            limit: config.pixiv.limit || 100,
            cookie: config.pixiv.cookie || '',
            rankingMode: config.pixiv.rankingMode || 'daily',
            downloadDir: config.pixiv.downloadDir || null,
            showR18: config.pixiv.showR18 ?? true,
            showAI: config.pixiv.showAI ?? true,
            visibleTabs: Array.isArray(config.pixiv.visibleTabs)
              ? config.pixiv.visibleTabs
              : ['daily', 'weekly', 'monthly'],
            preloadForward: Number.isFinite(config.pixiv.preloadForward) ? config.pixiv.preloadForward : 4,
            preloadBackward: Number.isFinite(config.pixiv.preloadBackward) ? config.pixiv.preloadBackward : 1,
            previewQuality: config.pixiv.previewQuality || 'auto'
          })
          setPixivRankingMode(config.pixiv.rankingMode || 'daily')
        }
        // 新增：读取默认图片来源（启动时打开对应来源）
        if (config.defaultSource) {
          setDefaultSource(config.defaultSource)
          setSource(config.defaultSource)
        }
        // 硬件加速开关
        setHardwareAcceleration(config.hardwareAcceleration === true)
      }
      // 配置已加载完成，之后才允许保存（避免用初值覆盖磁盘配置）
      configLoadedRef.current = true
    }
    init()

    window.electronAPI.onDownloadProgress((data) => {
      if (data.type === 'item') {
        setDownloadTasks(prev => {
          const existing = prev.find(t => t.id === data.id)
          if (existing) {
            return prev.map(t => t.id === data.id ? { ...t, status: data.status, progress: data.progress || 0, error: data.error } : t)
          } else {
            return [...prev, { id: data.id, status: data.status, progress: data.progress || 0, error: data.error }]
          }
        })
      } else if (data.type === 'complete') {
        setDownloading(false)
      }
    })
    return () => window.electronAPI.removeDownloadProgressListener()
  }, [])

  // ===== 自动更新提示 =====
  // 启动 8 秒后主进程会静默检查一次；发现新版 / 下载完成时在这里用 Toast 提醒，
  // 具体操作在「设置 → 系统设置 → 软件更新」里完成
  useEffect(() => {
    const api = window.electronAPI
    if (!api || !api.onUpdateStatus) return
    const off = api.onUpdateStatus((data) => {
      if (!data) return
      if (data.state === 'available') {
        toast(`发现新版本 v${data.version}，可在「设置 → 系统设置」里更新`)
      } else if (data.state === 'downloaded') {
        toast(`新版本 v${data.version} 已下载完成，去「设置」里点「重启并安装」`)
      }
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [])

  useEffect(() => {
    if (apiKey !== undefined && concurrency && downloadDir) {
      window.electronAPI.saveConfig({ 
        apiKey, 
        concurrency, 
        downloadDir, 
        purityFlags, 
        topRange,
        useProxy,
        proxyPort
      })
    }
  }, [apiKey, concurrency, downloadDir, purityFlags, topRange, useProxy, proxyPort])

  // 保存 yande.re 独立配置（与 wallhaven 配置完全隔离）
  useEffect(() => {
    if (!configLoadedRef.current) return
    window.electronAPI.saveYandereConfig(yandereConfig)
  }, [yandereConfig])

  // 保存 pixiv 独立配置（与另两站完全隔离）
  useEffect(() => {
    if (!configLoadedRef.current) return
    window.electronAPI.savePixivConfig(pixivConfig)
  }, [pixivConfig])

  // 全局配置（默认来源 / 全局代理 / 硬件加速）：统一交给主进程处理，
  // 由它负责"同步到三站子配置 + 重设会话代理"，避免前端多处写入导致不同步
  useEffect(() => {
    if (!configLoadedRef.current) return
    window.electronAPI.saveAppConfig({ defaultSource, useProxy, proxyPort, hardwareAcceleration })
  }, [useProxy, proxyPort, defaultSource, hardwareAcceleration])

  const getCategoriesParam = () => {
    return `${categories.general ? '1' : '0'}${categories.anime ? '1' : '0'}${categories.people ? '1' : '0'}`
  }

  const searchImages = useCallback(async (query, page = 1, sortBy = 'relevance', order = 'desc', range = null) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        q: query || '',
        page: page,
        sorting: sortBy,
        order: order,
        purity: getPurityParam(),
        categories: getCategoriesParam(),
        ...(range && { topRange: range }),
        ...(extraFilters.resolution && { atleast: extraFilters.resolution }),
        ...(extraFilters.ratio && { ratios: extraFilters.ratio })
      })
      if (apiKey) params.append('apikey', apiKey)
      const url = `${API_BASE}/search?${params.toString()}`
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })
      const data = await response.json()
      if (data.data && data.data.length > 0) {
        const newImages = data.data.map(img => ({
          id: img.id,
          thumb: img.thumbs.original || img.path,
          url: img.path,
          views: img.views,
          favorites: img.favorites
        }))
        if (page === 1) {
          setImages(newImages)
          setSelectedIds(new Set())
        } else {
          setImages(prev => [...prev, ...newImages])
        }
        setHasMore(data.meta.last_page > page)
        setCurrentPage(page)
      } else {
        if (page === 1) setImages([])
        setHasMore(false)
      }
    } catch (error) {
      console.error('搜索失败:', error)
    } finally {
      setLoading(false)
    }
  }, [apiKey, purityFlags, categories, extraFilters])

  // ===== yande.re 数据加载（网页抓取 popular/最新 页面） =====
  // 支持传入覆盖参数 (overrideType, overrideDate)，避免 setTimeout 闭包捕获旧状态
  // 导致"从这周切到上周需点两次"的问题
  const loadYandereImages = useCallback(async (overrideType, overrideDate, overridePage) => {
    setLoading(true)
    setImages([])
    setSelectedIds(new Set())

    // 优先使用调用时传入的新值，否则使用当前 state
    const effectiveType = overrideType || yandereHotType
    const effectiveDate = overrideDate || yandereDate
    const effectivePage = overridePage || yanderePage

    try {
      // 构造 tags 协议: "type[:value]"
      //   前24小时: "popular_recent"（无日期，滚动窗口）
      //   按日/按周/按月: "popular_by_day:2026-08-04" 等
      //   最新: "latest:123"（值=页码，忽略日期）
      let tags = effectiveType
      if (effectiveType === 'latest') {
        tags = `latest:${Number(effectivePage) || 1}`
      } else if (effectiveType !== 'popular_recent' && effectiveDate) {
        const day = effectiveDate.getDate()
        const month = effectiveDate.getMonth() + 1
        const year = effectiveDate.getFullYear()
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        tags = `${effectiveType}:${dateStr}`
      }

      const result = await window.electronAPI.fetchYanderePosts(tags, 1, 100)
      
      if (result.success) {
        // yande.re 图片按 id（名称）升序排序：父子版本序号连续，浏览更直观
        const sortedImages = [...result.images].sort((a, b) => Number(a.id) - Number(b.id))
        setImages(sortedImages)
      } else {
        console.error('yande.re 加载失败:', result.error)
        toast('yande.re 加载失败: ' + result.error)
      }
    } catch (error) {
      console.error('yande.re 加载异常:', error)
    } finally {
      setLoading(false)
    }
  }, [yandereDate, yandereHotType, yanderePage])

  // ===== pixiv 数据加载（榜单 / 推荐 / 关注 / 搜索，支持追加分页） =====
  const loadPixivImages = useCallback(async (overrideMode, overridePage, overrideKeyword, append = false, overrideDate) => {
    setLoading(true)
    if (!append) {
      setImages([])
      setSelectedIds(new Set())
    }

    const effectiveMode = overrideMode || pixivRankingMode
    const effectivePage = overridePage || pixivPage
    const effectiveKeyword = overrideKeyword !== undefined ? overrideKeyword : pixivKeyword
    const effectiveDate = overrideDate !== undefined ? overrideDate : pixivRankingDate

    try {
      let tags
      if (effectiveKeyword) {
        tags = `search:${effectiveKeyword}`
      } else if (effectiveMode === 'discovery') {
        tags = 'discovery:'
      } else if (effectiveMode === 'follow') {
        tags = 'follow:'
      } else {
        const d = formatRankingDate(effectiveDate)
        tags = d ? `ranking:${effectiveMode}:${d}` : `ranking:${effectiveMode}`
      }

      const limit = pixivConfig.limit || 100
      const result = await window.electronAPI.fetchPixivPosts(tags, effectivePage, limit)

      if (result.success) {
        const list = result.images || []
        if (append) {
          setImages(prev => {
            const seen = new Set(prev.map(x => x.id))
            return [...prev, ...list.filter(x => !seen.has(x.id))]
          })
        } else {
          setImages(list)
        }
        setPixivHasMore(list.length >= Math.min(limit, 20))
      } else {
        console.error('pixiv 加载失败:', result.error)
        if (!append) toast('pixiv 加载失败: ' + result.error)
        setPixivHasMore(false)
      }
    } catch (error) {
      console.error('pixiv 加载异常:', error)
    } finally {
      setLoading(false)
    }
  }, [pixivRankingMode, pixivPage, pixivKeyword, pixivConfig.limit, pixivRankingDate])

  // 来源切换时自动加载数据
  useEffect(() => {
    if (source === 'yandere') {
      setImages([])
      setSelectedIds(new Set())
      setDownloadTasks([])
      loadYandereImages()
    } else if (source === 'pixiv') {
      setImages([])
      setSelectedIds(new Set())
      setDownloadTasks([])
      loadPixivImages()
    }
  }, [source])

  // ===== Wallhaven 分类切换 =====
  const handleCategoryChange = (sortBy, order, categoryId, range = null) => {
    setActiveCategory(categoryId)
    let finalRange = null
    if (categoryId === 'toplist') {
      finalRange = range || topRange
    }
    setSearchQuery('')
    searchImages('', 1, sortBy, order, finalRange)
  }

  const handleSearch = (query) => {
    setSearchQuery(query)
    setActiveCategory('')
    searchImages(query, 1, 'relevance', 'desc')
  }

  const handleRefresh = () => {
    if (source === 'yandere') {
      loadYandereImages()
      return
    }
    if (source === 'pixiv') {
      loadPixivImages()
      return
    }
    if (activeCategory) {
      let sortBy, order, range
      switch (activeCategory) {
        case 'all': sortBy = 'relevance'; order = 'desc'; range = null; break
        case 'latest': sortBy = 'date_added'; order = 'desc'; range = null; break
        case 'recent-hot': sortBy = 'hot'; order = 'desc'; range = null; break
        case 'toplist': sortBy = 'toplist'; order = 'desc'; range = topRange; break
        case 'random': sortBy = 'random'; order = 'desc'; range = null; break
        case 'most-views': sortBy = 'views'; order = 'desc'; range = null; break
        case 'top-favorites': sortBy = 'favorites'; order = 'desc'; range = null; break
        default: return
      }
      searchImages('', 1, sortBy, order, range)
    } else if (searchQuery) {
      searchImages(searchQuery, 1, 'relevance', 'desc')
    }
  }

  useEffect(() => {
    if (source !== 'wallhaven') return
    if (!loading) {
      if (activeCategory) {
        handleRefresh()
      } else if (searchQuery) {
        handleSearch(searchQuery)
      }
    }
  }, [purityFlags, categories, extraFilters])

  // pixiv 加载下一页（滚到底自动触发）
  const loadMorePixiv = () => {
    if (loading || !pixivHasMore) return
    const next = (pixivPage || 1) + 1
    setPixivPage(next)
    loadPixivImages(pixivRankingMode, next, pixivKeyword, true)
  }

  const loadMore = () => {
    if (source === 'pixiv') { loadMorePixiv(); return }
    if (source !== 'wallhaven') return
    if (!loading && hasMore) {
      if (activeCategory) {
        let sortBy, order, range
        switch (activeCategory) {
          case 'all': sortBy = 'relevance'; order = 'desc'; range = null; break
          case 'latest': sortBy = 'date_added'; order = 'desc'; range = null; break
          case 'recent-hot': sortBy = 'hot'; order = 'desc'; range = null; break
          case 'toplist': sortBy = 'toplist'; order = 'desc'; range = topRange; break
          case 'random': sortBy = 'random'; order = 'desc'; range = null; break
          case 'most-views': sortBy = 'views'; order = 'desc'; range = null; break
          case 'top-favorites': sortBy = 'favorites'; order = 'desc'; range = null; break
          default: return
        }
        searchImages('', currentPage + 1, sortBy, order, range)
      } else if (searchQuery) {
        searchImages(searchQuery, currentPage + 1, 'relevance', 'desc')
      }
    }
  }

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    const list = source === 'pixiv' ? visibleImagesRef.current : imagesRef.current
    setSelectedIds(prev => (prev.size === list.length ? new Set() : new Set(list.map(img => img.id))))
  }, [source])

  // ===== 预览控制 =====
  const openPreview = useCallback((id) => {
    const index = imagesRef.current.findIndex(img => img.id === id)
    setPreviewId(id)
    setPreviewIndex(index)
  }, [])

  // 获取预览图片的完整数据
  const getPreviewImageData = () => {
    if (previewIndex < 0 || previewIndex >= images.length) return null
    return images[previewIndex]
  }

  const closePreview = () => {
    setPreviewId(null)
    setPreviewIndex(-1)
  }

  const prevImage = () => {
    if (previewIndex > 0) {
      setPreviewId(images[previewIndex - 1].id)
      setPreviewIndex(previewIndex - 1)
    }
  }

  const nextImage = () => {
    if (previewIndex < images.length - 1) {
      setPreviewId(images[previewIndex + 1].id)
      setPreviewIndex(previewIndex + 1)
    }
  }

  // ===== 取消下载（无需关闭软件） =====
  const handleCancelDownload = async () => {
    await window.electronAPI.cancelDownload()
    console.log('⏹ 已请求取消下载')
  }

  // ===== 清空下载列表 =====
  const handleClearDownloadTasks = () => {
    setDownloadTasks([])
    console.log('🗑 下载列表已清空')
  }

  // ===== 重新下载出现错误的图片 =====
  const retryFailedImages = async () => {
    const failedIds = downloadTasks.filter(t => t.status === 'failed').map(t => t.id)
    if (failedIds.length === 0) return
    let targetDir = resolveDownloadDir()
    if (!targetDir) {
      targetDir = await pickDownloadDir()
      if (!targetDir) {
        toast('请先选择下载目录')
        return
      }
    }

    // 从当前列表中找到失败图片的数据（含 url）
    const failedImages = images.filter(img => failedIds.includes(String(img.id)))
    if (source === 'yandere' && failedImages.length > 0) {
      const imageData = failedImages.map(img => ({ id: String(img.id), url: img.url }))
      setDownloading(true)
      setDownloadTasks([])
      await window.electronAPI.downloadImages(
        failedImages.map(img => String(img.id)),
        targetDir,
        yandereConfig.concurrency || 3,
        'yandere',
        imageData
      )
    } else if (source === 'pixiv' && failedImages.length > 0) {
      const imageData = failedImages.map(img => ({ id: String(img.id), url: img.url }))
      setDownloading(true)
      setDownloadTasks([])
      await window.electronAPI.downloadImages(
        failedImages.map(img => String(img.id)),
        targetDir,
        pixivConfig.concurrency || 3,
        'pixiv',
        imageData
      )
    } else if (source === 'wallhaven' && failedIds.length > 0) {
      setDownloading(true)
      setDownloadTasks([])
      await window.electronAPI.downloadImages(failedIds, targetDir, concurrency, 'wallhaven', [])
    } else {
      toast('没有可重试的失败图片')
    }
  }

  // 解析当前来源对应的下载目录（三站各自独立）
  const resolveDownloadDir = () => {
    if (source === 'yandere') return yandereConfig.downloadDir
    if (source === 'pixiv') return pixivConfig.downloadDir
    return downloadDir
  }

  // 为当前来源选择下载目录并写回对应配置
  const pickDownloadDir = async () => {
    const dir = await window.electronAPI.selectDownloadDir()
    if (!dir) return null
    if (source === 'yandere') {
      setYandereConfig(prev => ({ ...prev, downloadDir: dir }))
    } else if (source === 'pixiv') {
      setPixivConfig(prev => ({ ...prev, downloadDir: dir }))
    } else {
      setDownloadDir(dir)
      await window.electronAPI.saveConfig({ apiKey, concurrency, downloadDir: dir, purityFlags, topRange, useProxy, proxyPort })
    }
    return dir
  }

  // ===== 下载 =====
  const startDownload = async () => {
    if (selectedIds.size === 0) {
      toast('请先选择要下载的图片')
      return
    }
    let targetDir = resolveDownloadDir()
    if (!targetDir) {
      targetDir = await pickDownloadDir()
      if (!targetDir) {
        toast('请先选择下载目录')
        return
      }
    }

    const ids = Array.from(selectedIds)

    setDownloading(true)
    setDownloadTasks([])

    if (source === 'yandere') {
      // yande.re 下载：传递完整图片数据，包含 URL，使用独立并发配置
      const selectedImages = images.filter(img => selectedIds.has(img.id))
      const imageData = selectedImages.map(img => ({ id: img.id, url: img.url }))
      await window.electronAPI.downloadImages(ids, targetDir, yandereConfig.concurrency || 3, 'yandere', imageData)
    } else if (source === 'pixiv') {
      // pixiv 下载：传递完整图片数据（含原图直链）+ 独立并发配置
      const selectedImages = images.filter(img => selectedIds.has(img.id))
      const imageData = selectedImages.map(img => ({ id: img.id, url: img.url }))
      await window.electronAPI.downloadImages(ids, targetDir, pixivConfig.concurrency || 3, 'pixiv', imageData)
    } else {
      await window.electronAPI.downloadImages(ids, targetDir, concurrency, 'wallhaven', [])
    }
  }

  const selectDownloadDir = async () => {
    const dir = await window.electronAPI.selectDownloadDir()
    if (dir) {
      setDownloadDir(dir)
      await window.electronAPI.saveConfig({ 
        apiKey, 
        concurrency, 
        downloadDir: dir, 
        purityFlags, 
        topRange,
        useProxy,
        proxyPort
      })
    }
  }

  const selectYandereDir = async () => {
    const dir = await window.electronAPI.selectDownloadDir()
    if (dir) setYandereConfig(prev => ({ ...prev, downloadDir: dir }))
  }

  const selectPixivDir = async () => {
    const dir = await window.electronAPI.selectDownloadDir()
    if (dir) setPixivConfig(prev => ({ ...prev, downloadDir: dir }))
  }

  // 清理并删除（三站目录内文件 + 下载记录），需二次确认
  const handleDeleteAll = async () => {
    const ok = window.confirm('该操作会完全删除包括wallhaven、yande、pixiv下载文件夹内的所有下载缓存和已下载的图片')
    if (!ok) return
    const result = await window.electronAPI.deleteAllDownloads()
    toast(result.message)
    if (result.success) {
      setImages([])
      setSelectedIds(new Set())
      setDownloadTasks([])
    }
  }

  // pixiv 登录（打开内嵌登录窗口，自动抓取并保存 Cookie）
  const handlePixivLogin = async () => {
    const result = await window.electronAPI.pixivLogin()
    if (result && result.success) {
      const config = await window.electronAPI.getConfig()
      if (config && config.pixiv) {
        setPixivConfig(prev => ({ ...prev, cookie: config.pixiv.cookie || '' }))
      }
      toast('✅ pixiv 登录成功，Cookie 已保存')
    } else if (result && result.alreadyOpen) {
      // 登录窗口已经打开，无需重复提示
    } else {
      toast('pixiv 登录未完成（窗口被关闭或未检测到登录状态）')
    }
  }

  const handleClearCache = async () => {
    const result = await window.electronAPI.clearDownloadCache()
    toast(result.message)
    if (result.success) {
      setImages([])
      setSelectedIds(new Set())
      setDownloadTasks([])
    }
  }

  // ===== yande.re 日期选择 =====
  const handleYandereDateSelect = (date) => {
    setYandereDate(date)
    // 直接传入新日期立即加载（不再用 setTimeout，避免闭包捕获旧日期导致首击无效）
    loadYandereImages(yandereHotType, date)
  }

  // ===== yande.re 热门类型切换 =====
  const handleYandereHotTypeChange = (type) => {
    setYandereHotType(type)
    // 直接传入新类型立即加载；latest 类型使用页码，其余使用当前日期
    if (type === 'latest') {
      loadYandereImages(type, yandereDate, yanderePage)
    } else {
      loadYandereImages(type, yandereDate)
    }
  }

  // ===== yande.re 最新列表页数跳转 =====
  const handleYanderePageChange = (page) => {
    const p = Math.max(1, Number(page) || 1)
    setYanderePage(p)
    // 直接传入新页码立即加载
    loadYandereImages('latest', yandereDate, p)
  }

  // ===== pixiv 排行榜模式切换 =====
  const handlePixivRankingChange = (mode) => {
    setPixivRankingMode(mode)
    setPixivKeyword('')
    loadPixivImages(mode, pixivPage, '')
  }

  // ===== pixiv 日期选择（刷新用） =====
  const handlePixivDateSelect = (date) => {
    setPixivDate(date)
  }

  // ===== pixiv 关键词搜索 =====
  const handlePixivSearch = (keyword) => {
    const kw = (keyword || '').trim()
    setPixivKeyword(kw)
    setPixivPage(1)
    loadPixivImages(pixivRankingMode, 1, kw)
  }

  // ===== pixiv 页数跳转 =====
  const handlePixivPageChange = (page) => {
    const p = Math.max(1, Number(page) || 1)
    setPixivPage(p)
    loadPixivImages(pixivRankingMode, p)
  }

  // ===== pixiv 榜单日期切换（查看历史榜单，如昨天的日榜） =====
  const handlePixivRankingDateChange = (date) => {
    setPixivRankingDate(date)
    setPixivPage(1)
    loadPixivImages(pixivRankingMode, 1, '', false, date)
  }

  // ===== 来源切换 =====
  const handleSourceChange = (newSource) => {
    if (newSource === source) return
    setSource(newSource)
    setImages([])
    setSelectedIds(new Set())
    setDownloadTasks([])
    setPreviewId(null)
    setDownloading(false)
    if (newSource === 'wallhaven') {
      setActiveCategory('all')
      setSearchQuery('')
    }
  }

  // 当前是否处于 AI 专属榜单（此时不做 AI 过滤，否则榜单会一片空白）
  const isAiRankingMode = typeof pixivRankingMode === 'string' && pixivRankingMode.endsWith('_ai')

  // ===== pixiv 内容过滤（按设置里的 R18 / AI 开关做客户端过滤） =====
  const visibleImages = useMemo(() => {
    if (source !== 'pixiv') return images
    return images.filter(img => {
      if (pixivConfig.showR18 === false && (img.xRestrict || 0) > 0) return false
      if (!isAiRankingMode && pixivConfig.showAI === false && (img.aiType || 0) === 2) return false
      return true
    })
  }, [images, source, pixivConfig.showR18, pixivConfig.showAI, isAiRankingMode])

  // 同步最新列表到 ref（供上面的稳定回调使用）
  useEffect(() => { imagesRef.current = images }, [images])
  useEffect(() => { visibleImagesRef.current = visibleImages }, [visibleImages])

  // 点击图片：pixiv 进入作品详情页；其他站仍是预览浮层
  const handleImageClick = useCallback((id) => {
    if (source === 'pixiv') {
      const img = imagesRef.current.find(i => i.id === id)
      if (img) { setPixivDetailImage(img); return }
    }
    openPreview(id)
  }, [source, openPreview])

  // ===== 背景样式 =====
  const getBackgroundStyle = () => {
    if (bgImage) {
      return {
        background: `url(${bgImage}) center/cover no-repeat fixed`
      }
    }
    if (bgColor) {
      return { background: bgColor }
    }
    return {}
  }

  if (showSettings) {
    return (
      <>
      <SettingsPanel
        apiKey={apiKey}
        setApiKey={setApiKey}
        concurrency={concurrency}
        setConcurrency={setConcurrency}
        downloadDir={downloadDir}
        onSelectDir={selectDownloadDir}
        onSelectYandereDir={selectYandereDir}
        onSelectPixivDir={selectPixivDir}
        onClearCache={handleClearCache}
        onDeleteAll={handleDeleteAll}
        defaultSource={defaultSource}
        setDefaultSource={setDefaultSource}
        hardwareAcceleration={hardwareAcceleration}
        setHardwareAcceleration={setHardwareAcceleration}
        onClose={() => setShowSettings(false)}
        useProxy={useProxy}
        setUseProxy={setUseProxy}
        proxyPort={proxyPort}
        setProxyPort={setProxyPort}
        // ===== yande.re 独立配置（与 wallhaven 隔离） =====
        yandereConfig={yandereConfig}
        setYandereConfig={setYandereConfig}
        // ===== pixiv 独立配置（与另两站隔离） =====
        pixivConfig={pixivConfig}
        setPixivConfig={setPixivConfig}
        onPixivLogin={handlePixivLogin}
        bgColor={bgColor}
        setBgColor={setBgColor}
        bgImage={bgImage}
        setBgImage={setBgImage}
      />
      <ToastHost />
      </>
    )
  }

  return (
    <div className="app-layout" style={getBackgroundStyle()}>
      {/* 毛玻璃背景层 */}
      {!bgImage && !bgColor && <div className="glass-bg" />}
      <div className="glass-overlay">
        {/* 顶部来源切换栏 */}
        <div className="top-bar">
          <div className="source-switch">
            <button
              className={`source-btn ${source === 'wallhaven' ? 'active' : ''}`}
              onClick={() => handleSourceChange('wallhaven')}
            >
              Wallhaven
            </button>
            <button
              className={`source-btn ${source === 'yandere' ? 'active' : ''}`}
              onClick={() => handleSourceChange('yandere')}
            >
              yande.re
            </button>
            <button
              className={`source-btn ${source === 'pixiv' ? 'active' : ''}`}
              onClick={() => handleSourceChange('pixiv')}
            >
              pixiv
            </button>
          </div>
          <button className="settings-btn-top" onClick={() => setShowSettings(true)}>
            ⚙️ 设置
          </button>
        </div>

        {/* 顶部第二行：当前来源的分区 / 浏览类型标签 */}
        <TypeTabs
          source={source}
          activeCategory={activeCategory}
          onWallhavenSelect={handleCategoryChange}
          topRange={topRange}
          yandereHotType={yandereHotType}
          onYandereSelect={handleYandereHotTypeChange}
          pixivMode={pixivRankingMode}
          onPixivSelect={handlePixivRankingChange}
          visibleTabs={pixivConfig.visibleTabs}
        />

        <div className="app-content">
          {/* 侧边栏 */}
          {source === 'wallhaven' ? (
            <Sidebar
              onSearch={handleSearch}
              searchQuery={searchQuery}
              loading={loading}
              activeCategory={activeCategory}
              onSelectCategory={handleCategoryChange}
              topRange={topRange}
              setTopRange={setTopRange}
              categories={categories}
              setCategories={setCategories}
              purityFlags={purityFlags}
              setPurityFlags={setPurityFlags}
              onFilterChange={(key, value) => setExtraFilters(prev => ({ ...prev, [key]: value }))}
              onRefresh={handleRefresh}
              onOpenSettings={() => setShowSettings(true)}
            />
          ) : source === 'yandere' ? (
            <YandeRePanel
              hotType={yandereHotType}
              setHotType={handleYandereHotTypeChange}
              selectedDate={yandereDate}
              onSelectDate={handleYandereDateSelect}
              onRefresh={handleRefresh}
              yanderePage={yanderePage}
              setYanderePage={setYanderePage}
              onPageChange={handleYanderePageChange}
              selectedImages={images.filter(img => selectedIds.has(img.id))}
            />
          ) : (
            <PixivPanel
              rankingMode={pixivRankingMode}
              setRankingMode={handlePixivRankingChange}
              keyword={pixivKeyword}
              onSearch={handlePixivSearch}
              selectedDate={pixivDate}
              onSelectDate={handlePixivDateSelect}
              onRefresh={handleRefresh}
              pixivPage={pixivPage}
              onPageChange={handlePixivPageChange}
              rankingDate={pixivRankingDate}
              onRankingDateChange={handlePixivRankingDateChange}
              selectedImages={images.filter(img => selectedIds.has(img.id))}
            />
          )}

          {/* 主区域 */}
          <div className="main-area">
            <div className="grid-container">
              <ImageGrid
                images={visibleImages}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onSelectAll={selectAll}
                onLoadMore={loadMore}
                hasMore={source === 'pixiv' ? pixivHasMore : hasMore}
                loading={loading}
                downloadTasks={downloadTasks}
                onImageClick={handleImageClick}
              />
            </div>
            <DownloadPanel
              selectedCount={selectedIds.size}
              totalCount={visibleImages.length}
              onSelectAll={selectAll}
              onDownload={startDownload}
              downloading={downloading}
              downloadTasks={downloadTasks}
              onRetryFailed={retryFailedImages}
              onCancelDownload={handleCancelDownload}
              onClearTasks={handleClearDownloadTasks}
            />
          </div>
        </div>

        {/* pixiv 作品详情页（方案 B：独立页面展示该作品全部图） */}
        {pixivDetailImage && (
          <PixivIllustDetail
            image={pixivDetailImage}
            pixivConfig={pixivConfig}
            onClose={() => setPixivDetailImage(null)}
          />
        )}

        {/* 图片预览 */}
        {previewId && (
          <ImagePreview
            imageId={previewId}
            onClose={closePreview}
            onPrev={prevImage}
            onNext={nextImage}
            hasPrev={previewIndex > 0}
            hasNext={previewIndex < images.length - 1}
            source={source}
            image={getPreviewImageData()}
          />
        )}
      </div>

      {/* 应用内提示（替代 alert，不阻塞渲染） */}
      <ToastHost />
    </div>
  )
}

export default App