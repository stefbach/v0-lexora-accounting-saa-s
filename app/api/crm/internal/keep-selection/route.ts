// =============================================================================
// POST /api/crm/internal/keep-selection
// "Garder ce qu'on a choisi" — ingère en base UNIQUEMENT les dirigeants
// sélectionnés dans l'aperçu de recherche intelligente (avec leur société).
//
// Aucune nouvelle requête Apollo ici : on réutilise les lignes déjà
// récupérées côté client (donc aucun crédit consommé). Les emails/téléphones
// restent masqués et pourront être révélés/enrichis plus tard, à la demande.
//
// Auth : session web (rôle CRM, permission 'import').
// Body : { people: ApolloPersonPreview[] }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmPermission } from '@/lib/crm/permissions'
import { ingestPayloads } from '@/lib/crm/ingest'
import type { CrmIngestPayload } from '@/lib/crm/types'

interface SelectedPerson {
  apollo_person_id?: string
  prenom?: string
  nom?: string
  nom_complet?: string
  titre?: string
  seniorite?: string
  linkedin_url?: string
  email_locked?: boolean
  societe?: string
  societe_site_web?: string
  societe_telephone?: string
  societe_industrie?: string
  societe_ville?: string
  societe_linkedin?: string
}

const DECISION_SENIORITIES = ['owner', 'founder', 'c_suite', 'partner', 'vp', 'head']

export async function POST(req: NextRequest) {
  const auth = await requireCrmPermission('import')
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const body = await req.json().catch(() => null)
  const people = (body as { people?: SelectedPerson[] })?.people
  if (!Array.isArray(people) || people.length === 0) {
    return NextResponse.json({ error: 'people[] requis' }, { status: 400 })
  }

  const payloads: CrmIngestPayload[] = []
  for (const p of people) {
    // Une personne sans société rattachée ne peut pas être ingérée
    // (le modèle exige company.nom). On rattache alors un placeholder.
    const societe = p.societe?.trim() || (p.nom_complet ? `Société de ${p.nom_complet}` : null)
    if (!societe) continue

    const contactNom = p.nom?.trim() || p.nom_complet?.trim()
    payloads.push({
      source: 'apollo',
      company: {
        nom: societe,
        telephone: p.societe_telephone ?? undefined,
        site_web: p.societe_site_web ?? undefined,
        linkedin_url: p.societe_linkedin ?? undefined,
        industrie: p.societe_industrie ?? undefined,
        activite: p.societe_industrie ?? undefined,
        ville: p.societe_ville ?? undefined,
        pays: 'Mauritius',
        source: 'apollo',
      },
      contacts: contactNom
        ? [
            {
              prenom: p.prenom ?? undefined,
              nom: contactNom,
              titre: p.titre ?? undefined,
              seniorite: p.seniorite ?? undefined,
              decision_maker: DECISION_SENIORITIES.includes(p.seniorite ?? ''),
              linkedin_url: p.linkedin_url ?? undefined,
              source: 'apollo',
            },
          ]
        : undefined,
      raw: p.apollo_person_id ? { apollo_person_id: p.apollo_person_id } : undefined,
    })
  }

  if (payloads.length === 0) {
    return NextResponse.json({ error: 'aucune ligne valide' }, { status: 400 })
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
