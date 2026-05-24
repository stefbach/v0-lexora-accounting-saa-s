import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { id } = await params
    const body = await request.json()

    if (body.type === 'catalogue') {
      const { libelle, type_prime, montant_fixe, montant_par_unite, unite, pourcentage, bonus_objectif_montant, periode_application, postes_eligibles, actif } = body
      const updates: any = {}
      if (libelle !== undefined) updates.libelle = libelle
      if (type_prime !== undefined) updates.type_prime = type_prime
      if (montant_fixe !== undefined) updates.montant_fixe = montant_fixe
      if (montant_par_unite !== undefined) updates.montant_par_unite = montant_par_unite
      if (unite !== undefined) updates.unite = unite
      if (pourcentage !== undefined) updates.pourcentage = pourcentage
      if (bonus_objectif_montant !== undefined) updates.bonus_objectif_montant = bonus_objectif_montant
      if (periode_application !== undefined) updates.periode_application = periode_application
      if (postes_eligibles !== undefined) updates.postes_eligibles = postes_eligibles
      if (actif !== undefined) updates.actif = actif
      const { data, error } = await supabase.from('catalogue_primes').update(updates).eq('id', id).select().single()
      if (error) throw error
      return NextResponse.json({ prime: data })
    }

    // Mise à jour d'une saisie mensuelle
    const { montant, quantite, notes, approuve } = body
    const updates: any = {}
    if (montant !== undefined) updates.montant = montant
    if (quantite !== undefined) updates.quantite = quantite
    if (notes !== undefined) updates.notes = notes
    if (approuve !== undefined) {
      updates.approuve = approuve
      if (approuve) { updates.approuve_par = user.id; updates.approuve_at = new Date().toISOString() }
    }
    const { data, error } = await supabase.from('primes_variables_mois').update(updates).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json({ prime_mois: data })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    if (type === 'catalogue') {
      const { error } = await supabase.from('catalogue_primes').update({ actif: false }).eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true, message: 'Prime désactivée' })
    }
    const { error } = await supabase.from('primes_variables_mois').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
