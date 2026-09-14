import React, { useState, useEffect } from 'react'

export default function ImagePreview({ imageId, onClose, onNext, onPrev, hasNext, hasPrev, source, image }) {
  const [imageData, setImageData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [imgSize, setImgSize] = useState(null)

  // 获取图片详情
  useEffect(() => {
    if (!imageId) return
    setLoading(true)
    setError(null)
    setImgSize(null)   // 切换图片时重置尺寸

    if (source === 'yandere' && image) {
      // yande.re 直接从已有的图片数据渲染，不需要额外请求
      setImageData({
        id: image.id,
        path: image.url,
        thumb: image.thumb,
        resolution: image.width && image.height ? `${image.width}x${image.height}` : '',
        score: image.score,
        rating: image.rating,
        source: 'yandere'
      })
      setLoading(false)
      return
    }

    // 注意：pixiv 不做预览浮层（点卡片直接进入 PixivIllustDetail 作品详情页），
    // 因此这里不再需要 pixiv 分支

    // Wallhaven 通过主进程获取详情
    window.electronAPI.fetchImageDetail(imageId)
      .then(data => {
        setImageData(data.data)
        setLoading(false)
      })
      .catch(err => {
        console.error('加载图片详情失败:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [imageId, source, image])

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext) onNext()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onPrev, onNext, hasPrev, hasNext])

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  // 计算图片实际显示尺寸：按窗口大小等比缩放，保证浏览框贴合图片高度（竖屏图不再下方留白）
  const handleImageLoad = (e) => {
    const img = e.target
    const naturalW = img.naturalWidth
    const naturalH = img.naturalHeight
    if (!naturalW || !naturalH) return
    // 预留下方信息面板空间（约 140px），并留出左右安全边距
    const maxW = Math.min(window.innerWidth * 0.85, 1400)
    const maxH = window.innerHeight * 0.72
    const scale = Math.min(maxW / naturalW, maxH / naturalH, 1)
    setImgSize({
      width: Math.round(naturalW * scale),
      height: Math.round(naturalH * scale)
    })
  }

  if (!imageId) return null

  return (
    <div className="preview-overlay" onClick={handleBackdropClick}>
      <div className="preview-container">
        <button className="preview-close" onClick={onClose}>✕</button>

        {hasPrev && (
          <button className="preview-nav preview-nav-prev" onClick={onPrev}>‹</button>
        )}
        {hasNext && (
          <button className="preview-nav preview-nav-next" onClick={onNext}>›</button>
        )}

        <div className="preview-content">
          {loading && (
            <div className="preview-loading">
              <div className="spinner"></div>
              <p>加载中...</p>
            </div>
          )}

          {error && (
            <div className="preview-error">
              <p>加载失败: {error}</p>
              <button onClick={() => window.location.reload()}>重试</button>
            </div>
          )}

          {!loading && !error && imageData && (
            <>
              <img 
                src={imageData.path} 
                alt={imageData.id}
                className="preview-image"
                style={imgSize || undefined}
                onLoad={handleImageLoad}
                onError={(e) => {
                  e.target.src = imageData.thumb || imageData.path
                }}
              />
              <div className="preview-info">
                <div className="preview-info-row">
                  <span className="preview-id">{imageData.id}</span>
                  <span className="preview-resolution">{imageData.resolution}</span>
                </div>
                <div className="preview-info-row">
                  {imageData.source === 'yandere' ? (
                    <>
                      {imageData.score !== undefined && <span>⭐ 评分: {imageData.score}</span>}
                      {imageData.rating && (
                        <span className={`purity-badge purity-${imageData.rating === 's' ? 'sfw' : imageData.rating === 'q' ? 'sketchy' : 'nsfw'}`}>
                          {imageData.rating === 's' ? '安全' : imageData.rating === 'q' ? '可疑' : '露骨'}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span>👁 {imageData.views || 0}</span>
                      <span>⭐ {imageData.favorites || 0}</span>
                      <span>📁 {imageData.file_size ? (imageData.file_size / 1024 / 1024).toFixed(1) : '-'} MB</span>
                      <span className={`purity-badge purity-${imageData.purity}`}>
                        {imageData.purity === 'sfw' ? '正常' : 
                         imageData.purity === 'sketchy' ? '擦边' : '限制级'}
                      </span>
                    </>
                  )}
                </div>
                {imageData.source !== 'yandere' && imageData.tags && imageData.tags.length > 0 && (
                  <div className="preview-tags">
                    {imageData.tags.slice(0, 8).map(tag => (
                      <span key={tag.id} className="preview-tag">{tag.name}</span>
                    ))}
                    {imageData.tags.length > 8 && <span>+{imageData.tags.length - 8}...</span>}
                  </div>
                )}
                {imageData.uploader && (
                  <div className="preview-uploader">
                    上传者: {imageData.uploader.username}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}