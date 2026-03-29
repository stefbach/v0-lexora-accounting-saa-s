import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { action, commentaire } = await request.json()

    const statut = action === 'approuver' ? 'approuve' : action === 'refuser' ? 'refuse' : 'annule'
    const { data, error } = await supabase.from('demandes_conges')
      .update({ statut, commentaire_manager: commentaire, date_approbation: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) throw error

    // Si approuvé, décrémenter le solde
    if (statut === 'approuve' && data.type_conge === 'AL') {
      const annee = new Date(data.date_debut).getFullYear()
      await supabase.rpc('decrement_solde_conge', { p_employe_id: data.employe_id, p_annee: annee, p_jours: data.nb_jours }).maybeSingle()
    }
    return NextResponse.json({ conge: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
