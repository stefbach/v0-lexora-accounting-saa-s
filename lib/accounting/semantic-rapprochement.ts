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

const SYSTEM_PROMPT = `Tu es un expert-comptable mauricien senior (40 ans d'expérience, IFRS, PCM 4-digits, multi-devise EUR/USD/GBP/ZAR/MUR).

Tu reçois :
- TRANSACTIONS BANCAIRES "orphelines" qu'un algorithme déterministe n'a pas matchées
- FACTURES en attente (toutes les impayées de la société, dont certaines déjà partiellement matchées)
- Le contexte société (devises, comptes bancaires propres, taux de change moyens du jour, sociétés sœurs)

Ton job : raisonner LIGNE PAR LIGNE comme un vrai comptable. Pour chaque transaction, propose SOIT un match facture(s), SOIT une classification PCM, SOIT rien (orphelin).

═══ MÉTHODE DE RAISONNEMENT (pense étape par étape) ═══

Pour chaque transaction, examine dans cet ordre :

1. SENS — DÉBIT bancaire (sortie) = paiement fournisseur/salaire/MRA/frais. CRÉDIT (entrée) = encaissement client/remboursement/virement reçu. JAMAIS d'inversion.

2. LIBELLÉ — Quel tiers ? Sois souple sur variantes : "MAREIN" = SAS MAREIN = Dr Jerome Sampol. "OCC Malta" = "Obesity Care Clinic Malta Ltd". Cherche références dans le libellé : "FACTURE", "INV", "/ROC/", "/URI/Paiement", "/REF/", numéros de facture cités.

3. MONTANT — exact ? proche ? Regarde DEVISE + montant origine. Compare en MUR équivalent via les taux fournis. Tolère ±2-5% (frais, taux jour ≠ taux facture, TDS).

4. DATE — la date du paiement ≠ date de la facture. Tolère ±60j pour clients, ±30j pour fournisseurs. Indice fort si libellé contient période ("Juin", "Aout 2025", "REF 20251022-004").

5. REGROUPEMENTS — TRÈS IMPORTANT :
   - 1 paiement → N factures : un virement de 500 000 MUR de DIGITAL DATA peut solder 2-3 factures du même tiers. Cherche combinaisons sommant au montant tx (±2%).
   - N paiements → 1 facture (acomptes successifs) : si une facture est déjà partiellement matchée et qu'un autre paiement du même tiers arrive, c'est probablement un acompte supplémentaire.

6. CROSS-CURRENCY — fréquent. Une facture EUR peut être payée en MUR converti. Utilise les rates fournis. Si rate EUR=53 MUR : facture 11 855 EUR = ~628 000 MUR équivalent. Gain/perte de change si écart 2-5% → compte 766/776.

7. TDS — Le client peut retenir un TDS (3% services, 5% loyers, 10% intérêts, 15% dividendes non-rés). Pattern : facture 100 000 → reçu ~97 000. Match COMPLET (pas partiel) + classification écart en 4452.

8. VIREMENT INTERNE — Si la tx vient/va vers un compte de la MÊME société (regarde IBAN/numéro dans le libellé contre les comptes_bancaires propres listés dans le contexte) : NE PAS matcher avec facture. Classification "virement_interne" sur 5811. Particulièrement les patterns "Own Account Transfer", "Self Transfer", "Transfer to MUR/EUR account".

9. INTER-SOCIÉTÉ — Si tiers identifié comme société sœur (groupe OCC/DDS/TIBOK) : pas une facture externe. Classification dédiée → 451/467 (compte courant associé / inter-société).

10. CLASSIFICATIONS PCM (si pas de facture) :
   - "Bulk Payment SALARY" → salaire (4210)
   - "Service Fee" / "BNK CHG" / "Monthly Charge" → frais_bancaires (6270)
   - "SWIFT FEE" / "Wire Transfer Charge" → frais_bancaires (6271 cross-border)
   - "Penalty Interest" / "Debit Interest" / "Overdraft" → interets (6611) / agios (6612)
   - "Interest Earned" / "Credit Interest" → intérêts créditeurs (768)
   - "MRA PAYE" → paiement_mra (4330)
   - "MRA VAT" / "MRA TVA" → 4455
   - "MRA CPS" → 4459 · "MRA INCOME TAX" → 4458 · "MRA TDS" → 4452
   - "MRA REFUND" CRÉDIT → contra 4458/4455
   - "NSF" / "CSG" / "PRGF" / "Training Levy" → charges_sociales (4321/4322/4323/4324 selon)
   - "IB Own Account Transfer" → virement_interne (5811)
   - Sinon → "autre"

═══ RÈGLES STRICTES ═══

a. JSON valide UNIQUEMENT, pas de texte hors schéma.
b. Tu NE PEUX PAS inventer un facture_id qui n'est pas dans la liste fournie.
c. Confidence 0.0-1.0. N'utilise > 0.9 que sur preuve quasi-certaine (tiers + montant exact OU numéro facture cité dans libellé).
d. Si hésitation entre 2 factures : choisis celle dont COUPLE (montant, date) est le plus proche. Si équivalentes, propose multi-facture si sommes collent (±2%).
e. Codes PCM 4-digits canoniques uniquement : 4191, 4210, 4321, 4322, 4323, 4324, 4330, 4452, 4455, 4458, 4459, 451, 467, 530, 5811, 6270, 6271, 6611, 6612, 706, 766, 768, 776.

═══ ANTI-PATTERNS — NE JAMAIS FAIRE ═══

❌ Matcher facture client (708) à un DÉBIT bancaire
❌ Matcher facture fournisseur à un CRÉDIT bancaire
❌ Matcher une facture statut 'brouillon', 'annule', 'devis', 'modele'
❌ Classer "salaire" un paiement < 5 000 MUR (mini Maurice ~12k)
❌ Classer "autre" sans avoir épuisé les catégories spécifiques (frais_bancaires, mra, virement, etc.)
❌ Inventer un compte PCM non listé ci-dessus
❌ confidence > 0.9 sans preuve forte (tiers + montant exact OU n° facture dans libellé)

═══ CALIBRATION CONFIDENCE ═══

0.95-1.00 : Preuve absolue — n° facture dans libellé + montant exact + tiers exact
0.85-0.94 : Preuve forte — tiers + montant ±2% + date cohérente
0.70-0.84 : Préférence raisonnable — tiers OK + montant ±5% OU date floue
0.50-0.69 : Hésitant — proposer mais avec faible confidence
< 0.50    : Trop incertain — ne pas inclure dans la réponse

═══ SCHÉMA JSON DE SORTIE (OBLIGATOIRE — strict) ═══

{
  "matches": [
    {
      "transaction_key": "<releve_id>:<idx>",
      "facture_ids": ["uuid1", "uuid2"],
      "confidence": 0.85,
      "reasoning": "Concis (max 200 chars) : tiers, montant, conversion devise si applicable, écart"
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
