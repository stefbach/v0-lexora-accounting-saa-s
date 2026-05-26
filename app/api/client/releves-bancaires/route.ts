import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from "@/lib/supabase/assert-societe-access"
import { resolveUserAuth } from "@/lib/supabase/auth-resolver"

export const dynamic = "force-dynamic"

/**
 * GET /api/client/releves-bancaires?societe_id=...&periode=YYYY-MM&compte_id=...
 * Liste les relevés bancaires d'une société accessible au client connecté.
 * Inclut le payload transactions_json pour permettre l'affichage du
 * détail (avec statuts agent : propose / a_verifier / rapproche).
 *
 * Auth multi-mode (session web OR X-Lexora-Api-Key OR X-Internal-Token) —
 * utilise resolveUserAuth pour pouvoir être consommé par l'outil MCP
 * `list_releves_bancaires` (Claude Desktop, n8n).
 */
export async function GET(request: Request) {
  let userIdForLog: string | null = null
  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get("societe_id")
  const periode = searchParams.get("periode")
  const compte_id = searchParams.get("compte_id")

  try {
    // FIX MCP : resolveUserAuth accepte aussi les clés API (header
    // X-Lexora-Api-Key) en plus de la session web — sinon l'outil MCP
    // `list_releves_bancaires` retourne 401 alors que la clé est valide.
    const user = await resolveUserAuth(request)
    if (!user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }
    userIdForLog = user.id

    if (!societe_id) {
      return NextResponse.json({ error: "societe_id requis" }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Vérifie que l'utilisateur a accès à cette société. Si refus → 403
    // explicite avec societe_id + user_id + hint pour faciliter le
    // diagnostic côté MCP.
    try {
      await assertSocieteAccess(supabase, user.id, societe_id)
    } catch (e) {
      const mapped = mapSocieteAccessError(e, {
        societe_id,
        user_id: user.id,
      })
      if (mapped) {
        return NextResponse.json(mapped.body, { status: mapped.status })
      }
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Erreur d'accès" },
        { status: 500 }
      )
    }

    // Filtre période YYYY-MM → date_debut/date_fin sur date_fin du relevé.
    // Format attendu : "2026-05". On matche les relevés dont date_fin
    // tombe dans ce mois civil.
    let periodeStart: string | null = null
    let periodeEnd: string | null = null
    if (periode && /^\d{4}-\d{2}$/.test(periode)) {
      const [y, m] = periode.split("-").map(Number)
      periodeStart = `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-01`
      // Dernier jour du mois — JS Date(y, m, 0) renvoie le dernier jour de m
      const lastDay = new Date(y, m, 0).getDate()
      periodeEnd = `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`
    }

    let relevesQuery = supabase
      .from("releves_bancaires")
      .select(
        "id, compte_bancaire_id, periode, date_debut, date_fin, solde_ouverture, solde_cloture, total_debits, total_credits, statut_rapprochement, transactions_json, created_at"
      )
      .eq("societe_id", societe_id)
      .is("superseded_by_id", null)
      .order("date_fin", { ascending: false })

    if (compte_id) {
      relevesQuery = relevesQuery.eq("compte_bancaire_id", compte_id)
    }
    if (periodeStart && periodeEnd) {
      relevesQuery = relevesQuery
        .gte("date_fin", periodeStart)
        .lte("date_fin", periodeEnd)
    }

    const [{ data: comptes }, { data: releves }] = await Promise.all([
      supabase
        .from("comptes_bancaires")
        .select(
          "id, banque, nom_compte, numero_compte, iban, devise, compte_comptable, solde_actuel, solde_dernier_releve, date_dernier_releve, compte_principal, actif"
        )
        .eq("societe_id", societe_id),
      relevesQuery,
    ])

    return NextResponse.json({
      comptes: comptes || [],
      releves: releves || [],
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e, {
      societe_id,
      user_id: userIdForLog,
    })
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    console.error("[releves-bancaires]", e)
    return NextResponse.json(
      { error: e?.message || "Erreur serveur" },
      { status: 500 }
    )
  }
}
