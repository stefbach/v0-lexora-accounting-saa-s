import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { computeLeasePresentValue, qualifiesForExemption, buildLeasePaymentEntries } from '@/lib/accounting/leases-ifrs16'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const lease_id = searchParams.get('lease_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    if (lease_id) {
      const [{ data: lease }, { data: schedule }] = await Promise.all([
        supabase.from('leases').select('*').eq('id', lease_id).single(),
        supabase.from('lease_payment_schedule').select('*').eq('lease_id', lease_id).order('period_number'),
      ])
      return NextResponse.json({ lease, schedule: schedule || [] })
    }

    const { data: leases } = await supabase.from('leases').select('*').eq('societe_id', societe_id).order('commencement_date', { ascending: false })
    const active = (leases || []).filter((l: any) => l.status === 'active')
    const totalRou = active.reduce((s: number, l: any) => s + Number(l.initial_rou_mur || 0), 0)
    const totalLiab = active.reduce((s: number, l: any) => s + Number(l.initial_liability_mur || 0), 0)
    return NextResponse.json({
      societe_id, leases: leases || [],
      summary: { nb_active: active.length, total_rou_mur: totalRou, total_liability_mur: totalLiab },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const body = await request.json()
    const supabase = getAdminClient()

    if (body.action === 'create') {
      const p = body.payload
      const exemptions = qualifiesForExemption({ termMonths: p.term_months, assetValueUsd: p.asset_value_usd })
      const ratePct = Number(p.implicit_rate_pct) || Number(p.incremental_borrowing_rate_pct) || 5
      const pv = (exemptions.shortTerm || exemptions.lowValue) ? 0 : computeLeasePresentValue({
        monthlyPayment: Number(p.monthly_payment_amount),
        termMonths: Number(p.term_months),
        annualRatePct: ratePct,
        paymentInAdvance: p.payment_in_advance !== false,
      })
      const initialDirectCosts = Number(p.initial_direct_costs_mur) || 0
      const restoration = Number(p.restoration_obligation_mur) || 0
      const initialRou = pv + initialDirectCosts + restoration
      const { data, error } = await supabase.from('leases').insert({
        ...p,
        short_term_exemption: exemptions.shortTerm,
        low_value_exemption: exemptions.lowValue,
        initial_liability_mur: pv,
        initial_rou_mur: initialRou,
        status: 'active',
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Auto-générer l'échéancier
      if (!exemptions.shortTerm && !exemptions.lowValue) {
        await supabase.rpc('generate_lease_schedule', { p_lease_id: data.id })
      }
      return NextResponse.json({ ok: true, lease: data, exemptions })
    }

    if (body.action === 'post_period') {
      // Comptabilise une période donnée du lease
      const { lease_id, period_number } = body
      const { data: lease } = await supabase.from('leases').select('*').eq('id', lease_id).single()
      const { data: period } = await supabase.from('lease_payment_schedule').select('*').eq('lease_id', lease_id).eq('period_number', period_number).single()
      if (!lease || !period) return NextResponse.json({ error: 'lease ou période introuvable' }, { status: 404 })
      if (period.posted) return NextResponse.json({ error: 'Période déjà comptabilisée' }, { status: 409 })

      const entries = buildLeasePaymentEntries({
        periodEntry: {
          periodNumber: period.period_number, periodDate: new Date(period.period_date),
          paymentAmount: Number(period.payment_amount_mur),
          interestAmount: Number(period.interest_amount_mur),
          principalAmount: Number(period.principal_amount_mur),
          liabilityBalance: Number(period.liability_balance_mur),
        },
        totalLeaseTermMonths: lease.term_months,
        rouInitialValue: Number(lease.initial_rou_mur),
      })
      const ref_folio = `LEASE-${lease_id.slice(0, 8)}-${period.period_number}`
      const rows = entries.map(e => ({
        societe_id: lease.societe_id, date_ecriture: period.period_date,
        ref_folio, numero_compte: e.compte, description: e.description,
        debit_mur: e.debit_mur, credit_mur: e.credit_mur, journal: 'OD',
      }))
      const { data: posted, error } = await supabase.from('ecritures_comptables_v2').insert(rows).select('id')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await supabase.from('lease_payment_schedule').update({
        posted: true, posted_at: new Date().toISOString(),
        ecriture_ids: (posted || []).map((p: any) => p.id),
      }).eq('id', period.id)

      return NextResponse.json({ ok: true, entries_count: rows.length, ref_folio })
    }

    return NextResponse.json({ error: 'action invalide' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
