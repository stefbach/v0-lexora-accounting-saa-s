import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id   = searchParams.get('societe_id')
    const compte_debut = searchParams.get('compte_debut')
    const compte_fin   = searchParams.get('compte_fin')
    const date_debut   = searchParams.get('date_debut')
    const date_fin     = searchParams.get('date_fin')
    const journal      = searchParams.get('journal')
    const page         = parseInt(searchParams.get('page') || '1', 10)
    const limit        = parseInt(searchParams.get('limit') || '50', 10)
    const offset       = (page - 1) * limit

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    // ----------------------------------------------------------------
    // 1. Récupérer TOUTES les écritures pour calculer les soldes progressifs
    // ----------------------------------------------------------------
    let allQuery = supabase
      .from('ecritures_comptables_v2')
      .select('id, numero_compte, debit_mur, credit_mur, date_ecriture')
      .eq('societe_id', societe_id)
      .order('numero_compte', { ascending: true })
      .order('date_ecriture', { ascending: true })
      .order('id', { ascending: true })

    if (compte_debut) allQuery = allQuery.gte('numero_compte', compte_debut)
    if (compte_fin)   allQuery = allQuery.lte('numero_compte', compte_fin)
    if (date_debut)   allQuery = allQuery.gte('date_ecriture', date_debut)
    if (date_fin)     allQuery = allQuery.lte('date_ecriture', date_fin)
    if (journal)      allQuery = allQuery.eq('journal', journal)

    const { data: allEcritures, error: allErr } = await allQuery
    if (allErr) throw allErr

    // Calcul du solde progressif par compte
    const soldesParCompte: Record<string, number> = {}
    const soldesProgressifs: Record<string, number> = {}
    for (const e of allEcritures || []) {
      if (!(e.numero_compte in soldesParCompte)) {
        soldesParCompte[e.numero_compte] = 0
      }
      soldesParCompte[e.numero_compte] += (e.debit_mur || 0) - (e.credit_mur || 0)
      soldesProgressifs[e.id] = soldesParCompte[e.numero_compte]
    }

    // ----------------------------------------------------------------
    // 2. Page filtrée (avec pagination)
    // ----------------------------------------------------------------
    let query = supabase
      .from('ecritures_comptables_v2')
      .select('*', { count: 'exact' })
      .eq('societe_id', societe_id)
      .order('numero_compte', { ascending: true })
      .order('date_ecriture', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)

    if (compte_debut) query = query.gte('numero_compte', compte_debut)
    if (compte_fin)   query = query.lte('numero_compte', compte_fin)
    if (date_debut)   query = query.gte('date_ecriture', date_debut)
    if (date_fin)     query = query.lte('date_ecriture', date_fin)
    if (journal)      query = query.eq('journal', journal)

    const { data: rawEcritures, error, count } = await query
    if (error) throw error

    // Joindre les soldes progressifs
    const ecritures = (rawEcritures || []).map(e => ({
      ...e,
      solde_progressif: soldesProgressifs[e.id] ?? 0,
    }))

    // ----------------------------------------------------------------
    // 3. Totaux globaux
    // ----------------------------------------------------------------
    let total_debit  = 0
    let total_credit = 0
    for (const e of allEcritures || []) {
      total_debit  += e.debit_mur  || 0
      total_credit += e.credit_mur || 0
    }

    const solde_ouverture = 0
    const solde_cloture   = total_debit - total_credit

    return NextResponse.json({
      ecritures,
      total_debit,
      total_credit,
      solde_ouverture,
      solde_cloture,
      total: count || 0,
      page,
      limit,
      pages: Math.ceil((count || 0) / limit),
    })
  } catch (e: unknown) {
    console.error('[grand-livre]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
