// src/renderer/src/components/PixivPanel.jsx
import React, { useState, useRef, useEffect } from 'react'
import Calendar from './Calendar'
import { toast } from './Toast'

export default function PixivPanel({
  rankingMode,
  setRankingMode,
  keyword,
  onSearch,
  selectedDate,
  onSelectDate,
  onRefresh,
  pixivPage,
  onPageChange,
  rankingDate,
  onRankingDateChange,
  selectedImages
}) {
  const [localKeyword, setLocalKeyword] = useState(keyword || '')
  const [idmLinks, setIdmLinks] = useState('')
  const [stagedLinks, setStagedLinks] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 })
  const stagedRef = useRef(null)

  // 监听"批量取直链"的进度
  useEffect(() => {
    if (window.electronAPI.onPixivLinksProgress) {
      window.electronAPI.onPixivLinksProgress((d) => setGenProgress(d))
    }
    return () => {
      if (window.electronAPI.removePixivLinksProgressListener) {
        window.electronAPI.removePixivLinksProgressListener()
      }
    }
  }, [])

  // 榜单类模式（可用日期筛选）
  const isRanking = rankingMode !== 'discovery' && rankingMode !== 'follow'

  // 注意：浏览类型的定义已统一到 components/TypeTabs.jsx 的 PIXIV_TABS
  //（顶部标签栏渲染 + 设置页"主界面标签"勾选都用它），此处不要再维护第二份，避免不一致
  const rankingModes = []   // 已废弃：仅为兼容保留，请勿使用

  const handleSubmit = (e) => {
    e.preventDefault()
    onSearch(localKeyword)
  }

  // ===== 生成 IDM 批量下载链接 =====
  // 交由主进程并发批量获取（一次 IPC、并发 6），避免前端逐个串行等待
  const handleGenerateIdmLinks = async () => {
    if (!selectedImages || selectedImages.length === 0) {
      toast('请先勾选要生成的图片！')
      return
    }
    const ids = selectedImages.map(img => String(img.id))
    setGenerating(true)
    setGenProgress({ done: 0, total: ids.length })

    let urls = []
    try {
      const res = await window.electronAPI.pixivCollectLinks(ids)
      if (res && res.success && Array.isArray(res.urls)) {
        urls = res.urls
      } else if (res && res.error) {
        toast('获取直链失败：' + res.error)
      }
    } catch (e) {
      toast('获取直链失败：' + e.message)
    } finally {
      setGenerating(false)
      setGenProgress({ done: 0, total: 0 })
    }

    if (urls.length === 0) {
      toast('未获取到可用的直链（可能需要先登录 pixiv）')
      return
    }
    setIdmLinks(urls.join('\n'))
  }

  // ===== 复制当前链接 =====
  const handleCopyLinks = async () => {
    if (!idmLinks.trim()) {
      toast('请先生成批量下载链接！')
      return
    }
    try {
      await navigator.clipboard.writeText(idmLinks)
      toast('✅ 链接已复制！可粘贴到 txt 文件后用 IDM 从文本文件导入。')
    } catch (e) {
      const textarea = document.createElement('textarea')
      textarea.value = idmLinks
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      toast('✅ 链接已复制！可粘贴到 txt 文件后用 IDM 从文本文件导入。')
    }
  }

  // ===== 暂存链接：把生成区内容去重后追加到暂存区 =====
  const handleStageLinks = () => {
    if (!idmLinks.trim()) {
      toast('请先生成批量下载链接，再点击暂存！')
      return
    }
    const currentLines = idmLinks.split('\n').filter(l => l.trim())
    const stagedLines = stagedLinks.split('\n').filter(l => l.trim())
    const merged = [...stagedLines]
    let added = 0
    for (const line of currentLines) {
      if (!merged.includes(line)) {
        merged.push(line)
        added++
      }
    }
    if (added === 0) {
      toast('这些链接已经全部在暂存区中，无需重复添加')
      return
    }
    setStagedLinks(merged.join('\n'))
    toast(`✅ 已暂存 ${added} 条新链接，暂存区现有 ${merged.length} 条`)
  }

  // ===== 全选复制暂存区 =====
  const handleCopyStagedLinks = async () => {
    if (!stagedLinks.trim()) {
      toast('暂存区为空！请先暂存链接')
      return
    }
    try {
      await navigator.clipboard.writeText(stagedLinks)
      toast(`✅ 已复制全部 ${stagedLinks.split('\n').filter(l => l.trim()).length} 条暂存链接！`)
    } catch (e) {
      if (stagedRef.current) {
        stagedRef.current.focus()
        stagedRef.current.select()
        document.execCommand('copy')
        toast('✅ 已复制全部暂存链接！')
      } else {
        toast('复制失败，请手动全选复制')
      }
    }
  }

  // ===== 清空暂存区 =====
  const handleClearStaged = () => {
    if (stagedLinks.trim()) setStagedLinks('')
    else toast('暂存区已为空')
  }

  return (
    <div className="yandere-panel">
      <div className="sidebar-section">
        <div className="section-title">搜索插画</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="input"
            placeholder="输入关键词..."
            value={localKeyword}
            onChange={(e) => setLocalKeyword(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="button">🔍</button>
        </form>
      </div>

      {/* 选择日期（仅榜单类模式显示；对应官网的"查看历史榜单"） */}
      {isRanking && (
        <div className="sidebar-section">
          <div className="section-title">选择日期</div>
          <Calendar selectedDate={rankingDate} onSelectDate={onRankingDateChange} />
          <button
            className="button button-secondary"
            style={{ width: '100%', marginTop: '8px' }}
            onClick={() => onRankingDateChange(null)}
          >
            🔄 回到最新榜单
          </button>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '6px', lineHeight: '1.5' }}>
            💡 选历史日期可查看当日榜单（日/周/月及 R-18 榜均支持）
          </div>
        </div>
      )}

      <div className="sidebar-section">
        <div className="section-title">页数选择</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number"
            className="input page-input"
            min="1"
            value={pixivPage || 1}
            onChange={(e) => onPageChange(Number(e.target.value))}
            placeholder="输入页码"
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button
            className="button button-secondary"
            disabled={!(pixivPage > 1)}
            onClick={() => onPageChange((Number(pixivPage) || 1) - 1)}
            style={{ flex: 1 }}
          >
            ⬅ 上一页
          </button>
          <button
            className="button"
            onClick={() => onPageChange((Number(pixivPage) || 1) + 1)}
            style={{ flex: 1 }}
          >
            下一页 ➡
          </button>
        </div>
        <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
          💡 当前第 {pixivPage || 1} 页
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-title">IDM 批量下载</div>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>
          勾选图片后点击下方按钮，生成直链列表，复制到 IDM 批量添加
        </div>
        <textarea
          className="input idm-output"
          value={idmLinks}
          onChange={(e) => setIdmLinks(e.target.value)}
          placeholder="生成的下载直链将显示在这里，可自由编辑..."
          spellCheck={false}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
          <button className="button" onClick={handleGenerateIdmLinks} disabled={generating} style={{ flex: 1 }}>
            {generating
              ? `获取直链中... ${genProgress.total ? `${genProgress.done}/${genProgress.total}` : ''}`
              : '⚡ 生成批量下载链接'}
          </button>
          <button className="button button-secondary" onClick={handleStageLinks} style={{ flex: 1 }}>
            📥 暂存链接
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button className="button button-secondary" onClick={handleCopyLinks} style={{ flex: 1 }}>
            📋 复制当前
          </button>
          <button className="button button-secondary" onClick={() => setIdmLinks('')} style={{ flex: 0.5 }}>
            🗑
          </button>
        </div>
      </div>

      <button className="button refresh-btn" onClick={onRefresh}>🔄 刷新</button>

      <div className="sidebar-section">
        <div className="section-title">
          暂存链接
          {stagedLinks.trim() && (
            <span style={{ fontSize: '11px', color: '#4c9aff', marginLeft: '6px' }}>
              ({stagedLinks.split('\n').filter(l => l.trim()).length} 条)
            </span>
          )}
        </div>
        <textarea
          ref={stagedRef}
          className="input idm-output"
          value={stagedLinks}
          onChange={(e) => setStagedLinks(e.target.value)}
          placeholder="暂存的直链会累计显示在这里，可手动编辑/去重..."
          spellCheck={false}
          style={{ minHeight: '160px' }}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button className="button" onClick={handleCopyStagedLinks} style={{ flex: 1 }} disabled={!stagedLinks.trim()}>
            📋 全选复制
          </button>
          <button className="button button-secondary" onClick={handleClearStaged} style={{ flex: 0.5 }} disabled={!stagedLinks.trim()}>
            🗑
          </button>
        </div>
      </div>
    </div>
  )
}
