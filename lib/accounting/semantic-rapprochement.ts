/**
 * Couche IA Claude pour rattraper les rapprochements que l'algorithme
 * `runIntelligentRapprochement` ne parvient pas à matcher.
 *
 * Concept : un comptable humain qui regarde un libellé bancaire ambigu se pose
 * la question "à quelle facture en attente ce paiement pourrait-il correspondre ?"
 * en raisonnant sur la sémantique (alias, abréviations, devises, regroupements,
 * dates approximatives). Cette fonction délègue ce raisonnement à Claude,
 * uniquement sur les transactions que l'algo n'a pas réussi à classer.
 *
 * ⚠️ Cette couche NE remplace PAS le moteur algorithmique : elle s'exécute
 * APRÈS. Les matches algorithmiques restent prioritaires (confiance plus
 * vérifiable). Seules les tx encore orphelines passent par Claude.
 */

import type { MatchingFacture, MatchingTransaction } from "./matching-engine"

const CLAUDE_API = "https://api.anthropic.com/v1/messages"
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6"

/** Identifiant de tx (cohérent avec le moteur algorithmique). */
function txKey(tx: MatchingTransaction): string {
  return `${tx.releve_id}:${tx.transaction_idx}`
}

export interface SemanticMatch {
  transactionKey: string
  factureIds: string[]
  confidence: number
  reasoning: string
  source: "claude_semantic"
}

export interface SemanticClassification {
  transactionKey: string
  type:
    | "frais_bancaires"
    | "virement_interne"
    | "salaire"
    | "charges_sociales"
    | "paiement_mra"
    | "interets"
    | "agios"
    | "remboursement_pret"
    | "autre"
  compte_pcm: string | null
  confidence: number
  reasoning: string
  source: "claude_semantic"
}

export interface SemanticResult {
  matches: SemanticMatch[]
  classifications: SemanticClassification[]
  /** Diagnostic : nb tx envoyées à Claude, durée, tokens. */
  meta: {
    sent_transactions: number
    sent_factures: number
    duration_ms: number
    skipped_reason?: string
    model: string
  }
}

const SYSTEM_PROMPT = `Tu es un expert-comptable mauricien spécialisé en IFRS et plan comptable mauricien (PCM 4-digits).

Tu reçois :
- Une liste de TRANSACTIONS BANCAIRES "orphelines" qu'un moteur algorithmique n'a pas réussi à matcher
- Une liste de FACTURES en attente de paiement
- Le contexte de la société (devises, comptes bancaires, règles)

Ta mission : pour CHAQUE transaction, raisonner comme un comptable humain et proposer SOIT un match avec une ou plusieurs factures, SOIT une classification PCM, SOIT "rien" (laisser orpheline).

Règles strictes :
1. Tu DOIS répondre uniquement en JSON valide selon le schéma ci-dessous, sans texte avant ni après.
2. Tu ne PEUX PAS inventer un facture_id qui n'est pas dans la liste fournie.
3. Confidence : 0.0 à 1.0. N'utilise pas > 0.9 sauf si tu es vraiment sûr (numéro de facture explicite, tiers évident, montant exact).
4. Tu peux matcher un paiement avec PLUSIEURS factures (paiement groupé) — mets tous les facture_ids dans le tableau.
5. Si une transaction est probablement un frais bancaire / virement interne / salaire / paiement MRA → utilise classifications, pas matches.
6. Pour le compte PCM, utilise les codes 4-digits canoniques :
   - 6270 (frais bancaires), 6611 (intérêts emprunts), 6612 (intérêts dette financière)
   - 5811 (virements internes en cours)
   - 4210 (rémunérations dues), 4310 (sécurité sociale)
   - 4455 (TVA à décaisser)
   - 627 (services bancaires assimilés), 628 (charges externes diverses)
7. Tiers normalisation : "MAREIN" = SAS MAREIN = Dr Jerome Sampol. "OCC Malta" = "Obesity Care Clinic Malta Ltd". Sois souple sur les variantes.
8. Cross-currency : un paiement en MUR peut payer une facture en EUR (ou inversement) via conversion. Le contexte donne le taux moyen.
9. Si tu hésites entre 2 factures pour 1 paiement, choisis celle dont le montant + date sont les plus proches.

Schéma JSON de sortie :
{
  "matches": [
    {
      "transaction_key": "<releve_id>:<idx>",
      "facture_ids": ["uuid1", "uuid2"],
      "confidence": 0.85,
      "reasoning": "Court (max 200 chars) : pourquoi ce match"
    }
  ],
  "classifications": [
    {
      "transaction_key": "<releve_id>:<idx>",
      "type": "frais_bancaires|virement_interne|salaire|charges_sociales|paiement_mra|interets|agios|remboursement_pret|autre",
      "compte_pcm": "6270",
      "confidence": 0.90,
      "reasoning": "Court (max 200 chars)"
    }
  ]
}`

interface ClaudeInputContext {
  societe_nom: string
  societe_id: string
  devise_principale: string
  comptes_bancaires: Array<{
    id: string
    devise: string
    compte_comptable: string
    banque: string
  }>
  fx_rates: Record<string, number>
}

export async function runSemanticRapprochement(args: {
  orphanTransactions: MatchingTransaction[]
  unmatchedFactures: MatchingFacture[]
  context: ClaudeInputContext
  apiKey: string
  minConfidence?: number
  maxTransactions?: number
  maxFactures?: number
}): Promise<SemanticResult> {
  const t0 = Date.now()
  const minConfidence = args.minConfidence ?? 0.7
  const maxTx = args.maxTransactions ?? 80
  const maxFact = args.maxFactures ?? 100

  const empty: SemanticResult = {
    matches: [],
    classifications: [],
    meta: {
      sent_transactions: 0,
      sent_factures: 0,
      duration_ms: 0,
      model: DEFAULT_MODEL,
    },
  }

  if (!args.apiKey) {
    return { ...empty, meta: { ...empty.meta, skipped_reason: "no_api_key" } }
  }
  if (args.orphanTransactions.length === 0) {
    return {
      ...empty,
      meta: { ...empty.meta, skipped_reason: "no_orphans" },
    }
  }

  // Cap input size — un seul appel doit rester raisonnable en tokens
  const txs = args.orphanTransactions.slice(0, maxTx).map((t) => ({
    transaction_key: txKey(t),
    date: t.date,
    libelle: t.libelle,
    debit: t.debit,
    credit: t.credit,
    devise: t.devise,
    tiers_detecte: t.tiers_detecte,
  }))
  const facts = args.unmatchedFactures.slice(0, maxFact).map((f) => ({
    facture_id: f.id,
    numero: f.numero_facture,
    tiers: f.tiers,
    montant_ttc: f.montant_ttc,
    montant_mur: f.montant_mur,
    devise: f.devise,
    date_facture: f.date_facture,
    date_echeance: f.date_echeance,
    type: f.type_facture,
    statut: f.statut,
  }))

  const userPayload = {
    contexte: args.context,
    transactions_orphelines: txs,
    factures_impayees: facts,
  }

  const userText = `Voici les données à analyser :\n\n\`\`\`json\n${JSON.stringify(
    userPayload,
    null,
    2
  )}\n\`\`\`\n\nProduis le JSON de matches/classifications selon le schéma.`

  const body = {
    model: DEFAULT_MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user" as const, content: userText }],
  }

  let response: Response
  try {
    response = await fetch(CLAUDE_API, {
      method: "POST",
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  } catch (err: any) {
    return {
      ...empty,
      meta: {
        ...empty.meta,
        sent_transactions: txs.length,
        sent_factures: facts.length,
        duration_ms: Date.now() - t0,
        skipped_reason: `network_error: ${err?.message || "unknown"}`,
      },
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "")
    return {
      ...empty,
      meta: {
        ...empty.meta,
        sent_transactions: txs.length,
        sent_factures: facts.length,
        duration_ms: Date.now() - t0,
        skipped_reason: `http_${response.status}: ${errText.slice(0, 120)}`,
      },
    }
  }

  const json = (await response.json()) as any
  const text =
    Array.isArray(json?.content) && json.content[0]?.type === "text"
      ? (json.content[0].text as string)
      : ""

  // Extract JSON from the response (Claude returns it inside text — sometimes
  // wrapped in ```json fences, sometimes raw)
  const cleaned = text.replace(/```json|```/g, "").trim()
  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return {
      ...empty,
      meta: {
        ...empty.meta,
        sent_transactions: txs.length,
        sent_factures: facts.length,
        duration_ms: Date.now() - t0,
        skipped_reason: "claude_response_not_json",
      },
    }
  }

  const validTxKeys = new Set(txs.map((t) => t.transaction_key))
  const validFactIds = new Set(facts.map((f) => f.facture_id))

  const matches: SemanticMatch[] = []
  for (const m of Array.isArray(parsed?.matches) ? parsed.matches : []) {
    const key = String(m.transaction_key || "")
    const fids = Array.isArray(m.facture_ids) ? m.facture_ids.filter((x: any) => typeof x === "string") : []
    const conf = Number(m.confidence) || 0
    if (!validTxKeys.has(key)) continue
    const validatedFids = fids.filter((id: string) => validFactIds.has(id))
    if (validatedFids.length === 0) continue
    if (conf < minConfidence) continue
    matches.push({
      transactionKey: key,
      factureIds: validatedFids,
      confidence: conf,
      reasoning: String(m.reasoning || "").slice(0, 240),
      source: "claude_semantic",
    })
  }

  const allowedTypes = new Set([
    "frais_bancaires",
    "virement_interne",
    "salaire",
    "charges_sociales",
    "paiement_mra",
    "interets",
    "agios",
    "remboursement_pret",
    "autre",
  ])
  const classifications: SemanticClassification[] = []
  for (const c of Array.isArray(parsed?.classifications) ? parsed.classifications : []) {
    const key = String(c.transaction_key || "")
    const type = String(c.type || "")
    const conf = Number(c.confidence) || 0
    if (!validTxKeys.has(key)) continue
    if (!allowedTypes.has(type)) continue
    if (conf < minConfidence) continue
    classifications.push({
      transactionKey: key,
      type: type as SemanticClassification["type"],
      compte_pcm: typeof c.compte_pcm === "string" ? c.compte_pcm : null,
      confidence: conf,
      reasoning: String(c.reasoning || "").slice(0, 240),
      source: "claude_semantic",
    })
  }

  return {
    matches,
    classifications,
    meta: {
      sent_transactions: txs.length,
      sent_factures: facts.length,
      duration_ms: Date.now() - t0,
      model: DEFAULT_MODEL,
    },
  }
}
