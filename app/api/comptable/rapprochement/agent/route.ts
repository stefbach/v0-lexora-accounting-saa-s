import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

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
    // Just return the proposal for the frontend to display
    return { proposed: true, ...input }
  }

  if (name === 'apply_match') {
    const { releve_id, transaction_idx, facture_ids, reasoning } = input
    const { data: releve } = await supabase.from('releves_bancaires').select('transactions_json').eq('id', releve_id).single()
    if (!releve?.transactions_json) return { success: false, error: 'Relevé non trouvé' }
    const txs = [...releve.transactions_json]
    if (!txs[transaction_idx]) return { success: false, error: 'Transaction non trouvée' }
    txs[transaction_idx] = {
      ...txs[transaction_idx],
      facture_ids,
      facture_id: facture_ids[0],
      lettre: `AI${Date.now().toString().slice(-4)}`,
      statut: 'rapproche',
      matched_type: facture_ids.length > 1 ? 'facture_groupee' : 'facture_unique',
      match_confidence: 'ai_agent',
      note: reasoning,
    }
    await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
    for (const fid of facture_ids) {
      await supabase.from('factures').update({ statut: 'paye' }).eq('id', fid)
    }
    return { success: true, applied: facture_ids.length }
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
    const { messages = [], societe_id } = body
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

Tu as acces a des outils pour analyser les transactions bancaires et les factures impayees, et proposer des rapprochements intelligents.

Regles IMPORTANTES de rapprochement :
1. DEBIT bancaire = sortie d'argent = paiement d'une facture FOURNISSEUR
2. CREDIT bancaire = entree d'argent = encaissement d'une facture CLIENT
3. Un seul paiement peut solder 1 OU PLUSIEURS factures du meme tiers (paiement groupe)
4. Les delais de paiement standards : 0j (comptant), 30j, 45j, 60j
5. Un retard de paiement est normal — pas un obstacle au rapprochement
6. Tolerance de montant : 5% ou 100 MUR max (frais bancaires, TDS, arrondis)
7. Le nom du tiers en banque peut etre tronque ou variant — tolere les variations

Workflow typique :
1. get_reconciliation_stats → vue d'ensemble
2. list_unmatched_transactions → voir ce qui reste a rapprocher
3. list_unpaid_invoices → voir les factures disponibles
4. Pour chaque transaction : analyse intelligente + propose_match avec reasoning clair
5. Si confidence >= 0.9 → apply_match automatiquement
6. Sinon → demande confirmation a l'utilisateur avant apply_match

Societe_id actuellement selectionne : ${societe_id}

Reponds toujours en francais, de maniere concise et structuree.`

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
