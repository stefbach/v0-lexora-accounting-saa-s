/**
 * Helper — Provisions EOY Bonus IAS 19 (sprint G8 Phase 2).
 *
 * Pipeline :
 *   1. calculerProvisionEoySociete → RPC calculer_provision_eoy_ias19
 *      + calcul du delta mensuel (provision_cumulee - snapshot m-1)
 *   2. sauvegarderSnapshot          → UPSERT (societe_id, annee, mois)
 *   3. extournerSnapshot (mois-1)   → écritures inverses
 *   4. genererEcrituresComptables   → 2 écritures (D 64176 / C 4288)
 *
 * Compte charge : 64176 (sous-compte de 6417).
 * Compte passif : 4288  (sous-compte de 428).
 * Journal : OD. Pièce : PRO-IAS19EOY-YYYYMM[-EXT].
 *
 * Décembre interdit : paiement réel via G11.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export type IAS19EoyStatut = 'calcule' | 'comptabilise' | 'extourne' | 'annule'

export interface IAS19EoyLigne {
  employe_id: string
  employe_nom: string
  salaire_base: number
  nb_mois_travailles: number
  earnings_cumulees: number
  provision_cumulee: number
  provision_du_mois: number
  eligible: boolean
  motif_non_eligible: string | null
}

export interface IAS19EoySnapshot {
  id?: string
  societe_id: string
  date_snapshot: string
  annee: number
  mois: number
  details_par_employe: IAS19EoyLigne[]
  provision_cumulee_total: number
  provision_du_mois_total: number
  nb_employes_eligibles: number
  statut: IAS19EoyStatut
  ecriture_debit_id?: string | null
  ecriture_credit_id?: string | null
  ecriture_extourne_debit_id?: string | null
  ecriture_extourne_credit_id?: string | null
  created_at?: string
  updated_at?: string
}

export const COMPTE_CHARGE_EOY = '64176'
export const LIBELLE_COMPTE_CHARGE_EOY = 'Provisions EOY Bonus (charge) — IAS 19'
export const COMPTE_PASSIF_EOY = '4288'
export const LIBELLE_COMPTE_PASSIF_EOY = 'Provisions EOY Bonus (passif) — IAS 19'
export const JOURNAL_EOY = 'OD'

// ─── Utilitaires ────────────────────────────────────────────────────
export function dateFinDeMois(annee: number, mois: number): string {
  return new Date(annee, mois, 0).toISOString().slice(0, 10)
}

export function libellePeriodeMois(annee: number, mois: number): string {
  const d = new Date(annee, mois - 1, 15)
  const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function pieceEoy(annee: number, mois: number, suffixe: 'NEW' | 'EXT' = 'NEW'): string {
  const mm = String(mois).padStart(2, '0')
  return `PRO-IAS19EOY-${annee}${mm}${suffixe === 'EXT' ? '-EXT' : ''}`
}

function moisPrecedent(annee: number, mois: number): { annee: number; mois: number } | null {
  if (mois <= 1) return null // pas de provision décembre année précédente
  return { annee, mois: mois - 1 }
}

// ─── 1. Calcul (RPC + delta mensuel) ────────────────────────────────
export async function calculerProvisionEoySociete(
  supabase: SupabaseLike,
  societeId: string,
  annee: number,
  mois: number,
): Promise<IAS19EoySnapshot> {
  if (mois < 1 || mois > 11) {
    throw new Error('Provision EOY calculable uniquement pour les mois 1-11 (décembre = paiement réel)')
  }

  const { data, error } = await supabase.rpc('calculer_provision_eoy_ias19', {
    p_societe_id: societeId,
    p_annee: annee,
    p_mois: mois,
  })
  if (error) throw new Error(error.message)

  // Récupérer le snapshot du mois précédent pour calculer le delta
  const prec = moisPrecedent(annee, mois)
  let provisionsPrec = new Map<string, number>()
  if (prec) {
    const { data: prevSnap } = await supabase
      .from('ias19_provisions_eoy_snapshots')
      .select('details_par_employe')
      .eq('societe_id', societeId)
      .eq('annee', prec.annee)
      .eq('mois', prec.mois)
      .maybeSingle()
    interface SnapDetail { employe_id: string | number; provision_cumulee: number | string }
    const snap = prevSnap as { details_par_employe?: unknown } | null
    const details: SnapDetail[] = Array.isArray(snap?.details_par_employe)
      ? (snap.details_par_employe as SnapDetail[])
      : []
    provisionsPrec = new Map(details.map(d => [String(d.employe_id), Number(d.provision_cumulee) || 0]))
  }

  interface RpcRow {
    employe_id: string; employe_nom?: string | null; salaire_base?: number | string
    nb_mois_travailles?: number | string; earnings_cumulees?: number | string
    provision_cumulee?: number | string; eligible?: boolean; motif_non_eligible?: string | null
  }
  const lignes: IAS19EoyLigne[] = ((data || []) as RpcRow[]).map(r => {
    const provCum = Number(r.provision_cumulee) || 0
    const eligible = Boolean(r.eligible)
    // Provision effective uniquement si éligible
    const provCumEffective = eligible ? provCum : 0
    const provPrec = provisionsPrec.get(String(r.employe_id)) || 0
    return {
      employe_id: String(r.employe_id),
      employe_nom: String(r.employe_nom || '').trim(),
      salaire_base: Number(r.salaire_base) || 0,
      nb_mois_travailles: Number(r.nb_mois_travailles) || 0,
      earnings_cumulees: Number(r.earnings_cumulees) || 0,
      provision_cumulee: provCumEffective,
      provision_du_mois: Math.round((provCumEffective - provPrec) * 100) / 100,
      eligible,
      motif_non_eligible: r.motif_non_eligible || null,
    }
  })

  const provCumulTotal = lignes.reduce((a, l) => a + l.provision_cumulee, 0)
  const provDuMoisTotal = lignes.reduce((a, l) => a + l.provision_du_mois, 0)
  const nbEligibles = lignes.filter(l => l.eligible).length

  return {
    societe_id: societeId,
    date_snapshot: dateFinDeMois(annee, mois),
    annee, mois,
    details_par_employe: lignes,
    provision_cumulee_total: Math.round(provCumulTotal * 100) / 100,
    provision_du_mois_total: Math.round(provDuMoisTotal * 100) / 100,
    nb_employes_eligibles: nbEligibles,
    statut: 'calcule',
  }
}

// ─── 2. Sauvegarde snapshot ─────────────────────────────────────────
export async function sauvegarderSnapshotEoy(
  supabase: SupabaseLike,
  snapshot: IAS19EoySnapshot,
  createdBy?: string | null,
): Promise<{ ok: true; id: string } | { ok: false; erreur: string }> {
  const payload: any = {
    societe_id: snapshot.societe_id,
    date_snapshot: snapshot.date_snapshot,
    annee: snapshot.annee,
    mois: snapshot.mois,
    details_par_employe: snapshot.details_par_employe,
    provision_cumulee_total: snapshot.provision_cumulee_total,
    provision_du_mois_total: snapshot.provision_du_mois_total,
    nb_employes_eligibles: snapshot.nb_employes_eligibles,
    statut: snapshot.statut,
  }
  if (createdBy) payload.created_by = createdBy

  const { data, error } = await supabase
    .from('ias19_provisions_eoy_snapshots')
    .upsert(payload, { onConflict: 'societe_id,annee,mois' })
    .select('id')
    .single()
  if (error || !data) return { ok: false, erreur: error?.message || 'Upsert failed' }
  return { ok: true, id: String(data.id) }
}

// ─── 3. Écritures comptables ────────────────────────────────────────
interface EcrOk { ok: true; debitId: string; creditId: string }
interface EcrKo { ok: false; erreur: string }

async function resolveDossierId(supabase: SupabaseLike, societeId: string): Promise<string | null> {
  const { data } = await supabase
    .from('dossiers')
    .select('id')
    .eq('societe_id', societeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { id?: string } | null)?.id || null
}

export async function genererEcrituresComptablesEoy(
  supabase: SupabaseLike,
  snapshotId: string,
): Promise<EcrOk | EcrKo> {
  const { data: snap } = await supabase
    .from('ias19_provisions_eoy_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .maybeSingle()
  if (!snap) return { ok: false, erreur: 'Snapshot introuvable' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- snapshot polymorphe (statut, dates, montants) — typage manuel coûteux pour ce volume de propriétés
  const s = snap as any
  if (s.statut === 'comptabilise') return { ok: false, erreur: 'Déjà comptabilisé' }

  // La charge du mois = delta. Si 0 ou négatif, pas d'écriture.
  const montant = Number(s.provision_du_mois_total)
  if (!Number.isFinite(montant) || Math.abs(montant) < 0.01) {
    await supabase
      .from('ias19_provisions_eoy_snapshots')
      .update({ statut: 'comptabilise' })
      .eq('id', snapshotId)
    return { ok: false, erreur: 'Delta mensuel nul : rien à comptabiliser' }
  }

  const dossierId = await resolveDossierId(supabase, s.societe_id)
  const piece = pieceEoy(Number(s.annee), Number(s.mois), 'NEW')
  const exercice = String(s.annee)
  const libelle = `Provision EOY Bonus IAS 19 — ${libellePeriodeMois(Number(s.annee), Number(s.mois))}`

  // Cas particulier : si provision du mois est négative (régularisation),
  // on inverse les sens (D 4288 / C 64176)
  const debitSurCharge = montant >= 0
  const abs = Math.abs(montant)

  const { data: dbt, error: errDbt } = await supabase
    .from('ecritures_comptables_v2')
    .insert({
      societe_id: s.societe_id,
      dossier_id: dossierId,
      date_ecriture: s.date_snapshot,
      journal: JOURNAL_EOY,
      ref_folio: piece,
      numero_piece: piece,
      numero_compte: debitSurCharge ? COMPTE_CHARGE_EOY : COMPTE_PASSIF_EOY,
      nom_compte: debitSurCharge ? LIBELLE_COMPTE_CHARGE_EOY : LIBELLE_COMPTE_PASSIF_EOY,
      libelle, description: libelle,
      debit_mur: abs,
      credit_mur: 0,
      exercice,
    })
    .select('id')
    .single()
  if (errDbt || !dbt) return { ok: false, erreur: errDbt?.message || 'Insert débit failed' }

  const { data: crd, error: errCrd } = await supabase
    .from('ecritures_comptables_v2')
    .insert({
      societe_id: s.societe_id,
      dossier_id: dossierId,
      date_ecriture: s.date_snapshot,
      journal: JOURNAL_EOY,
      ref_folio: piece,
      numero_piece: piece,
      numero_compte: debitSurCharge ? COMPTE_PASSIF_EOY : COMPTE_CHARGE_EOY,
      nom_compte: debitSurCharge ? LIBELLE_COMPTE_PASSIF_EOY : LIBELLE_COMPTE_CHARGE_EOY,
      libelle, description: libelle,
      debit_mur: 0,
      credit_mur: abs,
      exercice,
    })
    .select('id')
    .single()
  if (errCrd || !crd) {
    await supabase.from('ecritures_comptables_v2').delete().eq('id', (dbt as { id: string }).id)
    return { ok: false, erreur: errCrd?.message || 'Insert crédit failed' }
  }

  await supabase
    .from('ias19_provisions_eoy_snapshots')
    .update({
      ecriture_debit_id: (dbt as { id: string }).id,
      ecriture_credit_id: (crd as { id: string }).id,
      statut: 'comptabilise',
    })
    .eq('id', snapshotId)

  return { ok: true, debitId: String((dbt as { id: string }).id), creditId: String((crd as { id: string }).id) }
}

// ─── 4. Extourne du mois précédent ──────────────────────────────────
export async function extournerSnapshotEoy(
  supabase: SupabaseLike,
  snapshotId: string,
  datePassageExtourne: string,
): Promise<EcrOk | EcrKo> {
  const { data: snap } = await supabase
    .from('ias19_provisions_eoy_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .maybeSingle()
  if (!snap) return { ok: false, erreur: 'Snapshot à extourner introuvable' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- snapshot polymorphe (statut, dates, montants) — typage manuel coûteux pour ce volume de propriétés
  const s = snap as any
  if (s.statut !== 'comptabilise') {
    return { ok: false, erreur: `Snapshot pas comptabilisé (statut=${s.statut})` }
  }
  // Pour l'extourne mensuelle : on extourne le MONTANT CUMULÉ (reset complet),
  // puis la nouvelle provision remet la cumulée à jour. C'est plus simple
  // qu'extourner uniquement le delta du mois.
  const montant = Number(s.provision_cumulee_total)
  if (!Number.isFinite(montant) || Math.abs(montant) < 0.01) {
    return { ok: false, erreur: 'Rien à extourner (cumul nul)' }
  }

  const dossierId = await resolveDossierId(supabase, s.societe_id)
  const pieceExt = pieceEoy(Number(s.annee), Number(s.mois), 'EXT')
  const exercice = String(datePassageExtourne).slice(0, 4)
  const libelle = `Extourne provision EOY Bonus IAS 19 — ${libellePeriodeMois(Number(s.annee), Number(s.mois))}`
  const abs = Math.abs(montant)

  // Inverse de l'écriture initiale (qui était D 64176 / C 4288)
  const { data: dbt, error: errDbt } = await supabase
    .from('ecritures_comptables_v2')
    .insert({
      societe_id: s.societe_id,
      dossier_id: dossierId,
      date_ecriture: datePassageExtourne,
      journal: JOURNAL_EOY,
      ref_folio: pieceExt,
      numero_piece: pieceExt,
      numero_compte: COMPTE_PASSIF_EOY,
      nom_compte: LIBELLE_COMPTE_PASSIF_EOY,
      libelle, description: libelle,
      debit_mur: abs,
      credit_mur: 0,
      exercice,
    })
    .select('id')
    .single()
  if (errDbt || !dbt) return { ok: false, erreur: errDbt?.message || 'Insert extourne débit failed' }

  const { data: crd, error: errCrd } = await supabase
    .from('ecritures_comptables_v2')
    .insert({
      societe_id: s.societe_id,
      dossier_id: dossierId,
      date_ecriture: datePassageExtourne,
      journal: JOURNAL_EOY,
      ref_folio: pieceExt,
      numero_piece: pieceExt,
      numero_compte: COMPTE_CHARGE_EOY,
      nom_compte: LIBELLE_COMPTE_CHARGE_EOY,
      libelle, description: libelle,
      debit_mur: 0,
      credit_mur: abs,
      exercice,
    })
    .select('id')
    .single()
  if (errCrd || !crd) {
    await supabase.from('ecritures_comptables_v2').delete().eq('id', (dbt as { id: string }).id)
    return { ok: false, erreur: errCrd?.message || 'Insert extourne crédit failed' }
  }

  await supabase
    .from('ias19_provisions_eoy_snapshots')
    .update({
      ecriture_extourne_debit_id: (dbt as { id: string }).id,
      ecriture_extourne_credit_id: (crd as { id: string }).id,
      statut: 'extourne',
    })
    .eq('id', snapshotId)

  return { ok: true, debitId: String((dbt as { id: string }).id), creditId: String((crd as { id: string }).id) }
}

// ─── 5. Historique ──────────────────────────────────────────────────
export async function getSnapshotsEoySociete(
  supabase: SupabaseLike,
  societeId: string,
  annee?: number,
): Promise<IAS19EoySnapshot[]> {
  let q = supabase
    .from('ias19_provisions_eoy_snapshots')
    .select('*')
    .eq('societe_id', societeId)
    .order('annee', { ascending: false })
    .order('mois', { ascending: false })
  if (annee) q = q.eq('annee', annee)
  const { data } = await q
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- snapshot rows polymorphes
  return ((data || []) as any[]).map(mapSnapshotEoy)
}

export async function getSnapshotEoy(
  supabase: SupabaseLike,
  societeId: string,
  annee: number,
  mois: number,
): Promise<IAS19EoySnapshot | null> {
  const { data } = await supabase
    .from('ias19_provisions_eoy_snapshots')
    .select('*')
    .eq('societe_id', societeId)
    .eq('annee', annee)
    .eq('mois', mois)
    .maybeSingle()
  return data ? mapSnapshotEoy(data) : null
}

function mapSnapshotEoy(r: any): IAS19EoySnapshot {
  return {
    id: String(r.id),
    societe_id: String(r.societe_id),
    date_snapshot: String(r.date_snapshot).slice(0, 10),
    annee: Number(r.annee),
    mois: Number(r.mois),
    details_par_employe: Array.isArray(r.details_par_employe) ? r.details_par_employe : [],
    provision_cumulee_total: Number(r.provision_cumulee_total) || 0,
    provision_du_mois_total: Number(r.provision_du_mois_total) || 0,
    nb_employes_eligibles: Number(r.nb_employes_eligibles) || 0,
    statut: (r.statut as IAS19EoyStatut) || 'calcule',
    ecriture_debit_id: r.ecriture_debit_id || null,
    ecriture_credit_id: r.ecriture_credit_id || null,
    ecriture_extourne_debit_id: r.ecriture_extourne_debit_id || null,
    ecriture_extourne_credit_id: r.ecriture_extourne_credit_id || null,
    created_at: r.created_at || undefined,
    updated_at: r.updated_at || undefined,
  }
}

// ─── 6. Annulation (soft) ───────────────────────────────────────────
export async function annulerSnapshotEoy(
  supabase: SupabaseLike,
  snapshotId: string,
): Promise<{ ok: boolean; erreur?: string }> {
  const { error } = await supabase
    .from('ias19_provisions_eoy_snapshots')
    .update({ statut: 'annule' })
    .eq('id', snapshotId)
  if (error) return { ok: false, erreur: error.message }
  return { ok: true }
}

// ─── 7. UI helpers ──────────────────────────────────────────────────
export function formaterMUREoy(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(Math.round(n))
    .replace(/[   ]/g, ' ')} MUR`
}

export const STATUT_EOY_LABELS: Record<IAS19EoyStatut, string> = {
  calcule: 'Calculé',
  comptabilise: 'Comptabilisé',
  extourne: 'Extourné',
  annule: 'Annulé',
}

export const MOTIF_NON_ELIGIBLE_EOY: Record<string, string> = {
  salaire_au_dessus_seuil: 'Salaire > seuil',
  demission_avant_8_mois: 'Démission avant 8 mois',
  pas_employe_sur_periode: 'Pas employé sur la période',
}
