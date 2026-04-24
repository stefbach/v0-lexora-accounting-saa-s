/**
 * Helper canonique pour la protection maternité/paternité WRA 2019
 * (Sections 52, 53, 64, 5(5)(aa)). Sprint G7.
 *
 * Tables : grossesses_employees + paternites_employees (mig 168).
 *
 * IMPORTANT : ces fonctions sont server-side uniquement. Elles utilisent
 * l'admin client (service_role) pour bypasser RLS. L'authentification et
 * le contrôle de rôle (RH/admin) doivent être faits par le caller AVANT
 * d'appeler ces fonctions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

/**
 * F11/G7 — Durée du congé maternité en semaines selon les flags WRA S.52.
 * - Normal : 16 semaines
 * - Multiple OU prématurée : 18 semaines (+2)
 */
export function calculerDureeCongeMatSemaines(opts: {
  grossesse_multiple?: boolean
  naissance_prematuree?: boolean
}): number {
  return (opts.grossesse_multiple || opts.naissance_prematuree) ? 18 : 16
}

/** Ajoute N semaines (7N jours) à une date ISO. Retourne ISO YYYY-MM-DD. */
function addWeeksIso(dateIso: string, weeks: number): string {
  const d = new Date(String(dateIso).slice(0, 10) + 'T12:00:00')
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

/** Calcule l'ancienneté en mois entre date_arrivee et dateRef. */
function monthsService(dateArrivee: string, dateRef: string): number {
  const a = new Date(String(dateArrivee).slice(0, 10) + 'T12:00:00')
  const r = new Date(String(dateRef).slice(0, 10) + 'T12:00:00')
  let m = (r.getFullYear() - a.getFullYear()) * 12 + (r.getMonth() - a.getMonth())
  if (r.getDate() < a.getDate()) m -= 1
  return Math.max(0, m)
}

export interface DeclarerGrossesseParams {
  employe_id: string
  date_presume_accouchement: string
  grossesse_multiple?: boolean
  nb_enfants_attendus?: number
  est_adoption?: boolean
  date_adoption?: string | null
  certificat_medical_url?: string | null
  commentaire?: string | null
  created_by?: string | null
}

/**
 * Crée une entrée grossesse statut 'declaree'. La contrainte UNIQUE
 * partielle sur (employe_id) WHERE statut IN ('declaree','conge_en_cours')
 * garantit qu'il n'y a pas 2 grossesses actives simultanément.
 */
export async function declarerGrossesse(
  supabase: AdminClient,
  params: DeclarerGrossesseParams,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('grossesses_employees')
    .insert({
      employe_id: params.employe_id,
      date_presume_accouchement: params.date_presume_accouchement,
      grossesse_multiple: params.grossesse_multiple || false,
      nb_enfants_attendus: params.nb_enfants_attendus || 1,
      est_adoption: params.est_adoption || false,
      date_adoption: params.date_adoption || null,
      certificat_medical_url: params.certificat_medical_url || null,
      commentaire: params.commentaire || null,
      created_by: params.created_by || null,
      statut: 'declaree',
    })
    .select('id')
    .single()
  if (error) return { id: null, error: error.message }
  return { id: data.id, error: null }
}

export interface EnregistrerAccouchementParams {
  grossesse_id: string
  date_reelle_accouchement: string
  grossesse_multiple?: boolean
  naissance_prematuree?: boolean
  mortinaissance?: boolean
}

/**
 * Passage declaree → conge_en_cours avec calcul des dates du congé.
 * Crée AUTOMATIQUEMENT une demande MAT dans demandes_conges approuvée.
 */
export async function enregistrerAccouchement(
  supabase: AdminClient,
  params: EnregistrerAccouchementParams,
): Promise<{ ok: boolean; error: string | null; conge_mat_fin?: string; demande_id?: string }> {
  const { data: grossesse } = await supabase
    .from('grossesses_employees')
    .select('id, employe_id, statut, grossesse_multiple, naissance_prematuree')
    .eq('id', params.grossesse_id)
    .maybeSingle()
  if (!grossesse) return { ok: false, error: 'Grossesse non trouvée' }
  if (grossesse.statut === 'annulee' || grossesse.statut === 'retour_effectue') {
    return { ok: false, error: `Statut actuel ${grossesse.statut} — modification impossible.` }
  }

  // Mettre à jour les flags éventuellement précisés à l'accouchement
  const multiple = params.grossesse_multiple ?? grossesse.grossesse_multiple
  const premature = params.naissance_prematuree ?? grossesse.naissance_prematuree
  const weeks = calculerDureeCongeMatSemaines({ grossesse_multiple: multiple, naissance_prematuree: premature })

  const congeDebut = String(params.date_reelle_accouchement).slice(0, 10)
  const congeFin = addWeeksIso(congeDebut, weeks)

  const { error: upErr } = await supabase
    .from('grossesses_employees')
    .update({
      date_reelle_accouchement: congeDebut,
      grossesse_multiple: multiple,
      naissance_prematuree: premature,
      mortinaissance: params.mortinaissance || false,
      statut: 'conge_en_cours',
      conge_mat_debut: congeDebut,
      conge_mat_fin: congeFin,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.grossesse_id)
  if (upErr) return { ok: false, error: upErr.message }

  // Créer demande MAT approuvée
  const nbJours = weeks * 7
  const { data: demande } = await supabase
    .from('demandes_conges')
    .insert({
      employe_id: grossesse.employe_id,
      type_conge: 'MAT',
      date_debut: congeDebut,
      date_fin: congeFin,
      nb_jours: nbJours,
      statut: 'approuve',
      motif: `Congé maternité WRA S.52 (${weeks} semaines)`,
      date_decision: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  return { ok: true, error: null, conge_mat_fin: congeFin, demande_id: demande?.id }
}

/** Passage conge_en_cours → retour_effectue. */
export async function enregistrerRetourMaternite(
  supabase: AdminClient,
  grossesseId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase
    .from('grossesses_employees')
    .update({ statut: 'retour_effectue', updated_at: new Date().toISOString() })
    .eq('id', grossesseId)
    .in('statut', ['conge_en_cours', 'declaree'])
  if (error) return { ok: false, error: error.message }
  return { ok: true, error: null }
}

/** Annulation d'une grossesse (cas exceptionnel). Motif requis. */
export async function annulerGrossesse(
  supabase: AdminClient,
  grossesseId: string,
  motif: string,
): Promise<{ ok: boolean; error: string | null }> {
  if (!motif || motif.trim().length < 3) return { ok: false, error: 'Motif obligatoire (≥ 3 caractères).' }
  const { error } = await supabase
    .from('grossesses_employees')
    .update({
      statut: 'annulee',
      motif_annulation: motif.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', grossesseId)
    .in('statut', ['declaree', 'conge_en_cours'])
  if (error) return { ok: false, error: error.message }
  return { ok: true, error: null }
}

export interface DeclarerPaterniteParams {
  employe_id: string
  date_naissance_enfant: string
  conge_pat_debut?: string | null
  acte_naissance_url?: string | null
  commentaire?: string | null
  created_by?: string | null
}

/**
 * Crée une entrée paternité. conge_pat_debut défaut = date_naissance_enfant.
 * conge_paye est déterminé par l'ancienneté de l'employé : ≥ 12 mois → payé.
 * 4 semaines consécutives (WRA S.53).
 */
export async function declarerPaternite(
  supabase: AdminClient,
  params: DeclarerPaterniteParams,
): Promise<{ id: string | null; error: string | null; conge_paye: boolean; conge_pat_fin: string }> {
  const { data: emp } = await supabase
    .from('employes')
    .select('date_arrivee')
    .eq('id', params.employe_id)
    .maybeSingle()
  const today = new Date().toISOString().slice(0, 10)
  const months = emp?.date_arrivee ? monthsService(String(emp.date_arrivee), today) : 0
  const congePaye = months >= 12

  const congeDebut = params.conge_pat_debut || String(params.date_naissance_enfant).slice(0, 10)
  const congeFin = addWeeksIso(congeDebut, 4)

  const { data, error } = await supabase
    .from('paternites_employees')
    .insert({
      employe_id: params.employe_id,
      date_naissance_enfant: params.date_naissance_enfant,
      conge_pat_debut: congeDebut,
      conge_pat_fin: congeFin,
      conge_paye: congePaye,
      acte_naissance_url: params.acte_naissance_url || null,
      commentaire: params.commentaire || null,
      created_by: params.created_by || null,
      statut: 'conge_en_cours',
    })
    .select('id')
    .single()
  if (error) return { id: null, error: error.message, conge_paye: congePaye, conge_pat_fin: congeFin }

  // Créer demande PAT approuvée (type PAT, 28 jours = 4 semaines)
  await supabase.from('demandes_conges').insert({
    employe_id: params.employe_id,
    type_conge: 'PAT',
    date_debut: congeDebut,
    date_fin: congeFin,
    nb_jours: 28,
    statut: 'approuve',
    motif: `Congé paternité WRA S.53 (4 semaines${congePaye ? ' payées' : ' non payées — ancienneté < 12 mois'})`,
    date_decision: new Date().toISOString(),
  })

  return { id: data.id, error: null, conge_paye: congePaye, conge_pat_fin: congeFin }
}

/** Retour paternité. */
export async function enregistrerRetourPaternite(
  supabase: AdminClient,
  paterniteId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase
    .from('paternites_employees')
    .update({ statut: 'retour_effectue' })
    .eq('id', paterniteId)
    .in('statut', ['conge_en_cours', 'declaree'])
  if (error) return { ok: false, error: error.message }
  return { ok: true, error: null }
}

/** Wrapper RPC is_employe_protege_licenciement. */
export async function verifierProtectionLicenciement(
  supabase: AdminClient,
  employeId: string,
  dateRef?: string,
): Promise<{ est_protege: boolean; motif: string; date_fin_protection: string | null }> {
  const { data } = await supabase
    .rpc('is_employe_protege_licenciement', {
      p_employe_id: employeId,
      p_date_reference: dateRef || new Date().toISOString().slice(0, 10),
    })
    .maybeSingle()
  const row = data as any
  return {
    est_protege: Boolean(row?.est_protege),
    motif: String(row?.motif || ''),
    date_fin_protection: row?.date_fin_protection
      ? String(row.date_fin_protection).slice(0, 10)
      : null,
  }
}

/**
 * Fetch la grossesse 'conge_en_cours' avec date_reelle_accouchement dans
 * la période bulletin donnée, ET allocation non encore payée. Utilisé par
 * le moteur de paie (G7.3) pour injecter les 3 000 MUR.
 *
 * Skip si mortinaissance = true (pas d'allocation).
 */
export async function fetchGrossessePourAllocationBulletin(
  supabase: AdminClient,
  employeId: string,
  periodeBulletinMois: string, // YYYY-MM (ex '2026-05')
): Promise<{ id: string; montant: number } | null> {
  const debut = `${periodeBulletinMois}-01`
  const [y, m] = periodeBulletinMois.split('-').map(n => parseInt(n, 10))
  const finMois = new Date(y, m, 0).toISOString().slice(0, 10)

  const { data } = await supabase
    .from('grossesses_employees')
    .select('id, allocation_naissance_montant, mortinaissance, statut')
    .eq('employe_id', employeId)
    .eq('allocation_naissance_payee', false)
    .gte('date_reelle_accouchement', debut)
    .lte('date_reelle_accouchement', finMois)
    .maybeSingle()

  if (!data || data.mortinaissance || data.statut === 'annulee') return null
  return { id: data.id, montant: Number(data.allocation_naissance_montant) || 3000 }
}

/** Marque la grossesse comme allocation payée avec référence au bulletin. */
export async function marquerAllocationPayee(
  supabase: AdminClient,
  grossesseId: string,
  bulletinPaieId: string,
): Promise<void> {
  await supabase
    .from('grossesses_employees')
    .update({
      allocation_naissance_payee: true,
      allocation_naissance_bulletin_id: bulletinPaieId,
      allocation_naissance_paye_le: new Date().toISOString(),
    })
    .eq('id', grossesseId)
}
