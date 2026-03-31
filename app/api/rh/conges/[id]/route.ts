import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Get the société IDs accessible by this user */
async function getUserSocieteIds(supabase: ReturnType<typeof getAdminClient>, userId: string): Promise<string[]> {
  const { data: profile } = await supabase.from('profiles').select('role, societe_id').eq('id', userId).maybeSingle()
  if (profile?.societe_id) return [profile.societe_id]

  const { data: dossiers } = await supabase.from('dossiers').select('societe_id').eq('client_id', userId)
  const { data: owned } = await supabase.from('societes').select('id').eq('created_by', userId)
  return [...new Set([...(dossiers || []).map(d => d.societe_id), ...(owned || []).map(s => s.id)])]
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { action, commentaire, motif_refus } = await request.json()

    // Verify the congé belongs to an employee in a société the user has access to
    const { data: conge } = await supabase.from('demandes_conges').select('employe_id').eq('id', id).maybeSingle()
    if (!conge) return NextResponse.json({ error: 'Demande non trouvée' }, { status: 404 })

    const accessibleIds = await getUserSocieteIds(supabase, user.id)
    const { data: emp } = await supabase.from('employes').select('id, societe_id').eq('id', conge.employe_id).maybeSingle()
    if (!emp || !accessibleIds.includes(emp.societe_id)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const statut = action === 'approuver' ? 'approuve' : action === 'refuser' ? 'refuse' : 'annule'
    const updatePayload: Record<string, any> = {
      statut,
      commentaire_manager: commentaire || motif_refus || null,
      date_approbation: new Date().toISOString(),
    }

    const { data, error } = await supabase.from('demandes_conges')
      .update(updatePayload)
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
