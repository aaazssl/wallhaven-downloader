import React, { useState, useRef } from 'react'
import Calendar from './Calendar'
import { toast } from './Toast'

export default function YandeRePanel({
  hotType,
  setHotType,
  selectedDate,
  onSelectDate,
  onRefresh,
  yanderePage,
  setYanderePage,
  onPageChange,
  selectedImages
}) {
  const [idmLinks, setIdmLinks] = useState('')
  const [stagedLinks, setStagedLinks] = useState('')
  const stagedRef = useRef(null)

  // 注意：浏览类型定义已统一到 components/TypeTabs.jsx 的 YANDERE_TABS，
  // 此处不要再维护第二份列表（历史上这里曾与顶部标签栏重复，容易改漏）
  const hotTypes = []   // 已废弃：仅为兼容保留，请勿使用

  // 日历仅在按日/按周/按月时显示（前24小时与最新无日期概念）
  const showCalendar = hotType === 'popular_by_day' || hotType === 'popular_by_week' || hotType === 'popular_by_month'
  // 页数输入仅在"最新"时显示
  const showPageInput = hotType === 'latest'

  // ===== 生成 IDM 批量下载链接 =====
  const handleGenerateIdmLinks = () => {
    if (!selectedImages || selectedImages.length === 0) {
      toast('请先勾选要生成的图片！')
      return
    }

    // 收集所有已选图片的直链（每行一个 URL）
    const urls = selectedImages
      .map(img => img.url)
      .filter(url => url && url.startsWith('http'))
    // 去重
    const uniqueUrls = [...new Set(urls)]

    if (uniqueUrls.length === 0) {
      toast('所选图片没有可用的直链！')
      return
    }

    // IDM 批量添加支持直接粘贴多行 URL 列表
    setIdmLinks(uniqueUrls.join('\n'))
  }

  // ===== 复制到剪贴板 =====
  const handleCopyLinks = async () => {
    if (!idmLinks.trim()) {
      toast('请先生成批量下载链接！')
      return
    }
    try {
      await navigator.clipboard.writeText(idmLinks)
      toast('✅ 链接已复制！请粘贴到新建 txt 文件中保存，再从 IDM 的【任务 → 导入 → 从文本文件导入】导入该 txt 文件。')
    } catch (e) {
      // 旧版 Electron 降级方案
      const textarea = document.createElement('textarea')
      textarea.value = idmLinks
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      toast('✅ 链接已复制！请粘贴到新建 txt 文件中保存，再从 IDM 的【任务 → 导入 → 从文本文件导入】导入该 txt 文件。')
    }
  }

  // ===== 暂存链接：把当前生成区内容追加到暂存区 =====
  const handleStageLinks = () => {
    if (!idmLinks.trim()) {
      toast('请先生成批量下载链接，再点击暂存！')
      return
    }
    // 去重：避免把同一批内容重复暂存
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

  // ===== 全选复制暂存区全部链接 =====
  const handleCopyStagedLinks = async () => {
    if (!stagedLinks.trim()) {
      toast('暂存区为空！请先暂存链接')
      return
    }
    try {
      await navigator.clipboard.writeText(stagedLinks)
      toast(`✅ 已复制全部 ${stagedLinks.split('\n').filter(l => l.trim()).length} 条暂存链接！可直接粘贴到 txt 文件。`)
    } catch (e) {
      if (stagedRef.current) {
        stagedRef.current.focus()
        stagedRef.current.select()
        document.execCommand('copy')
        toast('✅ 已复制全部暂存链接！可直接粘贴到 txt 文件。')
      } else {
        toast('复制失败，请手动全选复制')
      }
    }
  }

  // ===== 清空暂存区 =====
  const handleClearStaged = () => {
    if (stagedLinks.trim()) {
      setStagedLinks('')
    } else {
      toast('暂存区已为空')
    }
  }

  return (
    <div className="yandere-panel">
      {/* 最新：页数选择（常驻数字框，自定义页数） */}
      {showPageInput && (
        <div className="sidebar-section">
          <div className="section-title">页数选择</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              className="input page-input"
              min="1"
              value={yanderePage || 1}
              onChange={(e) => setYanderePage(Number(e.target.value))}
              placeholder="输入页码"
            />
            <button
              className="button"
              onClick={() => {
                const p = Number(yanderePage) || 1
                onPageChange(p)
              }}
              style={{ whiteSpace: 'nowrap' }}
            >
              跳转
            </button>
          </div>

          {/* 上一页 / 下一页 翻页按钮 */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              className="button button-secondary"
              disabled={!(yanderePage > 1)}
              onClick={() => onPageChange((Number(yanderePage) || 1) - 1)}
              style={{ flex: 1 }}
            >
              ⬅ 上一页
            </button>
            <button
              className="button"
              onClick={() => onPageChange((Number(yanderePage) || 1) + 1)}
              style={{ flex: 1 }}
            >
              下一页 ➡
            </button>
          </div>

          <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
            💡 当前第 {yanderePage || 1} 页 · 网站全图列表共约 27220 页
          </div>
        </div>
      )}

      {showCalendar && (
        <div className="sidebar-section">
          <div className="section-title">
            {hotType === 'popular_by_month' ? '选择月份' : '选择日期'}
          </div>
          <Calendar selectedDate={selectedDate} onSelectDate={onSelectDate} />
        </div>
      )}

      {/* ===== IDM 批量下载链接生成 ===== */}
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
          <button
            className="button"
            onClick={handleGenerateIdmLinks}
            style={{ flex: 1 }}
          >
            ⚡ 生成批量下载链接
          </button>
          <button
            className="button button-secondary"
            onClick={handleStageLinks}
            style={{ flex: 1 }}
            title="把当前生成的链接追加到下方暂存区（自动去重）"
          >
            📥 暂存链接
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            className="button button-secondary"
            onClick={handleCopyLinks}
            style={{ flex: 1 }}
          >
            📋 复制当前
          </button>
          <button
            className="button button-secondary"
            onClick={() => setIdmLinks('')}
            style={{ flex: 0.5 }}
            title="清空输出窗口"
          >
            🗑
          </button>
        </div>
        <div style={{ fontSize: '10px', color: '#777', marginTop: '6px', lineHeight: '1.5' }}>
          💡 跨多页挑选时：每页生成后点「暂存链接」自动累计到暂存区；最后在暂存区「全选复制」全部链接到 txt 文件，再交给 IDM 从文本文件导入。
        </div>
      </div>

      <button className="button refresh-btn" onClick={onRefresh}>🔄 刷新</button>

      {/* ===== 暂存链接区（刷新键下方） ===== */}
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
          <button
            className="button"
            onClick={handleCopyStagedLinks}
            style={{ flex: 1 }}
            disabled={!stagedLinks.trim()}
          >
            📋 全选复制
          </button>
          <button
            className="button button-secondary"
            onClick={handleClearStaged}
            style={{ flex: 0.5 }}
            disabled={!stagedLinks.trim()}
            title="清空暂存区"
          >
            🗑
          </button>
        </div>
        <div style={{ fontSize: '10px', color: '#777', marginTop: '6px', lineHeight: '1.5' }}>
          💡 每次「暂存链接」会把当前生成区的直链去重后追加到此处；攒够数量后点「全选复制」，粘贴到 txt 文件保存，再用 IDM【任务 → 导入 → 从文本文件导入】批量下载。
        </div>
      </div>
    </div>
  )
}