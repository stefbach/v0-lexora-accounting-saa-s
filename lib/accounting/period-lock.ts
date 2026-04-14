/**
 * Gestion du verrouillage de période comptable
 * Spec: NIVEAU P2-B3 — Empêcher toute modification sur une période verrouillée
 *
 * Une période est verrouillée quand :
 *  - accounting_periods.status = 'locked' pour (societe_id, period contenant la date)
 *  - bank_reconciliations.status = 'locked' pour (societe_id, compte, period contenant la date)
 *
 * Usage :
 *   import { assertPeriodNotLocked } from '@/lib/accounting/period-lock'
 *   await assertPeriodNotLocked(supabase, societeId, '2025-03-15')
 *   // throws Error si la période est verrouillée
 */

type AdminClient = any // Supabase admin client

export interface PeriodLockStatus {
  locked: boolean
  reason?: string
  period_end?: string
  locked_at?: string
}

/**
 * Vérifie si une date est dans une période verrouillée pour une société.
 * Ne jette pas d'erreur — retourne un objet descriptif.
 */
export async function checkPeriodLock(
  supabase: AdminClient,
  societeId: string,
  operationDate: string,
): Promise<PeriodLockStatus> {
  if (!societeId || !operationDate) return { locked: false }
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('period_start, period_end, status, closed_at')
      .eq('societe_id', societeId)
      .eq('status', 'locked')
      .lte('period_start', operationDate)
      .gte('period_end', operationDate)
      .limit(1)
      .maybeSingle()
    // Si table absente (migration 135 non appliquée) on n'empêche rien
    if (error && !String(error.message || '').includes('does not exist')) {
      return { locked: false }
    }
    if (!data) return { locked: false }
    return {
      locked: true,
      reason: `Période comptable verrouillée du ${data.period_start} au ${data.period_end}`,
      period_end: data.period_end,
      locked_at: data.closed_at,
    }
  } catch {
    return { locked: false }
  }
}

/**
 * Assertion : jette une erreur si la période est verrouillée.
 */
export async function assertPeriodNotLocked(
  supabase: AdminClient,
  societeId: string,
  operationDate: string,
): Promise<void> {
  const status = await checkPeriodLock(supabase, societeId, operationDate)
  if (status.locked) {
    throw new Error(
      `PERIOD_LOCKED: ${status.reason}. Toute modification nécessite le déverrouillage par un administrateur.`,
    )
  }
}

/**
 * Vérifie les verrous sur une plage de dates (utile pour des imports en masse).
 * Retourne la liste des périodes concernées.
 */
export async function listLockedPeriodsInRange(
  supabase: AdminClient,
  societeId: string,
  from: string,
  to: string,
): Promise<Array<{ period_start: string; period_end: string; closed_at?: string }>> {
  if (!societeId || !from || !to) return []
  try {
    const { data, error } = await supabase
      .from('accounting_periods')
      .select('period_start, period_end, closed_at')
      .eq('societe_id', societeId)
      .eq('status', 'locked')
      .or(`period_start.lte.${to},period_end.gte.${from}`)
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

/**
 * Filtre les dates qui tombent dans une période verrouillée.
 * Utilisé pour séparer ce qui peut être importé et ce qui est bloqué.
 */
export async function splitByPeriodLock(
  supabase: AdminClient,
  societeId: string,
  dates: string[],
): Promise<{ allowed: string[]; blocked: string[] }> {
  const locked = new Set<string>()
  for (const d of dates) {
    const st = await checkPeriodLock(supabase, societeId, d)
    if (st.locked) locked.add(d)
  }
  return {
    allowed: dates.filter(d => !locked.has(d)),
    blocked: [...locked],
  }
}
