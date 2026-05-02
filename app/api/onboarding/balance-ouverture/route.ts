import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"
import {
  assertSocieteAccess, mapSocieteAccessError,
} from "@/lib/supabase/assert-societe-access"

/**
 * POST /api/onboarding/balance-ouverture
 *
 * Génère les écritures « À Nouveau » (AN) pour la balance d'ouverture
 * d'une société migrée d'un autre logiciel.
 *
 * Body :
 * {
 *   societe_id: string,
 *   date_ouverture: 'YYYY-MM-DD',
 *   lignes: [{ compte: '411', libelle: 'Clients divers', debit: 1000, credit: 0 }]
 * }
 *
 * Crée des lignes dans ecritures_comptables_v2 avec journal='AN' (À Nouveau)
 * et ref_folio = 'AN-OUVERTURE-<societeId>-<timestamp>'.
 *
 * Refus si la balance n'est pas équilibrée (tolérance 0.01 MUR).
 */
export async function POST(req: NextRequest) {
  try {
    // Auth
    const supabaseAuth = await createServerClient()
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
    if (!user || authErr) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const societeId = body?.societe_id as string | undefined
    const dateOuverture = body?.date_ouverture as string | undefined
    const lignes = body?.lignes as Array<{
      compte: string
      libelle?: string
      debit?: number
      credit?: number
    }> | undefined

    if (!societeId) {
      return NextResponse.json({ error: "societe_id requis" }, { status: 400 })
    }
    if (!dateOuverture || !/^\d{4}-\d{2}-\d{2}$/.test(dateOuverture)) {
      return NextResponse.json({ error: "date_ouverture invalide (YYYY-MM-DD)" }, { status: 400 })
    }
    if (!Array.isArray(lignes) || lignes.length === 0) {
      return NextResponse.json({ error: "lignes requises" }, { status: 400 })
    }

    const admin = getAdminClient()

    // Tenant isolation
    try {
      await assertSocieteAccess(admin, user.id, societeId)
    } catch (e) {
      const mapped = mapSocieteAccessError(e)
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw e
    }

    // Validation lignes
    const cleaned = lignes
      .map((l) => ({
        compte: String(l.compte ?? "").trim(),
        libelle: String(l.libelle ?? "À Nouveau").trim(),
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }))
      .filter((l) => l.compte.length > 0 && (l.debit !== 0 || l.credit !== 0))

    if (cleaned.length === 0) {
      return NextResponse.json({ error: "Aucune ligne valide" }, { status: 400 })
    }

    // Format compte (3 à 5 chiffres)
    const badCompte = cleaned.find((l) => !/^[1-8][0-9]{2,4}$/.test(l.compte))
    if (badCompte) {
      return NextResponse.json(
        { error: `Numéro de compte non valide : ${badCompte.compte}. Doit être 3-5 chiffres PCM.` },
        { status: 400 },
      )
    }

    // Équilibre
    const totalDebit = cleaned.reduce((s, l) => s + l.debit, 0)
    const totalCredit = cleaned.reduce((s, l) => s + l.credit, 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return NextResponse.json(
        { error: `Balance déséquilibrée : débit ${totalDebit.toFixed(2)} ≠ crédit ${totalCredit.toFixed(2)}` },
        { status: 400 },
      )
    }

    // Récupérer libelle PCM si non fourni
    const codes = Array.from(new Set(cleaned.map((l) => l.compte)))
    const { data: pcRows } = await admin
      .from("plan_comptable")
      .select("compte, libelle")
      .in("compte", codes)
    const pcMap = new Map<string, string>(
      (pcRows ?? []).map((r: { compte: string; libelle: string }) => [r.compte, r.libelle]),
    )

    // Génération du ref_folio unique
    const refFolio = `AN-OUVERTURE-${societeId.slice(0, 8)}-${Date.now()}`
    const exerciceLabel = `${dateOuverture.slice(0, 4)}-${String(Number(dateOuverture.slice(0, 4)) + 1).slice(2, 4)}`

    // Vérification anti-doublon : ne pas re-générer une AN si une existe déjà pour cette société
    const { data: existingAN } = await admin
      .from("ecritures_comptables_v2")
      .select("id")
      .eq("societe_id", societeId)
      .eq("journal", "AN")
      .like("ref_folio", "AN-OUVERTURE-%")
      .limit(1)
    if (existingAN && existingAN.length > 0) {
      return NextResponse.json(
        { error: "Une balance d'ouverture existe déjà pour cette société. Supprimez-la d'abord avant d'en saisir une nouvelle." },
        { status: 409 },
      )
    }

    // Insertion des écritures
    const rows = cleaned.map((l) => ({
      societe_id: societeId,
      date_ecriture: dateOuverture,
      ref_folio: refFolio,
      numero_compte: l.compte,
      nom_compte: pcMap.get(l.compte) ?? l.libelle,
      description: l.libelle || "À Nouveau (ouverture)",
      debit_mur: l.debit,
      credit_mur: l.credit,
      journal: "AN",
      exercice: exerciceLabel,
    }))

    const { error: insErr, count } = await admin
      .from("ecritures_comptables_v2")
      .insert(rows, { count: "exact" })

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      ref_folio: refFolio,
      ecritures_creees: count ?? rows.length,
      total_debit: totalDebit,
      total_credit: totalCredit,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 },
    )
  }
}
