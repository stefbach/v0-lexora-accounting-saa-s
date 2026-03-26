import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET — List clients visible to the current comptable
// comptable: sees ALL clients
// comptable_dedie: sees ONLY clients assigned via dossiers
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Get current user's role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role

    if (role !== 'comptable' && role !== 'comptable_dedie') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    if (role === 'comptable') {
      // Comptable admin: sees all clients
      const { data: clients, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, phone, comptable_id, is_active, created_at')
        .in('role', ['client_admin', 'client_user'])
        .order('created_at', { ascending: false })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Get all dossiers for context
      const { data: dossiers } = await supabase
        .from('dossiers')
        .select('*, societe:societes(id, nom)')

      return NextResponse.json({ clients, dossiers: dossiers || [] })
    } else {
      // Comptable dédié: only assigned clients via dossiers
      const { data: dossiers, error: dossierError } = await supabase
        .from('dossiers')
        .select('*, client:profiles!dossiers_client_id_fkey(id, email, full_name, role, phone, is_active, created_at), societe:societes(id, nom)')
        .eq('comptable_id', user.id)
        .eq('statut', 'actif')

      if (dossierError) return NextResponse.json({ error: dossierError.message }, { status: 500 })

      // Extract unique clients
      const clientMap = new Map<string, unknown>()
      dossiers?.forEach(d => {
        if (d.client) clientMap.set(d.client.id, d.client)
      })

      return NextResponse.json({
        clients: Array.from(clientMap.values()),
        dossiers: dossiers || [],
      })
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
