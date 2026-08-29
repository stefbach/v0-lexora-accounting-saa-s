/**
 * lib/reporting/prevision-tresorerie.ts — Prévision de trésorerie simple (cible A).
 *
 * Pour le dirigeant autonome : « vais-je être à court d'argent ? ». À partir du
 * solde bancaire d'aujourd'hui, on projette la trésorerie à 30 / 60 / 90 jours
 * en additionnant les encaissements attendus (factures clients à échéance) et en
 * retranchant les décaissements connus (factures fournisseurs, échéances MRA).
 *
 * Pur → testable. Montants MUR via lib/money (jamais de flottant natif).
 * La page parente assemble les flux depuis /api/client/financial ; ici on ne
 * fait que la projection.
 */

import { round2, addMoney, subMoney } from '@/lib/money'

export type CategorieFlux = 'client' | 'fournisseur' | 'tva' | 'is' | 'autre'

export interface FluxTresorerie {
  /** Date attendue du flux (AAAA-MM-JJ). */
  date: string
  /** Montant signé : >0 encaissement, <0 décaissement. */
  montant: number
  libelle: string
  categorie: CategorieFlux
}

export interface PointPrevision {
  horizon_jours: number
  date: string
  entrees_cumul: number
  sorties_cumul: number
  solde_projete: number
}

export interface Prevision {
  solde_initial: number
  date_reference: string
  points: PointPrevision[]
  /** Solde projeté le plus bas sur l'horizon max. */
  solde_min: number
  date_solde_min: string | null
  /** Le solde passe-t-il sous zéro sur l'horizon ? */
  risque_decouvert: boolean
  /** Premier jour où le solde projeté devient négatif (ou null). */
  premier_jour_negatif: string | null
}

/** Ajoute n jours à une date AAAA-MM-JJ (UTC), renvoie AAAA-MM-JJ. */
export function ajouterJours(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Construit la prévision de trésorerie.
 *
 * @param solde_initial  Trésorerie disponible aujourd'hui (MUR).
 * @param flux           Flux datés attendus (signés).
 * @param date_reference Date « aujourd'hui » (AAAA-MM-JJ).
 * @param horizons       Jalons en jours (défaut 30/60/90).
 */
export function construirePrevision(
  solde_initial: number,
  flux: FluxTresorerie[],
  date_reference: string,
  horizons: number[] = [30, 60, 90],
): Prevision {
  const horizonsTri = [...horizons].sort((a, b) => a - b)
  const horizonMax = horizonsTri[horizonsTri.length - 1] ?? 0
  const dateMax = ajouterJours(date_reference, horizonMax)

  // Un flux en retard (date < référence) est attendu de façon imminente : on le
  // ramène à la date de référence plutôt que de l'ignorer.
  const fluxNormalises = flux
    .map(f => ({ ...f, date: f.date < date_reference ? date_reference : f.date }))
    .filter(f => f.date <= dateMax)
    .sort((a, b) => a.date.localeCompare(b.date))

  let solde = round2(solde_initial)
  let entrees = 0
  let sorties = 0
  let solde_min = solde
  let date_solde_min: string | null = date_reference
  let premier_jour_negatif: string | null = null

  const points: PointPrevision[] = []
  let idx = 0

  for (const h of horizonsTri) {
    const dateH = ajouterJours(date_reference, h)
    // Applique tous les flux jusqu'à cette date incluse.
    while (idx < fluxNormalises.length && fluxNormalises[idx].date <= dateH) {
      const f = fluxNormalises[idx]
      solde = f.montant >= 0 ? addMoney(solde, f.montant) : subMoney(solde, -f.montant)
      if (f.montant >= 0) entrees = addMoney(entrees, f.montant)
      else sorties = addMoney(sorties, -f.montant)
      if (solde < solde_min) { solde_min = solde; date_solde_min = f.date }
      if (solde < 0 && premier_jour_negatif === null) premier_jour_negatif = f.date
      idx++
    }
    points.push({
      horizon_jours: h,
      date: dateH,
      entrees_cumul: round2(entrees),
      sorties_cumul: round2(sorties),
      solde_projete: round2(solde),
    })
  }

  return {
    solde_initial: round2(solde_initial),
    date_reference,
    points,
    solde_min: round2(solde_min),
    date_solde_min,
    risque_decouvert: solde_min < 0,
    premier_jour_negatif,
  }
}
