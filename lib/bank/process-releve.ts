/**
 * Lexora — Bank statement persistence helper for the OCR process pipeline.
 *
 * Goal: given a parsed Claude extraction that we have classified as
 *       `releve_bancaire`, persist it into `releves_bancaires` (+ create or
 *       update the matching `comptes_bancaires` row) so that the rapprochement
 *       workflow can pick it up.
 *
 * Why a separate helper (vs reusing the upload route inline logic)?
 *  - The upload route at app/api/documents/upload/route.ts has ~500 lines of
 *    bank-statement-specific guards (F1-F7, currency validation with
 *    user-blocking, alerts, etc). Lifting that wholesale would balloon this
 *    helper and tie us to its return semantics (NextResponse with 400/etc).
 *  - The new entry point is the process pipeline used by the Telegram bot.
 *    There we want best-effort: extract what we can, log the rest, never
 *    block the worker. Soft failures here are acceptable — the upload route
 *    keeps its strict path for the web UI.
 *
 * Source of truth for rapprochement:
 *    `releves_bancaires.transactions_json` (JSONB array) — that's what the
 *    rapprochement engine reads (see app/api/agent/rapprochement/route.ts,
 *    app/api/comptable/rapprochement/*).
 *
 *    On insère AUSSI une ligne par transaction dans `transactions_bancaires`
 *    pour permettre la recherche libre depuis le bot Telegram
 *    (`/api/telegram/internal/db-search` filtre par `libelle` ILIKE). Best
 *    effort — l'insert peut échouer sans bloquer la création du relevé.
 */

import { getCompteComptable } from "@/lib/accounting/comptes-bancaires"
import { isBankName } from "@/lib/utils/bank-utils"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ReleveExtraction {
  banque?: string | null
  nom_societe?: string | null
  titulaire?: string | null
  brn?: string | null
  iban?: string | null
  numero_compte?: string | null
  compte_bancaire?: string | null
  devise?: string | null
  periode?: string | null
  periode_debut?: string | null
  periode_fin?: string | null
  date_debut?: string | null
  date_fin?: string | null
  solde_ouverture?: number | string | null
  solde_cloture?: number | string | null
  solde_debut?: number | string | null
  solde_fin?: number | string | null
  total_debits?: number | string | null
  total_credits?: number | string | null
  // Two possible shapes — Claude OCR is allowed to use either. We normalise both.
  transactions?: Array<{
    date?: string
    libelle?: string
    debit?: number | string
    credit?: number | string
    reference?: string
    solde_apres?: number | string | null
    tiers_detecte?: string
  }>
  lignes?: Array<{
    date?: string
    libelle?: string
    debit?: number | string
    credit?: number | string
    montant?: number | string
    sens?: "debit" | "credit"
    solde_apres?: number | string | null
    tiers_detecte?: string
    confiance?: number
  }>
}

export type ProcessReleveResult =
  | {
      ok: true
      releve_id: string
      compte_bancaire_id: string
      nb_transactions: number
      created_account: boolean
    }
  | {
      ok: false
      reason: string
      skipped?: boolean // true = soft skip (no compte_bancaire match, etc.)
    }

interface ProcessReleveParams {
  supabase: any // service-role client
  documentId: string
  dossierId: string
  societeId: string
  nomFichier: string
  extraction: ReleveExtraction
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Tolerant number parser. Returns 0 on null/empty/garbage (does NOT throw,
 *  unlike `lib/utils/bank-amount.ts#parseAmount`).
 *  Rationale: the Telegram pipeline must not 500 on a slightly malformed
 *  number — the upload route already has the strict path with F4/F5 guards. */
function toNumberSoft(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0
  if (raw === null || raw === undefined) return 0
  const s = String(raw).trim()
  if (!s) return 0
  // Strip spaces and accounting parens
  let negative = false
  let working = s
  const paren = /^\((.+)\)$/.exec(working)
  if (paren) {
    negative = true
    working = paren[1]
  }
  if (working.startsWith("-")) {
    negative = !negative
    working = working.slice(1)
  }
  // Remove currency symbols / spaces / letters
  working = working.replace(/[^\d.,]/g, "")
  // Detect decimal: last . or , wins
  const lastDot = working.lastIndexOf(".")
  const lastComma = working.lastIndexOf(",")
  let decimalSep = ""
  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? "." : ","
  } else if (lastDot >= 0) {
    // Only dot present — ambiguous (could be thousands). Heuristic: if exactly
    // 3 digits after the dot AND no other separators → thousands.
    const afterDot = working.length - lastDot - 1
    decimalSep = afterDot === 3 && working.length > 4 ? "" : "."
  } else if (lastComma >= 0) {
    const afterComma = working.length - lastComma - 1
    decimalSep = afterComma === 3 && working.length > 4 ? "" : ","
  }
  if (decimalSep) {
    const parts = working.split(decimalSep)
    const dec = parts.pop() || ""
    const intPart = parts.join("").replace(/[.,\s]/g, "")
    working = `${intPart}.${dec}`
  } else {
    working = working.replace(/[.,\s]/g, "")
  }
  const n = Number(working)
  if (!Number.isFinite(n)) return 0
  return negative ? -n : n
}

/** YYYY-MM → last day of month. */
function lastDayOfMonth(yyyymm: string): string {
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) return yyyymm
  const [y, m] = yyyymm.split("-").map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${yyyymm}-${String(last).padStart(2, "0")}`
}

/** Best-effort YYYY-MM-DD coercion. */
function normalizeDate(raw: any): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  let m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0]
  return null
}

/** Soft currency normaliser. Only returns known ISO-4217 codes used in the app. */
function normalizeCurrency(raw: any, fallback = "MUR"): string {
  if (!raw) return fallback
  const s = String(raw).trim().toUpperCase().replace(/[^A-Z]/g, "")
  const known = ["MUR", "EUR", "USD", "GBP", "ZAR", "INR", "CNY", "JPY", "AUD", "CAD", "CHF"]
  if (known.includes(s)) return s
  // IBAN suffix heuristic — only if exactly 3 letters and in whitelist
  if (s.length === 3 && known.includes(s)) return s
  return fallback
}

// -----------------------------------------------------------------------------
// Main entrypoint
// -----------------------------------------------------------------------------

export async function processReleveBancaire(
  params: ProcessReleveParams,
): Promise<ProcessReleveResult> {
  const { supabase, documentId, societeId, extraction } = params

  // -- Idempotence guard ----------------------------------------------------
  // Only one releve per document, ever. If we already have a row → skip.
  const { data: existing } = await supabase
    .from("releves_bancaires")
    .select("id, compte_bancaire_id")
    .eq("document_id", documentId)
    .maybeSingle()
  if (existing) {
    return {
      ok: true,
      releve_id: existing.id,
      compte_bancaire_id: existing.compte_bancaire_id,
      nb_transactions: 0,
      created_account: false,
    }
  }

  // -- Normalise transactions (support both {transactions[]} and {lignes[]}) ---
  const rawTx = Array.isArray(extraction.transactions) ? extraction.transactions : []
  const rawLignes = Array.isArray(extraction.lignes) ? extraction.lignes : []

  const lignesAsTx = rawLignes.map((l) => {
    let debit = toNumberSoft(l.debit)
    let credit = toNumberSoft(l.credit)
    if (debit === 0 && credit === 0 && l.montant !== undefined && l.montant !== null) {
      const m = toNumberSoft(l.montant)
      if (l.sens === "debit") debit = m
      else credit = m
    }
    return {
      date: l.date || "",
      libelle: l.libelle || "",
      debit,
      credit,
      solde_apres: l.solde_apres ?? null,
      tiers_detecte: l.tiers_detecte || null,
      statut:
        (l.confiance || 0) >= 70
          ? "identifie"
          : (l.confiance || 0) >= 40
            ? "a_verifier"
            : "non_identifie",
    }
  })

  const normalized =
    rawTx.length > 0
      ? rawTx.map((t) => ({
          date: t.date || "",
          libelle: t.libelle || "",
          debit: toNumberSoft(t.debit),
          credit: toNumberSoft(t.credit),
          reference: t.reference || null,
          solde_apres: t.solde_apres ?? null,
          tiers_detecte: t.tiers_detecte || null,
        }))
      : lignesAsTx

  if (normalized.length === 0) {
    return { ok: false, reason: "no_transactions_extracted", skipped: true }
  }

  // -- Resolve dates ---------------------------------------------------------
  const periodeRaw = extraction.periode || null
  let periodeFin =
    normalizeDate(extraction.periode_fin) ||
    normalizeDate(extraction.date_fin) ||
    null
  let periodeDebut =
    normalizeDate(extraction.periode_debut) ||
    normalizeDate(extraction.date_debut) ||
    null

  if (!periodeFin && periodeRaw && /^\d{4}-\d{2}$/.test(periodeRaw)) {
    periodeFin = lastDayOfMonth(periodeRaw)
  }
  if (!periodeDebut && periodeRaw && /^\d{4}-\d{2}$/.test(periodeRaw)) {
    periodeDebut = `${periodeRaw}-01`
  }
  if (!periodeDebut) periodeDebut = periodeFin
  // Last resort: derive from the transaction dates.
  if (!periodeFin || !periodeDebut) {
    const txDates = normalized
      .map((t) => normalizeDate(t.date))
      .filter((d): d is string => !!d)
      .sort()
    if (txDates.length > 0) {
      if (!periodeDebut) periodeDebut = txDates[0]
      if (!periodeFin) periodeFin = txDates[txDates.length - 1]
    }
  }
  if (!periodeFin || !periodeDebut) {
    return { ok: false, reason: "no_valid_period_dates", skipped: true }
  }

  // -- Resolve bank account --------------------------------------------------
  const ibanCurrencySuffix = extraction.iban?.match(/[A-Z]{3}$/)?.[0] || null
  const bankDevise = normalizeCurrency(extraction.devise || ibanCurrencySuffix)
  const rawBankName = extraction.banque || extraction.compte_bancaire || null
  const bankName =
    rawBankName && typeof rawBankName === "string"
      ? rawBankName
      : null
  const iban = (extraction.iban || null) as string | null
  const numeroCompte = (extraction.numero_compte || extraction.compte_bancaire || null) as
    | string
    | null

  let bankAccount:
    | { id: string; societe_id: string; devise: string; numero_compte: string | null }
    | null = null

  // 1. IBAN scoped to société
  if (iban) {
    const { data } = await supabase
      .from("comptes_bancaires")
      .select("id, societe_id, devise, numero_compte")
      .eq("societe_id", societeId)
      .eq("iban", iban)
      .limit(1)
      .maybeSingle()
    if (data) bankAccount = data as any
  }
  // 2. Numero de compte scoped to société
  if (!bankAccount && numeroCompte) {
    const { data } = await supabase
      .from("comptes_bancaires")
      .select("id, societe_id, devise, numero_compte")
      .eq("societe_id", societeId)
      .eq("numero_compte", numeroCompte)
      .limit(1)
      .maybeSingle()
    if (data) bankAccount = data as any
  }
  // 3. Banque + devise (only if bank name looks legit)
  if (!bankAccount && bankName) {
    const { data } = await supabase
      .from("comptes_bancaires")
      .select("id, societe_id, devise, numero_compte")
      .eq("societe_id", societeId)
      .eq("banque", bankName)
      .eq("devise", bankDevise)
      .limit(1)
      .maybeSingle()
    if (data) bankAccount = data as any
  }
  // 4. Last-resort: any account of the société with matching devise (most recent).
  if (!bankAccount) {
    const { data } = await supabase
      .from("comptes_bancaires")
      .select("id, societe_id, devise, numero_compte")
      .eq("societe_id", societeId)
      .eq("devise", bankDevise)
      .order("date_dernier_releve", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    if (data) bankAccount = data as any
  }

  // -- Soft create a fallback account if still nothing -----------------------
  // We do this even for the Telegram path: otherwise relevés silently never
  // land anywhere. If the OCR didn't pick up a clean bank name we use a
  // descriptive placeholder; the comptable can rename it later from /client/banque.
  let createdAccount = false
  if (!bankAccount) {
    if (!bankName && !iban && !numeroCompte) {
      // Truly nothing to anchor on → soft skip (don't pollute with junk rows).
      return { ok: false, reason: "no_bank_identifier", skipped: true }
    }
    const finalBankName =
      (bankName && !isBankName(bankName) ? bankName : bankName) ||
      (iban ? `Banque (${iban.slice(0, 4)}…)` : null) ||
      "Banque non identifiée"
    const compteComptable = getCompteComptable(finalBankName, bankDevise)
    const { data: created, error: accErr } = await supabase
      .from("comptes_bancaires")
      .insert({
        societe_id: societeId,
        banque: finalBankName,
        nom_compte: numeroCompte || null,
        numero_compte: numeroCompte,
        iban,
        devise: bankDevise,
        compte_comptable: compteComptable,
        solde_actuel: toNumberSoft(extraction.solde_cloture ?? extraction.solde_fin),
        solde_dernier_releve: toNumberSoft(extraction.solde_cloture ?? extraction.solde_fin),
        date_dernier_releve: periodeFin,
        actif: true,
      })
      .select("id, societe_id, devise, numero_compte")
      .maybeSingle()
    if (accErr || !created) {
      return {
        ok: false,
        reason: `compte_bancaire_create_failed: ${accErr?.message || "unknown"}`,
      }
    }
    bankAccount = created as any
    createdAccount = true
  }

  // -- Totals & solde --------------------------------------------------------
  const totalDebits =
    toNumberSoft(extraction.total_debits) ||
    normalized.reduce((s, t) => s + toNumberSoft(t.debit), 0)
  const totalCredits =
    toNumberSoft(extraction.total_credits) ||
    normalized.reduce((s, t) => s + toNumberSoft(t.credit), 0)
  const soldeOuverture = toNumberSoft(
    extraction.solde_ouverture ?? extraction.solde_debut ?? 0,
  )
  const soldeCloture = toNumberSoft(
    extraction.solde_cloture ?? extraction.solde_fin ?? 0,
  )

  const ecartSolde = Math.abs(soldeOuverture + totalCredits - totalDebits - soldeCloture)
  const statut = ecartSolde > 1 ? "ecart_detecte" : "en_attente"

  // -- Insert releve ---------------------------------------------------------
  const { data: inserted, error: releveErr } = await supabase
    .from("releves_bancaires")
    .insert({
      compte_bancaire_id: bankAccount!.id,
      societe_id: societeId,
      periode: periodeFin.substring(0, 7),
      date_debut: periodeDebut,
      date_fin: periodeFin,
      solde_ouverture: soldeOuverture,
      solde_cloture: soldeCloture,
      total_debits: totalDebits,
      total_credits: totalCredits,
      document_id: documentId,
      transactions_json: normalized,
      statut_rapprochement: statut,
    })
    .select("id")
    .single()

  if (releveErr || !inserted) {
    return {
      ok: false,
      reason: `releve_insert_failed: ${releveErr?.message || "unknown"}`,
    }
  }

  // -- Best-effort: insert per-row into `transactions_bancaires` -------------
  // Schema cible (mig 010 + 014) : date_transaction / libelle_banque / debit /
  // credit / reference (cf supabase/migrations/010_financial_modules.sql).
  // Cette table sert à la recherche libre depuis le bot Telegram
  // (`/api/telegram/internal/db-search`). Elle n'est PAS lue par le moteur de
  // rapprochement (qui utilise `releves_bancaires.transactions_json`).
  // Soft-fail : si l'insert plante, on garde le relevé en place.
  try {
    const txRows = normalized
      .map((t) => {
        const dt = normalizeDate(t.date) || periodeFin
        const debit = Number(t.debit) || 0
        const credit = Number(t.credit) || 0
        // Skip transactions sans date valide ni montant — pollueraient le table.
        if (!dt || (debit === 0 && credit === 0)) return null
        return {
          releve_id: inserted.id,
          compte_bancaire_id: bankAccount!.id,
          societe_id: societeId,
          date_transaction: dt,
          libelle_banque: (t.libelle || "(sans libellé)").slice(0, 500),
          reference: ((t as any).reference || null) as string | null,
          debit,
          credit,
          tiers_identifie: (t.tiers_detecte || null) as string | null,
          statut_lettrage: "a_lettrer",
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
    if (txRows.length > 0) {
      const { error: txErr } = await supabase
        .from("transactions_bancaires")
        .insert(txRows)
      if (txErr) {
        console.warn(
          `[process-releve] transactions_bancaires insert failed (releve persisté quand même): ${txErr.message}`,
        )
      }
    }
  } catch (e: any) {
    console.warn(`[process-releve] transactions_bancaires bulk insert threw: ${e?.message}`)
  }

  // -- Best-effort: update compte_bancaire's solde_actuel / date_dernier_releve
  // (without overwriting if our date is older).
  try {
    const { data: existingAcc } = await supabase
      .from("comptes_bancaires")
      .select("date_dernier_releve")
      .eq("id", bankAccount!.id)
      .single()
    if (
      !existingAcc?.date_dernier_releve ||
      String(existingAcc.date_dernier_releve) <= periodeFin
    ) {
      await supabase
        .from("comptes_bancaires")
        .update({
          solde_actuel: soldeCloture,
          solde_dernier_releve: soldeCloture,
          date_dernier_releve: periodeFin,
        })
        .eq("id", bankAccount!.id)
    }
  } catch {
    // non-fatal
  }

  return {
    ok: true,
    releve_id: inserted.id,
    compte_bancaire_id: bankAccount!.id,
    nb_transactions: normalized.length,
    created_account: createdAccount,
  }
}
