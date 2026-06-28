import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { resolveInternalAuth } from '@/lib/lexora-internal-auth'
import { lastDayOfMonth } from '@/lib/rh/period'

export const dynamic = 'force-dynamic'

// Sprint 5 BUG D — rôles autorisés pour la déclaration PAYE MRA.
const ALLOWED_ROLES = [
  'admin',
  'super_admin',
  'rh',
  'rh_manager',
  'client_admin',
  'direction',
  'comptable',
  'comptable_dedie',
]

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient()
    const internal = resolveInternalAuth(request)
    let user: { id: string; email?: string }
    if (internal) {
      user = { id: internal.user_id, email: internal.user_email }
    } else {
      const supabaseAuth = await createServerClient()
      const { data: { user: sessionUser } } = await supabaseAuth.auth.getUser()
      if (!sessionUser) return apiError('unauthorized', 401)
      user = { id: sessionUser.id, email: sessionUser.email }
    }

    // Sprint 5 BUG D — role-check explicite avec 'admin' inclus
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = profile?.role || ''
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({
        error: `Accès refusé : la génération PAYE Return MRA est réservée aux rôles ${ALLOWED_ROLES.join(', ')}. Votre rôle : ${role || 'inconnu'}.`,
      }, { status: 403 })
    }

    const { societe_id, periode } = await request.json()
    if (!societe_id || !periode) return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })

    // LOCK CHECK — lecture defensive
    const { data: unlockedBuls, error: lockErr } = await supabase.from('bulletins_paie')
      .select('id').eq('societe_id', societe_id)
      .gte('periode', `${periode}-01`).lte('periode', lastDayOfMonth(periode))
      .eq('is_archived', false)
      .or('verrouille.is.null,verrouille.eq.false')
      .limit(1)
    if (lockErr) {
      console.warn('[paye-mra] lock check error (non-blocking):', lockErr.message)
    }
    if (unlockedBuls && unlockedBuls.length > 0) {
      return NextResponse.json({
        error: `Periode non verrouillee pour ${periode}. Verrouillez d'abord la paie dans /rh/paie (bouton « Verrouiller ») avant de declarer au MRA.`,
      }, { status: 403 })
    }

    const { data: societe } = await supabase.from('societes').select('*').eq('id', societe_id).single()

    // Sprint 14 FIX 4 — Validation ERN format MRA (8 chiffres).
    const ernRaw = (societe?.ern || '').toString().trim()
    if (!ernRaw || !/^\d{8}$/.test(ernRaw)) {
      return NextResponse.json({
        error: `ERN manquant ou invalide pour "${societe?.nom || 'société inconnue'}". Format requis : 8 chiffres (ex: 12345678). À corriger dans /rh/societe avant l'export PAYE.`,
        ern_actuel: ernRaw || null,
      }, { status: 400 })
    }

    // Fetch bulletins (no FK join — avoids schema cache issues)
    const { data: bulletins, error } = await supabase
      .from('bulletins_paie')
      .select('*')
      .eq('societe_id', societe_id)
      .gte('periode', `${periode}-01`)
      .lte('periode', lastDayOfMonth(periode))
      .eq('is_archived', false)

    if (error) throw error
    if (!bulletins || bulletins.length === 0) return NextResponse.json({ error: 'Aucun bulletin pour cette période' }, { status: 404 })

    // Fetch employee data separately
    const empIds = [...new Set(bulletins.map(b => b.employe_id).filter(Boolean))]
    const { data: employes } = empIds.length > 0
      ? await supabase.from('employes').select('*').in('id', empIds)
      : { data: [] }
    const empMap = new Map((employes || []).map((e: any) => [e.id, e]))

    let total_salaires_bruts = 0
    let total_paye_retenu = 0

    const detailLines: string[] = [
      'TAN;Nom;Prénom;NIC;Salaire_Brut;Salaire_Annualisé;PAYE_Mensuel;Statut'
    ]

    for (const b of bulletins) {
      const emp = empMap.get(b.employe_id)
      // Skip employees excluded from MRA (hors champs)
      if (emp?.exclure_mra) continue
      const sb = Number(b.salaire_brut) || 0
      const paye = Number(b.paye) || 0
      const salaireAnnualise = sb * 12

      total_salaires_bruts += sb
      total_paye_retenu += paye

      // TAN : fallback NIC → TAN_MANQUANT
      const tanValue = emp?.tan_number || emp?.nic_number || 'TAN_MANQUANT'

      detailLines.push([
        tanValue,
        emp?.nom || '',
        emp?.prenom || '',
        emp?.nic_number || '',
        sb.toFixed(2),
        salaireAnnualise.toFixed(2),
        paye.toFixed(2),
        paye > 0 ? 'Taxable' : 'Exonéré',
      ].join(';'))
    }

    const ern_csv = societe?.ern || `[ERN_MANQUANT_-_BRN:${societe?.brn || '?'}]`
    const recapLines = [
      'ERN;Période;Nb_Employés;Total_Salaires_Bruts;Total_PAYE_Retenu',
      [
        ern_csv,
        periode,
        bulletins.length,
        total_salaires_bruts.toFixed(2),
        total_paye_retenu.toFixed(2),
      ].join(';')
    ]

    return NextResponse.json({
      recap_csv: recapLines.join('\n'),
      detail_csv: detailLines.join('\n'),
      totaux: { total_salaires_bruts, total_paye_retenu, nb_employes: bulletins.length },
      societe: societe?.nom,
      periode,
      filename_recap: `PAYE_Recap_${societe?.nom?.replace(/\s+/g, '_')}_${periode}.csv`,
      filename_detail: `PAYE_Detail_${societe?.nom?.replace(/\s+/g, '_')}_${periode}.csv`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
