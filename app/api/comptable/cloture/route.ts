import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * /api/comptable/cloture
 *
 * Endpoint unifié qui orchestre les RPCs de clôture comptable :
 *   - action='cloture_mensuelle' : provisions IAS 19 PRGF + Severance,
 *     agrégation TDS, prorata IFRS 15 over-time, calcul ECL
 *   - action='cloture_exercice'  : clôture annuelle (RAN auto + résultat)
 *   - action='reevaluation_change' : IAS 21 réévaluation EOY 411/401
 *   - action='test_depreciation_immo' : IAS 36 test sur une immobilisation
 *
 * POST body:
 *   {
 *     action: 'cloture_mensuelle' | 'cloture_exercice' | 'reevaluation_change' | 'test_depreciation_immo',
 *     societe_id: string,
 *     // selon action:
 *     periode?: 'YYYY-MM',
 *     exercice?: 'YYYY-YYYY' | 'YYYY',
 *     date_cloture?: 'YYYY-MM-DD',
 *     taux_par_devise?: { EUR: number, USD: number, ... },
 *     immobilisation_id?: string,
 *     valeur_recouvrable?: number,
 *     date_test?: 'YYYY-MM-DD',
 *   }
 */
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action, societe_id } = body

    if (!action || !societe_id) {
      return NextResponse.json({ error: 'action et societe_id requis' }, { status: 400 })
    }

    // Tenant isolation
    try {
      await assertSocieteAccess(supabase, user.id, societe_id)
    } catch (e) {
      if (e instanceof SocieteAccessError) return NextResponse.json({ error: e.message }, { status: 403 })
      throw e
    }

    // ── Action: cloture_mensuelle ────────────────────────────────────────
    if (action === 'cloture_mensuelle') {
      const periode = body.periode
      if (!periode || !/^\d{4}-\d{2}$/.test(periode)) {
        return NextResponse.json({ error: 'periode YYYY-MM requise' }, { status: 400 })
      }
      const dateSnapshot = `${periode}-${new Date(`${periode}-01`).toLocaleDateString('en-CA').slice(8) === '01' ?
        new Date(parseInt(periode.slice(0,4)), parseInt(periode.slice(5,7)), 0).getDate() : '28'}`
      // simpler: last day of month
      const [y, m] = periode.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      const dateLastDay = `${periode}-${String(lastDay).padStart(2,'0')}`

      const results: Record<string, any> = {}

      // 1. Provision PRGF
      try {
        const { data, error } = await supabase.rpc('provisionner_prgf_mensuel', {
          p_societe_id: societe_id, p_date_snapshot: dateLastDay,
        })
        results.prgf = error ? { error: error.message } : { ok: true, data }
      } catch (e: any) { results.prgf = { error: e.message } }

      // 2. Provision Severance
      try {
        const { data, error } = await supabase.rpc('provisionner_severance_mensuel', {
          p_societe_id: societe_id, p_date_snapshot: dateLastDay,
        })
        results.severance = error ? { error: error.message } : { ok: true, data }
      } catch (e: any) { results.severance = { error: e.message } }

      // 3. Agrégation TDS
      try {
        const { data, error } = await supabase.rpc('agreger_tds_mensuel', {
          p_societe_id: societe_id, p_periode: periode,
        })
        results.tds = error ? { error: error.message } : { ok: true, data }
      } catch (e: any) { results.tds = { error: e.message } }

      // 4. Prorata IFRS 15
      try {
        const { data, error } = await supabase.rpc('prorata_revenus_over_time', {
          p_societe_id: societe_id, p_periode: periode,
        })
        results.ifrs15_prorata = error ? { error: error.message } : { ok: true, count: (data || []).length }
      } catch (e: any) { results.ifrs15_prorata = { error: e.message } }

      // 5. ECL clients
      try {
        const { data, error } = await supabase.rpc('calculer_ecl_clients', {
          p_societe_id: societe_id, p_date_calcul: dateLastDay,
        })
        results.ecl = error ? { error: error.message } : { ok: true, buckets: data }
      } catch (e: any) { results.ecl = { error: e.message } }

      return NextResponse.json({ ok: true, action, periode, date_snapshot: dateLastDay, results })
    }

    // ── Action: cloture_exercice ─────────────────────────────────────────
    if (action === 'cloture_exercice') {
      const exercice = body.exercice
      if (!exercice) return NextResponse.json({ error: 'exercice requis (YYYY-YYYY ou YYYY)' }, { status: 400 })

      const { data, error } = await supabase.rpc('cloture_exercice', {
        p_societe_id: societe_id, p_exercice: exercice,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({ ok: true, action, exercice, result: data?.[0] || data })
    }

    // ── Action: reevaluation_change ──────────────────────────────────────
    if (action === 'reevaluation_change') {
      const date_cloture = body.date_cloture
      const taux_par_devise = body.taux_par_devise
      if (!date_cloture || !taux_par_devise) {
        return NextResponse.json({ error: 'date_cloture et taux_par_devise requis' }, { status: 400 })
      }
      const { data, error } = await supabase.rpc('reevaluer_creances_dettes_change', {
        p_societe_id: societe_id, p_date_cloture: date_cloture,
        p_taux_par_devise: taux_par_devise,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({ ok: true, action, date_cloture, result: data?.[0] || data })
    }

    // ── Action: test_depreciation_immo ───────────────────────────────────
    if (action === 'test_depreciation_immo') {
      const { immobilisation_id, valeur_recouvrable, date_test, notes } = body
      if (!immobilisation_id || valeur_recouvrable == null) {
        return NextResponse.json({ error: 'immobilisation_id et valeur_recouvrable requis' }, { status: 400 })
      }
      const { data, error } = await supabase.rpc('enregistrer_test_depreciation_immo', {
        p_societe_id: societe_id,
        p_immobilisation_id: immobilisation_id,
        p_date_test: date_test || new Date().toISOString().slice(0, 10),
        p_valeur_recouvrable: valeur_recouvrable,
        p_notes: notes || null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({ ok: true, action, result: data })
    }

    return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 })
  } catch (e: unknown) {
    console.error('[comptable/cloture]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
