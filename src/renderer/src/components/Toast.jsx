// src/renderer/src/components/Toast.jsx
// 轻量应用内提示（替代 window.alert）：
//  · 不阻塞渲染（原生 alert 会冻结整个界面，下载中弹窗看起来就像"卡住"）
//  · 支持一键"复制"内容（方便把报错直接发出来排查）
//  · 自动按内容分级：含 ✅ → 成功；含 失败/错误/无法/请先… → 警告；其余 → 普通
import React, { useState, useEffect } from 'react'

let listeners = []
let seq = 0

function classify(msg) {
  if (msg.includes('✅')) return 'success'
  if (/失败|错误|无法|请先|不能|无效|不支持|没有可用|为空/.test(msg)) return 'warn'
  return 'info'
}

// 全局提示入口（可在任意组件里直接调用，无需 context）
export function toast(message, duration) {
  const msg = String(message ?? '')
  const type = classify(msg)
  const item = { id: ++seq, message: msg, type }
  const dur = duration || (type === 'info' ? 2600 : 4500)
  listeners.forEach((fn) => fn(item, dur))
}

export function ToastHost() {
  const [items, setItems] = useState([])

  useEffect(() => {
    const onAdd = (item, duration) => {
      setItems((prev) => [...prev, item])
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id))
      }, duration)
    }
    listeners.push(onAdd)
    return () => {
      listeners = listeners.filter((fn) => fn !== onAdd)
    }
  }, [])

  const close = (id) => setItems((prev) => prev.filter((x) => x.id !== id))

  const copy = async (msg) => {
    try {
      await navigator.clipboard.writeText(msg)
    } catch (e) {
      const ta = document.createElement('textarea')
      ta.value = msg
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }

  if (items.length === 0) return null

  return (
    <div className="toast-host">
      {items.map((it) => (
        <div key={it.id} className={`toast toast-${it.type}`}>
          <div className="toast-msg">{it.message}</div>
          <div className="toast-actions">
            {it.type !== 'success' && (
              <button className="toast-btn" onClick={() => copy(it.message)} title="复制内容">复制</button>
            )}
            <button className="toast-btn" onClick={() => close(it.id)} title="关闭">✕</button>
          </div>
        </div>
      ))}
    </div>
  )
}
