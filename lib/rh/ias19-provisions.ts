/**
 * Helper — Provisions congés payés IAS 19 (sprint G8 Phase 1).
 *
 * Pipeline :
 *   1. calculerProvisionSociete     → RPC calculer_provision_conges_ias19
 *   2. sauvegarderSnapshot          → INSERT/UPDATE ias19_provisions_conges_snapshots
 *   3. extournerSnapshot (mois-1)   → crée 2 écritures inverses sur ecritures_comptables_v2
 *   4. genererEcrituresComptables   → 2 écritures (D 6417 / C 4287) sur date_snapshot
 *
 * Comptes : 6417 (charge) / 4287 (passif). Journal : OD.
 * Pièce    : PRO-IAS19-YYYY-MM[-EXT] (ou -EXT pour l'extourne).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export type IAS19Statut = 'calcule' | 'comptabilise' | 'extourne' | 'annule'

export interface IAS19ProvisionLigne {
  employe_id: string
  employe_nom: string
  al_acquis: number
  al_pris: number
  al_non_pris: number
  salaire_base: number
  cout_journalier_charge: number
  provision_mur: number
}

export interface IAS19Snapshot {
  id?: string
  societe_id: string
  date_snapshot: string // YYYY-MM-DD (dernier jour du mois)
  details_par_employe: IAS19ProvisionLigne[]
  provision_total_mur: number
  charges_patronales_pct: number
  statut: IAS19Statut
  ecriture_debit_id?: string | null
  ecriture_credit_id?: string | null
  ecriture_extourne_debit_id?: string | null
  ecriture_extourne_credit_id?: string | null
  created_at?: string
  updated_at?: string
}

export const COMPTE_CHARGE = '6417'
export const LIBELLE_COMPTE_CHARGE = 'Provisions pour congés payés (charge) — IAS 19'
export const COMPTE_PASSIF = '4287'
export const LIBELLE_COMPTE_PASSIF = 'Provisions congés payés (passif) — IAS 19'
export const JOURNAL = 'OD'

// ─── Utilitaires dates ──────────────────────────────────────────────
export function finDeMois(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00')
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

export function moisPrecedent(dateFinMoisISO: string): string {
  const d = new Date(dateFinMoisISO + 'T12:00:00')
  return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10)
}

export function libellePeriode(dateFinMoisISO: string): string {
  const d = new Date(dateFinMoisISO + 'T12:00:00')
  const mois = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return mois.charAt(0).toUpperCase() + mois.slice(1)
}

function pieceIAS19(dateSnapshot: string, suffixe: 'NEW' | 'EXT' = 'NEW'): string {
  const yyyymm = dateSnapshot.slice(0, 7).replace('-', '')
  return `PRO-IAS19-${yyyymm}${suffixe === 'EXT' ? '-EXT' : ''}`
}

// ─── 1. Calcul ──────────────────────────────────────────────────────
export async function calculerProvisionSociete(
  supabase: SupabaseLike,
  societeId: string,
  dateSnapshot?: string,
): Promise<IAS19Snapshot> {
  const date = dateSnapshot || finDeMois(new Date().toISOString().slice(0, 10))

  const { data: soc } = await supabase
    .from('societes')
    .select('ias19_charges_patronales_pct')
    .eq('id', societeId)
    .maybeSingle()
  const chargesPct = Number((soc as any)?.ias19_charges_patronales_pct ?? 0.13)

  const { data, error } = await supabase.rpc('calculer_provision_conges_ias19', {
    p_societe_id: societeId,
    p_date_snapshot: date,
  })
  if (error) throw new Error(error.message)

  const lignes: IAS19ProvisionLigne[] = ((data || []) as any[]).map(r => ({
    employe_id: String(r.employe_id),
    employe_nom: String(r.employe_nom || '').trim(),
    al_acquis: Number(r.al_acquis) || 0,
    al_pris: Number(r.al_pris) || 0,
    al_non_pris: Number(r.al_non_pris) || 0,
    salaire_base: Number(r.salaire_base) || 0,
    cout_journalier_charge: Number(r.cout_journalier_charge) || 0,
    provision_mur: Number(r.provision_mur) || 0,
  }))

  const total = lignes.reduce((acc, l) => acc + l.provision_mur, 0)

  return {
    societe_id: societeId,
    date_snapshot: date,
    details_par_employe: lignes,
    provision_total_mur: Math.round(total * 100) / 100,
    charges_patronales_pct: chargesPct,
    statut: 'calcule',
  }
}

// ─── 2. Sauvegarde snapshot (upsert) ────────────────────────────────
export async function sauvegarderSnapshot(
  supabase: SupabaseLike,
  snapshot: IAS19Snapshot,
  createdBy?: string | null,
): Promise<{ ok: true; id: string } | { ok: false; erreur: string }> {
  const payload: any = {
    societe_id: snapshot.societe_id,
    date_snapshot: snapshot.date_snapshot,
    details_par_employe: snapshot.details_par_employe,
    provision_total_mur: snapshot.provision_total_mur,
    charges_patronales_pct: snapshot.charges_patronales_pct,
    statut: snapshot.statut,
  }
  if (createdBy) payload.created_by = createdBy

  const { data, error } = await supabase
    .from('ias19_provisions_conges_snapshots')
    .upsert(payload, { onConflict: 'societe_id,date_snapshot' })
    .select('id')
    .single()
  if (error || !data) return { ok: false, erreur: error?.message || 'Upsert failed' }
  return { ok: true, id: String(data.id) }
}

// ─── 3. Génération écritures comptables ─────────────────────────────
interface EcrituresResult {
  ok: true
  debitId: string
  creditId: string
}
interface EcrituresError {
  ok: false
  erreur: string
}

async function resolveDossierId(supabase: SupabaseLike, societeId: string): Promise<string | null> {
  const { data } = await supabase
    .from('dossiers')
    .select('id')
    .eq('societe_id', societeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as any)?.id || null
}

export async function genererEcrituresComptables(
  supabase: SupabaseLike,
  snapshotId: string,
): Promise<EcrituresResult | EcrituresError> {
  const { data: snap } = await supabase
    .from('ias19_provisions_conges_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .maybeSingle()
  if (!snap) return { ok: false, erreur: 'Snapshot introuvable' }

  const s = snap as any
  if (s.statut === 'comptabilise') {
    return { ok: false, erreur: 'Déjà comptabilisé' }
  }
  if (Number(s.provision_total_mur) <= 0) {
    return { ok: false, erreur: 'Provision nulle : rien à comptabiliser' }
  }

  const dossierId = await resolveDossierId(supabase, s.societe_id)
  const piece = pieceIAS19(s.date_snapshot, 'NEW')
  const exercice = String(s.date_snapshot).slice(0, 4)
  const libelle = `Provision congés payés IAS 19 — ${libellePeriode(s.date_snapshot)}`
  const montant = Number(s.provision_total_mur)

  const { data: dbt, error: errDbt } = await supabase
    .from('ecritures_comptables_v2')
    .insert({
      societe_id: s.societe_id,
      dossier_id: dossierId,
      date_ecriture: s.date_snapshot,
      journal: JOURNAL,
      ref_folio: piece,
      numero_piece: piece,
      numero_compte: COMPTE_CHARGE,
      nom_compte: LIBELLE_COMPTE_CHARGE,
      libelle,
      description: libelle,
      debit_mur: montant,
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
      journal: JOURNAL,
      ref_folio: piece,
      numero_piece: piece,
      numero_compte: COMPTE_PASSIF,
      nom_compte: LIBELLE_COMPTE_PASSIF,
      libelle,
      description: libelle,
      debit_mur: 0,
      credit_mur: montant,
      exercice,
    })
    .select('id')
    .single()
  if (errCrd || !crd) {
    // Rollback best effort : delete débit line
    await supabase.from('ecritures_comptables_v2').delete().eq('id', (dbt as any).id)
    return { ok: false, erreur: errCrd?.message || 'Insert crédit failed' }
  }

  await supabase
    .from('ias19_provisions_conges_snapshots')
    .update({
      ecriture_debit_id: (dbt as any).id,
      ecriture_credit_id: (crd as any).id,
      statut: 'comptabilise',
    })
    .eq('id', snapshotId)

  return { ok: true, debitId: String((dbt as any).id), creditId: String((crd as any).id) }
}

// ─── 4. Extourne du mois précédent ─────────────────────────────────
export async function extournerSnapshot(
  supabase: SupabaseLike,
  snapshotId: string,
  datePassageExtourne: string,
): Promise<EcrituresResult | EcrituresError> {
  const { data: snap } = await supabase
    .from('ias19_provisions_conges_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .maybeSingle()
  if (!snap) return { ok: false, erreur: 'Snapshot à extourner introuvable' }

  const s = snap as any
  if (s.statut !== 'comptabilise') {
    return { ok: false, erreur: `Snapshot pas comptabilisé (statut=${s.statut})` }
  }
  if (Number(s.provision_total_mur) <= 0) {
    return { ok: false, erreur: 'Pas d\'extourne : provision nulle' }
  }

  const dossierId = await resolveDossierId(supabase, s.societe_id)
  const pieceExt = pieceIAS19(s.date_snapshot, 'EXT')
  const exercice = String(datePassageExtourne).slice(0, 4)
  const libelle = `Extourne provision congés IAS 19 — ${libellePeriode(s.date_snapshot)}`
  const montant = Number(s.provision_total_mur)

  // Extourne = écritures inverses (crédit sur 6417, débit sur 4287)
  const { data: dbt, error: errDbt } = await supabase
    .from('ecritures_comptables_v2')
    .insert({
      societe_id: s.societe_id,
      dossier_id: dossierId,
      date_ecriture: datePassageExtourne,
      journal: JOURNAL,
      ref_folio: pieceExt,
      numero_piece: pieceExt,
      numero_compte: COMPTE_PASSIF,
      nom_compte: LIBELLE_COMPTE_PASSIF,
      libelle,
      description: libelle,
      debit_mur: montant,
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
      journal: JOURNAL,
      ref_folio: pieceExt,
      numero_piece: pieceExt,
      numero_compte: COMPTE_CHARGE,
      nom_compte: LIBELLE_COMPTE_CHARGE,
      libelle,
      description: libelle,
      debit_mur: 0,
      credit_mur: montant,
      exercice,
    })
    .select('id')
    .single()
  if (errCrd || !crd) {
    await supabase.from('ecritures_comptables_v2').delete().eq('id', (dbt as any).id)
    return { ok: false, erreur: errCrd?.message || 'Insert extourne crédit failed' }
  }

  await supabase
    .from('ias19_provisions_conges_snapshots')
    .update({
      ecriture_extourne_debit_id: (dbt as any).id,
      ecriture_extourne_credit_id: (crd as any).id,
      statut: 'extourne',
    })
    .eq('id', snapshotId)

  return { ok: true, debitId: String((dbt as any).id), creditId: String((crd as any).id) }
}

// ─── 5. Historique ──────────────────────────────────────────────────
export async function getSnapshotsSociete(
  supabase: SupabaseLike,
  societeId: string,
  annee?: number,
): Promise<IAS19Snapshot[]> {
  let q = supabase
    .from('ias19_provisions_conges_snapshots')
    .select('*')
    .eq('societe_id', societeId)
    .order('date_snapshot', { ascending: false })
  if (annee) {
    q = q.gte('date_snapshot', `${annee}-01-01`).lte('date_snapshot', `${annee}-12-31`)
  }
  const { data } = await q
  return ((data || []) as any[]).map(mapSnapshot)
}

export async function getSnapshot(
  supabase: SupabaseLike,
  societeId: string,
  dateSnapshot: string,
): Promise<IAS19Snapshot | null> {
  const { data } = await supabase
    .from('ias19_provisions_conges_snapshots')
    .select('*')
    .eq('societe_id', societeId)
    .eq('date_snapshot', dateSnapshot)
    .maybeSingle()
  return data ? mapSnapshot(data) : null
}

function mapSnapshot(r: any): IAS19Snapshot {
  return {
    id: String(r.id),
    societe_id: String(r.societe_id),
    date_snapshot: String(r.date_snapshot).slice(0, 10),
    details_par_employe: Array.isArray(r.details_par_employe) ? r.details_par_employe : [],
    provision_total_mur: Number(r.provision_total_mur) || 0,
    charges_patronales_pct: Number(r.charges_patronales_pct) || 0.13,
    statut: (r.statut as IAS19Statut) || 'calcule',
    ecriture_debit_id: r.ecriture_debit_id || null,
    ecriture_credit_id: r.ecriture_credit_id || null,
    ecriture_extourne_debit_id: r.ecriture_extourne_debit_id || null,
    ecriture_extourne_credit_id: r.ecriture_extourne_credit_id || null,
    created_at: r.created_at || undefined,
    updated_at: r.updated_at || undefined,
  }
}

// ─── 6. Annulation (soft) ───────────────────────────────────────────
export async function annulerSnapshot(
  supabase: SupabaseLike,
  snapshotId: string,
): Promise<{ ok: boolean; erreur?: string }> {
  const { error } = await supabase
    .from('ias19_provisions_conges_snapshots')
    .update({ statut: 'annule' })
    .eq('id', snapshotId)
  if (error) return { ok: false, erreur: error.message }
  return { ok: true }
}

// ─── 7. UI helpers ──────────────────────────────────────────────────
export function formaterMUR(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(Math.round(n))
    .replace(/[   ]/g, ' ')} MUR`
}

export const STATUT_LABELS: Record<IAS19Statut, string> = {
  calcule: 'Calculé',
  comptabilise: 'Comptabilisé',
  extourne: 'Extourné',
  annule: 'Annulé',
}
