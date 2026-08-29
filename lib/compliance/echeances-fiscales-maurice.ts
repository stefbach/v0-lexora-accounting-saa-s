/**
 * lib/compliance/echeances-fiscales-maurice.ts
 *
 * Calendrier des OBLIGATIONS FISCALES & SOCIALES mauriciennes — pour la cible
 * « dirigeant autonome » (TPE/PME/indépendant) qui veut savoir « suis-je en
 * règle ? » sans être comptable.
 *
 * Génère les échéances récurrentes MRA à partir du profil de la société
 * (assujettie TVA ? salariés ? TDS ? date de clôture) sur un horizon donné.
 *
 * ⚠️ Règles de dates (MRA, e-filing) retenues, à conserver à jour :
 *   - TVA        : déclaration + paiement dus pour la FIN DU MOIS SUIVANT la
 *                  période (mensuelle si CA > 10 MUR, sinon trimestrielle).
 *   - Paie (PAYE + CSG + NSF + Training Levy) : dus pour la fin du mois suivant
 *                  le mois de paie.
 *   - TDS        : reversé mensuellement, fin du mois suivant.
 *   - IT Form 3 (état TDS annuel) : 30 septembre (réf. skill lexora-mra-tds).
 *   - Impôt sur les sociétés (CIT) : dans les 6 mois suivant la clôture.
 *
 * Ces dates sont des repères de prudence (fin de mois) ; le calendrier exact
 * MRA de l'année peut accorder quelques jours de plus pour l'e-paiement.
 * Fonctions PURES → testables.
 */

export type ObligationType = 'tva' | 'paie' | 'tds' | 'cit' | 'it_form3'
export type Frequence = 'mensuelle' | 'trimestrielle' | 'annuelle'
export type StatutEcheance = 'en_retard' | 'proche' | 'a_venir'

export interface ProfilConformite {
  /** Assujettie à la TVA (numéro TVA MRA renseigné, ou CA > 6 MUR). */
  tva_assujetti: boolean
  /** Périodicité TVA : mensuelle (CA > 10 MUR) ou trimestrielle. */
  tva_frequence: 'mensuelle' | 'trimestrielle'
  /** A des salariés → déclarations paie MRA mensuelles. */
  a_salaries: boolean
  /** Applique la retenue à la source (TDS) sur certains paiements fournisseurs. */
  applique_tds: boolean
  /** Date de clôture d'exercice, 'YYYY-MM-DD' ou 'MM-DD'. Pour l'échéance CIT. */
  date_fin_exercice?: string | null
}

export interface EcheanceFiscale {
  id: string
  type: ObligationType
  titre: string
  detail: string
  autorite: 'MRA'
  frequence: Frequence
  /** Période concernée, ex. « août 2026 » ou « T3 2026 ». */
  periode: string
  /** Date limite (YYYY-MM-DD). */
  date_echeance: string
}

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function pad(n: number): string { return String(n).padStart(2, '0') }

/** Dernier jour du mois (moisIndex0 : 0 = janvier), en YYYY-MM-DD. */
export function finDeMois(annee: number, moisIndex0: number): string {
  const d = new Date(Date.UTC(annee, moisIndex0 + 1, 0))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function labelMois(annee: number, moisIndex0: number): string {
  return `${MOIS_FR[((moisIndex0 % 12) + 12) % 12]} ${annee}`
}

/** Ajoute n mois à un ancrage (annee, moisIndex0) → { annee, mois }. */
function ajouterMois(annee: number, moisIndex0: number, n: number): { annee: number; mois: number } {
  const total = annee * 12 + moisIndex0 + n
  return { annee: Math.floor(total / 12), mois: ((total % 12) + 12) % 12 }
}

function parseYMD(s: string): { annee: number; mois: number; jour: number } {
  const [y, m, d] = s.split('-').map(Number)
  return { annee: y, mois: (m || 1) - 1, jour: d || 1 }
}

/** Statut d'une échéance vis-à-vis d'aujourd'hui. */
export function statutEcheance(dateEcheance: string, aujourdhui: string, seuilProcheJours = 14): StatutEcheance {
  const ech = Date.parse(dateEcheance + 'T00:00:00Z')
  const now = Date.parse(aujourdhui + 'T00:00:00Z')
  if (ech < now) return 'en_retard'
  const jours = (ech - now) / 86_400_000
  return jours <= seuilProcheJours ? 'proche' : 'a_venir'
}

/** Trimestre (0-3) d'un mois index0, et son libellé. */
function trimestreDe(moisIndex0: number): number { return Math.floor(moisIndex0 / 3) }

/**
 * Génère les échéances fiscales sur [from - lookbackMois, from + horizonMois].
 * `from` par défaut = aujourd'hui. Pure et déterministe.
 */
export function genererEcheancesFiscales(
  profil: ProfilConformite,
  opts: { from?: string; horizonMois?: number; lookbackMois?: number } = {},
): EcheanceFiscale[] {
  const from = opts.from || new Date().toISOString().slice(0, 10)
  const horizonMois = opts.horizonMois ?? 4
  const lookbackMois = opts.lookbackMois ?? 2
  const { annee: y0, mois: m0 } = parseYMD(from)

  const inf = ajouterMois(y0, m0, -lookbackMois)
  const sup = ajouterMois(y0, m0, horizonMois)
  const bornInf = finDeMois(inf.annee, inf.mois)
  const bornSup = finDeMois(sup.annee, sup.mois)
  const dansFenetre = (d: string) => d >= bornInf && d <= bornSup

  const out: EcheanceFiscale[] = []

  // Parcours des mois-ancre (le mois dont la fin porte l'échéance).
  for (let k = -lookbackMois; k <= horizonMois; k++) {
    const { annee: ay, mois: am } = ajouterMois(y0, m0, k)
    const echeance = finDeMois(ay, am)
    if (!dansFenetre(echeance)) continue

    // La période déclarée = le mois PRÉCÉDENT l'échéance.
    const { annee: py, mois: pm } = ajouterMois(ay, am, -1)
    const periodeMois = labelMois(py, pm)

    // TVA mensuelle
    if (profil.tva_assujetti && profil.tva_frequence === 'mensuelle') {
      out.push({
        id: `tva-${ay}-${pad(am + 1)}`, type: 'tva', autorite: 'MRA', frequence: 'mensuelle',
        titre: 'Déclaration TVA (VAT)', detail: `Déclaration + paiement TVA — ${periodeMois}`,
        periode: periodeMois, date_echeance: echeance,
      })
    }

    // TVA trimestrielle : échéance le mois suivant la fin de trimestre
    // (fin de trimestre = mars/juin/sept/déc → échéance avril/juil/oct/janv).
    if (profil.tva_assujetti && profil.tva_frequence === 'trimestrielle') {
      const moisFinTrimestre = [2, 5, 8, 11] // mars, juin, sept, déc (index0)
      if (moisFinTrimestre.includes(pm)) {
        const tri = trimestreDe(pm) + 1
        const label = `T${tri} ${py}`
        out.push({
          id: `tva-${py}-T${tri}`, type: 'tva', autorite: 'MRA', frequence: 'trimestrielle',
          titre: 'Déclaration TVA (VAT) trimestrielle', detail: `Déclaration + paiement TVA — ${label}`,
          periode: label, date_echeance: echeance,
        })
      }
    }

    // Déclarations paie MRA (PAYE + CSG + NSF + Training Levy)
    if (profil.a_salaries) {
      out.push({
        id: `paie-${ay}-${pad(am + 1)}`, type: 'paie', autorite: 'MRA', frequence: 'mensuelle',
        titre: 'Déclarations paie MRA (PAYE, CSG, NSF)',
        detail: `PAYE + CSG + NSF + Training Levy — paie de ${periodeMois}`,
        periode: periodeMois, date_echeance: echeance,
      })
    }

    // TDS (retenue à la source) mensuelle
    if (profil.applique_tds) {
      out.push({
        id: `tds-${ay}-${pad(am + 1)}`, type: 'tds', autorite: 'MRA', frequence: 'mensuelle',
        titre: 'Reversement TDS', detail: `Retenue à la source — ${periodeMois}`,
        periode: periodeMois, date_echeance: echeance,
      })
    }
  }

  // IT Form 3 (état TDS annuel) — 30 septembre de chaque année de la fenêtre.
  if (profil.applique_tds) {
    for (let ay = parseYMD(bornInf).annee; ay <= parseYMD(bornSup).annee; ay++) {
      const ech = `${ay}-09-30`
      if (dansFenetre(ech)) {
        out.push({
          id: `itform3-${ay}`, type: 'it_form3', autorite: 'MRA', frequence: 'annuelle',
          titre: 'IT Form 3 (état TDS annuel)', detail: `État annuel des retenues à la source ${ay}`,
          periode: String(ay), date_echeance: ech,
        })
      }
    }
  }

  // Impôt sur les sociétés (CIT) — 6 mois après la clôture.
  if (profil.date_fin_exercice) {
    const raw = profil.date_fin_exercice.length <= 5
      ? `${parseYMD(bornSup).annee}-${profil.date_fin_exercice}` // 'MM-DD' → année de la fenêtre
      : profil.date_fin_exercice
    const { mois: cm } = parseYMD(raw)
    // Échéance = fin du 6e mois après le mois de clôture, sur chaque année couverte.
    for (let ay = parseYMD(bornInf).annee - 1; ay <= parseYMD(bornSup).annee; ay++) {
      const cible = ajouterMois(ay, cm, 6)
      const ech = finDeMois(cible.annee, cible.mois)
      if (dansFenetre(ech)) {
        out.push({
          id: `cit-${ay}`, type: 'cit', autorite: 'MRA', frequence: 'annuelle',
          titre: 'Impôt sur les sociétés (CIT)',
          detail: `Déclaration annuelle d'impôt — exercice clos ${labelMois(ay, cm)}`,
          periode: `Exercice ${ay}`, date_echeance: ech,
        })
      }
    }
  }

  // Tri par date d'échéance croissante, dédoublonnage par id.
  const seen = new Set<string>()
  return out
    .filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => a.date_echeance.localeCompare(b.date_echeance))
}
