import React from 'react'

export default function SettingsPanel({ apiKey, setApiKey, concurrency, setConcurrency, downloadDir, onSelectDir, onClearCache, onClose }) {
  return (
    <div className="settings-panel">
      <div className="settings-header"><h2>软件设置</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="settings-content">
        <div className="setting-item"><label>API Key</label><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></div>
        <div className="setting-item"><label>并发线程 (8-16)</label><input type="number" min="8" max="16" value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} /></div>
        <div className="setting-item"><label>下载目录</label><div><input readOnly value={downloadDir || '未选择'} /><button onClick={onSelectDir}>浏览</button></div></div>
        <div className="setting-item"><button onClick={onClearCache} className="danger-btn">清空下载缓存</button></div>
      </div>
    </div>
  )
}