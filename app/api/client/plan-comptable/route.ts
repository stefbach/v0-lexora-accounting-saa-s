/**
 * GET /api/client/plan-comptable?societe_id=...
 * Retourne le plan comptable mauricien : comptes globaux + overrides société.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from "@/lib/supabase/assert-societe-access"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const auth = await createClient()
    const {
      data: { user },
    } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get("societe_id")
    if (!societe_id) {
      return NextResponse.json({ error: "societe_id requis" }, { status: 400 })
    }

    const sb = getAdminClient()
    try {
      await assertSocieteAccess(sb, user.id, societe_id)
    } catch (e) {
      const m = mapSocieteAccessError(e)
      if (m) return NextResponse.json(m.body, { status: m.status })
      throw e
    }

    const { data: comptes } = await sb
      .from("plan_comptable")
      .select(
        "id, compte, libelle, classe, type_compte, sens_normal, compte_parent, niveau, actif, est_analytique, notes, societe_id"
      )
      .or(`societe_id.eq.${societe_id},societe_id.is.null`)
      .order("compte", { ascending: true })

    return NextResponse.json({ comptes: comptes || [] })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erreur" },
      { status: 500 }
    )
  }
}
