import { describe, it, expect } from 'vitest'
import {
  calculateWorkingDays,
  getWorkingDaysForEmploye,
  getMauritiusPublicHolidays,
  DEFAULT_WORKING_DAYS,
} from './calculateWorkingDays'

describe('calculateWorkingDays', () => {
  it('counts 5 days Mon–Fri for a standard week', () => {
    expect(calculateWorkingDays('2026-04-13', '2026-04-17')).toBe(5)
  })

  it('returns 0 when end < start', () => {
    expect(calculateWorkingDays('2026-04-17', '2026-04-13')).toBe(0)
  })

  it('returns 1 for same day (weekday)', () => {
    expect(calculateWorkingDays('2026-04-14', '2026-04-14')).toBe(1)
  })

  it('returns 0 for same day on weekend', () => {
    // 2026-04-12 is a Sunday
    expect(calculateWorkingDays('2026-04-12', '2026-04-12')).toBe(0)
  })

  it('excludes weekends over two weeks', () => {
    // Mon 13 Apr → Fri 24 Apr = 10 working days (no holidays)
    expect(calculateWorkingDays('2026-04-13', '2026-04-24', { joursFeries: [] })).toBe(10)
  })

  it('excludes Mauritius Independence Day (12 March)', () => {
    // Mon 9 Mar → Fri 13 Mar: 5 days but 12 Mar is a holiday → 4
    expect(calculateWorkingDays('2026-03-09', '2026-03-13')).toBe(4)
  })

  it('respects a custom working pattern (Mon/Wed/Fri only)', () => {
    const threeDay = { ...DEFAULT_WORKING_DAYS, tue: false, thu: false }
    // Mon 13 Apr → Fri 17 Apr: Mon + Wed + Fri = 3
    expect(calculateWorkingDays('2026-04-13', '2026-04-17', { workingDays: threeDay, joursFeries: [] })).toBe(3)
  })

  it('accepts Date objects as input', () => {
    const d1 = new Date(2026, 3, 13) // Mon 13 Apr
    const d2 = new Date(2026, 3, 17) // Fri 17 Apr
    expect(calculateWorkingDays(d1, d2, { joursFeries: [] })).toBe(5)
  })

  it('accepts explicit joursFeries list', () => {
    // 5-day week with Monday as holiday → 4
    expect(calculateWorkingDays('2026-04-13', '2026-04-17', { joursFeries: ['2026-04-13'] })).toBe(4)
  })
})

describe('getWorkingDaysForEmploye', () => {
  it('returns Mon–Fri defaults for null employee', () => {
    const wd = getWorkingDaysForEmploye(null)
    expect(wd).toEqual(DEFAULT_WORKING_DAYS)
  })

  it('returns Mon–Fri defaults for employee with no working_days', () => {
    const wd = getWorkingDaysForEmploye({})
    expect(wd).toEqual(DEFAULT_WORKING_DAYS)
  })

  it('overrides individual days from JSONB', () => {
    const wd = getWorkingDaysForEmploye({ working_days: { sat: true, sun: true } })
    expect(wd.sat).toBe(true)
    expect(wd.sun).toBe(true)
    expect(wd.mon).toBe(true) // default preserved
  })

  it('handles partial JSONB gracefully', () => {
    const wd = getWorkingDaysForEmploye({ working_days: { fri: false } })
    expect(wd.fri).toBe(false)
    expect(wd.mon).toBe(true)
  })
})

describe('getMauritiusPublicHolidays', () => {
  it('returns a Set with at least 8 fixed holidays for 2026', () => {
    const h = getMauritiusPublicHolidays(2026)
    expect(h.size).toBeGreaterThanOrEqual(8)
  })

  it('includes New Year and Christmas', () => {
    const h = getMauritiusPublicHolidays(2026)
    expect(h.has('2026-01-01')).toBe(true)
    expect(h.has('2026-12-25')).toBe(true)
  })

  it('includes Independence Day (12 March)', () => {
    const h = getMauritiusPublicHolidays(2026)
    expect(h.has('2026-03-12')).toBe(true)
  })

  it('returns different sets per year', () => {
    const h2024 = getMauritiusPublicHolidays(2024)
    const h2025 = getMauritiusPublicHolidays(2025)
    // Variable holidays differ between years
    expect([...h2024].join()).not.toBe([...h2025].join())
  })
})
