/**
 * POST /api/agent/audit
 *
 * Audit lecture seule de l'état du rapprochement bancaire d'une société.
 * Conçu pour être appelé par un agent externe (n8n) avant et après un cycle
 * de rapprochement, pour mesurer la progression sans modifier la base.
 *
 * Auth : Bearer LEXORA_AGENT_SECRET
 * Body : { societe_id: string, date_debut?: string, date_fin?: string }
 */
import { NextResponse } from "next/server"
import { authenticateAgentRequest } from "@/lib/agent-auth"
import { getAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface AuditTx {
  releve_id: string
  transaction_idx: number
  date: string
  libelle: string
  debit: number
  credit: number
  devise: string | null
  statut: string | null
  facture_ids: string[] | null
  tiers_detecte: string | null
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
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const date_debut: string | null = body?.date_debut || null
  const date_fin: string | null = body?.date_fin || null

  const sb = getAdminClient()

  // Société + comptes
  const [{ data: societe }, { data: comptes }] = await Promise.all([
    sb
      .from("societes")
      .select("id, nom, devise_principale, devises_actives, pays")
      .eq("id", societe_id)
      .maybeSingle(),
    sb
      .from("comptes_bancaires")
      .select(
        "id, banque, nom_compte, numero_compte, devise, compte_comptable, solde_actuel, solde_dernier_releve, date_dernier_releve, actif"
      )
      .eq("societe_id", societe_id)
      .order("ordre_affichage", { ascending: true }),
  ])

  if (!societe) {
    return NextResponse.json({ error: "société introuvable" }, { status: 404 })
  }

  // Relevés sur la période
  let relQuery = sb
    .from("releves_bancaires")
    .select(
      "id, compte_bancaire_id, periode, date_debut, date_fin, solde_ouverture, solde_cloture, total_debits, total_credits, statut_rapprochement, transactions_json, nb_transactions"
    )
    .eq("societe_id", societe_id)
    .order("date_fin", { ascending: false })
  if (date_debut) relQuery = relQuery.gte("date_fin", date_debut)
  if (date_fin) relQuery = relQuery.lte("date_debut", date_fin)
  const { data: releves = [] } = await relQuery

  // Factures impayées + récentes
  let facQuery = sb
    .from("factures")
    .select(
      "id, numero_facture, tiers, type_facture, devise, montant_ttc, montant_mur, statut, date_facture, date_echeance, rapproche_releve_id"
    )
    .eq("societe_id", societe_id)
    .order("date_facture", { ascending: false })
  if (date_debut) facQuery = facQuery.gte("date_facture", date_debut)
  if (date_fin) facQuery = facQuery.lte("date_facture", date_fin)
  const { data: factures = [] } = await facQuery

  // Écritures non lettrées (compte 411x clients / 401x fournisseurs)
  const { data: ecrituresNonLettrees = [] } = await sb
    .from("ecritures_comptables_v2")
    .select(
      "id, date_ecriture, journal, numero_compte, libelle, debit_mur, credit_mur, devise_origine, montant_origine, ref_folio"
    )
    .eq("societe_id", societe_id)
    .is("lettre", null)
    .or("numero_compte.like.411%,numero_compte.like.401%")
    .order("date_ecriture", { ascending: false })
    .limit(500)

  // Métriques tx (parcours du JSONB — la colonne nb_transactions est stale,
  // on recompte toujours depuis le JSONB qui est la source de vérité).
  const allTx: AuditTx[] = []
  let txMatched = 0
  let txClassified = 0
  let txOrphan = 0
  for (const r of releves || []) {
    const arr: any[] = Array.isArray(r.transactions_json) ? r.transactions_json : []
    for (let i = 0; i < arr.length; i++) {
      const tx = arr[i]
      const fids: string[] = Array.isArray(tx.facture_ids) ? tx.facture_ids : []
      const cmp: string | null = tx.compte_comptable || null
      const cls: string | null = tx.classification || null
      const isMatched = fids.length > 0
      const isClassified = !isMatched && (!!cmp || !!cls)
      const isOrphan = !isMatched && !isClassified
      if (isMatched) txMatched++
      else if (isClassified) txClassified++
      if (isOrphan) txOrphan++
      allTx.push({
        releve_id: r.id,
        transaction_idx: i,
        date: tx.date,
        libelle: tx.libelle,
        debit: Number(tx.debit) || 0,
        credit: Number(tx.credit) || 0,
        devise: tx.devise || null,
        statut: tx.statut || null,
        facture_ids: fids,
        tiers_detecte: tx.tiers_detecte || null,
      })
    }
  }

  // Métriques factures
  const factByStatut: Record<string, number> = {}
  for (const f of factures || []) {
    factByStatut[f.statut || "?"] = (factByStatut[f.statut || "?"] || 0) + 1
  }
  const facturesImpayees = (factures || []).filter(
    (f: any) => f.statut !== "paye" && f.statut !== "annule"
  )

  // Comptes PCM utilisés (top distribution)
  const { data: pcmDistRaw } = await sb
    .from("ecritures_comptables_v2")
    .select("numero_compte, debit_mur, credit_mur")
    .eq("societe_id", societe_id)
    .limit(5000)
  const pcmDist: Record<string, { debit: number; credit: number; count: number }> = {}
  for (const e of pcmDistRaw || []) {
    const k = e.numero_compte || "?"
    const slot = pcmDist[k] || { debit: 0, credit: 0, count: 0 }
    slot.debit += Number(e.debit_mur) || 0
    slot.credit += Number(e.credit_mur) || 0
    slot.count += 1
    pcmDist[k] = slot
  }

  return NextResponse.json({
    ok: true,
    audited_at: new Date().toISOString(),
    societe: {
      id: societe.id,
      nom: societe.nom,
      devise_principale: societe.devise_principale,
      devises_actives: societe.devises_actives,
    },
    comptes_bancaires: comptes || [],
    releves: {
      total: (releves || []).length,
      par_statut: (releves || []).reduce((acc: any, r: any) => {
        acc[r.statut_rapprochement || "?"] = (acc[r.statut_rapprochement || "?"] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      derniers: (releves || []).slice(0, 5).map((r: any) => ({
        id: r.id,
        compte_bancaire_id: r.compte_bancaire_id,
        periode: r.periode,
        date_debut: r.date_debut,
        date_fin: r.date_fin,
        solde_ouverture: r.solde_ouverture,
        solde_cloture: r.solde_cloture,
        total_debits: r.total_debits,
        total_credits: r.total_credits,
        statut_rapprochement: r.statut_rapprochement,
        nb_transactions: Array.isArray(r.transactions_json) ? r.transactions_json.length : 0,
      })),
    },
    transactions: {
      total: allTx.length,
      rapprochees: txMatched,
      classifiees_seulement: txClassified,
      orphelines: txOrphan,
      taux_rapprochement_pct:
        allTx.length > 0 ? Math.round((txMatched / allTx.length) * 1000) / 10 : 0,
      // Échantillon des plus gros montants orphelins, triés DESC (plus actionnable)
      orphelines_echantillon: allTx
        .filter((t) => !t.facture_ids?.length)
        .sort((a, b) => Math.max(b.debit, b.credit) - Math.max(a.debit, a.credit))
        .slice(0, 25),
    },
    factures: {
      total: (factures || []).length,
      par_statut: factByStatut,
      impayees: facturesImpayees.length,
      impayees_montant_mur: facturesImpayees.reduce(
        (s: number, f: any) => s + (Number(f.montant_mur) || 0),
        0
      ),
      impayees_echantillon: facturesImpayees.slice(0, 25).map((f: any) => ({
        id: f.id,
        numero_facture: f.numero_facture,
        tiers: f.tiers,
        type_facture: f.type_facture,
        devise: f.devise,
        montant_ttc: f.montant_ttc,
        montant_mur: f.montant_mur,
        statut: f.statut,
        date_facture: f.date_facture,
        date_echeance: f.date_echeance,
      })),
    },
    ecritures_non_lettrees: {
      total: (ecrituresNonLettrees || []).length,
      echantillon: (ecrituresNonLettrees || []).slice(0, 25),
    },
    plan_comptable_utilisation: Object.entries(pcmDist)
      .map(([compte, m]) => ({
        compte,
        nb_ecritures: m.count,
        total_debit: Math.round(m.debit * 100) / 100,
        total_credit: Math.round(m.credit * 100) / 100,
        solde: Math.round((m.debit - m.credit) * 100) / 100,
      }))
      .sort((a, b) => b.nb_ecritures - a.nb_ecritures)
      .slice(0, 30),
  })
}
