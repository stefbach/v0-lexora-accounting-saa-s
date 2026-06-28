import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/comptable/ifrs9/ecl?societe_id=...
 *
 * Renvoie le calcul ECL IFRS 9 "general approach" :
 *   • Stages 1/2/3 par contrepartie (depuis ifrs9_stage_assignments)
 *   • PD 12m / lifetime / LGD / EAD utilisés (avec source : counterparty ou secteur)
 *   • ECL base + ECL ajustée forward-looking macro
 *   • Disclosure IFRS 7 (exposure par stage)
 *
 * Optionnellement, ?refresh=1 rappelle ifrs9_refresh_all_stages() pour
 * mettre à jour les stages avant calcul.
 *
 * POST /api/comptable/ifrs9/ecl
 * Body : { societe_id, action: 'override_stage' | 'refresh' | 'set_params', ... }
 */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const refresh    = searchParams.get('refresh') === '1'
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    if (refresh) {
      await supabase.rpc('ifrs9_refresh_all_stages', { p_societe_id: societe_id })
    }

    const [
      { data: ecl, error: eclError },
      { data: disclosure },
      { data: cpParams },
      { data: macro },
    ] = await Promise.all([
      supabase.rpc('ifrs9_compute_ecl_full', { p_societe_id: societe_id }),
      supabase.from('vw_ifrs9_disclosure').select('*').eq('societe_id', societe_id),
      supabase.from('ifrs9_counterparty_params').select('*').eq('societe_id', societe_id),
      supabase.from('ifrs9_macro_scenarios').select('*').eq('societe_id', societe_id).order('scenario'),
    ])

    if (eclError) {
      return NextResponse.json({ error: eclError.message }, { status: 500 })
    }

    // Totaux agrégés
    const ecl_total_base  = (ecl || []).reduce((s: number, r: any) => s + Number(r.ecl_base_mur || 0), 0)
    const ecl_total_macro = (ecl || []).reduce((s: number, r: any) => s + Number(r.ecl_with_macro_mur || 0), 0)
    const exposure_total  = (ecl || []).reduce((s: number, r: any) => s + Number(r.exposure_mur || 0), 0)

    return NextResponse.json({
      societe_id,
      computed_at: new Date().toISOString(),
      ecl_by_counterparty: ecl || [],
      disclosure_by_stage: disclosure || [],
      counterparty_params: cpParams || [],
      macro_scenarios: macro || [],
      totals: {
        exposure_total_mur: exposure_total,
        ecl_base_total_mur: ecl_total_base,
        ecl_with_macro_total_mur: ecl_total_macro,
        macro_impact_mur: ecl_total_macro - ecl_total_base,
        coverage_ratio_pct: exposure_total > 0 ? (ecl_total_macro / exposure_total) * 100 : 0,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur ECL' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json()
    const { societe_id, action } = body
    if (!societe_id || !action) {
      return NextResponse.json({ error: 'societe_id et action requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    switch (action) {
      case 'refresh': {
        const { data, error } = await supabase.rpc('ifrs9_refresh_all_stages', { p_societe_id: societe_id })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ refreshed: data?.length || 0, stages: data })
      }

      case 'override_stage': {
        const { tiers, stage, reason } = body
        if (!tiers || ![1, 2, 3].includes(Number(stage))) {
          return NextResponse.json({ error: 'tiers et stage (1|2|3) requis' }, { status: 400 })
        }
        // Récupère le stage précédent pour l'audit trail
        const { data: prev } = await supabase
          .from('ifrs9_stage_assignments')
          .select('stage')
          .eq('societe_id', societe_id).eq('tiers', tiers).maybeSingle()
        const stageFrom = prev?.stage || null

        // Upsert avec manual_override=true
        const { error: upErr } = await supabase
          .from('ifrs9_stage_assignments')
          .upsert({
            societe_id, tiers,
            stage: Number(stage),
            sicr_reason: 'manual_override',
            manual_override: true,
            computed_at: new Date().toISOString(),
            assigned_by: user.id,
          }, { onConflict: 'societe_id,tiers' })
        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

        // Audit trail
        await supabase.from('ifrs9_stage_history').insert({
          societe_id, tiers,
          stage_from: stageFrom,
          stage_to: Number(stage),
          reason: reason || 'manual_override',
          changed_by: user.id,
        })

        return NextResponse.json({ ok: true, stage_from: stageFrom, stage_to: stage })
      }

      case 'set_params': {
        const { tiers, secteur, pd_12m_pct, pd_lifetime_pct, lgd_pct, ead_factor, note } = body
        if (!tiers) return NextResponse.json({ error: 'tiers requis' }, { status: 400 })
        const { error } = await supabase.from('ifrs9_counterparty_params').upsert({
          societe_id, tiers,
          secteur: secteur || null,
          pd_12m_pct: pd_12m_pct ?? 1.0,
          pd_lifetime_pct: pd_lifetime_pct ?? 3.0,
          lgd_pct: lgd_pct ?? 45.0,
          ead_factor: ead_factor ?? 100.0,
          note: note || null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'societe_id,tiers' })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      case 'set_macro': {
        const { scenarios } = body
        if (!Array.isArray(scenarios)) {
          return NextResponse.json({ error: 'scenarios[] requis' }, { status: 400 })
        }
        // Validation : somme weight_pct = 100
        const sum = scenarios.reduce((s: number, x: any) => s + Number(x.weight_pct || 0), 0)
        if (Math.abs(sum - 100) > 0.01) {
          return NextResponse.json({ error: `Somme weight_pct = ${sum} (doit être 100)` }, { status: 400 })
        }
        const valid_from = new Date().toISOString().slice(0, 10)
        const rows = scenarios.map((s: any) => ({
          societe_id,
          scenario: s.scenario,
          pd_multiplier: s.pd_multiplier,
          weight_pct: s.weight_pct,
          valid_from,
          rationale: s.rationale || null,
        }))
        const { error } = await supabase.from('ifrs9_macro_scenarios').upsert(rows, {
          onConflict: 'societe_id,scenario,valid_from',
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ ok: true, scenarios: rows.length })
      }

      default:
        return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
