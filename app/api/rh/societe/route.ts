/**
 * /api/rh/societe
 * GET  ?societe_id=xxx  — fetch société + parametres_paie_mra
 * PUT                   — update société fields + upsert parametres_paie_mra
 */
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api-error'
import { createClient as adminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return adminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('not_authenticated', 401)

    const societeId = req.nextUrl.searchParams.get('societe_id')
    const admin = getAdmin()

    // ── Liste des sociétés accessibles à l'utilisateur ──────────────────────
    const { data: profile } = await admin
      .from('profiles')
      .select('role, societe_id')
      .eq('id', user.id)
      .maybeSingle()

    const role = profile?.role || ''
    const societeMap = new Map<string, any>()

    if (['admin', 'super_admin'].includes(role)) {
      const { data } = await admin.from('societes').select('*').order('nom')
      ;(data || []).forEach((s: any) => societeMap.set(s.id, s))

    } else if (['comptable', 'comptable_dedie'].includes(role)) {
      const { data: direct } = await admin.from('societes').select('*').eq('comptable_id', user.id)
      ;(direct || []).forEach((s: any) => societeMap.set(s.id, s))

      const { data: dossiers } = await admin.from('dossiers').select('societe_id').eq('comptable_id', user.id)
      const dIds = (dossiers || []).map((d: any) => d.societe_id).filter(Boolean)
      if (dIds.length > 0) {
        const { data: linked } = await admin.from('societes').select('*').in('id', dIds)
        ;(linked || []).forEach((s: any) => societeMap.set(s.id, s))
      }

    } else if (['rh', 'rh_manager', 'manager', 'direction', 'employe', 'juridique'].includes(role)) {
      if (profile?.societe_id) {
        const { data } = await admin.from('societes').select('*').eq('id', profile.societe_id)
        ;(data || []).forEach((s: any) => societeMap.set(s.id, s))
      }

    } else if (['client_admin', 'client_user', 'client_assistant'].includes(role)) {
      const { data: owned } = await admin.from('societes').select('*').eq('created_by', user.id)
      ;(owned || []).forEach((s: any) => societeMap.set(s.id, s))
    }

    // Via user_societes (tous rôles)
    const { data: userSocietes } = await admin
      .from('user_societes')
      .select('societe_id')
      .eq('user_id', user.id)
    if (userSocietes && userSocietes.length > 0) {
      const usIds = userSocietes.map((us: any) => us.societe_id).filter(Boolean)
      if (usIds.length > 0) {
        const { data: usSocietes } = await admin.from('societes').select('*').in('id', usIds)
        ;(usSocietes || []).forEach((s: any) => societeMap.set(s.id, s))
      }
    }

    const societes = Array.from(societeMap.values())

    // ── Société sélectionnée ─────────────────────────────────────────────────
    const targetId = societeId || (societes[0]?.id ?? null)
    if (!targetId) {
      return NextResponse.json({ societes, societe: null, params_paie: null })
    }

    const societe = societeMap.get(targetId) ?? null

    // ── Paramètres paie MRA pour cette société ───────────────────────────────
    const currentYear = new Date().getFullYear()
    const { data: paramsPaie } = await admin
      .from('parametres_paie_mra')
      .select('*')
      .eq('societe_id', targetId)
      .order('annee', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Fallback: params globaux (sans societe_id)
    let paramsResult = paramsPaie
    if (!paramsResult) {
      const { data: globalParams } = await admin
        .from('parametres_paie_mra')
        .select('*')
        .is('societe_id', null)
        .order('annee', { ascending: false })
        .limit(1)
        .maybeSingle()
      paramsResult = globalParams
    }

    return NextResponse.json({
      societes,
      societe,
      params_paie: paramsResult ?? null,
      current_year: currentYear,
    })
  } catch (e: any) {
    console.error('[rh/societe] GET error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// ── PUT ────────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('not_authenticated', 401)

    const body = await req.json()
    const { id: societeId, params_paie, ...societeFields } = body

    if (!societeId) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const admin = getAdmin()

    // ── Update société ───────────────────────────────────────────────────────
    const SOCIETE_FIELDS = [
      'nom', 'short_name', 'brn', 'numero_tva_mra', 'statut_tva',
      'ern', 'npf_number', 'nature_business', 'secteur_activite',
      'date_incorporation', 'logo_url',
      // Contact (legacy)
      'contact_name', 'contact_position',
      // Sprint 5 AMÉLIO 8 — liste multi-contacts (mig 140 JSONB)
      'contacts',
      'adresse', 'adresse2', 'ville', 'telephone', 'fax', 'email', 'email_dco',
      'latitude', 'longitude', 'distance_pointage',
      // Payroll settings
      'period_closing_day', 'pay_day', 'salary_frequency', 'eoy_bonus_mode',
      'declaration_type', 'payslip_template', 'payslip_language',
      'devises_actives',
      // RH specific
      'heures_semaine', 'jours_travail_semaine',
      'conges_annuels_jours', 'conges_maladie_jours',
      'ot_taux_normal', 'ot_taux_majore',
      // Banking
      'bank_name', 'bank_account_number', 'iban',
      // Fiscal identifiers
      'paye_number', 'csg_number', 'nsf_number',
      // Pointage / déduction automatique des absences (mig 135)
      'pointage_actif',
      // PE1 — période de paie paramétrable (mig 173)
      'periode_paie_mode',
      'periode_paie_jour_cut_off',
      'periode_paie_jour_paiement',
      'periode_paie_offset_paiement_mois',
      'periode_paie_notes',
      // G11 — End of Year Bonus WRA S.54 (mig 182)
      'eoy_bonus_seuil_max',
      'eoy_bonus_inclut_hors_seuil',
      'eoy_bonus_date_paiement_75pct',
      'eoy_bonus_date_paiement_25pct',
      // G9 — Disturbance Allowance WRA S.17A FMPA 2024 (mig 184)
      'disturbance_allowance_active',
      'disturbance_hourly_multiplier',
    ]

    const updates: Record<string, unknown> = {}
    for (const field of SOCIETE_FIELDS) {
      if (societeFields[field] !== undefined) updates[field] = societeFields[field]
    }

    let updatedSociete: any = null
    if (Object.keys(updates).length > 0) {
      const { data, error } = await admin
        .from('societes')
        .update(updates)
        .eq('id', societeId)
        .select()
        .single()

      if (error) {
        console.error('[rh/societe] update societe error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      updatedSociete = data
    }

    // ── Upsert parametres_paie_mra ───────────────────────────────────────────
    let updatedParams: any = null
    if (params_paie && typeof params_paie === 'object') {
      const annee = params_paie.annee || new Date().getFullYear()

      const PARAMS_FIELDS = [
        'csg_seuil_taux_reduit',
        'csg_salarie_taux_reduit', 'csg_salarie_taux_plein',
        'csg_patronal', 'csg_patronal_taux_reduit',
        'nsf_salarie', 'nsf_patronal',
        'training_levy',
        'prgf_patronal_par_jour', 'prgf_taux_emoluments',
        'paye_seuil_exoneration', 'paye_taux_1', 'paye_seuil_taux_2', 'paye_taux_2',
        'salary_compensation', 'salary_compensation_seuil',
        'salaire_minimum', 'salaire_minimum_national',
        'heures_standard_semaine', 'jours_travail_semaine',
        'heures_sup_taux_normal', 'heures_sup_taux_majore',
        'conges_annuels_moins_5ans', 'conges_annuels_plus_5ans',
        'conges_maladie_annuels', 'conges_maternite_semaines', 'conges_paternite_semaines',
        'eoy_bonus_min_mois_service',
      ]

      const paramsUpdates: Record<string, unknown> = {
        societe_id: societeId,
        annee,
      }
      for (const f of PARAMS_FIELDS) {
        if (params_paie[f] !== undefined) paramsUpdates[f] = params_paie[f]
      }

      // Check if row exists for this societe + annee
      const { data: existing } = await admin
        .from('parametres_paie_mra')
        .select('id')
        .eq('societe_id', societeId)
        .eq('annee', annee)
        .maybeSingle()

      let paramsRes
      if (existing?.id) {
        paramsRes = await admin
          .from('parametres_paie_mra')
          .update(paramsUpdates)
          .eq('id', existing.id)
          .select()
          .single()
      } else {
        paramsRes = await admin
          .from('parametres_paie_mra')
          .insert(paramsUpdates)
          .select()
          .single()
      }

      if (paramsRes.error) {
        console.error('[rh/societe] params upsert error:', paramsRes.error)
        // Non-fatal — return partial success
      } else {
        updatedParams = paramsRes.data
      }
    }

    return NextResponse.json({
      societe: updatedSociete,
      params_paie: updatedParams,
      message: 'Paramètres sauvegardés',
    })
  } catch (e: any) {
    console.error('[rh/societe] PUT error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
