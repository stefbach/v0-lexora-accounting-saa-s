/**
 * Heures supplémentaires — saisie agrégée mensuelle (hors planning).
 *
 * Cas d'usage : un RH veut enregistrer rapidement un volume mensuel
 * d'heures sup pour un employé (ex: "5h à 1.5x pour Janvier 2026") sans
 * passer par la saisie journalière du module web (/api/rh/paie/ot/save).
 *
 * Différences vs. la saisie journalière :
 *   - Pas de référence au planning ni aux jours fériés
 *   - Pas de validation par-jour (date dans la fenêtre période)
 *   - UPSERT sur (employe_id, periode, pointage_id IS NULL) — ligne agrégat
 *
 * Cadre Workers' Rights Act 2019 Mauritius :
 *   - 45h × 52 / 12 = 195h / mois (taux horaire base = salaire_base / 195)
 *   - Multiplicateur OT 1.5× pour heures normales, 2.0× pour jours fériés
 *
 * Utilisé par :
 *   - /api/telegram/internal/ot-add (saisie rapide vocale/texte par RH)
 *
 * Pour le mode saisie détaillée par date (multi-employés, multi-jours),
 * voir lib/rh/overtime.ts → preparerLignesPourSave + saveOvertimeMois,
 * appelés par /api/rh/paie/ot/save.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

const HEURES_MOIS_THEORIQUE = (45 * 52) / 12 // = 195

export interface AjouterOtAggregateInput {
  employe_id: string
  periode: string // YYYY-MM
  heures: number // > 0
  taux: 1.5 | 2
  salaire_base: number // MUR
}

export interface AjouterOtAggregateResult {
  ok: boolean
  error?: string
  taux_horaire_mur: number
  heures_arrondies: number
  montant_estime_mur: number
  ligne_id?: string
}

/**
 * UPSERT d'une ligne agrégat heures_travaillees (pointage_id=null,
 * periode = 1er du mois) en ajoutant les heures + montant à la valeur
 * existante si elle existe.
 *
 * Suppose que l'appelant a déjà validé :
 *   - l'existence de l'employé et son appartenance à la société active
 *   - la cohérence du périmètre métier (rôle, droits)
 *
 * Le taux horaire est calculé à partir de salaire_base (champ employes)
 * selon la formule WRA 2019 (45h × 52 / 12 ≈ 195h).
 */
export async function ajouterOtAggregate(
  supabase: SupabaseLike,
  input: AjouterOtAggregateInput,
): Promise<AjouterOtAggregateResult> {
  const taux_horaire =
    input.salaire_base > 0 ? input.salaire_base / HEURES_MOIS_THEORIQUE : 0
  const heures_arr = Math.round(input.heures * 100) / 100
  const taux_horaire_r = Math.round(taux_horaire * 100) / 100
  const montant = Math.round(heures_arr * taux_horaire * input.taux * 100) / 100

  const colHeures = input.taux === 1.5 ? 'heures_ot_1_5x' : 'heures_ot_2x'
  const colMontant = input.taux === 1.5 ? 'montant_ot_1_5x' : 'montant_ot_2x'
  const periodeDate = `${input.periode}-01`

  const baseResult = {
    taux_horaire_mur: taux_horaire_r,
    heures_arrondies: heures_arr,
    montant_estime_mur: montant,
  }

  try {
    const { data: existing } = await supabase
      .from('heures_travaillees')
      .select(`id, ${colHeures}, ${colMontant}`)
      .eq('employe_id', input.employe_id)
      .eq('periode', periodeDate)
      .is('pointage_id', null)
      .maybeSingle()

    if (existing) {
      const prevH = Number((existing as any)[colHeures] || 0)
      const prevM = Number((existing as any)[colMontant] || 0)
      const { error: upErr } = await supabase
        .from('heures_travaillees')
        .update({
          [colHeures]: Math.round((prevH + heures_arr) * 100) / 100,
          [colMontant]: Math.round((prevM + montant) * 100) / 100,
          montant_ot: Math.round((prevM + montant) * 100) / 100,
          taux_horaire: taux_horaire_r,
        })
        .eq('id', (existing as any).id)
      if (upErr) return { ok: false, error: upErr.message, ...baseResult }
      return { ok: true, ligne_id: (existing as any).id, ...baseResult }
    }

    const payload: Record<string, unknown> = {
      employe_id: input.employe_id,
      pointage_id: null,
      date: periodeDate,
      periode: periodeDate,
      taux_horaire: taux_horaire_r,
      montant_ot: montant,
    }
    payload[colHeures] = heures_arr
    payload[colMontant] = montant
    const { data: inserted, error: insErr } = await supabase
      .from('heures_travaillees')
      .insert(payload)
      .select('id')
      .maybeSingle()
    if (insErr) return { ok: false, error: insErr.message, ...baseResult }
    return { ok: true, ligne_id: (inserted as any)?.id, ...baseResult }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), ...baseResult }
  }
}
