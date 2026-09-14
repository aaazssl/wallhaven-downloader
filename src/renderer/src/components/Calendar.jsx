import React, { useState } from 'react'

const MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
const DAYS_OF_WEEK = ['日', '一', '二', '三', '四', '五', '六']

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

export default function Calendar({ selectedDate, onSelectDate }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1)
      setViewMonth(11)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1)
      setViewMonth(0)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const handleDateClick = (day) => {
    const date = new Date(viewYear, viewMonth, day)
    onSelectDate(date)
  }

  const isSelectedDate = (day) => {
    if (!selectedDate) return false
    return selectedDate.getFullYear() === viewYear &&
      selectedDate.getMonth() === viewMonth &&
      selectedDate.getDate() === day
  }

  const isToday = (day) => {
    return today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
  }

  const formatSelectedDate = () => {
    if (!selectedDate) return ''
    return `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日`
  }

  const days = []
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="calendar-day empty" />)
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(
      <div
        key={day}
        className={`calendar-day ${isSelectedDate(day) ? 'selected' : ''} ${isToday(day) ? 'today' : ''}`}
        onClick={() => handleDateClick(day)}
      >
        {day}
      </div>
    )
  }

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button className="calendar-nav" onClick={prevMonth}>‹</button>
        <span className="calendar-title">{viewYear}年 {MONTHS[viewMonth]}</span>
        <button className="calendar-nav" onClick={nextMonth}>›</button>
      </div>
      {selectedDate && (
        <div className="calendar-selected-date">{formatSelectedDate()}</div>
      )}
      <div className="calendar-weekdays">
        {DAYS_OF_WEEK.map(d => <div key={d} className="calendar-weekday">{d}</div>)}
      </div>
      <div className="calendar-days">
        {days}
      </div>
    </div>
  )
}