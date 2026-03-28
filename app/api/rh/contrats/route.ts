import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// ── GET /api/rh/contrats ─────────────────────────────────────────────────────
// Query params : societe_id, type_contrat, statut, employe_id
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const url = new URL(request.url)
    const societe_id = url.searchParams.get('societe_id')
    const type_contrat = url.searchParams.get('type_contrat')
    const statut = url.searchParams.get('statut')
    const employe_id = url.searchParams.get('employe_id')

    let query = supabase
      .from('contrats_employes')
      .select(`
        id,
        type_contrat,
        secteur,
        date_debut,
        date_fin,
        salaire_brut,
        statut,
        date_signature,
        notes,
        created_at,
        employe:employes (
          id,
          prenom,
          nom,
          poste,
          email,
          societe_id,
          societe:societes ( id, nom )
        )
      `)
      .order('created_at', { ascending: false })

    if (employe_id) query = query.eq('employe_id', employe_id)
    if (type_contrat) query = query.eq('type_contrat', type_contrat)
    if (statut) query = query.eq('statut', statut)
    if (societe_id) query = query.eq('employe.societe_id', societe_id)

    const { data: contrats, error } = await query

    if (error) throw error
    return NextResponse.json({ contrats: contrats ?? [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
