import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { classifyTransaction } from '@/lib/agents/classifier'
import { resolveCustomerPayment } from '@/lib/agents/resolvers/customer-payment'
import { resolveSupplierPayment } from '@/lib/agents/resolvers/supplier-payment'
import { resolvePayroll } from '@/lib/agents/resolvers/payroll'
import { resolveTax } from '@/lib/agents/resolvers/tax'
import { resolveShareholder } from '@/lib/agents/resolvers/shareholder'
import { resolveInternalTransfer } from '@/lib/agents/resolvers/internal-transfer'
import { resolveRent } from '@/lib/agents/resolvers/rent'
import { updateTransactionClass } from '@/lib/agents/tools/writes'
import type { ClassificationResult, AllocationResult, ReconciliationResponse } from '@/lib/types/reconciliation'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const RESOLVERS: Record<string, (txId: string, socId: string, cls: ClassificationResult, opts?: { mode?: 'auto' | 'propose_only' }) => Promise<AllocationResult>> = {
  customer_payment: resolveCustomerPayment,
  supplier_payment: resolveSupplierPayment,
  payroll: resolvePayroll,
  tax_payment: resolveTax,
  shareholder_loan: resolveShareholder,
  internal_transfer: resolveInternalTransfer,
  rent: resolveRent,
}

async function processTransaction(transactionId: string, societeId: string): Promise<ReconciliationResponse> {
  const startTime = Date.now()
  let totalCost = 0

  // 1. Classification
  const classification = await classifyTransaction(transactionId, societeId)
  totalCost += 0.01 // estimation

  // 2. Routing
  const resolver = RESOLVERS[classification.class]
  if (!resolver) {
    // bank_fee, expense_reimbursement, unknown → pas de résolveur
    if (classification.class === 'bank_fee') {
      await updateTransactionClass(transactionId, 'bank_fee', classification.confidence, classification.rationale)
    }
    return {
      transaction_id: transactionId,
      classification,
      resolution: {
        transaction_id: transactionId,
        status: classification.class === 'unknown' ? 'flagged' : 'allocated',
        allocations: [],
        typology: null,
        confidence: classification.confidence,
        rationale: classification.rationale,
        agent_name: 'orchestrator',
      },
      duration_ms: Date.now() - startTime,
      cost_usd: totalCost,
    }
  }

  // 3. Mode auto vs propose_only
  const mode = classification.confidence >= 85 ? 'auto' : 'propose_only'

  // 4. Résolution
  const resolution = await resolver(transactionId, societeId, classification, { mode })
  totalCost += 0.02 // estimation

  return {
    transaction_id: transactionId,
    classification,
    resolution,
    duration_ms: Date.now() - startTime,
    cost_usd: totalCost,
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const body = await request.json()

    // Mode unitaire
    if (body.transaction_id) {
      const supabase = getAdminClient()
      const { data: tx } = await supabase
        .from('transactions_bancaires')
        .select('societe_id')
        .eq('id', body.transaction_id)
        .single()
      if (!tx) return NextResponse.json({ error: 'Transaction introuvable' }, { status: 404 })

      const result = await processTransaction(body.transaction_id, tx.societe_id)
      return NextResponse.json(result)
    }

    // Mode batch
    if (body.societe_id && body.batch) {
      const supabase = getAdminClient()
      const limit = Math.min(body.limit || 50, 100)

      // Extraire les tx du JSONB vers la table si nécessaire
      await supabase.rpc('extract_bank_transactions', { p_societe_id: body.societe_id })

      // Récupérer les tx pending
      const { data: pendingTx } = await supabase
        .from('transactions_bancaires')
        .select('id')
        .eq('societe_id', body.societe_id)
        .eq('statut_lettrage', 'a_lettrer')
        .is('classified_type', null)
        .order('date_transaction', { ascending: true })
        .limit(limit)

      if (!pendingTx || pendingTx.length === 0) {
        return NextResponse.json({
          processed: 0, allocated: 0, proposed: 0, flagged: 0, failed: 0,
          duration_ms: 0, total_cost_usd: 0, details: [],
          message: 'Aucune transaction en attente',
        })
      }

      const startTime = Date.now()
      const results: ReconciliationResponse[] = []
      let allocated = 0, proposed = 0, flagged = 0, failed = 0

      // Traitement séquentiel (pas de parallélisation pour éviter les race conditions)
      for (const tx of pendingTx) {
        try {
          const result = await processTransaction(tx.id, body.societe_id)
          results.push(result)
          if (result.resolution.status === 'allocated') allocated++
          else if (result.resolution.status === 'proposed') proposed++
          else flagged++
        } catch (e: any) {
          failed++
          const errMsg = e?.message || String(e)
          console.error(`[agent/reconcile] Erreur sur tx ${tx.id}:`, errMsg)
          results.push({
            transaction_id: tx.id,
            classification: { transaction_id: tx.id, class: 'unknown' as any, confidence: 0, rationale: `Erreur: ${errMsg}`, needs_review: true },
            resolution: { transaction_id: tx.id, status: 'flagged', allocations: [], typology: null, confidence: 0, rationale: `Erreur: ${errMsg}`, agent_name: 'error' },
            duration_ms: 0,
            cost_usd: 0,
          })
        }
      }

      return NextResponse.json({
        processed: results.length + failed,
        allocated,
        proposed,
        flagged,
        failed,
        duration_ms: Date.now() - startTime,
        total_cost_usd: results.reduce((s, r) => s + r.cost_usd, 0),
        details: results,
      })
    }

    return NextResponse.json({ error: 'transaction_id ou {societe_id, batch: true} requis' }, { status: 400 })
  } catch (e: any) {
    console.error('[agent/reconcile]', e)
    return NextResponse.json({ error: e.message || 'Erreur interne' }, { status: 500 })
  }
}
