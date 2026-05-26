/**
 * GET /api/client/plan-comptable?societe_id=...
 *
 * Retourne le plan comptable mauricien : comptes globaux (societe_id=null)
 * + overrides société. Le PCM étant un référentiel public mauricien, on
 * accepte la requête dès qu'on a un user authentifié (sans vérif d'accès
 * à la société, puisque l'utilisateur ne peut pas modifier le PCM via
 * cette route GET).
 */
import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { resolveUserAuth } from "@/lib/supabase/auth-resolver"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    // FIX MCP : resolveUserAuth pour outil MCP `get_plan_comptable`.
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get("societe_id")

    const sb = getAdminClient()
    let query = sb
      .from("plan_comptable")
      .select(
        "id, compte, libelle, classe, type_compte, sens_normal, compte_parent, niveau, actif, est_analytique, notes, societe_id"
      )
      .order("compte", { ascending: true })

    if (societe_id) {
      // Comptes globaux + overrides de cette société
      query = query.or(`societe_id.eq.${societe_id},societe_id.is.null`)
    } else {
      // Pas de societe_id → on retourne juste les globaux
      query = query.is("societe_id", null)
    }

    const { data: comptes, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ comptes: comptes || [], count: (comptes || []).length })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erreur" },
      { status: 500 }
    )
  }
}
