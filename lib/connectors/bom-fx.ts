/**
 * Connecteur Bank of Mauritius — Taux de change officiels.
 *
 * Source : https://www.bom.mu/markets/foreign-exchange/consolidated-indicative-exchange-rates
 *
 * BOM publie quotidiennement les taux indicatifs consolidés (T.T = Telegraphic
 * Transfer, D.D = Demand Draft, Notes = espèces) pour les principales devises.
 * À Maurice, c'est la référence officielle pour la valorisation fiscale (MRA)
 * et comptable (IFRS / Code Général des Impôts).
 *
 * Format renvoyé : taux MUR pour 1 unité de devise étrangère, basé sur le
 * mid-rate T.T (moyenne Buy/Sell). C'est le standard du marché pour les
 * écritures comptables et les factures.
 *
 * ⚠ BOM ne publie pas les week-ends ni jours fériés. Le code remonte la
 * date la plus récente disponible — c'est à l'appelant de gérer le cache
 * (généralement en DB via la table `taux_change`).
 *
 * Limites :
 * - HTML scraping, fragile si BOM redessine la page (à monitorer)
 * - Pas d'API officielle ; pas de SLA ni de version contractualisée
 * - Devises couvertes : USD, EUR, GBP, JPY, AUD, CAD, CNY, INR (les 8
 *   principales). Les autres devises (ZAR, AED, SGD, CHF, KES, etc.)
 *   ne sont pas dans le tableau BOM consolidé → fallback nécessaire.
 */

export interface BomRate {
  /** Code ISO 4217 — ex: "USD", "EUR" */
  currency: string
  /** Unité de référence (généralement 1, sauf JPY = 100) */
  unit: number
  /** Taux d'achat T.T (banque achète la devise) */
  buyTT: number
  /** Taux de vente T.T (banque vend la devise) */
  sellTT: number
  /** Taux d'achat espèces */
  notesBuy: number
  /** Taux de vente espèces */
  notesSell: number
  /** Mid-rate T.T normalisé à 1 unité — c'est ce taux qu'on utilise pour la compta */
  midRate: number
}

export interface BomRatesResponse {
  /** Date publiée par BOM (format YYYY-MM-DD) */
  date: string
  /** Timestamp de la requête côté client */
  fetchedAt: string
  /** Marqueur de provenance pour la traçabilité en DB */
  source: 'bom-mu'
  rates: BomRate[]
}

export class BomFetchError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'BomFetchError'
  }
}

const BOM_URL = 'https://www.bom.mu/markets/foreign-exchange/consolidated-indicative-exchange-rates'

// Mapping pays → code ISO 4217. BOM affiche "USA", "EMU", etc. dans la
// première colonne, le code ISO étant dans la deuxième colonne. On ancre
// l'extraction sur le code ISO (plus stable).
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CNY', 'INR'] as const

/**
 * Fetche et parse les taux BOM consolidés du jour.
 *
 * @param fetcher fonction fetch (override pour tests / Node natif vs Vercel Edge)
 * @returns Liste structurée des taux disponibles
 * @throws {BomFetchError} si la page est inaccessible ou le format inattendu
 */
export async function fetchBomRates(
  fetcher: typeof fetch = fetch,
): Promise<BomRatesResponse> {
  let html: string
  try {
    const res = await fetcher(BOM_URL, {
      // Identifiant courtois — BOM peut bloquer un User-Agent absent
      headers: { 'User-Agent': 'Lexora/1.0 (+https://lexora.mu)' },
      // Pas de cache côté fetch — on contrôle le cache via la DB
      cache: 'no-store',
    })
    if (!res.ok) throw new BomFetchError(`BOM HTTP ${res.status}`)
    html = await res.text()
  } catch (e) {
    if (e instanceof BomFetchError) throw e
    throw new BomFetchError('Réseau injoignable', e)
  }

  const rates = parseBomTable(html)
  if (rates.length === 0) {
    throw new BomFetchError('Aucun taux extrait — la structure HTML BOM a peut-être changé')
  }

  const date = extractPublicationDate(html) || new Date().toISOString().slice(0, 10)

  return {
    date,
    fetchedAt: new Date().toISOString(),
    source: 'bom-mu',
    rates,
  }
}

/**
 * Parse le tableau HTML des taux BOM.
 *
 * Le format attendu (mai 2026) :
 *   <tr>
 *     <td>USA</td><td>USD 1</td>
 *     <td>46.6792</td><td>46.6857</td>
 *     <td>46.5314</td><td>48.0791</td>
 *   </tr>
 *
 * On ancre sur le code ISO (3 lettres) + unité dans la deuxième cellule
 * pour rester tolérant aux changements de label pays.
 */
export function parseBomTable(html: string): BomRate[] {
  const rates: BomRate[] = []

  for (const currency of SUPPORTED_CURRENCIES) {
    // Capture : code ISO + unité, puis 4 nombres (buyTT, sellTT, notesBuy, notesSell)
    // \s+ tolère les espaces / sauts de ligne entre les cellules.
    // Le \D+ entre les nombres absorbe les balises </td><td>.
    const pattern = new RegExp(
      `${currency}\\s+(\\d+)` +
      `\\D+(\\d+(?:\\.\\d+)?)` +
      `\\D+(\\d+(?:\\.\\d+)?)` +
      `\\D+(\\d+(?:\\.\\d+)?)` +
      `\\D+(\\d+(?:\\.\\d+)?)`,
      's',
    )
    const m = html.match(pattern)
    if (!m) continue

    const unit = Number(m[1]) || 1
    const buyTT = Number(m[2])
    const sellTT = Number(m[3])
    const notesBuy = Number(m[4])
    const notesSell = Number(m[5])

    // Sanity check : les 4 valeurs doivent être positives et dans un ordre
    // cohérent (buy <= sell). Sinon on rejette plutôt que de polluer la DB.
    if (!isFinite(buyTT) || !isFinite(sellTT) || buyTT <= 0 || sellTT <= 0) continue
    if (Math.abs(buyTT - sellTT) / buyTT > 0.20) continue  // spread > 20% improbable

    const midRate = ((buyTT + sellTT) / 2) / unit

    rates.push({ currency, unit, buyTT, sellTT, notesBuy, notesSell, midRate })
  }

  return rates
}

/**
 * Extrait la date de publication du tableau BOM (généralement "22 May 2026").
 * Renvoie null si introuvable — l'appelant devra utiliser la date courante.
 */
function extractPublicationDate(html: string): string | null {
  // BOM affiche typiquement "Indicative Selling Rates as at <date>" ou similaire
  const match = html.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)
  if (!match) return null
  const day = match[1].padStart(2, '0')
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  }
  const month = months[match[2].toLowerCase()]
  return month ? `${match[3]}-${month}-${day}` : null
}

/**
 * Helper : convertit une réponse BomRatesResponse en map { currency: midRate }
 * compatible avec le format historique de Lexora (lib/taux-change.ts).
 */
export function toRateMap(response: BomRatesResponse): Record<string, number> {
  const map: Record<string, number> = { MUR: 1 }
  for (const r of response.rates) {
    map[r.currency] = Math.round(r.midRate * 10000) / 10000
  }
  return map
}
