// =============================================================================
// lib/crm/connectors/coresignal.ts
// Coresignal Data API — base B2B multi-source (LinkedIn, web, etc.)
// =============================================================================
// Coresignal agrège des données LinkedIn + sources web via leurs propres
// crawlers licenciés. Usage légal et compliant RGPD.
//
// Endpoint MCP : https://mcp.coresignal.com/mcp
// Auth header  : apikey: <CORESIGNAL_API_KEY>
// Protocole    : MCP JSON-RPC 2.0 sur SSE
//
// Variables d'env :
//   CORESIGNAL_API_KEY — clé API Coresignal
//
// Outils disponibles :
//   coresignal_company_multisource_api  — sociétés
//   coresignal_employee_multisource_api — personnes/contacts
//
// Requêtes : Elasticsearch Query DSL (bool, match, range, etc.)
// =============================================================================

import type { Connector, ConnectorSearchOptions, ConnectorSearchResult } from './types'
import type { CrmIngestPayload } from '../types'

const MCP_URL = 'https://mcp.coresignal.com/mcp'

// ─── MCP Session ─────────────────────────────────────────────────────────────

async function initSession(): Promise<string | null> {
  const apiKey = process.env.CORESIGNAL_API_KEY
  if (!apiKey) return null

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'lexora-crm', version: '1.0' },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  })

  const sessionId = res.headers.get('mcp-session-id') || res.headers.get('x-mcp-session-id')
  return sessionId
}

async function mcpCall(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown[]> {
  const apiKey = process.env.CORESIGNAL_API_KEY!
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'Mcp-Session-Id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(30_000),
  })

  const text = await res.text()
  const results: unknown[] = []

  for (const line of text.split('\n')) {
    const l = line.trim()
    if (!l.startsWith('data:')) continue
    try {
      const d = JSON.parse(l.slice(5).trim()) as {
        result?: { content?: Array<{ type: string; text: string }> }
      }
      const content = d?.result?.content ?? []
      for (const c of content) {
        if (c.type !== 'text') continue
        try {
          const parsed = JSON.parse(c.text)
          if (Array.isArray(parsed)) results.push(...parsed)
          else results.push(parsed)
        } catch {
          // text non-JSON (erreur lisible) — on l'ignore
        }
      }
    } catch {
      // ligne non-JSON
    }
  }

  return results
}

// ─── Types Coresignal ─────────────────────────────────────────────────────────

interface CoresignalCompany {
  id?: number
  company_name?: string
  website?: string
  industry?: string
  employees_count?: number
  hq_city?: string
  hq_country?: string
  professional_network_url?: string
  short_description?: string
  founded?: number
  company_size?: string
}

interface CoresignalEmployee {
  id?: number
  name?: string
  title?: string
  company?: string
  professional_network_url?: string
  experience?: Array<{ title?: string; company?: string; is_current?: boolean }>
}

function employeeRange(n?: number | null): string | undefined {
  if (!n) return undefined
  if (n <= 10) return '1-10'
  if (n <= 50) return '11-50'
  if (n <= 200) return '51-200'
  if (n <= 500) return '201-500'
  return '500+'
}

// ─── Connecteur ───────────────────────────────────────────────────────────────

export const coresignalConnector: Connector = {
  name: 'coresignal',
  async search(opts: ConnectorSearchOptions): Promise<ConnectorSearchResult> {
    const errors: string[] = []
    const limit = Math.min(opts.limit ?? 25, 50)

    if (!process.env.CORESIGNAL_API_KEY) {
      errors.push('CORESIGNAL_API_KEY non configurée — connecteur Coresignal désactivé')
      return { source: 'coresignal' as never, total: 0, payloads: [], errors }
    }

    const sessionId = await initSession().catch((err) => {
      errors.push(`coresignal init session: ${(err as Error).message}`)
      return null
    })
    if (!sessionId) {
      return { source: 'coresignal' as never, total: 0, payloads: [], errors }
    }

    // ── Construction de la requête Elasticsearch ──────────────────────────────
    const must: unknown[] = [
      { match: { hq_country: 'Mauritius' } },
    ]

    // Filtre industrie
    if (opts.industrie) {
      must.push({ match: { industry: opts.industrie } })
    }

    // Filtre mot-clé libre (nom société ou description)
    if (opts.query) {
      must.push({
        multi_match: {
          query: opts.query,
          fields: ['company_name', 'short_description', 'industry'],
        },
      })
    }

    // Taille (PME prioritaires pour Lexora)
    if (!opts.industrie && !opts.query) {
      must.push({ range: { employees_count: { gte: 5, lte: 500 } } })
    }

    try {
      const companies = (await mcpCall(sessionId, 'coresignal_company_multisource_api', {
        query: { bool: { must } },
        keys: [
          'company_name', 'website', 'industry', 'employees_count',
          'hq_city', 'hq_country', 'professional_network_url',
          'short_description', 'founded',
        ],
        limit,
      })) as CoresignalCompany[]

      const payloads: CrmIngestPayload[] = []

      for (const co of companies) {
        if (!co.company_name) continue

        // Chercher les décideurs (CEO, CFO, Director) de la société
        let contacts: CrmIngestPayload['contacts'] = []
        try {
          const employees = (await mcpCall(sessionId, 'coresignal_employee_multisource_api', {
            query: {
              bool: {
                must: [
                  { match: { company: co.company_name } },
                  {
                    bool: {
                      should: [
                        { match: { title: 'CEO' } },
                        { match: { title: 'CFO' } },
                        { match: { title: 'Director' } },
                        { match: { title: 'Managing Director' } },
                        { match: { title: 'Finance Director' } },
                        { match: { title: 'Founder' } },
                      ],
                    },
                  },
                ],
              },
            },
            keys: ['name', 'title', 'company', 'professional_network_url'],
            limit: 3,
          })) as CoresignalEmployee[]

          contacts = employees
            .filter((e) => e.name)
            .map((e) => {
              const parts = (e.name ?? '').trim().split(/\s+/)
              const prenom = parts[0]
              const nom = parts.slice(1).join(' ') || undefined
              return {
                prenom,
                nom,
                titre: e.title ?? undefined,
                seniorite: 'C-Level',
                decision_maker: true,
                linkedin_url: e.professional_network_url ?? undefined,
                source: 'coresignal' as never,
              }
            })
        } catch {
          // Employee lookup optionnel — pas bloquant
        }

        payloads.push({
          source: 'coresignal' as never,
          company: {
            nom: co.company_name,
            linkedin_url: co.professional_network_url ?? undefined,
            site_web: co.website ?? undefined,
            industrie: co.industry ?? undefined,
            activite: co.industry ?? undefined,
            taille_effectif: employeeRange(co.employees_count),
            description: co.short_description ?? undefined,
            ville: co.hq_city ?? undefined,
            annee_creation: co.founded ?? undefined,
            pays: 'Mauritius',
            source: 'coresignal' as never,
          },
          contacts,
          raw: co as unknown as Record<string, unknown>,
        })
      }

      return {
        source: 'coresignal' as never,
        total: payloads.length,
        payloads,
        errors,
      }
    } catch (err) {
      errors.push(`coresignal search: ${(err as Error).message}`)
      return { source: 'coresignal' as never, total: 0, payloads: [], errors }
    }
  },
}
