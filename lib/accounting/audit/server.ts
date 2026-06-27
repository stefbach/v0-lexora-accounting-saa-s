/**
 * Couche serveur du moteur d'audit-readiness : collecte les données comptables
 * (balance N/N-1, stats écriture) et assemble le dossier. Partagée entre l'API
 * JSON, l'export PDF et le mémo LLM — pas de duplication.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveModules, type SocieteRegime } from '@/lib/accounting/regime'
import { assembleAuditFile } from './index'
import type { TrialBalanceLine, EcritureStats, AuditFile } from './types'

export class AuditDataError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'AuditDataError'
  }
}

type PcmRow = { compte: string; libelle: string; classe: number; type_compte: string; sens_normal: string }
type EcritureRow = {
  numero_compte: string; debit_mur: number | null; credit_mur: number | null
  date_ecriture: string; description: string | null; journal: string | null; lettre: string | null
}

export function previousExercice(exercice: string): string | null {
  const m = /^(\d{4})-(\d{4})$/.exec(exercice.trim())
  if (!m) return null
  return `${Number(m[1]) - 1}-${Number(m[2]) - 1}`
}

const num = (v: number | null | undefined) => (typeof v === 'number' && isFinite(v) ? v : 0)
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

async function fetchEcritures(admin: SupabaseClient, dossierId: string, exercice: string): Promise<EcritureRow[]> {
  const rows: EcritureRow[] = []
  const PAGE = 1000
  for (let offset = 0; offset < 50_000; offset += PAGE) {
    const { data, error } = await admin
      .from('ecritures_comptables_v2')
      .select('numero_compte, debit_mur, credit_mur, date_ecriture, description, journal, lettre')
      .eq('dossier_id', dossierId)
      .eq('exercice', exercice)
      .range(offset, offset + PAGE - 1)
    if (error) throw new AuditDataError(error.message, 500)
    if (!data || data.length === 0) break
    rows.push(...(data as EcritureRow[]))
    if (data.length < PAGE) break
  }
  return rows
}

function buildTrialBalance(ecritures: EcritureRow[], pcm: Map<string, PcmRow>): TrialBalanceLine[] {
  const agg = new Map<string, { d: number; c: number }>()
  for (const e of ecritures) {
    if (!agg.has(e.numero_compte)) agg.set(e.numero_compte, { d: 0, c: 0 })
    const a = agg.get(e.numero_compte)!
    a.d += num(e.debit_mur)
    a.c += num(e.credit_mur)
  }
  const lines: TrialBalanceLine[] = []
  for (const [compte, a] of agg) {
    const p = pcm.get(compte)
    lines.push({
      numero_compte: compte,
      libelle: p?.libelle || '(compte hors plan)',
      classe: p?.classe ?? (Number(compte.slice(0, 1)) || 0),
      type_compte: p?.type_compte || 'inconnu',
      sens_normal: p?.sens_normal === 'C' ? 'C' : 'D',
      total_debit: round2(a.d),
      total_credit: round2(a.c),
      solde: round2(a.d - a.c),
    })
  }
  return lines
}

export type AuditGenerationResult = { societe: { id: string; nom: string }; file: AuditFile }

/** Génère le dossier d'audit complet pour (societe_id, exercice). Lève AuditDataError. */
export async function generateAuditFile(
  admin: SupabaseClient,
  societe_id: string,
  exercice: string,
  nowIso: string,
): Promise<AuditGenerationResult> {
  const { data: societe } = await admin
    .from('societes').select('id, nom, regime, devise_fonctionnelle').eq('id', societe_id).maybeSingle()
  if (!societe) throw new AuditDataError('Société introuvable', 404)

  const regime = (societe.regime || 'domestic') as SocieteRegime
  const devise = societe.devise_fonctionnelle || 'MUR'
  const modules = getActiveModules({ regime, devise_fonctionnelle: devise })

  const { data: dossier } = await admin
    .from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
  if (!dossier) throw new AuditDataError('Aucun dossier comptable pour cette société', 404)

  const { data: exo } = await admin
    .from('exercices_fiscaux').select('date_debut, date_fin')
    .eq('societe_id', societe_id).eq('annee', exercice).maybeSingle()

  const { data: pcmRows } = await admin
    .from('plan_comptable').select('compte, libelle, classe, type_compte, sens_normal').eq('societe_id', societe_id)
  const pcm = new Map<string, PcmRow>()
  for (const r of (pcmRows || []) as PcmRow[]) pcm.set(r.compte, r)

  const exercice_n1 = previousExercice(exercice)
  const ecrituresN = await fetchEcritures(admin, dossier.id, exercice)
  const ecrituresN1 = exercice_n1 ? await fetchEcritures(admin, dossier.id, exercice_n1) : []

  const balanceN = buildTrialBalance(ecrituresN, pcm)
  const balanceN1 = buildTrialBalance(ecrituresN1, pcm)

  const comptesNonMappes = [...new Set(ecrituresN.filter((e) => !pcm.has(e.numero_compte)).map((e) => e.numero_compte))]

  const dupMap = new Map<string, { numero_compte: string; date: string; montant: number; description: string; count: number }>()
  for (const e of ecrituresN) {
    const montant = Math.max(num(e.debit_mur), num(e.credit_mur))
    const k = `${e.numero_compte}|${e.date_ecriture}|${montant}|${e.description || ''}`
    const cur = dupMap.get(k)
    if (cur) cur.count++
    else dupMap.set(k, { numero_compte: e.numero_compte, date: e.date_ecriture, montant, description: e.description || '', count: 1 })
  }
  const doublons = [...dupMap.values()].filter((d) => d.count > 1)

  const horsExercice = (exo?.date_debut && exo?.date_fin)
    ? ecrituresN
        .filter((e) => e.date_ecriture < exo.date_debut || e.date_ecriture > exo.date_fin)
        .map((e) => ({ numero_compte: e.numero_compte, date: e.date_ecriture, montant: Math.max(num(e.debit_mur), num(e.credit_mur)) }))
    : []

  const tiersAgg = new Map<string, { nb: number; montant: number }>()
  for (const e of ecrituresN) {
    if (!e.numero_compte.startsWith('4') || e.lettre) continue
    const cur = tiersAgg.get(e.numero_compte) || { nb: 0, montant: 0 }
    cur.nb++
    cur.montant += Math.max(num(e.debit_mur), num(e.credit_mur))
    tiersAgg.set(e.numero_compte, cur)
  }
  const tiersNonLettres = [...tiersAgg.entries()].map(([numero_compte, v]) => ({ numero_compte, nb: v.nb, montant: round2(v.montant) }))

  const stats: EcritureStats = { comptesNonMappes, doublons, horsExercice, tiersNonLettres }

  const journaux = new Set(ecrituresN.map((e) => (e.journal || '').toUpperCase()))
  const evidence = {
    hasBalance: balanceN.length > 0,
    hasGrandLivre: ecrituresN.length > 0,
    hasReleveBancaire: journaux.has('BQ') || journaux.has('BNQ'),
    hasFactures: journaux.has('ACH') || journaux.has('VTE'),
    hasSubstanceData: false,
    hasUboData: false,
    hasTpData: false,
    hasLeases: false,
    hasConsolidation: false,
  }

  const file = assembleAuditFile({
    societe_id, exercice, exercice_n1, regime, devise,
    genere_le: nowIso,
    modules, balanceN, balanceN1, stats, evidence,
  })

  return { societe: { id: societe.id, nom: societe.nom }, file }
}
