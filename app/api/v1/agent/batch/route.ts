import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const SYSTEM_PROMPT = `Tu es un agent comptable IA qui analyse des transactions bancaires et les rapproche avec des factures.

Tu reçois :
1. Une liste de TRANSACTIONS BANCAIRES (date, libellé, montant, devise, tiers)
2. Une liste de FACTURES IMPAYÉES (numéro, tiers, montant, devise, date)

Pour CHAQUE transaction, tu dois :
1. CLASSIFIER : customer_payment, supplier_payment, payroll, tax_payment, shareholder_loan, internal_transfer, rent, bank_fee, unknown
2. RAPPROCHER : trouver la ou les facture(s) correspondante(s) si applicable
3. EXPLIQUER : 1 phrase en français

RÈGLES :
- Match par TIERS d'abord (nom dans le libellé = tiers de la facture)
- Puis par MONTANT (±10% pour couvrir TDS, frais de change, arrondis)
- Conversion EUR↔MUR : utilise le taux ~54.4 EUR/MUR
- 1 tx peut matcher PLUSIEURS factures du même fournisseur (paiement groupé)
- JAMAIS matcher si le tiers ne correspond pas du tout
- Salaires : libellé contient SAL/SALARY/SALAIRE + nom employé
- Frais bancaires : FEE/COMMISSION/FRAIS/SERVICE CHARGE + petits montants
- Taxes : MRA/CSG/NSF/PAYE/TVA/VAT
- Virements internes : OWN ACCOUNT TRANSFER + même société
- Loyers : montant fixe récurrent + même bénéficiaire

IMPORTANT : Retourne UNIQUEMENT du JSON valide, pas de texte avant ou après.

Format de sortie (JSON array) :
[
  {
    "tx_index": 0,
    "class": "supplier_payment",
    "confidence": 85,
    "facture_ids": ["uuid1", "uuid2"],
    "rationale": "Paiement SERVIQUAL 750 EUR rapproché avec facture INV/2026/00490"
  },
  ...
]`

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const body = await request.json()
    const { societe_id } = body
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // 1. Extraire les tx du JSONB si pas encore fait
    await supabase.rpc('extract_bank_transactions', { p_societe_id: societe_id })

    // 2. Charger les tx pending
    const { data: txs } = await supabase
      .from('transactions_bancaires')
      .select('id, date_transaction, libelle_banque, debit, credit, devise, tiers_identifie, counterparty_iban')
      .eq('societe_id', societe_id)
      .eq('statut_lettrage', 'a_lettrer')
      .order('date_transaction')
      .limit(100)

    if (!txs || txs.length === 0) {
      return NextResponse.json({ processed: 0, results: [], message: 'Aucune transaction en attente' })
    }

    // 3. Charger les factures impayées
    const { data: factures } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, montant_ttc, montant_mur, devise, type_facture, date_facture')
      .eq('societe_id', societe_id)
      .in('statut', ['en_attente', 'retard', 'partiel'])
      .order('date_facture')

    // 4. Construire le message pour Claude
    const txList = txs.map((tx, i) =>
      `[${i}] ${tx.date_transaction} | ${tx.libelle_banque} | ${Number(tx.debit) > 0 ? '-' + tx.debit : '+' + tx.credit} ${tx.devise || 'MUR'} | Tiers: ${tx.tiers_identifie || '?'}`
    ).join('\n')

    const facList = (factures || []).map(f =>
      `${f.id} | ${f.numero_facture} | ${f.tiers} | ${f.montant_ttc} ${f.devise || 'MUR'} | ${f.type_facture} | ${f.date_facture}`
    ).join('\n')

    const userMessage = `TRANSACTIONS BANCAIRES (${txs.length}) :
${txList}

FACTURES IMPAYÉES (${(factures || []).length}) :
${facList || 'Aucune facture impayée'}

Classifie et rapproche chaque transaction. Retourne le JSON.`

    // 5. Appeler Claude en UNE SEULE fois
    const client = new Anthropic()
    const startTime = Date.now()

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    })

    const duration = Date.now() - startTime
    const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')

    // 6. Parser le JSON retourné (gérer code blocks markdown)
    let results: any[] = []
    try {
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
      if (jsonMatch) results = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Réponse Claude non parsable', raw: text.substring(0, 1000) }, { status: 500 })
    }

    // 7. Appliquer les résultats
    let allocated = 0, proposed = 0, flagged = 0

    for (const r of results) {
      const tx = txs[r.tx_index]
      if (!tx) continue

      // Mettre à jour la classification
      await supabase.from('transactions_bancaires').update({
        classified_type: r.class,
        classification_confidence: r.confidence,
        classification_rationale: r.rationale,
        classified_at: new Date().toISOString(),
      }).eq('id', tx.id)

      // Si des factures sont matchées et confiance >= 80%
      if (r.facture_ids && r.facture_ids.length > 0 && r.confidence >= 80) {
        // Créer les allocations
        for (const fId of r.facture_ids) {
          const fac = (factures || []).find(f => f.id === fId)
          if (!fac) continue

          await supabase.from('transaction_allocations').insert({
            transaction_id: tx.id,
            societe_id,
            allocation_type: r.class === 'customer_payment' ? 'customer_invoice' : 'supplier_invoice',
            status: r.confidence >= 90 ? 'auto_validated' : 'proposed',
            facture_id: fId,
            account_code: r.class === 'customer_payment' ? '411' : '401',
            allocated_amount: Number(fac.montant_ttc) || 0,
            agent_name: 'batch_reconcile',
            agent_confidence: r.confidence,
            agent_rationale: r.rationale,
            third_party_name: fac.tiers,
          })
        }

        // Mettre à jour le statut
        if (r.confidence >= 90) {
          await supabase.from('transactions_bancaires').update({ statut_lettrage: 'lettre' }).eq('id', tx.id)
          for (const fId of r.facture_ids) {
            await supabase.from('factures').update({ statut: 'paye', rapproche_date: new Date().toISOString(), rapproche_source: 'agent_ia' }).eq('id', fId)
          }
          allocated++
        } else {
          await supabase.from('transactions_bancaires').update({ statut_lettrage: 'a_verifier' }).eq('id', tx.id)
          proposed++
        }
      } else if (r.class !== 'unknown') {
        await supabase.from('transactions_bancaires').update({ statut_lettrage: 'a_verifier' }).eq('id', tx.id)
        flagged++
      } else {
        flagged++
      }
    }

    const cost = ((response.usage?.input_tokens || 0) * 3 + (response.usage?.output_tokens || 0) * 15) / 1_000_000

    return NextResponse.json({
      processed: txs.length,
      classified: results.length,
      allocated,
      proposed,
      flagged,
      duration_ms: duration,
      cost_usd: Math.round(cost * 10000) / 10000,
      results: results.map(r => ({
        tx_index: r.tx_index,
        tx_libelle: txs[r.tx_index]?.libelle_banque?.substring(0, 50),
        class: r.class,
        confidence: r.confidence,
        factures_matched: r.facture_ids?.length || 0,
        rationale: r.rationale,
      })),
    })
  } catch (e: any) {
    console.error('[agent/batch]', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
