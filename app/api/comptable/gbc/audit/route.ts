/**
 * GET /api/comptable/gbc/audit?societe_id=…&exercice=2025-2026
 *
 * Génère le dossier d'audit-readiness (pré-audit) : feuilles maîtresses,
 * tests de cohérence et PBC list, à partir des écritures déjà saisies.
 *
 * ⚠️ Pré-audit uniquement — aucune opinion d'audit (cf. DISCLAIMER). L'audit
 * statutaire GBC reste signé par un auditeur agréé MIPA indépendant.
 */
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { getActiveModules, type SocieteRegime } from '@/lib/accounting/regime'
import { assembleAuditFile } from '@/lib/accounting/audit'
import type { TrialBalanceLine, EcritureStats } from '@/lib/accounting/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

type PcmRow = { compte: string; libelle: string; classe: number; type_compte: string; sens_normal: string }
type EcritureRow = {
  numero_compte: string; debit_mur: number | null; credit_mur: number | null
  date_ecriture: string; description: string | null; journal: string | null; lettre: string | null
}

/** Décale un exercice 'YYYY-YYYY' d'un an en arrière. */
function previousExercice(exercice: string): string | null {
  const m = /^(\d{4})-(\d{4})$/.exec(exercice.trim())
  if (!m) return null
  return `${Number(m[1]) - 1}-${Number(m[2]) - 1}`
}

/** Récupère TOUTES les écritures d'un exercice (pagination par lots de 1000). */
async function fetchEcritures(
  admin: ReturnType<typeof getAdminClient>,
  dossierId: string,
  exercice: string,
): Promise<EcritureRow[]> {
  const rows: EcritureRow[] = []
  const PAGE = 1000
  for (let offset = 0; offset < 50_000; offset += PAGE) {
    const { data, error } = await admin
      .from('ecritures_comptables_v2')
      .select('numero_compte, debit_mur, credit_mur, date_ecriture, description, journal, lettre')
      .eq('dossier_id', dossierId)
      .eq('exercice', exercice)
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...(data as EcritureRow[]))
    if (data.length < PAGE) break
  }
  return rows
}

const num = (v: number | null | undefined) => (typeof v === 'number' && isFinite(v) ? v : 0)
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Construit la balance générale (trial balance) à partir des écritures + PCM. */
function buildTrialBalance(ecritures: EcritureRow[], pcm: Map<string, PcmRow>): TrialBalanceLine[] {
  const agg = new Map<string, { d: number; c: number }>()
  for (const e of ecritures) {
    const key = e.numero_compte
    if (!agg.has(key)) agg.set(key, { d: 0, c: 0 })
    const a = agg.get(key)!
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
      sens_normal: (p?.sens_normal === 'C' ? 'C' : 'D'),
      total_debit: round2(a.d),
      total_credit: round2(a.c),
      solde: round2(a.d - a.c),
    })
  }
  return lines
}

export async function GET(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id')
  const exercice = searchParams.get('exercice')
  if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
  if (!exercice) return NextResponse.json({ error: 'exercice requis' }, { status: 400 })

  const admin = getAdminClient()
  try {
    await assertSocieteAccess(admin, user.id, societe_id)
  } catch (err) {
    if (err instanceof SocieteAccessError) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    throw err
  }

  // Société + régime (le module audit-readiness vise les GBC).
  const { data: societe } = await admin
    .from('societes').select('id, nom, regime, devise_fonctionnelle').eq('id', societe_id).maybeSingle()
  if (!societe) return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })

  const regime = (societe.regime || 'domestic') as SocieteRegime
  const devise = societe.devise_fonctionnelle || 'MUR'
  const modules = getActiveModules({ regime, devise_fonctionnelle: devise })

  const { data: dossier } = await admin
    .from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Aucun dossier comptable pour cette société' }, { status: 404 })

  // Fenêtre de l'exercice (pour le test de cut-off).
  const { data: exo } = await admin
    .from('exercices_fiscaux').select('date_debut, date_fin')
    .eq('societe_id', societe_id).eq('annee', exercice).maybeSingle()

  // Plan comptable de la société.
  const { data: pcmRows } = await admin
    .from('plan_comptable').select('compte, libelle, classe, type_compte, sens_normal').eq('societe_id', societe_id)
  const pcm = new Map<string, PcmRow>()
  for (const r of (pcmRows || []) as PcmRow[]) pcm.set(r.compte, r)

  // Écritures N et N-1.
  const exercice_n1 = previousExercice(exercice)
  const ecrituresN = await fetchEcritures(admin, dossier.id, exercice)
  const ecrituresN1 = exercice_n1 ? await fetchEcritures(admin, dossier.id, exercice_n1) : []

  const balanceN = buildTrialBalance(ecrituresN, pcm)
  const balanceN1 = buildTrialBalance(ecrituresN1, pcm)

  // Statistiques niveau écriture.
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
    if (!e.numero_compte.startsWith('4')) continue
    if (e.lettre) continue
    const cur = tiersAgg.get(e.numero_compte) || { nb: 0, montant: 0 }
    cur.nb++
    cur.montant += Math.max(num(e.debit_mur), num(e.credit_mur))
    tiersAgg.set(e.numero_compte, cur)
  }
  const tiersNonLettres = [...tiersAgg.entries()].map(([numero_compte, v]) => ({ numero_compte, nb: v.nb, montant: round2(v.montant) }))

  const stats: EcritureStats = { comptesNonMappes, doublons, horsExercice, tiersNonLettres }

  // Pièces déjà détenues (pré-cochage PBC) — déduit des journaux présents.
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
    genere_le: new Date().toISOString(),
    modules, balanceN, balanceN1, stats, evidence,
  })

  return NextResponse.json({ societe: { id: societe.id, nom: societe.nom }, ...file })
}
