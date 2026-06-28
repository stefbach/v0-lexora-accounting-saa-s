import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  applyEliminationsToAggregate,
  detectIntercompanyTransactions,
  eliminateBalances,
  eliminateRevenues,
  eliminateUnrealizedProfits,
  type AggregateRow,
  type EliminationRecord,
  type IntraEcriture,
  type Societe,
} from '@/lib/ifrs/ifrs10-eliminations'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)
    const { searchParams } = new URL(request.url)
    const parent_societe_id = searchParams.get('parent_societe_id')
    const exercice = searchParams.get('exercice')
    if (!parent_societe_id || !exercice) return NextResponse.json({ error: 'parent_societe_id et exercice requis' }, { status: 400 })

    const supabase = getAdminClient()
    const [{ data: relationships }, { data: aggregate }, { data: storedEliminations }, { data: nci }, { data: parentSoc }] = await Promise.all([
      supabase.from('societes_relationships').select('*, child:societes!child_societe_id(id, nom, devise_fonctionnelle, regime)').eq('parent_societe_id', parent_societe_id).is('effective_to', null),
      supabase.rpc('consolidate_aggregate', { p_parent_societe_id: parent_societe_id, p_exercice: exercice }),
      supabase.from('consolidation_eliminations').select('*').eq('parent_societe_id', parent_societe_id).eq('exercice', exercice),
      supabase.rpc('compute_nci', { p_parent_societe_id: parent_societe_id, p_exercice: exercice }),
      supabase.from('societes').select('id, nom, devise_fonctionnelle, regime').eq('id', parent_societe_id).single(),
    ])

    // ─── Périmètre de consolidation (full uniquement V1) ──────────────
    const scopeSocietes: Societe[] = [
      parentSoc as Societe,
      ...((relationships || [])
        .filter((r: any) => r.consolidation_method === 'full' && r.child)
        .map((r: any) => r.child as Societe)),
    ].filter(Boolean)
    const scopeIds = scopeSocietes.map((s) => s.id)

    // ─── Chargement des écritures de la période pour détection auto ───
    const dateDebut = `${exercice.substring(0, 4)}-07-01`
    const dateFin = `${exercice.substring(5, 9)}-06-30`
    let ecritures: IntraEcriture[] = []
    if (scopeIds.length > 0) {
      const { data: ecr } = await supabase
        .from('ecritures_comptables_v2')
        .select('id, societe_id, contrepartie_societe_id, numero_compte, libelle, debit_mur, credit_mur, date_ecriture')
        .in('societe_id', scopeIds)
        .gte('date_ecriture', dateDebut)
        .lte('date_ecriture', dateFin)
        .is('elimination_id', null) // ignore les écritures déjà neutralisées (V1.1+)
      ecritures = (ecr || []) as IntraEcriture[]
    }

    // ─── IFRS 10 §B86 : éliminations intra-groupe ────────────────────
    // 1) Détection automatique des paires miroir.
    const matches = detectIntercompanyTransactions(scopeSocietes, ecritures)
    // 2) Génération des enregistrements d'élimination (revenus + AR/AP).
    //    Le PNR (unrealized_profit_stock) est laissé en V2 : nécessite
    //    un snapshot inventaire fin-de-période qui n'est pas chargé ici.
    const detectedRecords: EliminationRecord[] = [
      ...eliminateRevenues(matches),
      ...eliminateBalances(matches),
      ...eliminateUnrealizedProfits([], matches), // stocks vides V1 → []
    ]
    // 3) Fusion avec les éliminations déjà persistées (saisies manuelles).
    const storedAsRecords: EliminationRecord[] = (storedEliminations || []).map((e: any) => ({
      elimination_type: e.elimination_type,
      from_societe_id: e.from_societe_id,
      to_societe_id: e.to_societe_id,
      amount_mur: Number(e.amount_mur) || 0,
      description: e.description || '',
      source_ecriture_ids: Array.isArray(e.source_ecriture_ids) ? e.source_ecriture_ids : [],
    }))
    const allEliminations: EliminationRecord[] = [...storedAsRecords, ...detectedRecords]

    // 4) Application sur la balance brute → balance consolidée IFRS 10.
    const aggregate_consolidated = applyEliminationsToAggregate(
      ((aggregate || []) as AggregateRow[]),
      allEliminations,
    )

    const imbalance = aggregate_consolidated.reduce(
      (s, r) => s + (Number(r.total_debit_mur) || 0) - (Number(r.total_credit_mur) || 0),
      0,
    )

    return NextResponse.json({
      parent_societe_id, exercice,
      relationships: relationships || [],
      consolidation_scope: { full: (relationships || []).filter((r: any) => r.consolidation_method === 'full').length },
      aggregate: aggregate || [],                  // brut (rétrocompat)
      aggregate_consolidated,                      // post-élimination IFRS 10
      eliminations: storedEliminations || [],      // celles persistées
      eliminations_detected: detectedRecords,      // celles détectées (à confirmer/persister côté UI)
      intercompany_matches: matches,               // audit trail détection
      eliminations_applied_count: allEliminations.length,
      nci: nci || [],
      total_goodwill_mur: (relationships || []).reduce((s: number, r: any) => s + Number(r.goodwill_mur || 0), 0),
      consolidation_balanced: Math.abs(imbalance) < 1,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)
    const body = await request.json()
    const supabase = getAdminClient()

    if (body.action === 'add_relationship') {
      const { data, error } = await supabase.from('societes_relationships').insert(body.payload).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, relationship: data })
    }
    if (body.action === 'add_elimination') {
      const { data, error } = await supabase.from('consolidation_eliminations').insert(body.payload).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, elimination: data })
    }
    if (body.action === 'persist_detected_eliminations') {
      // Matérialise les éliminations détectées automatiquement par le moteur IFRS 10.
      // Body : { parent_societe_id, exercice, records: EliminationRecord[] }
      if (!body.parent_societe_id || !body.exercice || !Array.isArray(body.records)) {
        return NextResponse.json({ error: 'parent_societe_id, exercice, records[] requis' }, { status: 400 })
      }
      const rows = body.records.map((r: any) => ({
        parent_societe_id: body.parent_societe_id,
        exercice: body.exercice,
        elimination_type: r.elimination_type,
        from_societe_id: r.from_societe_id,
        to_societe_id: r.to_societe_id,
        amount_mur: r.amount_mur,
        description: r.description,
        source_ecriture_ids: r.source_ecriture_ids || [],
      }))
      const { data, error } = await supabase.from('consolidation_eliminations').insert(rows).select()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, inserted: data?.length || 0, eliminations: data })
    }
    return NextResponse.json({ error: 'action invalide' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
