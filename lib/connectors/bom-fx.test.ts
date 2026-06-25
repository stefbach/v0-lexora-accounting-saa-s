import { describe, it, expect } from 'vitest'
import { parseBomTable, toRateMap, type BomRatesResponse } from './bom-fx'

// Fixture reproduisant la structure réelle BOM (2026), table « cols-8 » :
// un menu déroulant pays en haut (à NE PAS confondre avec la ligne devise),
// puis des lignes à 5 colonnes de taux (Buy T.T/D.D/Notes, Sell T.T/Notes).
const cell = (cls: string, v: string) =>
  `<td class="views-field ${cls} views-align-right" >\n\t\t${v}\t\t</td>`

const row = (country: string, code: string, unit: number, n: number[]) =>
  `<tr>` +
  `<td class="views-field views-field-name views-align-left" >\n\t\t${country}\t\t</td>` +
  `<td class="views-field views-field-field-currency views-align-left" >\n\t\t ${code} ${unit}\t\t</td>` +
  cell('views-field-php', String(n[0])) +
  cell('views-field-php-1', String(n[1])) +
  cell('views-field-php-2', String(n[2])) +
  cell('views-field-php-3', String(n[3])) +
  cell('views-field-php-4', String(n[4])) +
  `<td class="views-field views-field-field-transaction-date views-align-left" >\n\t\t20 May 2026\t\t</td>` +
  `</tr>`

const FIXTURE =
  // Menu déroulant pays — piège : contient "U.S.A." mais pas "USD 1"
  `<select><option value="39">U.S.A.</option><option value="43">U.K.</option></select>` +
  `<table class="views-table cols-8 table table-hover table-striped"><thead>` +
  `<tr><th colspan="2"></th><th colspan="3">Buying</th><th colspan="2">Selling</th><th></th></tr>` +
  `</thead><tbody>` +
  row('U.S.A.', 'USD', 1, [47.4964, 47.4993, 47.3447, 48.9127, 49.1551]) +
  row('E.M.U.', 'EUR', 1, [54.0016, 53.9, 53.8, 55.6097, 55.9]) +
  row('Japan', 'JPY', 100, [29.3711, 29.35, 29.3, 30.2496, 30.5]) +
  `</tbody></table>`

describe('parseBomTable', () => {
  it('extracts mid-rate = (Buy T.T + Sell T.T) / 2 from the 5-column layout', () => {
    const rates = parseBomTable(FIXTURE)
    const usd = rates.find((r) => r.currency === 'USD')!
    expect(usd).toBeDefined()
    expect(usd.unit).toBe(1)
    expect(usd.buyTT).toBe(47.4964)
    expect(usd.sellTT).toBe(48.9127) // Sell T.T (col index 3), NOT Buy D.D
    expect(usd.midRate).toBeCloseTo((47.4964 + 48.9127) / 2, 4) // 48.2046
  })

  it('normalises per unit (JPY quoted per 100)', () => {
    const jpy = parseBomTable(FIXTURE).find((r) => r.currency === 'JPY')!
    expect(jpy.unit).toBe(100)
    expect(jpy.midRate).toBeCloseTo((29.3711 + 30.2496) / 2 / 100, 4) // ~0.2981
  })

  it('does NOT match the country dropdown (no false USD row)', () => {
    // Only one USD entry, from the table row — not the <option>.
    const usdMatches = parseBomTable(FIXTURE).filter((r) => r.currency === 'USD')
    expect(usdMatches).toHaveLength(1)
  })

  it('returns an entry per currency present', () => {
    const codes = parseBomTable(FIXTURE).map((r) => r.currency).sort()
    expect(codes).toEqual(['EUR', 'JPY', 'USD'])
  })

  it('toRateMap rounds to 4 decimals and always includes MUR=1', () => {
    const resp: BomRatesResponse = {
      date: '2026-05-20',
      fetchedAt: '2026-05-20T08:00:00.000Z',
      source: 'bom-mu',
      rates: parseBomTable(FIXTURE),
    }
    const map = toRateMap(resp)
    expect(map.MUR).toBe(1)
    expect(map.USD).toBeCloseTo(48.2046, 4)
  })
})
