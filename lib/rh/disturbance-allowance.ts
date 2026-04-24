/**
 * Helper — Disturbance Allowance WRA S.17A FMPA 2024 (sprint G9).
 *
 * Calcule l'allocation pour heures travaillées pendant les unsocial
 * hours (semaine 22h-06h ou weekend samedi 13h → lundi 06h).
 *
 * Détection : délègue à la RPC SQL detecter_unsocial_hours (G9.1),
 * appelée pour chaque session fermée de pointages_sessions.
 *
 * Calcul : montant = heures_unsocial × taux_horaire × multiplier_societe
 * Taux horaire = salaire_base / 195 (45h × 4.33 semaines/mois).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export interface DisturbanceDetail {
  date_pointage: string
  heures_unsocial: number
  type_unsocial: 'weekday_night' | 'weekend' | null
  taux_horaire: number
  multiplier: number
  montant: number
}

export interface DisturbanceRecap {
  employe_id: string
  periode_debut: string
  periode_fin: string
  heures_weekday_night: number
  heures_weekend: number
  heures_total: number
  taux_horaire: number
  multiplier: number
  montant_total: number
  details: DisturbanceDetail[]
}

/** Heures mensuelles de référence WRA 2019 : 45 × 52 / 12. */
export const HEURES_PAR_MOIS = 195

/** Taux horaire = salaire_base / 195. */
export function tauxHoraireFromBasic(salaireBase: number): number {
  if (!Number.isFinite(salaireBase) || salaireBase <= 0) return 0
  return Math.round((salaireBase / HEURES_PAR_MOIS) * 100) / 100
}

interface UnsocialRaw {
  heures_weekday_night: number
  heures_weekend: number
  heures_total_unsocial: number
}

async function detecterUnsocialHoursDb(
  supabase: SupabaseLike,
  date: string,
  heureDebut: string,
  heureFin: string,
): Promise<UnsocialRaw> {
  const { data, error } = await supabase
    .rpc('detecter_unsocial_hours', {
      p_date: date,
      p_heure_debut: heureDebut,
      p_heure_fin: heureFin,
    })
    .maybeSingle()
  if (error || !data) return { heures_weekday_night: 0, heures_weekend: 0, heures_total_unsocial: 0 }
  return {
    heures_weekday_night: Number((data as any).heures_weekday_night) || 0,
    heures_weekend: Number((data as any).heures_weekend) || 0,
    heures_total_unsocial: Number((data as any).heures_total_unsocial) || 0,
  }
}

/**
 * Calcule la disturbance allowance d'un employé sur une période donnée.
 * Lit les sessions de `pointages_sessions` (type_session='travail',
 * heure_fin IS NOT NULL) entre periodeDebut et periodeFin (inclus).
 *
 * Retourne un recap + la liste détaillée (prête à insérer dans
 * disturbance_heures_detail).
 */
export async function calculerDisturbanceEmploye(
  supabase: SupabaseLike,
  employeId: string,
  periodeDebut: string,
  periodeFin: string,
  options: {
    multiplier?: number
    salaireBase?: number
    motif?: string | null
  } = {},
): Promise<DisturbanceRecap> {
  const multiplier = options.multiplier ?? 1.0
  let salaireBase = options.salaireBase ?? 0
  if (salaireBase === 0) {
    const { data: emp } = await supabase
      .from('employes').select('salaire_base').eq('id', employeId).maybeSingle()
    salaireBase = Number((emp as any)?.salaire_base) || 0
  }
  const tauxHoraire = tauxHoraireFromBasic(salaireBase)

  // Sessions travail fermées sur la période.
  const { data: sessions } = await supabase
    .from('pointages_sessions')
    .select('date_pointage, heure_debut, heure_fin')
    .eq('employe_id', employeId)
    .eq('type_session', 'travail')
    .not('heure_fin', 'is', null)
    .gte('date_pointage', periodeDebut)
    .lte('date_pointage', periodeFin)
    .order('date_pointage', { ascending: true })

  let heuresWeekdayNight = 0
  let heuresWeekend = 0
  const details: DisturbanceDetail[] = []

  for (const s of (sessions || []) as any[]) {
    if (!s.date_pointage || !s.heure_debut || !s.heure_fin) continue
    const raw = await detecterUnsocialHoursDb(
      supabase, String(s.date_pointage).slice(0, 10),
      String(s.heure_debut), String(s.heure_fin),
    )
    if (raw.heures_total_unsocial <= 0) continue

    heuresWeekdayNight += raw.heures_weekday_night
    heuresWeekend += raw.heures_weekend

    // Un détail par session — type dominant par session (weekday_night si
    // majoritaire, sinon weekend). Pour la table de détail on garde le
    // total unsocial agrégé par session.
    const dominant: 'weekday_night' | 'weekend' = raw.heures_weekday_night >= raw.heures_weekend
      ? 'weekday_night' : 'weekend'
    const montant = round2(raw.heures_total_unsocial * tauxHoraire * multiplier)
    details.push({
      date_pointage: String(s.date_pointage).slice(0, 10),
      heures_unsocial: round2(raw.heures_total_unsocial),
      type_unsocial: dominant,
      taux_horaire: tauxHoraire,
      multiplier,
      montant,
    })
  }

  const heuresTotal = round2(heuresWeekdayNight + heuresWeekend)
  const montantTotal = round2(heuresTotal * tauxHoraire * multiplier)

  return {
    employe_id: employeId,
    periode_debut: periodeDebut,
    periode_fin: periodeFin,
    heures_weekday_night: round2(heuresWeekdayNight),
    heures_weekend: round2(heuresWeekend),
    heures_total: heuresTotal,
    taux_horaire: tauxHoraire,
    multiplier,
    montant_total: montantTotal,
    details,
  }
}

/**
 * Persiste les détails dans disturbance_heures_detail (lie au bulletin
 * via bulletin_id). À appeler après la création du bulletin.
 * Idempotent côté table (pas de UNIQUE) mais on purge les anciens
 * détails liés à ce bulletin avant réinsertion pour éviter les doublons
 * sur un re-calcul.
 */
export async function sauvegarderDisturbanceBulletin(
  supabase: SupabaseLike,
  bulletinId: string,
  employeId: string,
  recap: DisturbanceRecap,
  motif: string | null = null,
): Promise<{ ok: boolean; inserted: number; erreur?: string }> {
  // Purge préalable (safe pour recalcul).
  await supabase.from('disturbance_heures_detail').delete().eq('bulletin_id', bulletinId)

  if (recap.details.length === 0) return { ok: true, inserted: 0 }

  const payload = recap.details.map(d => ({
    employe_id: employeId,
    bulletin_id: bulletinId,
    date_pointage: d.date_pointage,
    heures_unsocial: d.heures_unsocial,
    type_unsocial: d.type_unsocial,
    taux_horaire: d.taux_horaire,
    multiplier: d.multiplier,
    montant: d.montant,
    motif,
  }))
  const { error } = await supabase.from('disturbance_heures_detail').insert(payload)
  if (error) return { ok: false, inserted: 0, erreur: error.message }
  return { ok: true, inserted: payload.length }
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function formaterHeuresUnsocial(n: number): string {
  if (!Number.isFinite(n)) return '0h'
  const h = Math.floor(n)
  const m = Math.round((n - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}
