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
// Depuis 2026 BOM publie aussi ZAR, SGD, CHF dans le tableau consolidé — on
// les prend à la source officielle (meilleure traçabilité MRA que l'API tierce).
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CNY', 'INR', 'ZAR', 'SGD', 'CHF'] as const

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
 * Structure réelle (2026), table « cols-8 » :
 *   Country | Currency | Buying(T.T, D.D, Notes) | Selling(T.T, Notes) | Date
 *   <td …views-field-field-currency>USD 1</td>
 *   <td …php>47.4964</td>   ← Buy  T.T
 *   <td …php-1>47.4993</td> ← Buy  D.D
 *   <td …php-2>47.3447</td> ← Buy  Notes
 *   <td …php-3>48.9127</td> ← Sell T.T
 *   <td …php-4>49.1551</td> ← Sell Notes
 *
 * Le mid-rate comptable = (Buy T.T + Sell T.T) / 2 — soit nums[0] et nums[3].
 *
 * On ancre STRICTEMENT sur la cellule devise « CUR <unit> » suivie de son
 * `</td>`, puis on lit les `<td>` numériques de CETTE ligne uniquement. On
 * évite ainsi : (a) le menu déroulant pays en haut de page (qui utilise des
 * noms de pays, pas « USD 1 »), (b) l'ancien bug du `\D+` en mode `s` qui
 * balayait tout le document et mélangeait les colonnes.
 */
export function parseBomTable(html: string): BomRate[] {
  const rates: BomRate[] = []

  for (const currency of SUPPORTED_CURRENCIES) {
    // Ancre sur la cellule devise « CUR <unit> » + fermeture </td>.
    const anchor = new RegExp(`${currency}\\s+(\\d+)\\s*</td>`)
    const am = anchor.exec(html)
    if (!am || am.index === undefined) continue

    const unit = Number(am[1]) || 1

    // Cellules numériques de la ligne (fenêtre bornée pour ne pas déborder
    // sur la devise suivante).
    const windowStart = am.index + am[0].length
    const window = html.slice(windowStart, windowStart + 1600)
    const nums = [...window.matchAll(/<td[^>]*>\s*(\d+(?:\.\d+)?)\s*<\/td>/g)].map(
      (m) => Number(m[1]),
    )
    if (nums.length < 2) continue

    // Format 5 colonnes (3 Buying + 2 Selling) : Sell T.T = index 3.
    // Repli sur l'ancien format 4 colonnes (Buy T.T, Sell T.T, …) : index 1.
    const isFiveCol = nums.length >= 5
    const buyTT = nums[0]
    const sellTT = isFiveCol ? nums[3] : nums[1]
    const notesBuy = isFiveCol ? nums[2] : nums[2] ?? 0
    const notesSell = isFiveCol ? nums[4] : nums[3] ?? 0

    // Sanity check : valeurs positives et spread T.T cohérent.
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
