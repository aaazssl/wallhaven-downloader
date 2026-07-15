import React from 'react'

export default function SettingsBar({ apiKey, setApiKey, concurrency, setConcurrency, downloadDir, onSelectDir }) {
  return (
    <div className="settings-bar">
      <div><span>API Key:</span><input type="password" className="input" placeholder="可选" value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={{ width: '200px' }} /></div>
      <div><span>并发线程:</span><input type="number" className="input" min="8" max="16" value={concurrency} onChange={(e) => setConcurrency(Math.min(16, Math.max(8, parseInt(e.target.value) || 16)))} style={{ width: '80px' }} /><span>(8-16)</span></div>
      <div style={{ flex: 1 }}><span>下载目录:</span><input type="text" className="input" value={downloadDir || '未选择'} readOnly style={{ flex: 1 }} /><button className="button button-secondary" onClick={onSelectDir}>浏览</button></div>
    </div>
  )
}