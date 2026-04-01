import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const userId = user?.id || 'NOT_LOGGED_IN'
    const result: Record<string, any> = { userId }

    // 1. Profil
    const { data: profile, error: profileErr } = await supabase
      .from('profiles').select('id, email, role, societe_id').eq('id', userId).maybeSingle()
    result.profile = profile || `MISSING (${profileErr?.message || 'no row'})`

    // 2. Sociétés créées par le user
    const { data: ownedSocietes } = await supabase
      .from('societes').select('id, nom, created_by').eq('created_by', userId)
    result.owned_societes = ownedSocietes || []

    // 3. Dossiers du user
    const { data: dossiers } = await supabase
      .from('dossiers').select('id, client_id, societe_id, comptable_id, statut').eq('client_id', userId)
    result.dossiers_as_client = dossiers || []

    // 4. Toutes les sociétés
    const { data: allSocietes } = await supabase
      .from('societes').select('id, nom').limit(10)
    result.all_societes = allSocietes || []

    // 5. Comptes bancaires
    const societeIds = [
      ...(ownedSocietes || []).map(s => s.id),
      ...(dossiers || []).map(d => d.societe_id),
    ]
    if (societeIds.length > 0) {
      const { data: comptes } = await supabase
        .from('comptes_bancaires').select('id, banque, devise, solde_actuel, societe_id').in('societe_id', societeIds)
      result.comptes_bancaires = comptes || []

      const { data: releves } = await supabase
        .from('releves_bancaires').select('id, societe_id, periode, solde_cloture, statut_rapprochement, transactions_json').in('societe_id', societeIds)
      result.releves_bancaires = (releves || []).map(r => ({
        ...r,
        nb_transactions: Array.isArray(r.transactions_json) ? r.transactions_json.length : 0,
        transactions_json: undefined, // don't dump all transactions
      }))
    } else {
      result.comptes_bancaires = 'NO_SOCIETE_IDS'
      result.releves_bancaires = 'NO_SOCIETE_IDS'
    }

    // 6. Documents bancaires (avec n8n_result pour diagnostiquer l'OCR)
    const { data: bankDocs } = await supabase
      .from('documents').select('id, nom_fichier, type_document, statut, societe_detectee, dossier_id, n8n_result')
      .eq('type_document', 'releve_bancaire').order('created_at', { ascending: false }).limit(3)
    result.bank_documents = (bankDocs || []).map((d: any) => {
      const ext = d.n8n_result?.extraction || {}
      return {
        id: d.id,
        nom_fichier: d.nom_fichier,
        statut: d.statut,
        societe_detectee: d.societe_detectee,
        dossier_id: d.dossier_id,
        extraction_summary: {
          banque: ext.banque,
          devise: ext.devise,
          periode: ext.periode,
          periode_debut: ext.periode_debut,
          periode_fin: ext.periode_fin,
          solde_debut: ext.solde_debut,
          solde_fin: ext.solde_fin,
          solde_ouverture: ext.solde_ouverture,
          solde_cloture: ext.solde_cloture,
          total_debits: ext.total_debits,
          total_credits: ext.total_credits,
          nb_lignes: Array.isArray(ext.lignes) ? ext.lignes.length : 0,
          nb_transactions: Array.isArray(ext.transactions) ? ext.transactions.length : 0,
          nb_ecritures: Array.isArray(ext.ecritures_comptables) ? ext.ecritures_comptables.length : 0,
          has_routing: !!d.n8n_result?.routing,
          model: d.n8n_result?.metadata?.model,
          _raw_response_preview: d.n8n_result?._raw_response
            ? d.n8n_result._raw_response.substring(0, 300)
            : null,
        },
      }
    })

    // 7. Test comptable/societes API (the one that was blocking client_admin)
    const { data: comptableSocietes, error: csErr } = await supabase
      .from('societes').select('id, nom').limit(5)
    result.all_societes_check = comptableSocietes || []
    if (csErr) result.societes_error = csErr.message

    // 8. Écritures comptables (v1)
    const { data: ecrituresV1, error: ecV1Err } = await supabase
      .from('ecritures_comptables')
      .select('id, compte, libelle, debit, credit, journal')
      .limit(5)
    result.ecritures_v1 = { count: ecrituresV1?.length || 0, error: ecV1Err?.message || null, sample: ecrituresV1?.slice(0, 2) }

    // 9. Écritures comptables (v2)
    const { data: ecrituresV2, error: ecV2Err } = await supabase
      .from('ecritures_comptables_v2')
      .select('id, numero_compte, debit_mur, credit_mur, journal')
      .limit(5)
    result.ecritures_v2 = { count: ecrituresV2?.length || 0, error: ecV2Err?.message || null, sample: ecrituresV2?.slice(0, 2) }

    // 10. Factures
    const { data: factures, error: facErr } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, montant_ttc, type_facture, statut')
      .limit(5)
    result.factures = { count: factures?.length || 0, error: facErr?.message || null, sample: factures?.slice(0, 2) }

    // 11. Test comptable/societes API response
    try {
      const { data: testProfile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
      result.user_role_check = testProfile?.role || 'NO_PROFILE'
    } catch (e: any) { result.user_role_check = 'ERROR: ' + e.message }

    // 12. Test comptable_societes table exists
    const { error: csTableErr } = await supabase.from('comptable_societes').select('id').limit(1)
    result.comptable_societes_table = csTableErr ? 'MISSING: ' + csTableErr.message : 'EXISTS'

    // 13. Taux de change — vérifier si les taux sont en base et à jour
    const { data: tauxData } = await supabase
      .from('taux_change').select('devise, taux, date_taux, source')
      .order('date_taux', { ascending: false }).limit(5)
    result.taux_change = {
      in_database: (tauxData || []).length,
      rates: tauxData || [],
      api_key_configured: !!process.env.EXCHANGE_RATE_API_KEY,
    }

    return NextResponse.json(result, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
