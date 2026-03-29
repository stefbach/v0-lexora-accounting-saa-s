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

    // 6. Documents bancaires
    const { data: bankDocs } = await supabase
      .from('documents').select('id, nom_fichier, type_document, statut, societe_detectee, dossier_id')
      .eq('type_document', 'releve_bancaire').limit(5)
    result.bank_documents = bankDocs || []

    return NextResponse.json(result, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
