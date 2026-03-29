import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
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

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    let allEntries: any[] = []
    let useV2 = false

    // --- Try V2 first ---
    let v2Query = supabase
      .from('ecritures_comptables_v2')
      .select('id, numero_compte, nom_compte, description, debit_mur, credit_mur, date_ecriture, journal, ref_folio, lettre, date_lettrage')
      .eq('societe_id', societe_id)
      .order('numero_compte').order('date_ecriture').order('id')

    if (compte_debut) v2Query = v2Query.gte('numero_compte', compte_debut)
    if (compte_fin)   v2Query = v2Query.lte('numero_compte', compte_fin)
    if (date_debut)   v2Query = v2Query.gte('date_ecriture', date_debut)
    if (date_fin)     v2Query = v2Query.lte('date_ecriture', date_fin)
    if (journal)      v2Query = v2Query.eq('journal', journal)

    const { data: v2Data } = await v2Query
    if (v2Data && v2Data.length > 0) {
      allEntries = v2Data.map(e => ({
        id: e.id, numero_compte: e.numero_compte, nom_compte: e.nom_compte || '',
        description: e.description || '', debit_mur: Number(e.debit_mur) || 0,
        credit_mur: Number(e.credit_mur) || 0, date_ecriture: e.date_ecriture,
        journal: e.journal || '', ref_folio: e.ref_folio || '',
        lettre: e.lettre || null, date_lettrage: e.date_lettrage || null,
      }))
      useV2 = true
    }

    // --- V1 fallback ---
    if (allEntries.length === 0) {
      const { data: dossiers } = await supabase
        .from('dossiers').select('id').eq('societe_id', societe_id)
      const dossierIds = (dossiers || []).map((d: any) => d.id)

      if (dossierIds.length > 0) {
        let v1Query = supabase
          .from('ecritures_comptables')
          .select('id, compte, libelle, debit, credit, date_ecriture, journal, numero_piece, lettre, date_lettrage')
          .in('dossier_id', dossierIds)
          .order('compte').order('date_ecriture').order('id')

        if (compte_debut) v1Query = v1Query.gte('compte', compte_debut)
        if (compte_fin)   v1Query = v1Query.lte('compte', compte_fin)
        if (date_debut)   v1Query = v1Query.gte('date_ecriture', date_debut)
        if (date_fin)     v1Query = v1Query.lte('date_ecriture', date_fin)
        if (journal)      v1Query = v1Query.eq('journal', journal)

        const { data: v1Data } = await v1Query
        allEntries = (v1Data || []).map(e => ({
          id: e.id, numero_compte: e.compte || '', nom_compte: '',
          description: e.libelle || '', debit_mur: Number(e.debit) || 0,
          credit_mur: Number(e.credit) || 0, date_ecriture: e.date_ecriture,
          journal: e.journal || '', ref_folio: e.numero_piece || '',
          lettre: e.lettre || null, date_lettrage: e.date_lettrage || null,
        }))
      }
    }

    // Progressive balance per account
    const soldesParCompte: Record<string, number> = {}
    const soldesProgressifs: Record<string, number> = {}
    for (const e of allEntries) {
      if (!(e.numero_compte in soldesParCompte)) soldesParCompte[e.numero_compte] = 0
      soldesParCompte[e.numero_compte] += e.debit_mur - e.credit_mur
      soldesProgressifs[e.id] = soldesParCompte[e.numero_compte]
    }

    // Pagination
    const total = allEntries.length
    const pages = Math.ceil(total / limit)
    const pagedEntries = allEntries.slice(offset, offset + limit).map(e => ({
      ...e, solde_progressif: soldesProgressifs[e.id] ?? 0,
    }))

    // Totals
    let total_debit = 0, total_credit = 0
    for (const e of allEntries) { total_debit += e.debit_mur; total_credit += e.credit_mur }

    const lettrees = allEntries.filter(e => !!e.lettre).length

    return NextResponse.json({
      ecritures: pagedEntries, total_debit, total_credit,
      solde_ouverture: 0, solde_cloture: total_debit - total_credit,
      total, page, limit, pages, source: useV2 ? 'v2' : 'v1',
      lettrage: { lettrees, non_lettrees: total - lettrees, total },
    })
  } catch (e: unknown) {
    console.error('[grand-livre]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
