/**
 * Helper — Déclarations MRA mensuelles (sprint G13).
 *
 * Pipeline :
 *   1. agregerDeclarationsMraMois → RPC agreger_declarations_mra
 *   2. sauvegarderDeclarationPaye / sauvegarderDeclarationCsg
 *      → UPSERT sur declarations_paye_mensuelle / declarations_csg_mensuelle
 *   3. genererCsvMraPaye / genererCsvMraCsg → CSV conforme MRA
 *   4. marquerPayeMra → 3 écritures paiement groupé (431/432/444 → 512)
 *
 * Comptes paiement groupé (existants, alignés avec moteur paie) :
 *   - 444 PAYE à payer         (Débit / Crédit 512)
 *   - 431 CSG/NSF à payer      (Débit / Crédit 512)
 *   - 432 Training Levy + PRGF (Débit / Crédit 512)
 *
 * Journal : BNQ. Pièce : MRA-YYYY-MM.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export type StatutDeclarationMra = 'brouillon' | 'calcule' | 'declare' | 'paye' | 'annule'

export interface DetailEmployeMra {
  employe_id: string
  nom: string
  nic: string | null
  tan: string | null
  basic: number
  salaire_brut: number
  overtime: number
  paye: number
  csg_salarie: number
  csg_patronal: number
  nsf_salarie: number
  nsf_patronal: number
  training_levy: number
  prgf: number
  prgf_eligible: boolean
  prgf_motif_exemption: string | null
}

export interface DeclarationMraRecap {
  societe_id: string
  periode: string                // YYYY-MM-DD (1er du mois)
  nb_employes: number
  nb_prgf_eligibles: number
  masse_salariale: number
  total_paye: number
  total_csg_salarie: number
  total_csg_patronal: number
  total_nsf_salarie: number
  total_nsf_patronal: number
  total_training_levy: number
  total_prgf: number
  total_a_remettre_mra: number
  details: DetailEmployeMra[]
}

export interface DeclarationPayeRecord {
  id: string
  societe_id: string
  periode: string
  total_salaires_bruts: number
  total_paye_retenu: number
  nb_employes: number
  date_limite: string | null
  date_declaration: string | null
  date_paiement: string | null
  reference_mra: string | null
  statut: StatutDeclarationMra
  penalites: number
  ern_employeur: string | null
  details_par_employe: DetailEmployeMra[]
  csv_mra_url: string | null
  created_at?: string
  updated_at?: string
}

export interface DeclarationCsgRecord {
  id: string
  societe_id: string
  periode: string
  ern: string | null
  nb_employes: number
  masse_salariale_brute: number
  total_csg_salarie: number
  total_csg_patronal: number
  total_nsf_salarie: number
  total_nsf_patronal: number
  total_training_levy: number
  total_prgf: number
  total_a_remettre_mra: number
  date_limite: string | null
  date_declaration: string | null
  date_paiement: string | null
  reference_mra: string | null
  statut: StatutDeclarationMra
  penalites: number
  ern_employeur: string | null
  details_par_employe: DetailEmployeMra[]
  csv_mra_url: string | null
  ecriture_paiement_id: string | null
  created_at?: string
  updated_at?: string
}

// ─── Utilitaires ────────────────────────────────────────────────────
export function firstDayOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function deadlineMraFromPeriode(periodeIso: string): string {
  // Deadline = fin du mois SUIVANT
  const d = new Date(periodeIso + 'T12:00:00')
  return new Date(d.getFullYear(), d.getMonth() + 2, 0).toISOString().slice(0, 10)
}

export function libellePeriode(periodeIso: string): string {
  const d = new Date(periodeIso + 'T12:00:00')
  const m = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return m.charAt(0).toUpperCase() + m.slice(1)
}

export function formaterMUR(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(Math.round(n)).replace(/[   ]/g, ' ')} MUR`
}

function pieceMra(periodeIso: string): string {
  return `MRA-${periodeIso.slice(0, 7).replace('-', '')}`
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  if (/[,";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// ─── 1. Agrégation (RPC) ────────────────────────────────────────────
export async function agregerDeclarationsMraMois(
  supabase: SupabaseLike,
  societeId: string,
  periode: string,
): Promise<DeclarationMraRecap> {
  const p = firstDayOfMonth(periode)
  const { data, error } = await supabase
    .rpc('agreger_declarations_mra', { p_societe_id: societeId, p_periode: p })
    .maybeSingle()
  if (error) throw new Error(error.message)
  const r = (data || {}) as Record<string, unknown>
  return {
    societe_id: societeId,
    periode: p,
    nb_employes: Number(r.nb_employes) || 0,
    nb_prgf_eligibles: Number(r.nb_prgf_eligibles) || 0,
    masse_salariale: Number(r.masse_salariale) || 0,
    total_paye: Number(r.total_paye) || 0,
    total_csg_salarie: Number(r.total_csg_salarie) || 0,
    total_csg_patronal: Number(r.total_csg_patronal) || 0,
    total_nsf_salarie: Number(r.total_nsf_salarie) || 0,
    total_nsf_patronal: Number(r.total_nsf_patronal) || 0,
    total_training_levy: Number(r.total_training_levy) || 0,
    total_prgf: Number(r.total_prgf) || 0,
    total_a_remettre_mra: Number(r.total_a_remettre_mra) || 0,
    details: (Array.isArray(r.details) ? r.details as Array<Record<string, unknown>> : []).map(normaliserDetail),
  }
}

function normaliserDetail(raw: Record<string, unknown>): DetailEmployeMra {
  const d = raw as Record<string, unknown>
  return {
    employe_id: String(d.employe_id),
    nom: String(d.nom || '').trim(),
    nic: (d.nic as string | null) || null,
    tan: (d.tan as string | null) || null,
    basic: Number(d.basic) || 0,
    salaire_brut: Number(d.salaire_brut) || 0,
    overtime: Number(d.overtime) || 0,
    paye: Number(d.paye) || 0,
    csg_salarie: Number(d.csg_salarie) || 0,
    csg_patronal: Number(d.csg_patronal) || 0,
    nsf_salarie: Number(d.nsf_salarie) || 0,
    nsf_patronal: Number(d.nsf_patronal) || 0,
    training_levy: Number(d.training_levy) || 0,
    prgf: Number(d.prgf) || 0,
    prgf_eligible: Boolean(d.prgf_eligible),
    prgf_motif_exemption: (d.prgf_motif_exemption as string | null) || null,
  }
}

// ─── 2. Sauvegarde (upsert sur chacune des 2 tables) ────────────────
export async function sauvegarderDeclarationPaye(
  supabase: SupabaseLike,
  recap: DeclarationMraRecap,
  ern?: string | null,
): Promise<{ ok: true; id: string } | { ok: false; erreur: string }> {
  const payload = {
    societe_id: recap.societe_id,
    periode: recap.periode,
    total_salaires_bruts: recap.masse_salariale,
    total_paye_retenu: recap.total_paye,
    nb_employes: recap.nb_employes,
    date_limite: deadlineMraFromPeriode(recap.periode),
    details_par_employe: recap.details,
    ern_employeur: ern ?? null,
    statut: 'calcule',
  }
  const { data, error } = await supabase
    .from('declarations_paye_mensuelle')
    .upsert(payload, { onConflict: 'societe_id,periode' })
    .select('id')
    .single()
  if (error || !data) return { ok: false, erreur: error?.message || 'Upsert paye failed' }
  return { ok: true, id: String(data.id) }
}

export async function sauvegarderDeclarationCsg(
  supabase: SupabaseLike,
  recap: DeclarationMraRecap,
  ern?: string | null,
): Promise<{ ok: true; id: string } | { ok: false; erreur: string }> {
  const payload = {
    societe_id: recap.societe_id,
    periode: recap.periode,
    ern: ern ?? null,
    nb_employes: recap.nb_employes,
    masse_salariale_brute: recap.masse_salariale,
    total_csg_salarie: recap.total_csg_salarie,
    total_csg_patronal: recap.total_csg_patronal,
    total_nsf_salarie: recap.total_nsf_salarie,
    total_nsf_patronal: recap.total_nsf_patronal,
    total_training_levy: recap.total_training_levy,
    total_prgf: recap.total_prgf,
    total_a_remettre_mra:
      recap.total_csg_salarie + recap.total_csg_patronal +
      recap.total_nsf_salarie + recap.total_nsf_patronal +
      recap.total_training_levy + recap.total_prgf,
    date_limite: deadlineMraFromPeriode(recap.periode),
    details_par_employe: recap.details,
    ern_employeur: ern ?? null,
    statut: 'calcule',
  }
  const { data, error } = await supabase
    .from('declarations_csg_mensuelle')
    .upsert(payload, { onConflict: 'societe_id,periode' })
    .select('id')
    .single()
  if (error || !data) return { ok: false, erreur: error?.message || 'Upsert csg failed' }
  return { ok: true, id: String(data.id) }
}

// ─── 3. Exports CSV MRA ─────────────────────────────────────────────
export function genererCsvMraPaye(recap: DeclarationMraRecap): string {
  const headers = [
    'NIC', 'TAN', 'Employee Name', 'Emoluments', 'PAYE Withheld',
    'Period', 'ERN',
  ]
  const lines = [headers.map(csvEscape).join(',')]
  for (const d of recap.details) {
    if (d.paye <= 0 && d.salaire_brut <= 0) continue
    lines.push([
      d.nic || '',
      d.tan || '',
      d.nom,
      d.salaire_brut.toFixed(2),
      d.paye.toFixed(2),
      recap.periode.slice(0, 7),
      '',
    ].map(csvEscape).join(','))
  }
  // Totaux en fin de fichier
  lines.push([
    '', '', 'TOTAL',
    recap.masse_salariale.toFixed(2),
    recap.total_paye.toFixed(2),
    recap.periode.slice(0, 7), '',
  ].map(csvEscape).join(','))
  return lines.join('\r\n')
}

export function genererCsvMraCsg(recap: DeclarationMraRecap): string {
  const headers = [
    'NIC', 'Employee Name', 'Basic Wage', 'Overtime',
    'CSG Employee', 'CSG Employer', 'NSF Employee', 'NSF Employer',
    'Training Levy', 'PRGF', 'PRGF Exempt Reason', 'Period', 'ERN',
  ]
  const lines = [headers.map(csvEscape).join(',')]
  for (const d of recap.details) {
    lines.push([
      d.nic || '',
      d.nom,
      d.basic.toFixed(2),
      d.overtime.toFixed(2),
      d.csg_salarie.toFixed(2),
      d.csg_patronal.toFixed(2),
      d.nsf_salarie.toFixed(2),
      d.nsf_patronal.toFixed(2),
      d.training_levy.toFixed(2),
      d.prgf.toFixed(2),
      d.prgf_eligible ? '' : (d.prgf_motif_exemption || 'exempt'),
      recap.periode.slice(0, 7),
      '',
    ].map(csvEscape).join(','))
  }
  lines.push([
    '', 'TOTAL',
    recap.masse_salariale.toFixed(2), '',
    recap.total_csg_salarie.toFixed(2),
    recap.total_csg_patronal.toFixed(2),
    recap.total_nsf_salarie.toFixed(2),
    recap.total_nsf_patronal.toFixed(2),
    recap.total_training_levy.toFixed(2),
    recap.total_prgf.toFixed(2),
    '',
    recap.periode.slice(0, 7), '',
  ].map(csvEscape).join(','))
  return lines.join('\r\n')
}

// ─── 4. Paiement groupé + écritures comptables ──────────────────────
const COMPTE_PAYE = '444'
const COMPTE_PAYE_LIB = 'Etat — impôts sur le revenu (PAYE)'
const COMPTE_CSG_NSF = '431'
const COMPTE_CSG_NSF_LIB = 'Sécurité sociale (CSG/NSF)'
const COMPTE_TRAIN_PRGF = '432'
const COMPTE_TRAIN_PRGF_LIB = 'Autres organismes sociaux (Training Levy, PRGF)'
const COMPTE_BANQUE = '512'
const COMPTE_BANQUE_LIB = 'Banque (compte principal)'
const JOURNAL_BNQ = 'BNQ'

async function resolveDossierId(supabase: SupabaseLike, societeId: string): Promise<string | null> {
  const { data } = await supabase
    .from('dossiers').select('id')
    .eq('societe_id', societeId)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle()
  return (data as { id?: string } | null)?.id || null
}

async function insertEcriture(
  supabase: SupabaseLike,
  row: {
    societe_id: string; dossier_id: string | null; date: string; piece: string;
    compte: string; nom_compte: string; libelle: string;
    debit: number; credit: number; exercice: string;
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ecritures_comptables_v2')
    .insert({
      societe_id: row.societe_id,
      dossier_id: row.dossier_id,
      date_ecriture: row.date,
      journal: JOURNAL_BNQ,
      ref_folio: row.piece,
      numero_piece: row.piece,
      numero_compte: row.compte,
      nom_compte: row.nom_compte,
      libelle: row.libelle,
      description: row.libelle,
      debit_mur: row.debit,
      credit_mur: row.credit,
      exercice: row.exercice,
    })
    .select('id').single()
  if (error) return null
  return String((data as any).id)
}

export interface PaiementMraResult {
  ok: boolean
  erreur?: string
  ecritures?: string[]
  declaration_paye_id?: string
  declaration_csg_id?: string
}

export async function marquerPayeMra(
  supabase: SupabaseLike,
  args: {
    societeId: string
    declarationPayeId: string
    declarationCsgId: string
    datePaiement: string
    referenceBancaire: string
  },
): Promise<PaiementMraResult> {
  // 1. Fetch les 2 déclarations pour récupérer les montants
  const [{ data: paye }, { data: csg }] = await Promise.all([
    supabase.from('declarations_paye_mensuelle').select('*').eq('id', args.declarationPayeId).maybeSingle(),
    supabase.from('declarations_csg_mensuelle').select('*').eq('id', args.declarationCsgId).maybeSingle(),
  ])
  if (!paye) return { ok: false, erreur: 'Déclaration PAYE introuvable' }
  if (!csg) return { ok: false, erreur: 'Déclaration CSG introuvable' }

  const p = paye as any
  const c = csg as any
  const totalPaye = Number(p.total_paye_retenu) || 0
  const totalCsgNsf = (Number(c.total_csg_salarie) || 0)
    + (Number(c.total_csg_patronal) || 0)
    + (Number(c.total_nsf_salarie) || 0)
    + (Number(c.total_nsf_patronal) || 0)
  const totalTrainPrgf = (Number(c.total_training_levy) || 0)
    + (Number(c.total_prgf) || 0)
  const totalGlobal = totalPaye + totalCsgNsf + totalTrainPrgf

  if (totalGlobal <= 0) {
    // Rien à payer : juste marquer payée
    await supabase.from('declarations_paye_mensuelle')
      .update({ statut: 'paye', date_paiement: args.datePaiement, reference_mra: args.referenceBancaire })
      .eq('id', args.declarationPayeId)
    await supabase.from('declarations_csg_mensuelle')
      .update({ statut: 'paye', date_paiement: args.datePaiement, reference_mra: args.referenceBancaire })
      .eq('id', args.declarationCsgId)
    return { ok: true, declaration_paye_id: args.declarationPayeId, declaration_csg_id: args.declarationCsgId }
  }

  const dossierId = await resolveDossierId(supabase, args.societeId)
  const periodeLib = libellePeriode(p.periode)
  const piece = pieceMra(p.periode)
  const exercice = String(args.datePaiement).slice(0, 4)
  const ecritures: string[] = []

  // PAYE
  if (totalPaye > 0) {
    const debitId = await insertEcriture(supabase, {
      societe_id: args.societeId, dossier_id: dossierId, date: args.datePaiement, piece,
      compte: COMPTE_PAYE, nom_compte: COMPTE_PAYE_LIB,
      libelle: `Paiement PAYE MRA — ${periodeLib}`,
      debit: totalPaye, credit: 0, exercice,
    })
    const creditId = await insertEcriture(supabase, {
      societe_id: args.societeId, dossier_id: dossierId, date: args.datePaiement, piece,
      compte: COMPTE_BANQUE, nom_compte: COMPTE_BANQUE_LIB,
      libelle: `Paiement PAYE MRA — ${periodeLib} (ref ${args.referenceBancaire})`,
      debit: 0, credit: totalPaye, exercice,
    })
    if (debitId) ecritures.push(debitId)
    if (creditId) ecritures.push(creditId)
  }

  // CSG + NSF (salarié + patronal)
  if (totalCsgNsf > 0) {
    const debitId = await insertEcriture(supabase, {
      societe_id: args.societeId, dossier_id: dossierId, date: args.datePaiement, piece,
      compte: COMPTE_CSG_NSF, nom_compte: COMPTE_CSG_NSF_LIB,
      libelle: `Paiement CSG + NSF MRA — ${periodeLib}`,
      debit: totalCsgNsf, credit: 0, exercice,
    })
    const creditId = await insertEcriture(supabase, {
      societe_id: args.societeId, dossier_id: dossierId, date: args.datePaiement, piece,
      compte: COMPTE_BANQUE, nom_compte: COMPTE_BANQUE_LIB,
      libelle: `Paiement CSG + NSF MRA — ${periodeLib} (ref ${args.referenceBancaire})`,
      debit: 0, credit: totalCsgNsf, exercice,
    })
    if (debitId) ecritures.push(debitId)
    if (creditId) ecritures.push(creditId)
  }

  // Training Levy + PRGF
  if (totalTrainPrgf > 0) {
    const debitId = await insertEcriture(supabase, {
      societe_id: args.societeId, dossier_id: dossierId, date: args.datePaiement, piece,
      compte: COMPTE_TRAIN_PRGF, nom_compte: COMPTE_TRAIN_PRGF_LIB,
      libelle: `Paiement Training Levy + PRGF MRA — ${periodeLib}`,
      debit: totalTrainPrgf, credit: 0, exercice,
    })
    const creditId = await insertEcriture(supabase, {
      societe_id: args.societeId, dossier_id: dossierId, date: args.datePaiement, piece,
      compte: COMPTE_BANQUE, nom_compte: COMPTE_BANQUE_LIB,
      libelle: `Paiement Training + PRGF MRA — ${periodeLib} (ref ${args.referenceBancaire})`,
      debit: 0, credit: totalTrainPrgf, exercice,
    })
    if (debitId) ecritures.push(debitId)
    if (creditId) ecritures.push(creditId)
  }

  // Mise à jour des 2 déclarations
  await supabase.from('declarations_paye_mensuelle').update({
    statut: 'paye',
    date_paiement: args.datePaiement,
    date_declaration: args.datePaiement,
    reference_mra: args.referenceBancaire,
  }).eq('id', args.declarationPayeId)

  await supabase.from('declarations_csg_mensuelle').update({
    statut: 'paye',
    date_paiement: args.datePaiement,
    date_declaration: args.datePaiement,
    reference_mra: args.referenceBancaire,
    ecriture_paiement_id: ecritures[0] || null,
  }).eq('id', args.declarationCsgId)

  return {
    ok: true,
    ecritures,
    declaration_paye_id: args.declarationPayeId,
    declaration_csg_id: args.declarationCsgId,
  }
}

// ─── 5. Lectures ────────────────────────────────────────────────────
export async function getDeclarationsAnnee(
  supabase: SupabaseLike,
  societeId: string,
  annee: number,
): Promise<{ paye: DeclarationPayeRecord[]; csg: DeclarationCsgRecord[] }> {
  const debut = `${annee}-01-01`
  const fin = `${annee}-12-31`
  const [{ data: paye }, { data: csg }] = await Promise.all([
    supabase.from('declarations_paye_mensuelle').select('*')
      .eq('societe_id', societeId).gte('periode', debut).lte('periode', fin)
      .order('periode', { ascending: false }),
    supabase.from('declarations_csg_mensuelle').select('*')
      .eq('societe_id', societeId).gte('periode', debut).lte('periode', fin)
      .order('periode', { ascending: false }),
  ])
  return {
    paye: ((paye || []) as any[]).map(mapPaye),
    csg: ((csg || []) as any[]).map(mapCsg),
  }
}

function mapPaye(r: any): DeclarationPayeRecord {
  return {
    id: String(r.id),
    societe_id: String(r.societe_id),
    periode: String(r.periode).slice(0, 10),
    total_salaires_bruts: Number(r.total_salaires_bruts) || 0,
    total_paye_retenu: Number(r.total_paye_retenu) || 0,
    nb_employes: Number(r.nb_employes) || 0,
    date_limite: r.date_limite || null,
    date_declaration: r.date_declaration || null,
    date_paiement: r.date_paiement || null,
    reference_mra: r.reference_mra || null,
    statut: (r.statut as StatutDeclarationMra) || 'brouillon',
    penalites: Number(r.penalites) || 0,
    ern_employeur: r.ern_employeur || null,
    details_par_employe: Array.isArray(r.details_par_employe) ? r.details_par_employe : [],
    csv_mra_url: r.csv_mra_url || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

function mapCsg(r: any): DeclarationCsgRecord {
  return {
    id: String(r.id),
    societe_id: String(r.societe_id),
    periode: String(r.periode).slice(0, 10),
    ern: r.ern || null,
    nb_employes: Number(r.nb_employes) || 0,
    masse_salariale_brute: Number(r.masse_salariale_brute) || 0,
    total_csg_salarie: Number(r.total_csg_salarie) || 0,
    total_csg_patronal: Number(r.total_csg_patronal) || 0,
    total_nsf_salarie: Number(r.total_nsf_salarie) || 0,
    total_nsf_patronal: Number(r.total_nsf_patronal) || 0,
    total_training_levy: Number(r.total_training_levy) || 0,
    total_prgf: Number(r.total_prgf) || 0,
    total_a_remettre_mra: Number(r.total_a_remettre_mra) || 0,
    date_limite: r.date_limite || null,
    date_declaration: r.date_declaration || null,
    date_paiement: r.date_paiement || null,
    reference_mra: r.reference_mra || null,
    statut: (r.statut as StatutDeclarationMra) || 'brouillon',
    penalites: Number(r.penalites) || 0,
    ern_employeur: r.ern_employeur || null,
    details_par_employe: Array.isArray(r.details_par_employe) ? r.details_par_employe : [],
    csv_mra_url: r.csv_mra_url || null,
    ecriture_paiement_id: r.ecriture_paiement_id || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

// ─── 6. Exit statements PRGF ────────────────────────────────────────
export type MotifExit =
  | 'retraite' | 'deces' | 'demission'
  | 'licenciement_justifie' | 'licenciement_non_justifie'
  | 'fin_cdd' | 'autre'

export type StatutExit = 'brouillon' | 'valide' | 'soumis_mra' | 'annule'

export interface ExitStatementPrgf {
  id: string
  employe_id: string
  societe_id: string
  date_exit: string
  motif_exit: MotifExit
  dernier_mois_remuneration: number
  moyenne_12_mois: number
  final_remuneration: number
  gratuity_paid_mur: number
  gratuity_date_paiement: string | null
  gratuity_return_submitted: boolean
  gratuity_return_date: string | null
  gratuity_return_deadline: string | null
  past_services_due_mur: number
  past_services_settled: boolean
  past_services_date_paiement: string | null
  statut: StatutExit
  notes: string | null
  employe_nom?: string
}

export async function calculerFinalRemuneration(
  supabase: SupabaseLike,
  employeId: string,
  dateExit: string,
): Promise<{ dernier: number; moyenne: number; retenu: number }> {
  // Dernier mois complet = bulletin le plus récent (avant dateExit)
  const { data: last } = await supabase
    .from('bulletins_paie')
    .select('salaire_brut, periode')
    .eq('employe_id', employeId)
    .lte('periode', dateExit)
    .order('periode', { ascending: false })
    .limit(1).maybeSingle()
  const dernier = Number((last as any)?.salaire_brut) || 0

  // Moyenne 12 derniers mois
  const dateDebut = new Date(dateExit + 'T12:00:00')
  dateDebut.setMonth(dateDebut.getMonth() - 12)
  const { data: all } = await supabase
    .from('bulletins_paie')
    .select('salaire_brut')
    .eq('employe_id', employeId)
    .gte('periode', dateDebut.toISOString().slice(0, 10))
    .lte('periode', dateExit)
  const bulletins = (all || []) as any[]
  const sum = bulletins.reduce((a, b) => a + (Number(b.salaire_brut) || 0), 0)
  const moyenne = bulletins.length > 0 ? sum / bulletins.length : 0

  const retenu = Math.max(dernier, moyenne)
  return { dernier, moyenne, retenu }
}

export function computeGratuityDeadline(datePaiementGratuity: string): string {
  const d = new Date(datePaiementGratuity + 'T12:00:00')
  d.setDate(d.getDate() + 15)
  return d.toISOString().slice(0, 10)
}

export async function creerExitStatement(
  supabase: SupabaseLike,
  args: {
    employeId: string; societeId: string; dateExit: string;
    motif: MotifExit; createdBy?: string | null;
  },
): Promise<{ ok: true; id: string } | { ok: false; erreur: string }> {
  const final = await calculerFinalRemuneration(supabase, args.employeId, args.dateExit)
  const { data, error } = await supabase
    .from('prgf_exit_statements')
    .insert({
      employe_id: args.employeId,
      societe_id: args.societeId,
      date_exit: args.dateExit,
      motif_exit: args.motif,
      dernier_mois_remuneration: final.dernier,
      moyenne_12_mois: final.moyenne,
      final_remuneration: final.retenu,
      statut: 'brouillon',
      created_by: args.createdBy ?? null,
    })
    .select('id').single()
  if (error || !data) return { ok: false, erreur: error?.message || 'Insert failed' }
  return { ok: true, id: String(data.id) }
}

export async function getExitStatementsSociete(
  supabase: SupabaseLike,
  societeId: string,
): Promise<ExitStatementPrgf[]> {
  const { data } = await supabase
    .from('prgf_exit_statements')
    .select(`*, employes:employe_id(prenom, nom)`)
    .eq('societe_id', societeId)
    .order('date_exit', { ascending: false })
  return ((data || []) as any[]).map(r => ({
    id: String(r.id),
    employe_id: String(r.employe_id),
    societe_id: String(r.societe_id),
    date_exit: String(r.date_exit).slice(0, 10),
    motif_exit: r.motif_exit as MotifExit,
    dernier_mois_remuneration: Number(r.dernier_mois_remuneration) || 0,
    moyenne_12_mois: Number(r.moyenne_12_mois) || 0,
    final_remuneration: Number(r.final_remuneration) || 0,
    gratuity_paid_mur: Number(r.gratuity_paid_mur) || 0,
    gratuity_date_paiement: r.gratuity_date_paiement || null,
    gratuity_return_submitted: Boolean(r.gratuity_return_submitted),
    gratuity_return_date: r.gratuity_return_date || null,
    gratuity_return_deadline: r.gratuity_return_deadline || null,
    past_services_due_mur: Number(r.past_services_due_mur) || 0,
    past_services_settled: Boolean(r.past_services_settled),
    past_services_date_paiement: r.past_services_date_paiement || null,
    statut: (r.statut as StatutExit) || 'brouillon',
    notes: r.notes || null,
    employe_nom: r.employes ? `${r.employes.prenom || ''} ${r.employes.nom || ''}`.trim() : undefined,
  }))
}

export const STATUT_MRA_LABELS: Record<StatutDeclarationMra, string> = {
  brouillon: 'Brouillon',
  calcule: 'Calculé',
  declare: 'Déclaré',
  paye: 'Payé',
  annule: 'Annulé',
}

export const MOTIF_EXIT_LABELS: Record<MotifExit, string> = {
  retraite: 'Retraite',
  deces: 'Décès',
  demission: 'Démission',
  licenciement_justifie: 'Licenciement justifié',
  licenciement_non_justifie: 'Licenciement non justifié',
  fin_cdd: 'Fin CDD',
  autre: 'Autre',
}

export const PRGF_EXEMPTION_LABELS: Record<string, string> = {
  salaire_au_dessus_200k: 'Salaire > 200 000 MUR',
  migrant_non_citoyen: 'Migrant / non-citoyen',
  sbpf: 'SBPF',
  sipf: 'SIPF',
  private_pension_fsc: 'Private Pension Scheme FSC',
  job_contractor: 'Job Contractor',
  apprenti: 'Apprenti',
}
