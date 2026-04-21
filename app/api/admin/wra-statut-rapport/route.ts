/**
 * GET /api/admin/wra-statut-rapport
 *
 * Rapport de situation WRA 2019 S.2 (sprint G3) — distribution worker vs
 * hors_wra dans l'effectif, par société, + liste détaillée des hors_wra
 * (pour que la direction puisse vérifier contrats + policy).
 *
 * Réponse :
 * {
 *   total_employes_actifs, workers, hors_wra, indetermines,
 *   par_societe: [{ societe_id, societe_nom, policy, workers, hors_wra }, ...],
 *   liste_hors_wra: [{ id, nom, prenom, societe, basic, statut_wra, date_arrivee }, ...]
 * }
 *
 * Auth : admin / super_admin uniquement.
 */
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

export async function GET() {
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAuth
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden — admin/super_admin only' }, { status: 403 })
  }

  const supabase = getAdminClient()

  // Employés actifs
  const { data: employes, error: empErr } = await supabase
    .from('employes')
    .select('id, nom, prenom, societe_id, statut_wra, salaire_base, date_arrivee, date_depart, actif')
    .is('date_depart', null)
    .eq('actif', true)
  if (empErr) return NextResponse.json({ error: `Employes: ${empErr.message}` }, { status: 500 })

  // Sociétés (pour nom + policy)
  const { data: societes, error: socErr } = await supabase
    .from('societes')
    .select('id, nom, policy_conges_hors_wra')
  if (socErr) return NextResponse.json({ error: `Societes: ${socErr.message}` }, { status: 500 })

  const socMap = new Map<string, { nom: string; policy: string }>(
    (societes || []).map((s: any) => [s.id, { nom: s.nom, policy: s.policy_conges_hors_wra || 'applique_wra_etendu' }]),
  )

  // Totaux globaux
  const total = (employes || []).length
  const workers = (employes || []).filter((e: any) => e.statut_wra === 'worker').length
  const hors_wra = (employes || []).filter((e: any) => e.statut_wra === 'hors_wra').length
  const indetermines = (employes || []).filter((e: any) => e.statut_wra === 'indetermine').length

  // Aggrégation par société
  const parSociete = new Map<string, {
    societe_id: string
    societe_nom: string
    policy: string
    workers: number
    hors_wra: number
  }>()
  for (const e of employes || []) {
    const sid = e.societe_id
    if (!sid) continue
    const socInfo = socMap.get(sid) || { nom: '(société inconnue)', policy: 'applique_wra_etendu' }
    const bucket = parSociete.get(sid) || {
      societe_id: sid,
      societe_nom: socInfo.nom,
      policy: socInfo.policy,
      workers: 0,
      hors_wra: 0,
    }
    if (e.statut_wra === 'worker') bucket.workers++
    else if (e.statut_wra === 'hors_wra') bucket.hors_wra++
    parSociete.set(sid, bucket)
  }

  // Liste détaillée hors_wra
  const liste_hors_wra = (employes || [])
    .filter((e: any) => e.statut_wra === 'hors_wra')
    .map((e: any) => ({
      id: e.id,
      nom: e.nom,
      prenom: e.prenom,
      societe: socMap.get(e.societe_id)?.nom || null,
      policy: socMap.get(e.societe_id)?.policy || 'applique_wra_etendu',
      basic: Number(e.salaire_base) || 0,
      date_arrivee: e.date_arrivee,
    }))
    .sort((a: any, b: any) => (b.basic || 0) - (a.basic || 0))

  return NextResponse.json({
    total_employes_actifs: total,
    workers,
    hors_wra,
    indetermines,
    par_societe: Array.from(parSociete.values()).sort((a, b) => a.societe_nom.localeCompare(b.societe_nom)),
    liste_hors_wra,
    source: 'WRA 2019 S.2 — worker si basic_salary <= 50 000 MUR/mois. Sprint G3 migrations 162-163.',
  })
}
