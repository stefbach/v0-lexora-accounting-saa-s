/**
 * Cotisations CSG / NSF (Maurice) — calcul unique, partagé par le bulletin
 * de paie (lib/rh/paie.ts) et l'export PACO MRA (lib/rh/declarations-mra-paco.ts).
 *
 * Règles validées par la MRA (juillet 2026) :
 *   CSG = round(base × taux_salarié) + round(base × taux_employeur)
 *         taux ≤ seuil (50 000) : 1,5 % + 3 % ; > seuil : 3 % + 6 %
 *   NSF = round(assiette × 1 %) + round(assiette × 2,5 %)
 *         assiette = min(base, plafond NSF de la période)
 * Chaque part est arrondie séparément, à la roupie, demi-unité vers le haut.
 * La part salarié du bulletin est donc exactement celle déclarée au PACO.
 *
 * Calcul en Decimal (aucun flottant natif) : 20 780 × 2,5 % = 519,5 → 520.
 * Taux et plafond viennent de la table datée `cotisations_mra_baremes`
 * (migration 513) — aucun taux légal en dur ici.
 */
import Decimal from 'decimal.js'
import { resolveParamsRow, type DatedParamsRow } from './tax-params'

export interface BaremeCotisationsMra {
  csg_seuil_taux_reduit: number
  csg_salarie_taux_reduit: number
  csg_salarie_taux_plein: number
  csg_patronal_taux_reduit: number
  csg_patronal_taux_plein: number
  nsf_salarie: number
  nsf_patronal: number
  nsf_plafond_mensuel: number
}

export interface CotisationsCsgNsf {
  csg_taux_salarie: number
  csg_taux_patronal: number
  csg_salarie: number
  csg_patronal: number
  nsf_assiette: number
  nsf_salarie: number
  nsf_patronal: number
  /** Colonne 10 PACO = csg_salarie + csg_patronal. */
  csg_total: number
  /** Colonne 11 PACO = nsf_salarie + nsf_patronal. */
  nsf_total: number
}

/** Arrondi MRA : roupie entière, demi-unité vers le haut (Decimal, sans flottant). */
export function arrondiMra(montant: Decimal.Value): number {
  return new Decimal(montant).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

/** Part de cotisation arrondie : round(base × taux). */
export function partCotisation(base: Decimal.Value, taux: Decimal.Value): number {
  return arrondiMra(new Decimal(base).times(taux))
}

/** Taux CSG salarié / employeur applicables à une base (même tranche pour les deux). */
export function tauxCsg(base: number, bareme: BaremeCotisationsMra): { salarie: number; patronal: number } {
  const reduit = new Decimal(base).lte(bareme.csg_seuil_taux_reduit)
  return reduit
    ? { salarie: bareme.csg_salarie_taux_reduit, patronal: bareme.csg_patronal_taux_reduit }
    : { salarie: bareme.csg_salarie_taux_plein, patronal: bareme.csg_patronal_taux_plein }
}

export function calculerCsgNsf(base: number, bareme: BaremeCotisationsMra): CotisationsCsgNsf {
  const b = Decimal.max(0, base)
  const taux = tauxCsg(b.toNumber(), bareme)
  const csg_salarie = partCotisation(b, taux.salarie)
  const csg_patronal = partCotisation(b, taux.patronal)

  const assiette = Decimal.min(b, bareme.nsf_plafond_mensuel)
  const nsf_salarie = partCotisation(assiette, bareme.nsf_salarie)
  const nsf_patronal = partCotisation(assiette, bareme.nsf_patronal)

  return {
    csg_taux_salarie: taux.salarie,
    csg_taux_patronal: taux.patronal,
    csg_salarie,
    csg_patronal,
    nsf_assiette: assiette.toNumber(),
    nsf_salarie,
    nsf_patronal,
    csg_total: csg_salarie + csg_patronal,
    nsf_total: nsf_salarie + nsf_patronal,
  }
}

const CHAMPS_BAREME: (keyof BaremeCotisationsMra)[] = [
  'csg_seuil_taux_reduit',
  'csg_salarie_taux_reduit',
  'csg_salarie_taux_plein',
  'csg_patronal_taux_reduit',
  'csg_patronal_taux_plein',
  'nsf_salarie',
  'nsf_patronal',
  'nsf_plafond_mensuel',
]

/**
 * Barème applicable à une date (YYYY-MM-DD) parmi les lignes de
 * `cotisations_mra_baremes`. Lève une erreur si aucune ligne ne couvre la
 * date ou si un champ manque : pas de repli silencieux sur un taux en dur.
 */
export function resoudreBaremeCotisations(rows: DatedParamsRow[], date: string): BaremeCotisationsMra {
  const couvrantes = rows.filter(
    (r) => r.date_debut && r.date_debut <= date && (!r.date_fin || r.date_fin >= date),
  )
  const row = resolveParamsRow(couvrantes, { date })
  if (!row) {
    throw new Error(`Aucun barème CSG/NSF (cotisations_mra_baremes) en vigueur au ${date}`)
  }
  const bareme = {} as BaremeCotisationsMra
  for (const champ of CHAMPS_BAREME) {
    const v = row[champ]
    if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) {
      throw new Error(`Barème CSG/NSF du ${row.date_debut} : champ ${champ} manquant`)
    }
    bareme[champ] = Number(v)
  }
  return bareme
}

/** Structure minimale du client Supabase utilisée ici (testable sans réseau). */
interface SupabaseSelect {
  from(table: string): { select(cols: string): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }
}

/** Charge et résout le barème CSG/NSF en vigueur au `date` (YYYY-MM-DD). */
export async function chargerBaremeCotisations(supabase: SupabaseSelect, date: string): Promise<BaremeCotisationsMra> {
  const { data, error } = await supabase.from('cotisations_mra_baremes').select('*')
  if (error) throw new Error(`Lecture cotisations_mra_baremes : ${error.message}`)
  return resoudreBaremeCotisations((data || []) as DatedParamsRow[], date)
}
