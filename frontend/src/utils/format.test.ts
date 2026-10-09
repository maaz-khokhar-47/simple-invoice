import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueHint, formatDate, formatMoney } from './format'

describe('formatMoney', () => {
  it('shows the currency code, thousands separators and 2 decimals', () => {
    expect(formatMoney(2180, 'AUD')).toBe('AUD 2,180.00')
    expect(formatMoney(728.6, 'GBP')).toBe('GBP 728.60')
  })

  it('puts the minus sign before the currency code', () => {
    expect(formatMoney(-20, 'USD')).toBe('-USD 20.00')
  })
})

describe('formatDate', () => {
  it('formats ISO dates for display', () => {
    expect(formatDate('2026-06-03')).toBe('3 Jun 2026')
  })
})

describe('dueHint', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with a capital and counts days from today', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 9, 10, 0))

    expect(dueHint('2026-10-09', 'Pending')).toBe('Due today')
    expect(dueHint('2026-10-10', 'Draft')).toBe('Due tomorrow')
    expect(dueHint('2026-11-08', 'Pending')).toBe('Due in 30 days')
    expect(dueHint('2026-10-07', 'Overdue')).toBe('2 days overdue')
    expect(dueHint('2026-10-01', 'Paid')).toBeNull()
  })
})
