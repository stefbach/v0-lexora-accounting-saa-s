import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getTauxChange, convertToMUR } from '@/lib/taux-change'
import { userHasAccessToSociete } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/comptable/banque?societe_id=xxx
// Returns: comptes_bancaires + releves_bancaires (with transactions_json) for a société
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    // Verify role
    const supabase = getAdminClient()
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['comptable', 'comptable_dedie', 'admin', 'super_admin', 'client_admin'].includes(profile.role)) {
      return apiError('access_denied', 403)
    }

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Multi-tenant: verify user has access to this société
    const hasAccess = await userHasAccessToSociete(user.id, societe_id)
    if (!hasAccess) return apiError('access_denied_company', 403)

    // Fetch bank accounts
    const { data: comptes, error: comptesError } = await supabase
      .from('comptes_bancaires')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('ordre_affichage', { ascending: true })

    if (comptesError) throw comptesError

    // Fetch releves bancaires (with transactions_json)
    const { data: releves, error: relevesError } = await supabase
      .from('releves_bancaires')
      .select('*')
      .eq('societe_id', societe_id)
      .is('superseded_by_id', null)
      .order('date_fin', { ascending: false })

    if (relevesError) throw relevesError

    // Also try to pull transactions from documents (n8n_result fallback)
    // In case releves_bancaires is empty but documents exist
    let documentsTransactions: any[] = []
    if ((!releves || releves.length === 0)) {
      // Get dossiers for this société
      const { data: dossiers } = await supabase
        .from('dossiers').select('id').eq('societe_id', societe_id)
      const dossierIds = (dossiers || []).map((d: any) => d.id)

      if (dossierIds.length > 0) {
        const { data: docs } = await supabase
          .from('documents')
          .select('id, nom_fichier, n8n_result, created_at')
          .in('dossier_id', dossierIds)
          .eq('type_document', 'releve_bancaire')
          .eq('statut', 'traite')
          .order('created_at', { ascending: false })

        ;(docs || []).forEach((doc: any) => {
          const extraction = doc.n8n_result?.extraction || {}
          const txs = extraction.transactions || []
          txs.forEach((tx: any, idx: number) => {
            documentsTransactions.push({
              id: `${doc.id}-tx-${idx}`,
              date: tx.date || '',
              libelle: tx.libelle || tx.description || '',
              debit: Number(tx.debit) || 0,
              credit: Number(tx.credit) || 0,
              solde_apres: tx.solde_apres ?? tx.solde ?? null,
              tiers_detecte: tx.tiers_detecte || tx.tiers || null,
              compte_comptable: tx.compte_comptable || null,
              statut: tx.statut || 'non_identifie',
            })
          })

          // Also synthesize a releve entry from the document if none in DB
          if (extraction.solde_cloture || extraction.periode_fin) {
            const syntheticReleve = {
              id: `doc-${doc.id}`,
              periode: extraction.periode_fin?.substring(0, 7) || doc.created_at?.substring(0, 7),
              date_debut: extraction.periode_debut || doc.created_at?.split('T')[0],
              date_fin: extraction.periode_fin || doc.created_at?.split('T')[0],
              solde_ouverture: Number(extraction.solde_ouverture) || 0,
              solde_cloture: Number(extraction.solde_cloture) || 0,
              total_debits: Number(extraction.total_debits) || 0,
              total_credits: Number(extraction.total_credits) || 0,
              transactions_json: extraction.transactions || [],
              statut_rapprochement: 'en_attente',
            }
            if (releves) {
              releves.push(syntheticReleve as any)
            } else {
              documentsTransactions.push(syntheticReleve as any)
            }
          }
        })
      }
    }

    // Fetch exchange rates
    const rates = await getTauxChange()

    // Enrich comptes with MUR conversion
    const enrichedComptes = (comptes || []).map((c: any) => ({
      ...c,
      solde_mur: convertToMUR(c.solde_actuel || 0, c.devise || 'MUR', rates),
    }))

    const totalBankMUR = enrichedComptes.reduce((sum: number, c: any) => sum + (c.solde_mur || 0), 0)

    // Enrich releves transactions with devise and MUR amounts
    const enrichedReleves = (releves || []).map((r: any) => {
      // Find the matching compte to get the devise
      const compte = (comptes || []).find((c: any) => c.id === r.compte_bancaire_id)
      const devise = compte?.devise || 'MUR'
      const enrichedTx = (r.transactions_json || []).map((tx: any) => ({
        ...tx,
        devise,
        debit_mur: convertToMUR(Number(tx.debit) || 0, devise, rates),
        credit_mur: convertToMUR(Number(tx.credit) || 0, devise, rates),
      }))
      return { ...r, transactions_json: enrichedTx, devise }
    })

    return NextResponse.json({
      comptes: enrichedComptes,
      releves: enrichedReleves,
      documentsTransactions,
      totalBankMUR,
      rates,
    })
  } catch (e: any) {
    console.error('[banque] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/comptable/banque — Update bank account fields (nom_compte, etc.)
// ---------------------------------------------------------------------------
export async function PATCH(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const body = await request.json()
    const { id, nom_compte } = body

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    // Fetch the account to check access
    const { data: compte } = await supabase.from('comptes_bancaires').select('societe_id').eq('id', id).single()
    if (!compte) return NextResponse.json({ error: 'Compte non trouvé' }, { status: 404 })

    const hasAccess = await userHasAccessToSociete(user.id, compte.societe_id)
    if (!hasAccess) return apiError('access_denied', 403)

    const { error } = await supabase.from('comptes_bancaires').update({ nom_compte }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
