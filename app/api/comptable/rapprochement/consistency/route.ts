import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/comptable/rapprochement/consistency?societe_id=...
// Returns a list of factures with inconsistent state
export async function GET(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Fetch all factures — try with rapproche_* fields, fall back to basic fields if migration not run
    let factures: any[] | null = null
    const { data: fWithLink, error: fErrWithLink } = await supabase.from('factures')
      .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, devise, statut, date_facture, rapproche_releve_id, rapproche_transaction_idx, rapproche_date, rapproche_source')
      .eq('societe_id', societe_id)
    if (fErrWithLink) {
      // Migration 121 not run yet — fall back without the rapproche_* columns
      const { data: fBasic } = await supabase.from('factures')
        .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, devise, statut, date_facture')
        .eq('societe_id', societe_id)
      factures = (fBasic || []).map(f => ({ ...f, rapproche_releve_id: null, rapproche_transaction_idx: null, rapproche_date: null, rapproche_source: null }))
    } else {
      factures = fWithLink
    }

    // Fetch all bank transactions that claim to be matched
    const { data: releves } = await supabase.from('releves_bancaires')
      .select('id, transactions_json').eq('societe_id', societe_id)

    // Build a map of facture_id → claimed by transaction
    const claimedByTx = new Map<string, { releve_id: string; idx: number; tx: any }[]>()
    for (const r of releves || []) {
      const txs: any[] = r.transactions_json || []
      txs.forEach((tx, idx) => {
        const facIds: string[] = tx.facture_ids || (tx.facture_id ? [tx.facture_id] : [])
        for (const fid of facIds) {
          if (!claimedByTx.has(fid)) claimedByTx.set(fid, [])
          claimedByTx.get(fid)!.push({ releve_id: r.id, idx, tx })
        }
      })
    }

    const inconsistencies: any[] = []
    const stats = {
      total_factures: factures?.length || 0,
      paye_count: 0,
      paye_avec_rapprochement: 0,
      paye_sans_rapprochement: 0,
      non_paye_avec_rapprochement: 0,
      double_claimed: 0,
    }

    for (const f of factures || []) {
      const claims = claimedByTx.get(f.id) || []
      const hasRapprocheLink = !!f.rapproche_releve_id
      const isPaye = f.statut === 'paye'

      if (isPaye) stats.paye_count++

      // Case 1: paye but no rapprochement link AND no tx claiming it
      if (isPaye && !hasRapprocheLink && claims.length === 0) {
        stats.paye_sans_rapprochement++
        inconsistencies.push({
          type: 'paye_sans_rapprochement',
          severity: 'warning',
          facture: { id: f.id, numero: f.numero_facture, tiers: f.tiers, montant: Number(f.montant_mur) || Number(f.montant_ttc) || 0, date: f.date_facture, type: f.type_facture },
          message: 'Facture marquee payee mais aucune transaction bancaire liee',
        })
      }

      // Case 2: paye with rapproche link — verify transaction still exists
      if (isPaye && hasRapprocheLink) {
        stats.paye_avec_rapprochement++
        const releveClaimed = releves?.find(r => r.id === f.rapproche_releve_id)
        const txClaimed = releveClaimed?.transactions_json?.[f.rapproche_transaction_idx || 0]
        if (!txClaimed) {
          inconsistencies.push({
            type: 'rapprochement_invalide',
            severity: 'error',
            facture: { id: f.id, numero: f.numero_facture, tiers: f.tiers },
            message: 'Facture pointe vers une transaction inexistante',
          })
        } else if (txClaimed.statut !== 'rapproche' || !txClaimed.lettre) {
          inconsistencies.push({
            type: 'tx_non_rapprochee',
            severity: 'error',
            facture: { id: f.id, numero: f.numero_facture, tiers: f.tiers },
            message: 'Facture payee mais sa transaction n\'est pas marquee rapprochee',
          })
        }
      }

      // Case 3: non-paye but a tx claims it
      if (!isPaye && claims.length > 0) {
        stats.non_paye_avec_rapprochement++
        inconsistencies.push({
          type: 'tx_revendique_facture',
          severity: 'warning',
          facture: { id: f.id, numero: f.numero_facture, tiers: f.tiers, statut: f.statut },
          claims: claims.map(c => ({ releve_id: c.releve_id, idx: c.idx, libelle: c.tx.libelle, montant: Number(c.tx.debit) || Number(c.tx.credit) })),
          message: 'Transaction bancaire pointe vers cette facture mais elle n\'est pas marquee payee',
        })
      }

      // Case 4: double claim
      if (claims.length > 1) {
        stats.double_claimed++
        inconsistencies.push({
          type: 'double_rapprochement',
          severity: 'error',
          facture: { id: f.id, numero: f.numero_facture, tiers: f.tiers },
          claims: claims.map(c => ({ releve_id: c.releve_id, idx: c.idx, libelle: c.tx.libelle })),
          message: `Facture revendiquee par ${claims.length} transactions differentes`,
        })
      }
    }

    return NextResponse.json({ stats, inconsistencies })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

// POST /api/comptable/rapprochement/consistency
// Auto-fix detected inconsistencies
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { societe_id, action } = body
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    let fixed = 0

    if (action === 'link_existing_matches') {
      // Back-fill: for all transactions with facture_id and statut=rapproche,
      // update the linked factures with the rapproche_* fields (if migration 121 was run)
      // OR at least mark them as paye
      const { data: releves } = await supabase.from('releves_bancaires')
        .select('id, transactions_json').eq('societe_id', societe_id)
      // Detect if migration 121 has run
      const { error: migTest } = await supabase.from('factures')
        .select('rapproche_releve_id').eq('societe_id', societe_id).limit(1)
      const hasMigration121 = !migTest
      for (const r of releves || []) {
        const txs: any[] = r.transactions_json || []
        for (let idx = 0; idx < txs.length; idx++) {
          const tx = txs[idx]
          if (tx.statut !== 'rapproche') continue
          const facIds: string[] = tx.facture_ids || (tx.facture_id ? [tx.facture_id] : [])
          for (const fid of facIds) {
            const { data: f } = await supabase.from('factures').select('id, statut').eq('id', fid).maybeSingle()
            if (!f) continue
            const updates: any = { statut: 'paye' }
            if (hasMigration121) {
              updates.rapproche_releve_id = r.id
              updates.rapproche_transaction_idx = idx
              updates.rapproche_date = tx.rapproche_at || new Date().toISOString()
              updates.rapproche_source = 'backfill'
            }
            if (f.statut !== 'paye' || hasMigration121) {
              await supabase.from('factures').update(updates).eq('id', fid)
              fixed++
            }
          }
        }
      }
    }

    if (action === 'unmark_orphans') {
      // Unmark factures as paye if they have no rapprochement link AND no tx claims them
      const { data: factures } = await supabase.from('factures')
        .select('id, statut, rapproche_releve_id').eq('societe_id', societe_id).eq('statut', 'paye')
      const { data: releves } = await supabase.from('releves_bancaires')
        .select('transactions_json').eq('societe_id', societe_id)
      const claimedIds = new Set<string>()
      for (const r of releves || []) {
        for (const tx of r.transactions_json || []) {
          const facIds: string[] = tx.facture_ids || (tx.facture_id ? [tx.facture_id] : [])
          facIds.forEach(id => claimedIds.add(id))
        }
      }
      for (const f of factures || []) {
        if (!f.rapproche_releve_id && !claimedIds.has(f.id)) {
          await supabase.from('factures').update({ statut: 'en_attente' }).eq('id', f.id)
          fixed++
        }
      }
    }

    return NextResponse.json({ success: true, fixed })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
