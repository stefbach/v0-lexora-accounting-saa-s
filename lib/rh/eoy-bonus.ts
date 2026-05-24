/**
 * Helper — End of Year Bonus WRA S.54 (sprint G11 Phase 1).
 *
 * Délègue le calcul aux RPC Postgres :
 *   - calculer_eoy_bonus(employe_id, annee)
 *   - calculer_eoy_bonus_societe(societe_id, annee)
 *
 * Expose aussi des utilitaires :
 *   - sauvegarde UPSERT dans eoy_bonus_calculs
 *   - calcul des dates de paiement 75% / 25%
 *   - récap société (total à payer, splits, warnings)
 *   - formatage MUR
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export interface EoyBonusCalcul {
  employe_id: string
  employe_nom?: string
  annee: number
  earnings_annuel: number
  nb_mois_travailles: number
  salaire_decembre: number | null
  moyenne_mensuelle: number
  base_calcul: number
  prorata: number
  bonus_calcule: number
  eligible: boolean
  motif_non_eligible: string | null
  bulletins_trouves: number
  bulletins_attendus: number
}

export interface EoyBonusRecap {
  societe_id: string
  annee: number
  total_bonus: number
  total_75pct: number
  total_25pct: number
  nb_eligibles: number
  nb_non_eligibles: number
  nb_bulletins_manquants_total: number
  nb_employes_avec_bulletins_manquants: number
  date_paiement_75pct: string  // YYYY-MM-DD
  date_paiement_25pct: string  // YYYY-MM-DD
}

export interface EoyBonusSauvegarde {
  id?: string
  employe_id: string
  societe_id: string
  annee: number
  earnings_annuel: number
  nb_mois_travailles: number
  salaire_decembre: number | null
  moyenne_mensuelle: number
  base_calcul: number
  prorata_applique: number
  bonus_calcule: number
  bulletins_trouves: number
  bulletins_attendus: number
  eligible: boolean
  motif_non_eligible: string | null
}

// ─── Calcul (RPC) ───────────────────────────────────────────────────
export async function calculerEoyBonusEmploye(
  supabase: SupabaseLike,
  employeId: string,
  annee: number,
): Promise<EoyBonusCalcul | null> {
  const { data, error } = await supabase
    .rpc('calculer_eoy_bonus', { p_employe_id: employeId, p_annee: annee })
    .maybeSingle()
  if (error || !data) return null
  return normaliserCalcul(data)
}

export async function calculerEoyBonusSociete(
  supabase: SupabaseLike,
  societeId: string,
  annee: number,
): Promise<EoyBonusCalcul[]> {
  const { data, error } = await supabase
    .rpc('calculer_eoy_bonus_societe', { p_societe_id: societeId, p_annee: annee })
  if (error || !data) return []
  return (data as any[]).map(normaliserCalcul)
}

function normaliserCalcul(raw: any): EoyBonusCalcul {
  return {
    employe_id: String(raw.employe_id),
    employe_nom: raw.employe_nom ? String(raw.employe_nom) : undefined,
    annee: Number(raw.annee) || 0,
    earnings_annuel: Number(raw.earnings_annuel) || 0,
    nb_mois_travailles: Number(raw.nb_mois_travailles) || 0,
    salaire_decembre: raw.salaire_decembre == null ? null : Number(raw.salaire_decembre),
    moyenne_mensuelle: Number(raw.moyenne_mensuelle) || 0,
    base_calcul: Number(raw.base_calcul) || 0,
    prorata: Number(raw.prorata) || 0,
    bonus_calcule: Number(raw.bonus_calcule) || 0,
    eligible: Boolean(raw.eligible),
    motif_non_eligible: raw.motif_non_eligible || null,
    bulletins_trouves: Number(raw.bulletins_trouves) || 0,
    bulletins_attendus: Number(raw.bulletins_attendus) || 0,
  }
}

// ─── Sauvegarde UPSERT ───────────────────────────────────────────────
export async function sauvegarderCalculEoy(
  supabase: SupabaseLike,
  calcul: EoyBonusSauvegarde,
  createdBy?: string | null,
): Promise<{ ok: boolean; id?: string; erreur?: string }> {
  const payload = {
    employe_id: calcul.employe_id,
    societe_id: calcul.societe_id,
    annee: calcul.annee,
    earnings_annuel: calcul.earnings_annuel,
    nb_mois_travailles: calcul.nb_mois_travailles,
    salaire_decembre: calcul.salaire_decembre,
    moyenne_mensuelle: calcul.moyenne_mensuelle,
    base_calcul: calcul.base_calcul,
    prorata_applique: calcul.prorata_applique,
    bonus_calcule: calcul.bonus_calcule,
    bulletins_trouves: calcul.bulletins_trouves,
    bulletins_attendus: calcul.bulletins_attendus,
    eligible: calcul.eligible,
    motif_non_eligible: calcul.motif_non_eligible,
    created_by: createdBy ?? null,
  }
  const { data, error } = await supabase
    .from('eoy_bonus_calculs')
    .upsert(payload, { onConflict: 'employe_id,annee' })
    .select('id')
    .single()
  if (error) return { ok: false, erreur: error.message }
  return { ok: true, id: data?.id }
}

export async function sauvegarderCalculsSociete(
  supabase: SupabaseLike,
  societeId: string,
  annee: number,
  calculs: EoyBonusCalcul[],
  createdBy?: string | null,
): Promise<{ saved: number; errors: Array<{ employe_id: string; erreur: string }> }> {
  let saved = 0
  const errors: Array<{ employe_id: string; erreur: string }> = []
  for (const c of calculs) {
    const res = await sauvegarderCalculEoy(
      supabase,
      {
        employe_id: c.employe_id,
        societe_id: societeId,
        annee,
        earnings_annuel: c.earnings_annuel,
        nb_mois_travailles: c.nb_mois_travailles,
        salaire_decembre: c.salaire_decembre,
        moyenne_mensuelle: c.moyenne_mensuelle,
        base_calcul: c.base_calcul,
        prorata_applique: c.prorata,
        bonus_calcule: c.bonus_calcule,
        bulletins_trouves: c.bulletins_trouves,
        bulletins_attendus: c.bulletins_attendus,
        eligible: c.eligible,
        motif_non_eligible: c.motif_non_eligible,
      },
      createdBy,
    )
    if (res.ok) saved++
    else errors.push({ employe_id: c.employe_id, erreur: res.erreur || 'échec' })
  }
  return { saved, errors }
}

export async function getCalculsExistants(
  supabase: SupabaseLike,
  societeId: string,
  annee: number,
): Promise<Array<EoyBonusCalcul & { id: string; statut: string; updated_at: string; bulletin_75pct_id: string | null; bulletin_25pct_id: string | null }>> {
  const { data } = await supabase
    .from('eoy_bonus_calculs')
    .select(`id, employe_id, societe_id, annee, earnings_annuel, nb_mois_travailles,
             salaire_decembre, moyenne_mensuelle, base_calcul, prorata_applique,
             bonus_calcule, eligible, motif_non_eligible, bulletins_trouves,
             bulletins_attendus, statut, updated_at,
             bulletin_75pct_id, bulletin_25pct_id,
             employes:employe_id(prenom, nom)`)
    .eq('societe_id', societeId)
    .eq('annee', annee)
    .order('updated_at', { ascending: false })

  return ((data || []) as any[]).map(r => ({
    id: String(r.id),
    employe_id: String(r.employe_id),
    employe_nom: r.employes
      ? `${r.employes.prenom || ''} ${r.employes.nom || ''}`.trim()
      : undefined,
    annee: Number(r.annee) || 0,
    earnings_annuel: Number(r.earnings_annuel) || 0,
    nb_mois_travailles: Number(r.nb_mois_travailles) || 0,
    salaire_decembre: r.salaire_decembre == null ? null : Number(r.salaire_decembre),
    moyenne_mensuelle: Number(r.moyenne_mensuelle) || 0,
    base_calcul: Number(r.base_calcul) || 0,
    prorata: Number(r.prorata_applique) || 0,
    bonus_calcule: Number(r.bonus_calcule) || 0,
    eligible: Boolean(r.eligible),
    motif_non_eligible: r.motif_non_eligible || null,
    bulletins_trouves: Number(r.bulletins_trouves) || 0,
    bulletins_attendus: Number(r.bulletins_attendus) || 0,
    statut: String(r.statut || 'calcule'),
    updated_at: String(r.updated_at || ''),
    bulletin_75pct_id: r.bulletin_75pct_id || null,
    bulletin_25pct_id: r.bulletin_25pct_id || null,
  }))
}

// ─── Dates de paiement 75/25 (auto) ─────────────────────────────────
/**
 * 75% : 5 jours ouvrables avant le 25/12 (skip samedi/dimanche ET
 * jours fériés Maurice si fournis).
 *
 * Le 25/12 est exclu du compte (on part de la veille 24/12 et on recule).
 */
export function getDatePaiement75Pct(annee: number, joursFeries: Set<string> = new Set()): string {
  let d = new Date(Date.UTC(annee, 11, 25)) // 25/12
  // Recule de 1 jour à la fois jusqu'à avoir 5 jours ouvrables comptés.
  let joursOuvrables = 0
  while (joursOuvrables < 5) {
    d = new Date(d.getTime() - 86400000)
    const dow = d.getUTCDay()
    const ymd = toYMD(d)
    const estOuvrable = dow !== 0 && dow !== 6 && !joursFeries.has(ymd)
    if (estOuvrable) joursOuvrables++
  }
  return toYMD(d)
}

/**
 * 25% : 31/12 ou le dernier jour ouvrable de décembre (si 31/12 est
 * week-end ou férié, on recule).
 */
export function getDatePaiement25Pct(annee: number, joursFeries: Set<string> = new Set()): string {
  let d = new Date(Date.UTC(annee, 11, 31))
  while (true) {
    const dow = d.getUTCDay()
    const ymd = toYMD(d)
    if (dow !== 0 && dow !== 6 && !joursFeries.has(ymd)) return ymd
    d = new Date(d.getTime() - 86400000)
  }
}

function toYMD(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// ─── Récap ───────────────────────────────────────────────────────────
export function calculerRecapSociete(
  societeId: string,
  annee: number,
  calculs: EoyBonusCalcul[],
  joursFeries: Set<string> = new Set(),
  overrideDate75?: string | null,
  overrideDate25?: string | null,
): EoyBonusRecap {
  const eligibles = calculs.filter(c => c.eligible)
  const nonEligibles = calculs.filter(c => !c.eligible)
  const totalBonus = eligibles.reduce((s, c) => s + c.bonus_calcule, 0)
  const total75 = Math.round(totalBonus * 0.75 * 100) / 100
  const total25 = Math.round((totalBonus - total75) * 100) / 100

  const avecBulletinsManquants = eligibles.filter(
    c => c.bulletins_trouves < c.bulletins_attendus,
  )
  const nbBulletinsManquantsTotal = avecBulletinsManquants.reduce(
    (s, c) => s + Math.max(0, c.bulletins_attendus - c.bulletins_trouves),
    0,
  )

  return {
    societe_id: societeId,
    annee,
    total_bonus: Math.round(totalBonus * 100) / 100,
    total_75pct: total75,
    total_25pct: total25,
    nb_eligibles: eligibles.length,
    nb_non_eligibles: nonEligibles.length,
    nb_bulletins_manquants_total: nbBulletinsManquantsTotal,
    nb_employes_avec_bulletins_manquants: avecBulletinsManquants.length,
    date_paiement_75pct: overrideDate75 || getDatePaiement75Pct(annee, joursFeries),
    date_paiement_25pct: overrideDate25 || getDatePaiement25Pct(annee, joursFeries),
  }
}

// ─── Format ──────────────────────────────────────────────────────────
export function formaterMontantMUR(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n))} MUR`.replace(/[\u00A0\u202F\u2009]/g, ' ')
}

export function formaterPct(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(decimals)}%`
}

export const MOTIFS_NON_ELIGIBLES_LABELS: Record<string, string> = {
  employe_inexistant: 'Employé introuvable',
  pas_employe_pendant_annee: 'Pas employé pendant cette année',
  demission_avant_8_mois: 'Démission avant 8 mois de service',
}

export function getMotifLabel(motif: string | null): string {
  if (!motif) return '—'
  if (motif.startsWith('salaire_superieur_seuil_')) {
    const seuil = motif.replace('salaire_superieur_seuil_', '')
    return `Salaire > seuil (${seuil} MUR)`
  }
  return MOTIFS_NON_ELIGIBLES_LABELS[motif] || motif
}

// ─── G11.6 — Déductions MRA sur EOY Bonus ────────────────────────────
//
// Règles MRA (mra.mu, Social Contribution Act 2021) :
//
//   CSG : s'applique sur le bonus (basic wage component uniquement,
//         taux réduit si basic ≤ 50 000).
//           basic ≤ 50 000 : 1.5% salarié + 3%  patronal
//           basic > 50 000 : 3%   salarié + 6%  patronal
//
//   NSF + Training Levy : ne s'appliquent PAS au bonus.
//
//   PAYE : système cumulatif MRA. On reconstitue le PAYE total annuel
//          (emoluments + bonus) sur les tranches Finance Act 2025/26
//          puis on soustrait le PAYE déjà prélevé.

export interface DeductionsBonus {
  csg_salarie: number
  csg_patronal: number
  paye: number
  nsf: 0
  training_levy: 0
  bonus_net: number
}

export interface CalculDeductionsInput {
  /** Portion du bonus à imposer (75% ou 25% du total). */
  bonus_brut: number
  /** Salaire de base mensuel (déclenche le taux CSG). */
  basic_salary: number
  /** Cumul annuel des emoluments hors EOY déjà déclarés. */
  emoluments_annuels_cumules: number
  /** PAYE déjà prélevé sur les bulletins mensuels (YTD). */
  paye_deja_preleve: number
  /** TRUE si emoluments ≤ seuil exonération PAYE. */
  est_exonere_paye: boolean
  paye_seuil_exoneration?: number
  paye_taux_1?: number
  paye_seuil_taux_2?: number
  paye_taux_2?: number
}

const DEFAULT_PAYE_SEUIL_EXONERATION = 390000
const DEFAULT_PAYE_TAUX_1 = 0.10
const DEFAULT_PAYE_SEUIL_TAUX_2 = 650000
const DEFAULT_PAYE_TAUX_2 = 0.15

function payeAnnuelSurIncome(
  income: number,
  seuilExo = DEFAULT_PAYE_SEUIL_EXONERATION,
  taux1 = DEFAULT_PAYE_TAUX_1,
  seuilTaux2 = DEFAULT_PAYE_SEUIL_TAUX_2,
  taux2 = DEFAULT_PAYE_TAUX_2,
): number {
  if (income <= seuilExo) return 0
  if (income <= seuilTaux2) return (income - seuilExo) * taux1
  return (seuilTaux2 - seuilExo) * taux1 + (income - seuilTaux2) * taux2
}

/**
 * Déductions MRA sur une portion EOY (75% ou 25%).
 * Tous les montants arrondis à 2 décimales.
 */
export function calculerDeductionsBonus(params: CalculDeductionsInput): DeductionsBonus {
  const bonus = Math.max(0, Number(params.bonus_brut) || 0)
  const basic = Math.max(0, Number(params.basic_salary) || 0)
  const cumul = Math.max(0, Number(params.emoluments_annuels_cumules) || 0)
  const payeDeja = Math.max(0, Number(params.paye_deja_preleve) || 0)

  const tauxCsgSal = basic <= 50000 ? 0.015 : 0.03
  const tauxCsgPat = basic <= 50000 ? 0.03 : 0.06
  const csgSalarie = round2Local(bonus * tauxCsgSal)
  const csgPatronal = round2Local(bonus * tauxCsgPat)

  let paye = 0
  if (!params.est_exonere_paye && bonus > 0) {
    const seuilExo = params.paye_seuil_exoneration ?? DEFAULT_PAYE_SEUIL_EXONERATION
    const taux1 = params.paye_taux_1 ?? DEFAULT_PAYE_TAUX_1
    const seuilTaux2 = params.paye_seuil_taux_2 ?? DEFAULT_PAYE_SEUIL_TAUX_2
    const taux2 = params.paye_taux_2 ?? DEFAULT_PAYE_TAUX_2
    const payeTotal = payeAnnuelSurIncome(cumul + bonus, seuilExo, taux1, seuilTaux2, taux2)
    paye = round2Local(Math.max(0, payeTotal - payeDeja))
  }

  const bonusNet = round2Local(bonus - csgSalarie - paye)
  return {
    csg_salarie: csgSalarie,
    csg_patronal: csgPatronal,
    paye,
    nsf: 0,
    training_levy: 0,
    bonus_net: bonusNet,
  }
}

function round2Local(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function formaterCsgBonus(csg: number, basic: number): string {
  const pct = basic <= 50000 ? '1.5%' : '3%'
  return `CSG sur bonus (${pct}) : ${formaterMontantMUR(csg)}`
}

export function formaterPayeBonus(paye: number): string {
  return paye > 0
    ? `PAYE sur bonus (MRA cumulatif) : ${formaterMontantMUR(paye)}`
    : 'PAYE sur bonus : exonéré'
}
