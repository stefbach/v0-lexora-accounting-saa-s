// ---------------------------------------------------------------------------
// Bank statement extraction with multi-call continuation
// ---------------------------------------------------------------------------
// Shared by /api/documents/upload and /api/documents/[id]/reanalyze.
// Loops Claude continuation calls (up to MAX) using a landmark-based resume
// strategy, asking each follow-up to return ONLY a JSON array of new
// transactions. Merges results with light dedup. Robust to long bank PDFs
// whose extraction exceeds the per-call max_tokens budget.

import type Anthropic from '@anthropic-ai/sdk'

interface ExtractOptions {
  base64: string
  systemPrompt: string
  model: string
  maxTokens: number
  temperature: number
  /** Initial user prompt for the first call (defaults sensibly) */
  initialUserPrompt?: string
  /** Max continuation calls after the initial one (default 5) */
  maxContinuations?: number
}

interface ExtractResult {
  parsed: any | null
  rawText: string
  finalStopReason: string | null
  nbContinuations: number
  nbTransactionsAdded: number
  nbDuplicatesSkipped: number
}

const tryParseTransactionsArray = (text: string): any[] | null => {
  const trimmed = text.trim()
  try {
    const p = JSON.parse(trimmed)
    if (Array.isArray(p)) return p
    if (Array.isArray(p?.transactions)) return p.transactions
    if (Array.isArray(p?.lignes)) return p.lignes
  } catch {}
  const first = trimmed.indexOf('[')
  const last  = trimmed.lastIndexOf(']')
  if (first !== -1 && last > first) {
    try {
      const arr = JSON.parse(trimmed.substring(first, last + 1))
      if (Array.isArray(arr)) return arr
    } catch {}
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    try {
      const p = JSON.parse(fence[1].trim())
      if (Array.isArray(p)) return p
      if (Array.isArray(p?.transactions)) return p.transactions
    } catch {}
  }
  return null
}

const tryParseFullJson = (text: string): any | null => {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch {}
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) { try { return JSON.parse(fence[1].trim()) } catch {} }
  const first = trimmed.indexOf('{')
  const last  = trimmed.lastIndexOf('}')
  if (first !== -1 && last > first) {
    try { return JSON.parse(trimmed.substring(first, last + 1)) } catch {}
  }
  // Strategy: truncated JSON — try to close braces/brackets
  const firstBrace = trimmed.indexOf('{')
  if (firstBrace !== -1) {
    let cand = trimmed.substring(firstBrace).replace(/```\s*$/, '').trim()
    let openBraces = 0, openBrackets = 0, inString = false, escaped = false
    for (const ch of cand) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') openBraces++
      if (ch === '}') openBraces--
      if (ch === '[') openBrackets++
      if (ch === ']') openBrackets--
    }
    if (openBraces > 0 || openBrackets > 0) {
      cand = cand.replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, '')
      cand = cand.replace(/,\s*\{[^}]*$/, '')
      cand = cand.replace(/,\s*$/, '')
    }
    for (let i = 0; i < openBrackets; i++) cand += ']'
    for (let i = 0; i < openBraces; i++) cand += '}'
    try { return JSON.parse(cand) } catch {}
  }
  return null
}

const computeLandmark = (parsed: any): { date: string | null; desc: string | null } => {
  const txs: any[] = parsed?.transactions || parsed?.lignes || []
  if (txs.length === 0) return { date: null, desc: null }
  const last = txs[txs.length - 1]
  return {
    date: last.date || last.date_operation || null,
    desc: last.description || last.libelle || null,
  }
}

export async function extractBankStatement(
  anthropic: Anthropic,
  options: ExtractOptions,
): Promise<ExtractResult> {
  const {
    base64, systemPrompt, model, maxTokens, temperature,
    initialUserPrompt = 'Retourne UNIQUEMENT un JSON valide (pas de markdown). Lis TOUTES les lignes du releve sans exception.',
    maxContinuations = 5,
  } = options

  // --- Initial extraction ---
  const initialStream = anthropic.messages.stream({
    model, max_tokens: maxTokens, temperature, system: systemPrompt,
    messages: [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: initialUserPrompt },
    ]}],
  })
  const initialResponse = await initialStream.finalMessage()
  let rawText = initialResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  let stopReason: string | null = initialResponse.stop_reason
  console.log(`[bank-extract] initial: length=${rawText.length}, stop=${stopReason}`)

  // --- Continuation loop ---
  let parsed = tryParseFullJson(rawText)
  const extraTransactions: any[] = []
  let nbContinuations = 0

  // Détecte le cas "header extrait mais 0 transaction" : Claude a renvoyé un
  // JSON valide avec soldes/totaux mais transactions vide → forcer une
  // continuation pour extraire le tableau de lignes.
  const initialTxCount = Array.isArray(parsed?.transactions)
    ? parsed.transactions.length
    : (Array.isArray(parsed?.lignes) ? parsed.lignes.length : 0)
  const hasHeaderButNoTx =
    parsed != null &&
    initialTxCount === 0 &&
    (parsed.solde_ouverture != null || parsed.solde_cloture != null ||
     parsed.total_debits != null || parsed.total_credits != null)

  while (
    nbContinuations < maxContinuations &&
    (stopReason === 'max_tokens' ||
      (stopReason === 'end_turn' && rawText.length > 60000 && nbContinuations === 0) ||
      (hasHeaderButNoTx && nbContinuations === 0))
  ) {
    nbContinuations++
    // Compute landmark from current accumulated state
    const synthetic = parsed ? { ...parsed } : {}
    const allTxs = [...(synthetic.transactions || synthetic.lignes || []), ...extraTransactions]
    const lm = computeLandmark({ transactions: allTxs })

    const hint = lm.date && lm.desc
      ? `La dernière transaction extraite était : { date: "${lm.date}", description: "${(lm.desc || '').slice(0, 80)}" }. Reprends APRÈS celle-ci uniquement.`
      : hasHeaderButNoTx && nbContinuations === 1
        ? `Tu as renvoyé le résumé du relevé (soldes ${parsed?.solde_ouverture || '?'} → ${parsed?.solde_cloture || '?'}, débits ${parsed?.total_debits || '?'}, crédits ${parsed?.total_credits || '?'}) mais AUCUNE transaction. Extrais MAINTENANT TOUTES les lignes du tableau de transactions (date, libellé, débit, crédit, solde après).`
        : `Tu as déjà extrait ${extraTransactions.length} transactions supplémentaires. Reprends APRÈS la dernière.`

    console.log(`[bank-extract] continuation ${nbContinuations}/${maxContinuations} — landmark=${lm.date}/${lm.desc?.slice(0, 30)}`)

    try {
      const contStream = anthropic.messages.stream({
        model, max_tokens: maxTokens, temperature,
        system: 'Tu continues à extraire les transactions d\'un relevé bancaire. Retourne UNIQUEMENT un tableau JSON `[ {...}, {...} ]` avec les nouvelles transactions, sans aucune métadonnée, sans markdown, sans texte avant ou après. Si toutes les transactions sont déjà extraites, retourne `[]`.',
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: `${hint}\n\nRetourne UNIQUEMENT le tableau JSON des transactions manquantes. Format : [{"date":"YYYY-MM-DD","description":"...","debit":0,"credit":0,"solde":0}, ...].\nSi rien à ajouter : [].` },
        ]}],
      })
      const contResponse = await contStream.finalMessage()
      const contText = contResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      stopReason = contResponse.stop_reason
      console.log(`[bank-extract] continuation ${nbContinuations}: length=${contText.length}, stop=${stopReason}`)

      const newTxs = tryParseTransactionsArray(contText)
      if (!newTxs || newTxs.length === 0) {
        console.log(`[bank-extract] continuation ${nbContinuations}: 0 new tx, stop loop`)
        break
      }
      extraTransactions.push(...newTxs)
      console.log(`[bank-extract] continuation ${nbContinuations}: +${newTxs.length} tx (total extra=${extraTransactions.length})`)
    } catch (err: any) {
      console.warn(`[bank-extract] continuation ${nbContinuations} failed:`, err?.message || err)
      break
    }
  }

  // --- Re-parse the initial response if not done yet ---
  if (!parsed) parsed = tryParseFullJson(rawText)

  // --- Merge extra transactions into parsed result with dedup ---
  // Dedup utilise la description COMPLÈTE (pas slice 30) + solde si dispo
  // pour ne pas fusionner deux frais bancaires identiques le même jour
  // (ex. 2 commissions de 50 MUR avec libellés débutant pareil). Conserve
  // tout sauf les vraies répétitions exactes de l'IA.
  let added = 0
  let skipped = 0
  if (parsed && typeof parsed === 'object' && extraTransactions.length > 0) {
    const targetKey = Array.isArray(parsed.transactions)
      ? 'transactions'
      : (Array.isArray(parsed.lignes) ? 'lignes' : 'transactions')
    const existing: any[] = parsed[targetKey] || []
    const dedupKey = (t: any) =>
      `${t.date || ''}|${t.description || t.libelle || ''}|${t.debit || 0}|${t.credit || 0}|${t.solde || ''}`
    const seen = new Set(existing.map(dedupKey))
    for (const tx of extraTransactions) {
      const key = dedupKey(tx)
      if (seen.has(key)) { skipped++; continue }
      existing.push(tx)
      seen.add(key)
      added++
    }
    parsed[targetKey] = existing
  }

  console.log(`[bank-extract] DONE — continuations=${nbContinuations}, tx_added=${added}, dup_skipped=${skipped}, final_count=${parsed?.transactions?.length || parsed?.lignes?.length || 0}`)

  return {
    parsed,
    rawText,
    finalStopReason: stopReason,
    nbContinuations,
    nbTransactionsAdded: added,
    nbDuplicatesSkipped: skipped,
  }
}
