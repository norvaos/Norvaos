'use client'

import { useState, useMemo } from 'react'

export type Period = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface DateRange {
  start: Date
  end: Date
}

export interface PeriodFilter {
  period: Period
  setPeriod: (p: Period) => void
  current: DateRange
  previous: DateRange
  label: string
  comparisonLabel: string
}

function getStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getStartOfWeek(date: Date): Date {
  const d = getStartOfDay(date)
  const day = d.getDay()
  // Monday as start of week
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d
}

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function getStartOfQuarter(date: Date): Date {
  const quarter = Math.floor(date.getMonth() / 3)
  return new Date(date.getFullYear(), quarter * 3, 1)
}

function getStartOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1)
}

function computeRanges(period: Period, now: Date): { current: DateRange; previous: DateRange } {
  const today = getStartOfDay(now)
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

  switch (period) {
    case 'day': {
      const prevStart = new Date(today)
      prevStart.setDate(prevStart.getDate() - 1)
      const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth(), prevStart.getDate(), 23, 59, 59, 999)
      return {
        current: { start: today, end: endOfToday },
        previous: { start: prevStart, end: prevEnd },
      }
    }
    case 'week': {
      const currentStart = getStartOfWeek(today)
      const currentEnd = endOfToday
      const prevStart = new Date(currentStart)
      prevStart.setDate(prevStart.getDate() - 7)
      const prevEnd = new Date(currentStart)
      prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1)
      return {
        current: { start: currentStart, end: currentEnd },
        previous: { start: prevStart, end: prevEnd },
      }
    }
    case 'month': {
      const currentStart = getStartOfMonth(today)
      const currentEnd = endOfToday
      const prevStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1)
      const prevEnd = new Date(currentStart)
      prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1)
      return {
        current: { start: currentStart, end: currentEnd },
        previous: { start: prevStart, end: prevEnd },
      }
    }
    case 'quarter': {
      const currentStart = getStartOfQuarter(today)
      const currentEnd = endOfToday
      const prevStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 3, 1)
      const prevEnd = new Date(currentStart)
      prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1)
      return {
        current: { start: currentStart, end: currentEnd },
        previous: { start: prevStart, end: prevEnd },
      }
    }
    case 'year': {
      const currentStart = getStartOfYear(today)
      const currentEnd = endOfToday
      const prevStart = new Date(currentStart.getFullYear() - 1, 0, 1)
      const prevEnd = new Date(currentStart)
      prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1)
      return {
        current: { start: currentStart, end: currentEnd },
        previous: { start: prevStart, end: prevEnd },
      }
    }
  }
}

const PERIOD_LABELS: Record<Period, { label: string; comparison: string }> = {
  day: { label: 'Today', comparison: 'vs Yesterday' },
  week: { label: 'This Week', comparison: 'vs Last Week' },
  month: { label: 'This Month', comparison: 'vs Last Month' },
  quarter: { label: 'This Quarter', comparison: 'vs Last Quarter' },
  year: { label: 'This Year', comparison: 'vs Last Year' },
}

export function usePeriodFilter(defaultPeriod: Period = 'month'): PeriodFilter {
  const [period, setPeriod] = useState<Period>(defaultPeriod)

  const { current, previous, label, comparisonLabel } = useMemo(() => {
    const now = new Date()
    const ranges = computeRanges(period, now)
    return {
      ...ranges,
      label: PERIOD_LABELS[period].label,
      comparisonLabel: PERIOD_LABELS[period].comparison,
    }
  }, [period])

  return { period, setPeriod, current, previous, label, comparisonLabel }
}
