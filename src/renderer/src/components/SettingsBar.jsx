import React, { useState } from 'react'

export default function SearchBar({ onSearch, loading }) {
  const [query, setQuery] = useState('')
  const handleSubmit = (e) => { e.preventDefault(); if (query.trim()) onSearch(query) }
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px' }}>
      <input type="text" className="input" placeholder="输入关键词搜索壁纸..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }} />
      <button type="submit" className="button" disabled={loading}>{loading ? '搜索中...' : '搜索'}</button>
    </form>
  )
}