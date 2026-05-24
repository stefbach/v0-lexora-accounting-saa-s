export const BANK_NAMES_BLACKLIST = [
  // Mauritius banks
  'mcb', 'mauritius commercial bank', 'sbm', 'state bank of mauritius',
  'absa', 'barclays', 'hsbc', 'maubank', 'bank', 'banque', 'banking',
  'bmo', 'bnp', 'afrasia', 'abc banking', 'warwyck', 'standard chartered',
  'bank of valletta', 'bov',
  // International banks & financial institutions
  'jpmorgan', 'citibank', 'deutsche bank', 'credit suisse', 'ubs',
  'natwest', 'lloyds', 'rbs', 'santander',
  // Payment processors (NOT suppliers)
  'stripe', 'paypal', 'wise', 'revolut', 'transferwise',
  'visa', 'mastercard', 'amex', 'american express',
  'western union', 'moneygram', 'apple pay', 'meta pay',
  // SaaS/Tech companies that get misclassified as banks
  'google', 'google cloud', 'google workspace',
  'amazon', 'aws', 'amazon web services',
  'microsoft', 'azure', 'microsoft azure',
  'vercel', 'anthropic', 'openai',
]

/** Coerce n'importe quelle valeur en string non-vide (objet → "", number → str). */
function toStr(v: any): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    // Claude renvoie parfois { nom, brn } pour destinataire/emetteur — on prend nom
    return String(v.nom || v.name || v.raison_sociale || v.libelle || '')
  }
  return ''
}

export function isBankName(name: any): boolean {
  const lower = toStr(name).toLowerCase().trim()
  if (!lower || lower.length < 2) return false
  return BANK_NAMES_BLACKLIST.some(b => lower.includes(b))
}

/**
 * Validates and cleans extraction data after OCR.
 * Fixes common misclassifications (bank name as société, etc.)
 */
export function validateAndCleanExtraction(
  extraction: any,
  detectedType: string,
  userSocietes: { id: string; nom: string; brn?: string }[]
): {
  societe_id: string | null
  needs_confirmation: boolean
  confidence: number
} {
  if (!extraction) return { societe_id: null, needs_confirmation: true, confidence: 0 }

  // RULE 1: Bank statements — société = account HOLDER, never bank name
  if (detectedType === 'releve_bancaire') {
    const titulaire = extraction.nom_societe || extraction.titulaire || ''
    if (isBankName(titulaire)) {
      return { societe_id: null, needs_confirmation: true, confidence: 0 }
    }
  }

  // RULE 2: Clean bank names from société fields
  if (extraction.nom_societe && isBankName(extraction.nom_societe)) {
    extraction.nom_societe = null
  }

  // Get candidate société name
  const candidate = toStr(
    extraction.nom_societe ||
    extraction.titulaire ||
    extraction.societe ||
    extraction.destinataire ||
    extraction.employeur ||
    '',
  ).toLowerCase().trim()

  if (!candidate) {
    return { societe_id: null, needs_confirmation: true, confidence: 0 }
  }

  // RULE 3: BRN matching (strongest signal)
  if (extraction.brn) {
    const brnMatch = userSocietes.find(s => s.brn && s.brn === extraction.brn)
    if (brnMatch) {
      return { societe_id: brnMatch.id, needs_confirmation: false, confidence: 1.0 }
    }
  }

  // RULE 4: Fuzzy name matching against user's sociétés
  const match = findBestSocieteMatch(candidate, userSocietes)
  if (match && match.score >= 0.5) {
    return {
      societe_id: match.id,
      needs_confirmation: match.score < 0.7,
      confidence: match.score,
    }
  }

  return { societe_id: null, needs_confirmation: true, confidence: 0 }
}

/**
 * Fuzzy match a candidate name against a list of sociétés.
 * Returns the best match with a score between 0 and 1.
 */
function findBestSocieteMatch(
  candidate: string,
  societes: { id: string; nom: string }[]
): { id: string; score: number } | null {
  if (!candidate || societes.length === 0) return null

  const candidateLower = candidate.toLowerCase().replace(/\s*(ltd|limited|sarl|sas|sa|co|company|cie)\s*/gi, '').trim()
  let bestMatch: { id: string; score: number } | null = null

  for (const s of societes) {
    const socName = s.nom.toLowerCase().replace(/\s*(ltd|limited|sarl|sas|sa|co|company|cie)\s*/gi, '').trim()

    // Exact match
    if (candidateLower === socName) {
      return { id: s.id, score: 1.0 }
    }

    // Contains match (one contains the other)
    if (candidateLower.includes(socName) || socName.includes(candidateLower)) {
      const score = Math.min(candidateLower.length, socName.length) / Math.max(candidateLower.length, socName.length)
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: s.id, score: Math.max(score, 0.7) }
      }
    }

    // Word overlap
    const candidateWords = candidateLower.split(/\s+/).filter(w => w.length > 2)
    const socWords = socName.split(/\s+/).filter(w => w.length > 2)
    if (candidateWords.length > 0 && socWords.length > 0) {
      const overlap = candidateWords.filter(w => socWords.some(sw => sw.includes(w) || w.includes(sw))).length
      const wordScore = overlap / Math.max(candidateWords.length, socWords.length)
      if (wordScore > 0.5 && (!bestMatch || wordScore > bestMatch.score)) {
        bestMatch = { id: s.id, score: wordScore }
      }
    }
  }

  return bestMatch
}

/**
 * Computes a confidence score for the OCR extraction quality.
 * Returns 0-100.
 */
export function computeConfidence(extraction: any, detectedType: string): number {
  if (!extraction) return 0
  let score = 0

  // Has société détectée (not a bank name)
  const societe = extraction.nom_societe || extraction.societe || extraction.titulaire || ''
  if (societe && !isBankName(societe)) score += 20

  // Type-specific checks
  if (detectedType === 'releve_bancaire') {
    if (extraction.banque) score += 10
    if (extraction.numero_compte || extraction.iban) score += 15
    if (extraction.solde_ouverture != null || extraction.solde_debut != null) score += 10
    if (extraction.solde_cloture != null || extraction.solde_fin != null) score += 10
    const txCount = (extraction.lignes?.length || 0) + (extraction.transactions?.length || 0)
    if (txCount > 0) score += 20
    if (extraction.periode_debut && extraction.periode_fin) score += 15
  } else {
    // Invoices / payslips
    if (extraction.numero_reference || extraction.numero_facture) score += 20
    if ((extraction.montant_ttc || 0) > 0 || (extraction.montant_ht || 0) > 0) score += 20
    if (extraction.date_document || extraction.date_facture) score += 15
    if (extraction.emetteur || extraction.fournisseur || extraction.tiers) score += 15
    if (extraction.brn) score += 10
  }

  return Math.min(score, 100)
}

/**
 * Attempts to parse potentially malformed JSON from Claude's response.
 * Uses 4 strategies: direct parse, fence extraction, brace matching, truncation repair.
 */
export function repairBankJSON(text: string): any | null {
  if (!text) return null
  const trimmed = text.trim()

  // Strategy 1: Direct parse (response is pure JSON)
  try { return JSON.parse(trimmed) } catch { /* noop */ }

  // Strategy 2: Extract from markdown code fences ```json ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()) } catch { /* noop */ }
  }

  // Strategy 3: Find first { to last } in text
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(trimmed.substring(firstBrace, lastBrace + 1)) } catch { /* noop */ }
  }

  // Strategy 4: JSON truncated by token limit — try to repair
  if (firstBrace !== -1) {
    let jsonCandidate = trimmed.substring(firstBrace)
    // Remove trailing markdown
    jsonCandidate = jsonCandidate.replace(/```\s*$/, '').trim()
    // Count open/close braces and brackets to close them
    let openBraces = 0, openBrackets = 0
    let inString = false, escaped = false
    for (const ch of jsonCandidate) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') openBraces++
      if (ch === '}') openBraces--
      if (ch === '[') openBrackets++
      if (ch === ']') openBrackets--
    }
    // Remove trailing incomplete value (after last comma)
    if (openBraces > 0 || openBrackets > 0) {
      jsonCandidate = jsonCandidate.replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, '')
      jsonCandidate = jsonCandidate.replace(/,\s*\{[^}]*$/, '')
      jsonCandidate = jsonCandidate.replace(/,\s*$/, '')
    }
    // Close unclosed brackets and braces
    for (let i = 0; i < openBrackets; i++) jsonCandidate += ']'
    for (let i = 0; i < openBraces; i++) jsonCandidate += '}'
    try { return JSON.parse(jsonCandidate) } catch { /* noop */ }
  }

  return null
}
