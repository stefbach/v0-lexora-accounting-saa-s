import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tranche = 'current' | '1-30' | '31-60' | '61-90' | 'over_90'

interface FactureRow {
  id: string
  numero_facture: string | null
  tiers: string | null
  date_facture: string | null
  date_echeance: string | null
  montant_ttc: number | null
  montant_mur: number | null
  devise: string | null
  statut: string | null
  statut_workflow: string | null
}

interface FactureAged {
  id: string
  numero_facture: string | null
  tiers: string | null
  date_facture: string | null
  date_echeance: string | null
  montant: number
  days_overdue: number
  tranche: Tranche
}

interface TotauxTranches {
  current: number
  '1-30': number
  '31-60': number
  '61-90': number
  over_90: number
  total: number
}

interface ParTiers {
  tiers: string
  montant: number
  nb_factures: number
  tranche_la_plus_ancienne: Tranche
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Retourne la tranche d'ancienneté à partir du nombre de jours de retard. */
function bucketOf(daysOverdue: number): Tranche {
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return '1-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  return 'over_90'
}

/** Ordre de sévérité des tranches, utilisé pour détecter la plus ancienne par tiers. */
const TRANCHE_ORDER: Record<Tranche, number> = {
  current: 0,
  '1-30': 1,
  '31-60': 2,
  '61-90': 3,
  over_90: 4,
}

/** Parse ISO date (YYYY-MM-DD) en timestamp UTC à midi pour éviter tz drift. */
function parseIsoDate(s: string): number {
  const d = new Date(`${s}T12:00:00Z`)
  return d.getTime()
}

/** Différence en jours entier entre deux dates ISO (asOf - echeance). */
function diffDays(asOf: string, echeance: string): number {
  const a = parseIsoDate(asOf)
  const b = parseIsoDate(echeance)
  return Math.floor((a - b) / 86400000)
}

// ---------------------------------------------------------------------------
// GET /api/comptable/rapports/aged-receivables
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const as_of_date =
      searchParams.get('as_of_date') || new Date().toISOString().slice(0, 10)
    const devise = searchParams.get('devise') || 'MUR'
    const limit = Math.max(1, Math.min(5000, parseInt(searchParams.get('limit') || '500')))

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    // Contrôle multi-tenant
    const admin = getAdminClient()
    try {
      await assertSocieteAccess(admin, user.id, societe_id)
    } catch (err) {
      const mapped = mapSocieteAccessError(err)
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw err
    }

    // Statuts exclus (legacy + workflow)
    const STATUTS_EXCLUS = ['paye', 'annule', 'annulee', 'comptabilisee']

    const { data, error } = await supabase
      .from('factures')
      .select(
        'id, numero_facture, tiers, date_facture, date_echeance, montant_ttc, montant_mur, devise, statut, statut_workflow',
      )
      .eq('societe_id', societe_id)
      .eq('type_facture', 'client')
      .gt('montant_ttc', 0)
      .not('statut', 'in', `(${STATUTS_EXCLUS.join(',')})`)
      .not('statut_workflow', 'in', `(${STATUTS_EXCLUS.join(',')})`)
      .order('date_echeance', { ascending: true, nullsFirst: false })
      .limit(limit)

    if (error) throw error

    const rows: FactureRow[] = (data ?? []) as FactureRow[]

    // Calcul par facture
    const factures: FactureAged[] = []
    const totaux: TotauxTranches = {
      current: 0,
      '1-30': 0,
      '31-60': 0,
      '61-90': 0,
      over_90: 0,
      total: 0,
    }
    const parTiersMap = new Map<
      string,
      { montant: number; nb: number; worst: Tranche }
    >()

    for (const r of rows) {
      // Montant : privilégier montant_mur si devise MUR demandée, sinon montant_ttc
      const montant =
        devise === 'MUR'
          ? Number(r.montant_mur ?? r.montant_ttc ?? 0)
          : Number(r.montant_ttc ?? 0)

      if (!Number.isFinite(montant) || montant <= 0) continue

      // Pas d'échéance => considérée "current" (pas encore échue)
      const daysOverdue = r.date_echeance ? diffDays(as_of_date, r.date_echeance) : 0
      const tranche = bucketOf(daysOverdue)

      factures.push({
        id: r.id,
        numero_facture: r.numero_facture,
        tiers: r.tiers,
        date_facture: r.date_facture,
        date_echeance: r.date_echeance,
        montant,
        days_overdue: daysOverdue,
        tranche,
      })

      totaux[tranche] += montant
      totaux.total += montant

      const key = r.tiers || '—'
      const agg = parTiersMap.get(key) ?? { montant: 0, nb: 0, worst: 'current' as Tranche }
      agg.montant += montant
      agg.nb += 1
      if (TRANCHE_ORDER[tranche] > TRANCHE_ORDER[agg.worst]) agg.worst = tranche
      parTiersMap.set(key, agg)
    }

    const par_tiers: ParTiers[] = Array.from(parTiersMap.entries())
      .map(([tiers, v]) => ({
        tiers,
        montant: Math.round(v.montant * 100) / 100,
        nb_factures: v.nb,
        tranche_la_plus_ancienne: v.worst,
      }))
      .sort((a, b) => b.montant - a.montant)

    // Arrondir totaux à 2 décimales
    ;(Object.keys(totaux) as (keyof TotauxTranches)[]).forEach((k) => {
      totaux[k] = Math.round(totaux[k] * 100) / 100
    })

    return NextResponse.json({
      ok: true,
      as_of_date,
      societe_id,
      devise,
      totaux,
      par_tiers,
      factures: factures.map((f) => ({
        ...f,
        montant: Math.round(f.montant * 100) / 100,
      })),
    })
  } catch (e: unknown) {
    console.error('[aged-receivables]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 },
    )
  }
}
