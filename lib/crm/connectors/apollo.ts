// =============================================================================
// lib/crm/connectors/apollo.ts
// Apollo.io — base de données B2B compliant (API officielle)
// =============================================================================
// Apollo.io fournit une API B2B avec emails pro vérifiés, téléphones directs
// et enrichissement LinkedIn LÉGAL (via leur infrastructure).
//
// Plan recommandé pour Lexora : Apollo Basic (~$59/mois) — 250 credits/mois.
//
// Variable d'env : APOLLO_API_KEY
// Doc : https://docs.apollo.io/reference
// =============================================================================

import type { Connector, ConnectorSearchOptions, ConnectorSearchResult } from './types'
import type { CrmIngestPayload } from '../types'

const APOLLO_BASE = 'https://api.apollo.io/v1'

interface ApolloOrganization {
  id?: string
  name?: string
  website_url?: string
  primary_phone?: { number?: string }
  linkedin_url?: string
  industry?: string
  estimated_num_employees?: number
  short_description?: string
  city?: string
  country?: string
  founded_year?: number
}

interface ApolloPerson {
  id?: string
  first_name?: string
  last_name?: string
  title?: string
  seniority?: string
  email?: string
  email_status?: string
  linkedin_url?: string
  phone_numbers?: Array<{ raw_number?: string }>
  organization?: ApolloOrganization
}

interface ApolloSearchResponse {
  organizations?: ApolloOrganization[]
  people?: ApolloPerson[]
  pagination?: { total_entries?: number }
}

async function apolloPost(path: string, body: Record<string, unknown>): Promise<ApolloSearchResponse> {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) throw new Error('APOLLO_API_KEY manquante')

  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Apollo ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

function employeeRange(n?: number): string | undefined {
  if (!n) return undefined
  if (n <= 10) return '1-10'
  if (n <= 50) return '11-50'
  if (n <= 200) return '51-200'
  if (n <= 500) return '201-500'
  return '500+'
}

export const apolloConnector: Connector = {
  name: 'apollo',
  async search(opts: ConnectorSearchOptions): Promise<ConnectorSearchResult> {
    const errors: string[] = []
    const limit = opts.limit ?? 25
    if (!process.env.APOLLO_API_KEY) {
      errors.push('APOLLO_API_KEY non configurée — connecteur Apollo désactivé')
      return { source: 'apollo', total: 0, payloads: [], errors }
    }

    try {
      // 1. Recherche d'organisations à Maurice
      const orgRes = await apolloPost('/mixed_companies/search', {
        organization_locations: ['Mauritius'],
        ...(opts.industrie ? { organization_industry_tag_ids: undefined, q_keywords: opts.industrie } : {}),
        ...(opts.query ? { q_keywords: opts.query } : {}),
        page: 1,
        per_page: Math.min(limit, 25),
      })

      const orgs = orgRes.organizations ?? []
      const payloads: CrmIngestPayload[] = []

      for (const org of orgs) {
        if (!org.name) continue

        // 2. Récupération des décideurs principaux de cette org
        const peopleRes = await apolloPost('/mixed_people/search', {
          organization_ids: org.id ? [org.id] : undefined,
          person_seniorities: ['c_suite', 'vp', 'director', 'owner', 'partner'],
          page: 1,
          per_page: 5,
        }).catch((err) => {
          errors.push(`apollo people search org=${org.name}: ${err.message}`)
          return { people: [] as ApolloPerson[] } as ApolloSearchResponse
        })

        const contacts =
          (peopleRes.people ?? []).map((p) => ({
            prenom: p.first_name ?? undefined,
            nom: p.last_name ?? undefined,
            titre: p.title ?? undefined,
            seniorite: p.seniority ?? undefined,
            decision_maker: ['c_suite', 'vp', 'owner', 'partner'].includes(p.seniority ?? ''),
            email: p.email ?? undefined,
            email_verified: p.email_status === 'verified',
            telephone: p.phone_numbers?.[0]?.raw_number,
            linkedin_url: p.linkedin_url ?? undefined,
            source: 'apollo' as const,
          })) ?? []

        payloads.push({
          source: 'apollo' as const,
          company: {
            nom: org.name,
            linkedin_url: org.linkedin_url ?? undefined,
            site_web: org.website_url ?? undefined,
            telephone: org.primary_phone?.number,
            industrie: org.industry ?? undefined,
            activite: org.industry ?? undefined,
            taille_effectif: employeeRange(org.estimated_num_employees),
            description: org.short_description ?? undefined,
            ville: org.city ?? undefined,
            annee_creation: org.founded_year ?? undefined,
            pays: 'Mauritius',
            source: 'apollo' as const,
          },
          contacts,
          raw: org as unknown as Record<string, unknown>,
        })
      }

      return { source: 'apollo', total: payloads.length, payloads, errors }
    } catch (err) {
      errors.push(`apollo search error: ${(err as Error).message}`)
      return { source: 'apollo', total: 0, payloads: [], errors }
    }
  },
}
