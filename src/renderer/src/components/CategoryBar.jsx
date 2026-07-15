// src/renderer/src/components/CategoryBar.jsx
import React from 'react';

export default function CategoryBar({ onSelectCategory, activeCategory }) {
const categories = [
  { id: 'latest', name: '最新', sort: 'date_added', order: 'desc' },
  { id: 'hot', name: '热门', sort: 'toplist', order: 'desc', range: '1M' },  // 👈 只为热门添加 range 参数
  { id: 'random', name: '随机', sort: 'random', order: 'desc' },
  { id: 'most-views', name: '最多浏览', sort: 'views', order: 'desc' },
  { id: 'top-favorites', name: '最多收藏', sort: 'favorites', order: 'desc' },
];
  return (
    <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', borderBottom: '1px solid #3d3d3d', paddingBottom: '10px' }}>
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelectCategory(cat.sort, cat.order, cat.id)}
          style={{
            padding: '6px 16px',
            background: activeCategory === cat.id ? '#4c9aff' : '#3d3d3d',
            color: 'white',
            border: 'none',
            borderRadius: '20px',
            cursor: 'pointer',
            transition: 'background 0.2s',
            fontSize: '14px'
          }}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}