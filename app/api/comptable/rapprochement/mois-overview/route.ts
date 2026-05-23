import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { fetchAllPaginated } from '@/lib/supabase/paginate'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/comptable/rapprochement/mois-overview?societe_id=...
 *
 * Retourne un tableau d'objets par mois YYYY-MM contenant :
 *  - total_tx, rapproche, a_verifier, non_identifie, interne
 *  - nb_factures, factures_payees, factures_retard
 *  - ecritures_401_non_lettrees, solde_580
 *  - reconciliation_status (draft/submitted/validated/locked ou null)
 *  - completion_pct (pourcentage de rapprochement)
 */
export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    const { data: dossier } = await supabase
      .from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()

    const safeQuery = async <T = any>(p: PromiseLike<{ data: T | null; error: any }>) => {
      try { const r = await p; return { data: r.error ? null : r.data } } catch { return { data: null } }
    }

    const [relevesRes, facturesRes, ecrituresRes, reconciliationsRes] = await Promise.all([
      safeQuery(supabase.from('releves_bancaires').select('id, transactions_json').eq('societe_id', societe_id).is('superseded_by_id', null)),
      safeQuery(supabase.from('factures').select('id, statut, montant_ttc, date_facture, solde_non_paye').eq('societe_id', societe_id)),
      dossier
        ? fetchAllPaginated<any>(() =>
            supabase.from('ecritures_comptables_v2').select('numero_compte, debit_mur, credit_mur, lettre, date_ecriture').eq('dossier_id', dossier.id)
          ).then((data) => ({ data })).catch(() => ({ data: [] as any[] }))
        : Promise.resolve({ data: [] as any[] }),
      safeQuery(supabase.from('bank_reconciliations').select('period_end, status').eq('societe_id', societe_id)),
    ])

    const releves = relevesRes.data || []
    const factures = facturesRes.data || []
    const ecritures: any[] = (ecrituresRes as any).data || []
    const reconciliations: any[] = (reconciliationsRes as any).data || []

    // Map reconciliation status by YYYY-MM
    const reconByMonth: Record<string, string> = {}
    for (const r of reconciliations) {
      if (r.period_end) {
        const m = String(r.period_end).substring(0, 7)
        // Garder le plus avance : locked > validated > submitted > draft
        const order = ['draft', 'submitted', 'validated', 'locked']
        const existing = reconByMonth[m] || ''
        if (order.indexOf(r.status) > order.indexOf(existing)) {
          reconByMonth[m] = r.status
        }
      }
    }

    // Aggregate par mois
    type MonthStats = {
      mois: string
      total_tx: number
      rapproche: number
      a_verifier: number
      non_identifie: number
      interne: number
      nb_factures: number
      factures_payees: number
      factures_retard: number
      factures_attente: number
      montant_factures_total: number
      ecritures_401_non_lettrees: number
      ecritures_411_non_lettrees: number
      solde_580: number
      reconciliation_status: string | null
      completion_pct: number
    }

    const byMonth: Record<string, MonthStats> = {}
    const ensure = (m: string): MonthStats => {
      if (!byMonth[m]) {
        byMonth[m] = {
          mois: m,
          total_tx: 0, rapproche: 0, a_verifier: 0, non_identifie: 0, interne: 0,
          nb_factures: 0, factures_payees: 0, factures_retard: 0, factures_attente: 0,
          montant_factures_total: 0,
          ecritures_401_non_lettrees: 0, ecritures_411_non_lettrees: 0, solde_580: 0,
          reconciliation_status: reconByMonth[m] || null,
          completion_pct: 0,
        }
      }
      return byMonth[m]
    }

    // Transactions bancaires
    for (const r of releves) {
      for (const tx of (r as any).transactions_json || []) {
        const d = tx.date || ''
        if (!d) continue
        const m = d.substring(0, 7)
        const s = ensure(m)
        s.total_tx++
        const statut = (tx.statut || '').toLowerCase()
        if (statut === 'rapproche') s.rapproche++
        else if (statut === 'a_verifier') s.a_verifier++
        else if (statut === 'interne' || statut === 'interne_en_attente') s.interne++
        else s.non_identifie++
      }
    }

    // Factures
    for (const f of factures) {
      const d = f.date_facture || ''
      if (!d) continue
      const m = d.substring(0, 7)
      const s = ensure(m)
      s.nb_factures++
      s.montant_factures_total += Number(f.montant_ttc) || 0
      if (f.statut === 'paye') s.factures_payees++
      else if (f.statut === 'retard') s.factures_retard++
      else if (f.statut === 'en_attente' || f.statut === 'partiel') s.factures_attente++
    }

    // Ecritures 401/411 non lettrées + 580
    for (const e of ecritures) {
      const d = e.date_ecriture || ''
      if (!d) continue
      const m = d.substring(0, 7)
      const compte = String(e.numero_compte || '')
      if (!e.lettre) {
        if (compte.startsWith('401')) ensure(m).ecritures_401_non_lettrees++
        else if (compte.startsWith('411')) ensure(m).ecritures_411_non_lettrees++
      }
      if (compte === '580' || compte.startsWith('580')) {
        ensure(m).solde_580 += (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0)
      }
    }

    // Completion % = rapprochees / total_tx
    for (const s of Object.values(byMonth)) {
      s.completion_pct = s.total_tx > 0
        ? Math.round(((s.rapproche + s.interne) / s.total_tx) * 100)
        : 0
      s.solde_580 = Math.round(s.solde_580 * 100) / 100
    }

    // Trier par mois décroissant (le plus récent en premier)
    const months = Object.values(byMonth).sort((a, b) => b.mois.localeCompare(a.mois))

    return NextResponse.json({
      societe_id,
      months,
      total_months: months.length,
    })
  } catch (e: any) {
    console.error('[mois-overview]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
