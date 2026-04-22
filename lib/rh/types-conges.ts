/**
 * Helper canonique pour les types de congés WRA 2019 — sprint G4.
 *
 * Source de vérité :
 *   - Table `conges_regles` (mig 170) avec seed des règles globales
 *   - RPC `get_conge_regle(societe_id, type_conge)` pour la règle effective
 *     (priorité override société > globale)
 *
 * Ce module expose :
 *   - Constantes de labels + groupes (utilisables côté client)
 *   - Wrappers async pour charger la config DB (côté serveur/client)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export const TYPES_CONGES_LABELS: Record<string, string> = {
  AL: 'Annual Leave (Local Leave)',
  SL: 'Sick Leave',
  VL: 'Vacation Leave (30j/5 ans)',
  FML: 'Family Medical Leave',
  SPC_MARIAGE_SELF: 'Mariage du salarié',
  SPC_MARIAGE_ENFANT: 'Mariage d’un enfant',
  SPC_DECES: 'Décès famille proche',
  JUR: 'Congé de juré',
  INT: 'Événement international',
  CRT: 'Convocation judiciaire',
  MAT: 'Congé maternité',
  PAT: 'Congé paternité',
  UL: 'Sans solde',
  SANS_SOLDE: 'Sans solde',
  COM: 'Récupération (compensatoire)',
}

/** Groupement pour l'UI selector (modal nouvelle demande). */
export const GROUPES_TYPES_CONGES = {
  principal: ['AL', 'SL', 'VL'],
  familial: ['FML'],
  special: ['SPC_MARIAGE_SELF', 'SPC_MARIAGE_ENFANT', 'SPC_DECES'],
  exceptionnel: ['JUR', 'INT', 'CRT'],
  maternite: ['MAT', 'PAT'],
  autres: ['UL', 'COM'],
} as const

export const GROUPES_LABELS: Record<keyof typeof GROUPES_TYPES_CONGES, string> = {
  principal: 'Congés principaux (WRA)',
  familial: 'Congé familial (S.47A)',
  special: 'Congés exceptionnels (S.48)',
  exceptionnel: 'Congés légaux (S.49-51)',
  maternite: 'Maternité / Paternité (S.52-53)',
  autres: 'Autres',
}

/** Couleurs par type pour badges/cartes UI. */
export const TYPES_CONGES_COULEURS: Record<string, string> = {
  AL: 'bg-emerald-100 text-emerald-800',
  SL: 'bg-orange-100 text-orange-800',
  VL: 'bg-purple-100 text-purple-800',
  FML: 'bg-cyan-100 text-cyan-800',
  SPC_MARIAGE_SELF: 'bg-amber-100 text-amber-800',
  SPC_MARIAGE_ENFANT: 'bg-amber-100 text-amber-800',
  SPC_DECES: 'bg-amber-100 text-amber-800',
  JUR: 'bg-slate-100 text-slate-700',
  INT: 'bg-indigo-100 text-indigo-800',
  CRT: 'bg-slate-100 text-slate-700',
  MAT: 'bg-pink-100 text-pink-800',
  PAT: 'bg-blue-100 text-blue-800',
  UL: 'bg-gray-100 text-gray-700',
  SANS_SOLDE: 'bg-gray-100 text-gray-700',
  COM: 'bg-gray-100 text-gray-700',
}

export interface ConfigConge {
  jours_par_cycle: number | null
  unite_cycle: string | null
  anciennete_min_mois: number
  basic_salary_max: number | null
  exclu_migrant: boolean
  paye: boolean
  deductible_de: string[] | null
  reference_wra: string | null
  description: string | null
  requiert_certificat_medical: boolean
  requiert_acte_naissance: boolean
  requiert_acte_deces: boolean
  requiert_convocation: boolean
  source: 'societe' | 'global' | 'default'
}

const DEFAULT_CONFIG: ConfigConge = {
  jours_par_cycle: null,
  unite_cycle: null,
  anciennete_min_mois: 0,
  basic_salary_max: null,
  exclu_migrant: false,
  paye: true,
  deductible_de: null,
  reference_wra: null,
  description: null,
  requiert_certificat_medical: false,
  requiert_acte_naissance: false,
  requiert_acte_deces: false,
  requiert_convocation: false,
  source: 'default',
}

/** Retourne le label UI d'un type (ou le code brut en fallback). */
export function getTypeCongeLabel(type: string): string {
  return TYPES_CONGES_LABELS[type] || type
}

/**
 * Retourne TRUE si le type peut être déduit d'un autre solde (FML
 * déductible de AL/SL/VL par ex.).
 */
export function isTypeCongeDeductible(type: string): boolean {
  return type === 'FML'
}

/**
 * Wrapper RPC get_conge_regle. Charge la règle effective (société > globale).
 * Retourne DEFAULT_CONFIG si la RPC échoue ou retourne vide.
 */
export async function getTypeCongeConfig(
  supabase: SupabaseLike,
  type: string,
  societe_id?: string | null,
): Promise<ConfigConge> {
  const { data, error } = await supabase
    .rpc('get_conge_regle', {
      p_societe_id: societe_id || null,
      p_type_conge: type,
    })
    .maybeSingle()
  if (error || !data) return { ...DEFAULT_CONFIG }
  const r = data as any
  return {
    jours_par_cycle: r.jours_par_cycle === null ? null : Number(r.jours_par_cycle),
    unite_cycle: r.unite_cycle,
    anciennete_min_mois: Number(r.anciennete_min_mois) || 0,
    basic_salary_max: r.basic_salary_max === null ? null : Number(r.basic_salary_max),
    exclu_migrant: Boolean(r.exclu_migrant),
    paye: Boolean(r.paye),
    deductible_de: Array.isArray(r.deductible_de) ? r.deductible_de : null,
    reference_wra: r.reference_wra,
    description: r.description,
    requiert_certificat_medical: Boolean(r.requiert_certificat_medical),
    requiert_acte_naissance: Boolean(r.requiert_acte_naissance),
    requiert_acte_deces: Boolean(r.requiert_acte_deces),
    requiert_convocation: Boolean(r.requiert_convocation),
    source: (r.source as ConfigConge['source']) || 'global',
  }
}

/**
 * Récupère toutes les règles globales d'un coup. Utilisé par la page
 * /rh/conges/parametres pour afficher les 10+ cartes sans 10 RPC appels.
 */
export async function getAllReglesGlobales(
  supabase: SupabaseLike,
): Promise<Record<string, ConfigConge>> {
  const { data } = await supabase
    .from('conges_regles')
    .select('*')
    .is('societe_id', null)
    .eq('actif', true)
  const result: Record<string, ConfigConge> = {}
  for (const r of (data || []) as any[]) {
    result[r.type_conge] = {
      jours_par_cycle: r.jours_par_cycle === null ? null : Number(r.jours_par_cycle),
      unite_cycle: r.unite_cycle,
      anciennete_min_mois: Number(r.anciennete_min_mois) || 0,
      basic_salary_max: r.basic_salary_max === null ? null : Number(r.basic_salary_max),
      exclu_migrant: Boolean(r.exclu_migrant),
      paye: Boolean(r.paye),
      deductible_de: Array.isArray(r.deductible_de) ? r.deductible_de : null,
      reference_wra: r.reference_wra,
      description: r.description,
      requiert_certificat_medical: Boolean(r.requiert_certificat_medical),
      requiert_acte_naissance: Boolean(r.requiert_acte_naissance),
      requiert_acte_deces: Boolean(r.requiert_acte_deces),
      requiert_convocation: Boolean(r.requiert_convocation),
      source: 'global',
    }
  }
  return result
}

export interface EmployePourEligibilite {
  id: string
  date_arrivee?: string | null
  salaire_base?: number | null
  is_migrant_worker?: boolean | null
  genre?: string | null
}

/**
 * Validation des justificatifs requis pour un type.
 * documents = { certificat_medical?, acte_naissance?, acte_deces?, convocation? }
 */
export function validerJustificatifs(
  config: ConfigConge,
  documents: {
    certificat_medical?: string | null
    acte_naissance?: string | null
    acte_deces?: string | null
    convocation?: string | null
  },
): { ok: boolean; manquants: string[] } {
  const manquants: string[] = []
  if (config.requiert_certificat_medical && !documents.certificat_medical) manquants.push('certificat médical')
  if (config.requiert_acte_naissance && !documents.acte_naissance) manquants.push('acte de naissance')
  if (config.requiert_acte_deces && !documents.acte_deces) manquants.push('acte de décès')
  if (config.requiert_convocation && !documents.convocation) manquants.push('convocation officielle')
  return { ok: manquants.length === 0, manquants }
}

/**
 * Vérifie qu'un employé est éligible à un type de congé.
 * Retourne eligible=true ou la raison du refus.
 */
export function verifierEligibilite(
  config: ConfigConge,
  emp: EmployePourEligibilite,
  dateRef: string = new Date().toISOString().slice(0, 10),
): { eligible: boolean; raison?: string; date_eligibilite?: string } {
  // 1. Migrant exclu
  if (config.exclu_migrant && emp.is_migrant_worker) {
    return { eligible: false, raison: 'migrant_worker_exclu' }
  }
  // 2. Plafond basic_salary
  if (config.basic_salary_max !== null && (Number(emp.salaire_base) || 0) > config.basic_salary_max) {
    return { eligible: false, raison: `hors_wra_basic_sup_${config.basic_salary_max}` }
  }
  // 3. Ancienneté minimum
  if (config.anciennete_min_mois > 0) {
    if (!emp.date_arrivee) return { eligible: false, raison: 'no_date_arrivee' }
    const a = new Date(String(emp.date_arrivee).slice(0, 10) + 'T12:00:00')
    const r = new Date(String(dateRef).slice(0, 10) + 'T12:00:00')
    let months = (r.getFullYear() - a.getFullYear()) * 12 + (r.getMonth() - a.getMonth())
    if (r.getDate() < a.getDate()) months -= 1
    if (months < config.anciennete_min_mois) {
      const elig = new Date(a)
      elig.setMonth(elig.getMonth() + config.anciennete_min_mois)
      return {
        eligible: false,
        raison: 'anciennete_insuffisante',
        date_eligibilite: elig.toISOString().slice(0, 10),
      }
    }
  }
  return { eligible: true }
}
