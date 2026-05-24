import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    let societes
    if (profile?.role && ['admin', 'super_admin'].includes(profile.role)) {
      // Admin : toutes les sociétés avec stats assignation
      const { data, error } = await supabase
        .from('societes')
        .select('id, nom, brn, ern, statut')
        .order('nom')
      if (error) throw error
      societes = data
    } else {
      // Comptable : seulement ses sociétés assignées
      const { data, error } = await supabase
        .from('vue_comptable_portefeuille')
        .select('societe_id, societe_nom, brn, ern, type_acces, nb_dossiers_en_cours, docs_en_attente, derniere_ecriture')
        .eq('comptable_id', user.id)
        .order('societe_nom')
      if (error) throw error
      societes = (data || []).map(r => ({
        id: r.societe_id,
        nom: r.societe_nom,
        brn: r.brn,
        ern: r.ern,
        type_acces: r.type_acces,
        nb_dossiers_en_cours: r.nb_dossiers_en_cours,
        docs_en_attente: r.docs_en_attente,
        derniere_ecriture: r.derniere_ecriture
      }))
    }

    return NextResponse.json({ societes: societes || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
