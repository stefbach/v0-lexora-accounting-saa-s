import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToEmploye } from '@/lib/rh/access'
import { lastDayOfMonth } from '@/lib/rh/period'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    // Multi-tenant: verify user has access to this employee
    const hasAccess = await userHasAccessToEmploye(user.id, id)
    if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cet employé' }, { status: 403 })

    const supabase = getAdminClient()

    const { searchParams } = new URL(_req.url)
    const year = searchParams.get('year')
    const pointage_mois = searchParams.get('pointage_mois')

    // Build bulletin query - all bulletins, optionally filtered by year
    let bulletinQuery = supabase.from('bulletins_paie').select('*').eq('employe_id', id).order('periode', { ascending: false })
    if (year) {
      bulletinQuery = bulletinQuery.gte('periode', `${year}-01-01`).lte('periode', `${year}-12-31`)
    }

    // Build conges query - all leave requests, optionally filtered by year
    let congesQuery = supabase.from('demandes_conges').select('*').eq('employe_id', id).order('date_debut', { ascending: false })
    if (year) {
      congesQuery = congesQuery.gte('date_debut', `${year}-01-01`).lte('date_debut', `${year}-12-31`)
    }

    // Build pointages query - month-based or last 31 days
    let pointagesQuery = supabase.from('pointages').select('*').eq('employe_id', id).order('date_pointage', { ascending: false })
    if (pointage_mois) {
      pointagesQuery = pointagesQuery.gte('date_pointage', `${pointage_mois}-01`).lte('date_pointage', lastDayOfMonth(pointage_mois))
    } else {
      pointagesQuery = pointagesQuery.limit(31)
    }

    // Sprint 5 FIX 2 — inclure l'historique des révisions salaire.
    // Best-effort : si la table n'existe pas ou l'accès est refusé on
    // retourne [] sans bloquer le chargement de la fiche.
    const historiqueSalairesPromise = supabase.from('historique_salaires')
      .select('id, salaire_precedent, salaire_nouveau, motif, date_effet, created_at')
      .eq('employe_id', id)
      .order('date_effet', { ascending: false })
      .then(r => r.data || [], () => [])

    const [emp, bulletins, conges, soldes, pointages, historiqueSalaires] = await Promise.all([
      supabase.from('employes').select('*').eq('id', id).single(),
      bulletinQuery,
      congesQuery,
      supabase.from('soldes_conges').select('*').eq('employe_id', id).order('annee', { ascending: false }),
      pointagesQuery,
      historiqueSalairesPromise,
    ])

    return NextResponse.json({
      employe: emp.data,
      bulletins: bulletins.data,
      conges: conges.data,
      soldes: soldes.data,
      pointages: pointages.data,
      historique_salaires: historiqueSalaires,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    // Multi-tenant: verify user has access to this employee
    const hasAccess = await userHasAccessToEmploye(user.id, id)
    if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cet employé' }, { status: 403 })

    const supabase = getAdminClient()
    const body = await request.json()

    // Remove fields that shouldn't be updated directly
    delete body.id
    delete body.created_at
    delete body.actif

    // Sprint 5 FIX 2 — tracer les révisions de salaire dans historique_salaires.
    // Jusqu'ici les changements de salaire_base écrasaient silencieusement la
    // valeur précédente sans audit. Maintenant on capture le delta avant la
    // mise à jour pour pouvoir afficher l'historique complet des révisions
    // dans la fiche employé.
    let salaireChange: { ancien: number, nouveau: number, motif?: string } | null = null
    if (body.salaire_base !== undefined) {
      const newSalaire = Number(body.salaire_base)
      if (!Number.isNaN(newSalaire) && newSalaire > 0) {
        const { data: current } = await supabase
          .from('employes').select('salaire_base').eq('id', id).maybeSingle()
        const oldSalaire = Number(current?.salaire_base) || 0
        if (oldSalaire !== newSalaire) {
          salaireChange = {
            ancien: oldSalaire,
            nouveau: newSalaire,
            motif: typeof body.motif_revision_salaire === 'string' ? body.motif_revision_salaire : undefined,
          }
        }
      }
    }
    // motif_revision_salaire n'est pas une colonne employes → ne pas l'envoyer
    delete body.motif_revision_salaire

    const { data, error } = await supabase
      .from('employes')
      .update(body)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    // Insert historique_salaires en best-effort (ne bloque jamais la mise à
    // jour si la table manque ou si la politique RLS refuse).
    if (salaireChange) {
      try {
        const { data: modifieEmp } = await supabase.from('employes')
          .select('id').eq('auth_user_id', user.id).maybeSingle()
        await supabase.from('historique_salaires').insert({
          employe_id: id,
          salaire_precedent: salaireChange.ancien,
          salaire_nouveau: salaireChange.nouveau,
          motif: salaireChange.motif || 'Révision salaire',
          date_effet: new Date().toISOString().slice(0, 10),
          modifie_par: modifieEmp?.id || null,
        })
        console.log(`[employes PATCH] salaire révisé: ${salaireChange.ancien} → ${salaireChange.nouveau} MUR (employe=${id})`)
      } catch (e: any) {
        console.warn('[employes PATCH] historique_salaires insert skipped:', e?.message || e)
      }
    }

    return NextResponse.json({ employe: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    // Multi-tenant: verify user has access to this employee
    const hasAccess = await userHasAccessToEmploye(user.id, id)
    if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cet employé' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const mode = (searchParams.get('mode') || 'soft').toLowerCase()

    const supabase = getAdminClient()

    if (mode === 'hard') {
      // Check if employee has any bulletins_paie records
      const { count, error: countError } = await supabase
        .from('bulletins_paie')
        .select('*', { count: 'exact', head: true })
        .eq('employe_id', id)
      if (countError) throw countError

      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: `Impossible de supprimer: ${count} bulletin(s) existants. Utilisez la suppression soft.` },
          { status: 409 }
        )
      }

      // Hard delete - cascades to related tables via FK
      const { error: delError } = await supabase
        .from('employes')
        .delete()
        .eq('id', id)
      if (delError) throw delError

      return NextResponse.json({ success: true, mode: 'hard' })
    }

    // Default: soft delete - mark as departed
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('employes')
      .update({ date_depart: today })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    return NextResponse.json({ success: true, mode: 'soft', employe: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
