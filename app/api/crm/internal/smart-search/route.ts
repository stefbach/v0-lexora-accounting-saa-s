// =============================================================================
// POST /api/crm/internal/smart-search
// Recherche intelligente en langage naturel — CONSULTATION GRATUITE.
//
// 1. Claude Haiku traduit la requête NL en filtres Apollo (coût minime).
// 2. Apollo recherche les ENTREPRISES (la recherche d'organisations ne
//    consomme pas de crédit email/téléphone) — verrouillé sur Maurice.
// 3. On renvoie un aperçu : RIEN n'est inséré en base à ce stade.
//
// Auth : session web (rôle CRM). Pas de HMAC (déclenché depuis l'UI).
// Body : { prompt?: string, q_keywords?: string,
//          employee_ranges?: string[], page?: number }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmPermission } from '@/lib/crm/permissions'
import { parseNaturalQuery, type ApolloCompanyFilters } from '@/lib/crm/nl-query'
import { apolloSearchCompaniesPreview } from '@/lib/crm/connectors/apollo'

export async function POST(req: NextRequest) {
  const auth = await requireCrmPermission('view')
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'body invalide' }, { status: 400 })

  const page = Number.isFinite(body.page) ? Math.max(1, Math.trunc(body.page)) : 1

  let interpretation = ''
  let filters: ApolloCompanyFilters = {}

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (prompt) {
    try {
      const parsed = await parseNaturalQuery(prompt)
      interpretation = parsed.interpretation
      filters = parsed.filters
    } catch (err) {
      return NextResponse.json(
        { error: `nl_parse_failed: ${(err as Error).message}` },
        { status: 502 },
      )
    }
  } else {
    // Filtres manuels directs (sans appel Claude)
    if (typeof body.city === 'string' && body.city.trim()) {
      filters.city = body.city.trim()
    }
    const rawTags = body.keyword_tags ?? body.q_keywords
    if (Array.isArray(rawTags) && rawTags.length) {
      filters.keyword_tags = rawTags.map(String).map((s: string) => s.trim()).filter(Boolean)
    } else if (typeof rawTags === 'string' && rawTags.trim()) {
      filters.keyword_tags = [rawTags.trim()]
    }
    if (Array.isArray(body.employee_ranges) && body.employee_ranges.length) {
      filters.organization_num_employees_ranges = body.employee_ranges.map(String)
    }
  }

  const result = await apolloSearchCompaniesPreview(filters, page)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({
    data: {
      interpretation,
      filters,
      page: result.page,
      total: result.total,
      companies: result.companies,
    },
  })
}
