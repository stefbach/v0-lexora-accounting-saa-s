/**
 * Cash-in-lieu congés (WRA 2019 S.45 pour AL, S.47 pour VL) — sprint G1.
 *
 * Helper canonique côté serveur pour :
 *   - détecter les cycles AL qui se ferment (RPC SQL detect_cycles_a_clore)
 *   - calculer le montant compensatoire (jours × salaire_base / 22)
 *   - créer / valider / annuler les paiements compensation (table
 *     paiements_conges_compensation)
 *   - injecter le montant dans un bulletin de paie (sera utilisé par G1.3)
 *   - reset le cycle AL après paiement (G1.5)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

export const JOURS_OUVRES_PAR_MOIS = 22

export interface CycleACloture {
  employe_id: string
  employe_prenom: string
  employe_nom: string
  societe_id: string
  societe_nom: string
  salaire_base: number
  cycle_debut: string       // ISO date
  cycle_fin: string         // ISO date
  jours_avant_fin: number
  al_droit: number
  al_pris: number
  al_solde_a_payer: number
  montant_estime: number
  deja_paye: boolean
}

export interface PaiementCompensation {
  id?: string
  employe_id: string
  societe_id: string
  type_conge: 'AL' | 'VL' | 'SL'
  cycle_debut: string
  cycle_fin: string
  jours_droit: number
  jours_pris: number
  jours_payes_compensation: number
  montant_par_jour: number
  montant_total: number
  bulletin_paie_id?: string | null
  periode_bulletin?: string | null
  statut?: 'en_attente' | 'valide' | 'paye' | 'annule'
  motif?: 'fin_cycle_automatique' | 'refus_employeur_vl' | 'fin_contrat' | 'manuel'
  cree_par?: string | null
  commentaire?: string | null
}

/**
 * Détecte les cycles AL se fermant dans les `joursAvance` prochains jours.
 * Wrapper autour de la RPC detect_cycles_a_clore (mig 164).
 */
export async function detectCyclesAClore(
  supabase: AdminClient,
  joursAvance: number = 30,
): Promise<CycleACloture[]> {
  const { data, error } = await supabase.rpc('detect_cycles_a_clore', {
    p_jours_avance: joursAvance,
  })
  if (error) {
    console.warn('[cash-in-lieu] detectCyclesAClore RPC failed:', error.message)
    return []
  }
  return ((data || []) as any[]).map(r => ({
    employe_id: r.employe_id,
    employe_prenom: r.employe_prenom,
    employe_nom: r.employe_nom,
    societe_id: r.societe_id,
    societe_nom: r.societe_nom,
    salaire_base: Number(r.salaire_base) || 0,
    cycle_debut: String(r.cycle_debut).slice(0, 10),
    cycle_fin: String(r.cycle_fin).slice(0, 10),
    jours_avant_fin: Number(r.jours_avant_fin) || 0,
    al_droit: Number(r.al_droit) || 0,
    al_pris: Number(r.al_pris) || 0,
    al_solde_a_payer: Number(r.al_solde_a_payer) || 0,
    montant_estime: Number(r.montant_estime) || 0,
    deja_paye: Boolean(r.deja_paye),
  }))
}

/**
 * Calcule le montant compensatoire = jours × (salaire_base / 22).
 * Arrondi à 2 décimales.
 */
export function calculerMontantCashInLieu(
  salaireBase: number,
  joursNonPris: number,
  joursOuvresParMois: number = JOURS_OUVRES_PAR_MOIS,
): { montantParJour: number; montantTotal: number } {
  const montantParJour = Math.round(((salaireBase || 0) / joursOuvresParMois) * 100) / 100
  const montantTotal = Math.round(montantParJour * (joursNonPris || 0) * 100) / 100
  return { montantParJour, montantTotal }
}

/**
 * Crée une entrée paiements_conges_compensation en statut 'en_attente'.
 * Utilise la contrainte UNIQUE (employe_id, type_conge, cycle_debut, cycle_fin)
 * pour éviter les doublons. Retourne l'id créé ou null si erreur.
 */
export async function genererPaiementCompensation(
  supabase: AdminClient,
  params: PaiementCompensation,
): Promise<{ id: string | null; error: string | null; alreadyExists: boolean }> {
  const payload = {
    employe_id: params.employe_id,
    societe_id: params.societe_id,
    type_conge: params.type_conge,
    cycle_debut: params.cycle_debut,
    cycle_fin: params.cycle_fin,
    jours_droit: params.jours_droit,
    jours_pris: params.jours_pris ?? 0,
    jours_payes_compensation: params.jours_payes_compensation,
    montant_par_jour: params.montant_par_jour,
    montant_total: params.montant_total,
    periode_bulletin: params.periode_bulletin || null,
    statut: params.statut || 'en_attente',
    motif: params.motif || 'fin_cycle_automatique',
    cree_par: params.cree_par || null,
    commentaire: params.commentaire || null,
  }
  const { data, error } = await supabase
    .from('paiements_conges_compensation')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    // 23505 = unique_violation → déjà créé
    if ((error as any).code === '23505') {
      const { data: existing } = await supabase
        .from('paiements_conges_compensation')
        .select('id')
        .eq('employe_id', params.employe_id)
        .eq('type_conge', params.type_conge)
        .eq('cycle_debut', params.cycle_debut)
        .eq('cycle_fin', params.cycle_fin)
        .maybeSingle()
      return { id: existing?.id || null, error: null, alreadyExists: true }
    }
    return { id: null, error: error.message, alreadyExists: false }
  }
  return { id: data.id, error: null, alreadyExists: false }
}

/**
 * Marque un paiement compensation comme 'valide' (prêt à être injecté
 * dans un bulletin). Renseigne valide_le + valide_par.
 */
export async function validerPaiementCompensation(
  supabase: AdminClient,
  paiementId: string,
  userId: string | null,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase
    .from('paiements_conges_compensation')
    .update({
      statut: 'valide',
      valide_le: new Date().toISOString(),
      valide_par: userId,
    })
    .eq('id', paiementId)
    .eq('statut', 'en_attente')
  if (error) return { ok: false, error: error.message }
  return { ok: true, error: null }
}

/**
 * Annule un paiement compensation en attente. Statuts 'valide'/'paye'
 * ne peuvent PAS être annulés (immuables).
 */
export async function annulerPaiementCompensation(
  supabase: AdminClient,
  paiementId: string,
  commentaire?: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error, count } = await supabase
    .from('paiements_conges_compensation')
    .update({
      statut: 'annule',
      commentaire: commentaire || null,
    }, { count: 'exact' })
    .eq('id', paiementId)
    .eq('statut', 'en_attente')
  if (error) return { ok: false, error: error.message }
  if ((count ?? 0) === 0) {
    return { ok: false, error: 'Paiement déjà validé/payé/annulé — opération refusée.' }
  }
  return { ok: true, error: null }
}

/**
 * Lie un paiement (statut valide) à un bulletin et le marque comme 'paye'.
 * Utilisé par le moteur de paie (G1.3) après injection du montant.
 */
export async function marquerPaiementPaye(
  supabase: AdminClient,
  paiementId: string,
  bulletinPaieId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase
    .from('paiements_conges_compensation')
    .update({
      bulletin_paie_id: bulletinPaieId,
      statut: 'paye',
      paye_le: new Date().toISOString(),
    })
    .eq('id', paiementId)
    .in('statut', ['valide'])
  if (error) return { ok: false, error: error.message }
  return { ok: true, error: null }
}

/**
 * Récupère les paiements compensation 'valide' à injecter dans un bulletin
 * pour un (employé, période bulletin) donné.
 * Période bulletin = 1er du mois (ex 2026-05-01).
 */
export async function fetchPaiementsValidesPourBulletin(
  supabase: AdminClient,
  employeId: string,
  periodeBulletin: string,
): Promise<Array<{
  id: string
  type_conge: string
  jours_payes_compensation: number
  montant_total: number
  cycle_debut: string
  cycle_fin: string
}>> {
  const { data } = await supabase
    .from('paiements_conges_compensation')
    .select('id, type_conge, jours_payes_compensation, montant_total, cycle_debut, cycle_fin')
    .eq('employe_id', employeId)
    .eq('statut', 'valide')
    .eq('periode_bulletin', periodeBulletin)
  return (data || []) as any[]
}
