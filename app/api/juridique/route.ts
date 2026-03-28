import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { genererContrat, verifierContrat } from '@/lib/rh/expertRH'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { action } = body

    if (action === 'generer_contrat') {
      const html = await genererContrat({
        type: body.type || 'CDI',
        secteur: body.secteur || 'general',
        employe_nom: body.employe_nom,
        poste: body.poste,
        salaire: body.salaire,
        date_debut: body.date_debut,
      })

      const { data } = await supabase.from('contrats_employes').insert({
        employe_id: body.employe_id,
        societe_id: body.societe_id,
        type_contrat: body.type || 'CDI',
        secteur: body.secteur,
        date_debut: body.date_debut,
        date_fin: body.date_fin || null,
        salaire_brut: body.salaire,
        poste: body.poste,
        html_content: html,
        statut: 'brouillon',
      }).select().single()

      return NextResponse.json({ contrat: data, html })
    }

    if (action === 'verifier_contrat') {
      const analyse = await verifierContrat(body.html)
      return NextResponse.json({ analyse })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
