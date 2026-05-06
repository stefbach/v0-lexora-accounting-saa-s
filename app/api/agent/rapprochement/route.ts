/**
 * POST /api/agent/rapprochement
 *
 * Lance le rapprochement intelligent (matching tx ↔ factures + classifications
 * automatiques) pour une société donnée, en réutilisant le moteur pur
 * `runIntelligentRapprochement`. Mode "suggestion" : les matches trouvés sont
 * persistés dans `releves_bancaires.transactions_json[].facture_ids` et
 * `.lettre`, mais aucune écriture comptable n'est créée — le comptable revoit
 * dans le front Lexora et clique "Confirmer" pour générer les BNQ.
 *
 * Auth : Bearer LEXORA_AGENT_SECRET
 * Body : {
 *   societe_id: string,
 *   date_debut?: string,        // YYYY-MM-DD, défaut: 90 derniers jours
 *   date_fin?: string,
 *   releve_ids?: string[],      // restreint le scope à certains relevés
 *   dry_run?: boolean,          // ne rien écrire
 *   min_confidence?: number     // 0..1, défaut 0.7
 * }
 */
import { NextResponse } from "next/server"
import { verifyAgentSecret } from "@/lib/agent-auth"
import { getAdminClient } from "@/lib/supabase/admin"
import { runIntelligentRapprochement } from "@/lib/accounting/intelligent-rapprochement"
import {
  buildAliasMap,
  type SupplierAlias,
} from "@/lib/accounting/intelligent-rapprochement"
import { getHistoricalRatesForDates } from "@/lib/accounting/historical-rates"
import type {
  MatchingFacture,
  MatchingTransaction,
} from "@/lib/accounting/matching-engine"
import { runSemanticRapprochement } from "@/lib/accounting/semantic-rapprochement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

interface ReleveRow {
  id: string
  societe_id: string
  compte_bancaire_id: string
  date_debut: string
  date_fin: string
  transactions_json: any[] | null
  statut_rapprochement: string | null
}

function ninetyDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return d.toISOString().slice(0, 10)
}

export async function POST(request: Request) {
  if (!verifyAgentSecret(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 })
  }

  const societe_id: string | undefined = body?.societe_id
  if (!societe_id) {
    return NextResponse.json({ error: "societe_id requis" }, { status: 400 })
  }

  const date_debut: string | null = body?.date_debut || null
  const date_fin: string | null = body?.date_fin || null
  const releve_ids: string[] | null = Array.isArray(body?.releve_ids)
    ? body.releve_ids
    : null
  const dry_run: boolean = !!body?.dry_run
  const min_confidence: number =
    typeof body?.min_confidence === "number" ? body.min_confidence : 0.7
  const use_semantic: boolean = body?.use_semantic !== false // default true

  const sb = getAdminClient()

  // 1. Société + comptes bancaires (devises)
  const { data: societe } = await sb
    .from("societes")
    .select("id, nom, devise_principale, devises_actives, aliases")
    .eq("id", societe_id)
    .maybeSingle()
  if (!societe) {
    return NextResponse.json({ error: "société introuvable" }, { status: 404 })
  }

  const { data: comptes = [] } = await sb
    .from("comptes_bancaires")
    .select("id, devise")
    .eq("societe_id", societe_id)
  const compteDeviseMap = new Map<string, string>()
  for (const c of comptes || []) compteDeviseMap.set(c.id, c.devise || "MUR")

  // 2. Relevés (toute la profondeur disponible si aucune date n'est donnée —
  //    on ne veut PAS rater le gros relevé semestriel)
  let relQuery = sb
    .from("releves_bancaires")
    .select(
      "id, societe_id, compte_bancaire_id, date_debut, date_fin, transactions_json, statut_rapprochement"
    )
    .eq("societe_id", societe_id)
    .order("date_debut", { ascending: true })
  if (date_debut) relQuery = relQuery.gte("date_fin", date_debut)
  if (date_fin) relQuery = relQuery.lte("date_debut", date_fin)
  if (releve_ids && releve_ids.length > 0) {
    relQuery = relQuery.in("id", releve_ids)
  }
  const { data: releves = [] } = (await relQuery) as { data: ReleveRow[] | null }

  if (!releves || releves.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "aucun relevé sur la période",
      societe_id,
      stats: { totalTransactions: 0, identified: 0, matched: 0, classified: 0, remaining: 0, byStrategy: {} },
      matches: [],
      classifications: [],
      writes: { dry_run, releves_modifies: 0, transactions_modifiees: 0 },
    })
  }

  // 3. Construire les MatchingTransaction depuis les JSONB des relevés
  const matchingTx: MatchingTransaction[] = []
  const txDates = new Set<string>()
  const txDevises = new Set<string>()
  for (const r of releves) {
    const arr = Array.isArray(r.transactions_json) ? r.transactions_json : []
    const compteDevise = compteDeviseMap.get(r.compte_bancaire_id) || "MUR"
    for (let i = 0; i < arr.length; i++) {
      const tx = arr[i]
      // On skip les tx déjà rapprochées (facture_ids non vide) ou déjà
      // classifiées avec un compte_comptable manuel — on ne refait pas le
      // travail déjà validé.
      const fids = Array.isArray(tx.facture_ids) ? tx.facture_ids : []
      if (fids.length > 0) continue
      const debit = Number(tx.debit) || 0
      const credit = Number(tx.credit) || 0
      const devise = (tx.devise || compteDevise || "MUR").toUpperCase()
      matchingTx.push({
        releve_id: r.id,
        transaction_idx: i,
        date: tx.date,
        libelle: tx.libelle || "",
        tiers_detecte: tx.tiers_detecte || null,
        debit,
        credit,
        devise,
      })
      if (tx.date) txDates.add(tx.date)
      if (devise !== "MUR") txDevises.add(devise)
    }
  }

  // 4. Factures non payées (toutes statuts sauf paye/annule, pas de filtre date —
  //    une facture émise il y a 6 mois peut être payée aujourd'hui).
  const { data: facturesRaw = [] } = await sb
    .from("factures")
    .select(
      "id, numero_facture, tiers, montant_ttc, montant_mur, devise, date_facture, date_echeance, conditions_paiement, type_facture, statut"
    )
    .eq("societe_id", societe_id)
    .not("statut", "in", '("paye","annule")')
  const matchingFactures: MatchingFacture[] = (facturesRaw || []).map((f: any) => ({
    id: f.id,
    numero_facture: f.numero_facture || null,
    tiers: f.tiers || null,
    montant_ttc: Number(f.montant_ttc) || 0,
    montant_mur: f.montant_mur != null ? Number(f.montant_mur) : null,
    devise: f.devise || null,
    date_facture: f.date_facture || null,
    date_echeance: f.date_echeance || null,
    conditions_paiement: f.conditions_paiement != null ? Number(f.conditions_paiement) : null,
    type_facture: f.type_facture || null,
    statut: f.statut || null,
  }))

  // 5. Bulletins de paie (Phase 3 du moteur intelligent — détection de paie).
  // periode est de type DATE en DB (ex 2025-07-01), il FAUT comparer avec un
  // format DATE valide sinon Postgres rejette silencieusement et renvoie [].
  const minPeriode = date_debut
    ? date_debut.slice(0, 7) + "-01"
    : "2020-01-01"
  const { data: bulletinsRaw = [] } = await sb
    .from("bulletins_paie")
    .select("periode, salaire_net")
    .eq("societe_id", societe_id)
    .gte("periode", minPeriode)
  const bulletins =
    (bulletinsRaw || []).map((b: any) => ({
      periode: b.periode,
      salaire_net: Number(b.salaire_net) || 0,
    })) || []

  // 6. Écritures non lettrées (compte 411x/401x) — fallback ECRITURE_MATCH
  let ecrQuery = sb
    .from("ecritures_comptables_v2")
    .select("id, numero_compte, libelle, debit_mur, credit_mur, date_ecriture, journal")
    .eq("societe_id", societe_id)
    .is("lettre", null)
    .or("numero_compte.like.411%,numero_compte.like.401%")
    .limit(2000)
  if (date_debut) ecrQuery = ecrQuery.gte("date_ecriture", date_debut)
  const { data: ecrituresRaw = [] } = await ecrQuery
  const ecritures = (ecrituresRaw || []).map((e: any) => ({
    id: e.id,
    compte: e.numero_compte,
    debit: Number(e.debit_mur) || 0,
    credit: Number(e.credit_mur) || 0,
    libelle: e.libelle || "",
  }))

  // 7. Alias fournisseurs (pour le matching flou)
  const { data: aliasesRaw = [] } = await sb
    .from("supplier_aliases")
    .select("canonical, alias")
    .or(`societe_id.eq.${societe_id},societe_id.is.null`)
  const aliasMap = buildAliasMap((aliasesRaw || []) as SupplierAlias[])

  // 8. Taux de change historiques pour les dates/devises rencontrées
  const tuples: Array<{ date: string; devise: string }> = []
  for (const d of txDates) {
    for (const dev of txDevises) tuples.push({ date: d, devise: dev })
  }
  const ratesByKey = await getHistoricalRatesForDates(sb, tuples)
  // Le moteur attend Record<DEVISE, taux> "global" — on fait moyenne par devise
  const rates: Record<string, number> = { MUR: 1 }
  const accByDevise: Record<string, { sum: number; n: number }> = {}
  for (const [k, v] of Object.entries(ratesByKey)) {
    const devise = k.split("|")[1]
    if (!devise || devise === "MUR") continue
    const slot = accByDevise[devise] || { sum: 0, n: 0 }
    slot.sum += v
    slot.n += 1
    accByDevise[devise] = slot
  }
  for (const [devise, { sum, n }] of Object.entries(accByDevise)) {
    rates[devise] = n > 0 ? sum / n : 1
  }

  // 9. Self-names pour détecter les virements internes (sociétés sœurs)
  const { data: autresSocietes = [] } = await sb
    .from("societes")
    .select("nom")
    .neq("id", societe_id)
  const selfNames = (autresSocietes || []).map((s: any) => s.nom).filter(Boolean)
  const aliasesArr = Array.isArray((societe as any).aliases)
    ? (societe as any).aliases
    : []
  const societeNames = [societe.nom, ...aliasesArr].filter(Boolean) as string[]

  // 10. Run du moteur intelligent (PURE function)
  const result = runIntelligentRapprochement(matchingTx, matchingFactures, {
    societeNames,
    selfNames,
    bulletins,
    ecritures,
    rates,
    aliasMap,
  })

  // 10.bis. Couche IA Claude pour rattraper les orphelines restantes
  let semantic = {
    matches: [] as Array<{
      transactionKey: string
      factureIds: string[]
      confidence: number
      reasoning: string
      source: "claude_semantic"
    }>,
    classifications: [] as Array<{
      transactionKey: string
      type: string
      compte_pcm: string | null
      confidence: number
      reasoning: string
      source: "claude_semantic"
    }>,
    meta: {} as Record<string, any>,
  }
  if (use_semantic) {
    const matchedTxKeys = new Set(result.matches.map((m) => m.transactionKey))
    const classifiedTxKeys = new Set(
      result.classifications.map((c) => c.transactionKey)
    )
    const matchedFactureIds = new Set(
      result.matches.flatMap((m) => m.factureIds)
    )
    const orphanTransactions = matchingTx.filter(
      (t) =>
        !matchedTxKeys.has(`${t.releve_id}:${t.transaction_idx}`) &&
        !classifiedTxKeys.has(`${t.releve_id}:${t.transaction_idx}`)
    )
    const unmatchedFactures = matchingFactures.filter(
      (f) => !matchedFactureIds.has(f.id)
    )

    const semResult = await runSemanticRapprochement({
      orphanTransactions,
      unmatchedFactures,
      context: {
        societe_nom: societe.nom as string,
        societe_id: societe.id as string,
        devise_principale: (societe.devise_principale as string) || "MUR",
        comptes_bancaires: (comptes || []).map((c: any) => ({
          id: c.id,
          devise: c.devise,
          compte_comptable: c.compte_comptable,
          banque: c.banque,
        })),
        fx_rates: rates,
      },
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      minConfidence: min_confidence,
    })
    semantic = semResult
  }

  // 11. Persister au format Lexora (compatible avec le front /comptable/rapprochement) :
  //   - Match → statut "rapproche", facture_id (singulier), facture_ids (array),
  //             matched_type, lettre, rapproche_at
  //   - Classification → statut "non_identifie" + compte_comptable défini
  //                      (le front filtre déjà les tx avec compte_comptable de "non identifié")
  // Référence par tx : "<releve_id>:<idx>"
  type Patch = {
    statut?: string
    facture_id?: string
    facture_ids?: string[]
    matched_type?: string
    matched_strategy?: string
    matched_confidence?: number
    match_confidence?: string
    lettre?: string
    rapproche_at?: string
    rapprochement_multi?: boolean
    nb_factures?: number
    classification?: string
    classification_suggestion?: any
    compte_comptable?: string | null
    note?: string
  }
  const patchByTx = new Map<string, Patch>()

  // PCM par défaut pour les classifications natives du moteur intelligent
  const PCM_BY_CLASSIFICATION: Record<string, string> = {
    frais_bancaires: "6270",
    salaire_bulk: "4210",
    salaire_individuel: "4210",
    paiement_mra: "4330",
    virement_interne: "5811",
    transfert_interne: "5811",
    interets: "6611",
    agios: "6611",
    charges_sociales: "4310",
    remboursement_pret: "1641",
    reversal_salaire: "4210",
  }

  function genLettre(prefix: string, key: string) {
    return `${prefix}-${key.replace(/[:-]/g, "").slice(0, 18)}`
  }

  // Matches algorithmiques
  for (const m of result.matches) {
    if (m.confidence < min_confidence) continue
    const patch: Patch = {
      statut: "rapproche",
      facture_id: m.factureIds[0],
      facture_ids: m.factureIds,
      matched_type: m.strategy,
      matched_strategy: m.strategy,
      matched_confidence: m.confidence,
      match_confidence: `agent_${Math.round(m.confidence * 100)}`,
      lettre: genLettre("agent", m.transactionKey),
      rapproche_at: new Date().toISOString(),
      note: "Rapprochement automatique (agent)",
    }
    if (m.factureIds.length > 1) {
      patch.rapprochement_multi = true
      patch.nb_factures = m.factureIds.length
    }
    patchByTx.set(m.transactionKey, patch)
  }

  // Classifications algorithmiques
  for (const c of result.classifications) {
    if (c.confidence < min_confidence) continue
    if (patchByTx.has(c.transactionKey)) continue // un match prévaut sur une classif
    const pcm = PCM_BY_CLASSIFICATION[c.type] || null
    patchByTx.set(c.transactionKey, {
      statut: "non_identifie",
      compte_comptable: pcm,
      classification: c.type,
      matched_strategy: "classification_agent",
      classification_suggestion: {
        type: c.type,
        note: c.note,
        ecritureId: c.ecritureId,
        confidence: c.confidence,
      },
      note: c.note || `Classification automatique (${c.type})`,
    })
  }

  // Matches Claude (uniquement si l'algo n'a pas déjà décidé pour cette tx)
  for (const m of semantic.matches) {
    if (patchByTx.has(m.transactionKey)) continue
    if (m.confidence < min_confidence) continue
    patchByTx.set(m.transactionKey, {
      statut: "rapproche",
      facture_id: m.factureIds[0],
      facture_ids: m.factureIds,
      matched_type: "claude_semantic",
      matched_strategy: "claude_semantic",
      matched_confidence: m.confidence,
      match_confidence: `ai_${Math.round(m.confidence * 100)}`,
      lettre: genLettre("ai", m.transactionKey),
      rapproche_at: new Date().toISOString(),
      rapprochement_multi: m.factureIds.length > 1,
      nb_factures: m.factureIds.length,
      note: `Rapprochement IA Claude — ${m.reasoning}`.slice(0, 200),
    })
  }

  // Classifications Claude
  for (const c of semantic.classifications) {
    if (patchByTx.has(c.transactionKey)) continue
    if (c.confidence < min_confidence) continue
    const pcm = c.compte_pcm || PCM_BY_CLASSIFICATION[c.type] || null
    patchByTx.set(c.transactionKey, {
      statut: "non_identifie",
      compte_comptable: pcm,
      classification: c.type,
      matched_strategy: "claude_semantic",
      classification_suggestion: {
        type: c.type,
        note: c.reasoning,
        compte_pcm: pcm,
        confidence: c.confidence,
        source: "claude_semantic",
      },
      note: `Classification IA Claude — ${c.reasoning}`.slice(0, 200),
    })
  }

  // 12. Apply patches per relevé
  let releves_modifies = 0
  let transactions_modifiees = 0
  if (!dry_run && patchByTx.size > 0) {
    const byReleve = new Map<string, ReleveRow>()
    for (const r of releves) byReleve.set(r.id, r)
    const updates: Array<{ id: string; transactions_json: any[]; nb: number }> = []

    for (const r of releves) {
      const arr = Array.isArray(r.transactions_json) ? [...r.transactions_json] : []
      let touched = 0
      for (let i = 0; i < arr.length; i++) {
        const key = `${r.id}:${i}`
        const patch = patchByTx.get(key)
        if (!patch) continue
        const original = arr[i] || {}
        arr[i] = { ...original, ...patch }
        touched++
      }
      if (touched > 0) {
        updates.push({ id: r.id, transactions_json: arr, nb: touched })
      }
    }

    for (const u of updates) {
      const { error } = await sb
        .from("releves_bancaires")
        .update({ transactions_json: u.transactions_json })
        .eq("id", u.id)
      if (error) {
        return NextResponse.json(
          { error: `Echec UPDATE releve ${u.id}: ${error.message}` },
          { status: 500 }
        )
      }
      releves_modifies++
      transactions_modifiees += u.nb
    }
  }

  // Calcule la couverture date réelle des relevés chargés
  const allDates = (releves || []).flatMap((r) => [r.date_debut, r.date_fin]).filter(Boolean)
  const coverage = {
    earliest: allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : null,
    latest: allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : null,
  }

  return NextResponse.json({
    ok: true,
    societe_id,
    period: { date_debut, date_fin },
    inputs: {
      releves_charges: (releves || []).length,
      transactions_a_traiter: matchingTx.length,
      factures_impayees: matchingFactures.length,
      ecritures_non_lettrees: ecritures.length,
      bulletins_paie: bulletins.length,
      coverage,
    },
    stats: {
      ...result.stats,
      semantic_matches: semantic.matches.length,
      semantic_classifications: semantic.classifications.length,
    },
    semantic: {
      meta: semantic.meta,
      matches: semantic.matches.map((m) => ({
        transactionKey: m.transactionKey,
        factureIds: m.factureIds,
        confidence: m.confidence,
        reasoning: m.reasoning,
      })),
      classifications: semantic.classifications.map((c) => ({
        transactionKey: c.transactionKey,
        type: c.type,
        compte_pcm: c.compte_pcm,
        confidence: c.confidence,
        reasoning: c.reasoning,
      })),
    },
    matches: result.matches.map((m) => ({
      transactionKey: m.transactionKey,
      supplierName: m.supplierName,
      factureIds: m.factureIds,
      strategy: m.strategy,
      confidence: m.confidence,
      reasoning: m.reasoning,
      amountDiff: m.amountDiff,
      transaction: {
        date: m.transaction.date,
        libelle: m.transaction.libelle,
        debit: m.transaction.debit,
        credit: m.transaction.credit,
        devise: m.transaction.devise,
      },
    })),
    classifications: result.classifications.map((c) => ({
      transactionKey: c.transactionKey,
      type: c.type,
      note: c.note,
      confidence: c.confidence,
    })),
    fx_rates_used: rates,
    writes: { dry_run, releves_modifies, transactions_modifiees, min_confidence },
  })
}
