/**
 * Helper — Severance Allowance WRA S.70 (sprint G12).
 *
 * Délégation à la RPC calculer_severance + CRUD sur severance_calculs.
 * Permissions : admin + rh (RLS côté DB).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export type MotifLicenciement = 'non_justifie' | 'redundancy_injustifiee' | 'cdd_avant_terme' | 'autre'
export type BaseMois = 'dernier_mois' | 'moyenne_12'
export type SeveranceStatut = 'simulation' | 'valide' | 'paye' | 'annule'

export interface SeveranceCalcul {
  employe_id: string
  date_arrivee: string | null
  anciennete_annees: number
  anciennete_mois_additionnels: number
  anciennete_total_mois: number
  dernier_mois_remuneration: number
  moyenne_12_mois: number
  mois_remuneration_retenu: number
  base_mois_retenue: BaseMois | null
  severance_brut: number
  deduction_total: number
  severance_net: number
  eligible: boolean
  motif_non_eligible: string | null
}

export interface SeveranceRecord extends SeveranceCalcul {
  id: string
  societe_id: string
  date_licenciement: string
  motif_licenciement: MotifLicenciement | null
  deduction_gratifications: number
  deduction_pension_privee: number
  deduction_prgf: number
  statut: SeveranceStatut
  date_paiement: string | null
  commentaire: string | null
  created_at: string
  updated_at: string
  employe_nom?: string
}

export interface DeductionsInput {
  gratifications?: number
  pension_privee?: number
  prgf?: number
}

// ─── Calcul (RPC) ────────────────────────────────────────────────────
export async function calculerSeveranceEmploye(
  supabase: SupabaseLike,
  employeId: string,
  dateLicenciement: string,
  deductions: DeductionsInput = {},
): Promise<SeveranceCalcul | null> {
  const { data, error } = await supabase
    .rpc('calculer_severance', {
      p_employe_id: employeId,
      p_date_licenciement: dateLicenciement,
      p_deduction_gratifications: deductions.gratifications ?? 0,
      p_deduction_pension_privee: deductions.pension_privee ?? 0,
      p_deduction_prgf: deductions.prgf ?? 0,
    })
    .maybeSingle()
  if (error || !data) return null
  return normaliser(data)
}

function normaliser(raw: any): SeveranceCalcul {
  return {
    employe_id: String(raw.employe_id),
    date_arrivee: raw.date_arrivee ? String(raw.date_arrivee).slice(0, 10) : null,
    anciennete_annees: Number(raw.anciennete_annees) || 0,
    anciennete_mois_additionnels: Number(raw.anciennete_mois_additionnels) || 0,
    anciennete_total_mois: Number(raw.anciennete_total_mois) || 0,
    dernier_mois_remuneration: Number(raw.dernier_mois_remuneration) || 0,
    moyenne_12_mois: Number(raw.moyenne_12_mois) || 0,
    mois_remuneration_retenu: Number(raw.mois_remuneration_retenu) || 0,
    base_mois_retenue: (raw.base_mois_retenue as BaseMois) || null,
    severance_brut: Number(raw.severance_brut) || 0,
    deduction_total: Number(raw.deduction_total) || 0,
    severance_net: Number(raw.severance_net) || 0,
    eligible: Boolean(raw.eligible),
    motif_non_eligible: raw.motif_non_eligible || null,
  }
}

// ─── Sauvegarde (simulation / valide) ───────────────────────────────
export interface SauvegardeInput {
  employe_id: string
  societe_id: string
  date_licenciement: string
  motif_licenciement: MotifLicenciement | null
  deductions: {
    gratifications: number
    pension_privee: number
    prgf: number
  }
  commentaire?: string | null
  createdBy?: string | null
}

export async function sauvegarderSimulation(
  supabase: SupabaseLike,
  calcul: SeveranceCalcul,
  input: SauvegardeInput,
): Promise<{ ok: true; id: string } | { ok: false; erreur: string }> {
  const payload = {
    employe_id: input.employe_id,
    societe_id: input.societe_id,
    date_licenciement: input.date_licenciement,
    motif_licenciement: input.motif_licenciement,
    date_arrivee: calcul.date_arrivee,
    anciennete_annees: calcul.anciennete_annees,
    anciennete_mois_additionnels: calcul.anciennete_mois_additionnels,
    anciennete_total_mois: calcul.anciennete_total_mois,
    dernier_mois_remuneration: calcul.dernier_mois_remuneration,
    moyenne_12_mois: calcul.moyenne_12_mois,
    mois_remuneration_retenu: calcul.mois_remuneration_retenu,
    base_mois_retenue: calcul.base_mois_retenue,
    severance_brut: calcul.severance_brut,
    deduction_gratifications: input.deductions.gratifications,
    deduction_pension_privee: input.deductions.pension_privee,
    deduction_prgf: input.deductions.prgf,
    deduction_total: calcul.deduction_total,
    severance_net: calcul.severance_net,
    statut: 'simulation',
    commentaire: input.commentaire ?? null,
    created_by: input.createdBy ?? null,
  }
  const { data, error } = await supabase
    .from('severance_calculs')
    .insert(payload)
    .select('id')
    .single()
  if (error || !data) return { ok: false, erreur: error?.message || 'Insert failed' }
  return { ok: true, id: String(data.id) }
}

export async function validerSeverance(
  supabase: SupabaseLike,
  simulationId: string,
): Promise<{ ok: boolean; erreur?: string }> {
  const { error } = await supabase
    .from('severance_calculs')
    .update({ statut: 'valide' })
    .eq('id', simulationId)
    .eq('statut', 'simulation')
  if (error) return { ok: false, erreur: error.message }
  return { ok: true }
}

export async function annulerSimulation(
  supabase: SupabaseLike,
  simulationId: string,
): Promise<{ ok: boolean; erreur?: string }> {
  const { error } = await supabase
    .from('severance_calculs')
    .update({ statut: 'annule' })
    .eq('id', simulationId)
  if (error) return { ok: false, erreur: error.message }
  return { ok: true }
}

// ─── Lecture ─────────────────────────────────────────────────────────
export async function getSimulationsSociete(
  supabase: SupabaseLike,
  societeId: string,
  filtres: { statut?: SeveranceStatut } = {},
): Promise<SeveranceRecord[]> {
  let q = supabase
    .from('severance_calculs')
    .select(`*, employes:employe_id(prenom, nom)`)
    .eq('societe_id', societeId)
    .order('date_licenciement', { ascending: false })
  if (filtres.statut) q = q.eq('statut', filtres.statut)
  const { data } = await q
  return ((data || []) as any[]).map(r => ({
    id: String(r.id),
    employe_id: String(r.employe_id),
    societe_id: String(r.societe_id),
    date_licenciement: String(r.date_licenciement).slice(0, 10),
    motif_licenciement: r.motif_licenciement || null,
    date_arrivee: r.date_arrivee ? String(r.date_arrivee).slice(0, 10) : null,
    anciennete_annees: Number(r.anciennete_annees) || 0,
    anciennete_mois_additionnels: Number(r.anciennete_mois_additionnels) || 0,
    anciennete_total_mois: Number(r.anciennete_total_mois) || 0,
    dernier_mois_remuneration: Number(r.dernier_mois_remuneration) || 0,
    moyenne_12_mois: Number(r.moyenne_12_mois) || 0,
    mois_remuneration_retenu: Number(r.mois_remuneration_retenu) || 0,
    base_mois_retenue: (r.base_mois_retenue as BaseMois) || null,
    severance_brut: Number(r.severance_brut) || 0,
    deduction_gratifications: Number(r.deduction_gratifications) || 0,
    deduction_pension_privee: Number(r.deduction_pension_privee) || 0,
    deduction_prgf: Number(r.deduction_prgf) || 0,
    deduction_total: Number(r.deduction_total) || 0,
    severance_net: Number(r.severance_net) || 0,
    statut: (r.statut as SeveranceStatut) || 'simulation',
    date_paiement: r.date_paiement ? String(r.date_paiement).slice(0, 10) : null,
    commentaire: r.commentaire || null,
    created_at: String(r.created_at || ''),
    updated_at: String(r.updated_at || ''),
    eligible: Number(r.severance_brut) > 0,
    motif_non_eligible: null,
    employe_nom: r.employes ? `${r.employes.prenom || ''} ${r.employes.nom || ''}`.trim() : undefined,
  }))
}

export async function getSimulation(
  supabase: SupabaseLike,
  simulationId: string,
): Promise<SeveranceRecord | null> {
  const { data } = await supabase
    .from('severance_calculs')
    .select(`*, employes:employe_id(prenom, nom, nic_number, poste, email)`)
    .eq('id', simulationId)
    .maybeSingle()
  if (!data) return null
  const r = data as any
  return {
    id: String(r.id),
    employe_id: String(r.employe_id),
    societe_id: String(r.societe_id),
    date_licenciement: String(r.date_licenciement).slice(0, 10),
    motif_licenciement: r.motif_licenciement || null,
    date_arrivee: r.date_arrivee ? String(r.date_arrivee).slice(0, 10) : null,
    anciennete_annees: Number(r.anciennete_annees) || 0,
    anciennete_mois_additionnels: Number(r.anciennete_mois_additionnels) || 0,
    anciennete_total_mois: Number(r.anciennete_total_mois) || 0,
    dernier_mois_remuneration: Number(r.dernier_mois_remuneration) || 0,
    moyenne_12_mois: Number(r.moyenne_12_mois) || 0,
    mois_remuneration_retenu: Number(r.mois_remuneration_retenu) || 0,
    base_mois_retenue: (r.base_mois_retenue as BaseMois) || null,
    severance_brut: Number(r.severance_brut) || 0,
    deduction_gratifications: Number(r.deduction_gratifications) || 0,
    deduction_pension_privee: Number(r.deduction_pension_privee) || 0,
    deduction_prgf: Number(r.deduction_prgf) || 0,
    deduction_total: Number(r.deduction_total) || 0,
    severance_net: Number(r.severance_net) || 0,
    statut: (r.statut as SeveranceStatut) || 'simulation',
    date_paiement: r.date_paiement ? String(r.date_paiement).slice(0, 10) : null,
    commentaire: r.commentaire || null,
    created_at: String(r.created_at || ''),
    updated_at: String(r.updated_at || ''),
    eligible: Number(r.severance_brut) > 0,
    motif_non_eligible: null,
    employe_nom: r.employes ? `${r.employes.prenom || ''} ${r.employes.nom || ''}`.trim() : undefined,
  }
}

// ─── UI helpers ──────────────────────────────────────────────────────
export function formaterSeverance(montant: number): string {
  if (!Number.isFinite(montant)) return '—'
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(montant))} MUR`.replace(/[   ]/g, ' ')
}

export function formaterAnciennete(annees: number, moisAdd: number): string {
  const parts: string[] = []
  if (annees > 0) parts.push(`${annees} an${annees > 1 ? 's' : ''}`)
  if (moisAdd > 0) parts.push(`${moisAdd} mois`)
  return parts.length === 0 ? '< 1 mois' : parts.join(' ')
}

export const MOTIF_LABELS: Record<MotifLicenciement, string> = {
  non_justifie: 'Licenciement non justifié',
  redundancy_injustifiee: 'Redundancy injustifiée',
  cdd_avant_terme: 'Rupture CDD avant terme',
  autre: 'Autre',
}

export const STATUT_LABELS: Record<SeveranceStatut, string> = {
  simulation: 'Simulation',
  valide: 'Validé',
  paye: 'Payé',
  annule: 'Annulé',
}

export function getMotifNonEligibleLabel(motif: string | null): string {
  if (!motif) return '—'
  const MAP: Record<string, string> = {
    employe_inexistant: 'Employé introuvable',
    date_arrivee_manquante: "Date d'arrivée manquante sur la fiche",
    anciennete_inferieure_12_mois: 'Ancienneté < 12 mois — non éligible WRA S.70',
  }
  return MAP[motif] || motif
}
