import React, { useState, useRef, useEffect } from 'react'

const ImageCard = React.memo(function ImageCard({ img, isSelected, onToggleSelect, onImageClick, status, progress }) {
  const imgRef = useRef(null)
  const [aspectRatio, setAspectRatio] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const el = imgRef.current
    if (!el) return
    const handleLoad = () => {
      if (el.naturalWidth && el.naturalHeight) {
        setAspectRatio(el.naturalWidth / el.naturalHeight)
      }
      setLoaded(true)
    }
    if (el.complete && el.naturalWidth) {
      handleLoad()
    } else {
      el.addEventListener('load', handleLoad)
      return () => el.removeEventListener('load', handleLoad)
    }
  }, [img.thumb])

  const cardStyle = {}
  if (aspectRatio) {
    // 根据宽高比自适应：仅宽图横向展开；竖图不再纵向跨行（避免卡片下方大片空白）
    if (aspectRatio > 1.5) {
      // 宽图
      cardStyle.gridColumn = 'span 2'
    }
  }

  return (
    <div 
      className={`image-card ${isSelected ? 'selected' : ''} ${!loaded ? 'image-loading' : ''}`}
      style={cardStyle}
      onClick={() => onImageClick && onImageClick(img.id)}
    >
      <div className="checkbox-wrapper">
        <input 
          type="checkbox" 
          checked={isSelected} 
          onChange={() => onToggleSelect(img.id)} 
          onClick={e => e.stopPropagation()} 
        />
      </div>

      {/* pixiv 多页作品：右上角显示总页数（如 5p） */}
      {img.pageCount > 1 && (
        <span className="page-count-badge">{img.pageCount}p</span>
      )}

      <button 
        className="preview-btn"
        onClick={(e) => {
          e.stopPropagation()
          onImageClick && onImageClick(img.id)
        }}
        title="预览大图"
      >
        🔍
      </button>

      <div className="image-card-img-wrapper">
        {/* 加载中的骨架屏占位（美观的流光渐变，加载完成后隐藏） */}
        {!loaded && <div className="image-skeleton" />}
        <img 
          ref={imgRef}
          src={img.thumb} 
          alt={img.id} 
          loading="lazy"
          decoding="async"
          width={img.width || undefined}
          height={img.height || undefined}
          className={loaded ? 'loaded' : ''}
          style={aspectRatio ? { aspectRatio: `${aspectRatio}` } : {}}
        />
        {/* 左下角 AI 生成标识 */}
        {img.aiType === 2 && <span className="ai-badge">AI</span>}
      </div>
      <div className="image-info">
        <span className="image-id">{img.id}</span>
        {status && <span className={`download-status ${status}`}>{status === 'downloading' && `${Math.round(progress || 0)}%`}{status === 'completed' && '✓ 完成'}{status === 'failed' && '✗ 失败'}{status === 'skipped' && '⏭ 跳过'}</span>}
      </div>
      {status === 'downloading' && <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress || 0}%` }}></div></div>}
    </div>
  )
})

export default function ImageGrid({ 
  images, 
  selectedIds, 
  onToggleSelect, 
  onSelectAll, 
  onLoadMore, 
  hasMore, 
  loading, 
  downloadTasks,
  onImageClick
}) {
  const getTaskStatus = (id) => downloadTasks.find(t => t.id === id)?.status
  const getProgress = (id) => downloadTasks.find(t => t.id === id)?.progress

  // 滚动到底部自动加载下一页（IntersectionObserver，开销低）
  const sentinelRef = useRef(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        onLoadMore && onLoadMore()
      }
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loading, onLoadMore, images.length])

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
            <ImageCard
              key={img.id}
              img={img}
              isSelected={selectedIds.has(img.id)}
              onToggleSelect={onToggleSelect}
              onImageClick={onImageClick}
              status={status}
              progress={progress}
            />
          )
        })}
      </div>
      {hasMore && <div className="load-more"><button className="button" onClick={onLoadMore} disabled={loading}>{loading ? '加载中...' : '加载更多（滚动到底自动加载）'}</button></div>}
      {/* 滚动哨兵：进入视口即自动加载下一页 */}
      <div ref={sentinelRef} style={{ height: '1px' }} />
    </>
  )
}
