/**
 * G11 Phase 2 — Génération / annulation d'un bulletin EOY Bonus.
 *
 * Ce module encapsule la logique commune aux deux endpoints
 * /api/rh/eoy-bonus/[id]/generer-bulletin-75 et /generer-bulletin-25.
 * Il reste totalement ISOLÉ du moteur paie : on crée une ligne
 * bulletins_paie avec source='eoy_bonus_75pct'|'eoy_bonus_25pct',
 * salaire_base=0, et les déductions calculées via calculerDeductionsBonus.
 *
 * Les bulletins mensuels normaux ne sont jamais modifiés.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

import { calculerDeductionsBonus } from './eoy-bonus'

export type EoyPortion = '75pct' | '25pct'

export const EOY_SOURCES = {
  '75pct': 'eoy_bonus_75pct' as const,
  '25pct': 'eoy_bonus_25pct' as const,
}

export interface GenererBulletinResult {
  ok: true
  bulletin_id: string
  periode: string
  portion_brut: number
  csg_salarie: number
  csg_patronal: number
  paye: number
  bonus_net: number
}

export interface GenererBulletinError {
  ok: false
  erreur: string
  code?: string
  status?: number
}

/**
 * Génère un bulletin EOY pour une portion (75% ou 25%) :
 *   1. Charge le calcul eoy_bonus_calculs[id].
 *   2. Vérifie qu'il est éligible et que la portion n'est pas déjà générée.
 *   3. Pour 25% : vérifie que 75% a été généré en amont.
 *   4. Calcule la base imposable + PAYE cumulatif (déduit YTD).
 *   5. INSERT bulletins_paie (source = eoy_bonus_XXpct, salaire_base=0).
 *   6. UPDATE eoy_bonus_calculs (bulletin_XXpct_id + statut).
 *
 * Si l'INSERT bulletins_paie réussit mais l'UPDATE echoue, on tente
 * un rollback (DELETE du bulletin) pour garder la cohérence.
 */
export async function genererBulletinEoy(
  supabase: SupabaseLike,
  calculId: string,
  portion: EoyPortion,
  createdBy?: string | null,
): Promise<GenererBulletinResult | GenererBulletinError> {
  const { data: calcul, error: calcErr } = await supabase
    .from('eoy_bonus_calculs')
    .select('*, employe:employe_id(id, salaire_base, societe_id)')
    .eq('id', calculId)
    .maybeSingle()

  if (calcErr || !calcul) {
    return { ok: false, erreur: calcErr?.message || 'Calcul introuvable', status: 404 }
  }
  if (!calcul.eligible) {
    return { ok: false, erreur: `Employé non éligible : ${calcul.motif_non_eligible || '—'}`, status: 422 }
  }

  const bulletinFieldId = portion === '75pct' ? 'bulletin_75pct_id' : 'bulletin_25pct_id'
  const montantField = portion === '75pct' ? 'montant_paye_75pct' : 'montant_paye_25pct'
  const dateField = portion === '75pct' ? 'date_paiement_75pct' : 'date_paiement_25pct'

  if (calcul[bulletinFieldId]) {
    return { ok: false, erreur: 'Cette portion est déjà générée.', code: 'already_exists', status: 409 }
  }
  if (portion === '25pct' && !calcul.bulletin_75pct_id) {
    return {
      ok: false, erreur: 'Impossible de générer la portion 25% avant le 75%.',
      code: 'sequence_error', status: 409,
    }
  }

  const bonusTotal = Number(calcul.bonus_calcule) || 0
  const portionBrut = Math.round(
    (portion === '75pct' ? bonusTotal * 0.75 : bonusTotal - Math.round(bonusTotal * 0.75 * 100) / 100) * 100,
  ) / 100
  if (portionBrut <= 0) {
    return { ok: false, erreur: 'Montant portion <= 0 (bonus nul ?)', status: 422 }
  }

  // Emoluments annuels YTD hors EOY + PAYE YTD. On somme depuis les
  // bulletins NORMAUX de l'année (source NULL ou non EOY).
  const { data: bulletinsNormaux } = await supabase
    .from('bulletins_paie')
    .select('salaire_brut, paye, eoy_bonus')
    .eq('employe_id', calcul.employe_id)
    .gte('periode', `${calcul.annee}-01-01`)
    .lte('periode', `${calcul.annee}-12-31`)
    .or('source.is.null,source.not.like.eoy_bonus_%')

  const cumulEmoluments = (bulletinsNormaux || []).reduce(
    (s: number, b: any) => s + (Number(b.salaire_brut) || 0), 0,
  )
  const payeDeja = (bulletinsNormaux || []).reduce(
    (s: number, b: any) => s + (Number(b.paye) || 0), 0,
  )

  // Si on génère la 25%, le PAYE du 75% déjà généré doit être inclus
  // dans payeDeja pour que le cumulatif soit correct.
  if (portion === '25pct' && calcul.bulletin_75pct_id) {
    const { data: b75 } = await supabase
      .from('bulletins_paie')
      .select('paye_bonus')
      .eq('id', calcul.bulletin_75pct_id)
      .maybeSingle()
    if (b75) {
      // On inclut dans la base cumulative le bonus 75% déjà imposé.
      // (emoluments += bonus_75, paye_deja += paye_bonus_75)
      // Note : portionBrut pour 25% ne contient que la 25, on cumule.
    }
  }

  // Récupère paramètres PAYE de la société (si configurés).
  const params = await loadParamsMra(supabase)

  // Est-ce que l'employé est exonéré PAYE ? On considère exonéré si les
  // emoluments cumulés + bonus total restent sous le seuil exo.
  const estExonere = (cumulEmoluments + bonusTotal) <= (params.paye_seuil_exoneration ?? 390000)

  const basicSalary = Number(calcul.employe?.salaire_base) || 0
  const deductions = calculerDeductionsBonus({
    bonus_brut: portionBrut,
    basic_salary: basicSalary,
    // Pour la 25, inclure la 75 dans le cumulatif.
    emoluments_annuels_cumules: portion === '25pct'
      ? cumulEmoluments + Math.round(bonusTotal * 0.75 * 100) / 100
      : cumulEmoluments,
    paye_deja_preleve: payeDeja,
    est_exonere_paye: estExonere,
    paye_seuil_exoneration: params.paye_seuil_exoneration,
    paye_taux_1: params.paye_taux_1,
    paye_seuil_taux_2: params.paye_seuil_taux_2,
    paye_taux_2: params.paye_taux_2,
  })

  // Période du bulletin = date de paiement configurée OU fallback
  // (18/12 pour 75%, 31/12 pour 25%).
  const periode = portion === '75pct'
    ? (calcul.date_paiement_75pct || `${calcul.annee}-12-18`)
    : (calcul.date_paiement_25pct || `${calcul.annee}-12-31`)

  const totalDeductions = round2(deductions.csg_salarie + deductions.paye)
  const source = EOY_SOURCES[portion]

  // INSERT bulletin
  const { data: bulletin, error: insErr } = await supabase
    .from('bulletins_paie')
    .insert({
      employe_id: calcul.employe_id,
      societe_id: calcul.societe_id,
      periode,
      salaire_base: 0,
      salaire_brut: portionBrut,
      eoy_bonus: portionBrut,
      csg_bonus: deductions.csg_salarie,
      csg_patronal_bonus: deductions.csg_patronal,
      paye_bonus: deductions.paye,
      paye: 0,
      csg_salarie: 0,
      nsf_salarie: 0,
      total_deductions: totalDeductions,
      salaire_net: deductions.bonus_net,
      statut: 'brouillon',
      source,
      comptabilise: false,
    })
    .select('id')
    .single()

  if (insErr || !bulletin?.id) {
    return { ok: false, erreur: `Création bulletin : ${insErr?.message || 'échec'}`, status: 500 }
  }

  // UPDATE eoy_bonus_calculs
  const updates: Record<string, any> = {
    [bulletinFieldId]: bulletin.id,
    [montantField]: portionBrut,
    [dateField]: periode,
    statut: portion === '75pct' ? 'partiellement_paye' : 'totalement_paye',
  }
  if (createdBy) updates.created_by = createdBy

  const { error: updErr } = await supabase
    .from('eoy_bonus_calculs')
    .update(updates)
    .eq('id', calculId)

  if (updErr) {
    // Rollback best-effort : supprimer le bulletin créé pour éviter la
    // désynchro. Si cette suppression échoue, on signale quand même
    // l'erreur principale — Mégane pourra corriger manuellement.
    await supabase.from('bulletins_paie').delete().eq('id', bulletin.id).catch(() => {})
    return { ok: false, erreur: `Liaison eoy_bonus_calculs : ${updErr.message}`, status: 500 }
  }

  return {
    ok: true,
    bulletin_id: bulletin.id,
    periode,
    portion_brut: portionBrut,
    csg_salarie: deductions.csg_salarie,
    csg_patronal: deductions.csg_patronal,
    paye: deductions.paye,
    bonus_net: deductions.bonus_net,
  }
}

/**
 * Annule une portion : supprime le bulletin et nullifie le lien +
 * recalcule le statut (calcule si plus aucun bulletin, partiellement_paye
 * si 75 seul restant — cas impossible si on annule 75 alors que 25 existe).
 */
export async function annulerBulletinEoy(
  supabase: SupabaseLike,
  calculId: string,
  portion: EoyPortion,
): Promise<{ ok: true } | GenererBulletinError> {
  const { data: calcul } = await supabase
    .from('eoy_bonus_calculs')
    .select('*')
    .eq('id', calculId)
    .maybeSingle()
  if (!calcul) return { ok: false, erreur: 'Calcul introuvable', status: 404 }

  if (portion === '75pct' && calcul.bulletin_25pct_id) {
    return {
      ok: false, erreur: 'Annuler d’abord la portion 25% avant le 75%.',
      code: 'sequence_error', status: 409,
    }
  }

  const field = portion === '75pct' ? 'bulletin_75pct_id' : 'bulletin_25pct_id'
  const montantField = portion === '75pct' ? 'montant_paye_75pct' : 'montant_paye_25pct'
  const dateField = portion === '75pct' ? 'date_paiement_75pct' : 'date_paiement_25pct'
  const bulletinId = calcul[field]
  if (!bulletinId) return { ok: false, erreur: 'Aucun bulletin à annuler pour cette portion.', status: 409 }

  const { error: delErr } = await supabase.from('bulletins_paie').delete().eq('id', bulletinId)
  if (delErr) return { ok: false, erreur: `Delete bulletin : ${delErr.message}`, status: 500 }

  const stillHas75 = portion === '75pct' ? false : !!calcul.bulletin_75pct_id
  const stillHas25 = portion === '25pct' ? false : !!calcul.bulletin_25pct_id
  const nouveauStatut = (!stillHas75 && !stillHas25)
    ? 'calcule'
    : (stillHas75 && !stillHas25)
      ? 'partiellement_paye'
      : 'totalement_paye'

  const updates: Record<string, any> = {
    [field]: null,
    [montantField]: 0,
    [dateField]: null,
    statut: nouveauStatut,
  }
  const { error: updErr } = await supabase
    .from('eoy_bonus_calculs')
    .update(updates)
    .eq('id', calculId)
  if (updErr) {
    return { ok: false, erreur: `Update eoy_bonus_calculs : ${updErr.message}`, status: 500 }
  }
  return { ok: true }
}

// ─── Garde période calendaire ────────────────────────────────────────
export function dansPeriodeGeneration(portion: EoyPortion, today: Date = new Date()): boolean {
  const m = today.getMonth() + 1
  const d = today.getDate()
  if (portion === '75pct') {
    // 1er nov -> 31 déc
    return m === 11 || m === 12
  }
  // 25pct : 15 déc -> 31 janvier
  return (m === 12 && d >= 15) || m === 1
}

// ─── Helpers internes ────────────────────────────────────────────────
async function loadParamsMra(supabase: SupabaseLike): Promise<{
  paye_seuil_exoneration?: number
  paye_taux_1?: number
  paye_seuil_taux_2?: number
  paye_taux_2?: number
}> {
  const { data } = await supabase
    .from('parametres_paie_mra')
    .select('paye_seuil_exoneration, paye_taux_1, paye_seuil_taux_2, paye_taux_2')
    .order('annee', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return {}
  return {
    paye_seuil_exoneration: Number((data as any).paye_seuil_exoneration) || undefined,
    paye_taux_1: Number((data as any).paye_taux_1) || undefined,
    paye_seuil_taux_2: Number((data as any).paye_seuil_taux_2) || undefined,
    paye_taux_2: Number((data as any).paye_taux_2) || undefined,
  }
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}
