import React from 'react'

export default function DownloadPanel({ selectedCount, totalCount, onSelectAll, onDownload, downloading, downloadTasks, onRetryFailed, onCancelDownload, onClearTasks }) {
  const completed = downloadTasks.filter(t => t.status === 'completed').length
  const skipped = downloadTasks.filter(t => t.status === 'skipped').length
  const failed = downloadTasks.filter(t => t.status === 'failed').length
  const inProgress = downloadTasks.filter(t => t.status === 'downloading').length

  return (
    <div className="download-panel">
      {/* 顶部操作区：结构性固定（flex-shrink:0，不随内容滚动） */}
      <div className="download-panel-header">
        <h3 style={{ marginBottom: '12px' }}>下载面板</h3>
        <div style={{ marginBottom: '12px' }}>已选择: {selectedCount} / {totalCount}</div>
        <button className="button" onClick={onDownload} disabled={downloading || selectedCount === 0} style={{ width: '100%', marginBottom: '8px' }}>
          {downloading ? '下载中...' : `批量下载 (${selectedCount})`}
        </button>
        {/* 全选当前页：常驻按钮，全部选中时显示"取消全选" */}
        <button className="button button-secondary" onClick={onSelectAll} style={{ width: '100%' }}>
          {selectedCount > 0 && selectedCount === totalCount && totalCount > 0 ? '取消全选' : `全选当前页`}
        </button>
      </div>

      {/* 中部内容区：独立滚动（进度 + 任务列表） */}
      <div className="download-panel-body">
        {(downloading || downloadTasks.length > 0) ? (
          <>
            {/* 清空下载列表按钮（下载完成或取消后可用） */}
            {!downloading && onClearTasks && (
              <button
                className="button button-secondary"
                onClick={onClearTasks}
                style={{ width: '100%', marginBottom: '8px', fontSize: '12px' }}
              >
                🗑 清空下载列表
              </button>
            )}
            <h4 style={{ marginBottom: '12px' }}>下载进度</h4>
            <div style={{ marginBottom: '12px', fontSize: '13px', display: 'flex', gap: '12px' }}>
              <span>✅ 完成: {completed}</span><span>⏭ 跳过: {skipped}</span><span>❌ 失败: {failed}</span><span>🔄 进行中: {inProgress}</span>
            </div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${downloadTasks.length ? ((completed + skipped) / downloadTasks.length) * 100 : 0}%` }}></div></div>
            {/* 取消下载按钮（下载过程中显示，点击后停止后续下载） */}
            {downloading && onCancelDownload && (
              <button
                className="button"
                onClick={onCancelDownload}
                style={{ width: '100%', marginTop: '8px', background: '#f44336' }}
              >
                ⏹ 取消下载
              </button>
            )}
            {failed > 0 && !downloading && onRetryFailed && (
              <button
                className="button"
                onClick={onRetryFailed}
                style={{ width: '100%', marginTop: '8px', background: '#ff9800' }}
              >
                🔄 重新下载出现错误的图片 ({failed})
              </button>
            )}
            <div className="download-task-list">
              {downloadTasks.slice().reverse().map(task => (
                <div key={task.id} className="task-item">
                  <div className="task-header"><span style={{ fontFamily: 'monospace' }}>{task.id}</span><span className={`download-status ${task.status}`}>{task.status === 'downloading' && `${Math.round(task.progress || 0)}%`}{task.status === 'completed' && '完成'}{task.status === 'failed' && '失败'}{task.status === 'skipped' && '已存在'}{task.status === 'cancelled' && '已取消'}</span></div>
                  {task.status === 'downloading' && <div className="progress-bar"><div className="progress-fill" style={{ width: `${task.progress || 0}%` }}></div></div>}
                  {task.error && <div style={{ fontSize: '10px', color: '#f44336' }}>{task.error}</div>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ padding: '16px', textAlign: 'center', color: '#888' }}>暂无下载任务</div>
        )}
      </div>
    </div>
  )
}