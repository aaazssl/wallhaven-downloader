import React, { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import ImageGrid from './components/ImageGrid'
import DownloadPanel from './components/DownloadPanel'
import SettingsPanel from './components/SettingsPanel'

// 根据环境自动切换 API 地址
const API_BASE = process.env.NODE_ENV === 'development' 
  ? '/api/v1' 
  : 'https://wallhaven.cc/api/v1'
function App() {
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
      }
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

  useEffect(() => {
    if (apiKey !== undefined && concurrency && downloadDir) {
      window.electronAPI.saveConfig({ apiKey, concurrency, downloadDir, purityFlags, topRange })
    }
  }, [apiKey, concurrency, downloadDir, purityFlags, topRange])

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

  const handleCategoryChange = (sortBy, order, categoryId, range = null) => {
    setActiveCategory(categoryId)
    let finalRange = null
    if (categoryId === 'recent-hot' || categoryId === 'toplist') {
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
    if (activeCategory) {
      let sortBy, order, range
      switch (activeCategory) {
        case 'all': sortBy = 'relevance'; order = 'desc'; range = null; break
        case 'latest': sortBy = 'date_added'; order = 'desc'; range = null; break
        case 'recent-hot': sortBy = 'toplist'; order = 'desc'; range = topRange; break
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
    if (!loading) {
      if (activeCategory) {
        handleRefresh()
      } else if (searchQuery) {
        handleSearch(searchQuery)
      }
    }
  }, [purityFlags, categories, extraFilters])

  const loadMore = () => {
    if (!loading && hasMore) {
      if (activeCategory) {
        let sortBy, order, range
        switch (activeCategory) {
          case 'all': sortBy = 'relevance'; order = 'desc'; range = null; break
          case 'latest': sortBy = 'date_added'; order = 'desc'; range = null; break
          case 'recent-hot': sortBy = 'toplist'; order = 'desc'; range = topRange; break
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

  const toggleSelect = (id) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) newSelected.delete(id)
    else newSelected.add(id)
    setSelectedIds(newSelected)
  }

  const selectAll = () => {
    if (selectedIds.size === images.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(images.map(img => img.id)))
  }

  const startDownload = async () => {
    if (selectedIds.size === 0) {
      alert('请先选择要下载的图片')
      return
    }
    if (!downloadDir) {
      const dir = await window.electronAPI.selectDownloadDir()
      if (dir) setDownloadDir(dir)
      else {
        alert('请选择下载目录')
        return
      }
    }
    setDownloading(true)
    setDownloadTasks([])
    const ids = Array.from(selectedIds)
    await window.electronAPI.downloadImages(ids, downloadDir, concurrency)
  }

  const selectDownloadDir = async () => {
    const dir = await window.electronAPI.selectDownloadDir()
    if (dir) {
      setDownloadDir(dir)
      await window.electronAPI.saveConfig({ apiKey, concurrency, downloadDir: dir, purityFlags, topRange })
    }
  }

  const handleClearCache = async () => {
    const result = await window.electronAPI.clearDownloadCache()
    alert(result.message)
    if (result.success) {
      setImages([])
      setSelectedIds(new Set())
      setDownloadTasks([])
    }
  }

  if (showSettings) {
    return (
      <SettingsPanel
        apiKey={apiKey}
        setApiKey={setApiKey}
        concurrency={concurrency}
        setConcurrency={setConcurrency}
        downloadDir={downloadDir}
        onSelectDir={selectDownloadDir}
        onClearCache={handleClearCache}
        onClose={() => setShowSettings(false)}
      />
    )
  }

  return (
    <div className="app-layout">
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
      <div className="main-area">
        <div className="grid-container">
          <ImageGrid
            images={images}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
            onLoadMore={loadMore}
            hasMore={hasMore}
            loading={loading}
            downloadTasks={downloadTasks}
          />
        </div>
        <DownloadPanel
          selectedCount={selectedIds.size}
          totalCount={images.length}
          onSelectAll={selectAll}
          onDownload={startDownload}
          downloading={downloading}
          downloadTasks={downloadTasks}
        />
      </div>
    </div>
  )
}

export default App