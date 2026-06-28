import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * IT Form 3 — APS (Advance Payment System) eligibility.
 *
 * Référence légale : Income Tax Act 1995, Section 111A(1)(a).
 *
 * Le critère APS s'évalue sur l'année N-1 (« in the preceding income
 * year »), PAS sur l'année courante de déclaration. La société paye
 * l'APS trimestriel si son gross income N-1 dépasse le seuil OU si son
 * impôt N-1 dépasse 50 000 MUR.
 *
 * Exception ITA s.111A(2) : la première année d'activité est exemptée
 * d'APS (pas de N-1 disponible, donc pas de critère applicable).
 *
 * Le seuil par défaut est aligné sur la pratique opérationnelle du MRA
 * pour les sociétés non-GBC (6 000 000 MUR). Pour le critère ITA strict
 * (10 000 000 MUR), passer `threshold: 10_000_000` explicitement.
 */
export const APS_THRESHOLD_REVENUS = 6_000_000
export const APS_THRESHOLD_IMPOT = 50_000

export interface IsApsApplicableInput {
  priorYearTotalRevenus: number | null | undefined
  priorYearImpotCalcule?: number | null | undefined
  firstYear: boolean
  /** Seuil de revenu N-1 déclenchant l'APS (défaut 6 000 000 MUR). */
  threshold?: number
}

/**
 * Détermine si le régime APS est applicable au titre d'un exercice donné.
 * Pure function : aucune dépendance Supabase, testable en isolation.
 */
export function isApsApplicable(input: IsApsApplicableInput): boolean {
  if (input.firstYear) return false // ITA s.111A(2) — exemption première année
  const revenus = input.priorYearTotalRevenus ?? 0
  const impot = input.priorYearImpotCalcule ?? 0
  const seuilRevenus = input.threshold ?? APS_THRESHOLD_REVENUS
  return revenus > seuilRevenus || impot > APS_THRESHOLD_IMPOT
}

/**
 * GET /api/mra/it-form3?societe_id=…&exercice=YYYY-YYYY
 *
 * Retourne l'évaluation APS pour l'exercice donné en se basant sur les
 * revenus N-1 chargés depuis `it_form3` ou `financial_summary`.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return apiError('unauthorized', 401)
    }

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice = searchParams.get('exercice')
    const firstYear = searchParams.get('first_year') === 'true'

    if (!societe_id || !exercice) {
      return NextResponse.json(
        { error: 'societe_id et exercice requis' },
        { status: 400 },
      )
    }

    // Calcule l'exercice N-1 à partir du format `YYYY-YYYY`.
    const [startStr, endStr] = exercice.split('-')
    const startYear = parseInt(startStr, 10)
    const endYear = parseInt(endStr, 10)
    if (Number.isNaN(startYear) || Number.isNaN(endYear)) {
      return NextResponse.json(
        { error: 'exercice doit être au format YYYY-YYYY' },
        { status: 400 },
      )
    }
    const priorExercice = `${startYear - 1}-${endYear - 1}`

    // Charge les revenus N-1 depuis l'IT Form 3 N-1 (source de vérité
    // pour le gross income déclaré au MRA).
    let priorTotalRevenus = 0
    let priorImpotCalcule = 0
    const { data: priorForm } = await supabase
      .from('it_form3')
      .select('revenus, tax_calculation')
      .eq('societe_id', societe_id)
      .eq('exercice', priorExercice)
      .maybeSingle()

    if (priorForm) {
      const revenus = (priorForm as { revenus?: { totalRevenus?: number } })
        .revenus
      const taxCalc = (priorForm as { tax_calculation?: { impotCalcule?: number } })
        .tax_calculation
      priorTotalRevenus = revenus?.totalRevenus ?? 0
      priorImpotCalcule = taxCalc?.impotCalcule ?? 0
    }

    const applicable = isApsApplicable({
      priorYearTotalRevenus: priorTotalRevenus,
      priorYearImpotCalcule: priorImpotCalcule,
      firstYear,
    })

    return NextResponse.json({
      societe_id,
      exercice,
      prior_exercice: priorExercice,
      prior_year_total_revenus: priorTotalRevenus,
      prior_year_impot_calcule: priorImpotCalcule,
      first_year: firstYear,
      aps_applicable: applicable,
      threshold_revenus: APS_THRESHOLD_REVENUS,
      threshold_impot: APS_THRESHOLD_IMPOT,
      legal_reference: 'ITA s.111A(1)(a)',
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 },
    )
  }
}
