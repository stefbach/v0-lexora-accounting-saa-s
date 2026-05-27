// =============================================================================
// lib/crm/connectors/yellowpages-mu.ts
// Yellow Pages Mauritius — annuaire pro public
// =============================================================================
// Source : yellowpages.mu (annuaire commercial public)
//
// Données disponibles SANS login :
//   - Nom commercial
//   - Catégorie / activité
//   - Téléphone, email, site web
//   - Adresse
//
// Comme les entreprises publient volontairement leurs coordonnées sur cet
// annuaire, l'usage prospection B2B est considéré légitime (consentement
// implicite via publication).
//
// Rate limit : 1 req / 1.5s.
// =============================================================================

import type { Connector, ConnectorSearchOptions, ConnectorSearchResult } from './types'
import type { CrmIngestPayload } from '../types'

const YP_BASE = 'https://www.yellowpages.mu'
const USER_AGENT = 'Lexora-CRM/1.0 (+https://lexora.mu/crm; B2B research)'
const RATE_LIMIT_MS = 1500

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

interface YpHit {
  name: string
  category?: string
  phone?: string
  email?: string
  website?: string
  address?: string
  city?: string
}

async function searchYellowPages(query: string, limit: number): Promise<YpHit[]> {
  try {
    const url = `${YP_BASE}/search?q=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      console.warn(`[yp-mu] HTTP ${res.status} pour "${query}"`)
      return []
    }
    const html = await res.text()
    return parseYpHtml(html, limit)
  } catch (err) {
    console.error('[yp-mu] fetch error:', err)
    return []
  }
}

function parseYpHtml(html: string, limit: number): YpHit[] {
  const hits: YpHit[] = []
  // Yellow Pages MU utilise des "listing-item" — extraction best-effort.
  const itemRegex = /<div[^>]*class="[^"]*listing[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi
  const items = [...html.matchAll(itemRegex)]

  for (const item of items) {
    if (hits.length >= limit) break
    const block = item[1]
    const name = matchOne(block, /<a[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/a>/i)
      ?? matchOne(block, /<h[2-4][^>]*>\s*<a[^>]*>([^<]+)<\/a>/i)
    if (!name) continue
    hits.push({
      name: cleanText(name),
      category: matchOne(block, /class="[^"]*category[^"]*"[^>]*>([^<]+)</i),
      phone: matchOne(block, /tel:([+\d\s\-()]+)/i),
      email: matchOne(block, /mailto:([^"'\s<>]+)/i),
      website: matchOne(block, /href="(https?:\/\/(?!www\.yellowpages\.mu)[^"]+)"/i),
      address: matchOne(block, /class="[^"]*address[^"]*"[^>]*>([^<]+)</i),
    })
  }
  return hits
}

function matchOne(html: string, regex: RegExp): string | undefined {
  const m = html.match(regex)
  return m?.[1]?.trim()
}

function cleanText(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export const yellowPagesMuConnector: Connector = {
  name: 'yellowpages_mu',
  async search(opts: ConnectorSearchOptions): Promise<ConnectorSearchResult> {
    const limit = opts.limit ?? 50
    const query = (opts.query ?? opts.industrie ?? '').trim()
    const errors: string[] = []
    if (!query) {
      errors.push('yellowpages_mu: query requis')
      return { source: 'yellowpages_mu', total: 0, payloads: [], errors }
    }

    const hits = await searchYellowPages(query, limit)
    await sleep(RATE_LIMIT_MS)

    const payloads: CrmIngestPayload[] = hits.map((h) => ({
      source: 'yellowpages_mu' as const,
      company: {
        nom: h.name,
        activite: h.category,
        industrie: h.category,
        telephone: h.phone,
        email_principal: h.email,
        site_web: h.website,
        adresse: h.address,
        ville: h.city,
        pays: 'Mauritius',
        source: 'yellowpages_mu' as const,
      },
      raw: h as unknown as Record<string, unknown>,
    }))

    return { source: 'yellowpages_mu', total: payloads.length, payloads, errors }
  },
}
