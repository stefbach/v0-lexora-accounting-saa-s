import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { getSeedPlanComptable } from "@/lib/onboarding/seed-plan-comptable"
import { getSecteurTemplate } from "@/lib/onboarding/templates-secteur"

/**
 * POST /api/onboarding/setup-societe
 *
 * Crée une société + dossier + assignation utilisateur + comptes bancaires
 * en une seule opération (au plus proche d'une transaction côté client REST).
 *
 * Auth : utilisateur authentifié (créateur). Pas besoin d'être admin :
 * un comptable / comptable_dedie / client_admin peut créer sa propre société.
 *
 * Tenant isolation : on lie systématiquement la société au user (created_by + user_societes)
 * et on crée un dossier (comptable_id = userId).
 */
export async function POST(req: NextRequest) {
  try {
    // 1) Auth
    const supabaseAuth = await createServerClient()
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
    if (!user || authErr) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
    }

    // 2) Profile / role
    const { data: profile } = await supabaseAuth
      .from("profiles")
      .select("id, role, full_name, email")
      .eq("id", user.id)
      .single()
    if (!profile) {
      return NextResponse.json({ error: "Profil introuvable" }, { status: 403 })
    }
    const allowedRoles = [
      "admin", "super_admin",
      "comptable", "comptable_dedie",
      "client", "client_admin",
    ]
    if (!allowedRoles.includes(profile.role ?? "")) {
      return NextResponse.json({ error: "Rôle non autorisé pour l'onboarding" }, { status: 403 })
    }

    // 3) Body
    const body = await req.json()
    const { societe, comptes_bancaires, exercice } = body ?? {}

    if (!societe || typeof societe.nom !== "string" || societe.nom.trim().length < 2) {
      return NextResponse.json({ error: "Nom de société requis (≥ 2 caractères)" }, { status: 400 })
    }

    const admin = getAdminClient()

    // 4) Calcul des dates d'exercice
    const dateDebutExercice =
      exercice?.date_debut ||
      (societe.exercice_type === "calendaire"
        ? `${new Date().getFullYear()}-01-01`
        : `${new Date().getMonth() < 6 ? new Date().getFullYear() - 1 : new Date().getFullYear()}-07-01`)
    const dateFinExercice =
      exercice?.date_fin ||
      (societe.exercice_type === "calendaire"
        ? `${new Date().getFullYear()}-12-31`
        : `${new Date().getMonth() < 6 ? new Date().getFullYear() : new Date().getFullYear() + 1}-06-30`)
    const moisCloture = dateFinExercice ? Number(dateFinExercice.slice(5, 7)) : 6

    // 5) Création société
    const { data: createdSociete, error: societeErr } = await admin
      .from("societes")
      .insert({
        nom: societe.nom.trim(),
        brn: societe.brn?.trim() || null,
        registered_office: societe.adresse?.trim() || null,
        adresse: societe.adresse?.trim() || null,
        secteur_activite: societe.secteur || null,
        statut_tva: !!societe.statut_tva,
        numero_tva_mra: societe.numero_tva_mra?.trim() || null,
        date_debut_exercice: dateDebutExercice,
        date_fin_exercice: dateFinExercice,
        mois_cloture: moisCloture,
        comptable_id: ["comptable", "comptable_dedie", "admin", "super_admin"].includes(profile.role)
          ? profile.id
          : null,
        created_by: profile.id,
        devises_actives: societe.devise_principale ? [societe.devise_principale] : ["MUR"],
      })
      .select("*")
      .single()

    if (societeErr || !createdSociete) {
      return NextResponse.json(
        { error: societeErr?.message ?? "Erreur lors de la création de la société" },
        { status: 500 },
      )
    }

    const societeId = createdSociete.id as string

    // 6) Lien user_societes (toujours, pour l'isolation tenant)
    {
      const { error: usErr } = await admin.from("user_societes").upsert(
        {
          user_id: profile.id,
          societe_id: societeId,
          role: profile.role,
          actif: true,
        },
        { onConflict: "user_id,societe_id" },
      )
      if (usErr) {
        // Best-effort : on n'annule pas la société pour autant
        console.error("[onboarding] user_societes upsert failed:", usErr.message)
      }
    }

    // 7) Création dossier (si rôle comptable, sinon le client est lié via created_by)
    if (["comptable", "comptable_dedie", "admin", "super_admin"].includes(profile.role)) {
      const { error: dossierErr } = await admin.from("dossiers").insert({
        societe_id: societeId,
        comptable_id: profile.id,
        // client_id volontairement null à ce stade — sera lié quand un user "client"
        // sera invité depuis /comptable/societes
      })
      if (dossierErr) {
        console.error("[onboarding] dossier insert failed:", dossierErr.message)
      }
    } else if (["client", "client_admin"].includes(profile.role)) {
      // Le créateur EST le client → on l'enregistre comme client du dossier
      const { error: dossierErr } = await admin.from("dossiers").insert({
        societe_id: societeId,
        client_id: profile.id,
        comptable_id: null,
      })
      if (dossierErr) {
        console.error("[onboarding] dossier insert (client) failed:", dossierErr.message)
      }
    }

    // 8) Seed plan comptable (UPSERT idempotent — ON CONFLICT DO NOTHING sur compte global)
    {
      const seed = getSeedPlanComptable()
      // Le plan canonique global a UNIQUE(compte) → on tente l'UPSERT en ignorant les conflits.
      // Pour cela on insère ligne par ligne avec ON CONFLICT DO NOTHING.
      // Comme l'API supabase-js ne supporte pas DO NOTHING, on fait un select préalable et on filtre.
      const codes = seed.map((s) => s.compte)
      const { data: existing } = await admin
        .from("plan_comptable")
        .select("compte")
        .in("compte", codes)
      const existingSet = new Set((existing ?? []).map((r: { compte: string }) => r.compte))
      const toInsert = seed.filter((s) => !existingSet.has(s.compte))
      if (toInsert.length > 0) {
        const { error: pcErr } = await admin.from("plan_comptable").insert(
          toInsert.map((s) => ({
            compte: s.compte,
            libelle: s.libelle,
            type_compte: s.type_compte,
            sens_normal: s.sens_normal,
            compte_parent: s.compte_parent,
            niveau: s.niveau,
          })),
        )
        if (pcErr) console.error("[onboarding] plan_comptable seed warning:", pcErr.message)
      }
    }

    // 9) Comptes spécifiques au secteur (idempotent)
    {
      const tpl = getSecteurTemplate(societe.secteur)
      if (tpl.comptes_specifiques.length > 0) {
        const codes = tpl.comptes_specifiques.map((c) => c.compte)
        const { data: existing } = await admin
          .from("plan_comptable")
          .select("compte")
          .in("compte", codes)
        const existingSet = new Set((existing ?? []).map((r: { compte: string }) => r.compte))
        const toInsert = tpl.comptes_specifiques
          .filter((c) => !existingSet.has(c.compte))
          .map((c) => ({
            compte: c.compte,
            libelle: c.libelle,
            type_compte: c.type_compte,
            sens_normal: c.type_compte === "actif" || c.type_compte === "charge" ? "D" : "C",
            compte_parent: null,
            niveau: c.compte.length,
          }))
        if (toInsert.length > 0) {
          const { error: pcErr } = await admin.from("plan_comptable").insert(toInsert)
          if (pcErr) console.error("[onboarding] secteur seed warning:", pcErr.message)
        }
      }
    }

    // 10) Comptes bancaires
    let banksInserted = 0
    if (Array.isArray(comptes_bancaires) && comptes_bancaires.length > 0) {
      const rows = comptes_bancaires.map((c, idx: number) => {
        const devise = (c.devise || "MUR") as string
        const compteCompta =
          devise === "MUR" ? "5121" :
          devise === "EUR" ? "5122" :
          devise === "USD" ? "5123" :
          "512"
        return {
          societe_id: societeId,
          banque: c.banque || "Other",
          nom_compte: c.nom_compte?.trim() || `${c.banque} ${devise}`,
          numero_compte: c.numero_compte?.trim() || null,
          iban: c.iban?.trim() || null,
          devise,
          solde_actuel: Number(c.solde_initial) || 0,
          solde_dernier_releve: Number(c.solde_initial) || 0,
          compte_principal: !!c.compte_principal,
          compte_comptable: compteCompta,
          actif: true,
          ordre_affichage: idx,
        }
      })
      const { error: bnqErr, count } = await admin
        .from("comptes_bancaires")
        .insert(rows, { count: "exact" })
      if (bnqErr) {
        console.error("[onboarding] comptes_bancaires insert error:", bnqErr.message)
      } else {
        banksInserted = count ?? rows.length
      }
    }

    return NextResponse.json({
      ok: true,
      societe: createdSociete,
      banks_created: banksInserted,
      exercice: { date_debut: dateDebutExercice, date_fin: dateFinExercice },
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 },
    )
  }
}
