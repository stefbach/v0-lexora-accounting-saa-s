/**
 * Gestion des exercices fiscaux d'une société.
 *
 *   GET    ?societe_id=…                 → liste des exercices (statut, dates, traçabilité)
 *   POST   { action:'init', societe_id } → seed depuis les libellés présents sur les écritures
 *   POST   { action:'create', societe_id, annee, date_debut?, date_fin? } → crée un exercice ouvert
 *   PATCH  { id, action }                → verrouiller | deverrouiller | cloturer | rouvrir
 *   DELETE ?id=…                         → supprime un exercice (seulement si 'ouvert')
 *
 * Verrouillage 2 niveaux (mig 496) :
 *   - 'verrouiller'  → gel réversible (aucune écriture dans la plage).
 *   - 'cloturer'     → clôture définitive : RPC cloture_exercice_with_snapshot
 *                      (écritures CL/AN + snapshot immuable) puis statut='cloture'.
 *   - 'deverrouiller'/'rouvrir' → réajuster (repasse 'ouvert').
 *
 * RLS : la table exercices_fiscaux est gérable par comptable/comptable_dedie/admin.
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  actionIsAllowed,
  ACTION_TO_STATUT,
  exerciceDatesFromLabel,
  seedExercicesFromLabels,
  type ExerciceAction,
  type ExerciceStatut,
} from '@/lib/accounting/exercices'

export const dynamic = 'force-dynamic'

const SELECT_COLS =
  'id, societe_id, annee, date_debut, date_fin, statut, date_verrouillage, verrouille_par, date_cloture, cloture_par, snapshot_id, notes, created_at'

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const societe_id = new URL(request.url).searchParams.get('societe_id')
  if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

  const { data, error } = await supabase
    .from('exercices_fiscaux')
    .select(SELECT_COLS)
    .eq('societe_id', societe_id)
    .order('date_debut', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ exercices: data || [], count: (data || []).length })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { action, societe_id } = body as { action?: string; societe_id?: string }
  if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

  // ── init : crée les exercices manquants depuis les libellés des écritures ──
  if (action === 'init') {
    // Libellés d'exercice réellement présents sur les écritures (source de vérité
    // des périodes existantes) — dédoublonnés côté SQL via une plage bornée.
    const { data: rows, error: exErr } = await supabase
      .from('ecritures_comptables_v2')
      .select('exercice')
      .eq('societe_id', societe_id)
      .not('exercice', 'is', null)
      .limit(20000)
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })

    const seeds = seedExercicesFromLabels((rows || []).map((r) => r.exercice as string | null))
    if (seeds.length === 0) {
      return NextResponse.json({ ok: true, created: 0, exercices: [], note: 'Aucun libellé d\'exercice exploitable sur les écritures.' })
    }
    // upsert idempotent (ne touche pas un exercice déjà existant / verrouillé)
    const { data: inserted, error: insErr } = await supabase
      .from('exercices_fiscaux')
      .upsert(
        seeds.map((s) => ({ societe_id, annee: s.annee, date_debut: s.date_debut, date_fin: s.date_fin, statut: 'ouvert' })),
        { onConflict: 'societe_id,annee', ignoreDuplicates: true },
      )
      .select(SELECT_COLS)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, created: (inserted || []).length, exercices: inserted || [] })
  }

  // ── create : un exercice ouvert (dates dérivées du libellé si absentes) ──
  if (action === 'create') {
    const { annee } = body as { annee?: string }
    let { date_debut, date_fin } = body as { date_debut?: string; date_fin?: string }
    if (!annee) return NextResponse.json({ error: 'annee requise' }, { status: 400 })
    if (!date_debut || !date_fin) {
      const derived = exerciceDatesFromLabel(annee)
      if (!derived) {
        return NextResponse.json(
          { error: 'Dates requises : le libellé n\'est pas un exercice standard (YYYY ou YYYY-YYYY).' },
          { status: 400 },
        )
      }
      date_debut = derived.date_debut
      date_fin = derived.date_fin
    }
    if (date_debut >= date_fin) {
      return NextResponse.json({ error: 'date_debut doit précéder date_fin' }, { status: 400 })
    }
    const { data: created, error: cErr } = await supabase
      .from('exercices_fiscaux')
      .insert({ societe_id, annee, date_debut, date_fin, statut: 'ouvert' })
      .select(SELECT_COLS)
      .single()
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, exercice: created })
  }

  return NextResponse.json({ error: `Action POST inconnue: ${action}` }, { status: 400 })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { id, action } = body as { id?: string; action?: ExerciceAction }
  if (!id || !action) return NextResponse.json({ error: 'id et action requis' }, { status: 400 })
  if (!(action in ACTION_TO_STATUT)) return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 })

  const { data: ex, error: exErr } = await supabase
    .from('exercices_fiscaux')
    .select('id, societe_id, annee, statut')
    .eq('id', id)
    .single()
  if (exErr || !ex) return NextResponse.json({ error: 'Exercice introuvable' }, { status: 404 })

  const from = ex.statut as ExerciceStatut
  if (!actionIsAllowed(action, from)) {
    return NextResponse.json(
      { error: `Transition interdite : « ${action} » depuis le statut « ${from} ».` },
      { status: 409 },
    )
  }
  const target = ACTION_TO_STATUT[action]
  const nowIso = new Date().toISOString()

  // ── Clôture définitive : écritures CL/AN + snapshot via RPC atomique ──
  let snapshot_id: string | null = null
  if (action === 'cloturer') {
    const { data: rpc, error: rpcErr } = await supabase.rpc('cloture_exercice_with_snapshot', {
      p_societe_id: ex.societe_id,
      p_exercice: ex.annee,
    })
    if (rpcErr) return NextResponse.json({ error: `Clôture échouée : ${rpcErr.message}` }, { status: 500 })
    const payload = Array.isArray(rpc) ? rpc[0] : rpc
    snapshot_id = (payload && (payload.snapshot_id ?? payload.snapshotId)) || null
  }

  // Champs de traçabilité selon la transition.
  const patch: Record<string, unknown> = { statut: target }
  if (action === 'verrouiller') { patch.date_verrouillage = nowIso; patch.verrouille_par = user.id }
  if (action === 'deverrouiller') { patch.date_verrouillage = null; patch.verrouille_par = null }
  if (action === 'cloturer') { patch.date_cloture = nowIso; patch.cloture_par = user.id; patch.snapshot_id = snapshot_id }
  if (action === 'rouvrir') { patch.date_cloture = null; patch.cloture_par = null }

  const { data: updated, error: updErr } = await supabase
    .from('exercices_fiscaux')
    .update(patch)
    .eq('id', id)
    .select(SELECT_COLS)
    .single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, action, exercice: updated, snapshot_id })
}

export async function DELETE(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const { data: ex } = await supabase.from('exercices_fiscaux').select('statut').eq('id', id).single()
  if (!ex) return NextResponse.json({ error: 'Exercice introuvable' }, { status: 404 })
  if (ex.statut !== 'ouvert') {
    return NextResponse.json({ error: 'Seul un exercice ouvert peut être supprimé (déverrouillez/rouvrez d\'abord).' }, { status: 409 })
  }
  const { error } = await supabase.from('exercices_fiscaux').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
