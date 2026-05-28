// =============================================================================
// POST /api/crm/internal/smart-search
// Recherche intelligente en langage naturel — CONSULTATION GRATUITE.
//
// 1. Claude Haiku traduit la requête NL en filtres Apollo (coût minime).
// 2. Apollo recherche les DIRIGEANTS (mixed_people/search) : noms + titres +
//    société renvoyés SANS consommer de crédit ; emails/téléphones masqués
//    (reveal = payant, fait plus tard à la demande). Verrouillé sur Maurice.
// 3. On renvoie un aperçu : RIEN n'est inséré en base à ce stade.
//
// Auth : session web (rôle CRM). Pas de HMAC (déclenché depuis l'UI).
// Body : { prompt?: string, q_keywords?: string, employee_ranges?: string[],
//          person_titles?: string[], person_seniorities?: string[],
//          page?: number, per_page?: number }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmPermission } from '@/lib/crm/permissions'
import { parseNaturalQuery, type ApolloCompanyFilters } from '@/lib/crm/nl-query'
import { apolloSearchPeoplePreview } from '@/lib/crm/connectors/apollo'

export async function POST(req: NextRequest) {
  const auth = await requireCrmPermission('view')
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'body invalide' }, { status: 400 })

  const page = Number.isFinite(body.page) ? Math.max(1, Math.trunc(body.page)) : 1
  const perPage = Number.isFinite(body.per_page) ? Math.min(100, Math.max(1, Math.trunc(body.per_page))) : 25

  let interpretation = ''
  let filters: ApolloCompanyFilters = {}

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (prompt) {
    try {
      const parsed = await parseNaturalQuery(prompt)
      interpretation = parsed.interpretation
      filters = parsed.filters
    } catch (err) {
      console.error('[crm/SS] NLFAIL', (err as Error).message)
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
    if (Array.isArray(body.person_seniorities) && body.person_seniorities.length) {
      filters.person_seniorities = body.person_seniorities.map(String)
    }
    if (Array.isArray(body.person_titles) && body.person_titles.length) {
      filters.person_titles = body.person_titles.map(String)
    }
  }

  const result = await apolloSearchPeoplePreview(
    {
      city: filters.city,
      keyword_tags: filters.keyword_tags,
      person_titles: filters.person_titles,
      person_seniorities: filters.person_seniorities,
      organization_num_employees_ranges: filters.organization_num_employees_ranges,
    },
    page,
    perPage,
  )
  console.error('[crm/SS] OK filters', JSON.stringify(filters), 'people', result.people?.length, 'err', result.error ?? 'none')
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({
    data: {
      interpretation,
      filters,
      page: result.page,
      total: result.total,
      people: result.people,
    },
  })
}
