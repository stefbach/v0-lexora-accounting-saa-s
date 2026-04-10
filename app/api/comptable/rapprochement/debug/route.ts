import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getTauxChange } from '@/lib/taux-change'
import { normalize, tiersScore, toMUR } from '@/lib/accounting/matching-engine'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/comptable/rapprochement/debug?societe_id=...
// Returns a diagnostic of why transactions are orphaned
export async function GET(request: Request) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const supabase = getAdminClient()
  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id')
  if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

  const rates = await getTauxChange()

  // 1. Sample unmatched transactions (first 20)
  const { data: releves } = await supabase
    .from('releves_bancaires')
    .select('id, compte_bancaire_id, transactions_json')
    .eq('societe_id', societe_id)

  const unmatched: any[] = []
  for (const releve of releves || []) {
    for (const [idx, tx] of (releve.transactions_json || []).entries()) {
      if (tx.matched_type && (tx.statut === 'rapproche' || tx.statut === 'interne')) continue
      if (tx.lettre && tx.facture_id) continue
      const amt = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
      if (amt === 0) continue
      unmatched.push({
        releve_id: releve.id,
        idx,
        date: tx.date,
        libelle: tx.libelle,
        tiers_detecte: tx.tiers_detecte || tx.tiers || null,
        debit: Number(tx.debit) || 0,
        credit: Number(tx.credit) || 0,
        devise: tx.devise || 'MUR',
        statut: tx.statut,
        montant_mur: toMUR(amt, tx.devise || 'MUR', rates),
      })
    }
  }

  // 2. All factures
  const { data: factures } = await supabase
    .from('factures')
    .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, devise, statut')
    .eq('societe_id', societe_id)
    .in('statut', ['en_attente', 'retard', 'partiel'])

  // 3. Ecritures 401/411 non lettrées
  const { data: ecritures } = await supabase
    .from('ecritures_comptables_v2')
    .select('id, numero_compte, description, libelle, debit_mur, credit_mur, date_ecriture, lettre')
    .eq('societe_id', societe_id)
    .is('lettre', null)
    .or('numero_compte.like.401%,numero_compte.like.411%')
    .limit(100)

  // 4. For each unmatched tx, compute best tiers scores against factures and écritures
  const diagnostics = unmatched.slice(0, 15).map(tx => {
    const txTiers = normalize(tx.tiers_detecte || tx.libelle || '')
    const txAmtMUR = tx.montant_mur
    const isOutgoing = tx.debit > 0

    // Best facture matches
    const factureScores = (factures || [])
      .filter(f => isOutgoing ? f.type_facture === 'fournisseur' : f.type_facture === 'client')
      .map(f => {
        const fAmtMUR = Number(f.montant_mur) || toMUR(Number(f.montant_ttc) || 0, f.devise || 'MUR', rates)
        const score = tiersScore(txTiers, normalize(f.tiers || ''))
        const amtDiff = fAmtMUR > 0 ? Math.abs(txAmtMUR - fAmtMUR) / fAmtMUR : 1
        return { tiers: f.tiers, montant_mur: fAmtMUR, tiers_score: score, amt_diff_pct: amtDiff * 100, numero: f.numero_facture }
      })
      .sort((a, b) => b.tiers_score - a.tiers_score)
      .slice(0, 3)

    // Best écriture matches
    const ecritureScores = (ecritures || [])
      .filter(e => isOutgoing ? e.numero_compte?.startsWith('401') : e.numero_compte?.startsWith('411'))
      .map(e => {
        const eAmt = Number(isOutgoing ? e.credit_mur : e.debit_mur) || 0
        const label = e.description || e.libelle || ''
        const score = tiersScore(txTiers, normalize(label))
        const amtDiff = eAmt > 0 ? Math.abs(txAmtMUR - eAmt) / eAmt * 100 : 999
        return { libelle: label.substring(0, 60), montant_mur: eAmt, tiers_score: score, amt_diff_pct: amtDiff }
      })
      .sort((a, b) => b.tiers_score - a.tiers_score)
      .slice(0, 3)

    return {
      tx: { libelle: tx.libelle, tiers: tx.tiers_detecte, montant_mur: Math.round(txAmtMUR), devise: tx.devise, direction: isOutgoing ? 'sortie' : 'entree' },
      tiers_normalise: txTiers,
      best_factures: factureScores,
      best_ecritures: ecritureScores,
      raison_orphelin: factureScores[0]?.tiers_score < 0.25 && ecritureScores[0]?.tiers_score < 0.25
        ? 'Aucun tiers similaire trouvé'
        : factureScores[0]?.amt_diff_pct > 8 && ecritureScores[0]?.amt_diff_pct > 8
        ? `Tiers trouvé (${factureScores[0]?.tiers_score?.toFixed(2)}) mais montant trop différent (${factureScores[0]?.amt_diff_pct?.toFixed(1)}%)`
        : 'Score tiers insuffisant (<0.40) ou montant hors tolérance',
    }
  })

  return NextResponse.json({
    summary: {
      total_unmatched: unmatched.length,
      total_factures_dispo: factures?.length || 0,
      total_ecritures_401_411: ecritures?.length || 0,
      devises_transactions: [...new Set(unmatched.map(t => t.devise))],
      tiers_uniques: [...new Set(unmatched.map(t => t.tiers_detecte).filter(Boolean))].slice(0, 20),
    },
    sample_diagnostics: diagnostics,
  })
}
