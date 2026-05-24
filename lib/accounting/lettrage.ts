/**
 * Lettrage des comptes tiers 411x/401x.
 *
 * Stratégies cumulatives :
 *
 *   A) par facture_id (préférée, fiable) — toutes les écritures 4[01]1x
 *      partageant un même facture_id forment un groupe ; on lettre dès
 *      que Σdebit ≈ Σcredit (±0.01).
 *
 *   B) backfill facture_id sur BNQ orphelins — pour les BNQ avec
 *      facture_id NULL mais ref_folio = "BANK-<rid>-<idx>", on tente
 *      de retrouver la facture liée via releves_bancaires.transactions_json
 *      (champs facture_ids / facture_id) et on patche v2.facture_id.
 *
 *   C) par (compte | libellé tiers normalisé) — fallback pour les
 *      écritures sans facture_id (legacy, manuelles).
 *
 * Idempotent : ne touche que les écritures non lettrées (lettre IS NULL).
 *
 * Utilisé par :
 *   - POST /api/agent/grand-livre  action=lettrer  (Lex Livre)
 *   - POST /api/comptable/rapprochement/smart/apply (en fin de flux,
 *     pour finaliser le lettrage des BNQ qui viennent d'être créées)
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export interface LettragePairing {
  lettre: string
  ecriture_ids: string[]
  total_debit: number
  total_credit: number
  via: "facture_id" | "libelle"
}

export interface LettrageResult {
  pairs_created: number
  pairs_via_facture_id: number
  pairs_via_libelle: number
  bnq_facture_id_backfilled: number
  ecritures_lettrees: number
  errors: string[]
  sample: LettragePairing[]
}

function normalizeTiers(libelle: string | null): string {
  if (!libelle) return ""
  return libelle
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join(" ")
}

function genLettreCode(): string {
  const a = String.fromCharCode(65 + Math.floor(Math.random() * 26))
  const b = String.fromCharCode(65 + Math.floor(Math.random() * 26))
  const c = String.fromCharCode(65 + Math.floor(Math.random() * 26))
  const n = Math.floor(Math.random() * 1000).toString().padStart(3, "0")
  return `${a}${b}${c}${n}`
}

export async function runLettrage(
  sb: SupabaseClient,
  societe_id: string
): Promise<LettrageResult> {
  const { data: ecritures, error } = await sb
    .from("ecritures_comptables_v2")
    .select(
      "id, date_ecriture, numero_compte, libelle, debit_mur, credit_mur, lettre, ref_folio, facture_id, journal"
    )
    .eq("societe_id", societe_id)
    .is("lettre", null)
    .or("numero_compte.like.411%,numero_compte.like.401%")
    .limit(20000)
  if (error) throw new Error(error.message)

  type Ecr = {
    id: string
    date: string
    compte: string
    libelle: string
    debit: number
    credit: number
    facture_id: string | null
    ref_folio: string | null
    journal: string | null
  }
  const all: Ecr[] = (ecritures || []).map((e: any) => ({
    id: e.id,
    date: e.date_ecriture || "",
    compte: e.numero_compte || "",
    libelle: e.libelle || "",
    debit: Number(e.debit_mur) || 0,
    credit: Number(e.credit_mur) || 0,
    facture_id: e.facture_id || null,
    ref_folio: e.ref_folio || null,
    journal: e.journal || null,
  }))

  // ── Stratégie B — backfill facture_id sur BNQ orphelins ──────────
  let backfilled = 0
  const bnqOrphans = all.filter(
    (e) =>
      !e.facture_id &&
      e.journal === "BNQ" &&
      typeof e.ref_folio === "string" &&
      /^BANK-[\w-]+-\d+$/.test(e.ref_folio)
  )
  if (bnqOrphans.length > 0) {
    const { data: releves } = await sb
      .from("releves_bancaires")
      .select("id, transactions_json")
      .eq("societe_id", societe_id)
      .is("superseded_by_id", null)
      .limit(500)
    const txIndex = new Map<string, string[]>()
    for (const r of releves || []) {
      const txs = Array.isArray(r.transactions_json) ? r.transactions_json : []
      txs.forEach((tx: any, idx: number) => {
        const key = `BANK-${r.id}-${idx}`
        const ids: string[] = Array.isArray(tx?.facture_ids)
          ? tx.facture_ids
          : tx?.facture_id
            ? [tx.facture_id]
            : []
        if (ids.length > 0) txIndex.set(key, ids)
      })
    }
    for (const e of bnqOrphans) {
      const ids = txIndex.get(e.ref_folio || "")
      if (!ids || ids.length !== 1) continue
      const fid = ids[0]
      const { error: upErr } = await sb
        .from("ecritures_comptables_v2")
        .update({ facture_id: fid })
        .eq("id", e.id)
      if (!upErr) {
        e.facture_id = fid
        backfilled++
      }
    }
  }

  const pairings: LettragePairing[] = []
  const lettreesIds = new Set<string>()

  // ── Stratégie A — group by facture_id ─────────────────────────────
  const byFacture = new Map<string, Ecr[]>()
  for (const e of all) {
    if (!e.facture_id) continue
    const arr = byFacture.get(e.facture_id) || []
    arr.push(e)
    byFacture.set(e.facture_id, arr)
  }
  for (const [, arr] of byFacture) {
    if (arr.length < 2) continue
    const sumD = arr.reduce((s, e) => s + e.debit, 0)
    const sumC = arr.reduce((s, e) => s + e.credit, 0)
    if (Math.abs(sumD - sumC) >= 0.01) continue
    const lettre = genLettreCode()
    for (const e of arr) lettreesIds.add(e.id)
    pairings.push({
      lettre,
      ecriture_ids: arr.map((e) => e.id),
      total_debit: Math.round(sumD * 100) / 100,
      total_credit: Math.round(sumC * 100) / 100,
      via: "facture_id",
    })
  }

  // ── Stratégie C — fallback par (compte | libellé normalisé) ─────
  const remaining = all.filter((e) => !lettreesIds.has(e.id))
  const byCompteTiers = new Map<string, Ecr[]>()
  for (const e of remaining) {
    const tiers = normalizeTiers(e.libelle)
    if (!tiers) continue
    const key = `${e.compte}|${tiers}`
    const arr = byCompteTiers.get(key) || []
    arr.push(e)
    byCompteTiers.set(key, arr)
  }
  for (const [, arr] of byCompteTiers) {
    if (arr.length < 2) continue
    const debits = arr.filter((e) => e.debit > 0)
    const credits = arr.filter((e) => e.credit > 0)
    if (debits.length === 0 || credits.length === 0) continue
    const usedIds = new Set<string>()

    for (const d of debits) {
      if (usedIds.has(d.id)) continue
      const match = credits.find(
        (c) => !usedIds.has(c.id) && Math.abs(c.credit - d.debit) < 0.01
      )
      if (match) {
        const lettre = genLettreCode()
        usedIds.add(d.id)
        usedIds.add(match.id)
        pairings.push({
          lettre,
          ecriture_ids: [d.id, match.id],
          total_debit: d.debit,
          total_credit: match.credit,
          via: "libelle",
        })
      }
    }

    for (const d of debits) {
      if (usedIds.has(d.id)) continue
      const available = credits.filter((c) => !usedIds.has(c.id))
      if (available.length < 2) continue
      const sorted = [...available].sort((a, b) => b.credit - a.credit)
      const combo: Ecr[] = []
      let sum = 0
      for (const c of sorted) {
        if (sum + c.credit > d.debit + 0.01) continue
        combo.push(c)
        sum += c.credit
        if (Math.abs(sum - d.debit) < 0.01) break
      }
      if (combo.length >= 2 && Math.abs(sum - d.debit) < 0.01) {
        const lettre = genLettreCode()
        usedIds.add(d.id)
        for (const c of combo) usedIds.add(c.id)
        pairings.push({
          lettre,
          ecriture_ids: [d.id, ...combo.map((c) => c.id)],
          total_debit: d.debit,
          total_credit: sum,
          via: "libelle",
        })
      }
    }
  }

  // ── Persist ─────────────────────────────────────────────────────────
  let updated = 0
  const errors: string[] = []
  const now = new Date().toISOString()
  for (const p of pairings) {
    const { error: upErr } = await sb
      .from("ecritures_comptables_v2")
      .update({ lettre: p.lettre, date_lettrage: now })
      .in("id", p.ecriture_ids)
    if (upErr) {
      errors.push(`lettre ${p.lettre} : ${upErr.message}`)
    } else {
      updated += p.ecriture_ids.length
    }
  }

  return {
    pairs_created: pairings.length,
    pairs_via_facture_id: pairings.filter((p) => p.via === "facture_id").length,
    pairs_via_libelle: pairings.filter((p) => p.via === "libelle").length,
    bnq_facture_id_backfilled: backfilled,
    ecritures_lettrees: updated,
    errors: errors.slice(0, 10),
    sample: pairings.slice(0, 10),
  }
}
