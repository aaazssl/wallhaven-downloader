import React, { useState } from 'react'

export default function Sidebar({
  onSearch,
  searchQuery,
  loading,
  activeCategory,
  onSelectCategory,
  topRange,
  setTopRange,
  categories,
  setCategories,
  purityFlags,
  setPurityFlags,
  onFilterChange,
  onRefresh,
  onOpenSettings
}) {
  const [localSearch, setLocalSearch] = useState(searchQuery)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (localSearch.trim()) onSearch(localSearch)
  }

  const topRangeOptions = [
    { label: '1天', value: '1d' },
    { label: '3天', value: '3d' },
    { label: '1周', value: '1w' },
    { label: '1月', value: '1M' },
    { label: '3月', value: '3M' },
    { label: '6月', value: '6M' },
    { label: '1年', value: '1y' }
  ]

  const categoriesList = [
    { id: 'all', name: '全部', sort: 'relevance', order: 'desc', showDateRange: false },
    { id: 'latest', name: '最新', sort: 'date_added', order: 'desc', showDateRange: false },
    { id: 'recent-hot', name: '近期热门', sort: 'toplist', order: 'desc', showDateRange: true },
    { id: 'toplist', name: '顶级列表', sort: 'toplist', order: 'desc', showDateRange: true },
    { id: 'random', name: '随机', sort: 'random', order: 'desc', showDateRange: false },
    { id: 'most-views', name: '最多浏览', sort: 'views', order: 'desc', showDateRange: false },
    { id: 'top-favorites', name: '最多收藏', sort: 'favorites', order: 'desc', showDateRange: false }
  ]

  const handleCategoryClick = (cat) => {
    if (cat.id === 'recent-hot' || cat.id === 'toplist') {
      onSelectCategory(cat.sort, cat.order, cat.id, topRange)
    } else {
      onSelectCategory(cat.sort, cat.order, cat.id)
    }
  }

  const handleTopRangeChange = (range) => {
    setTopRange(range)
    if (activeCategory === 'recent-hot' || activeCategory === 'toplist') {
      onSelectCategory('toplist', 'desc', activeCategory, range)
    }
  }

  return (
    <div className="sidebar">
      <form onSubmit={handleSubmit} className="sidebar-search">
        <input type="text" className="input" placeholder="搜索壁纸..." value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} />
        <button type="submit" className="button" disabled={loading}>🔍</button>
      </form>

      <div className="sidebar-section">
        <div className="section-title">分区</div>
        <div className="category-buttons">
          {categoriesList.map(cat => (
            <button
              key={cat.id}
              className={`category-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => handleCategoryClick(cat)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-title">排行榜时间范围</div>
        <div className="toprange-buttons">
          {topRangeOptions.map(opt => {
            const currentCat = categoriesList.find(c => c.id === activeCategory)
            const disabled = currentCat ? !currentCat.showDateRange : true
            return (
              <button
                key={opt.value}
                className={`toprange-btn ${topRange === opt.value ? 'active' : ''}`}
                onClick={() => handleTopRangeChange(opt.value)}
                disabled={disabled}
                style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-title">类别</div>
        <div className="filter-group">
          <label><input type="checkbox" checked={categories.general} onChange={() => setCategories({ ...categories, general: !categories.general })} /> 常规</label>
          <label><input type="checkbox" checked={categories.anime} onChange={() => setCategories({ ...categories, anime: !categories.anime })} /> 动漫</label>
          <label><input type="checkbox" checked={categories.people} onChange={() => setCategories({ ...categories, people: !categories.people })} /> 真人</label>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-title">图片等级</div>
        <div className="filter-group">
          <label><input type="checkbox" checked={purityFlags.sfw} onChange={(e) => setPurityFlags({ ...purityFlags, sfw: e.target.checked })} /> 正常 (SFW)</label>
          <label><input type="checkbox" checked={purityFlags.sketchy} onChange={(e) => setPurityFlags({ ...purityFlags, sketchy: e.target.checked })} /> 擦边 (Sketchy)</label>
          <label><input type="checkbox" checked={purityFlags.nsfw} onChange={(e) => setPurityFlags({ ...purityFlags, nsfw: e.target.checked })} /> 限制级 (NSFW)</label>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-title">分辨率</div>
        <input type="text" className="input" placeholder="例如 1920x1080" onChange={(e) => onFilterChange && onFilterChange('resolution', e.target.value)} />
      </div>

      <div className="sidebar-section">
        <div className="section-title">比例</div>
        <select className="input" onChange={(e) => onFilterChange && onFilterChange('ratio', e.target.value)}>
          <option value="">不限</option>
          <option value="16x9">16:9</option>
          <option value="16x10">16:10</option>
          <option value="4x3">4:3</option>
          <option value="21x9">21:9</option>
        </select>
      </div>

      <button className="button refresh-btn" onClick={onRefresh} disabled={loading}>🔄 刷新</button>
      <button className="button settings-btn" onClick={onOpenSettings}>⚙️ 软件设置</button>
    </div>
  )
}