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
// Modèle par défaut : Haiku 4.5 (~3-5x plus rapide que Sonnet, suffisant pour
// le matching sémantique vu le prompt très structuré). Override possible via
// ANTHROPIC_AGENT_MODEL.
const DEFAULT_MODEL =
  process.env.ANTHROPIC_AGENT_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  "claude-haiku-4-5-20251001"

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

const SYSTEM_PROMPT = `Tu es un expert-comptable mauricien (40 ans d'expérience, IFRS, PCM 4-digits, multi-devise EUR/USD/MUR).

Tu reçois :
- TRANSACTIONS BANCAIRES "orphelines" qu'un algorithme n'a pas matchées
- FACTURES en attente (TOUTES les impayées de la société, certaines peuvent déjà être partiellement matchées)
- Le contexte société (devises, comptes bancaires, taux moyens)

Ton job : raisonner LIGNE PAR LIGNE comme un vrai comptable. Pour chaque transaction, propose SOIT un match facture(s), SOIT une classification PCM, SOIT rien.

═══ MÉTHODE DE RAISONNEMENT (pense étape par étape) ═══

Pour chaque transaction, examine dans cet ordre :

1. **LIBELLÉ** — quel tiers ? (souvent dans le libellé : "MAREIN", "Sampol", "Bastid", "DIGITAL DATA SOL", "OCC Malta"…). Sois souple sur les variantes : "MAREIN" = SAS MAREIN = Dr Jerome Sampol. "OCC Malta" = "Obesity Care Clinic Malta Ltd". Cherche aussi les références dans le libellé : "FACTURE", "INV", "/ROC/", "/URI/Paiement…", numéros de facture.

2. **MONTANT** — exact ? proche ? regarde DEVISE + montant origine. Compare en MUR équivalent via les taux fournis. Tolère ±2-5% pour les petits écarts (frais bancaires, taux jour différent).

3. **DATE** — la date du paiement n'est pas forcément la date de la facture. Tolère ±60 jours pour les paiements clients. Regarde par contre si le libellé contient une période ("Juin", "Aout 2025", "REF 20251022-004") → indice fort.

4. **REGROUPEMENTS** — c'est CLEF :
   - **1 paiement → N factures** : un virement de 500 000 MUR de DIGITAL DATA peut solder 2-3 factures du même tiers. Cherche les combinaisons qui SOMMENT au montant tx (±2%).
   - **N paiements → 1 facture** (ACOMPTES SUCCESSIFS) : si une facture de 11 855 EUR a déjà été matchée à un acompte de 521 900 MUR, et qu'on voit un autre Inward Transfer de 312 380 MUR du même tiers, c'est probablement un acompte supplémentaire. Tu PEUX proposer un match même si la facture est déjà partiellement matchée par l'algo (le système gère la déduplication).

5. **CROSS-CURRENCY** — fréquent. Une facture EUR peut être payée en MUR converti. Utilise les rates fournis. Si rate EUR=53 MUR : facture 11 855 EUR = ~628 000 MUR équivalent.

6. **CLASSIFICATION** (pas de facture) : si le libellé est :
   - "Bulk Payment SALARY" → salaire (PCM 4210)
   - "Service Fee", "Penalty Interest", "Debit Interest", "Subs Fee" → frais_bancaires (6270) / agios / interets (6611)
   - "MRA", "PAYE", "NSF", "CSG", "NPF" → paiement_mra (4330) / charges_sociales (4310)
   - "IB Own Account Transfer" entre tes propres comptes → virement_interne (5811)
   - Sinon → "autre"

═══ RÈGLES STRICTES ═══

a. JSON valide UNIQUEMENT, pas de texte hors schéma.
b. Tu NE PEUX PAS inventer un facture_id qui n'est pas dans la liste.
c. Confidence 0.0-1.0. N'utilise > 0.9 que sur preuve quasi-certaine (tiers + montant exact + référence numéro facture dans libellé).
d. Si tu hésites entre 2 factures pour 1 paiement, choisis celle dont le COUPLE (montant, date) est le plus proche. Si vraiment équivalentes, propose un multi-facture si les sommes collent.
e. Pour les classifications, utilise les codes PCM 4-digits canoniques : 6270, 6611, 5811, 4210, 4310, 4330, 4455.

═══ SCHÉMA JSON DE SORTIE ═══

{
  "matches": [
    {
      "transaction_key": "<releve_id>:<idx>",
      "facture_ids": ["uuid1", "uuid2"],
      "confidence": 0.85,
      "reasoning": "Concis (max 200 chars) : pourquoi ce match — mention tiers, montant, conversion devise si applicable, écart"
    }
  ],
  "classifications": [
    {
      "transaction_key": "<releve_id>:<idx>",
      "type": "frais_bancaires|virement_interne|salaire|charges_sociales|paiement_mra|interets|agios|remboursement_pret|autre",
      "compte_pcm": "6270",
      "confidence": 0.90,
      "reasoning": "Concis (max 200 chars)"
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
  // Capping serré : Haiku 4.5 + 15 tx + 30 factures = appel Claude ~5-8s,
  // total endpoint < 15s. Largement sous le timeout Vercel.
  const maxTx = args.maxTransactions ?? 15
  const maxFact = args.maxFactures ?? 30

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
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    // Prefill assistant response with `{` pour forcer Claude/Haiku à démarrer
    // par du JSON sans préambule explicatif. La réponse complète sera donc
    // `{ "matches": [...], "classifications": [...] }`.
    messages: [
      { role: "user" as const, content: userText },
      { role: "assistant" as const, content: "{" },
    ],
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

  // Extract JSON from response. Avec le prefill `{`, Claude continue
  // directement le JSON ; on doit donc le re-préfixer par `{`.
  let cleaned = text.trim()
  if (!cleaned.startsWith("{")) cleaned = "{" + cleaned
  cleaned = cleaned.replace(/```json|```/g, "").trim()
  // Retire tout ce qui suit la dernière `}` au cas où Claude continue
  // après le JSON (rare mais possible).
  const lastBrace = cleaned.lastIndexOf("}")
  if (lastBrace > 0) cleaned = cleaned.slice(0, lastBrace + 1)
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
