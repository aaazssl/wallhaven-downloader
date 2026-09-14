// src/renderer/src/components/TypeTabs.jsx
// 顶部第二行：横向排列当前来源的"分区 / 浏览类型"标签
// （由原左侧栏的按钮组迁移而来，用于给左侧栏腾出空间）
import React from 'react'

// Wallhaven 分区（sort/order 与后端搜索参数一致；顶级列表会附带时间范围）
const WALLHAVEN_TABS = [
  { id: 'all', name: '全部', sort: 'relevance', order: 'desc' },
  { id: 'latest', name: '最新', sort: 'date_added', order: 'desc' },
  { id: 'recent-hot', name: '近期热门', sort: 'hot', order: 'desc' },
  { id: 'toplist', name: '顶级列表', sort: 'toplist', order: 'desc' },
  { id: 'random', name: '随机', sort: 'random', order: 'desc' },
  { id: 'most-views', name: '最多浏览', sort: 'views', order: 'desc' },
  { id: 'top-favorites', name: '最多收藏', sort: 'favorites', order: 'desc' }
]

// yande.re 浏览类型
const YANDERE_TABS = [
  { id: 'popular_recent', name: '前24小时' },
  { id: 'popular_by_day', name: '按日' },
  { id: 'popular_by_week', name: '按周' },
  { id: 'popular_by_month', name: '按月' },
  { id: 'latest', name: '最新' }
]

// pixiv 浏览类型（含 R-18 与 AI 榜单）
// 注意：AI 榜只有日榜（weekly_ai / monthly_ai 实测 404 不存在）
//
// ⚠️ 本常量是 pixiv 浏览类型的【唯一数据源】，被三处使用：
//   1) 顶部标签栏渲染（本文件的 pixiv 分支）
//   2) 设置页「主界面标签」勾选（SettingsPanel 引用 PIXIV_TABS）
//   3) 后端 src/main/index.js 的 RANKING_MODES 白名单（决定哪些模式会被真正请求）
// 新增/删除榜单类型时，务必同步改 (3)，否则该标签会静默显示成"日榜"
export const PIXIV_TABS = [
  { id: 'discovery', name: '发现' },
  { id: 'follow', name: '我的关注' },
  { id: 'daily', name: '日榜' },
  { id: 'weekly', name: '周榜' },
  { id: 'monthly', name: '月榜' },
  { id: 'rookie', name: '新人榜' },
  { id: 'original', name: '原创榜' },
  { id: 'daily_r18', name: '日榜R18' },
  { id: 'weekly_r18', name: '周榜R18' },
  { id: 'monthly_r18', name: '月榜R18' },
  { id: 'daily_ai', name: 'AI日榜' },
  { id: 'daily_r18_ai', name: 'AI日榜R18' }
]

// pixiv 标签的默认可见项（其余可在 设置 → pixiv 里自行勾选）
export const PIXIV_DEFAULT_TABS = ['daily', 'weekly', 'monthly']

export default function TypeTabs({
  source,
  activeCategory,
  onWallhavenSelect,
  topRange,
  yandereHotType,
  onYandereSelect,
  pixivMode,
  onPixivSelect,
  visibleTabs
}) {
  if (source === 'wallhaven') {
    return (
      <div className="type-tabs">
        {WALLHAVEN_TABS.map(tab => (
          <button
            key={tab.id}
            className={`type-tab ${activeCategory === tab.id ? 'active' : ''}`}
            onClick={() => {
              if (tab.id === 'toplist') onWallhavenSelect(tab.sort, tab.order, tab.id, topRange)
              else onWallhavenSelect(tab.sort, tab.order, tab.id)
            }}
          >
            {tab.name}
          </button>
        ))}
      </div>
    )
  }

  if (source === 'yandere') {
    return (
      <div className="type-tabs">
        {YANDERE_TABS.map(tab => (
          <button
            key={tab.id}
            className={`type-tab ${yandereHotType === tab.id ? 'active' : ''}`}
            onClick={() => onYandereSelect(tab.id)}
          >
            {tab.name}
          </button>
        ))}
      </div>
    )
  }

  if (source === 'pixiv') {
    // 按用户设置过滤可见标签（未配置时显示全部）
    const visibleSet = Array.isArray(visibleTabs) ? new Set(visibleTabs) : null
    const tabs = visibleSet ? PIXIV_TABS.filter(t => visibleSet.has(t.id)) : PIXIV_TABS
    return (
      <div className="type-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`type-tab ${pixivMode === tab.id ? 'active' : ''}`}
            onClick={() => onPixivSelect(tab.id)}
          >
            {tab.name}
          </button>
        ))}
      </div>
    )
  }

  return null
}
