import { describe, it, expect } from 'vitest'
import { computeSettlement, matchSettlement, type DailyTransit } from '@/lib/accounting/card-settlement'

describe('computeSettlement', () => {
  it('commission = brut − net, pct calculé', () => {
    const r = computeSettlement(10000, 9800)
    expect(r.commission).toBe(200)
    expect(r.commission_pct).toBe(2)
    expect(r.plausible).toBe(true)
  })
  it('commission négative (net > brut) → non plausible', () => {
    const r = computeSettlement(1000, 1050)
    expect(r.commission).toBe(-50)
    expect(r.plausible).toBe(false)
  })
  it('commission au-dessus du seuil → non plausible', () => {
    const r = computeSettlement(1000, 800, 5) // 20%
    expect(r.plausible).toBe(false)
  })
})

describe('matchSettlement', () => {
  const transits: DailyTransit[] = [
    { date: '2026-08-10', brut: 5000 },
    { date: '2026-08-11', brut: 8000 },
    { date: '2026-08-12', brut: 3000 },
  ]

  it('trouve la journée dont le brut correspond au net + commission plausible', () => {
    // net 7840 ≈ 8000 − 2% commission
    const m = matchSettlement(7840, transits)
    expect(m).not.toBeNull()
    expect(m!.dates).toEqual(['2026-08-11'])
    expect(m!.brut).toBe(8000)
    expect(m!.commission).toBe(160)
    expect(m!.commission_pct).toBe(2)
  })

  it('agrège plusieurs jours contigus si le règlement les regroupe', () => {
    // net 12740 ≈ (5000+8000)=13000 − 2%
    const m = matchSettlement(12740, transits)
    expect(m).not.toBeNull()
    expect(m!.dates).toEqual(['2026-08-10', '2026-08-11'])
    expect(m!.brut).toBe(13000)
    expect(m!.commission).toBe(260)
  })

  it('renvoie null si aucune fenêtre ne donne une commission plausible', () => {
    expect(matchSettlement(50, transits)).toBeNull()       // brut trop grand → commission énorme
    expect(matchSettlement(999999, transits)).toBeNull()   // net > tout brut → commission négative
  })

  it('ignore les jours à brut nul', () => {
    const m = matchSettlement(4900, [{ date: '2026-08-10', brut: 0 }, { date: '2026-08-11', brut: 5000 }])
    expect(m!.dates).toEqual(['2026-08-11'])
  })
})
