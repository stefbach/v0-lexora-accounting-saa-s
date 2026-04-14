import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Sum approved leaves for an employee/year/type and write the result
 * to the correct balance table. Local copy of the helper in ../route.ts
 * — kept here so this file stays self-contained.
 *
 *   AL  → soldes_conges.{al_pris, al_impose_societe, al_impose_employe}
 *   SL  → soldes_conges.sl_pris
 *   MAT → conges_employes row (jours_pris, default jours_droit=112)
 *   PAT → conges_employes row (jours_pris, default jours_droit=28)
 *   Others → no-op
 */
async function recomputeSoldeConges(
  supabase: ReturnType<typeof getAdminClient>,
  employeId: string,
  typeConge: string,
  annee: number
): Promise<void> {
  try {
    if (typeConge === 'AL') {
      const { data: approved } = await supabase
        .from('demandes_conges')
        .select('nb_jours, impose_par_societe')
        .eq('employe_id', employeId).eq('type_conge', 'AL').eq('statut', 'approuve')
        .gte('date_debut', `${annee}-01-01`).lte('date_debut', `${annee}-12-31`)

      let imposeSociete = 0, imposeEmploye = 0
      for (const c of approved || []) {
        const n = Number(c.nb_jours) || 0
        if (c.impose_par_societe === true) imposeSociete += n; else imposeEmploye += n
      }
      const totalPris = Math.round((imposeSociete + imposeEmploye) * 100) / 100
      imposeSociete = Math.round(imposeSociete * 100) / 100
      imposeEmploye = Math.round(imposeEmploye * 100) / 100

      const { data: existing } = await supabase.from('soldes_conges')
        .select('id').eq('employe_id', employeId).eq('annee', annee).maybeSingle()
      if (existing) {
        await supabase.from('soldes_conges').update({
          al_pris: totalPris, al_impose_societe: imposeSociete, al_impose_employe: imposeEmploye,
        }).eq('id', existing.id)
      } else {
        await supabase.from('soldes_conges').insert({
          employe_id: employeId, annee,
          al_droit: 22, al_pris: totalPris,
          al_impose_societe: imposeSociete, al_impose_employe: imposeEmploye,
          sl_droit: 15, sl_pris: 0,
        })
      }
      return
    }

    if (typeConge === 'SL') {
      const { data: approved } = await supabase
        .from('demandes_conges').select('nb_jours')
        .eq('employe_id', employeId).eq('type_conge', 'SL').eq('statut', 'approuve')
        .gte('date_debut', `${annee}-01-01`).lte('date_debut', `${annee}-12-31`)
      const totalPris = Math.round(
        (approved || []).reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0) * 100
      ) / 100
      const { data: existing } = await supabase.from('soldes_conges')
        .select('id').eq('employe_id', employeId).eq('annee', annee).maybeSingle()
      if (existing) {
        await supabase.from('soldes_conges').update({ sl_pris: totalPris }).eq('id', existing.id)
      } else {
        await supabase.from('soldes_conges').insert({
          employe_id: employeId, annee,
          al_droit: 22, al_pris: 0, al_impose_societe: 0, al_impose_employe: 0,
          sl_droit: 15, sl_pris: totalPris,
        })
      }
      return
    }

    if (typeConge === 'MAT' || typeConge === 'PAT') {
      const { data: approved } = await supabase
        .from('demandes_conges').select('nb_jours')
        .eq('employe_id', employeId).eq('type_conge', typeConge).eq('statut', 'approuve')
        .gte('date_debut', `${annee}-01-01`).lte('date_debut', `${annee}-12-31`)
      const totalPris = Math.round(
        (approved || []).reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0) * 100
      ) / 100
      const defaultDroit = typeConge === 'MAT' ? 112 : 28
      const { data: existing } = await supabase.from('conges_employes')
        .select('id').eq('employe_id', employeId).eq('annee', annee).eq('type_conge', typeConge).maybeSingle()
      if (existing) {
        await supabase.from('conges_employes').update({
          jours_pris: totalPris, updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
      } else {
        await supabase.from('conges_employes').insert({
          employe_id: employeId, annee, type_conge: typeConge,
          jours_droit: defaultDroit, jours_pris: totalPris,
        })
      }
    }
  } catch (err: any) {
    console.warn(`[conges/[id]] recomputeSoldeConges failed (non-blocking):`, err?.message)
  }
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
      const annee = new Date(conge.date_debut).getFullYear()
      await recomputeSoldeConges(supabase, conge.employe_id, conge.type_conge, annee)
    }

    return NextResponse.json({ conge: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
