/**
 * Calcul des amortissements — universel
 * Supporte: linéaire, dégressif
 * Taux standards Maurice/IFRS:
 *   - Matériel informatique: 50%/an (2 ans)
 *   - Mobilier/Fixtures: 20%/an (5 ans)
 *   - Véhicules: 25%/an (4 ans)
 *   - Immobilier commercial: 5%/an (20 ans)
 *   - Logiciels: 50%/an (2 ans)
 */

export const TAUX_PAR_CATEGORIE: Record<string, number> = {
  materiel_informatique: 50,
  logiciel: 50,
  vehicule: 25,
  mobilier: 20,
  equipement: 20,
  immobilier: 5,
  autre: 20,
}

export interface ImmoInput {
  id: string
  date_acquisition: string
  cout_acquisition: number
  valeur_residuelle?: number
  taux_amortissement: number
  methode: 'lineaire' | 'degressif'
  date_cession?: string
}

export interface AmortissementAnnuel {
  exercice: string
  date_debut: string
  date_fin: string
  base_amortissable: number
  dotation: number
  cumul_avant: number
  cumul_apres: number
  valeur_nette: number
}

export function calculerAmortissements(
  immo: ImmoInput,
  exerciceDebut: number = new Date(immo.date_acquisition).getFullYear(),
  nbExercices: number = 10
): AmortissementAnnuel[] {
  const cout = immo.cout_acquisition
  const residuel = immo.valeur_residuelle || 0
  const base = cout - residuel
  const tauxAnnuel = immo.taux_amortissement / 100
  const resultats: AmortissementAnnuel[] = []

  let cumulAmort = 0
  let valeurNetteDebut = cout

  for (let i = 0; i < nbExercices; i++) {
    const annee = exerciceDebut + i
    const exercice = `${annee}-${annee + 1}`
    const dateDebut = `${annee}-07-01` // Exercice Maurice jul-jun (adaptable)
    const dateFin = `${annee + 1}-06-30`

    if (valeurNetteDebut <= residuel) break
    if (immo.date_cession && new Date(immo.date_cession) < new Date(dateDebut)) break

    let dotation: number
    if (immo.methode === 'degressif') {
      dotation = (valeurNetteDebut - residuel) * tauxAnnuel
    } else {
      dotation = base * tauxAnnuel
    }

    // Ne pas dépasser la valeur nette résiduelle
    dotation = Math.min(dotation, valeurNetteDebut - residuel)
    dotation = Math.round(dotation * 100) / 100

    const cumulApres = cumulAmort + dotation
    const valeurNette = cout - cumulApres

    resultats.push({
      exercice,
      date_debut: dateDebut,
      date_fin: dateFin,
      base_amortissable: base,
      dotation,
      cumul_avant: Math.round(cumulAmort * 100) / 100,
      cumul_apres: Math.round(cumulApres * 100) / 100,
      valeur_nette: Math.round(valeurNette * 100) / 100,
    })

    cumulAmort = cumulApres
    valeurNetteDebut = valeurNette

    if (valeurNette <= residuel) break
  }

  return resultats
}
