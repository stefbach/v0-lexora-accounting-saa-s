/**
 * Helper — période de paie paramétrable (sprint PE1).
 *
 * Source de vérité : colonnes societes.periode_paie_* + RPC
 * calculer_periode_paie(societe_id, date_reference).
 *
 * Le mode par défaut 'calendaire' reproduit le comportement historique :
 * 1er du mois -> dernier jour, paiement le dernier jour (rétrocompat).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export type PeriodePaieMode = 'calendaire' | 'cut_off_jour'

export interface PeriodePaieConfig {
  mode: PeriodePaieMode
  jour_cut_off: number            // 1..31, défaut 24
  jour_paiement: number | null    // NULL = dernier jour du mois
  offset_paiement_mois: 0 | 1     // 0 = même mois, 1 = mois suivant
  notes?: string | null
}

export interface PeriodePaieCalculee {
  periode_debut: string   // YYYY-MM-DD
  periode_fin: string     // YYYY-MM-DD
  date_paiement: string   // YYYY-MM-DD
  mode: PeriodePaieMode
  jour_cut_off: number
  jour_paiement: number | null
}

export const DEFAULT_CONFIG: PeriodePaieConfig = {
  mode: 'calendaire',
  jour_cut_off: 24,
  jour_paiement: null,
  offset_paiement_mois: 0,
}

/** Lit la config de la société depuis la table societes. */
export async function getPeriodePaieConfig(
  supabase: SupabaseLike,
  societeId: string,
): Promise<PeriodePaieConfig> {
  const { data } = await supabase
    .from('societes')
    .select('periode_paie_mode, periode_paie_jour_cut_off, periode_paie_jour_paiement, periode_paie_offset_paiement_mois, periode_paie_notes')
    .eq('id', societeId)
    .maybeSingle()
  if (!data) return { ...DEFAULT_CONFIG }
  const r = data as {
    periode_paie_mode?: string | null; periode_paie_jour_cut_off?: number | string | null
    periode_paie_jour_paiement?: number | string | null; periode_paie_offset_paiement_mois?: number | string | null
    periode_paie_notes?: string | null
  }
  return {
    mode: (r.periode_paie_mode as PeriodePaieMode) || 'calendaire',
    jour_cut_off: Number(r.periode_paie_jour_cut_off) || 24,
    jour_paiement: r.periode_paie_jour_paiement == null ? null : Number(r.periode_paie_jour_paiement),
    offset_paiement_mois: (Number(r.periode_paie_offset_paiement_mois) === 1 ? 1 : 0) as 0 | 1,
    notes: r.periode_paie_notes || null,
  }
}

/** Appelle la RPC DB et renvoie la période calculée. */
export async function calculerPeriodePaie(
  supabase: SupabaseLike,
  societeId: string,
  dateRef?: string,
): Promise<PeriodePaieCalculee> {
  const { data, error } = await supabase
    .rpc('calculer_periode_paie', {
      p_societe_id: societeId,
      p_date_reference: dateRef || new Date().toISOString().slice(0, 10),
    })
    .maybeSingle()
  if (error || !data) {
    // Fallback local : calendaire sur dateRef (ou mois courant).
    const cfg: PeriodePaieConfig = { ...DEFAULT_CONFIG }
    return calculerPeriodePaieSync(cfg, dateRef)
  }
  const r = data as {
    periode_debut: string; periode_fin: string; date_paiement: string
    mode?: string | null; jour_cut_off?: number | string | null; jour_paiement?: number | string | null
  }
  return {
    periode_debut: String(r.periode_debut).slice(0, 10),
    periode_fin: String(r.periode_fin).slice(0, 10),
    date_paiement: String(r.date_paiement).slice(0, 10),
    mode: (r.mode as PeriodePaieMode) || 'calendaire',
    jour_cut_off: Number(r.jour_cut_off) || 24,
    jour_paiement: r.jour_paiement == null ? null : Number(r.jour_paiement),
  }
}

/**
 * Version pure (sans DB) pour preview temps réel dans les formulaires.
 * Réplique fidèlement la logique de la RPC calculer_periode_paie.
 */
export function calculerPeriodePaieSync(
  cfg: PeriodePaieConfig,
  dateRef?: string,
): PeriodePaieCalculee {
  const ref = dateRef ? parseYMD(dateRef) : new Date()
  let debut: Date
  let fin: Date
  let moisPaie: number
  let anneePaie: number
  const cutOff = Math.max(1, Math.min(31, cfg.jour_cut_off || 24))

  if (cfg.mode === 'calendaire') {
    debut = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1))
    fin = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0))
    moisPaie = ref.getUTCMonth() + 1
    anneePaie = ref.getUTCFullYear()
  } else {
    const day = ref.getUTCDate()
    const baseMonth = day <= cutOff ? ref.getUTCMonth() : ref.getUTCMonth() + 1
    const finCandidate = new Date(Date.UTC(ref.getUTCFullYear(), baseMonth, cutOff))
    // Clamp si cutOff > dernier jour du mois (ex: cut_off=31 en février).
    const lastDayBaseMonth = new Date(Date.UTC(ref.getUTCFullYear(), baseMonth + 1, 0)).getUTCDate()
    fin = new Date(Date.UTC(ref.getUTCFullYear(), baseMonth, Math.min(cutOff, lastDayBaseMonth)))
    // debut = fin - 1 mois + 1 jour
    const d = new Date(finCandidate)
    d.setUTCMonth(d.getUTCMonth() - 1)
    d.setUTCDate(d.getUTCDate() + 1)
    debut = d
    moisPaie = fin.getUTCMonth() + 1
    anneePaie = fin.getUTCFullYear()
  }

  if (cfg.offset_paiement_mois === 1) {
    moisPaie += 1
    if (moisPaie > 12) {
      moisPaie = 1
      anneePaie += 1
    }
  }

  const dernierJourMoisPaie = new Date(Date.UTC(anneePaie, moisPaie, 0)).getUTCDate()
  const jourPaie =
    cfg.jour_paiement == null
      ? dernierJourMoisPaie
      : Math.min(cfg.jour_paiement, dernierJourMoisPaie)
  const paie = new Date(Date.UTC(anneePaie, moisPaie - 1, jourPaie))

  return {
    periode_debut: toYMD(debut),
    periode_fin: toYMD(fin),
    date_paiement: toYMD(paie),
    mode: cfg.mode,
    jour_cut_off: cutOff,
    jour_paiement: cfg.jour_paiement,
  }
}

function parseYMD(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(n => parseInt(n, 10))
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

function toYMD(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

/** "Avril 2026 (25/03 → 24/04, payé 28/04)" */
export function formaterPeriodeLibelle(p: PeriodePaieCalculee): string {
  const fin = parseYMD(p.periode_fin)
  const moisLabel = MOIS_FR[fin.getUTCMonth()] || ''
  const an = fin.getUTCFullYear()
  const fmt = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
  return `${moisLabel} ${an} (${fmt(p.periode_debut)} → ${fmt(p.periode_fin)}, payé ${fmt(p.date_paiement)})`
}

/** Format court : "25/03/2026 → 24/04/2026" (pour PDF). */
export function formaterPeriodeCourte(p: PeriodePaieCalculee): string {
  const fmt = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`
  return `${fmt(p.periode_debut)} → ${fmt(p.periode_fin)}`
}
