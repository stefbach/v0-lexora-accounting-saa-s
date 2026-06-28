import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
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

/**
 * GET /api/comptable/rapprochement/skycall?societe_id=...&annee=2025
 * Spec: NIVEAU P2-A6 — Indicateur SKYCALL mois par mois
 *
 * Détecte les "Inward Transfer /ROC/..." + facture SKYCALL
 * Retourne: reçu, facturé, écart par mois
 */
export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const annee = searchParams.get('annee') || new Date().getFullYear().toString()
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // Factures SKYCALL de l'année
    const { data: factures } = await supabase
      .from('factures')
      .select('id, numero_facture, date_facture, montant_ttc, montant_mur, devise, statut, solde_non_paye')
      .eq('societe_id', societe_id)
      .ilike('tiers', '%SKYCALL%')
      .gte('date_facture', `${annee}-01-01`)
      .lte('date_facture', `${annee}-12-31`)

    // Transactions bancaires SKYCALL
    const { data: releves } = await supabase
      .from('releves_bancaires')
      .select('id, transactions_json')
      .eq('societe_id', societe_id)

    const transactions: any[] = []
    for (const r of releves || []) {
      for (const tx of (r.transactions_json || [])) {
        const lib = (tx.libelle || '').toLowerCase()
        const tiers = (tx.tiers_detecte || '').toLowerCase()
        // Critères SKYCALL: Inward Transfer + ROC OU tiers contient skycall
        const isSkycall = tiers.includes('skycall') || (lib.includes('inward transfer') && lib.includes('/roc/'))
        if (!isSkycall) continue
        const date = tx.date || ''
        if (!date.startsWith(annee)) continue
        transactions.push({
          date,
          libelle: tx.libelle,
          credit: Number(tx.credit) || 0,
          debit: Number(tx.debit) || 0,
          devise: tx.devise || 'EUR',
          statut: tx.statut,
          facture_id: tx.facture_id,
        })
      }
    }

    // Grouper par mois
    const byMonth: Record<string, {
      mois: string
      recu: number
      facture: number
      ecart: number
      devise: string
      factures: any[]
      paiements: any[]
      alerte?: string
    }> = {}

    for (const f of factures || []) {
      const mois = (f.date_facture || '').substring(0, 7) // YYYY-MM
      if (!mois) continue
      if (!byMonth[mois]) byMonth[mois] = { mois, recu: 0, facture: 0, ecart: 0, devise: f.devise || 'EUR', factures: [], paiements: [] }
      byMonth[mois].facture += Number(f.montant_ttc) || 0
      byMonth[mois].factures.push(f)
    }

    for (const tx of transactions) {
      const mois = tx.date.substring(0, 7)
      if (!byMonth[mois]) byMonth[mois] = { mois, recu: 0, facture: 0, ecart: 0, devise: tx.devise, factures: [], paiements: [] }
      byMonth[mois].recu += tx.credit
      byMonth[mois].paiements.push(tx)
    }

    // Calculer écarts + alertes
    for (const m of Object.values(byMonth)) {
      m.ecart = Math.round((m.recu - m.facture) * 100) / 100
      if (m.facture === 0 && m.recu > 0) m.alerte = `Paiement reçu sans facture correspondante — facturation à créer`
      else if (m.recu === 0 && m.facture > 0) m.alerte = `Facture émise mais paiement non reçu`
      else if (Math.abs(m.ecart) / Math.max(m.facture, 1) > 0.10) m.alerte = `Écart > 10% entre facturation et paiement reçu`
    }

    const months = Object.values(byMonth).sort((a, b) => b.mois.localeCompare(a.mois))

    // Totaux
    const totals = {
      total_facture: months.reduce((s, m) => s + m.facture, 0),
      total_recu: months.reduce((s, m) => s + m.recu, 0),
      total_ecart: 0,
      nb_mois_avec_alerte: months.filter(m => m.alerte).length,
    }
    totals.total_ecart = Math.round((totals.total_recu - totals.total_facture) * 100) / 100

    return NextResponse.json({ months, totals, annee })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
