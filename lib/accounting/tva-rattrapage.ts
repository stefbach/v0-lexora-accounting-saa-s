// =============================================================================
// lib/accounting/tva-rattrapage.ts
// Logique pure du suivi déclaratif / rattrapage TVA (Maurice).
// Extrait de la route API pour être testable unitairement.
// =============================================================================

export interface PeriodeAttendue {
  periode: string          // YYYY-MM (mois, ou mois de fin du trimestre)
  trimestre: string | null // YYYY-Qn pour le trimestriel
  label: string            // libellé lisible
  type: 'mensuel' | 'trimestriel'
  mois: string[]           // mois YYYY-MM couverts (1 ou 3)
  date_limite: string
}

export function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

// Date limite MRA : le 20 du mois qui suit la fin de la période.
export function dateLimite(year: number, endMonth: number): string {
  const m = endMonth === 12 ? 1 : endMonth + 1
  const y = endMonth === 12 ? year + 1 : year
  return `${y}-${String(m).padStart(2, '0')}-20`
}

// Génère la liste des périodes attendues entre deux mois inclus.
export function genererPeriodes(
  startY: number, startM: number,
  endY: number, endM: number,
  frequence: 'mensuelle' | 'trimestrielle',
): PeriodeAttendue[] {
  const out: PeriodeAttendue[] = []
  if (frequence === 'mensuelle') {
    let y = startY, m = startM
    while (y < endY || (y === endY && m <= endM)) {
      out.push({
        periode: ym(y, m),
        trimestre: null,
        label: ym(y, m),
        type: 'mensuel',
        mois: [ym(y, m)],
        date_limite: dateLimite(y, m),
      })
      m++; if (m > 12) { m = 1; y++ }
    }
  } else {
    let y = startY
    let q = Math.floor((startM - 1) / 3) + 1
    const endQ = Math.floor((endM - 1) / 3) + 1
    while (y < endY || (y === endY && q <= endQ)) {
      const endMonthQ = q * 3
      const mois = [endMonthQ - 2, endMonthQ - 1, endMonthQ].map(mm => ym(y, mm))
      out.push({
        periode: ym(y, endMonthQ),
        trimestre: `${y}-Q${q}`,
        label: `${y}-Q${q}`,
        type: 'trimestriel',
        mois,
        date_limite: dateLimite(y, endMonthQ),
      })
      q++; if (q > 4) { q = 1; y++ }
    }
  }
  return out
}

// Reconnaît un paiement TVA à la MRA d'après le libellé bancaire.
// Détection volontairement simple ; le rapprochement automatique complet
// reste géré par le module de rapprochement.
const MRA_REGEX = /\b(m\.?r\.?a|mauritius revenue|vat|t\.?v\.?a)\b/i
export function isMraPayment(libelle: string | null | undefined): boolean {
  if (!libelle) return false
  return MRA_REGEX.test(libelle)
}

// Pénalité MRA estimée sur une TVA nette en retard : 5% one-shot + 0,5%/mois
// (VAT Act §24). `moisRetard` est borné à 1 minimum.
export function penaliteRetard(tvaNette: number, moisRetard: number): number {
  if (tvaNette <= 0) return 0
  const mr = Math.max(1, moisRetard)
  return Math.round((tvaNette * 0.05 + tvaNette * 0.005 * mr) * 100) / 100
}
