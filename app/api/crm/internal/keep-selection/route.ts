// =============================================================================
// POST /api/crm/internal/keep-selection
// "Garder ce qu'on a choisi" — ingère en base UNIQUEMENT les sociétés
// sélectionnées dans l'aperçu de recherche intelligente.
//
// Aucune nouvelle requête Apollo ici : on réutilise les lignes déjà
// récupérées côté client (donc aucun crédit consommé). Les contacts/emails
// pourront être enrichis plus tard, à la demande, société par société.
//
// Auth : session web (rôle CRM).
// Body : { companies: ApolloCompanyPreview[] }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmAccess } from '@/lib/crm/auth'
import { ingestPayloads } from '@/lib/crm/ingest'
import type { CrmIngestPayload } from '@/lib/crm/types'

interface SelectedCompany {
  apollo_id?: string
  nom?: string
  telephone?: string
  site_web?: string
  linkedin_url?: string
  industrie?: string
  taille_effectif?: string
  ville?: string
  annee_creation?: number
  description?: string
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const body = await req.json().catch(() => null)
  const companies = (body as { companies?: SelectedCompany[] })?.companies
  if (!Array.isArray(companies) || companies.length === 0) {
    return NextResponse.json({ error: 'companies[] requis' }, { status: 400 })
  }

  const payloads: CrmIngestPayload[] = []
  for (const c of companies) {
    const nom = c?.nom?.trim()
    if (!nom) continue
    payloads.push({
      source: 'apollo',
      company: {
        nom,
        telephone: c.telephone ?? undefined,
        site_web: c.site_web ?? undefined,
        linkedin_url: c.linkedin_url ?? undefined,
        industrie: c.industrie ?? undefined,
        activite: c.industrie ?? undefined,
        taille_effectif: c.taille_effectif ?? undefined,
        ville: c.ville ?? undefined,
        annee_creation: c.annee_creation ?? undefined,
        description: c.description ?? undefined,
        pays: 'Mauritius',
        source: 'apollo',
      },
      raw: c.apollo_id ? { apollo_id: c.apollo_id } : undefined,
    })
  }

  if (payloads.length === 0) {
    return NextResponse.json({ error: 'aucune société valide (nom requis)' }, { status: 400 })
  }

  try {
    const result = await ingestPayloads(payloads, auth.user.id)
    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json(
      { error: `ingest_failed: ${(err as Error).message}` },
      { status: 500 },
    )
  }
}
