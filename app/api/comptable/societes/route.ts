import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET — List sociétés managed by the current comptable
// comptable: sees sociétés where comptable_id = their id OR linked via dossiers
// comptable_dedie: sees only sociétés linked via their dossiers
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role

    if (role !== 'comptable' && role !== 'comptable_dedie') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    // Get sociétés where this comptable is assigned directly
    const { data: directSocietes } = await supabase
      .from('societes')
      .select('*')
      .eq('comptable_id', user.id)

    // Get sociétés linked via dossiers
    const { data: dossiers } = await supabase
      .from('dossiers')
      .select('societe_id, societe:societes(*)')
      .eq('comptable_id', user.id)
      .eq('statut', 'actif')

    // Merge and deduplicate
    const societeMap = new Map<string, unknown>()

    directSocietes?.forEach((s: any) => societeMap.set(s.id, s))
    dossiers?.forEach(d => {
      if (d.societe) societeMap.set((d.societe as any).id, d.societe)
    })

    return NextResponse.json({ societes: Array.from(societeMap.values()) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
