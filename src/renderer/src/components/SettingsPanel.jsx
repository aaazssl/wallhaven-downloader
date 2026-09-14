// src/renderer/src/components/SettingsPanel.jsx
import React, { useRef, useState } from 'react'
import { PIXIV_TABS } from './TypeTabs'

export default function SettingsPanel({ 
  apiKey, 
  setApiKey, 
  concurrency, 
  setConcurrency, 
  downloadDir, 
  onSelectDir, 
  onSelectYandereDir,
  onSelectPixivDir,
  onClearCache, 
  onDeleteAll,
  defaultSource,
  setDefaultSource,
  hardwareAcceleration,
  setHardwareAcceleration,
  onClose,
  useProxy,
  setUseProxy,
  proxyPort,
  setProxyPort,
  // ===== yande.re 独立配置（与 wallhaven 配置隔离） =====
  yandereConfig,
  setYandereConfig,
  // ===== pixiv 独立配置（与另两站隔离） =====
  pixivConfig,
  setPixivConfig,
  onPixivLogin,
  bgColor,
  setBgColor,
  bgImage,
  setBgImage
}) {
  const fileInputRef = useRef(null)
  // 当前设置分区：system / wallhaven / yandere / pixiv
  const [activeTab, setActiveTab] = useState('system')

  const handleBgColorChange = (e) => {
    const color = e.target.value
    setBgColor(color)
    localStorage.setItem('bg_color', color)
    // 清除背景图片
    if (bgImage) {
      setBgImage('')
      localStorage.removeItem('bg_image')
    }
  }

  const handleBgImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target.result
      setBgImage(dataUrl)
      localStorage.setItem('bg_image', dataUrl)
      // 清除背景颜色
      setBgColor('')
      localStorage.removeItem('bg_color')
    }
    reader.readAsDataURL(file)
  }

  const handleResetBg = () => {
    setBgColor('')
    setBgImage('')
    localStorage.removeItem('bg_color')
    localStorage.removeItem('bg_image')
  }

  // yande.re 配置更新辅助函数
  const updateYandereConfig = (key, value) => {
    setYandereConfig(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>软件设置</h2>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="settings-content">
        {/* ===== 设置分区（常驻标签） ===== */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => setActiveTab('system')}
          >
            ⚙️ 系统设置
          </button>
          <button
            className={`settings-tab ${activeTab === 'wallhaven' ? 'active' : ''}`}
            onClick={() => setActiveTab('wallhaven')}
          >
            🖼️ Wallhaven
          </button>
          <button
            className={`settings-tab ${activeTab === 'yandere' ? 'active' : ''}`}
            onClick={() => setActiveTab('yandere')}
          >
            🎌 yande.re
          </button>
          <button
            className={`settings-tab ${activeTab === 'pixiv' ? 'active' : ''}`}
            onClick={() => setActiveTab('pixiv')}
          >
            🎨 pixiv
          </button>
        </div>

        {/* ===== 系统基本设置 ===== */}
        {activeTab === 'system' && (
          <>
            <div className="setting-item">
              <label>全局 VPN 代理</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={useProxy}
                    onChange={(e) => setUseProxy(e.target.checked)}
                  />
                  启用代理
                </label>
                <input
                  type="number"
                  className="input"
                  placeholder="端口号"
                  value={proxyPort}
                  onChange={(e) => setProxyPort(Number(e.target.value))}
                  disabled={!useProxy}
                  style={{ width: '100px' }}
                />
                <span style={{ color: '#aaa', fontSize: '12px' }}>默认: 12450</span>
              </div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', lineHeight: '1.5' }}>
                💡 作用于全部三个图源：开启后软件的搜索、抓取、下载都会走本地代理（由你电脑上的 VPN/加速器提供）
              </div>
            </div>

            <div className="setting-item">
              <label>默认图片来源</label>
              <select
                className="input"
                value={defaultSource}
                onChange={(e) => setDefaultSource(e.target.value)}
              >
                <option value="wallhaven">🖼️ Wallhaven</option>
                <option value="yandere">🎌 yande.re</option>
                <option value="pixiv">🎨 pixiv</option>
              </select>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                💡 下次启动软件时默认打开的图源
              </div>
            </div>

            {/* 硬件加速开关（需重启生效） */}
            <div className="setting-item">
              <label>硬件加速</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={hardwareAcceleration}
                  onChange={(e) => setHardwareAcceleration(e.target.checked)}
                />
                启用 GPU 硬件加速（需重启软件生效）
              </label>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', lineHeight: '1.5' }}>
                💡 默认关闭（使用软件渲染，兼容性最好）。开启后图片滚动、动画会更流畅，CPU 占用更低；但少数机器/显卡驱动下可能出现卡顿或异常，若遇到请关回去
              </div>
            </div>

            <div className="setting-item">
              <label>背景设置</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '4px' }}>自定义颜色:</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="color"
                      value={bgColor || '#1a1a2e'}
                      onChange={handleBgColorChange}
                      style={{ width: '48px', height: '32px', border: 'none', cursor: 'pointer', background: 'transparent' }}
                    />
                    <span style={{ fontSize: '12px', color: '#888' }}>点击选择颜色</span>
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '4px' }}>自定义背景图片:</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleBgImageUpload}
                    style={{ display: 'none' }}
                  />
                  <button onClick={() => fileInputRef.current.click()} className="button button-secondary">
                    选择图片
                  </button>
                  {bgImage && <span style={{ fontSize: '11px', color: '#4caf50', marginLeft: '8px' }}>✓ 已设置</span>}
                </div>
                {(bgColor || bgImage) && (
                  <button onClick={handleResetBg} className="danger-btn" style={{ padding: '4px 12px', fontSize: '12px' }}>
                    恢复默认背景
                  </button>
                )}
              </div>
            </div>

            <div className="setting-item">
              <label>下载缓存</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={onClearCache} className="button button-secondary">清空下载缓存</button>
                <button onClick={onDeleteAll} className="danger-btn">清理并删除</button>
              </div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', lineHeight: '1.5' }}>
                💡 清空下载缓存：只清空三个图源的下载记录，不删除已下载的文件<br />
                ⚠️ 清理并删除：会删除三个图源下载文件夹内的全部已下载图片，不可恢复（会二次确认）
              </div>
            </div>
          </>
        )}

        {/* ===== Wallhaven 配置（选中 wallhaven 时显示） ===== */}
        {activeTab === 'wallhaven' && (
          <>
            <div className="setting-item">
              <label>Wallhaven API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </div>

            <div className="setting-item">
              <label>Wallhaven 并发线程 (8-16)</label>
              <input 
                type="number" 
                min="8" 
                max="16" 
                value={concurrency} 
                onChange={(e) => setConcurrency(Number(e.target.value))} 
              />
            </div>

            <div className="setting-item">
              <label>下载目录</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input readOnly value={downloadDir || '未选择'} style={{ flex: 1 }} />
                <button onClick={onSelectDir}>浏览</button>
              </div>
            </div>

            {/* 代理已统一到「系统设置」中全局管理 */}
          </>
        )}

        {/* ===== pixiv 独立配置（选中 pixiv 时显示） ===== */}
        {activeTab === 'pixiv' && (
          <>
            <div className="setting-item">
              <label>pixiv 并发下载 (1-12)</label>
              <input
                type="number"
                min="1"
                max="12"
                value={pixivConfig?.concurrency || 6}
                onChange={(e) => setPixivConfig(prev => ({ ...prev, concurrency: Math.max(1, Math.min(12, Number(e.target.value) || 6)) }))}
              />
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', lineHeight: '1.5' }}>
                💡 并发越大下载越快（多条连接才能跑满带宽）；太高有被限流（429）的风险，建议 6~10
              </div>
            </div>

            <div className="setting-item">
              <label>内容显示过滤</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={pixivConfig?.showR18 ?? true}
                    onChange={(e) => setPixivConfig(prev => ({ ...prev, showR18: e.target.checked }))}
                  />
                  显示 R-18 作品
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={pixivConfig?.showAI ?? true}
                    onChange={(e) => setPixivConfig(prev => ({ ...prev, showAI: e.target.checked }))}
                  />
                  显示 AI 生成作品
                </label>
              </div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', lineHeight: '1.5' }}>
                💡 这是软件内的过滤开关（只能"隐藏"）。pixiv 服务端还会按你账号的设置过滤一次，<b>没在官网开启时接口根本不会返回 AI / R-18 作品</b>，请点下方按钮到官网开启
              </div>
              <button
                className="button button-secondary"
                style={{ marginTop: '8px' }}
                onClick={() => window.electronAPI.openExternal('https://www.pixiv.net/settings/viewing')}
              >
                🔧 打开 pixiv 浏览设置（开启 R-18 / AI 显示）
              </button>
            </div>

            {/* 主界面标签自定义（勾选后显示在顶部第二行，持久保存） */}
            <div className="setting-item">
              <label>主界面标签</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px' }}>
                {PIXIV_TABS.map(tab => {
                  const cur = Array.isArray(pixivConfig?.visibleTabs) ? pixivConfig.visibleTabs : []
                  const checked = cur.includes(tab.id)
                  return (
                    <label key={tab.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? cur.filter(x => x !== tab.id) : [...cur, tab.id]
                          // 按预设顺序重排，保证顶部标签顺序稳定
                          const ordered = PIXIV_TABS.map(t => t.id).filter(id => next.includes(id))
                          setPixivConfig(prev => ({ ...prev, visibleTabs: ordered }))
                        }}
                      />
                      {tab.name}
                    </label>
                  )
                })}
              </div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '6px', lineHeight: '1.5' }}>
                💡 勾选的标签会显示在主界面顶部第二行（顺序自动排列，未勾选的自动补位）；全部勾选时一行放不下会自动换行。设置会长期保存
              </div>
            </div>

            {/* 浏览大图画质（用于避免"中等图→原图"自动切换带来的观感问题） */}
            <div className="setting-item">
              <label>浏览大图画质</label>
              <select
                className="input"
                value={pixivConfig?.previewQuality || 'auto'}
                onChange={(e) => setPixivConfig(prev => ({ ...prev, previewQuality: e.target.value }))}
              >
                <option value="auto">自动（先中等图，再无缝切原图）</option>
                <option value="regular">仅中等图（最快、省流量）</option>
                <option value="original">仅原图（最清晰、加载较慢）</option>
              </select>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '6px', lineHeight: '1.5' }}>
                💡 "自动"会先秒显中等图、随后无缝换成原图；若觉得切换不舒适或想省流量，可选"仅中等图"
              </div>
            </div>
            {/* 详情页大图预加载（数量可自定义：向后多、向前少） */}
            <div className="setting-item">
              <label>详情页预加载</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  向后
                  <input
                    type="number"
                    min="0"
                    max="10"
                    className="input"
                    value={pixivConfig?.preloadForward ?? 4}
                    onChange={(e) => setPixivConfig(prev => ({ ...prev, preloadForward: Math.max(0, Math.min(10, Number(e.target.value) || 0)) }))}
                    style={{ width: '70px' }}
                  />
                  张
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  向前
                  <input
                    type="number"
                    min="0"
                    max="10"
                    className="input"
                    value={pixivConfig?.preloadBackward ?? 1}
                    onChange={(e) => setPixivConfig(prev => ({ ...prev, preloadBackward: Math.max(0, Math.min(10, Number(e.target.value) || 0)) }))}
                    style={{ width: '70px' }}
                  />
                  张
                </label>
              </div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '6px', lineHeight: '1.5' }}>
                💡 在作品详情页查看大图时，提前加载前后若干张（0~10）。向后多设一些更符合"翻页多数往后"的习惯；设太大会增加后台请求量
              </div>
            </div>

            {/* 代理已统一到「系统设置」中全局管理 */}

            <div className="setting-item">
              <label>pixiv 下载目录</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input readOnly value={pixivConfig?.downloadDir || '未选择'} style={{ flex: 1 }} />
                <button onClick={onSelectPixivDir}>浏览</button>
              </div>
            </div>

            <div className="setting-item">
              <label>pixiv 站点地址</label>
              <input
                type="text"
                value={pixivConfig?.baseUrl || 'https://www.pixiv.net'}
                onChange={(e) => setPixivConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
              />
            </div>

            <div className="setting-item">
              <label>pixiv 账号登录</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="button" onClick={onPixivLogin}>🔑 打开 pixiv 登录窗口</button>
                {pixivConfig?.cookie
                  ? <span style={{ fontSize: '11px', color: '#4caf50' }}>✓ 已登录（已保存 Cookie）</span>
                  : <span style={{ fontSize: '11px', color: '#888' }}>未登录</span>}
              </div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', lineHeight: '1.5' }}>
                💡 点击后在弹出窗口中正常登录 pixiv（可过验证码），软件会自动抓取并保存 Cookie，用于浏览/下载受限内容（请先在「系统设置」里开启代理）
              </div>
            </div>

            <div className="setting-item">
              <label>pixiv 登录 Cookie（可手动填写）</label>
              <input
                type="password"
                placeholder="可留空，仅公开排行榜"
                value={pixivConfig?.cookie || ''}
                onChange={(e) => setPixivConfig(prev => ({ ...prev, cookie: e.target.value }))}
              />
            </div>
          </>
        )}

        {/* ===== yande.re 独立配置（选中 yandere 时显示） ===== */}
        {activeTab === 'yandere' && (
          <>
            <div className="setting-item">
              <label>yande.re 并发下载 (1-10)</label>
              <input 
                type="number" 
                min="1" 
                max="10" 
                value={yandereConfig.concurrency || 6}
                onChange={(e) => updateYandereConfig('concurrency', Math.max(1, Math.min(10, Number(e.target.value) || 6)))}
              />
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', lineHeight: '1.5' }}>
                💡 yande.re 已支持多并发下载（默认 3）。<br />
                选 1 = 串行逐张下载；调高更快但若网络波动可能出现个别重试，配合"重新下载错误图片"按钮补齐即可。
              </div>
            </div>

            {/* 代理已统一到「系统设置」中全局管理 */}

            <div className="setting-item">
              <label>yande.re 下载目录</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input readOnly value={yandereConfig?.downloadDir || '未选择'} style={{ flex: 1 }} />
                <button onClick={onSelectYandereDir}>浏览</button>
              </div>
            </div>

            <div className="setting-item">
              <label>yande.re API 地址</label>
              <input 
                type="text" 
                value={yandereConfig.baseUrl || 'https://yande.re'}
                onChange={(e) => updateYandereConfig('baseUrl', e.target.value)} 
              />
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                💡 一般无需修改，保持默认即可
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}