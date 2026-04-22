/**
 * Helper — registres Workers' Rights Act 2019 S.116 (sprint G6).
 *
 * Chaque fonction lit une vue dédiée (v_registre_*) et expose des types
 * fortement typés pour la génération xlsx/pdf côté route API.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export type RegistreType = 'hours' | 'salary' | 'leave' | 'overtime' | 'absence'

export const REGISTRE_META: Record<RegistreType, { title: string; subtitle: string; englishTitle: string }> = {
  hours: {
    title: 'Registre des heures',
    subtitle: 'Heures travaillées, normales et supplémentaires',
    englishTitle: 'Hours Register',
  },
  salary: {
    title: 'Registre des salaires',
    subtitle: 'Salaires bruts, nets et déductions',
    englishTitle: 'Salary Register',
  },
  leave: {
    title: 'Registre des congés',
    subtitle: 'Soldes et prises AL, SL, VL, FML',
    englishTitle: 'Leave Register',
  },
  overtime: {
    title: 'Registre des heures supplémentaires',
    subtitle: 'Tranches 1.5× et 2× (WRA 2019 S.20)',
    englishTitle: 'Overtime Register',
  },
  absence: {
    title: 'Registre des absences',
    subtitle: 'Absences justifiées et non justifiées',
    englishTitle: 'Absence Register',
  },
}

export interface HoursRow {
  employe_id: string
  employe_nom: string
  societe_id: string
  societe_nom: string
  annee: number
  mois: number
  jours_travailles: number
  heures_totales: number
  heures_normales: number
  heures_supplementaires: number
}

export interface SalaryRow {
  employe_id: string
  employe_nom: string
  societe_id: string
  societe_nom: string
  annee: number
  mois: number
  periode: string
  salaire_brut: number
  csg_salarie: number
  nsf_salarie: number
  paye: number
  total_deductions: number
  montant_absence: number
  heures_sup_montant: number
  salaire_net: number
  statut: string | null
  date_paiement: string | null
}

export interface LeaveRow {
  employe_id: string
  employe_nom: string
  societe_id: string
  societe_nom: string
  annee_cycle: number
  periode_debut: string
  periode_fin: string
  al_droit: number
  al_pris: number
  al_solde: number
  al_acquis: number
  sl_droit: number
  sl_pris: number
  sl_solde: number
  vl_droit: number
  vl_pris: number
  fml_utilises: number
}

export interface OvertimeRow {
  employe_id: string
  employe_nom: string
  societe_id: string
  societe_nom: string
  annee: number
  mois: number
  ot_tranche_1_heures: number
  ot_tranche_2_heures: number
  ot_tranche_1_detail: number
  ot_tranche_2_detail: number
  ot_montant_total: number
}

export interface AbsenceRow {
  employe_id: string
  employe_nom: string
  societe_id: string
  societe_nom: string
  annee: number
  absences_justifiees: number
  absences_non_justifiees: number
  absences_totales: number
}

/** Récupère le registre Hours pour une société, une année, et un mois optionnel. */
export async function getRegistreHours(
  supabase: SupabaseLike,
  societeId: string,
  annee: number,
  mois?: number | null,
): Promise<HoursRow[]> {
  let q = supabase
    .from('v_registre_hours')
    .select('*')
    .eq('societe_id', societeId)
    .eq('annee', annee)
    .order('employe_nom', { ascending: true })
    .order('mois', { ascending: true })
  if (mois != null) q = q.eq('mois', mois)
  const { data } = await q
  return (data || []) as HoursRow[]
}

export async function getRegistreSalary(
  supabase: SupabaseLike,
  societeId: string,
  annee: number,
  mois?: number | null,
): Promise<SalaryRow[]> {
  let q = supabase
    .from('v_registre_salary')
    .select('*')
    .eq('societe_id', societeId)
    .eq('annee', annee)
    .order('employe_nom', { ascending: true })
    .order('mois', { ascending: true })
  if (mois != null) q = q.eq('mois', mois)
  const { data } = await q
  return (data || []) as SalaryRow[]
}

export async function getRegistreLeave(
  supabase: SupabaseLike,
  societeId: string,
  annee: number,
): Promise<LeaveRow[]> {
  const { data } = await supabase
    .from('v_registre_leave')
    .select('*')
    .eq('societe_id', societeId)
    .eq('annee_cycle', annee)
    .order('employe_nom', { ascending: true })
  return (data || []) as LeaveRow[]
}

export async function getRegistreOvertime(
  supabase: SupabaseLike,
  societeId: string,
  annee: number,
  mois?: number | null,
): Promise<OvertimeRow[]> {
  let q = supabase
    .from('v_registre_overtime')
    .select('*')
    .eq('societe_id', societeId)
    .eq('annee', annee)
    .order('employe_nom', { ascending: true })
    .order('mois', { ascending: true })
  if (mois != null) q = q.eq('mois', mois)
  const { data } = await q
  return (data || []) as OvertimeRow[]
}

export async function getRegistreAbsence(
  supabase: SupabaseLike,
  societeId: string,
  annee: number,
): Promise<AbsenceRow[]> {
  const { data } = await supabase
    .from('v_registre_absence')
    .select('*')
    .eq('societe_id', societeId)
    .eq('annee', annee)
    .order('employe_nom', { ascending: true })
  return (data || []) as AbsenceRow[]
}

/**
 * Retourne les lignes d'un registre (variant type). Utilisé par la route
 * API pour dispatcher selon le type demandé.
 */
export async function getRegistre(
  supabase: SupabaseLike,
  type: RegistreType,
  societeId: string,
  annee: number,
  mois?: number | null,
): Promise<any[]> {
  switch (type) {
    case 'hours':    return getRegistreHours(supabase, societeId, annee, mois)
    case 'salary':   return getRegistreSalary(supabase, societeId, annee, mois)
    case 'leave':    return getRegistreLeave(supabase, societeId, annee)
    case 'overtime': return getRegistreOvertime(supabase, societeId, annee, mois)
    case 'absence':  return getRegistreAbsence(supabase, societeId, annee)
    default: return []
  }
}

/** Colonnes + libellés anglais (inspection ministérielle) pour chaque type. */
export function getColumnsForType(type: RegistreType): Array<{ key: string; label: string }> {
  switch (type) {
    case 'hours':
      return [
        { key: 'employe_nom',            label: 'Employee' },
        { key: 'societe_nom',            label: 'Company' },
        { key: 'annee',                  label: 'Year' },
        { key: 'mois',                   label: 'Month' },
        { key: 'jours_travailles',       label: 'Days Worked' },
        { key: 'heures_totales',         label: 'Total Hours' },
        { key: 'heures_normales',        label: 'Normal Hours' },
        { key: 'heures_supplementaires', label: 'Overtime Hours' },
      ]
    case 'salary':
      return [
        { key: 'employe_nom',      label: 'Employee' },
        { key: 'societe_nom',      label: 'Company' },
        { key: 'annee',            label: 'Year' },
        { key: 'mois',             label: 'Month' },
        { key: 'salaire_brut',     label: 'Gross Salary (MUR)' },
        { key: 'csg_salarie',      label: 'CSG Employee (MUR)' },
        { key: 'nsf_salarie',      label: 'NSF Employee (MUR)' },
        { key: 'paye',             label: 'PAYE (MUR)' },
        { key: 'total_deductions', label: 'Total Deductions (MUR)' },
        { key: 'salaire_net',      label: 'Net Salary (MUR)' },
        { key: 'statut',           label: 'Status' },
        { key: 'date_paiement',    label: 'Payment Date' },
      ]
    case 'leave':
      return [
        { key: 'employe_nom',    label: 'Employee' },
        { key: 'societe_nom',    label: 'Company' },
        { key: 'periode_debut',  label: 'Cycle Start' },
        { key: 'periode_fin',    label: 'Cycle End' },
        { key: 'al_droit',       label: 'AL Entitled' },
        { key: 'al_acquis',      label: 'AL Accrued (Model C)' },
        { key: 'al_pris',        label: 'AL Taken' },
        { key: 'al_solde',       label: 'AL Balance' },
        { key: 'sl_droit',       label: 'SL Entitled' },
        { key: 'sl_pris',        label: 'SL Taken' },
        { key: 'sl_solde',       label: 'SL Balance' },
        { key: 'vl_droit',       label: 'VL Entitled' },
        { key: 'vl_pris',        label: 'VL Taken' },
        { key: 'fml_utilises',   label: 'FML Used' },
      ]
    case 'overtime':
      return [
        { key: 'employe_nom',          label: 'Employee' },
        { key: 'societe_nom',          label: 'Company' },
        { key: 'annee',                label: 'Year' },
        { key: 'mois',                 label: 'Month' },
        { key: 'ot_tranche_1_heures',  label: 'OT 1.5x Hours' },
        { key: 'ot_tranche_2_heures',  label: 'OT 2x Hours' },
        { key: 'ot_montant_total',     label: 'OT Total Amount (MUR)' },
      ]
    case 'absence':
      return [
        { key: 'employe_nom',             label: 'Employee' },
        { key: 'societe_nom',             label: 'Company' },
        { key: 'annee',                   label: 'Year' },
        { key: 'absences_justifiees',     label: 'Justified Absences' },
        { key: 'absences_non_justifiees', label: 'Unjustified Absences' },
        { key: 'absences_totales',        label: 'Total Absences' },
      ]
  }
}
