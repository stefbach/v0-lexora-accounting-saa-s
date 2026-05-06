/**
 * POST /api/agent/grand-livre
 *
 * "Lex Livre" — agent comptable Grand Livre. Deux modes selon `action` :
 *
 * - action="audit" (default) : audite le Grand Livre — R1, comptes hors PCM,
 *   tiers anciens non lettrés, compte 5811, doublons, écritures sans ref.
 *
 * - action="lettrer" : passe lettreur sur les comptes 411x/401x — pour
 *   chaque compte, regroupe les écritures par tiers (libellé normalisé),
 *   apparie débits et crédits qui s'équilibrent (montant ±0.01) et leur
 *   assigne une même lettre. Insère les liens dans la colonne `lettre` +
 *   `date_lettrage`. Idempotent (re-cours uniquement les non lettrées).
 *
 * Auth : bearer LEXORA_AGENT_SECRET OU session navigateur (avec accès société)
 * Body : { societe_id: string, action?: "audit" | "lettrer", exercice?: string }
 */
import { NextResponse } from "next/server"
import { authenticateAgentRequest } from "@/lib/agent-auth"
import { getAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const AGENT_NAME = "Lex Livre"

function normalizeTiers(libelle: string | null): string {
  if (!libelle) return ""
  return libelle
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 5) // 5 premiers mots du libellé pour normalisation tiers
    .join(" ")
}

function genLettreCode(): string {
  // Lettre courte type AAA-NNN (3 lettres + 3 chiffres) — plus lisible que UUID
  const a = String.fromCharCode(65 + Math.floor(Math.random() * 26))
  const b = String.fromCharCode(65 + Math.floor(Math.random() * 26))
  const c = String.fromCharCode(65 + Math.floor(Math.random() * 26))
  const n = Math.floor(Math.random() * 1000).toString().padStart(3, "0")
  return `${a}${b}${c}${n}`
}

export async function POST(request: Request) {
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
  const auth = await authenticateAgentRequest(request, societe_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const action: "audit" | "lettrer" = body?.action === "lettrer" ? "lettrer" : "audit"

  if (action === "lettrer") {
    return handleLettrage(societe_id)
  }
  return handleAudit(societe_id, body)
}

// ── ACTION : LETTRAGE TIERS ──────────────────────────────────────────
// Apparie débits et crédits sur les comptes 411x/401x quand le tiers
// (libellé normalisé) est identique et que les montants s'équilibrent.
async function handleLettrage(societe_id: string) {
  const sb = getAdminClient()
  const { data: ecritures, error } = await sb
    .from("ecritures_comptables_v2")
    .select("id, date_ecriture, numero_compte, libelle, debit_mur, credit_mur, lettre, ref_folio")
    .eq("societe_id", societe_id)
    .is("lettre", null)
    .or("numero_compte.like.411%,numero_compte.like.401%")
    .limit(5000)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group par (compte, tiers normalisé)
  type Ecr = {
    id: string
    date: string
    compte: string
    libelle: string
    debit: number
    credit: number
  }
  const groups = new Map<string, Ecr[]>()
  for (const e of ecritures || []) {
    const compte = e.numero_compte || ""
    const tiers = normalizeTiers(e.libelle || "")
    if (!tiers) continue // sans tiers identifiable, on ne lettre pas
    const key = `${compte}|${tiers}`
    const arr = groups.get(key) || []
    arr.push({
      id: e.id,
      date: e.date_ecriture || "",
      compte,
      libelle: e.libelle || "",
      debit: Number(e.debit_mur) || 0,
      credit: Number(e.credit_mur) || 0,
    })
    groups.set(key, arr)
  }

  // Pour chaque groupe, tente d'apparier les débits avec les crédits qui
  // s'annulent (sum debits ≈ sum credits ±0.01). On commence par les paires
  // exactes (1 débit = 1 crédit même montant), puis on tente le multi.
  type Pairing = { lettre: string; ecriture_ids: string[]; total_debit: number; total_credit: number }
  const newPairings: Pairing[] = []

  for (const [key, arr] of groups) {
    if (arr.length < 2) continue
    const debits = arr.filter((e) => e.debit > 0)
    const credits = arr.filter((e) => e.credit > 0)
    if (debits.length === 0 || credits.length === 0) continue

    const usedIds = new Set<string>()

    // Étape 1 : paires exactes (1 débit = 1 crédit même montant)
    for (const d of debits) {
      if (usedIds.has(d.id)) continue
      const match = credits.find((c) => !usedIds.has(c.id) && Math.abs(c.credit - d.debit) < 0.01)
      if (match) {
        const lettre = genLettreCode()
        usedIds.add(d.id)
        usedIds.add(match.id)
        newPairings.push({
          lettre,
          ecriture_ids: [d.id, match.id],
          total_debit: d.debit,
          total_credit: match.credit,
        })
      }
    }

    // Étape 2 : 1 débit groupé = N crédits (acomptes) — somme des crédits
    // disponibles ≈ débit
    for (const d of debits) {
      if (usedIds.has(d.id)) continue
      const available = credits.filter((c) => !usedIds.has(c.id))
      if (available.length < 2) continue
      // Greedy : trier par montant desc et accumuler jusqu'à atteindre d.debit
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
        newPairings.push({
          lettre,
          ecriture_ids: [d.id, ...combo.map((c) => c.id)],
          total_debit: d.debit,
          total_credit: sum,
        })
      }
    }
  }

  // Persist : update lettre + date_lettrage en batch
  let updated = 0
  const errors: string[] = []
  const now = new Date().toISOString()
  for (const p of newPairings) {
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

  return NextResponse.json({
    ok: true,
    agent: AGENT_NAME,
    action: "lettrer",
    societe_id,
    pairs_created: newPairings.length,
    ecritures_lettrees: updated,
    errors: errors.slice(0, 10),
    sample: newPairings.slice(0, 10),
  })
}

// ── ACTION : AUDIT ───────────────────────────────────────────────────
async function handleAudit(societe_id: string, body: any) {
  const exercice: string | null = body?.exercice || null
  const sb = getAdminClient()

  // Charge tout en parallèle
  const [
    { data: societe },
    { data: pcm },
    { data: ecritures },
  ] = await Promise.all([
    sb
      .from("societes")
      .select("id, nom, devise_principale, date_debut_exercice, date_fin_exercice")
      .eq("id", societe_id)
      .maybeSingle(),
    sb
      .from("plan_comptable")
      .select("compte, libelle, classe, type_compte, sens_normal")
      .or(`societe_id.eq.${societe_id},societe_id.is.null`)
      .eq("actif", true),
    sb
      .from("ecritures_comptables_v2")
      .select(
        "id, date_ecriture, journal, numero_compte, libelle, debit_mur, credit_mur, lettre, ref_folio, exercice"
      )
      .eq("societe_id", societe_id)
      .limit(20000),
  ])
  if (!societe) return NextResponse.json({ error: "société introuvable" }, { status: 404 })

  const allEcritures = (ecritures || []).filter((e: any) =>
    exercice ? e.exercice === exercice : true
  )

  // ── R1 : balance globale ───────────────────────────────────────
  const totalDebit = allEcritures.reduce((s, e) => s + (Number(e.debit_mur) || 0), 0)
  const totalCredit = allEcritures.reduce((s, e) => s + (Number(e.credit_mur) || 0), 0)
  const ecartBalance = Math.round((totalDebit - totalCredit) * 100) / 100

  // ── Ventilation par compte ─────────────────────────────────────
  const pcmSet = new Set((pcm || []).map((p: any) => p.compte))
  const pcmByCompte = new Map<string, any>()
  for (const p of pcm || []) pcmByCompte.set(p.compte, p)

  const byCompte = new Map<
    string,
    { numero: string; nb: number; debit: number; credit: number; non_lettre: number; classe: number | null }
  >()
  for (const e of allEcritures) {
    const num = e.numero_compte || "?"
    const slot = byCompte.get(num) || {
      numero: num,
      nb: 0,
      debit: 0,
      credit: 0,
      non_lettre: 0,
      classe: parseInt(num[0]) || null,
    }
    slot.nb++
    slot.debit += Number(e.debit_mur) || 0
    slot.credit += Number(e.credit_mur) || 0
    if (!e.lettre) slot.non_lettre++
    byCompte.set(num, slot)
  }

  // Comptes utilisés mais ABSENTS du PCM
  const comptesHorsPcm = Array.from(byCompte.keys())
    .filter((c) => c !== "?" && !pcmSet.has(c))
    .map((c) => byCompte.get(c)!)
    .sort((a, b) => b.nb - a.nb)

  // ── Anomalie : 411x/401x non lettrés > 90 jours ────────────────
  const ninety = Date.now() - 90 * 86400000
  const tiersNonLettresVieux = allEcritures
    .filter((e: any) => {
      if (e.lettre) return false
      const num = (e.numero_compte || "").toString()
      if (!num.startsWith("411") && !num.startsWith("401")) return false
      if (!e.date_ecriture) return false
      return new Date(e.date_ecriture).getTime() < ninety
    })
    .map((e: any) => ({
      id: e.id,
      date: e.date_ecriture,
      compte: e.numero_compte,
      libelle: e.libelle,
      debit: Number(e.debit_mur) || 0,
      credit: Number(e.credit_mur) || 0,
      ref_folio: e.ref_folio,
    }))

  // ── Compte 5811 (virements internes) doit être soldé ────────────
  const compte5811 = byCompte.get("5811") || byCompte.get("580")
  const solde5811 = compte5811 ? compte5811.debit - compte5811.credit : 0

  // ── Écritures sans ref_folio (legacy) ───────────────────────────
  const ecrituresSansRef = allEcritures.filter((e: any) => !e.ref_folio).length

  // ── Doublons potentiels (date + montant + libellé) ──────────────
  const doublonsMap = new Map<string, number>()
  for (const e of allEcritures) {
    const key = `${e.date_ecriture}|${(Number(e.debit_mur) || 0).toFixed(2)}|${(Number(e.credit_mur) || 0).toFixed(2)}|${(e.libelle || "").slice(0, 50)}|${e.numero_compte}`
    doublonsMap.set(key, (doublonsMap.get(key) || 0) + 1)
  }
  const doublonsCount = Array.from(doublonsMap.values()).filter((n) => n > 1).length

  // ── Classes manquantes (peu probable mais utile) ────────────────
  const classesUtilisees = new Set<number>()
  for (const c of byCompte.values()) if (c.classe) classesUtilisees.add(c.classe)

  // ── Score global ────────────────────────────────────────────────
  const issues: Array<{ severity: "critical" | "warning" | "info"; code: string; message: string; count?: number }> = []
  if (Math.abs(ecartBalance) > 0.01) {
    issues.push({
      severity: "critical",
      code: "R1_BALANCE",
      message: `Grand Livre déséquilibré : écart ${ecartBalance.toFixed(2)} MUR (D ${totalDebit.toFixed(0)} - C ${totalCredit.toFixed(0)})`,
    })
  }
  if (comptesHorsPcm.length > 0) {
    issues.push({
      severity: "warning",
      code: "PCM_UNKNOWN",
      message: `${comptesHorsPcm.length} compte(s) utilisés mais absents du plan comptable mauricien`,
      count: comptesHorsPcm.length,
    })
  }
  if (tiersNonLettresVieux.length > 0) {
    issues.push({
      severity: "warning",
      code: "TIERS_OLD",
      message: `${tiersNonLettresVieux.length} écriture(s) 411x/401x non lettrées de plus de 90 jours`,
      count: tiersNonLettresVieux.length,
    })
  }
  if (Math.abs(solde5811) > 0.01) {
    issues.push({
      severity: "warning",
      code: "VIREMENTS_580",
      message: `Compte 5811 (virements internes) non soldé : ${solde5811.toFixed(2)} MUR — devrait être à 0 en fin d'exercice`,
    })
  }
  if (ecrituresSansRef > 0) {
    issues.push({
      severity: "info",
      code: "NO_REF_FOLIO",
      message: `${ecrituresSansRef} écriture(s) sans ref_folio (legacy ou orphelines — non bloquant)`,
      count: ecrituresSansRef,
    })
  }
  if (doublonsCount > 0) {
    issues.push({
      severity: "warning",
      code: "DUPLICATES",
      message: `${doublonsCount} doublon(s) potentiel(s) (même date + montant + libellé)`,
      count: doublonsCount,
    })
  }

  const critical = issues.filter((i) => i.severity === "critical").length
  const warnings = issues.filter((i) => i.severity === "warning").length
  const score = Math.max(0, 100 - critical * 50 - warnings * 10)

  // ── Résumé classes ─────────────────────────────────────────────
  const classes = [1, 2, 3, 4, 5, 6, 7].map((cl) => {
    const inClass = Array.from(byCompte.values()).filter((c) => c.classe === cl)
    return {
      classe: cl,
      label:
        cl === 1
          ? "Capitaux"
          : cl === 2
            ? "Immobilisations"
            : cl === 3
              ? "Stocks"
              : cl === 4
                ? "Tiers"
                : cl === 5
                  ? "Trésorerie"
                  : cl === 6
                    ? "Charges"
                    : "Produits",
      nb_comptes_utilises: inClass.length,
      nb_comptes_pcm: (pcm || []).filter((p: any) => p.classe === cl).length,
      total_debit: Math.round(inClass.reduce((s, c) => s + c.debit, 0) * 100) / 100,
      total_credit: Math.round(inClass.reduce((s, c) => s + c.credit, 0) * 100) / 100,
    }
  })

  return NextResponse.json({
    ok: true,
    agent: AGENT_NAME,
    audited_at: new Date().toISOString(),
    societe: { id: societe.id, nom: societe.nom },
    score,
    severity: critical > 0 ? "critical" : warnings > 0 ? "warning" : "ok",
    summary: {
      total_ecritures: allEcritures.length,
      total_debit: Math.round(totalDebit * 100) / 100,
      total_credit: Math.round(totalCredit * 100) / 100,
      ecart_balance: ecartBalance,
      comptes_utilises: byCompte.size,
      comptes_pcm_total: pcm?.length || 0,
    },
    issues,
    classes,
    comptes_hors_pcm: comptesHorsPcm.slice(0, 30),
    tiers_non_lettres_vieux: tiersNonLettresVieux.slice(0, 30),
    doublons_count: doublonsCount,
    ecritures_sans_ref: ecrituresSansRef,
  })
}
