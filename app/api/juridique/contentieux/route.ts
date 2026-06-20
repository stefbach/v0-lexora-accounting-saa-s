import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import {
  qualifierLitige,
  evaluerDossier,
  genererActe,
  questionContentieux,
  type FaitsLitige,
  type ParametresActe,
} from '@/lib/juridique/expertContentieux'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * /api/juridique/contentieux — moteur du Département Juridique (contentieux).
 *
 * Actions :
 *   • qualifier    → qualification juridique d'un litige (juridiction, prescription...)
 *   • evaluer      → analyse stratégique + chances de succès + étapes
 *   • generer_acte → rédaction d'un acte (mise en demeure, sommation...)
 *   • question     → conseil juridique / recherche (chat)
 */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const action = String((body as { action?: string }).action || '')

    // Multi-tenant guard
    const societeId = (body as { societe_id?: string }).societe_id
    if (societeId) {
      try {
        await assertSocieteAccess(supabase, user.id, societeId)
      } catch (err) {
        if (err instanceof SocieteAccessError) {
          return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
        }
        throw err
      }
    }

    if (action === 'qualifier') {
      const faits = (body as { faits?: FaitsLitige }).faits
      if (!faits?.description) return NextResponse.json({ error: 'Description requise' }, { status: 400 })
      const qualification = await qualifierLitige(faits)
      return NextResponse.json({ qualification })
    }

    if (action === 'evaluer') {
      const faits = (body as { faits?: FaitsLitige }).faits
      if (!faits?.description) return NextResponse.json({ error: 'Description requise' }, { status: 400 })
      const evaluation = await evaluerDossier(faits)
      return NextResponse.json({ evaluation })
    }

    if (action === 'generer_acte') {
      const params = (body as { params?: ParametresActe }).params
      if (!params?.type_acte || !params?.objet) {
        return NextResponse.json({ error: 'type_acte et objet requis' }, { status: 400 })
      }
      // Pré-remplissage émetteur depuis la société
      if (societeId && (!params.societe?.nom || params.societe.nom === '')) {
        const { data: soc } = await supabase
          .from('societes')
          .select('nom, brn, adresse')
          .eq('id', societeId)
          .single()
        if (soc) {
          params.societe = {
            nom: soc.nom || params.societe?.nom || 'Société',
            brn: soc.brn || params.societe?.brn,
            adresse: (soc as { adresse?: string }).adresse || params.societe?.adresse,
          }
        }
      }
      const acte = await genererActe(params)
      return NextResponse.json({ acte })
    }

    if (action === 'question') {
      const question = String((body as { question?: string }).question || '')
      if (!question) return NextResponse.json({ error: 'Question requise' }, { status: 400 })
      const { texte, sources } = await questionContentieux({
        question,
        contexte: (body as { contexte?: string }).contexte,
        domaines: (body as { domaines?: import('@/lib/juridique/referentielMauricien').DomaineJuridique[] }).domaines,
        historique: (body as { historique?: Array<{ role: 'user' | 'assistant'; content: string }> }).historique,
      })
      return NextResponse.json({ reponse: texte, sources })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e) {
    console.error('[juridique/contentieux]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
