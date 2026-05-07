/**
 * POST /api/agent/ocr
 *
 * "Lex OCR" — agent de contrôle qualité de la pipeline OCR. Vérifie que
 * ce qui a été extrait de l'OCR est correctement intégré dans les tables
 * cibles (factures, releves_bancaires) et alerte sur :
 *   - Documents en erreur (facture_status=error)
 *   - Documents marqués créés mais sans facture en DB (pipeline cassé)
 *   - Doublons potentiels (même numéro de facture, même hash)
 *   - Mismatches OCR↔facture : montant, date, tiers, devise
 *   - Champs critiques manquants après intégration
 *   - Société extraite vs societe_id réellement utilisée
 *   - Relevés bancaires : nb tx extraites vs nb tx persistées
 *
 * Auth : bearer LEXORA_AGENT_SECRET OU session navigateur
 * Body : { societe_id: string }
 */
import { NextResponse } from "next/server"
import { authenticateAgentRequest } from "@/lib/agent-auth"
import { getAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const AGENT_NAME = "Lex OCR"

interface Anomalie {
  severity: "critical" | "warning" | "info"
  code: string
  message: string
  document_id?: string
  document_nom?: string
  details?: any
}

function pct(a: number, b: number): number {
  if (!b) return 0
  return Math.abs((a - b) / b) * 100
}

function normStr(s: any): string {
  if (!s) return ""
  return String(s).toLowerCase().trim().replace(/\s+/g, " ")
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

  const sb = getAdminClient()

  // Tous les dossiers de la société
  const { data: dossiers } = await sb
    .from("dossiers")
    .select("id")
    .eq("societe_id", societe_id)
  const dossierIds = (dossiers || []).map((d: any) => d.id)

  // Documents traités sur ces dossiers
  const { data: docsRaw } = dossierIds.length
    ? await sb
        .from("documents")
        .select(
          "id, dossier_id, nom_fichier, type_document, statut, n8n_result, societe_detectee, created_at"
        )
        .in("dossier_id", dossierIds)
        .order("created_at", { ascending: false })
        .limit(2000)
    : { data: [] }
  const docs = docsRaw || []

  // Factures + relevés (lien via document_id)
  const docIds = docs.map((d: any) => d.id)
  const [{ data: factures }, { data: releves }] = await Promise.all([
    docIds.length
      ? sb
          .from("factures")
          .select(
            "id, document_id, numero_facture, tiers, type_facture, date_facture, montant_ttc, montant_ht, montant_tva, devise, statut, societe_id"
          )
          .in("document_id", docIds)
      : Promise.resolve({ data: [] }),
    docIds.length
      ? sb
          .from("releves_bancaires")
          .select(
            "id, document_id, transactions_json, total_debits, total_credits, nb_transactions, societe_id"
          )
          .in("document_id", docIds)
      : Promise.resolve({ data: [] }),
  ])
  const facturesByDoc = new Map<string, any>()
  for (const f of factures || []) {
    if (f.document_id) facturesByDoc.set(f.document_id as string, f)
  }
  const relevesByDoc = new Map<string, any>()
  for (const r of releves || []) {
    if (r.document_id) relevesByDoc.set(r.document_id as string, r)
  }

  const alerts: Anomalie[] = []

  // ── Doublons de numéro de facture ────────────────────────────
  const numeroCount = new Map<string, string[]>()
  for (const f of factures || []) {
    const num = (f.numero_facture || "").trim().toLowerCase()
    if (!num) continue
    const arr = numeroCount.get(num) || []
    arr.push(f.id)
    numeroCount.set(num, arr)
  }
  let doublonsCount = 0
  for (const [num, ids] of numeroCount) {
    if (ids.length > 1) {
      doublonsCount += ids.length
      alerts.push({
        severity: "warning",
        code: "DUPLICATE_INVOICE",
        message: `${ids.length} factures avec le même numéro "${num}"`,
        details: { numero: num, facture_ids: ids },
      })
    }
  }

  // ── Pour chaque document, vérif d'intégrité ─────────────────
  let docsWithError = 0
  let docsCreatedButNoFacture = 0
  let docsMissingCriticalFields = 0
  let mismatchesMontant = 0
  let mismatchesDate = 0
  let mismatchesTiers = 0
  let mismatchesDevise = 0
  let releveTxMismatch = 0

  for (const d of docs as any[]) {
    const n8n = d.n8n_result || {}
    const facture_status = n8n.facture_status
    const facture_error = n8n.facture_error
    const extraction = n8n.extraction || {}

    // 1. Document en erreur
    if (facture_status === "error" || facture_error) {
      docsWithError++
      alerts.push({
        severity: "critical",
        code: "OCR_ERROR",
        message: `Erreur OCR sur "${d.nom_fichier}" : ${facture_error || "raison non précisée"}`,
        document_id: d.id,
        document_nom: d.nom_fichier,
      })
      continue
    }

    if (d.type_document === "facture") {
      const f = facturesByDoc.get(d.id)
      // 2. Status=created mais pas de facture → pipeline cassé
      if (facture_status === "created" && !f) {
        docsCreatedButNoFacture++
        alerts.push({
          severity: "critical",
          code: "ORPHAN_OCR",
          message: `Document "${d.nom_fichier}" marqué comme facture créée mais aucune facture en DB`,
          document_id: d.id,
          document_nom: d.nom_fichier,
        })
        continue
      }

      if (!f) continue

      // 3. Champs critiques manquants
      const missing: string[] = []
      if (!f.numero_facture) missing.push("numero_facture")
      if (!f.date_facture) missing.push("date_facture")
      if (!f.montant_ttc || Number(f.montant_ttc) === 0) missing.push("montant_ttc")
      if (!f.tiers) missing.push("tiers")
      if (missing.length > 0) {
        docsMissingCriticalFields++
        alerts.push({
          severity: "warning",
          code: "MISSING_FIELDS",
          message: `Facture ${f.numero_facture || f.id.slice(0, 8)} : champs manquants après OCR — ${missing.join(", ")}`,
          document_id: d.id,
          document_nom: d.nom_fichier,
          details: { facture_id: f.id, missing },
        })
      }

      // 4. Mismatch montant OCR vs facture
      const ocrAmount =
        Number(extraction.montant_ttc) ||
        Number(extraction.total) ||
        Number(extraction.amount) ||
        0
      const dbAmount = Number(f.montant_ttc) || 0
      if (ocrAmount > 0 && dbAmount > 0 && pct(ocrAmount, dbAmount) > 1) {
        mismatchesMontant++
        alerts.push({
          severity: "warning",
          code: "MISMATCH_AMOUNT",
          message: `Facture ${f.numero_facture || f.id.slice(0, 8)} : OCR ${ocrAmount.toFixed(2)} vs DB ${dbAmount.toFixed(2)} (écart ${pct(ocrAmount, dbAmount).toFixed(1)}%)`,
          document_id: d.id,
          document_nom: d.nom_fichier,
          details: { facture_id: f.id, field: "montant_ttc", ocr_value: ocrAmount, db_value: dbAmount },
        })
      }

      // 5. Mismatch date
      const ocrDate = extraction.date_facture || extraction.date
      if (ocrDate && f.date_facture) {
        const ocrD = new Date(ocrDate).toISOString().slice(0, 10)
        const dbD = new Date(f.date_facture).toISOString().slice(0, 10)
        if (ocrD !== dbD) {
          mismatchesDate++
          alerts.push({
            severity: "info",
            code: "MISMATCH_DATE",
            message: `Facture ${f.numero_facture || f.id.slice(0, 8)} : date OCR ${ocrD} vs DB ${dbD}`,
            document_id: d.id,
            document_nom: d.nom_fichier,
            details: { facture_id: f.id, field: "date_facture", ocr_value: ocrD, db_value: dbD },
          })
        }
      }

      // 6. Mismatch tiers
      const ocrTiers = normStr(extraction.tiers || extraction.fournisseur || extraction.client)
      const dbTiers = normStr(f.tiers)
      if (ocrTiers && dbTiers && ocrTiers !== dbTiers && !ocrTiers.includes(dbTiers) && !dbTiers.includes(ocrTiers)) {
        mismatchesTiers++
        const ocrTiersRaw = (extraction.tiers || extraction.fournisseur || extraction.client || "").toString()
        alerts.push({
          severity: "info",
          code: "MISMATCH_TIERS",
          message: `Facture ${f.numero_facture || f.id.slice(0, 8)} : tiers OCR "${ocrTiersRaw.slice(0, 50)}" vs DB "${(f.tiers || "").slice(0, 50)}"`,
          document_id: d.id,
          document_nom: d.nom_fichier,
          details: { facture_id: f.id, field: "tiers", ocr_value: ocrTiersRaw, db_value: f.tiers },
        })
      }

      // 7. Mismatch devise
      const ocrDevise = (extraction.devise || extraction.currency || "").toUpperCase()
      const dbDevise = (f.devise || "").toUpperCase()
      if (ocrDevise && dbDevise && ocrDevise !== dbDevise) {
        mismatchesDevise++
        alerts.push({
          severity: "warning",
          code: "MISMATCH_CURRENCY",
          message: `Facture ${f.numero_facture || f.id.slice(0, 8)} : devise OCR ${ocrDevise} vs DB ${dbDevise}`,
          document_id: d.id,
          document_nom: d.nom_fichier,
          details: { facture_id: f.id, field: "devise", ocr_value: ocrDevise, db_value: dbDevise },
        })
      }

      // 8. Société détectée vs societe_id facture
      if (d.societe_detectee && f.societe_id !== societe_id) {
        alerts.push({
          severity: "warning",
          code: "WRONG_SOCIETE",
          message: `Facture ${f.numero_facture || f.id.slice(0, 8)} liée à une autre société que la société détectée`,
          document_id: d.id,
          document_nom: d.nom_fichier,
        })
      }
    }

    if (d.type_document === "releve_bancaire") {
      const r = relevesByDoc.get(d.id)
      if (!r) {
        // Doc relevé sans relevé en DB
        if (facture_status !== "skipped") {
          docsCreatedButNoFacture++
          alerts.push({
            severity: "critical",
            code: "ORPHAN_RELEVE",
            message: `Relevé bancaire "${d.nom_fichier}" extrait mais pas persisté en DB`,
            document_id: d.id,
            document_nom: d.nom_fichier,
          })
        }
        continue
      }
      // Vérif nb tx extraites vs persistées
      const ocrTx = Number(extraction.nb_transactions) || (Array.isArray(extraction.transactions) ? extraction.transactions.length : 0)
      const dbTx = Array.isArray(r.transactions_json) ? r.transactions_json.length : 0
      if (ocrTx > 0 && dbTx > 0 && Math.abs(ocrTx - dbTx) / ocrTx > 0.05) {
        releveTxMismatch++
        alerts.push({
          severity: "warning",
          code: "MISMATCH_RELEVE_TX",
          message: `Relevé "${d.nom_fichier}" : OCR ${ocrTx} tx vs DB ${dbTx} tx`,
          document_id: d.id,
          document_nom: d.nom_fichier,
          details: { ocr_count: ocrTx, db_count: dbTx },
        })
      }
    }
  }

  // Tri par sévérité
  const sevOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])

  const critical = alerts.filter((a) => a.severity === "critical").length
  const warnings = alerts.filter((a) => a.severity === "warning").length
  const score = Math.max(0, 100 - critical * 10 - warnings * 3)

  return NextResponse.json({
    ok: true,
    agent: AGENT_NAME,
    audited_at: new Date().toISOString(),
    societe_id,
    score,
    severity: critical > 0 ? "critical" : warnings > 0 ? "warning" : "ok",
    summary: {
      total_documents: docs.length,
      documents_factures: docs.filter((d: any) => d.type_document === "facture").length,
      documents_releves: docs.filter((d: any) => d.type_document === "releve_bancaire").length,
      factures_creees: (factures || []).length,
      releves_crees: (releves || []).length,
      docs_en_erreur: docsWithError,
      docs_orphelins: docsCreatedButNoFacture,
      docs_champs_manquants: docsMissingCriticalFields,
      mismatches_montant: mismatchesMontant,
      mismatches_date: mismatchesDate,
      mismatches_tiers: mismatchesTiers,
      mismatches_devise: mismatchesDevise,
      releve_tx_mismatch: releveTxMismatch,
      doublons_facture: doublonsCount,
    },
    alerts: alerts.slice(0, 200),
  })
}
