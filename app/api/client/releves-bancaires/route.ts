import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from "@/lib/supabase/assert-societe-access"

export const dynamic = "force-dynamic"

/**
 * GET /api/client/releves-bancaires?societe_id=...
 * Liste les relevés bancaires d'une société accessible au client connecté.
 * Inclut le payload transactions_json pour permettre l'affichage du
 * détail (avec statuts agent : propose / a_verifier / rapproche).
 */
export async function GET(request: Request) {
  try {
    const authClient = await createClient()
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get("societe_id")
    if (!societe_id) {
      return NextResponse.json({ error: "societe_id requis" }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Vérifie que l'utilisateur a accès à cette société
    try {
      await assertSocieteAccess(supabase, user.id, societe_id)
    } catch (e) {
      return mapSocieteAccessError(e)
    }

    const [{ data: comptes }, { data: releves }] = await Promise.all([
      supabase
        .from("comptes_bancaires")
        .select(
          "id, banque, nom_compte, numero_compte, iban, devise, compte_comptable, solde_actuel, solde_dernier_releve, date_dernier_releve, compte_principal, actif"
        )
        .eq("societe_id", societe_id),
      supabase
        .from("releves_bancaires")
        .select(
          "id, compte_bancaire_id, periode, date_debut, date_fin, solde_ouverture, solde_cloture, total_debits, total_credits, statut_rapprochement, transactions_json, created_at"
        )
        .eq("societe_id", societe_id)
        .order("date_fin", { ascending: false }),
    ])

    return NextResponse.json({
      comptes: comptes || [],
      releves: releves || [],
    })
  } catch (e: any) {
    console.error("[releves-bancaires]", e)
    return NextResponse.json(
      { error: e?.message || "Erreur serveur" },
      { status: 500 }
    )
  }
}
