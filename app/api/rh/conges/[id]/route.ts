import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'
import { recomputeSoldeCongesAll } from '@/lib/rh/soldes-conges'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * DELETE /api/rh/conges/:id — soft-delete a leave request.
 *
 * Matches POST /api/rh/conges with action=annuler: sets statut='annule',
 * re-credits the solde if the leave was previously approved. Same access
 * rules (manager in the employee's societe, OR the employee herself while
 * the leave is still en_attente).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()

    const { data: conge } = await supabase.from('demandes_conges').select('*').eq('id', id).maybeSingle()
    if (!conge) return NextResponse.json({ error: 'Demande non trouvée' }, { status: 404 })
    if (conge.statut === 'annule') {
      return NextResponse.json({ error: 'Demande déjà annulée' }, { status: 400 })
    }
    if (conge.statut === 'refuse') {
      return NextResponse.json({ error: 'Demande déjà refusée (aucune annulation possible)' }, { status: 400 })
    }

    const { data: emp } = await supabase
      .from('employes').select('id, societe_id, auth_user_id')
      .eq('id', conge.employe_id).maybeSingle()
    if (!emp) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

    const accessibleIds = await getUserSocieteIds(user.id)
    const isManager = accessibleIds.includes(emp.societe_id)
    const isSelf = emp.auth_user_id === user.id
    if (!isManager && !isSelf) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }
    if (isSelf && !isManager && conge.statut !== 'en_attente') {
      return NextResponse.json({
        error: 'Un employé ne peut annuler que ses demandes en attente. Demandez à votre manager.',
      }, { status: 403 })
    }

    const wasApproved = conge.statut === 'approuve'

    const { data: canceller } = await supabase
      .from('employes').select('id').eq('auth_user_id', user.id).maybeSingle()

    let motif: string | null = null
    try {
      const body = await request.json().catch(() => ({}))
      motif = body?.motif_annulation || body?.notes_manager || null
    } catch { /* empty body is fine */ }

    const { data, error } = await supabase
      .from('demandes_conges')
      .update({
        statut: 'annule',
        date_decision: new Date().toISOString(),
        approuve_par: canceller?.id || null,
        notes_manager: motif,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    if (wasApproved) {
      await recomputeSoldeCongesAll(supabase, conge.employe_id, conge.date_debut)
    }

    return NextResponse.json({ conge: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
