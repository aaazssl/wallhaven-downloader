import React from 'react'

export default function ImageGrid({ images, selectedIds, onToggleSelect, onSelectAll, onLoadMore, hasMore, loading, downloadTasks }) {
  const getTaskStatus = (id) => downloadTasks.find(t => t.id === id)?.status
  const getProgress = (id) => downloadTasks.find(t => t.id === id)?.progress

  if (images.length === 0) return <div style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>输入关键词开始搜索壁纸</div>

  return (
    <>
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>找到 {images.length} 张壁纸</span>
        <button className="button button-secondary" onClick={onSelectAll}>{selectedIds.size === images.length ? '取消全选' : '全选当前页'}</button>
      </div>
      <div className="image-grid">
        {images.map(img => {
          const status = getTaskStatus(img.id)
          const progress = getProgress(img.id)
          return (
            <div key={img.id} className={`image-card ${selectedIds.has(img.id) ? 'selected' : ''}`} onClick={() => onToggleSelect(img.id)}>
              <div className="checkbox-wrapper"><input type="checkbox" checked={selectedIds.has(img.id)} onChange={() => onToggleSelect(img.id)} onClick={e => e.stopPropagation()} /></div>
              <img src={img.thumb} alt={img.id} loading="lazy" />
              <div className="image-info">
                <span className="image-id">{img.id}</span>
                {status && <span className={`download-status ${status}`}>{status === 'downloading' && `${Math.round(progress || 0)}%`}{status === 'completed' && '✓ 完成'}{status === 'failed' && '✗ 失败'}{status === 'skipped' && '⏭ 跳过'}</span>}
              </div>
              {status === 'downloading' && <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress || 0}%` }}></div></div>}
            </div>
          )
        })}
      </div>
      {hasMore && <div className="load-more"><button className="button" onClick={onLoadMore} disabled={loading}>{loading ? '加载中...' : '加载更多'}</button></div>}
    </>
  )
}