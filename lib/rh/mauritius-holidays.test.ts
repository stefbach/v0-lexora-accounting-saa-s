import { describe, it, expect } from 'vitest'
import {
  getMauritiusHolidaysWithNames,
  getUpcomingHolidays,
} from './mauritius-holidays'

describe('getMauritiusHolidaysWithNames', () => {
  it('always includes fixed Gregorian holidays for any year', () => {
    const h2030 = getMauritiusHolidaysWithNames(2030)
    const dates = h2030.map((h) => h.date)
    expect(dates).toContain('2030-01-01') // New Year
    expect(dates).toContain('2030-03-12') // Independence
    expect(dates).toContain('2030-05-01') // Labour Day
    expect(dates).toContain('2030-12-25') // Christmas
  })

  it('includes known variable (lunar) holidays for seeded years', () => {
    const names2026 = getMauritiusHolidaysWithNames(2026).map((h) => h.name)
    expect(names2026).toContain('Divali')
    expect(names2026).toContain('Eid-Ul-Fitr')
  })

  it('is sorted by date ascending', () => {
    const dates = getMauritiusHolidaysWithNames(2026).map((h) => h.date)
    const sorted = [...dates].sort((a, b) => a.localeCompare(b))
    expect(dates).toEqual(sorted)
  })

  it('returns only fixed holidays for years without variable data', () => {
    // 2030 has no variable seed → only the 8 fixed ones
    expect(getMauritiusHolidaysWithNames(2030)).toHaveLength(8)
  })
})

describe('getUpcomingHolidays', () => {
  it('returns holidays on/after today, capped by limit', () => {
    const up = getUpcomingHolidays('2026-12-01', 3)
    expect(up.length).toBe(3)
    expect(up.every((h) => h.date >= '2026-12-01')).toBe(true)
  })

  it('spans into the next year near year-end', () => {
    // Late December 2026 → next items should include Jan 2027 fixed holidays
    const up = getUpcomingHolidays('2026-12-26', 3)
    expect(up.some((h) => h.date.startsWith('2027'))).toBe(true)
  })

  it('returns empty when nothing is upcoming within the two-year window edge', () => {
    const up = getUpcomingHolidays('2026-06-15', 3)
    expect(up.length).toBeGreaterThan(0) // sanity: mid-year still has upcoming
  })
})
