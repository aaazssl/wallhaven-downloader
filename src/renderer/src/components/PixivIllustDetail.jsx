// src/renderer/src/components/PixivIllustDetail.jsx
// pixiv 作品详情页（方案 B）：
// 独立页面展示该作品的全部图，左上角返回按钮，底部显示标签 / 作者 / 关注按钮
// 可勾选部分页生成直链，或直接复制直链给 IDM
import React, { useState, useEffect, useRef } from 'react'
import { toast } from './Toast'

export default function PixivIllustDetail({ image, pixivConfig, onClose }) {
  const [detail, setDetail] = useState(null)
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPages, setSelectedPages] = useState(new Set())
  const [following, setFollowing] = useState(false)
  const [links, setLinks] = useState('')
  // 全屏查看原图的索引（null = 未打开）
  const [fullIndex, setFullIndex] = useState(null)
  const [fullLoading, setFullLoading] = useState(false)
  // 全屏双层显示：底层=中等图（秒开），上层=原图（加载完淡入覆盖 → 无缝切换、无黑闪）
  const [fullMedium, setFullMedium] = useState('')
  const [fullOriginal, setFullOriginal] = useState('')
  const [fullOrigLoaded, setFullOrigLoaded] = useState(false)

  const illustId = image ? String(image.id) : ''

  // 加载作品详情 + 每一页真实原图地址
  useEffect(() => {
    if (!illustId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetail(null)
    setPages([])
    setSelectedPages(new Set())
    setLinks('')

    Promise.all([
      window.electronAPI.fetchPixivDetail(illustId),
      window.electronAPI.fetchPixivPages(illustId)
    ]).then(([d, p]) => {
      if (cancelled) return
      if (d && d.success) setDetail(d.detail)
      if (p && p.success) setPages(p.pages || [])
      if ((!d || !d.success) && (!p || !p.success)) {
        setError((d && d.error) || (p && p.error) || '加载失败')
      }
      setLoading(false)
    }).catch(err => {
      if (cancelled) return
      setError(err.message)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [illustId])

  // 切换页：底层立即显示"中等图"（regular，几百 KB，秒开）；
  // 上层按「浏览大图画质」决定是否加载原图，加载完成后【原地淡入】覆盖
  //（不重建 img 元素，所以不会出现黑闪）
  useEffect(() => {
    if (fullIndex === null) return
    const p = pages[fullIndex]
    if (!p) return

    const quality = (pixivConfig && pixivConfig.previewQuality) || 'auto'

    setFullLoading(true)
    setFullOrigLoaded(false)

    if (quality === 'original') {
      // 仅原图：直接加载原图（加载期间显示"加载中"，不做双层过渡）
      setFullMedium(p.url || p.regular || '')
      setFullOriginal('')
    } else if (quality === 'regular') {
      // 仅中等图：完全不请求原图（最省流量，也没有任何切换）
      setFullMedium(p.regular || p.small || p.url || '')
      setFullOriginal('')
    } else {
      // 自动（默认）：先中等图，再无缝换成原图
      setFullMedium(p.regular || p.small || p.url || '')
      setFullOriginal(p.url && p.url !== (p.regular || '') ? p.url : '')
    }
  }, [fullIndex, pages, pixivConfig?.previewQuality])

  // "已预加载"记录，避免重复请求（换作品时清空）
  const preloadedRef = useRef(new Set())

  useEffect(() => {
    preloadedRef.current = new Set()
  }, [pages])

  // 预加载相邻页：数量可在 设置 → pixiv →「详情页预加载」里自定义
  // （图片已直连 i.pximg.net，命中 Chromium 磁盘缓存后翻页基本瞬时）
  useEffect(() => {
    if (fullIndex === null) return
    const forward = Math.max(0, Math.min(10, Number(pixivConfig?.preloadForward ?? 4)))
    const backward = Math.max(0, Math.min(10, Number(pixivConfig?.preloadBackward ?? 1)))

    const preload = (i) => {
      const p = pages[i]
      // 预加载"中等图"（regular）：体积小、速度快，命中后翻页基本瞬时
      const url = p && (p.regular || p.small || p.url)
      if (!url) return
      if (preloadedRef.current.has(url)) return
      preloadedRef.current.add(url)
      // 用 <img> 预加载：<img> 加载跨域图片不受 CORS 限制（fetch 会被 CORS 拦截）
      const im = new Image()
      im.src = url
    }

    // 向后多预加载（多数是往后翻页），向前少一点
    for (let k = 1; k <= forward; k++) preload(fullIndex + k)
    for (let k = 1; k <= backward; k++) preload(fullIndex - k)
  }, [fullIndex, pages, pixivConfig?.preloadForward, pixivConfig?.preloadBackward])

  // 全屏预览的键盘操作：Esc 关闭、←/→ 切换
  useEffect(() => {
    if (fullIndex === null) return
    const onKey = (e) => {
      if (e.key === 'Escape') setFullIndex(null)
      if (e.key === 'ArrowLeft') setFullIndex(i => (i > 0 ? i - 1 : i))
      if (e.key === 'ArrowRight') setFullIndex(i => (i < pages.length - 1 ? i + 1 : i))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fullIndex, pages.length])

  const togglePage = (idx) => {
    setSelectedPages(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const selectAllPages = () => {
    if (selectedPages.size === pages.length) setSelectedPages(new Set())
    else setSelectedPages(new Set(pages.map((_, i) => i)))
  }

  // 生成选中页（未选则全部）的直链
  const handleGenerateLinks = () => {
    const idxs = selectedPages.size > 0
      ? [...selectedPages].sort((a, b) => a - b)
      : pages.map((_, i) => i)
    const urls = idxs.map(i => pages[i] && pages[i].url).filter(Boolean)
    if (urls.length === 0) { toast('没有可用的直链'); return }
    setLinks([...new Set(urls)].join('\n'))
  }

  const handleCopyLinks = async () => {
    if (!links.trim()) { toast('请先生成直链'); return }
    try {
      await navigator.clipboard.writeText(links)
      toast('✅ 直链已复制，可粘贴到 txt 后用 IDM 导入')
    } catch (e) {
      toast('复制失败，请手动选择文本框内容复制')
    }
  }

  // 把选中页加入软件下载队列（走主进程下载器，自带 Referer + Cookie）
  const handleDownloadSelected = async () => {
    const dir = (pixivConfig && pixivConfig.downloadDir) || ''
    if (!dir) { toast('请先在「设置 → pixiv」里选择 pixiv 下载目录'); return }
    const idxs = selectedPages.size > 0
      ? [...selectedPages].sort((a, b) => a - b)
      : pages.map((_, i) => i)
    const urls = idxs.map(i => pages[i] && pages[i].url).filter(Boolean)
    if (urls.length === 0) { toast('没有可下载的图片'); return }
    const res = await window.electronAPI.pixivDownloadPages(urls, dir)
    if (res && res.success) toast(`✅ 已下载 ${urls.length} 张到：${dir}`)
    else toast('下载失败：' + ((res && res.error) || '未知错误'))
  }

  // 打开作者主页（pixiv 未公开关注接口，软件内关注暂不可用，改为在浏览器中关注）
  const handleOpenAuthor = async () => {
    if (!detail || !detail.userId) { toast('未获取到作者信息'); return }
    const res = await window.electronAPI.openExternal(`https://www.pixiv.net/users/${detail.userId}`)
    if (!res || !res.success) toast('打开浏览器失败：' + ((res && res.error) || '未知错误'))
  }

  // 图片直连 i.pximg.net（主进程已注入 Referer 并按域名分流代理，完全走 Chromium 网络栈）
  const proxyUrl = (u) => u
  const totalPages = pages.length || (image && image.pageCount) || 1

  return (
    <div className="illust-detail">
      <div className="illust-detail-header">
        <button className="button button-secondary" onClick={onClose}>← 返回</button>
        <div className="illust-detail-title">
          {(detail && detail.title) || (image && image.title) || illustId}
          <span style={{ color: '#888', marginLeft: '8px', fontSize: '12px' }}>#{illustId}</span>
        </div>
        <div className="illust-detail-actions">
          <span style={{ fontSize: '12px', color: '#aaa' }}>共 {totalPages} 张</span>
          <button className="button button-secondary" onClick={selectAllPages} disabled={pages.length === 0}>
            {selectedPages.size === pages.length && pages.length > 0 ? '取消全选' : '全选'}
          </button>
          <button className="button" onClick={handleGenerateLinks} disabled={pages.length === 0}>⚡ 生成直链</button>
          <button className="button button-secondary" onClick={handleCopyLinks} disabled={!links.trim()}>📋 复制直链</button>
          <button className="button" onClick={handleDownloadSelected} disabled={pages.length === 0}>⬇ 加入下载队列</button>
        </div>
      </div>

      <div className="illust-detail-body">
        {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>加载中...</div>}
        {error && <div style={{ textAlign: 'center', padding: '40px', color: '#f44336' }}>加载失败：{error}</div>}

        {!loading && !error && (
          <div className="illust-detail-grid">
            {pages.map((p, i) => (
              <div
                key={i}
                className={`illust-detail-item ${selectedPages.has(i) ? 'selected' : ''}`}
                onClick={() => setFullIndex(i)}
                title="点击查看原图大图"
              >
                <div className="illust-detail-checkbox" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedPages.has(i)}
                    onChange={() => togglePage(i)}
                  />
                </div>
                <img
                  src={proxyUrl(p.regular || p.url)}
                  alt={`${illustId}_p${p.page}`}
                  loading="lazy"
                  decoding="async"
                  width={p.width || undefined}
                  height={p.height || undefined}
                />
                <div className="illust-detail-pageinfo">
                  p{p.page}{p.width ? ` · ${p.width}×${p.height}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="illust-detail-footer">
          {detail && (
            <>
              <div className="illust-detail-author">
                <span>👤 {detail.userName || (image && image.author) || ''}</span>
                {detail.userId && (
                  <button className="button button-secondary" style={{ marginLeft: '10px' }} onClick={handleOpenAuthor}>
                    🌐 打开作者主页（可在浏览器中关注）
                  </button>
                )}
                {detail.xRestrict > 0 && (
                  <span className="purity-badge purity-nsfw" style={{ marginLeft: '10px' }}>
                    {detail.xRestrict === 2 ? 'R-18G' : 'R-18'}
                  </span>
                )}
                {(detail.aiType === 2 || (image && image.aiType === 2)) && (
                  <span
                    className="purity-badge"
                    style={{ marginLeft: '10px', background: 'rgba(155, 89, 182, 0.92)', color: '#fff' }}
                  >
                    AI
                  </span>
                )}
              </div>
              {detail.tags && detail.tags.length > 0 && (
                <div className="illust-detail-tags">
                  {detail.tags.map((t, i) => <span key={i} className="preview-tag">{t}</span>)}
                </div>
              )}
            </>
          )}
          {links && (
            <textarea
              className="input idm-output"
              value={links}
              readOnly
              style={{ marginTop: '10px', minHeight: '120px' }}
            />
          )}
        </div>
      </div>

      {/* 全屏查看原图（点击缩略图打开，Esc 关闭，←/→ 切换） */}
      {fullIndex !== null && pages[fullIndex] && (
        <div className="illust-fullview" onClick={() => setFullIndex(null)}>
          <button className="preview-close" onClick={() => setFullIndex(null)}>✕</button>
          {fullIndex > 0 && (
            <button
              className="preview-nav preview-nav-prev"
              onClick={(e) => { e.stopPropagation(); setFullIndex(fullIndex - 1) }}
            >‹</button>
          )}
          {fullIndex < pages.length - 1 && (
            <button
              className="preview-nav preview-nav-next"
              onClick={(e) => { e.stopPropagation(); setFullIndex(fullIndex + 1) }}
            >›</button>
          )}
          {/* 底层：中等图（先显示；翻页时重建以避免残留上一张） */}
          <img
            key={`m_${fullIndex}`}
            className="illust-fullview-img"
            src={fullMedium}
            alt={`${illustId}_p${pages[fullIndex].page}`}
            decoding="async"
            onLoad={() => setFullLoading(false)}
            onClick={(e) => e.stopPropagation()}
          />
          {/* 上层：原图，加载完成后原地淡入覆盖（不重建元素 → 无缝、无黑闪） */}
          {fullOriginal && (
            <img
              key={`o_${fullIndex}`}
              className={`illust-fullview-img illust-fullview-top ${fullOrigLoaded ? 'loaded' : ''}`}
              src={fullOriginal}
              alt={`${illustId}_p${pages[fullIndex].page} 原图`}
              decoding="async"
              onLoad={() => setFullOrigLoaded(true)}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {fullLoading && (
            <div className="illust-fullview-loading">加载中...</div>
          )}
          <div className="illust-fullview-info">
            p{pages[fullIndex].page} · {fullIndex + 1}/{pages.length}
            {pages[fullIndex].width ? ` · ${pages[fullIndex].width}×${pages[fullIndex].height}` : ''}
            <span style={{ marginLeft: '10px', color: fullOrigLoaded ? '#4c9aff' : '#999' }}>
              {fullOrigLoaded ? '原图' : (fullOriginal ? '预览（原图加载中…）' : '中等画质')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
