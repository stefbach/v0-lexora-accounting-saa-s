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

const APOLLO_BASE = 'https://api.apollo.io/api/v1'

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
  name?: string
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

interface ApolloMatchResponse {
  person?: ApolloPerson
  match_status?: string
}

export interface ApolloMatchInput extends Record<string, unknown> {
  first_name?: string
  last_name?: string
  email?: string
  linkedin_url?: string
  organization_name?: string
  domain?: string
}

export interface ApolloMatchResult {
  matched: boolean
  email?: string
  telephone?: string
  titre?: string
  linkedin_url?: string
  raw?: Record<string, unknown>
}

async function apolloPost<T = ApolloSearchResponse>(
  path: string,
  body: Record<string, unknown>,
  queryParams?: Record<string, string>,
): Promise<T> {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) throw new Error('APOLLO_API_KEY manquante')

  const url = new URL(`${APOLLO_BASE}${path}`)
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
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
  return res.json() as Promise<T>
}

/**
 * Enrichit un contact individuel via POST /api/v1/people/match.
 * Waterfall email/téléphone désactivé pour contrôler la consommation de crédits.
 */
export async function apolloMatchPerson(input: ApolloMatchInput): Promise<ApolloMatchResult> {
  if (!process.env.APOLLO_API_KEY) {
    return { matched: false }
  }
  const data = await apolloPost<ApolloMatchResponse>(
    '/people/match',
    input,
    {
      run_waterfall_email: 'false',
      run_waterfall_phone: 'false',
      reveal_personal_emails: 'false',
      reveal_phone_number: 'false',
    },
  )
  const person = data.person
  if (!person) return { matched: false }
  return {
    matched: true,
    email: person.email ?? undefined,
    telephone: person.phone_numbers?.[0]?.raw_number ?? undefined,
    titre: person.title ?? undefined,
    linkedin_url: person.linkedin_url ?? undefined,
    raw: person as unknown as Record<string, unknown>,
  }
}

// -----------------------------------------------------------------------------
// Aperçu société (consultation gratuite : la recherche d'organisations Apollo
// ne consomme PAS de crédit d'email/téléphone — seul le reveal/match en
// consomme). On retourne des lignes légères affichables sans rien insérer.
// -----------------------------------------------------------------------------
export interface ApolloCompanyPreview {
  apollo_id?: string
  nom: string
  telephone?: string
  site_web?: string
  linkedin_url?: string
  industrie?: string
  taille_effectif?: string
  ville?: string
  annee_creation?: number
  description?: string
}

export interface ApolloPreviewFilters {
  city?: string
  keyword_tags?: string[]
  organization_num_employees_ranges?: string[]
}

export interface ApolloPreviewResult {
  companies: ApolloCompanyPreview[]
  total: number
  page: number
  error?: string
}

export async function apolloSearchCompaniesPreview(
  filters: ApolloPreviewFilters,
  page = 1,
  perPage = 50,
): Promise<ApolloPreviewResult> {
  if (!process.env.APOLLO_API_KEY) {
    return { companies: [], total: 0, page, error: 'APOLLO_API_KEY non configurée' }
  }

  try {
    const body: Record<string, unknown> = {
      // Verrou Maurice non négociable. Si une ville est précisée, on cible
      // "<Ville>, Mauritius" ; sinon toute l'île.
      organization_locations: filters.city
        ? [`${filters.city}, Mauritius`]
        : ['Mauritius'],
      page: Math.max(1, page),
      per_page: Math.min(Math.max(1, perPage), 100),
    }
    // q_organization_keyword_tags est le SEUL champ de mots-clés que
    // /mixed_companies/search filtre réellement (q_keywords est ignoré).
    if (filters.keyword_tags?.length) {
      body.q_organization_keyword_tags = filters.keyword_tags
    }
    if (filters.organization_num_employees_ranges?.length) {
      body.organization_num_employees_ranges = filters.organization_num_employees_ranges
    }

    const res = await apolloPost('/organizations/search', body)
    const orgs = res.organizations ?? []
    const companies: ApolloCompanyPreview[] = orgs
      .filter((o) => o.name)
      .map((o) => ({
        apollo_id: o.id,
        nom: o.name as string,
        telephone: o.primary_phone?.number,
        site_web: o.website_url ?? undefined,
        linkedin_url: o.linkedin_url ?? undefined,
        industrie: o.industry ?? undefined,
        taille_effectif: employeeRange(o.estimated_num_employees),
        ville: o.city ?? undefined,
        annee_creation: o.founded_year ?? undefined,
        description: o.short_description ?? undefined,
      }))

    return {
      companies,
      total: res.pagination?.total_entries ?? companies.length,
      page: Math.max(1, page),
    }
  } catch (err) {
    return { companies: [], total: 0, page, error: (err as Error).message }
  }
}

// -----------------------------------------------------------------------------
// Aperçu DIRIGEANTS (consultation gratuite). La recherche de personnes Apollo
// renvoie nom + titre + société SANS consommer de crédit ; seuls les
// emails/téléphones restent masqués (reveal = payant, fait plus tard à la
// demande). C'est ce qui permet d'afficher les noms des dirigeants.
// -----------------------------------------------------------------------------
export interface ApolloPersonPreview {
  apollo_person_id?: string
  prenom?: string
  nom?: string
  nom_complet?: string
  titre?: string
  seniorite?: string
  linkedin_url?: string
  email_locked: boolean
  // société rattachée
  societe?: string
  societe_site_web?: string
  societe_telephone?: string
  societe_industrie?: string
  societe_ville?: string
  societe_linkedin?: string
}

export interface ApolloPeopleFilters {
  // Localité mauricienne précise (ex: "Grand Baie"). Mappée sur
  // organization_locations / person_locations — verrou Maurice conservé serveur.
  city?: string
  // Mots-clés secteur/activité de la société (mappés sur
  // q_organization_keyword_tags, le champ réellement filtré par Apollo).
  keyword_tags?: string[]
  person_titles?: string[]
  person_seniorities?: string[]
  organization_num_employees_ranges?: string[]
}

export interface ApolloPeoplePreviewResult {
  people: ApolloPersonPreview[]
  total: number
  page: number
  error?: string
}

// Séniorités "dirigeants" par défaut (valeurs acceptées par Apollo).
const DEFAULT_SENIORITIES = ['owner', 'founder', 'c_suite', 'partner', 'vp', 'head', 'director']

function isEmailLocked(email?: string, status?: string): boolean {
  if (!email) return true
  if (email.includes('not_unlocked') || email.includes('domain.com')) return true
  return status !== 'verified' && status !== 'likely_to_engage'
}

export async function apolloSearchPeoplePreview(
  filters: ApolloPeopleFilters,
  page = 1,
  perPage = 25,
): Promise<ApolloPeoplePreviewResult> {
  if (!process.env.APOLLO_API_KEY) {
    return { people: [], total: 0, page, error: 'APOLLO_API_KEY non configurée' }
  }

  try {
    // Verrou Maurice non négociable. Si une ville est précisée, on cible
    // "<Ville>, Mauritius" ; sinon toute l'île.
    const locations = filters.city ? [`${filters.city}, Mauritius`] : ['Mauritius']
    const body: Record<string, unknown> = {
      person_locations: locations,
      organization_locations: locations,
      page: Math.max(1, page),
      per_page: Math.min(Math.max(1, perPage), 100),
    }
    // q_organization_keyword_tags filtre par secteur de la société (le champ
    // réellement pris en compte par Apollo, contrairement à q_keywords).
    if (filters.keyword_tags?.length) body.q_organization_keyword_tags = filters.keyword_tags
    if (filters.person_titles?.length) body.person_titles = filters.person_titles
    body.person_seniorities = filters.person_seniorities?.length
      ? filters.person_seniorities
      : DEFAULT_SENIORITIES
    if (filters.organization_num_employees_ranges?.length) {
      body.organization_num_employees_ranges = filters.organization_num_employees_ranges
    }

    const res = await apolloPost('/mixed_people/search', body)
    const rows = res.people ?? []
    const people: ApolloPersonPreview[] = rows.map((p) => {
      const org = p.organization
      const nom_complet =
        p.name?.trim() ||
        [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
        undefined
      return {
        apollo_person_id: p.id,
        prenom: p.first_name ?? undefined,
        nom: p.last_name ?? undefined,
        nom_complet,
        titre: p.title ?? undefined,
        seniorite: p.seniority ?? undefined,
        linkedin_url: p.linkedin_url ?? undefined,
        email_locked: isEmailLocked(p.email, p.email_status),
        societe: org?.name ?? undefined,
        societe_site_web: org?.website_url ?? undefined,
        societe_telephone: org?.primary_phone?.number,
        societe_industrie: org?.industry ?? undefined,
        societe_ville: org?.city ?? undefined,
        societe_linkedin: org?.linkedin_url ?? undefined,
      }
    })

    return {
      people,
      total: res.pagination?.total_entries ?? people.length,
      page: Math.max(1, page),
    }
  } catch (err) {
    return { people: [], total: 0, page, error: (err as Error).message }
  }
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
      const keywordTags = [opts.query, opts.industrie]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim())
      const orgRes = await apolloPost('/organizations/search', {
        organization_locations: opts.region
          ? [`${opts.region}, Mauritius`]
          : ['Mauritius'],
        ...(keywordTags.length ? { q_organization_keyword_tags: keywordTags } : {}),
        page: 1,
        per_page: Math.min(limit, 100),
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
