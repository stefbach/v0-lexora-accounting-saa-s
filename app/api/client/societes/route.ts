import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET — List sociétés assigned to the current logged-in client via dossiers
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Get all dossiers for this client with société and comptable info
    const { data: dossiers, error } = await supabase
      .from('dossiers')
      .select('id, societe_id, comptable_id, societe:societes(id, nom, brn, numero_tva_mra, statut_tva), comptable:profiles!dossiers_comptable_id_fkey(id, full_name, email, phone)')
      .eq('client_id', user.id)
      .eq('statut', 'actif')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Extract unique sociétés
    const societes = dossiers
      ?.filter(d => d.societe)
      .map(d => ({
        id: d.societe_id,
        dossier_id: d.id,
        ...d.societe,
        comptable: d.comptable,
      })) || []

    return NextResponse.json({ societes })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
