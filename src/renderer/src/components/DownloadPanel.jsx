import React from 'react'

export default function DownloadPanel({ selectedCount, totalCount, onSelectAll, onDownload, downloading, downloadTasks }) {
  const completed = downloadTasks.filter(t => t.status === 'completed').length
  const skipped = downloadTasks.filter(t => t.status === 'skipped').length
  const failed = downloadTasks.filter(t => t.status === 'failed').length
  const inProgress = downloadTasks.filter(t => t.status === 'downloading').length

  return (
    <div className="download-panel">
      <div style={{ padding: '16px', borderBottom: '1px solid #3d3d3d' }}>
        <h3 style={{ marginBottom: '12px' }}>下载面板</h3>
        <div style={{ marginBottom: '12px' }}>已选择: {selectedCount} / {totalCount}</div>
        <button className="button" onClick={onDownload} disabled={downloading || selectedCount === 0} style={{ width: '100%', marginBottom: '8px' }}>
          {downloading ? '下载中...' : `批量下载 (${selectedCount})`}
        </button>
        <button className="button button-secondary" onClick={onSelectAll} style={{ width: '100%' }}>全选当前页</button>
      </div>
      {(downloading || downloadTasks.length > 0) && (
        <div style={{ padding: '16px' }}>
          <h4 style={{ marginBottom: '12px' }}>下载进度</h4>
          <div style={{ marginBottom: '12px', fontSize: '13px', display: 'flex', gap: '12px' }}>
            <span>✅ 完成: {completed}</span><span>⏭ 跳过: {skipped}</span><span>❌ 失败: {failed}</span><span>🔄 进行中: {inProgress}</span>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${downloadTasks.length ? ((completed + skipped) / downloadTasks.length) * 100 : 0}%` }}></div></div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {downloadTasks.slice().reverse().map(task => (
              <div key={task.id} className="task-item">
                <div className="task-header"><span style={{ fontFamily: 'monospace' }}>{task.id}</span><span className={`download-status ${task.status}`}>{task.status === 'downloading' && `${Math.round(task.progress || 0)}%`}{task.status === 'completed' && '完成'}{task.status === 'failed' && '失败'}{task.status === 'skipped' && '已存在'}</span></div>
                {task.status === 'downloading' && <div className="progress-bar"><div className="progress-fill" style={{ width: `${task.progress || 0}%` }}></div></div>}
                {task.error && <div style={{ fontSize: '10px', color: '#f44336' }}>{task.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}