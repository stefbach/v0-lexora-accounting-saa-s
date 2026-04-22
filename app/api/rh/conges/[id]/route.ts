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
 * DELETE /api/rh/conges/:id — soft-delete (annule) par défaut, OU hard-delete
 * avec audit trail si le query param `hard=true` est présent.
 *
 * Mode SOFT (défaut) — compatible avec le self-service salarié :
 *   Passe statut='annule', re-crédite le solde si la demande était approuvée.
 *   Rules : manager dans la société de l'employé OU employé lui-même pour sa
 *   demande encore en_attente.
 *
 * Mode HARD (?hard=true, sprint S1) — réservé RH/admin :
 *   Supprime définitivement la demande de demandes_conges après snapshot
 *   JSONB dans demandes_conges_supprimees. Recompute le solde. Impossible
 *   pour un salarié (403). Utilisé pour nettoyer les demandes doublons
 *   créées par erreur.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const hardDelete = searchParams.get('hard') === 'true'
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()

    const { data: conge } = await supabase.from('demandes_conges').select('*').eq('id', id).maybeSingle()
    if (!conge) return NextResponse.json({ error: 'Demande non trouvée' }, { status: 404 })

    // ── Mode HARD (S1) : réservé RH/admin/super_admin ──
    if (hardDelete) {
      const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).maybeSingle()
      const profileRole = String(profile?.role || '').toLowerCase()
      if (!['admin', 'super_admin', 'rh', 'rh_manager'].includes(profileRole)) {
        // Fallback : role_rh sur employes (legacy)
        const { data: empSelf } = await supabase.from('employes').select('role_rh').eq('auth_user_id', user.id).maybeSingle()
        const roleRh = String(empSelf?.role_rh || '').toLowerCase()
        if (!['rh', 'rh_manager', 'admin', 'super_admin'].includes(roleRh)) {
          return NextResponse.json({
            error: 'Suppression définitive réservée aux rôles RH/admin.',
          }, { status: 403 })
        }
      }

      // Vérifier accès société
      const { data: emp } = await supabase
        .from('employes').select('societe_id').eq('id', conge.employe_id).maybeSingle()
      const accessibleIds = await getUserSocieteIds(user.id)
      if (!emp || !accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
      }

      // Motif (optionnel) depuis le body
      let motifSuppression: string | null = null
      try {
        const body = await request.json().catch(() => ({}))
        motifSuppression = body?.motif || body?.motif_suppression || null
      } catch { /* empty body ok */ }

      const wasApproved = conge.statut === 'approuve'
      const dateDebutForRecompute = conge.date_debut

      // 1. Snapshot dans audit trail
      const { error: auditErr } = await supabase.from('demandes_conges_supprimees').insert({
        demande_id_original: conge.id,
        employe_id: conge.employe_id,
        type_conge: conge.type_conge,
        date_debut: conge.date_debut,
        date_fin: conge.date_fin,
        nb_jours: conge.nb_jours,
        statut_au_moment_suppression: conge.statut,
        donnees_completes: conge,
        supprime_par: user.id,
        motif_suppression: motifSuppression,
      })
      if (auditErr) {
        console.error('[conges hard-delete] audit insert failed:', auditErr.message)
        return NextResponse.json({ error: `Audit trail echec: ${auditErr.message}` }, { status: 500 })
      }

      // 2. Hard DELETE
      const { error: delErr } = await supabase.from('demandes_conges').delete().eq('id', id)
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

      // 3. Recompute solde si la demande était approuvée (impactait un solde)
      if (wasApproved) {
        await recomputeSoldeCongesAll(supabase, conge.employe_id, dateDebutForRecompute)
      }

      console.log(`[conges hard-delete] ${id} (${conge.type_conge} ${conge.date_debut}→${conge.date_fin} ${conge.nb_jours}j statut=${conge.statut}) par user=${user.id}`)
      return NextResponse.json({
        success: true,
        message: wasApproved
          ? 'Demande supprimée, solde recomputé.'
          : 'Demande supprimée.',
        audit_id: null, // renvoyer l'id audit si besoin
      })
    }

    // ── Mode SOFT (annule) — comportement historique ──
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
