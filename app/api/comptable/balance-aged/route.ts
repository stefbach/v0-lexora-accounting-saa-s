import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/comptable/balance-aged
 *   ?societe_id=<uuid>
 *   &type=client|fournisseur   (required)
 *   &as_of=YYYY-MM-DD           (optional, defaults to today)
 *   &reference=facture|echeance (optional, defaults to echeance)
 *
 * Returns the aged-balance of open invoices bucketed by age vs. the `as_of`
 * date, grouped by tiers. Buckets: current, 0-30, 31-60, 61-90, >90.
 *
 * Uses `date_echeance` by default (the AR/AP convention), falling back to
 * `date_facture` when due date is missing. A query param can override.
 *
 * "Open" = statut IN ('en_attente', 'retard', 'partiel'). The remaining
 * amount is `solde_non_paye` when set, otherwise `montant_mur` (fallback
 * `montant_ttc`). Credit notes (avoir_origine_id IS NOT NULL) are netted
 * against the matching original invoice when possible.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const type = searchParams.get('type') as 'client' | 'fournisseur' | null
    const asOfParam = searchParams.get('as_of')
    const reference = (searchParams.get('reference') || 'echeance') as 'echeance' | 'facture'

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (type !== 'client' && type !== 'fournisseur') {
      return NextResponse.json({ error: 'type=client|fournisseur requis' }, { status: 400 })
    }

    const asOf = asOfParam ? new Date(asOfParam) : new Date()
    if (isNaN(asOf.getTime())) {
      return NextResponse.json({ error: 'as_of invalide' }, { status: 400 })
    }
    const asOfIso = asOf.toISOString().slice(0, 10)

    const { data: rows, error } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, solde_non_paye, tds_retenu, date_facture, date_echeance, statut, devise, avoir_origine_id')
      .eq('societe_id', societe_id)
      .eq('type_facture', type)
      .in('statut', ['en_attente', 'retard', 'partiel'])

    if (error) {
      console.error('[balance-aged]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const buckets = ['current', 'b_0_30', 'b_31_60', 'b_61_90', 'b_90_plus'] as const
    type BucketKey = typeof buckets[number]
    type TiersAgg = {
      tiers: string
      count: number
      total: number
      current: number
      b_0_30: number
      b_31_60: number
      b_61_90: number
      b_90_plus: number
      factures: Array<{
        id: string
        numero_facture: string | null
        date_facture: string | null
        date_echeance: string | null
        amount_open: number
        days_overdue: number
        bucket: BucketKey
        devise: string | null
        statut: string
      }>
    }

    const byTiers = new Map<string, TiersAgg>()
    const grand = { count: 0, total: 0, current: 0, b_0_30: 0, b_31_60: 0, b_61_90: 0, b_90_plus: 0 }

    for (const f of rows || []) {
      // Skip credit notes — they are inverse entries already linked to the
      // original via avoir_origine_id. The user-facing tiers view should
      // show a net position in a follow-up, but here we keep the focus on
      // genuine open receivables/payables.
      if ((f as any).avoir_origine_id) continue

      const open = Number((f as any).solde_non_paye) > 0
        ? Number((f as any).solde_non_paye)
        : (Number((f as any).montant_mur) || Number((f as any).montant_ttc) || 0)
      if (open <= 0) continue

      const refDateStr = reference === 'facture'
        ? (f.date_facture || f.date_echeance)
        : (f.date_echeance || f.date_facture)
      const refDate = refDateStr ? new Date(refDateStr) : null
      const daysOverdue = refDate
        ? Math.floor((asOf.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0

      let bucket: BucketKey
      if (daysOverdue <= 0) bucket = 'current'
      else if (daysOverdue <= 30) bucket = 'b_0_30'
      else if (daysOverdue <= 60) bucket = 'b_31_60'
      else if (daysOverdue <= 90) bucket = 'b_61_90'
      else bucket = 'b_90_plus'

      const tiersKey = (f.tiers || '—').trim() || '—'
      let agg = byTiers.get(tiersKey)
      if (!agg) {
        agg = {
          tiers: tiersKey,
          count: 0, total: 0,
          current: 0, b_0_30: 0, b_31_60: 0, b_61_90: 0, b_90_plus: 0,
          factures: [],
        }
        byTiers.set(tiersKey, agg)
      }
      agg.count += 1
      agg.total += open
      agg[bucket] += open
      agg.factures.push({
        id: f.id,
        numero_facture: f.numero_facture,
        date_facture: f.date_facture,
        date_echeance: f.date_echeance,
        amount_open: Math.round(open * 100) / 100,
        days_overdue: daysOverdue,
        bucket,
        devise: f.devise,
        statut: f.statut as string,
      })

      grand.count += 1
      grand.total += open
      grand[bucket] += open
    }

    const tiers = [...byTiers.values()]
      .map(t => ({
        ...t,
        total: Math.round(t.total * 100) / 100,
        current: Math.round(t.current * 100) / 100,
        b_0_30: Math.round(t.b_0_30 * 100) / 100,
        b_31_60: Math.round(t.b_31_60 * 100) / 100,
        b_61_90: Math.round(t.b_61_90 * 100) / 100,
        b_90_plus: Math.round(t.b_90_plus * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total)

    return NextResponse.json({
      as_of: asOfIso,
      type,
      reference,
      totals: {
        count: grand.count,
        total: Math.round(grand.total * 100) / 100,
        current: Math.round(grand.current * 100) / 100,
        b_0_30: Math.round(grand.b_0_30 * 100) / 100,
        b_31_60: Math.round(grand.b_31_60 * 100) / 100,
        b_61_90: Math.round(grand.b_61_90 * 100) / 100,
        b_90_plus: Math.round(grand.b_90_plus * 100) / 100,
      },
      tiers,
    })
  } catch (e: any) {
    console.error('[balance-aged]', e)
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
