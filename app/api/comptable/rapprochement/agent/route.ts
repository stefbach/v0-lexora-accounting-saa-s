import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { createEcrituresForPayment } from '@/lib/accounting/ecritures-factures'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ─── TOOLS the agent can call ──────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_unmatched_transactions',
    description: 'List bank transactions that are not yet reconciled for the société. Returns up to 50 most recent unmatched transactions.',
    input_schema: {
      type: 'object',
      properties: {
        societe_id: { type: 'string', description: 'Société UUID' },
        date_debut: { type: 'string', description: 'Start date filter YYYY-MM-DD (optional)' },
        date_fin: { type: 'string', description: 'End date filter YYYY-MM-DD (optional)' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_unpaid_invoices',
    description: 'List all unpaid invoices (factures) for the société. Returns supplier (fournisseur) and client invoices with payment terms.',
    input_schema: {
      type: 'object',
      properties: {
        societe_id: { type: 'string' },
        type: { type: 'string', enum: ['fournisseur', 'client', 'all'], description: 'Filter by type' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'propose_match',
    description: 'Propose to match a bank transaction to one or more invoices. The agent must analyze tiers name, amount (tolerance 5%), date vs payment terms, and explain reasoning.',
    input_schema: {
      type: 'object',
      properties: {
        releve_id: { type: 'string' },
        transaction_idx: { type: 'number', description: 'Index of the transaction in the releve transactions_json array' },
        facture_ids: { type: 'array', items: { type: 'string' }, description: 'UUIDs of invoices to match (1 or more)' },
        confidence: { type: 'number', description: 'Confidence score 0-1' },
        reasoning: { type: 'string', description: 'Why this match is proposed (tiers, amount, delay analysis)' },
      },
      required: ['releve_id', 'transaction_idx', 'facture_ids', 'confidence', 'reasoning'],
    },
  },
  {
    name: 'apply_match',
    description: 'Apply a confirmed match: mark transaction as rapproche and invoice(s) as paid. Only call after user approval or when confidence is very high (>= 0.9).',
    input_schema: {
      type: 'object',
      properties: {
        releve_id: { type: 'string' },
        transaction_idx: { type: 'number' },
        facture_ids: { type: 'array', items: { type: 'string' } },
        reasoning: { type: 'string' },
      },
      required: ['releve_id', 'transaction_idx', 'facture_ids'],
    },
  },
  {
    name: 'get_reconciliation_stats',
    description: 'Get overall reconciliation statistics for the société: total transactions, matched, unmatched, unpaid invoices count.',
    input_schema: {
      type: 'object',
      properties: { societe_id: { type: 'string' } },
      required: ['societe_id'],
    },
  },
  {
    name: 'run_consistency_check',
    description: 'Check for inconsistencies between bank transactions and invoices (double claims, orphaned payments, missing links). Call this at the end of a reconciliation session to validate the work.',
    input_schema: {
      type: 'object',
      properties: {
        societe_id: { type: 'string' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'generate_journal_entries',
    description: 'Generate BNQ journal entries for all matched transactions that are missing accounting entries. Call this after applying matches to ensure the Grand Livre is up to date.',
    input_schema: {
      type: 'object',
      properties: {
        societe_id: { type: 'string' },
      },
      required: ['societe_id'],
    },
  },
]

// ─── Tool implementations ──────────────────────────────────────────
async function executeTool(name: string, input: any, supabase: ReturnType<typeof getAdminClient>): Promise<any> {
  if (name === 'list_unmatched_transactions') {
    const { societe_id, date_debut, date_fin } = input
    const { data: releves } = await supabase
      .from('releves_bancaires')
      .select('id, compte_bancaire_id, transactions_json')
      .eq('societe_id', societe_id)

    const unmatched: any[] = []
    for (const releve of releves || []) {
      const txs: any[] = releve.transactions_json || []
      txs.forEach((tx, idx) => {
        if (tx.matched_type && (tx.statut === 'rapproche' || tx.statut === 'interne')) return
        if (tx.lettre && tx.facture_id) return
        if (date_debut && tx.date && tx.date < date_debut) return
        if (date_fin && tx.date && tx.date > date_fin) return
        const amt = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
        if (amt === 0) return
        unmatched.push({
          releve_id: releve.id,
          transaction_idx: idx,
          date: tx.date,
          libelle: tx.libelle,
          tiers: tx.tiers_detecte || tx.tiers,
          debit: Number(tx.debit) || 0,
          credit: Number(tx.credit) || 0,
          direction: Number(tx.debit) > 0 ? 'sortie' : 'entree',
        })
      })
    }
    return { count: unmatched.length, transactions: unmatched.slice(0, 30) }
  }

  if (name === 'list_unpaid_invoices') {
    const { societe_id, type } = input
    let query = supabase.from('factures')
      .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, devise, date_facture, date_echeance, conditions_paiement, statut')
      .eq('societe_id', societe_id)
      .in('statut', ['en_attente', 'retard', 'partiel'])
      .order('date_facture', { ascending: true })
      .limit(40)
    if (type && type !== 'all') query = query.eq('type_facture', type)
    const { data: factures } = await query
    return {
      count: factures?.length || 0,
      invoices: (factures || []).map(f => ({
        id: f.id,
        numero: f.numero_facture,
        tiers: f.tiers,
        type: f.type_facture,
        montant_mur: Number(f.montant_mur) || Number(f.montant_ttc) || 0,
        devise: f.devise,
        date_facture: f.date_facture,
        date_echeance: f.date_echeance,
        termes_jours: f.conditions_paiement || 30,
      })),
    }
  }

  if (name === 'propose_match') {
    // Enrich proposal with transaction + invoice details for the frontend
    const { releve_id, transaction_idx, facture_ids, confidence, reasoning } = input
    const { data: releve } = await supabase.from('releves_bancaires').select('transactions_json').eq('id', releve_id).single()
    const tx = releve?.transactions_json?.[transaction_idx]
    const { data: factures } = facture_ids?.length > 0
      ? await supabase.from('factures').select('id, numero_facture, tiers, montant_ttc, montant_mur, devise, date_facture, date_echeance, type_facture').in('id', facture_ids)
      : { data: [] }
    return {
      proposed: true,
      releve_id, transaction_idx, facture_ids, confidence, reasoning,
      transaction: tx ? {
        date: tx.date, libelle: tx.libelle,
        tiers: tx.tiers_detecte || tx.tiers,
        debit: Number(tx.debit) || 0, credit: Number(tx.credit) || 0,
      } : null,
      factures: factures || [],
    }
  }

  if (name === 'apply_match') {
    const { releve_id, transaction_idx, facture_ids, reasoning } = input
    if (!releve_id || transaction_idx === undefined || !Array.isArray(facture_ids) || facture_ids.length === 0) {
      return { success: false, error: 'Parametres manquants' }
    }

    // VERIFICATION 1: Fetch the actual transaction
    const { data: releve } = await supabase.from('releves_bancaires').select('transactions_json, societe_id').eq('id', releve_id).single()
    if (!releve?.transactions_json) return { success: false, error: 'Releve non trouve' }
    const txs = [...releve.transactions_json]
    if (!txs[transaction_idx]) return { success: false, error: 'Transaction non trouvee' }
    const tx = txs[transaction_idx]
    if (tx.statut === 'rapproche' || tx.lettre) {
      return { success: false, error: 'Transaction deja rapprochee' }
    }

    // VERIFICATION 2: Fetch factures and verify they exist + are unpaid + not already reconciled
    const { data: factures } = await supabase.from('factures')
      .select('id, numero_facture, tiers, montant_ttc, montant_mur, devise, type_facture, statut, rapproche_releve_id')
      .in('id', facture_ids)
    if (!factures || factures.length !== facture_ids.length) {
      return { success: false, error: `Factures manquantes: demande ${facture_ids.length}, trouve ${factures?.length || 0}` }
    }
    const alreadyReconciled = factures.filter((f: any) => f.rapproche_releve_id || f.statut === 'paye')
    if (alreadyReconciled.length > 0) {
      return { success: false, error: `Factures deja rapprochees/payees: ${alreadyReconciled.map((f: any) => f.numero_facture).join(', ')}` }
    }

    // VERIFICATION 3: Sum of facture amounts must match transaction amount (tolerance 5%)
    const txAmount = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
    const sumFactures = factures.reduce((s: number, f: any) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
    if (sumFactures > 0 && Math.abs(txAmount - sumFactures) / sumFactures > 0.05) {
      return {
        success: false,
        error: `Ecart trop important: transaction ${txAmount.toFixed(2)} vs factures ${sumFactures.toFixed(2)} (${((Math.abs(txAmount - sumFactures) / sumFactures) * 100).toFixed(1)}%)`,
      }
    }

    // VERIFICATION 4: Direction check (debit=supplier, credit=client)
    const isOutgoing = (Number(tx.debit) || 0) > 0
    const expectedType = isOutgoing ? 'fournisseur' : 'client'
    const wrongType = factures.find((f: any) => f.type_facture !== expectedType)
    if (wrongType) {
      return {
        success: false,
        error: `Direction incorrecte: transaction ${isOutgoing ? 'sortie' : 'entree'} mais facture ${wrongType.numero_facture} est ${wrongType.type_facture}`,
      }
    }

    // ALL CHECKS PASSED — apply the match atomically
    const lettre = `AI${Date.now().toString().slice(-6)}`
    const reconcileDate = new Date().toISOString()

    // 1. Update transaction
    txs[transaction_idx] = {
      ...tx,
      facture_ids,
      facture_id: facture_ids[0],
      lettre,
      statut: 'rapproche',
      matched_type: facture_ids.length > 1 ? 'facture_groupee' : 'facture_unique',
      match_confidence: 'ai_agent',
      note: reasoning,
      rapproche_at: reconcileDate,
    }
    const { error: releveErr } = await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
    if (releveErr) return { success: false, error: 'Erreur MAJ releve: ' + releveErr.message }

    // 2. Update factures with full reconciliation link
    for (const fid of facture_ids) {
      await supabase.from('factures').update({
        statut: 'paye',
        rapproche_releve_id: releve_id,
        rapproche_transaction_idx: transaction_idx,
        rapproche_date: reconcileDate,
        rapproche_source: 'ai',
      }).eq('id', fid)
    }

    // 3. Generate BNQ journal entries (Grand Livre)
    const txAmountForEntry = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
    const isOutgoingEntry = (Number(tx.debit) || 0) > 0
    const payType: 'supplier' | 'client' = isOutgoingEntry ? 'supplier' : 'client'
    const tiers = (factures[0]?.tiers || tx.tiers_detecte || tx.tiers || '').substring(0, 50)
    const datePayment = tx.date || new Date().toISOString().split('T')[0]
    const numFactures = factures.length > 1
      ? `${factures.length} factures (${factures.map((f: any) => f.numero_facture).join(', ')})`
      : (factures[0]?.numero_facture || '')

    await createEcrituresForPayment(supabase, {
      societe_id: releve.societe_id,
      date_payment: datePayment,
      amount_mur: Math.round(txAmountForEntry * 100) / 100,
      type: payType,
      tiers,
      ref_folio: `BANK-${releve_id}-${transaction_idx}`,
      description: `Paiement ${numFactures} — ${tiers}`,
    })

    return { success: true, applied: facture_ids.length, lettre, reconciled_factures: factures.map((f: any) => f.numero_facture) }
  }

  if (name === 'get_reconciliation_stats') {
    const { societe_id } = input
    const { data: releves } = await supabase.from('releves_bancaires')
      .select('transactions_json').eq('societe_id', societe_id)
    let total = 0, matched = 0, unmatched = 0
    for (const r of releves || []) {
      const txs: any[] = r.transactions_json || []
      for (const tx of txs) {
        total++
        if (tx.matched_type && (tx.statut === 'rapproche' || tx.statut === 'interne')) matched++
        else unmatched++
      }
    }
    const { count: unpaidCount } = await supabase.from('factures')
      .select('id', { count: 'exact', head: true })
      .eq('societe_id', societe_id)
      .in('statut', ['en_attente', 'retard', 'partiel'])
    return { total_transactions: total, matched, unmatched, unpaid_invoices: unpaidCount || 0 }
  }

  if (name === 'run_consistency_check') {
    const { societe_id } = input
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000'
      const res = await fetch(`${baseUrl}/api/comptable/rapprochement/consistency?societe_id=${societe_id}`, {
        headers: { 'x-internal-call': '1' },
      })
      if (!res.ok) {
        // Fallback: run consistency logic directly
        const { data: factures } = await supabase.from('factures')
          .select('id, numero_facture, tiers, statut, rapproche_releve_id')
          .eq('societe_id', societe_id)
        const { data: releves } = await supabase.from('releves_bancaires')
          .select('id, transactions_json').eq('societe_id', societe_id)
        const claimedIds = new Set<string>()
        for (const r of releves || []) {
          for (const tx of r.transactions_json || []) {
            const ids: string[] = tx.facture_ids || (tx.facture_id ? [tx.facture_id] : [])
            ids.forEach(id => claimedIds.add(id))
          }
        }
        const orphans = (factures || []).filter(f => f.statut === 'paye' && !f.rapproche_releve_id && !claimedIds.has(f.id))
        return {
          stats: { total_factures: factures?.length || 0, orphans: orphans.length },
          inconsistencies: orphans.map(f => ({ type: 'paye_sans_rapprochement', facture: { numero: f.numero_facture, tiers: f.tiers } })),
        }
      }
      return await res.json()
    } catch (e: any) {
      return { error: 'Consistency check failed: ' + e.message }
    }
  }

  if (name === 'generate_journal_entries') {
    const { societe_id } = input
    // Find all rapproche transactions that don't have a BANK-* entry in ecritures_comptables_v2
    const { data: releves } = await supabase.from('releves_bancaires')
      .select('id, transactions_json').eq('societe_id', societe_id)

    let generated = 0
    let errors = 0
    for (const releve of releves || []) {
      const txs: any[] = releve.transactions_json || []
      for (let idx = 0; idx < txs.length; idx++) {
        const tx = txs[idx]
        if (tx.statut !== 'rapproche') continue
        if (!tx.facture_id && !tx.facture_ids?.length) continue

        const refFolio = `BANK-${releve.id}-${idx}`
        // Check if ecritures already exist for this ref_folio
        const { count } = await supabase.from('ecritures_comptables_v2')
          .select('id', { count: 'exact', head: true })
          .eq('societe_id', societe_id)
          .eq('ref_folio', refFolio)
        if ((count || 0) > 0) continue

        // Generate missing entries
        const txAmount = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
        if (txAmount === 0) continue
        const isOutgoing = (Number(tx.debit) || 0) > 0
        const payType: 'supplier' | 'client' = isOutgoing ? 'supplier' : 'client'
        const tiers = (tx.tiers_detecte || tx.tiers || '').substring(0, 50)
        const datePayment = tx.date || new Date().toISOString().split('T')[0]

        const result = await createEcrituresForPayment(supabase, {
          societe_id,
          date_payment: datePayment,
          amount_mur: Math.round(txAmount * 100) / 100,
          type: payType,
          tiers,
          ref_folio: refFolio,
          description: tx.note || `Paiement bancaire — ${tiers}`,
        })
        if (result.ok) generated++
        else errors++
      }
    }
    return { generated, errors, message: `${generated} ecritures BNQ generees${errors > 0 ? `, ${errors} erreurs` : ''}` }
  }

  return { error: `Unknown tool: ${name}` }
}

// ─── Main endpoint ──────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { messages = [], societe_id, direct_action } = body

    // Direct action mode: apply a proposal without going through Claude
    if (direct_action) {
      const result = await executeTool(direct_action.tool, direct_action.input, supabase)
      return NextResponse.json({ result })
    }

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        error: 'ANTHROPIC_API_KEY manquant',
        response: 'Agent IA indisponible : configurez ANTHROPIC_API_KEY.',
      }, { status: 503 })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

    const systemPrompt = `Tu es un agent expert-comptable specialise en rapprochement bancaire a Maurice.
Tu es METHODIQUE et RIGOUREUX : un mauvais rapprochement cree des incoherences comptables graves.

Regles IMPORTANTES de rapprochement :
1. DEBIT bancaire = sortie d'argent = paiement d'une facture FOURNISSEUR (JAMAIS client)
2. CREDIT bancaire = entree d'argent = encaissement d'une facture CLIENT (JAMAIS fournisseur)
3. Un seul paiement peut solder 1 OU PLUSIEURS factures du meme tiers (paiement groupe)
4. Les delais de paiement standards : 0j (comptant), 30j, 45j, 60j
5. Un retard de paiement est normal — pas un obstacle au rapprochement
6. Tolerance de montant : 5% ou 100 MUR max (frais bancaires, TDS, arrondis)
7. Le nom du tiers en banque peut etre tronque ou variant — tolere les variations

VERIFICATIONS OBLIGATOIRES AVANT apply_match :
- La somme des montants des factures doit etre PROCHE du montant de la transaction (tolerance 5%)
- Les factures doivent etre du bon TYPE (fournisseur pour debit, client pour credit)
- Les factures ne doivent PAS deja etre marquees payees ou rapprochees
- Le tiers bancaire doit correspondre au tiers des factures (tolerance sur variations de nom)

WORKFLOW COMPLET :
1. get_reconciliation_stats → etat initial (total, rapproches, non-rapproches, factures impayees)
2. list_unmatched_transactions → recupere les transactions a rapprocher
3. list_unpaid_invoices → recupere TOUTES les factures impayees
4. Pour chaque transaction : analyse systematique
   - Si TOUS les 4 criteres ci-dessus sont satisfaits avec confidence >= 0.90 → apply_match
   - Si criteres ok mais confidence 0.65-0.90 → propose_match (l'utilisateur decidera)
   - Si un seul critere echoue ou confidence < 0.65 → ne fais rien, rapporte dans le resume
5. generate_journal_entries → generer les ecritures BNQ manquantes pour le Grand Livre
6. run_consistency_check → valider la coherence finale (double claims, orphelins)
7. Resume : X rapproches auto, Y proposes, Z orphelins, W incoherences

IMPORTANT :
- NE MARQUE JAMAIS une facture payee sans certitude quasi totale
- Mieux vaut ne rien faire que creer une incoherence
- Si doute → propose_match, pas apply_match
- apply_match valide 4 contraintes cote serveur — ne le contourne pas
- Apres chaque apply_match, les ecritures BNQ sont automatiquement generees
- Appelle generate_journal_entries a la fin pour couvrir les cas manques
- Appelle run_consistency_check en dernier pour valider l'integrite

Societe_id actuellement selectionne : ${societe_id}

Reponds en francais, concis, avec le nombre de rapprochements auto / proposes / orphelins.`

    // Agentic loop with tool calls (max 4 iterations to stay within serverless timeout)
    const conversationMessages = messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    }))

    // Global timeout: 55s (under Vercel Pro 60s limit)
    const startTime = Date.now()
    const TIMEOUT_MS = 55000
    const isTimedOut = () => (Date.now() - startTime) > TIMEOUT_MS

    let response
    try {
      response = await anthropic.messages.create({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        tools: TOOLS,
        messages: conversationMessages,
      })
    } catch (e: any) {
      console.error('[agent] Claude call failed:', e.message)
      return NextResponse.json({
        error: 'Claude API error',
        response: `Erreur lors de l'appel a Claude : ${e.message}. Reessayez ou utilisez le bouton "Rapprochement auto".`,
        tool_calls: [],
      }, { status: 500 })
    }

    const toolCalls: any[] = []
    let iterations = 0
    const MAX_ITER = 4
    while (response.stop_reason === 'tool_use' && iterations < MAX_ITER && !isTimedOut()) {
      iterations++
      const toolUses = response.content.filter((c: any) => c.type === 'tool_use') as Anthropic.ToolUseBlock[]
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolUse of toolUses) {
        try {
          const result = await executeTool(toolUse.name, toolUse.input, supabase)
          toolCalls.push({ name: toolUse.name, input: toolUse.input, result })
          // Truncate large tool results to avoid blowing the context window
          let resultStr = JSON.stringify(result)
          if (resultStr.length > 8000) resultStr = resultStr.slice(0, 8000) + '... [truncated]'
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: resultStr,
          })
        } catch (e: any) {
          console.error(`[agent] Tool ${toolUse.name} failed:`, e.message)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: e.message }),
            is_error: true,
          })
        }
      }

      conversationMessages.push({ role: 'assistant', content: response.content })
      conversationMessages.push({ role: 'user', content: toolResults })

      if (isTimedOut()) break
      try {
        response = await anthropic.messages.create({
          model,
          max_tokens: 2048,
          system: systemPrompt,
          tools: TOOLS,
          messages: conversationMessages,
        })
      } catch (e: any) {
        console.error('[agent] Claude iteration failed:', e.message)
        break
      }
    }

    // Extract final text response
    const textBlocks = response.content.filter((c: any) => c.type === 'text') as Anthropic.TextBlock[]
    const finalText = textBlocks.map(b => b.text).join('\n\n')

    return NextResponse.json({
      response: finalText,
      tool_calls: toolCalls,
      iterations,
      stop_reason: response.stop_reason,
    })
  } catch (e: any) {
    console.error('[rapprochement/agent] error:', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
