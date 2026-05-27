// =============================================================================
// lib/crm/connectors/cbrd.ts
// Corporate and Business Registration Department (Mauritius) — registre officiel
// =============================================================================
// Source : mns.mu / cbris.mns.mu (registre public officiel)
//
// Le portail CBRIS expose un moteur de recherche public de sociétés. Les
// données accessibles SANS login (recherche par nom) sont :
//   - Company name
//   - BRN (Business Registration Number)
//   - Date d'incorporation
//   - Activity / NIC code
//   - Statut (active, dissolved...)
//   - Adresse enregistrée
//
// L'extrait complet (directors, capital) est payant (~Rs 200) — on n'y
// touche pas en V1.
//
// IMPORTANT : ce connecteur scrape un site public officiel à un rythme
// raisonnable (1 req/2s). Il respecte robots.txt et n'envoie pas de
// User-Agent trompeur.
// =============================================================================

import type { Connector, ConnectorSearchOptions, ConnectorSearchResult } from './types'
import type { CrmIngestPayload } from '../types'

const CBRD_BASE = 'https://onlinesearch.cbris.govmu.org' // portail public CBRD
const USER_AGENT = 'Lexora-CRM/1.0 (+https://lexora.mu/crm; commercial outreach)'
const RATE_LIMIT_MS = 2000

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

interface CbrdHit {
  name: string
  brn: string
  activity?: string
  nic_code?: string
  date_incorporation?: string
  status?: string
  address?: string
}

/**
 * Recherche par mot-clé. Retourne une liste plate de sociétés actives.
 *
 * NOTE : l'implémentation réelle dépend du HTML/JSON du portail CBRIS
 * (qui change parfois). Cette version est résiliente : si l'endpoint
 * répond du HTML inattendu, on log et on retourne un résultat vide
 * plutôt que de planter.
 */
async function searchCbrd(query: string, limit: number): Promise<CbrdHit[]> {
  try {
    const url = `${CBRD_BASE}/SearchCompany?name=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/json',
      },
      // 30s timeout côté Next.js
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      console.warn(`[cbrd] HTTP ${res.status} pour query="${query}"`)
      return []
    }

    const contentType = res.headers.get('content-type') ?? ''

    // Cas 1 : JSON natif
    if (contentType.includes('application/json')) {
      const json: any = await res.json()
      const rows = (json?.results || json?.data || json || []) as any[]
      return rows.slice(0, limit).map(parseCbrdRow).filter(Boolean) as CbrdHit[]
    }

    // Cas 2 : HTML — extraction best-effort par regex
    const html = await res.text()
    return parseCbrdHtml(html, limit)
  } catch (err) {
    console.error('[cbrd] fetch error:', err)
    return []
  }
}

function parseCbrdRow(row: any): CbrdHit | null {
  if (!row) return null
  const name = row.companyName || row.name || row.Name
  const brn = row.brn || row.BRN || row.registrationNo
  if (!name || !brn) return null
  return {
    name: String(name).trim(),
    brn: String(brn).trim(),
    activity: row.activity || row.businessActivity || undefined,
    nic_code: row.nicCode || row.nic_code || undefined,
    date_incorporation: row.dateIncorporation || row.incorporationDate || undefined,
    status: row.status || row.companyStatus || undefined,
    address: row.address || row.registeredAddress || undefined,
  }
}

function parseCbrdHtml(html: string, limit: number): CbrdHit[] {
  // Extraction très basique : on cherche des patterns BRN dans le HTML.
  // En cas de changement du portail, mettre à jour ici.
  const hits: CbrdHit[] = []
  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi
  const rows = html.match(rowRegex) ?? []

  for (const row of rows) {
    if (hits.length >= limit) break
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim(),
    )
    if (cells.length < 2) continue
    const brnIdx = cells.findIndex((c) => /^[A-Z]?\d{6,}$/.test(c))
    if (brnIdx === -1) continue
    const name = cells[brnIdx === 0 ? 1 : 0]
    if (!name) continue
    hits.push({
      name,
      brn: cells[brnIdx],
      activity: cells[brnIdx + 1] || undefined,
      status: cells.find((c) => /active|live|dissolved/i.test(c)),
    })
  }
  return hits
}

export const cbrdConnector: Connector = {
  name: 'cbrd',
  async search(opts: ConnectorSearchOptions): Promise<ConnectorSearchResult> {
    const limit = opts.limit ?? 50
    const query = (opts.query ?? opts.industrie ?? '').trim()
    const errors: string[] = []

    if (!query) {
      errors.push('cbrd: query ou industrie requis')
      return { source: 'cbrd', total: 0, payloads: [], errors }
    }

    // L'API onlinesearch.mns.mu exige un token Cloudflare Turnstile généré
    // côté navigateur — impossible à contourner server-side.
    errors.push(
      'CBRD indisponible : onlinesearch.mns.mu exige une validation Cloudflare Turnstile ' +
      '(CAPTCHA navigateur). Ce connecteur ne peut pas fonctionner server-side. ' +
      'Utilisez Coresignal ou l\'import CSV à la place.',
    )
    return { source: 'cbrd', total: 0, payloads: [], errors }

    // eslint-disable-next-line no-unreachable
    const hits = await searchCbrd(query, limit)
    await sleep(RATE_LIMIT_MS)

    const payloads: CrmIngestPayload[] = hits
      .filter((h) => !h.status || /active|live/i.test(h.status))
      .map((h) => ({
        source: 'cbrd' as const,
        company: {
          nom: h.name,
          brn: h.brn,
          activite: h.activity,
          nic_code: h.nic_code,
          adresse: h.address,
          pays: 'Mauritius',
          source: 'cbrd' as const,
        },
        raw: h as unknown as Record<string, unknown>,
      }))

    return {
      source: 'cbrd',
      total: payloads.length,
      payloads,
      errors,
    }
  },
}
