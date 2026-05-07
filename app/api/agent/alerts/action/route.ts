/**
 * POST /api/agent/alerts/action
 *
 * Actions correctives sur les alertes Lex OCR / Lex Factures :
 *
 *   action="apply_ocr_to_facture" : remplace les champs facture par les
 *     valeurs OCR (utile pour MISMATCH_AMOUNT/DATE/TIERS/CURRENCY).
 *     Body: { facture_id, fields: { montant_ttc?, date_facture?, tiers?, devise? } }
 *
 *   action="annule_facture" : passe le statut à "annule" (pour les doublons).
 *     Body: { facture_id }
 *
 *   action="tag_penalty" : tague une facture comme contenant une pénalité.
 *     Le tag est stocké en JSON dans notes_internes (champ existant).
 *     Body: { facture_id, montant_penalty?, raison? }
 *
 *   action="confirm_normal" : marque une alerte comme "vérifiée et normale"
 *     (tag dans notes_internes).
 *     Body: { facture_id, alert_code }
 *
 * Auth : bearer LEXORA_AGENT_SECRET OU session navigateur (avec accès société)
 */
import { NextResponse } from "next/server"
import { authenticateAgentRequest } from "@/lib/agent-auth"
import { getAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

  const action: string = body?.action || ""
  const sb = getAdminClient()

  if (action === "apply_ocr_to_facture") {
    const facture_id: string = body?.facture_id
    const fields: Record<string, any> = body?.fields || {}
    if (!facture_id) {
      return NextResponse.json({ error: "facture_id requis" }, { status: 400 })
    }
    // Vérifie que la facture appartient à la société
    const { data: facture } = await sb
      .from("factures")
      .select("id, societe_id")
      .eq("id", facture_id)
      .maybeSingle()
    if (!facture || facture.societe_id !== societe_id) {
      return NextResponse.json({ error: "Facture introuvable" }, { status: 404 })
    }
    // On ne laisse passer que les champs autorisés
    const allowed = ["montant_ttc", "montant_ht", "montant_tva", "date_facture", "tiers", "devise"]
    const update: Record<string, any> = {}
    for (const k of allowed) {
      if (fields[k] !== undefined && fields[k] !== null) update[k] = fields[k]
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "aucun champ à mettre à jour" }, { status: 400 })
    }
    update.updated_at = new Date().toISOString()
    const { error } = await sb
      .from("factures")
      .update(update)
      .eq("id", facture_id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, action, facture_id, updated: Object.keys(update) })
  }

  if (action === "annule_facture") {
    const facture_id: string = body?.facture_id
    if (!facture_id) {
      return NextResponse.json({ error: "facture_id requis" }, { status: 400 })
    }
    const { data: facture } = await sb
      .from("factures")
      .select("id, societe_id")
      .eq("id", facture_id)
      .maybeSingle()
    if (!facture || facture.societe_id !== societe_id) {
      return NextResponse.json({ error: "Facture introuvable" }, { status: 404 })
    }
    const { error } = await sb
      .from("factures")
      .update({
        statut: "annule",
        notes_internes: `Annulée par Lex OCR (doublon) le ${new Date().toISOString().slice(0, 10)}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", facture_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action, facture_id })
  }

  if (action === "tag_penalty") {
    const facture_id: string = body?.facture_id
    const montant_penalty = Number(body?.montant_penalty) || 0
    const raison: string = body?.raison || "Pénalité confirmée par Lex Factures"
    if (!facture_id) {
      return NextResponse.json({ error: "facture_id requis" }, { status: 400 })
    }
    const { data: facture } = await sb
      .from("factures")
      .select("id, societe_id, notes_internes")
      .eq("id", facture_id)
      .maybeSingle()
    if (!facture || facture.societe_id !== societe_id) {
      return NextResponse.json({ error: "Facture introuvable" }, { status: 404 })
    }
    const tag = `[PÉNALITÉ ${montant_penalty > 0 ? `${montant_penalty.toFixed(2)} ` : ""}— ${raison} — ${new Date().toISOString().slice(0, 10)}]`
    const newNotes = facture.notes_internes
      ? `${facture.notes_internes}\n${tag}`
      : tag
    const { error } = await sb
      .from("factures")
      .update({ notes_internes: newNotes, updated_at: new Date().toISOString() })
      .eq("id", facture_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action, facture_id })
  }

  if (action === "confirm_normal") {
    const facture_id: string = body?.facture_id
    const alert_code: string = body?.alert_code || "ALERT"
    if (!facture_id) {
      return NextResponse.json({ error: "facture_id requis" }, { status: 400 })
    }
    const { data: facture } = await sb
      .from("factures")
      .select("id, societe_id, notes_internes")
      .eq("id", facture_id)
      .maybeSingle()
    if (!facture || facture.societe_id !== societe_id) {
      return NextResponse.json({ error: "Facture introuvable" }, { status: 404 })
    }
    const tag = `[OK ${alert_code} — vérifié le ${new Date().toISOString().slice(0, 10)}]`
    const newNotes = facture.notes_internes
      ? `${facture.notes_internes}\n${tag}`
      : tag
    await sb
      .from("factures")
      .update({ notes_internes: newNotes, updated_at: new Date().toISOString() })
      .eq("id", facture_id)
    return NextResponse.json({ ok: true, action, facture_id })
  }

  return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 })
}
