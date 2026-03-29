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

// GET /api/comptable/banque?societe_id=xxx
// Returns: comptes_bancaires + releves_bancaires (with transactions_json) for a société
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    // Verify role
    const supabase = getAdminClient()
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['comptable', 'comptable_dedie', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

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
      .order('date_fin', { ascending: false })

    if (relevesError) throw relevesError

    // Fetch individual transactions from transactions_bancaires table
    // (these are the properly structured rows inserted during upload)
    const { data: txBancaires, error: txError } = await supabase
      .from('transactions_bancaires')
      .select('*')
      .eq('societe_id', societe_id)
      .order('date_transaction', { ascending: false })

    if (txError) console.error('[banque] transactions_bancaires query error:', txError)

    // Build transactions list: prefer transactions_bancaires table, fallback to releves JSON
    let allTransactions: any[] = []

    if (txBancaires && txBancaires.length > 0) {
      // Use structured transactions from the table
      allTransactions = txBancaires.map((tx: any) => ({
        id: tx.id,
        date: tx.date_transaction || '',
        libelle: tx.libelle_banque || '',
        debit: Number(tx.debit) || 0,
        credit: Number(tx.credit) || 0,
        solde_apres: tx.solde_apres ?? null,
        tiers_detecte: tx.tiers_identifie || null,
        compte_comptable: tx.compte_comptable || null,
        statut: tx.statut_lettrage || 'a_lettrer',
        document_lie_id: tx.document_lie_id || null,
      }))
    } else if (releves && releves.length > 0) {
      // Fallback: extract from releves_bancaires JSONB
      releves.forEach((r: any) => {
        const txs: any[] = r.transactions_json || []
        txs.forEach((tx: any, idx: number) => {
          allTransactions.push({
            id: `${r.id}-tx-${idx}`,
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
      })
    }

    // Also try to pull transactions from documents (n8n_result fallback)
    // In case both releves_bancaires and transactions_bancaires are empty
    let documentsTransactions: any[] = []
    if (allTransactions.length === 0 && (!releves || releves.length === 0)) {
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
            releves?.push(syntheticReleve as any) || documentsTransactions.push()
          }
        })
      }
    }

    return NextResponse.json({
      comptes: comptes || [],
      releves: releves || [],
      transactions: allTransactions,
      documentsTransactions,
    })
  } catch (e: unknown) {
    console.error('[banque] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
