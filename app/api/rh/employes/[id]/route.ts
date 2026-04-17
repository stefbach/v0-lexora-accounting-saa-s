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

    // Sprint 7 FIX 2 — suppression des refs à historique_salaires :
    // la table n'existe pas en prod (mig 100 non appliquée ou ignorée)
    // → les requêtes SELECT/INSERT déclenchaient des 500 au chargement
    // de la fiche employé + cassaient la mise à jour du salaire.
    // Si un audit trail des révisions est nécessaire plus tard, créer
    // une vraie migration IF NOT EXISTS + réintroduire.

    const [emp, bulletins, conges, soldes, pointages] = await Promise.all([
      supabase.from('employes').select('*').eq('id', id).single(),
      bulletinQuery,
      congesQuery,
      supabase.from('soldes_conges').select('*').eq('employe_id', id).order('annee', { ascending: false }),
      pointagesQuery,
    ])

    return NextResponse.json({
      employe: emp.data,
      bulletins: bulletins.data,
      conges: conges.data,
      soldes: soldes.data,
      pointages: pointages.data,
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

    // Même renommage que POST : role (envoyé par certains clients legacy)
    // → role_rh (colonne réelle en prod). profiles.role est un autre champ
    // géré séparément — pas ici.
    if (body.role && !body.role_rh) {
      body.role_rh = body.role
    }
    delete body.role

    // Sprint 7 FIX 2 — suppression du tracking historique_salaires
    // (table inexistante en prod causait 500 silencieux qui bloquait
    // parfois le PATCH). On accepte simplement la mise à jour de
    // salaire_base comme n'importe quel autre champ. Le salaire
    // actuel est TOUJOURS employes.salaire_base — source de vérité
    // unique, modifiable depuis l'UI (cf. FIX 1).
    //
    // Garde-fou : rejet si salaire_base invalide (NaN, <= 0) pour
    // éviter l'écrasement accidentel à 0.
    let oldSalaire: number | null = null
    if (body.salaire_base !== undefined) {
      const n = Number(body.salaire_base)
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({
          error: 'salaire_base invalide — valeur > 0 requise pour éviter d\'écraser le salaire à 0',
        }, { status: 400 })
      }
      body.salaire_base = n
      // Sprint 9 BUG 2 — capturer l'ancien salaire AVANT update pour décider
      // s'il faut recalculer les bulletins non verrouillés.
      const { data: current } = await supabase
        .from('employes').select('salaire_base').eq('id', id).maybeSingle()
      oldSalaire = Number(current?.salaire_base) || 0
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

    // Sprint 9 BUG 2 — si le salaire a changé, propager aux bulletins
    // NON VERROUILLÉS (verrouille != true) du mois en cours uniquement.
    // Les bulletins verrouillés (paie clôturée) ne sont JAMAIS modifiés
    // pour préserver l'audit trail historique.
    //
    // Politique :
    //   - On ne touche que les bulletins du mois courant (periode = mois en cours)
    //     pour ne pas toucher d'anciens bulletins même non-verrouillés
    //     (snapshots historiques).
    //   - Update de bulletins_paie.salaire_base uniquement (pas un
    //     recalcul complet — le recalcul OT/CSG/PAYE se fait au prochain
    //     "calculer_batch" qui détectera la différence et reprendra).
    //   - Best-effort : si la table/colonne pose problème, on log mais
    //     on ne fait pas échouer la mise à jour de la fiche employé.
    let bulletinsUpdated = 0
    let bulletinsLocked = 0
    if (oldSalaire !== null && oldSalaire !== body.salaire_base) {
      try {
        const now = new Date()
        const periodeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const { data: bulletinsMois } = await supabase
          .from('bulletins_paie')
          .select('id, verrouille')
          .eq('employe_id', id)
          .gte('periode', `${periodeStr}-01`)
          .lte('periode', `${periodeStr}-31`)
        const updatableIds = (bulletinsMois || [])
          .filter((b: any) => b.verrouille !== true)
          .map((b: any) => b.id)
        bulletinsLocked = (bulletinsMois || []).filter((b: any) => b.verrouille === true).length
        if (updatableIds.length > 0) {
          const { error: bulErr } = await supabase
            .from('bulletins_paie')
            .update({ salaire_base: body.salaire_base })
            .in('id', updatableIds)
          if (bulErr) {
            console.warn('[employes PATCH] bulletins_paie update skipped:', bulErr.message)
          } else {
            bulletinsUpdated = updatableIds.length
            console.log(`[employes PATCH] salaire ${oldSalaire} → ${body.salaire_base} : ${bulletinsUpdated} bulletin(s) ${periodeStr} mis à jour, ${bulletinsLocked} verrouillé(s) ignoré(s)`)
          }
        }
      } catch (e: any) {
        console.warn('[employes PATCH] bulletins_paie propagation exception:', e?.message || e)
      }
    }

    return NextResponse.json({
      employe: data,
      // Sprint 9 BUG 2 — info pour le client (toast contextualisé)
      salaire_changed: oldSalaire !== null && oldSalaire !== body.salaire_base,
      bulletins_updated: bulletinsUpdated,
      bulletins_locked: bulletinsLocked,
    })
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
