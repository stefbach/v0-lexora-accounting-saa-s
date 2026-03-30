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
    const exercice     = searchParams.get('exercice')
    const page         = parseInt(searchParams.get('page') || '1', 10)
    const limit        = parseInt(searchParams.get('limit') || '50', 10)
    const offset       = (page - 1) * limit

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Parse exercice to date range if provided (e.g., "2025-2026" = July 2025 to June 2026)
    let exerciceDateDebut: string | null = null
    let exerciceDateFin: string | null = null
    if (exercice) {
      const match = exercice.match(/^(\d{4})-(\d{4})$/)
      if (match) {
        exerciceDateDebut = `${match[1]}-07-01`
        exerciceDateFin = `${match[2]}-06-30`
      }
    }

    // Use exercice dates as defaults if date_debut/date_fin not explicitly set
    const effectiveDateDebut = date_debut || exerciceDateDebut
    const effectiveDateFin = date_fin || exerciceDateFin

    let allEntries: any[] = []
    let useV2 = false

    // --- Try V2 first ---
    // Try v2 with lettrage columns, fallback without
    let v2Select = 'id, numero_compte, nom_compte, description, debit_mur, credit_mur, date_ecriture, journal, ref_folio, lettre, date_lettrage'
    let v2Query = supabase.from('ecritures_comptables_v2').select(v2Select)
      .eq('societe_id', societe_id).order('numero_compte').order('date_ecriture').order('id')
    if (compte_debut) v2Query = v2Query.gte('numero_compte', compte_debut)
    if (compte_fin)   v2Query = v2Query.lte('numero_compte', compte_fin)
    if (effectiveDateDebut) v2Query = v2Query.gte('date_ecriture', effectiveDateDebut)
    if (effectiveDateFin)   v2Query = v2Query.lte('date_ecriture', effectiveDateFin)
    if (journal)      v2Query = v2Query.eq('journal', journal)

    let { data: v2Data, error: v2Err } = await v2Query
    if (v2Err) {
      // Retry without lettrage columns
      let v2Fallback = supabase.from('ecritures_comptables_v2')
        .select('id, numero_compte, nom_compte, description, debit_mur, credit_mur, date_ecriture, journal, ref_folio')
        .eq('societe_id', societe_id).order('numero_compte').order('date_ecriture').order('id')
      if (compte_debut) v2Fallback = v2Fallback.gte('numero_compte', compte_debut)
      if (compte_fin)   v2Fallback = v2Fallback.lte('numero_compte', compte_fin)
      if (effectiveDateDebut) v2Fallback = v2Fallback.gte('date_ecriture', effectiveDateDebut)
      if (effectiveDateFin)   v2Fallback = v2Fallback.lte('date_ecriture', effectiveDateFin)
      if (journal)      v2Fallback = v2Fallback.eq('journal', journal)
      const fb = await v2Fallback
      v2Data = fb.data
    }
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
        // Try with lettrage columns first, fallback without them
        let v1Query = supabase
          .from('ecritures_comptables')
          .select('id, compte, libelle, debit, credit, date_ecriture, journal, numero_piece, lettre, date_lettrage')
          .in('dossier_id', dossierIds)
          .order('compte').order('date_ecriture').order('id')

        if (compte_debut) v1Query = v1Query.gte('compte', compte_debut)
        if (compte_fin)   v1Query = v1Query.lte('compte', compte_fin)
        if (effectiveDateDebut) v1Query = v1Query.gte('date_ecriture', effectiveDateDebut)
        if (effectiveDateFin)   v1Query = v1Query.lte('date_ecriture', effectiveDateFin)
        if (journal)      v1Query = v1Query.eq('journal', journal)

        let { data: v1Data, error: v1Err } = await v1Query

        // If query failed (probably missing columns), retry without lettrage columns
        if (v1Err) {
          console.error('[grand-livre] v1 with lettrage columns failed:', v1Err.message, '— retrying without')
          let v1FallbackQuery = supabase
            .from('ecritures_comptables')
            .select('id, compte, libelle, debit, credit, date_ecriture, journal, numero_piece')
            .in('dossier_id', dossierIds)
            .order('compte').order('date_ecriture').order('id')

          if (compte_debut) v1FallbackQuery = v1FallbackQuery.gte('compte', compte_debut)
          if (compte_fin)   v1FallbackQuery = v1FallbackQuery.lte('compte', compte_fin)
          if (effectiveDateDebut) v1FallbackQuery = v1FallbackQuery.gte('date_ecriture', effectiveDateDebut)
          if (effectiveDateFin)   v1FallbackQuery = v1FallbackQuery.lte('date_ecriture', effectiveDateFin)
          if (journal)      v1FallbackQuery = v1FallbackQuery.eq('journal', journal)

          const fallback = await v1FallbackQuery
          v1Data = fallback.data
          if (fallback.error) console.error('[grand-livre] v1 fallback also failed:', fallback.error.message)
        }

        allEntries = (v1Data || []).map((e: any) => ({
          id: e.id, numero_compte: e.compte || '', nom_compte: '',
          description: e.libelle || '', debit_mur: Number(e.debit) || 0,
          credit_mur: Number(e.credit) || 0, date_ecriture: e.date_ecriture,
          journal: e.journal || '', ref_folio: e.numero_piece || '',
          lettre: e.lettre ?? null, date_lettrage: e.date_lettrage ?? null,
        }))
        console.log(`[grand-livre] v1 loaded: ${allEntries.length} entries from ${dossierIds.length} dossier(s)`)
      }
    }

    // Compute opening balances (report a nouveau) from prior year entries
    // Only for balance sheet accounts (classes 1-5) - P&L accounts (6, 7) reset each year
    const soldeOuvertureParCompte: Record<string, number> = {}

    if (effectiveDateDebut) {
      // Fetch all entries BEFORE the start date to compute opening balances
      let priorV2Query = supabase.from('ecritures_comptables_v2')
        .select('numero_compte, debit_mur, credit_mur')
        .eq('societe_id', societe_id)
        .lt('date_ecriture', effectiveDateDebut)
      if (compte_debut) priorV2Query = priorV2Query.gte('numero_compte', compte_debut)
      if (compte_fin) priorV2Query = priorV2Query.lte('numero_compte', compte_fin)

      const { data: priorV2Data } = await priorV2Query
      let priorEntries: any[] = priorV2Data || []

      // V1 fallback for prior entries
      if (priorEntries.length === 0) {
        const { data: dossiers } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id)
        const dossierIds = (dossiers || []).map((d: any) => d.id)
        if (dossierIds.length > 0) {
          let priorV1Query = supabase.from('ecritures_comptables')
            .select('compte, debit, credit')
            .in('dossier_id', dossierIds)
            .lt('date_ecriture', effectiveDateDebut)
          if (compte_debut) priorV1Query = priorV1Query.gte('compte', compte_debut)
          if (compte_fin) priorV1Query = priorV1Query.lte('compte', compte_fin)
          const { data: priorV1Data } = await priorV1Query
          priorEntries = (priorV1Data || []).map((e: any) => ({
            numero_compte: e.compte, debit_mur: Number(e.debit) || 0, credit_mur: Number(e.credit) || 0
          }))
        }
      }

      // Aggregate opening balances per account (only balance sheet accounts: classes 1-5)
      for (const e of priorEntries) {
        const compte = e.numero_compte
        if (!compte) continue
        const firstChar = compte.charAt(0)
        // Only carry forward balance sheet accounts (1-5), not P&L (6, 7)
        if (firstChar >= '1' && firstChar <= '5') {
          soldeOuvertureParCompte[compte] = (soldeOuvertureParCompte[compte] || 0) + (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0)
        }
      }
    }

    // Progressive balance per account (starting from opening balance)
    const soldesParCompte: Record<string, number> = { ...soldeOuvertureParCompte }
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

    // Compute total opening balance
    const totalSoldeOuverture = Object.values(soldeOuvertureParCompte).reduce((s, v) => s + v, 0)

    return NextResponse.json({
      ecritures: pagedEntries, total_debit, total_credit,
      solde_ouverture: totalSoldeOuverture,
      solde_ouverture_par_compte: soldeOuvertureParCompte,
      solde_cloture: totalSoldeOuverture + total_debit - total_credit,
      total, page, limit, pages, source: useV2 ? 'v2' : 'v1',
      lettrage: { lettrees, non_lettrees: total - lettrees, total },
      exercice: exercice || null,
    })
  } catch (e: unknown) {
    console.error('[grand-livre]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
