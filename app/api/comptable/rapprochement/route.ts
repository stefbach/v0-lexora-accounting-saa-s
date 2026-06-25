import { NextResponse } from 'next/server'
import { createEcrituresForPayment, createEcrituresForFacture } from '@/lib/accounting/ecritures-factures'
import { safeInsertBnq } from '@/lib/accounting/bnq-dedupe'
import { analyzeAllTransactions, MatchingTransaction, MatchingFacture } from '@/lib/accounting/matching-engine'
import {
  toMURWithRates,
  isSelfMatch,
  dateDiffDays,
  BANK_FEE_PATTERNS,
} from '@/lib/accounting/rapprochement/matching-engine'
import { runIntelligentRapprochement, buildAliasMap } from '@/lib/accounting/intelligent-rapprochement'
import type { SupplierAlias } from '@/lib/accounting/intelligent-rapprochement'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { lastDayOfMonth } from '@/lib/rh/period'
import { getTauxChange } from '@/lib/taux-change'
import { getHistoricalRate, MissingHistoricalRateError } from '@/lib/accounting/historical-rates'
import { accountClass } from '@/lib/accounting/classification-rules'
import { validateLettrageGroup } from '@/lib/accounting/accounting-rules'
import { classifyTransaction, detectDirector, getComplianceSeverity, type ClassificationRule } from '@/lib/accounting/classification-engine'
import { checkPeriodLock } from '@/lib/accounting/period-lock'
import { resolveInterSocieteForTransaction, COMPTE_GROUPE_451 } from '@/lib/comptable/inter-societes'
import { userHasAccessToSociete } from '@/lib/rh/access'
// V3-22 — helpers de lettrage extraits (voir docstring du module).
import {
  CLASSE_COMPTES,
  CLASSIFICATIONS_AVEC_LETTRAGE_CROISE,
  LETTRAGE_CROISE_DATE_WINDOW_DAYS,
  computeEcartCompte,
  ecartRequiresQualification,
  findAchCandidatesForBnq,
  lettrageCroiseTolerance,
  selectClosestByDate,
  type TypeEcart,
} from '@/lib/accounting/rapprochement/lettrage'
// V3-23 batch 3 — handlers post-processing extraits (lettrage manuel,
// CCA, marquer payé, classification manuelle, clôture, NDF, reset).
import {
  handleLettrerEcritures,
  handlePayeParAssocie,
  handleCompensation,
  handlePaiementEmploye,
  handleMarquerPaye,
  handleClasserTransaction,
  handleCloturerMois,
  handleRembourserEmploye,
  handleAnnulerPaiementFactures,
} from '@/lib/accounting/rapprochement/post-processing'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────
// Migration 171/172 — Taux de change HISTORIQUE pour les écritures BNQ.
//
// Règle comptable : une écriture créée AUJOURD'HUI pour une tx du 15/11/2025
// doit utiliser le taux EUR→MUR du 15/11/2025 (pas le taux live). Sans ça,
// le montant MUR dérive de plusieurs % et casse la balance du compte 512.
//
// `resolveHistoricalRateSafe` enveloppe `getHistoricalRate` pour :
//   • retourner 1 quand la devise effective = MUR (no-op)
//   • catcher `MissingHistoricalRateError` et retourner `null` (le caller
//     choisit son fallback selon le contexte : live rate + alerte vs skip)
//   • lever les autres erreurs DB (signal d'intégrité)
//
// Contract de retour :
//   { rate: number, fromHistorical: true  }  → taux historique OK
//   { rate: null,   fromHistorical: false, missing: true } → tuple absent
//   { rate: number, fromHistorical: false, fallback: 'live' } → utilisé live
// ─────────────────────────────────────────────────────────────────────────
type HistoricalRateOutcome = {
  rate: number | null
  fromHistorical: boolean
  missing: boolean
  devise: string
  date: string
}

async function resolveHistoricalRateSafe(
  supabase: any,
  date: string | Date | null | undefined,
  devise: string | null | undefined,
  liveRates?: Record<string, number>,
): Promise<HistoricalRateOutcome> {
  const devCaps = (devise || 'MUR').toUpperCase()
  const dateStr = typeof date === 'string'
    ? (date.length >= 10 ? date.slice(0, 10) : date)
    : (date instanceof Date ? date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))

  if (devCaps === 'MUR') {
    return { rate: 1, fromHistorical: true, missing: false, devise: devCaps, date: dateStr }
  }
  try {
    const rate = await getHistoricalRate(supabase, dateStr, devCaps)
    return { rate, fromHistorical: true, missing: false, devise: devCaps, date: dateStr }
  } catch (err) {
    if (err instanceof MissingHistoricalRateError) {
      console.warn(
        `[rapprochement] MissingHistoricalRate ${devCaps}@${dateStr} — fallback live=${liveRates?.[devCaps] ?? 'n/a'}`,
      )
      if (liveRates && typeof liveRates[devCaps] === 'number' && liveRates[devCaps]! > 0) {
        return {
          rate: liveRates[devCaps]!,
          fromHistorical: false,
          missing: true,
          devise: devCaps,
          date: dateStr,
        }
      }
      return { rate: null, fromHistorical: false, missing: true, devise: devCaps, date: dateStr }
    }
    // Non-missing errors (DB down, RLS, …) → propage vers le caller.
    throw err
  }
}

/**
 * Helper pour enrichir une paire (ou N-uplet) d'écritures BNQ avec les
 * 3 colonnes de la migration 172. Si `devise === 'MUR'`, on pose les champs
 * à null (NOT MUR-sentinel) côté `devise_origine`, et on normalise les
 * 3 colonnes sur TOUTES les lignes passées.
 */
function bnqFreezeColumns(
  devise: string | null | undefined,
  montantOrigine: number | null | undefined,
  tauxChange: number | null | undefined,
): { devise_origine: string | null; montant_origine: number | null; taux_change_applique: number | null } {
  const devCaps = (devise || 'MUR').toUpperCase()
  if (devCaps === 'MUR') {
    return { devise_origine: 'MUR', montant_origine: null, taux_change_applique: 1 }
  }
  const mt = Number(montantOrigine)
  const tx = Number(tauxChange)
  return {
    devise_origine: devCaps,
    montant_origine: Number.isFinite(mt) && mt > 0 ? mt : null,
    taux_change_applique: Number.isFinite(tx) && tx > 0 ? tx : null,
  }
}

// NOTE — V3-21 (refactor matching engine) :
//   `advancedTiersScoreForRoute`, `normalizeTiers`, `wordOverlap` étaient
//   définies ici sans aucun call-site dans ce fichier. Elles ont été
//   déplacées vers `lib/accounting/rapprochement/matching-engine.ts`
//   (exports `advancedTiersScore`, `normalizeTiers`, `wordOverlap`) où
//   elles peuvent servir aux helpers de lettrage extraits par V3-22.

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function safeQuery(supabase: any, table: string, query: any) {
  try {
    return await query
  } catch {
    return { data: null, error: { message: `Table ${table} not found` } }
  }
}

// FIX 2 & FIX 8 — accountClass / isLettrableAccount sont maintenant dans
// lib/accounting/classification-rules.ts (source unique, partagée avec
// lib/accounting/accounting-rules.ts). Import en tête de fichier.

// GET — Rapprochements + transactions + factures + écritures
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // ── Filtre de période (mois par mois) ──────────────────────────────
    const date_debut = searchParams.get('date_debut') || null  // ex: 2024-07-01
    const date_fin   = searchParams.get('date_fin')   || null  // ex: 2024-07-31

    const supabase = getAdminClient()

    // 1. Rapprochements existants
    const { data: rapprochements } = await supabase
      .from('rapprochements_bancaires').select('*')
      .eq('societe_id', societe_id).order('periode_debut', { ascending: false })

    // 2. Bank transactions from releves — filtrés par période si fournie
    let relevesQuery = supabase
      .from('releves_bancaires')
      .select('id, compte_bancaire_id, periode, date_debut, date_fin, transactions_json, solde_ouverture, solde_cloture')
      .eq('societe_id', societe_id)
      .is('superseded_by_id', null)
      .order('date_fin', { ascending: false })

    // Restreindre les relevés qui chevauchent la période demandée
    if (date_debut) relevesQuery = relevesQuery.gte('date_fin',   date_debut)
    if (date_fin)   relevesQuery = relevesQuery.lte('date_debut', date_fin)

    const { data: releves } = await relevesQuery

    const { data: comptes } = await supabase
      .from('comptes_bancaires').select('id, banque, devise, numero_compte').eq('societe_id', societe_id)
    const compteMap: Record<string, any> = {}
    ;(comptes || []).forEach(c => { compteMap[c.id] = c })

    const bankTransactions: any[] = []
    ;(releves || []).forEach((r: any) => {
      const compte = compteMap[r.compte_bancaire_id] || {}
      ;(r.transactions_json || []).forEach((tx: any, idx: number) => {
        // Filtrer les transactions hors période si dates fournies
        if (date_debut && tx.date && tx.date < date_debut) return
        if (date_fin   && tx.date && tx.date > date_fin)   return
        bankTransactions.push({
          id: `${r.id}-${idx}`, releve_id: r.id,
          transaction_idx: idx,
          date: tx.date || '', libelle: tx.libelle || '',
          debit: Number(tx.debit) || 0, credit: Number(tx.credit) || 0,
          tiers_detecte: tx.tiers_detecte || tx.tiers || null,
          compte_comptable: tx.compte_comptable || null,
          statut: tx.statut || 'non_identifie',
          banque: compte.banque || '—', devise: compte.devise || 'MUR',
          lettre: tx.lettre || null, facture_id: tx.facture_id || null,
          ecriture_id: tx.ecriture_id || null,
          // Champs cles pour le filtrage UI (onglets 'A verifier' / 'Classees')
          matched_type: tx.matched_type || null,
          note: tx.note || null,
          classification_rule: tx.classification_rule || null,
          classification_compte: tx.classification_compte || null,
          director_id: tx.director_id || null,
          director_name: tx.director_name || null,
          qualification_status: tx.qualification_status || null,
          // Champs agent IA (Lex Banque) — exposés au front pour les onglets
          // "À valider" / suggestions, badges confiance/source/stratégie.
          facture_ids: Array.isArray(tx.facture_ids) ? tx.facture_ids : (tx.facture_id ? [tx.facture_id] : []),
          matched_strategy: tx.matched_strategy || null,
          matched_confidence: typeof tx.matched_confidence === 'number' ? tx.matched_confidence : null,
          match_confidence: tx.match_confidence || null,
          classification: tx.classification || null,
          classification_suggestion: tx.classification_suggestion || null,
          suggestion_source: tx.suggestion_source || null,
          rapprochement_multi: !!tx.rapprochement_multi,
          nb_factures: typeof tx.nb_factures === 'number' ? tx.nb_factures : (Array.isArray(tx.facture_ids) ? tx.facture_ids.length : 0),
          rapproche_at: tx.rapproche_at || null,
        })
      })
    })

    // 3. Factures — FIX 6 : on inclut aussi 'paye' pour que la colonne
    //    « Paiement » de l'UI puisse afficher les factures déjà
    //    rapprochées (le filtre précédent sur ['en_attente','retard',
    //    'partiel'] forçait un compte de « 0 payées » alors que la DB en
    //    contient 60+). Les factures 'annule' restent exclues.
    let factures: any[] = []
    const { data: facturesData, error: facturesErr } = await supabase
      .from('factures').select('*')
      .eq('societe_id', societe_id)
      .in('statut', ['en_attente', 'retard', 'partiel', 'paye'])
      .order('date_facture', { ascending: false })
    if (!facturesErr) factures = facturesData || []

    // FIX 5 — Enrichir chaque facture payée avec le libellé de la
    // transaction bancaire qui l'a soldée (si rapproche_releve_id +
    // rapproche_transaction_idx sont renseignés). Permet à la colonne
    // « Paiement » d'afficher « Virement du DD/MM/YYYY — FT-2026… »
    // sans requête client supplémentaire.
    try {
      const releveIds = new Set<string>()
      for (const f of factures) {
        if (f.statut === 'paye' && f.rapproche_releve_id) releveIds.add(f.rapproche_releve_id)
      }
      if (releveIds.size > 0) {
        const { data: relevesForTx } = await supabase
          .from('releves_bancaires')
          .select('id, transactions_json')
          .in('id', [...releveIds])
        const txByReleve = new Map<string, any[]>()
        for (const r of relevesForTx || []) {
          txByReleve.set((r as any).id, (r as any).transactions_json || [])
        }
        for (const f of factures) {
          if (f.statut !== 'paye' || !f.rapproche_releve_id) continue
          const txs = txByReleve.get(f.rapproche_releve_id) || []
          const idx = Number(f.rapproche_transaction_idx)
          if (Number.isFinite(idx) && idx >= 0 && idx < txs.length) {
            const tx = txs[idx] || {}
            f.rapproche_tx_libelle = String(tx.libelle || '')
            f.rapproche_tx_date = tx.date || null
          }
        }
      }
    } catch (txEnrichErr) {
      console.warn('[rapprochement GET] tx libelle enrichment failed:', txEnrichErr)
    }

    // 4. Écritures comptables v1 (pour lettrage)
    const { data: dossiers } = await supabase
      .from('dossiers').select('id').eq('societe_id', societe_id)
    const dossierIds = (dossiers || []).map(d => d.id)

    let ecritures: any[] = []
    if (dossierIds.length > 0) {
      const { data } = await supabase
        .from('ecritures_comptables_v2')
        .select('id, compte:numero_compte, libelle, debit:debit_mur, credit:credit_mur, date_ecriture, journal, lettre, piece_justificative:ref_folio')
        .in('dossier_id', dossierIds)
        .order('date_ecriture', { ascending: false })
      ecritures = data || []
    }

    // FIX 3 + 5 — Comptes PCG à surveiller :
    //   • 467 Virements inter-sociétés (scénario S7 DDS↔OCC) → doit se
    //     solder rapidement après le mouvement miroir chez la sœur.
    //   • 580 Virements internes en transit (règle R3) → doit TOUJOURS
    //     être soldé en fin de mois. Alerte si écritures > 30 jours non
    //     lettrées.
    //
    // On calcule les soldes en scannant les écritures déjà chargées puis
    // on construit une liste d'alertes que le client affichera en bandeau.
    const TRENTE_JOURS_MS = 30 * 24 * 60 * 60 * 1000
    const nowTs = Date.now()
    const solde467 = ecritures
      .filter(e => String(e.compte || '').startsWith('467'))
      .reduce((s, e) => s + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)
    const solde580 = ecritures
      .filter(e => String(e.compte || '').startsWith('580'))
      .reduce((s, e) => s + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)
    const ecritures580OldUnlettered = ecritures.filter(e => {
      if (!String(e.compte || '').startsWith('580')) return false
      if (e.lettre) return false // déjà lettrée
      const dt = e.date_ecriture ? new Date(e.date_ecriture).getTime() : 0
      return dt > 0 && (nowTs - dt) > TRENTE_JOURS_MS
    })
    const transit_alerts: Array<{ compte: string; type: string; solde?: number; count?: number; message: string }> = []
    if (Math.abs(solde467) > 0.01) {
      transit_alerts.push({
        compte: '467',
        type: 'inter_societes_non_solde',
        solde: Math.round(solde467 * 100) / 100,
        message: `Compte 467 (virements inter-sociétés) non soldé : ${solde467.toFixed(2)} MUR. Vérifier le mouvement miroir chez la société sœur (scénario S7).`,
      })
    }
    if (Math.abs(solde580) > 0.01) {
      transit_alerts.push({
        compte: '580',
        type: 'transit_non_solde',
        solde: Math.round(solde580 * 100) / 100,
        message: `Compte 580 (virements en transit) non soldé : ${solde580.toFixed(2)} MUR. Règle R3 — le 580 doit toujours être soldé à la clôture du mois.`,
      })
    }
    if (ecritures580OldUnlettered.length > 0) {
      transit_alerts.push({
        compte: '580',
        type: 'transit_ancien_non_lettre',
        count: ecritures580OldUnlettered.length,
        message: `${ecritures580OldUnlettered.length} écriture(s) 580 non lettrée(s) depuis plus de 30 jours — lettrage urgent requis (règle R3).`,
      })
    }

    return NextResponse.json({
      rapprochements: rapprochements || [],
      bankTransactions, factures, ecritures,
      releves: releves || [],
      comptesBancaires: comptes || [],
      transit_alerts,
    })
  } catch (e: any) {
    console.error('[rapprochement GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helper inter-sociétés — création du miroir comptable dans la société dest.
//
// Quand une tx bancaire est détectée comme virement vers une autre société
// du même groupe, on crée :
//   • Société SOURCE  (déjà géré par le caller) : DR 451 / CR 512_source
//   • Société DEST    (ce helper)                : DR 512_dest / CR 451
//
// Le miroir n'est créé QUE si :
//   1. L'utilisateur a accès à la société dest (userHasAccessToSociete)
//   2. Il existe un dossier comptable pour la société dest
//   3. Aucune écriture miroir n'existe déjà pour ce ref_folio (idempotence)
//
// Retourne { created: boolean, reason?: string }.
// ─────────────────────────────────────────────────────────────────────────
async function creerMiroirInterSociete(
  supabase: any,
  params: {
    user_id: string
    societe_source_id: string
    societe_dest_id: string
    date_ecriture: string
    montant_mur: number
    libelle_source: string
    isOut: boolean
    ref_folio_source: string
    devise_origine: string | null
    montant_origine: number | null
    taux_change_applique: number | null
    lettre_code: string | null
  },
): Promise<{ created: boolean; reason?: string; mirror_ref_folio?: string }> {
  const {
    user_id,
    societe_source_id,
    societe_dest_id,
    date_ecriture,
    montant_mur,
    libelle_source,
    isOut,
    ref_folio_source,
    devise_origine,
    montant_origine,
    taux_change_applique,
    lettre_code,
  } = params

  if (!societe_dest_id || societe_dest_id === societe_source_id) {
    return { created: false, reason: 'societe_dest invalide' }
  }

  // Sécurité : vérifier l'accès utilisateur
  const hasAccess = await userHasAccessToSociete(user_id, societe_dest_id)
  if (!hasAccess) {
    console.warn(
      `[inter-societes] miroir SKIP — user=${user_id} pas d'accès à societe_dest=${societe_dest_id}`,
    )
    return { created: false, reason: 'forbidden_dest_societe' }
  }

  // Récupérer le dossier de la société destinataire
  const { data: dossierDest } = await supabase
    .from('dossiers')
    .select('id')
    .eq('societe_id', societe_dest_id)
    .limit(1)
    .maybeSingle()
  if (!dossierDest) {
    return { created: false, reason: 'dossier_dest_introuvable' }
  }

  // ref_folio dédié pour le miroir (préfixe MIR-) → idempotent
  const mirrorRefFolio = `MIR-${ref_folio_source}`

  // Idempotence : si une écriture miroir existe déjà, on ne re-crée pas
  const { data: existing } = await supabase
    .from('ecritures_comptables_v2')
    .select('id')
    .eq('societe_id', societe_dest_id)
    .eq('ref_folio', mirrorRefFolio)
    .limit(1)
  if (existing && existing.length > 0) {
    return { created: false, reason: 'mirror_deja_existant', mirror_ref_folio: mirrorRefFolio }
  }

  // Récupérer le compte bancaire 512 de la société destinataire (si défini, sinon '512' générique)
  let compteBanqueDest = '512'
  const { data: cbDest } = await supabase
    .from('comptes_bancaires')
    .select('compte_comptable')
    .eq('societe_id', societe_dest_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (cbDest?.compte_comptable) compteBanqueDest = String(cbDest.compte_comptable)

  // Côté société SOURCE  : la société source PAYE  (isOut=true)  → DR 451 / CR 512_source
  //   → côté DEST, elle REÇOIT                                   → DR 512_dest / CR 451
  // Côté société SOURCE  : la société source REÇOIT (isOut=false) → DR 512_source / CR 451
  //   → côté DEST, elle PAYE                                     → DR 451 / CR 512_dest
  const destIsIn = isOut  // si source paye, dest reçoit

  const freezeMirror = {
    devise_origine: devise_origine,
    montant_origine: montant_origine,
    taux_change_applique: taux_change_applique,
  }

  const libelleMirror = `Inter-sociétés (miroir auto) — ${libelle_source}`.substring(0, 200)

  const ecritures = [
    {
      dossier_id: dossierDest.id,
      societe_id: societe_dest_id,
      date_ecriture,
      journal: 'BNQ',
      numero_compte: destIsIn ? compteBanqueDest : COMPTE_GROUPE_451,
      libelle: libelleMirror,
      debit_mur: destIsIn ? montant_mur : 0,
      credit_mur: destIsIn ? 0 : montant_mur,
      lettre: lettre_code,
      ref_folio: mirrorRefFolio,
      statut: 'auto_genere_inter_societe',
      ...freezeMirror,
    },
    {
      dossier_id: dossierDest.id,
      societe_id: societe_dest_id,
      date_ecriture,
      journal: 'BNQ',
      numero_compte: destIsIn ? COMPTE_GROUPE_451 : compteBanqueDest,
      libelle: libelleMirror,
      debit_mur: destIsIn ? 0 : montant_mur,
      credit_mur: destIsIn ? montant_mur : 0,
      lettre: lettre_code,
      ref_folio: mirrorRefFolio,
      statut: 'auto_genere_inter_societe',
      ...freezeMirror,
    },
  ]

  // Tenter l'insertion avec `statut` ; en cas d'erreur de schéma (colonne
  // absente), retry sans `statut` pour rester compatible avec les bases
  // qui n'ont pas encore appliqué la migration ajoutant la colonne.
  let { error: insErr } = await supabase
    .from('ecritures_comptables_v2')
    .insert(ecritures)
  if (insErr && /column .* statut|statut.*does not exist/i.test(String(insErr.message || ''))) {
    const fallback = ecritures.map(({ statut, ...rest }) => rest)
    const retry = await supabase.from('ecritures_comptables_v2').insert(fallback)
    insErr = retry.error
  }
  if (insErr) {
    console.warn(`[inter-societes] miroir insert FAILED:`, insErr.message)
    return { created: false, reason: `insert_failed: ${insErr.message}` }
  }

  console.warn(
    `[inter-societes] miroir OK — source=${societe_source_id} dest=${societe_dest_id} ` +
    `montant=${montant_mur} MUR ref=${mirrorRefFolio} (destIsIn=${destIsIn})`,
  )
  return { created: true, mirror_ref_folio: mirrorRefFolio }
}

// POST — Actions
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // Tenant isolation — verify user has access to the requested societe_id
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const { data: userSocietes } = await supabase.from('user_societes').select('societe_id').eq('user_id', user.id)
    const allowedIds = userSocietes?.map(s => s.societe_id) || []
    const requestedId = body.societe_id || body.societeId
    if (requestedId && !allowedIds.includes(requestedId) && !['admin', 'super_admin'].includes(profile?.role || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // === AUTO-RAPPROCHEMENT INTELLIGENT (4 phases) ===
    if (action === 'auto_rapprocher') {
      const { societe_id, date_debut, date_fin } = body
      if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

      // ── Load ALL data in parallel (critical for Vercel timeout) ──
      const t0 = Date.now()

      let releves: any[] = []
      let socData: any[] = []
      let dossiers: any[] = []
      let facturesData: any[] | null = null
      let factErr: any = null
      let rates: Record<string, number> = { MUR: 1, EUR: 46.50, USD: 44.80, GBP: 54.20 }
      let comptesBancaires: any[] = []
      let allBulletins: any[] = []

      try {
        const results = await Promise.all([
          supabase.from('releves_bancaires').select('id, compte_bancaire_id, transactions_json').eq('societe_id', societe_id).is('superseded_by_id', null),
          supabase.from('societes').select('nom, aliases').eq('id', societe_id),
          supabase.from('dossiers').select('id, client_id').eq('societe_id', societe_id),
          supabase.from('factures').select('id, numero_facture, tiers, montant_ttc, montant_mur, type_facture, devise, date_facture, date_echeance, conditions_paiement, statut').eq('societe_id', societe_id).in('statut', ['en_attente', 'retard', 'partiel']),
          getTauxChange().catch(() => ({ MUR: 1, EUR: 46.50, USD: 44.80, GBP: 54.20 })),
          // FIX 1 — compte_comptable est nécessaire pour router la 2e ligne
          // BNQ sur le bon 512xxx (ex: 512100 DDS MUR, 512200 DDS EUR).
          supabase.from('comptes_bancaires').select('id, devise, compte_comptable, banque, numero_compte').eq('societe_id', societe_id),
          supabase.from('bulletins_paie').select('id, employe_id, salaire_net, periode, statut').eq('societe_id', societe_id).eq('statut', 'valide'),
        ])

        releves = results[0].data || []
        socData = results[1].data || []
        dossiers = results[2].data || []
        facturesData = results[3].data
        factErr = results[3].error
        rates = results[4] as Record<string, number>
        comptesBancaires = results[5].data || []
        allBulletins = results[6].data || []
      } catch (loadErr: any) {
        console.error('[rapprochement] CRITICAL: parallel load failed:', loadErr)
        return NextResponse.json({
          error: `Chargement des données échoué: ${loadErr.message || loadErr}`,
          _phase: 'data_loading',
        }, { status: 500 })
      }

      // ── Charger règles de classification + dirigeants (best-effort) ──
      let classificationRules: ClassificationRule[] = []
      let directors: Array<{ id: string; nom_complet: string; role: string }> = []
      try {
        const [rulesRes, dirRes] = await Promise.all([
          supabase.from('classification_rules').select('*').eq('active', true)
            .or(`societe_id.eq.${societe_id},societe_id.is.null`).order('priority'),
          supabase.from('directors_shareholders').select('id, nom_complet, role')
            .eq('societe_id', societe_id).eq('active', true),
        ])
        classificationRules = (rulesRes.data || []) as ClassificationRule[]
        directors = (dirRes.data || []) as any[]
        console.warn(`[rapprochement] Loaded ${classificationRules.length} rules, ${directors.length} directors`)
      } catch (rulesErr) {
        console.warn('[rapprochement] classification_rules/directors not available (migration 135 not applied?):', rulesErr)
      }

      console.warn(`[rapprochement] Parallel load done in ${Date.now() - t0}ms: ${releves.length} releves, ${(facturesData || []).length} factures`)

      if (!releves || releves.length === 0) {
        return NextResponse.json({ matched: 0, total: 0, message: 'Aucun relevé bancaire' })
      }

      const societeNames = (socData || []).flatMap((s: any) => [s.nom, ...(s.aliases || [])]).map((n: string) => (n || '').toLowerCase()).filter(Boolean)
      const dossierIds = (dossiers || []).map((d: any) => d.id)
      let factures: any[] = factErr ? [] : (facturesData || [])

      // F8/F10 — devise EFFECTIVE = tx.devise (si présent sur la tx) sinon devise du compte.
      // Les anciennes tx (sans tx.devise) passent par le fallback → comportement inchangé.
      // Les nouvelles tx en devise étrangère débitées sur un compte MUR (paiement Forex)
      // utilisent leur propre devise au lieu d'être reconverties ×46.5 à tort.
      // V3-21 : implémentation déplacée dans `lib/accounting/rapprochement/matching-engine.ts`
      // (`toMURWithRates`). On garde un wrapper local qui injecte `rates` du scope.
      const toMUR = (
        amount: number,
        txOrDevise: string | { devise?: string | null } | null | undefined,
        compteDeviseFallback?: string,
      ): number => toMURWithRates(amount, txOrDevise, rates, compteDeviseFallback)

      const compteDeviseMap: Record<string, string> = {}
      // FIX 1 — map compte_bancaire_id → compte_comptable (512xxx) pour
      // que la ligne BNQ crédite la bonne sous-classe 512.
      const cbToCompteComptable: Record<string, string> = {}
      ;(comptesBancaires || []).forEach((c: any) => {
        compteDeviseMap[c.id] = c.devise || 'MUR'
        if (c.compte_comptable) cbToCompteComptable[c.id] = String(c.compte_comptable)
      })

      // Second batch: écritures + other société names
      let ecritures: any[] = []
      try {
        const clientId = dossiers?.[0]?.client_id
        const [ecrituresResult, allUserSocResult] = await Promise.all([
          dossierIds.length > 0
            ? (async () => {
                // Essayer avec facture_id + journal (migration 133 appliquée) → fallback sur select minimal sinon
                const full = await supabase.from('ecritures_comptables_v2').select('id, compte:numero_compte, libelle, debit:debit_mur, credit:credit_mur, date_ecriture, lettre, facture_id, journal').in('dossier_id', dossierIds).is('lettre', null)
                if (!full.error) return full
                return supabase.from('ecritures_comptables_v2').select('id, compte:numero_compte, libelle, debit:debit_mur, credit:credit_mur, date_ecriture, lettre').in('dossier_id', dossierIds).is('lettre', null)
              })()
            : Promise.resolve({ data: [] as any[] }),
          clientId
            ? supabase.from('dossiers').select('societe_id').eq('client_id', clientId)
            : Promise.resolve({ data: [] as any[] }),
        ])

        ecritures = (ecrituresResult as any).data || []

        const allSocIds = [...new Set([societe_id, ...((allUserSocResult as any).data || []).map((d: any) => d.societe_id)])].filter(Boolean)
        if (allSocIds.length > 1) {
          const { data: otherSocs } = await supabase.from('societes').select('nom, aliases').in('id', allSocIds)
          const otherNames = (otherSocs || []).flatMap((s: any) => [s.nom, ...(s.aliases || [])]).map((n: string) => (n || '').toLowerCase()).filter(Boolean)
          societeNames.push(...otherNames.filter((n: string) => !societeNames.includes(n)))
        }
      } catch (batchErr: any) {
        console.warn('[rapprochement] Second batch partially failed:', batchErr.message)
      }

      // Pre-classification patterns — V3-21 : extrait vers
      // `lib/accounting/rapprochement/matching-engine.ts` (`BANK_FEE_PATTERNS`).

      let counts = { matched: 0, interne: 0, frais_bancaires: 0, salaire_bulk: 0, mra: 0, salaire_individuel: 0, propose: 0, not_matched: 0, total: 0 }
      const matchesList: any[] = []

      console.warn(`[rapprochement] Starting: ${releves.length} releves, ${ecritures.length} ecritures, ${factures.length} factures, loaded in ${Date.now() - t0}ms`)

      // Collect all unclassified transactions across ALL relevés for the intelligent engine
      const globalUnclassified: Array<{ releveId: string; txIdx: number; tx: MatchingTransaction }> = []
      // Map releve_id → { txs, updatedTxs, changed } for applying results
      const releveMap = new Map<string, { txs: any[]; updatedTxs: any[]; changed: boolean; releveDevise: string }>()

      for (const releve of releves) {
        const txs: any[] = releve.transactions_json || []
        const releveDevise = compteDeviseMap[releve.compte_bancaire_id] || 'MUR'
        const updatedTxs = [...txs]
        let changed = false
        let skippedCount = 0

        // Charger les associés/actionnaires pour détecter les CCA
        const { data: associesData } = await supabase
          .from('comptes_courants_associes')
          .select('nom, type')
          .eq('societe_id', societe_id)
        const { data: directorsData } = await supabase
          .from('directors_shareholders')
          .select('nom_complet, role')
          .eq('societe_id', societe_id)
          .eq('active', true)
        const associeNames = [
          ...(associesData || []).map((a: any) => (a.nom || '').toLowerCase()),
          ...(directorsData || []).map((d: any) => (d.nom_complet || '').toLowerCase()),
        ].filter(n => n.length > 2)

        // Collect indices of unclassified transactions for batch engine matching
        const unclassifiedTxIndices: number[] = []

        for (let i = 0; i < updatedTxs.length; i++) {
          const tx = updatedTxs[i]
          // Skip only FULLY reconciled or internal transactions
          // DO NOT skip 'propose' or 'a_verifier' — they need reprocessing
          if (tx.statut === 'rapproche' || tx.statut === 'interne') { skippedCount++; continue }

          // Period filter
          if (date_debut && tx.date && tx.date < date_debut) continue
          if (date_fin && tx.date && tx.date > date_fin) continue

          const txDebit = Number(tx.debit) || 0
          const txCredit = Number(tx.credit) || 0
          const txAmount = txCredit > 0 ? txCredit : txDebit
          if (txAmount === 0) continue
          counts.total++

          const txLib = (tx.libelle || '').toLowerCase()
          const txTiers = (tx.tiers_detecte || tx.tiers || '').toLowerCase()
          let classified = false

          // RULE A — Internal transfers (ULTRA-STRICT)
          // Un virement interne = UNIQUEMENT "Own Account Transfer" vers la société elle-même
          // Le NOM de la société courante doit apparaître dans le TIERS (pas les sociétés liées)
          // Noms de la société courante (normalisés sans Ltd/SARL/SA)
          const selfNamesNorm = (socData || []).flatMap((s: any) => [s.nom, ...(s.aliases || [])]).map((n: string) => (n || '').toLowerCase().replace(/\b(ltd|limited|sarl|sa|co)\b\.?/gi, '').replace(/\s+/g, ' ').trim()).filter((n: string) => n.length > 3)
          const txTiersNorm = txTiers.replace(/\b(ltd|limited|sarl|sa|co)\b\.?/gi, '').replace(/\s+/g, ' ').trim()

          // Match intelligent: le tiers est SOI-MÊME si:
          // - Les mots du nom de la société sont TOUS dans le tiers
          // - ET le tiers n'a pas plus de 1 mot supplémentaire (tolère "SOL" pour "SOLUTIONS")
          // Exemples pour société "Digital Data Solutions":
          //   "digital data sol" → mots société [digital,data,solutions] vs tiers [digital,data,sol]
          //   → "digital" ✓, "data" ✓, "solutions" → tiers has "sol" which starts solutions ✓ → MATCH
          //   "digital data solutions malta" → 1 mot extra "malta" → NO MATCH
          //   "obesity care clinic" → 0 mots en commun → NO MATCH
          // V3-21 : `isSelfMatch` extrait vers
          // `lib/accounting/rapprochement/matching-engine.ts` (logique inchangée).
          const isTiersSelf = selfNamesNorm.some(n => isSelfMatch(n, txTiersNorm))
          // Un virement interne = "Own Account Transfer" vers soi-même UNIQUEMENT
          const isOwnAccountTransfer = txLib.includes('own account transfer') && isTiersSelf
          const isExplicitInterne = txLib.includes('virement interne') || txLib.includes('internal transfer')
          // "Salary Proceeds" = retour de bulk payment → interne
          const isSalaryProceeds = txLib.includes('salary proceeds')

          if ((isOwnAccountTransfer || isExplicitInterne || isSalaryProceeds) && !txLib.includes('standard payment')) {
            updatedTxs[i] = { ...tx, statut: 'interne', matched_type: 'transfert_interne', note: 'Virement interne' }
            counts.interne++; changed = true; classified = true
          }

          // RULE B — Bank fees
          if (!classified && BANK_FEE_PATTERNS.some(p => txLib.includes(p))) {
            const feeEcriture = ecritures.find(e => e.compte?.startsWith('627') && Math.abs((Number(e.debit) || 0) - txDebit) / Math.max(txDebit, 1) < 0.15)
            updatedTxs[i] = { ...tx, statut: 'rapproche', matched_type: 'frais_bancaires', note: 'Frais bancaires', ecriture_id: feeEcriture?.id || null }
            if (feeEcriture) { ecritures = ecritures.filter(e => e.id !== feeEcriture.id); await supabase.from('ecritures_comptables_v2').update({ lettre: `FEE${i}`, date_lettrage: new Date().toISOString().split('T')[0] }).eq('id', feeEcriture.id) }
            counts.frais_bancaires++; counts.matched++; changed = true; classified = true
          }

          // RULE B2 — Compte courant associé (CCA)
          // Si le tiers est un associé/actionnaire connu → CCA (455), PAS salaire
          if (!classified && associeNames.length > 0) {
            const txFullText = (txTiers + ' ' + txLib).toLowerCase()
            const matchedAssocie = associeNames.find(name => {
              const words = name.split(/\s+/).filter((w: string) => w.length >= 3)
              return words.length > 0 && words.every((w: string) => txFullText.includes(w))
            })
            if (matchedAssocie) {
              updatedTxs[i] = { ...tx, statut: 'rapproche', matched_type: 'compte_courant_associe', note: `CCA — ${matchedAssocie}` }
              counts.matched++; changed = true; classified = true
            }
          }

          // RULE C — Bulk salary
          if (!classified && txLib.includes('bulk payment') && (txLib.includes('salary') || txLib.includes('bonus') || txTiers === 'personnel')) {
            const txMonth = tx.date?.substring(0, 7) || ''
            if (txMonth) {
              const monthBulletins = (allBulletins || []).filter(b => b.periode?.startsWith(txMonth))
              const sumNet = monthBulletins.reduce((s: number, b: any) => s + (Number(b.salaire_net) || 0), 0)
              const isVerified = sumNet > 0 && Math.abs(txDebit - sumNet) / sumNet < 0.05
              updatedTxs[i] = { ...tx, statut: 'rapproche', matched_type: isVerified ? 'salaire_bulk' : 'salaire_bulk_non_verifie', note: isVerified ? `Masse salariale ${txMonth}` : 'Bulk salary — montant non vérifié' }
            } else {
              updatedTxs[i] = { ...tx, statut: 'rapproche', matched_type: 'salaire_bulk_non_verifie', note: 'Bulk salary' }
            }
            counts.salaire_bulk++; counts.matched++; changed = true; classified = true
          }

          // RULE D — MRA payments
          if (!classified && (txTiers.includes('mauritius revenue') || txLib.includes('mauritius revenue'))) {
            const mraEcriture = ecritures.find(e => {
              if (!e.compte?.match(/^(444|431|432|4457)/)) return false
              const eAmt = Number(e.credit) || Number(e.debit) || 0
              return eAmt > 0 && Math.abs(txDebit - eAmt) / eAmt < 0.10
            })
            if (mraEcriture) {
              updatedTxs[i] = { ...tx, statut: 'rapproche', ecriture_id: mraEcriture.id, matched_type: 'paiement_mra', note: `Paiement MRA — ${mraEcriture.compte}` }
              await supabase.from('ecritures_comptables_v2').update({ lettre: `MRA${i}`, date_lettrage: new Date().toISOString().split('T')[0] }).eq('id', mraEcriture.id)
              ecritures = ecritures.filter(e => e.id !== mraEcriture.id)
            } else {
              updatedTxs[i] = { ...tx, statut: 'a_verifier', matched_type: 'paiement_mra_non_verifie', note: 'Paiement MRA — écriture non trouvée' }
            }
            counts.mra++; counts.matched++; changed = true; classified = true
          }

          // RULE E — Salary reversal
          if (!classified && (txLib.includes('bulk payment reversal') || txLib.includes('salary reversal') || txLib.includes('salary proceeds'))) {
            updatedTxs[i] = { ...tx, statut: 'rapproche', matched_type: 'reversal_salaire', note: 'Reversal virement salaire' }
            counts.matched++; changed = true; classified = true
          }

          if (classified) continue

          // Collect for global intelligent matching after all rules
          unclassifiedTxIndices.push(i)
        }

        // Collect all unclassified transactions for this relevé (Phase 2 runs globally below)
        if (unclassifiedTxIndices.length > 0) {
          for (const i of unclassifiedTxIndices) {
            const tx = updatedTxs[i]
            globalUnclassified.push({
              releveId: releve.id, txIdx: i,
              tx: {
                releve_id: releve.id,
                transaction_idx: i,
                date: tx.date || '',
                libelle: tx.libelle || '',
                tiers_detecte: tx.tiers_detecte || tx.tiers || null,
                debit: Number(tx.debit) || 0,
                credit: Number(tx.credit) || 0,
                // F8/F10 — priorité : devise portée par la tx (nouveau pipeline OCR)
                // puis devise du compte bancaire (tx legacy sans tx.devise).
                devise: (tx.devise || releveDevise) as string,
              }
            })
          }
        }

        // Save rule-based classifications from Phase 3 (internal, fees, salary, MRA)
        releveMap.set(releve.id, { txs, updatedTxs, changed, releveDevise })
      }

      // ═══════════════════════════════════════════════════════════════
      // INTERNAL TRANSFER COUNTERPART MATCHING
      // For each 'interne' transaction, find its counterpart on OTHER
      // comptes_bancaires of the same société. If found → share VI code
      // + mark both 'interne'. If not found → mark 'interne_en_attente'.
      // ═══════════════════════════════════════════════════════════════
      {
        // Collect all internal transfer candidates across all relevés
        type VICandidate = { releveId: string; txIdx: number; compteBancaireId: string; amount: number; date: string; isDebit: boolean; tx: any }
        const candidates: VICandidate[] = []
        for (const [releveId, entry] of releveMap) {
          const rel = releves.find((r: any) => r.id === releveId)
          if (!rel) continue
          const compteBancaireId = rel.compte_bancaire_id
          for (let i = 0; i < entry.updatedTxs.length; i++) {
            const tx = entry.updatedTxs[i]
            if (tx.statut === 'interne' && tx.matched_type === 'transfert_interne') {
              const amt = Math.abs(Number(tx.debit) || Number(tx.credit) || 0)
              const dateStr = tx.date || ''
              if (amt > 0 && dateStr) {
                candidates.push({
                  releveId, txIdx: i, compteBancaireId,
                  amount: amt, date: dateStr,
                  isDebit: (Number(tx.debit) || 0) > 0,
                  tx,
                })
              }
            }
          }
        }

        // V3-21 : `dateDiffDays` extrait vers
        // `lib/accounting/rapprochement/matching-engine.ts` (logique inchangée).

        const paired = new Set<string>() // key: releveId:txIdx
        let viCounter = 1
        for (let i = 0; i < candidates.length; i++) {
          const a = candidates[i]
          const keyA = `${a.releveId}:${a.txIdx}`
          if (paired.has(keyA)) continue

          // Find counterpart: different compte_bancaire, same amount ±0.01, date ±2 days, opposite direction
          const match = candidates.find((b, j) =>
            j !== i &&
            !paired.has(`${b.releveId}:${b.txIdx}`) &&
            b.compteBancaireId !== a.compteBancaireId &&
            Math.abs(b.amount - a.amount) < 0.01 &&
            dateDiffDays(a.date, b.date) <= 2 &&
            b.isDebit !== a.isDebit
          )

          if (match) {
            const viCode = `VI${String(viCounter++).padStart(3, '0')}`
            const entryA = releveMap.get(a.releveId)!
            const entryB = releveMap.get(match.releveId)!
            entryA.updatedTxs[a.txIdx] = { ...entryA.updatedTxs[a.txIdx], statut: 'interne', matched_type: 'transfert_interne', vi_pair_code: viCode, vi_pair_releve: match.releveId }
            entryB.updatedTxs[match.txIdx] = { ...entryB.updatedTxs[match.txIdx], statut: 'interne', matched_type: 'transfert_interne', vi_pair_code: viCode, vi_pair_releve: a.releveId }
            entryA.changed = true; entryB.changed = true
            paired.add(keyA); paired.add(`${match.releveId}:${match.txIdx}`)
            console.warn(`[rapprochement] VI pair ${viCode}: ${a.amount} ${a.isDebit ? '→' : '←'} counterpart on ${match.compteBancaireId}`)
          } else {
            // No counterpart found — mark as waiting
            const entry = releveMap.get(a.releveId)!
            entry.updatedTxs[a.txIdx] = { ...entry.updatedTxs[a.txIdx], statut: 'interne_en_attente', note: 'Virement interne — contrepartie introuvable' }
            entry.changed = true
            console.warn(`[rapprochement] VI unpaired: ${a.amount} on ${a.compteBancaireId} ${a.date} — marked interne_en_attente`)
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // INTELLIGENT ENGINE — Phase 2 (supplier-centric matching)
      // Runs GLOBALLY across all relevés, not per-relevé
      // ═══════════════════════════════════════════════════════════════

      if (globalUnclassified.length > 0) {
        const engineFactures: MatchingFacture[] = factures.map((f: any) => ({
          id: f.id,
          numero_facture: f.numero_facture,
          tiers: f.tiers,
          montant_ttc: Number(f.montant_ttc) || 0,
          montant_mur: f.montant_mur != null ? Number(f.montant_mur) : null,
          devise: f.devise,
          date_facture: f.date_facture,
          date_echeance: f.date_echeance,
          conditions_paiement: f.conditions_paiement != null ? Number(f.conditions_paiement) : null,
          type_facture: (f.type_facture === 'fournisseur' ? 'fournisseur' : 'client') as 'client' | 'fournisseur',
          statut: f.statut,
        }))

        const allTxs = globalUnclassified.map(g => g.tx)

        // Load supplier aliases from DB (société-specific + global)
        // selfNames = uniquement la société courante (pas le groupe)
        const selfNamesForEngine = (socData || []).flatMap((s: any) => [s.nom, ...(s.aliases || [])]).map((n: string) => (n || '').toLowerCase()).filter((n: string) => n.length > 3)

        let aliasMap = new Map<string, string>()
        try {
          const { data: aliasRows } = await supabase
            .from('supplier_aliases')
            .select('canonical, alias')
            .or(`societe_id.eq.${societe_id},societe_id.is.null`)
          if (aliasRows && aliasRows.length > 0) {
            aliasMap = buildAliasMap(aliasRows as SupplierAlias[])
            console.warn(`[rapprochement] Loaded ${aliasRows.length} supplier aliases`)
          }
        } catch (aliasErr) {
          console.warn('[rapprochement] supplier_aliases table not found, running without aliases')
        }

        // Auto-register ONLY the current société's own name as __self_ alias
        // NOT the other companies in the group (those are interco, not internal)
        for (const socName of selfNamesForEngine) {
          const norm = socName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
          if (norm.length >= 3) {
            aliasMap.set(norm, `__self_${societe_id}`)
            // Also add abbreviation (first letters of each word)
            const abbr = norm.split(/\s+/).map((w: string) => w[0]).join('')
            if (abbr.length >= 2) aliasMap.set(abbr, `__self_${societe_id}`)
          }
        }

        console.warn(`[rapprochement] Running intelligent engine on ${allTxs.length} unclassified tx, ${engineFactures.length} factures, ${aliasMap.size} aliases`)

        const intelligentResult = runIntelligentRapprochement(allTxs, engineFactures, {
          societeNames,
          selfNames: selfNamesForEngine,
          bulletins: (allBulletins || []).map((b: any) => ({ periode: b.periode, salaire_net: Number(b.salaire_net) || 0 })),
          ecritures: ecritures.map((e: any) => ({ id: e.id, compte: e.compte, debit: Number(e.debit) || 0, credit: Number(e.credit) || 0, libelle: e.libelle || '' })),
          rates,
          aliasMap,
        })

        console.warn(`[rapprochement] Intelligent engine results:`, intelligentResult.stats)

        // Apply supplier matches
        for (const match of intelligentResult.matches) {
          const releveId = match.transaction.releve_id
          const txIdx = match.transaction.transaction_idx
          const entry = releveMap.get(releveId)
          if (!entry) continue

          const conf = match.confidence
          const isGroup = match.factureIds.length > 1
          const reconcileDate = new Date().toISOString()
          // FIX 1 — rapproche_date = date métier de la transaction, fallback aujourd'hui.
          // Never block the update on a missing tx.date.
          const payDate: string =
            (entry.updatedTxs[txIdx]?.date as string | undefined) ||
            (match.transaction as any)?.date ||
            new Date().toISOString().split('T')[0]

          // Seuil d'auto-application :
          // - Match par alias fournisseur (strategy "supplier_*") → confiance ≥ 0.60
          // - Match par montant (strategy "amount_*") → confiance ≥ 0.70
          //   Requiert montant proche + tiers similaire. Sous 0.70 → proposé (jaune).
          // Fallback par montant DÉSACTIVÉ pour auto-apply — sera remplacé par agents IA
          const isFallbackMatch = (match.strategy || '').startsWith('amount_')
          const autoApplyThreshold = isFallbackMatch ? 9.99 : 0.60

          if (conf >= autoApplyThreshold) {
            // High confidence → auto-apply
            const code = `R${String(counts.matched + 1).padStart(3, '0')}`
            entry.updatedTxs[txIdx] = {
              ...entry.updatedTxs[txIdx],
              facture_ids: match.factureIds,
              facture_id: match.factureIds[0],
              lettre: code,
              statut: 'rapproche',
              matched_type: match.strategy,
              match_confidence: `intelligent_${Math.round(conf * 100)}`,
              note: match.reasoning,
              rapproche_at: reconcileDate,
            }
            entry.changed = true

            let facturesUpdated = 0
            // Calculer le montant total des factures pour détecter paiement partiel / TDS
            const totalFactures = match.factures.reduce((s: number, f: any) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
            // match.transaction.devise a déjà été résolu au push (priorité tx.devise > releveDevise)
            const txPayAmtMUR = toMUR(Math.max(Number(match.transaction.debit) || 0, Number(match.transaction.credit) || 0), match.transaction.devise || 'MUR')
            const isPartial = totalFactures > 0 && txPayAmtMUR < totalFactures * 0.90 // < 90% = partiel
            const diffForTds = totalFactures > 0 ? (totalFactures - txPayAmtMUR) / totalFactures : 0
            const isTds = diffForTds >= 0.02 && diffForTds <= 0.06 // 2-6% = TDS

            for (const fId of match.factureIds) {
              const f = match.factures.find((x: any) => x.id === fId)
              const fAmt = Number(f?.montant_mur) || Number(f?.montant_ttc) || 0

              // Part de ce paiement couvrant cette facture (proportionnel)
              const partCouverte = totalFactures > 0 ? (fAmt / totalFactures) * txPayAmtMUR : fAmt
              const soldeRestant = isPartial ? Math.round((fAmt - partCouverte) * 100) / 100 : 0
              const tdsRetenu = isTds ? Math.round((fAmt - partCouverte) * 100) / 100 : 0

              const newStatut = isPartial && soldeRestant > 1 ? 'partiel' : 'paye'
              const { error: updErr } = await supabase.from('factures').update({
                statut: newStatut,
                rapproche_releve_id: releveId,
                rapproche_transaction_idx: txIdx,
                rapproche_date: payDate,
                rapproche_source: 'auto_intelligent',
                solde_non_paye: soldeRestant > 1 ? soldeRestant : 0,
                tds_retenu: tdsRetenu,
              }).eq('id', fId)
              if (updErr) {
                console.error(`[rapprochement] Failed to update facture ${fId}:`, updErr.message)
              } else {
                facturesUpdated++
              }
              factures = factures.filter((ff: any) => ff.id !== fId)
            }
            if (facturesUpdated > 0) {
              console.warn(`[rapprochement] ${facturesUpdated} facture(s) → paye for ${match.supplierName}`)
            }

            // FIX 1 — Generate BNQ journal entries + lettrer ACH/BNQ ensemble.
            // On émet un jeu d'écritures par facture du groupe pour que
            // chacune porte son propre facture_id (le lettrage peut
            // ensuite solder tiers par tiers). Le 2e compte BNQ est
            // routé vers le bon 512xxx via cbToCompteComptable.
            const txRaw = entry.updatedTxs[txIdx]
            const txAmount = Math.max(Number(txRaw.debit) || 0, Number(txRaw.credit) || 0)
            const isOutgoing = (Number(txRaw.debit) || 0) > 0
            const payType: 'supplier' | 'client' = isOutgoing ? 'supplier' : 'client'
            const tiers = (match.supplierName || txRaw.tiers_detecte || '').substring(0, 50)
            // Résoudre le compte bancaire comptable à partir du relevé
            const releveRef = releves.find((r: any) => r.id === releveId)
            const compteBanque = (releveRef && cbToCompteComptable[releveRef.compte_bancaire_id]) || '512'
            const datePayment = txRaw.date || new Date().toISOString().split('T')[0]
            const txLibelle = String(txRaw.libelle || '').substring(0, 100)

            // Migration 171/172 — taux HISTORIQUE figé à la date de la tx.
            // Devise = priorité tx.devise (pipeline Forex), fallback sur la
            // devise du compte bancaire. Si la table est incomplète, on bascule
            // sur le taux live mais on log/alerte (voir resolveHistoricalRateSafe).
            const payDevise = (txRaw.devise || entry.releveDevise || 'MUR').toUpperCase()
            const payRateOutcome = await resolveHistoricalRateSafe(
              supabase, datePayment, payDevise, rates,
            )
            // Si aucun taux (ni historique ni live) et devise ≠ MUR → on skip
            // la création d'écriture pour cette paire : marquer tx "à vérifier".
            if (payRateOutcome.rate == null && payDevise !== 'MUR') {
              console.warn(
                `[rapprochement] skip BNQ creation — no rate ${payDevise}@${datePayment} for tx ${releveId}-${txIdx}`,
              )
              try {
                entry.updatedTxs[txIdx] = {
                  ...entry.updatedTxs[txIdx],
                  statut: 'a_verifier_taux',
                  note: `Taux ${payDevise} absent pour la date ${datePayment} — seeder taux_change_historique`,
                }
                entry.changed = true
              } catch { /* best-effort */ }
              continue
            }
            const historicalRate = payRateOutcome.rate ?? 1
            // Recompute payAmountMUR à partir du taux figé (source de vérité).
            const payAmountMUR = payDevise === 'MUR'
              ? txAmount
              : txAmount * historicalRate

            // Montant par facture : réparti au prorata du montant_ttc,
            // fallback équi-split. Arrondi à 2 décimales, reste sur la
            // dernière facture pour équilibrer centime par centime.
            const totalFacturesTTC = (match.factures || []).reduce(
              (s: number, f: any) => s + (Number(f.montant_ttc) || 0), 0
            )
            const amountMurRounded = Math.round(payAmountMUR * 100) / 100
            const perFactureAmounts: number[] = (match.factures || []).map((f: any, i: number) => {
              const base = match.factures.length === 1
                ? amountMurRounded
                : (totalFacturesTTC > 0
                    ? Math.round((Number(f.montant_ttc) || 0) / totalFacturesTTC * amountMurRounded * 100) / 100
                    : Math.round((amountMurRounded / match.factures.length) * 100) / 100)
              return base
            })
            const summed = perFactureAmounts.reduce((s, n) => s + n, 0)
            const residual = Math.round((amountMurRounded - summed) * 100) / 100
            if (perFactureAmounts.length > 0 && Math.abs(residual) >= 0.01) {
              perFactureAmounts[perFactureAmounts.length - 1] += residual
            }

            for (let i = 0; i < (match.factures || []).length; i++) {
              const fac = match.factures[i]
              const amountPerFacture = perFactureAmounts[i] || 0
              if (amountPerFacture <= 0) continue
              // Migration 172 — par facture : montant_origine au prorata sur le
              // total MUR, inversé via historicalRate pour retrouver la devise.
              const montantOrigineFacture = payDevise === 'MUR'
                ? null
                : Math.round((amountPerFacture / historicalRate) * 100) / 100
              const { error: payErr } = await createEcrituresForPayment(supabase, {
                societe_id,
                date_payment: datePayment,
                amount_mur: amountPerFacture,
                type: payType,
                tiers,
                ref_folio: `BANK-${releveId}-${txIdx}-${fac.id}`,
                description: `Règlement ${fac.numero_facture || ''} — ${tiers}`.trim(),
                compte_banque: compteBanque,
                facture_id: fac.id,
                lettre_code: code,
                numero_piece: txLibelle,
                // Migration 172 — taux figé propagé sur les 2 lignes BNQ
                devise_origine: payDevise,
                montant_origine: montantOrigineFacture,
                taux_change_applique: payDevise === 'MUR' ? 1 : historicalRate,
              })
              if (payErr) {
                console.warn(`[rapprochement] BNQ insert failed for facture ${fac.id}:`, payErr)
              }
            }

            // Si TDS détecté → enregistrer la retenue (D 401 / C 443 - TVA retenue à source)
            if (isTds && diffForTds > 0) {
              const tdsAmount = Math.round((totalFactures - txPayAmtMUR) * 100) / 100
              const tdsRefFolio = `TDS-${releveId}-${txIdx}`
              try {
                const { data: dossierTds } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
                if (dossierTds) {
                  await supabase.from('ecritures_comptables_v2').insert([
                    { dossier_id: dossierTds.id, societe_id, date_ecriture: txRaw.date,
                      journal: 'OD', numero_compte: payType === 'supplier' ? '401' : '411',
                      libelle: `TDS retenue à source — ${tiers} — ${(tdsAmount).toFixed(2)} MUR (${(diffForTds * 100).toFixed(1)}%)`,
                      debit_mur: tdsAmount, credit_mur: 0, lettre: code, ref_folio: tdsRefFolio },
                    { dossier_id: dossierTds.id, societe_id, date_ecriture: txRaw.date,
                      journal: 'OD', numero_compte: '4457',
                      libelle: `TDS — ${tiers}`,
                      debit_mur: 0, credit_mur: tdsAmount, lettre: code, ref_folio: tdsRefFolio },
                  ])
                }
              } catch (tdsErr) { console.warn('[TDS] Failed to create TDS entry:', tdsErr) }
            }

            matchesList.push({
              type: match.strategy,
              transaction: txRaw.libelle,
              facture: isGroup ? `${match.factureIds.length} factures` : match.factures[0]?.numero_facture,
              montant: txAmount,
              strategy: match.strategy,
              confidence: conf,
              supplier: match.supplierName,
            })
            counts.matched++

            // Auto-learn alias: if the bank tiers differs from the facture tiers,
            // save it for future matching (best-effort, non-blocking)
            if (match.factures[0]?.tiers) {
              const bankTiers = match.transaction.tiers_detecte || ''
              const facTiers = match.factures[0].tiers || ''
              if (bankTiers && facTiers && bankTiers.toLowerCase() !== facTiers.toLowerCase()) {
                try {
                  await supabase.from('supplier_aliases').upsert({
                    societe_id,
                    canonical: facTiers.toLowerCase().replace(/[^a-z0-9\s.]/g, '').trim(),
                    alias: bankTiers.toLowerCase().replace(/[^a-z0-9\s.]/g, '').trim(),
                    source: 'auto_learned',
                    confidence: Math.min(0.95, conf),
                    nb_used: 1,
                    created_by: user.id,
                  }, { onConflict: 'societe_id,alias' })
                } catch { /* best effort */ }
              }
            }
          } else if (conf >= 0.40) {
            // Medium confidence → propose
            const code = `P${String(counts.propose + 1).padStart(3, '0')}`
            entry.updatedTxs[txIdx] = {
              ...entry.updatedTxs[txIdx],
              facture_ids: match.factureIds,
              facture_id: match.factureIds[0],
              lettre: code,
              statut: 'propose',
              matched_type: 'propose',
              match_confidence: `intelligent_${Math.round(conf * 100)}`,
              note: match.reasoning,
            }
            entry.changed = true
            counts.propose++
          } else {
            counts.not_matched++
          }
        }

        // Apply auto-classifications from Phase 3 of the intelligent engine
        for (const cls of intelligentResult.classifications) {
          const releveId = cls.transaction.releve_id
          const txIdx = cls.transaction.transaction_idx
          const entry = releveMap.get(releveId)
          if (!entry) continue

          // Skip if already handled by the per-relevé rules above
          const existingTx = entry.updatedTxs[txIdx]
          if (existingTx.statut === 'rapproche' || existingTx.statut === 'interne' || existingTx.matched_type) continue

          const code = `A${String(counts.matched + 1).padStart(3, '0')}`
          entry.updatedTxs[txIdx] = {
            ...existingTx,
            statut: cls.type === 'transfert_interne' ? 'interne' : 'rapproche',
            matched_type: cls.type,
            note: cls.note,
            lettre: cls.type === 'transfert_interne' ? undefined : code,
            ecriture_id: cls.ecritureId || null,
            match_confidence: `intelligent_${Math.round(cls.confidence * 100)}`,
          }
          entry.changed = true

          if (cls.type === 'transfert_interne') counts.interne++
          else if (cls.type === 'frais_bancaires') { counts.frais_bancaires++; counts.matched++ }
          else if (cls.type === 'salaire_bulk' || cls.type === 'salaire_individuel') { counts.salaire_bulk++; counts.matched++ }
          else if (cls.type === 'paiement_mra' || cls.type === 'charges_sociales') { counts.mra++; counts.matched++ }
          else { counts.matched++ }

          // Letter the ecriture if found
          if (cls.ecritureId) {
            await supabase.from('ecritures_comptables_v2').update({
              lettre: code,
              date_lettrage: new Date().toISOString().split('T')[0],
            }).eq('id', cls.ecritureId)
          }
        }

        // Count remaining unmatched
        const matchedKeys = new Set([
          ...intelligentResult.matches.map(m => `${m.transaction.releve_id}:${m.transaction.transaction_idx}`),
          ...intelligentResult.classifications.map(c => `${c.transaction.releve_id}:${c.transaction.transaction_idx}`),
        ])
        for (const g of globalUnclassified) {
          if (!matchedKeys.has(`${g.releveId}:${g.txIdx}`)) counts.not_matched++
        }
      }

      // Save all modified relevés
      for (const [releveId, entry] of releveMap) {
        if (entry.changed) {
          const { error: saveErr } = await supabase.from('releves_bancaires')
            .update({ transactions_json: entry.updatedTxs })
            .eq('id', releveId)
          if (saveErr) console.error(`[rapprochement] Save releve ${releveId} ERROR:`, saveErr.message)
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // POST-RAPPROCHEMENT: Consistency repair
      // Scan all transactions with facture_id/facture_ids and ensure
      // the corresponding factures are marked paye. This catches any
      // factures that were missed during the matching loop.
      // ═══════════════════════════════════════════════════════════════
      let repaired = 0
      try {
        // FIX 1 — track the payment date per facture so auto_repair can set
        // rapproche_date consistently (never leave it NULL).
        const today = new Date().toISOString().split('T')[0]
        const facIdToDate = new Map<string, string>()

        for (const [releveId, entry] of releveMap) {
          for (let i = 0; i < entry.updatedTxs.length; i++) {
            const tx = entry.updatedTxs[i]
            // Upgrade: propose with facture_id → rapproche
            if (tx.statut === 'propose' && tx.facture_id) {
              entry.updatedTxs[i] = { ...tx, statut: 'rapproche', matched_type: tx.matched_type === 'propose' ? 'supplier_upgraded' : tx.matched_type }
              entry.changed = true
              counts.matched++
            }
            if (tx.statut !== 'rapproche') continue
            // Collect all facture IDs from matched transactions + their pay date
            const txPayDate: string = (tx.date as string | undefined) || today
            if (tx.facture_id && !facIdToDate.has(tx.facture_id)) {
              facIdToDate.set(tx.facture_id, txPayDate)
            }
            if (Array.isArray(tx.facture_ids)) {
              for (const fId of tx.facture_ids) {
                if (!facIdToDate.has(fId)) facIdToDate.set(fId, txPayDate)
              }
            }
          }
        }

        if (facIdToDate.size > 0) {
          // Find factures that should be paye but aren't
          const { data: notPayeYet } = await supabase
            .from('factures')
            .select('id')
            .in('id', [...facIdToDate.keys()])
            .neq('statut', 'paye')

          if (notPayeYet && notPayeYet.length > 0) {
            // FIX 1 — per-facture update so rapproche_date carries the actual
            // transaction date when available (group .in() can't pass
            // per-row values).
            let fixedOk = 0
            for (const f of notPayeYet) {
              const fId = (f as any).id as string
              const payDate = facIdToDate.get(fId) || today
              const { error: repairErr } = await supabase
                .from('factures')
                .update({
                  statut: 'paye',
                  rapproche_date: payDate,
                  rapproche_source: 'auto_repair',
                })
                .eq('id', fId)
              if (!repairErr) fixedOk++
              else console.warn(`[rapprochement] auto_repair ${fId}:`, repairErr.message)
            }
            repaired = fixedOk
            if (repaired > 0) {
              console.warn(`[rapprochement] Consistency repair: ${repaired} factures fixed to paye`)
            }
          }
        }
      } catch (repairErr) {
        console.warn('[rapprochement] Consistency repair failed:', repairErr)
      }

      // ═══════════════════════════════════════════════════════════════
      // FIX 4 — facture_id backfill dans transactions_json
      //
      // Problème prod : 21 tx statut='rapproche' sans facture_id dans le
      // JSON. L'absence de ce lien empêche la colonne « Paiement » de la
      // section Factures de retrouver la date/le libellé du virement.
      //
      // Stratégie de récupération (par ordre de fiabilité) :
      //   a) tx.ecriture_id → ecriture.facture_id (lien direct mig. 133)
      //   b) tx.lettre      → recherche d'une ACH/VTE même lettre + facture_id
      //   c) match libellé/montant contre les factures 'paye' de la période
      //
      // Idempotent : n'écrase jamais un facture_id existant.
      // ═══════════════════════════════════════════════════════════════
      let backfilled = 0
      try {
        // Prépare la liste des factures payées pour la stratégie (c).
        const { data: paidForBackfill } = await supabase
          .from('factures')
          .select('id, numero_facture, tiers, montant_ttc, rapproche_releve_id, rapproche_transaction_idx')
          .eq('societe_id', societe_id)
          .eq('statut', 'paye')
        const paidList = paidForBackfill || []

        for (const [releveId, entry] of releveMap) {
          let entryChanged = false
          for (let i = 0; i < entry.updatedTxs.length; i++) {
            const tx = entry.updatedTxs[i]
            if (tx.statut !== 'rapproche') continue
            if (tx.facture_id || (Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0)) continue

            let foundFactureId: string | null = null

            // (a) via ecriture_id
            if (tx.ecriture_id) {
              try {
                const { data: ecr } = await supabase
                  .from('ecritures_comptables_v2')
                  .select('facture_id')
                  .eq('id', tx.ecriture_id)
                  .maybeSingle()
                if (ecr && (ecr as any).facture_id) foundFactureId = String((ecr as any).facture_id)
              } catch { /* best-effort */ }
            }

            // (b) via tx.lettre
            if (!foundFactureId && tx.lettre) {
              try {
                const { data: lettred } = await supabase
                  .from('ecritures_comptables_v2')
                  .select('facture_id')
                  .eq('lettre', tx.lettre)
                  .not('facture_id', 'is', null)
                  .limit(1)
                if (lettred && lettred.length > 0) foundFactureId = String((lettred[0] as any).facture_id)
              } catch { /* best-effort */ }
            }

            // (c) via rapproche_releve_id + transaction_idx côté facture
            if (!foundFactureId) {
              const m = paidList.find((f: any) =>
                f.rapproche_releve_id === releveId && f.rapproche_transaction_idx === i
              )
              if (m) foundFactureId = String(m.id)
            }

            if (foundFactureId) {
              entry.updatedTxs[i] = {
                ...tx,
                facture_id: foundFactureId,
                facture_ids: [foundFactureId],
              }
              entryChanged = true
              backfilled++
            }
          }
          if (entryChanged) entry.changed = true
        }
        if (backfilled > 0) {
          console.warn(`[rapprochement] FIX 4 backfill: ${backfilled} tx rapproche ← facture_id inféré`)
          // Persiste uniquement les relevés effectivement touchés.
          for (const [releveId, entry] of releveMap) {
            if (entry.changed) {
              await supabase.from('releves_bancaires')
                .update({ transactions_json: entry.updatedTxs })
                .eq('id', releveId)
            }
          }
        }
      } catch (backfillErr) {
        console.warn('[rapprochement] FIX 4 backfill failed:', backfillErr)
      }

      // ═══════════════════════════════════════════════════════════════
      // PHASE FINALE — Écritures BNQ + lettrage 401 (tout en un)
      //
      // Pour chaque transaction rapprochée avec facture_id:
      // 1. Créer l'écriture BNQ (D 401 / C 512) si elle n'existe pas
      // 2. Trouver l'écriture ACH correspondante (C 401) et la lettrer
      //    avec le même code
      // 3. Le BNQ et le ACH reçoivent le même lettre → dette soldée
      //
      // Pour les virements internes: créer les écritures 581
      // ═══════════════════════════════════════════════════════════════
      let ecrituresCreees = 0
      let ecrituresLettrees = 0
      try {
        const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
        if (dossier) {
          // Charger TOUTES les écritures 401/411 du dossier (y compris lettrées)
          const { data: allEcr401 } = await supabase
            .from('ecritures_comptables_v2')
            .select('id, compte:numero_compte, libelle, debit:debit_mur, credit:credit_mur, journal, lettre, ref_folio')
            .eq('dossier_id', dossier.id)
            .or('compte.like.401%,compte.like.411%')

          // Charger aussi depuis v2 pour avoir ref_folio
          // Charger toutes les écritures BNQ + ACH/OD sur 401/411 pour lettrage
          // ET toutes les BNQ pour la dedup des CLS
          const { data: allEcrV2 } = await supabase
            .from('ecritures_comptables_v2')
            .select('id, numero_compte, libelle, debit_mur, credit_mur, journal, lettre, ref_folio')
            .eq('societe_id', societe_id)
            .or('journal.eq.BNQ,journal.eq.ACH,journal.eq.OD')

          const allEcr401v2 = (allEcrV2 || []).filter((e: any) =>
            (e.numero_compte || '').match(/^(401|411)/) || e.journal === 'BNQ'
          )

          const achNonLettrees = (allEcr401v2 || []).filter((e: any) =>
            (e.journal === 'ACH' || e.journal === 'OD') && Number(e.credit_mur) > 0 && !e.lettre
          )

          console.warn(`[rapprochement] Phase finale: ${achNonLettrees.length} ACH non lettrées à traiter`)

          for (const [releveId, entry] of releveMap) {
            for (let i = 0; i < entry.updatedTxs.length; i++) {
              const tx = entry.updatedTxs[i]
              const txDebit = Number(tx.debit) || 0
              const txCredit = Number(tx.credit) || 0
              const txAmount = txDebit > 0 ? txDebit : txCredit
              if (txAmount === 0) continue
              const txDate = tx.date || new Date().toISOString().split('T')[0]

              // Migration 171/172 — taux HISTORIQUE figé pour conversion MUR.
              // Si le tuple (date, devise) manque en DB, on bascule sur le
              // taux live (tx legacy / ré-éxécution) avec log, OU si la tx
              // est encore non_identifie on skip et on la marque.
              const txDeviseEffective = (tx.devise || entry.releveDevise || 'MUR').toUpperCase()
              const rateOutcomeLoop = await resolveHistoricalRateSafe(
                supabase, txDate, txDeviseEffective, rates,
              )
              if (rateOutcomeLoop.rate == null && txDeviseEffective !== 'MUR') {
                if (tx.statut === 'non_identifie' || !tx.statut) {
                  try {
                    entry.updatedTxs[i] = { ...tx, statut: 'a_verifier_taux' }
                    entry.changed = true
                  } catch { /* best-effort */ }
                  continue
                }
                // Déjà classifiée → on poursuit avec le taux live (ou 1 en dernier recours) + log.
                console.warn(
                  `[rapprochement] phase-finale: no rate ${txDeviseEffective}@${txDate}, using live fallback`,
                )
              }
              const txHistoricalRate = rateOutcomeLoop.rate ?? (rates[txDeviseEffective] || 1)
              const txAmountMUR = Math.round(
                (txDeviseEffective === 'MUR' ? txAmount : txAmount * txHistoricalRate) * 100,
              ) / 100
              // Montant dans la devise d'origine (utile pour les 3 colonnes fig 172).
              const txMontantOrigine = txDeviseEffective === 'MUR' ? null : Math.round(txAmount * 100) / 100

              // ── Skip unmatched internal transfers (waiting for counterpart) ──
              if (tx.statut === 'interne_en_attente') {
                continue
              }

              // ── Virements internes → 581 ──
              if (tx.statut === 'interne' || tx.matched_type === 'transfert_interne') {
                const intRef = `VI-${releveId}-${i}`
                const anyRefInt = `${releveId}-${i}`
                const alreadyExists = (allEcr401v2 || []).some((e: any) =>
                  e.ref_folio && (e.ref_folio === intRef || e.ref_folio.endsWith(anyRefInt))
                )
                if (alreadyExists) continue

                // Use shared VI code from counterpart matching if available
                const lettre581 = tx.vi_pair_code || `VI${String(ecrituresCreees + 1).padStart(3, '0')}`
                const isOutgoing = txDebit > 0
                const libelle = `Virement interne ${(tx.libelle || '').substring(0, 30)}`
                const socIdForInt = (dossiers || []).find((d: any) => d.id === dossier.id)?.societe_id || societe_id
                const freezeVI = bnqFreezeColumns(txDeviseEffective, txMontantOrigine, txHistoricalRate)
                await supabase.from('ecritures_comptables_v2').insert([
                  { dossier_id: dossier.id, societe_id: socIdForInt, date_ecriture: txDate, journal: 'BNQ',
                    numero_compte: '512', libelle,
                    debit_mur: isOutgoing ? 0 : txAmountMUR, credit_mur: isOutgoing ? txAmountMUR : 0,
                    lettre: lettre581, ref_folio: intRef,
                    ...freezeVI },
                  { dossier_id: dossier.id, societe_id: socIdForInt, date_ecriture: txDate, journal: 'BNQ',
                    numero_compte: '581', libelle,
                    debit_mur: isOutgoing ? txAmountMUR : 0, credit_mur: isOutgoing ? 0 : txAmountMUR,
                    lettre: lettre581, ref_folio: intRef,
                    ...freezeVI },
                ])
                ecrituresCreees++
                continue
              }

              // ── Transactions rapprochées avec facture → BNQ 401↔512 + lettrage ACH ──
              if (tx.statut !== 'rapproche' || !tx.facture_id) continue

              const refFolio = `BANK-${releveId}-${i}`
              // Anti-doublon : auto_rapprocher crée déjà via createEcrituresForPayment
              // avec ref_folio = `BANK-${releveId}-${i}-${facture_id}` ET facture_id FK.
              // On cherche par ref_folio exact OU par préfixe OU par facture_id pour
              // couvrir tous les chemins d'écriture. Sans ça, cette phase recréait des
              // doublons avec un libellé légèrement différent qui échappait à safeInsertBnq.
              const refFolioPrefix = `${refFolio}-`
              const existingEntry = (allEcr401v2 || []).find((e: any) => {
                if (!e || e.journal !== 'BNQ') return false
                if (e.ref_folio === refFolio) return true
                if (typeof e.ref_folio === 'string' && e.ref_folio.startsWith(refFolioPrefix)) return true
                if (e.facture_id && e.facture_id === tx.facture_id
                    && String(e.numero_compte || '').match(/^(401|411)/)) return true
                return false
              })

              const { data: facture } = await supabase.from('factures')
                .select('numero_facture, tiers, type_facture, montant_mur, montant_ttc')
                .eq('id', tx.facture_id).maybeSingle()
              if (!facture) continue

              const lettreCode = tx.lettre || `BNQ${String(ecrituresCreees + 1).padStart(3, '0')}`
              const compte401 = facture.type_facture === 'fournisseur' ? '401' : '411'
              const isPayment = txDebit > 0

              if (existingEntry) {
                // Entry already exists (from createEcrituresForPayment) → UPDATE with lettre
                if (!existingEntry.lettre) {
                  await supabase.from('ecritures_comptables_v2')
                    .update({ lettre: lettreCode, date_lettrage: new Date().toISOString().split('T')[0] })
                    .eq('ref_folio', refFolio)
                    .eq('societe_id', societe_id)
                    .eq('journal', 'BNQ')
                  console.warn(`[rapprochement] Updated lettre ${lettreCode} on existing BNQ ${refFolio}`)
                }
              } else {
                // Create new BNQ entries
                const societeIdForInsert = societe_id
                const freezeBnqFac = bnqFreezeColumns(txDeviseEffective, txMontantOrigine, txHistoricalRate)
                await supabase.from('ecritures_comptables_v2').insert([
                  { dossier_id: dossier.id, societe_id: societeIdForInsert, date_ecriture: txDate, journal: 'BNQ',
                    numero_compte: compte401,
                    libelle: `Paiement ${(facture.tiers || '').substring(0, 30)} — ${facture.numero_facture || ''}`,
                    debit_mur: isPayment ? txAmountMUR : 0, credit_mur: isPayment ? 0 : txAmountMUR,
                    lettre: lettreCode, ref_folio: refFolio,
                    ...freezeBnqFac },
                  { dossier_id: dossier.id, societe_id: societeIdForInsert, date_ecriture: txDate, journal: 'BNQ',
                    numero_compte: '512',
                    libelle: `Virement ${(facture.tiers || '').substring(0, 30)}`,
                    debit_mur: isPayment ? 0 : txAmountMUR, credit_mur: isPayment ? txAmountMUR : 0,
                    lettre: lettreCode, ref_folio: refFolio,
                    ...freezeBnqFac },
                ])
              }
              ecrituresCreees++

              // 2. Lettrer l'écriture ACH correspondante avec le MÊME code
              // Chercher par: même compte (401/411) + crédit + tiers similaire + non lettrée
              const factureTiers = (facture.tiers || '').toLowerCase().substring(0, 20)
              const factureMUR = Math.round(Number(facture.montant_mur || facture.montant_ttc || 0) * 100) / 100

              // Stratégie 1: montant exact (2%) + 5 premiers chars du tiers OBLIGATOIRE
              // Le filtre tiers est OBLIGATOIRE pour éviter le lettrage croisé
              // (2 factures du même montant peuvent venir de fournisseurs différents)
              const tiersShort = factureTiers.length >= 5 ? factureTiers.substring(0, 5) : factureTiers
              let achFound = achNonLettrees.find((e: any) => {
                const eAmt = Math.round((Number(e.credit_mur) || 0) * 100) / 100
                if (eAmt === 0) return false
                const diff = Math.abs(eAmt - factureMUR) / Math.max(factureMUR, 1)
                if (diff > 0.02) return false
                const eLib = (e.libelle || '').toLowerCase()
                return tiersShort.length >= 3 && eLib.includes(tiersShort)
              })

              // Stratégie 2: par numéro de facture dans le libellé ACH
              if (!achFound && facture.numero_facture && String(facture.numero_facture).length >= 4) {
                const numFac = String(facture.numero_facture).toLowerCase()
                achFound = achNonLettrees.find((e: any) => {
                  const eLib = (e.libelle || '').toLowerCase()
                  return eLib.includes(numFac)
                })
              }

              // Stratégie 3: montant proche (10%) + tiers OBLIGATOIRE (TDS possible)
              // Le filtre tiers reste obligatoire pour éviter les lettrages croisés
              if (!achFound && factureMUR > 0) {
                achFound = achNonLettrees.find((e: any) => {
                  const eAmt = Math.round((Number(e.credit_mur) || 0) * 100) / 100
                  if (eAmt === 0) return false
                  const diff = Math.abs(eAmt - factureMUR) / factureMUR
                  if (diff > 0.10) return false
                  const eLib = (e.libelle || '').toLowerCase()
                  return tiersShort.length >= 3 && eLib.includes(tiersShort)
                })
              }

              if (achFound) {
                // UPDATE directement sur v2 pour être sûr que lettre est écrit
                await supabase.from('ecritures_comptables_v2')
                  .update({ lettre: lettreCode, date_lettrage: new Date().toISOString().split('T')[0] })
                  .eq('id', achFound.id)
                // Remove from pool to avoid double-lettrage
                const idx = achNonLettrees.indexOf(achFound)
                if (idx >= 0) achNonLettrees.splice(idx, 1)
                ecrituresLettrees++
              }
            // ── Handled above via continue ──
            }
          }

          // ── SECOND PASS: Transactions SANS facture mais classifiées → BNQ ──
          for (const [releveId2, entry2] of releveMap) {
            for (let i2 = 0; i2 < entry2.updatedTxs.length; i2++) {
              const tx = entry2.updatedTxs[i2]
              const txDebit2 = Number(tx.debit) || 0
              const txCredit2 = Number(tx.credit) || 0
              const txAmount2 = txDebit2 > 0 ? txDebit2 : txCredit2
              if (txAmount2 === 0) continue
              const txDate2 = tx.date || new Date().toISOString().split('T')[0]
              // Migration 171/172 — taux HISTORIQUE pour la conversion MUR.
              const txDeviseEffective2 = (tx.devise || entry2.releveDevise || 'MUR').toUpperCase()
              const rateOutcome2 = await resolveHistoricalRateSafe(
                supabase, txDate2, txDeviseEffective2, rates,
              )
              if (rateOutcome2.rate == null && txDeviseEffective2 !== 'MUR') {
                if (tx.statut === 'non_identifie' || !tx.statut) {
                  try {
                    entry2.updatedTxs[i2] = { ...tx, statut: 'a_verifier_taux' }
                    entry2.changed = true
                  } catch { /* best-effort */ }
                  continue
                }
                console.warn(
                  `[rapprochement] phase-final-2: no rate ${txDeviseEffective2}@${txDate2}, using live`,
                )
              }
              const txHistoricalRate2 = rateOutcome2.rate ?? (rates[txDeviseEffective2] || 1)
              const txAmountMUR2 = Math.round(
                (txDeviseEffective2 === 'MUR' ? txAmount2 : txAmount2 * txHistoricalRate2) * 100,
              ) / 100
              const txMontantOrigine2 = txDeviseEffective2 === 'MUR' ? null : Math.round(txAmount2 * 100) / 100

            // ── NEW: Appliquer les règles de classification configurables (R01-R07+) ──
            // Pour les transactions non rapprochées par facture (non_identifie + a_verifier)
            const isUnclassified = (tx.statut === 'non_identifie' || tx.statut === 'a_verifier') && !tx.facture_id
            if (isUnclassified && !tx.matched_type?.startsWith('rule_') && classificationRules.length > 0) {
              const classified = classifyTransaction({
                date: tx.date || '',
                libelle: tx.libelle || '',
                tiers_detecte: tx.tiers_detecte || null,
                debit: Number(tx.debit) || 0,
                credit: Number(tx.credit) || 0,
                // F8/F10 — devise portée par la tx > devise du compte bancaire
                devise: tx.devise || entry2.releveDevise,
              }, classificationRules)
              if (classified.matched && classified.compte_debit) {
                tx.statut = 'rapproche'
                tx.matched_type = `rule_${classified.rule_code}`
                tx.note = `Auto-classé: ${classified.classification} (règle ${classified.rule_code})`
                tx.classification_rule = classified.rule_code
                tx.classification_compte = classified.compte_debit
                entry2.changed = true

                // Si flag compliance → créer alerte
                if (classified.compliance_flag) {
                  try {
                    await supabase.from('compliance_alerts').insert({
                      societe_id, alert_type: classified.compliance_flag,
                      severity: getComplianceSeverity(classified.compliance_flag, txAmount2),
                      title: classified.legal_warning?.split('.')[0] || `Alerte: ${classified.classification}`,
                      description: classified.legal_warning || `Transaction nécessitant attention: ${tx.libelle}`,
                      legal_reference: classified.compliance_flag === 'director_loan' ? 'Companies Act 2001, Section 166' : null,
                      amount: txAmount2,
                      related_entity_type: 'transaction',
                      related_entity_id: `${releveId2}-${i2}`,
                      created_by: user.id,
                    })
                  } catch { /* best-effort */ }
                }
              }
            }

            // ── NEW: Détecter virements vers/depuis dirigeants/associés ──
            const isUnclassifiedDir = (tx.statut === 'non_identifie' || tx.statut === 'a_verifier') && !tx.facture_id
            if (isUnclassifiedDir && !tx.matched_type?.startsWith('rule_') && tx.matched_type !== 'qualification_requise' && directors.length > 0) {
              const dirMatch = detectDirector({
                date: tx.date || '',
                libelle: tx.libelle || '',
                tiers_detecte: tx.tiers_detecte || null,
                debit: Number(tx.debit) || 0,
                credit: Number(tx.credit) || 0,
                // F8/F10 — devise portée par la tx > devise du compte bancaire
                devise: tx.devise || entry2.releveDevise,
              }, directors)
              if (dirMatch) {
                // NE PAS auto-rapprocher — exiger validation humaine (R07)
                tx.matched_type = 'qualification_requise'
                tx.qualification_status = 'pending'
                tx.director_id = dirMatch.director_id
                tx.director_name = dirMatch.director_name
                tx.note = `⚠ Qualification requise: virement avec ${dirMatch.director_name} (${dirMatch.role}). Choisissez la nature: NDF / Avance salaire / Rémunération / Dividendes / Prêt`
                entry2.changed = true

                // Créer alerte de qualification
                try {
                  await supabase.from('compliance_alerts').insert({
                    societe_id, alert_type: 'director_transaction_pending',
                    severity: 'high',
                    title: `Qualification requise: ${dirMatch.director_name}`,
                    description: `Virement de ${txAmount2.toFixed(2)} ${(tx.devise || entry2.releveDevise)} concernant ${dirMatch.director_name} (${dirMatch.role}). Doit être qualifié comme: A) Remboursement NDF / B) Avance salaire / C) Rémunération / D) Avance dividendes / E) Prêt (⚠ interdit dirigeants - Companies Act s.166)`,
                    legal_reference: 'Companies Act 2001, Section 166 (si Prêt)',
                    amount: txAmount2,
                    related_entity_type: 'transaction',
                    related_entity_id: `${releveId2}-${i2}`,
                    created_by: user.id,
                  })
                } catch { /* best-effort */ }
              }
            }

            // ── Transactions classifiées SANS facture → BNQ avec le bon compte ──
            // MRA → D 444 / C 512, Frais bancaires → D 627 / C 512,
            // Salaires → D 421 / C 512, Particuliers → D 467 / C 512
            if (tx.statut === 'rapproche' && !tx.facture_id && tx.matched_type) {
              const classRef = `CLS-${releveId2}-${i2}`
              // Check idempotence STRICT : query DB direct sur ref_folio.
              // Historiquement on lisait allEcr401v2 (filtré par journal + comptes 401/411),
              // ce qui ratait les doublons créés sur d'autres comptes (4312, 627, 421…)
              // par les règles R03/R04. Un SELECT sur index idx_ecritures_v2_societe_ref_folio
              // (migration 146) est peu coûteux et couvre TOUS les comptes.
              const anyRef = `${releveId2}-${i2}`
              const { data: existingRefs } = await supabase
                .from('ecritures_comptables_v2')
                .select('id, ref_folio')
                .eq('societe_id', societe_id)
                .or(`ref_folio.eq.${classRef},ref_folio.like.%-${anyRef},ref_folio.like.%-${anyRef}-%`)
                .limit(1)
              const classExists = !!(existingRefs && existingRefs.length > 0)
              if (!classExists) {
                let compteCharge = '471'
                let libellePrefix = 'Opération bancaire'

                if (tx.matched_type === 'paiement_mra' || tx.matched_type === 'paiement_mra_non_verifie') {
                  compteCharge = '444'; libellePrefix = 'Paiement MRA'
                } else if (tx.matched_type === 'charges_sociales') {
                  compteCharge = '431'; libellePrefix = 'Charges sociales'
                } else if (tx.matched_type === 'frais_bancaires') {
                  compteCharge = '627'; libellePrefix = 'Frais bancaires'
                } else if (tx.matched_type === 'salaire_bulk' || tx.matched_type === 'salaire_bulk_non_verifie') {
                  compteCharge = '421'; libellePrefix = 'Masse salariale'
                } else if (tx.matched_type === 'salaire_individuel') {
                  compteCharge = '421'; libellePrefix = 'Salaire'
                } else if (tx.matched_type === 'reversal_salaire') {
                  compteCharge = '421'; libellePrefix = 'Reversal salaire'
                } else if (tx.matched_type === 'compte_courant_associe') {
                  compteCharge = '455'; libellePrefix = 'Compte courant associé'
                } else if (tx.matched_type === 'loyer') {
                  compteCharge = '613'; libellePrefix = 'Loyer'
                } else if (tx.matched_type?.startsWith('rule_') && tx.classification_compte) {
                  // Classification par règle configurable (R01-R07+)
                  compteCharge = tx.classification_compte
                  libellePrefix = tx.note?.replace(/^Auto-classé:\s*/, '').split(' (')[0] || 'Classification auto'
                }

                const classLettre = tx.lettre || `CLS${String(ecrituresCreees + 1).padStart(3, '0')}`
                const classLib = `${libellePrefix} — ${(tx.tiers_detecte || tx.libelle || '').substring(0, 30)}`
                const isOut = txDebit2 > 0

                // R7 : pas de lettre sur comptes de résultat (6xxx/7xxx)
                const chargeClass = compteCharge.charAt(0)
                const lettreOnCharge = (chargeClass !== '6' && chargeClass !== '7') ? classLettre : null

                const freezeClass = bnqFreezeColumns(txDeviseEffective2, txMontantOrigine2, txHistoricalRate2)
                await supabase.from('ecritures_comptables_v2').insert([
                  { dossier_id: dossier.id, societe_id: societe_id, date_ecriture: txDate2, journal: 'BNQ',
                    numero_compte: compteCharge, libelle: classLib,
                    debit_mur: isOut ? txAmountMUR2 : 0, credit_mur: isOut ? 0 : txAmountMUR2,
                    lettre: lettreOnCharge, ref_folio: classRef,
                    ...freezeClass },
                  { dossier_id: dossier.id, societe_id: societe_id, date_ecriture: txDate2, journal: 'BNQ',
                    numero_compte: '512', libelle: `Banque — ${(tx.tiers_detecte || '').substring(0, 25)}`,
                    debit_mur: isOut ? 0 : txAmountMUR2, credit_mur: isOut ? txAmountMUR2 : 0,
                    lettre: classLettre, ref_folio: classRef,
                    ...freezeClass },
                ])
                ecrituresCreees++

                // Lettrage salaires : lier le paiement BNQ (débit 421) avec la dette SAL (crédit 4210)
                if (tx.matched_type === 'salaire_individuel' || tx.matched_type === 'salaire_bulk' || tx.matched_type === 'salaire_bulk_non_verifie') {
                  const salComptes = ['4210', '421', '421000']
                  const txMonth = txDate2?.substring(0, 7) || ''
                  const { data: salEntries } = await supabase
                    .from('ecritures_comptables_v2')
                    .select('id, numero_compte, credit_mur, lettre, date_ecriture')
                    .eq('societe_id', societe_id)
                    .eq('journal', 'SAL')
                    .in('numero_compte', salComptes)
                    .is('lettre', null)
                    .gt('credit_mur', 0)

                  if (salEntries && salEntries.length > 0) {
                    const isBulk = tx.matched_type !== 'salaire_individuel'
                    const matched = salEntries.find((se: any) => {
                      if (isBulk) {
                        return (se.date_ecriture || '').startsWith(txMonth)
                      } else {
                        const diff = Math.abs(Number(se.credit_mur) - txAmountMUR2) / Math.max(txAmountMUR2, 1)
                        return diff < 0.05
                      }
                    })
                    if (matched) {
                      await supabase.from('ecritures_comptables_v2')
                        .update({ lettre: classLettre, date_lettrage: new Date().toISOString().split('T')[0] })
                        .eq('id', matched.id)
                      console.warn(`[rapprochement] Lettrage salaire: BNQ ${classLettre} ↔ SAL ${matched.id}`)
                    }
                  }
                }
              }
            }
          }
          } // close for (releveId2)
          console.warn(`[rapprochement] Phase finale: ${ecrituresCreees} BNQ créées, ${ecrituresLettrees} ACH lettrées`)
        }
      } catch (genErr) {
        console.warn('[rapprochement] Phase finale failed:', genErr)
      }

      console.warn('[rapprochement] Result:', counts, 'ecritures_lettrees:', ecrituresLettrees)

      const totalClassified = counts.matched + counts.interne + counts.frais_bancaires + counts.salaire_bulk + counts.mra

      // Audit log — summary entry for the auto run (best-effort)
      try {
        await supabase.from('rapprochement_audit_log').insert({
          societe_id,
          action: 'auto_rapprocher',
          montant: counts.total,
          reason: `Auto-rapprochement: ${counts.matched} rapprochées, ${counts.propose} proposées, ${counts.not_matched} non rapprochées sur ${counts.total}`,
          after_state: {
            matched: counts.matched,
            propose: counts.propose,
            not_matched: counts.not_matched,
            total: counts.total,
            interne: counts.interne,
            frais_bancaires: counts.frais_bancaires,
            salaire_bulk: counts.salaire_bulk,
            mra: counts.mra,
          },
          user_id: user.id,
          user_email: user.email || null,
        })
      } catch (auditErr) {
        console.warn('[audit] auto_rapprocher log failed:', auditErr)
      }

      const durationMs = Date.now() - t0
      return NextResponse.json({
        matched: counts.matched, interne: counts.interne, frais_bancaires: counts.frais_bancaires,
        salaire_bulk: counts.salaire_bulk, mra: counts.mra, propose: counts.propose,
        not_matched: counts.not_matched, total: counts.total,
        total_classified: totalClassified,
        ecritures_lettrees: ecrituresLettrees,
        factures_reparees: repaired,
        ecritures_creees: ecrituresCreees,
        matches: matchesList.slice(0, 10),
        _debug: {
          version: '2026-04-13-v8-selfnames-strict',
          duration_ms: durationMs,
          releves_count: releves.length,
          factures_count: factures.length,
          ecritures_count: ecritures.length,
          global_unclassified: globalUnclassified.length,
          aliases_loaded: 'see logs',
        },
      })
    }

    // === LETTRAGE MANUEL ===
    if (action === 'lettrer_manuel') {
      const { transaction_id, releve_id, facture_id, facture_ids, ecriture_id, societe_id, classification } = body
      if (!releve_id) return NextResponse.json({ error: 'releve_id requis' }, { status: 400 })

      // ─────────────────────────────────────────────────────────────────
      // BRANCHE MULTI-FACTURES — un seul virement solde N factures.
      // Active si body.facture_ids est un array de longueur >= 2.
      // ─────────────────────────────────────────────────────────────────
      if (Array.isArray(facture_ids) && facture_ids.length >= 2) {
        const fIds: string[] = facture_ids.filter((x: any) => typeof x === 'string' && x.length > 0)
        if (fIds.length < 2) {
          return NextResponse.json({ error: 'facture_ids invalide (au moins 2 factures requises)' }, { status: 400 })
        }

        const { data: releveMulti } = await supabase
          .from('releves_bancaires').select('id, transactions_json, compte_bancaire_id')
          .eq('id', releve_id).single()
        if (!releveMulti) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

        const txIdxM = parseInt(String(transaction_id).split('-').pop() || '0')
        const txsM = [...(releveMulti.transactions_json || [])]
        if (txIdxM >= txsM.length) return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })

        const prevTxM = { ...txsM[txIdxM] }
        const txAmount = Math.max(Number(prevTxM.debit) || 0, Number(prevTxM.credit) || 0)
        if (txAmount <= 0) {
          return NextResponse.json({ error: 'Montant de la transaction nul — impossible de lettrer' }, { status: 400 })
        }

        // Période verrouillée ?
        if (prevTxM.date && societe_id) {
          const lockStatus = await checkPeriodLock(supabase, societe_id, prevTxM.date)
          if (lockStatus.locked) {
            return NextResponse.json({
              error: `Période verrouillée — ${lockStatus.reason}. Modification interdite sur transaction du ${prevTxM.date}.`,
              period_end: lockStatus.period_end,
            }, { status: 403 })
          }
        }

        // Charger toutes les factures
        const { data: facturesMulti, error: fLoadErr } = await supabase
          .from('factures')
          .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, solde_non_paye, devise, statut, rapproche_releve_id, rapproche_transaction_idx, rapproche_date, rapproche_source')
          .in('id', fIds)
        if (fLoadErr || !facturesMulti || facturesMulti.length !== fIds.length) {
          return NextResponse.json({
            error: `Factures introuvables (attendu ${fIds.length}, trouvé ${facturesMulti?.length || 0})`,
          }, { status: 404 })
        }
        if (facturesMulti.some(f => f.statut === 'paye' || f.statut === 'annule')) {
          return NextResponse.json({
            error: 'Une ou plusieurs factures sont déjà payées ou annulées — déletrer d\'abord',
          }, { status: 400 })
        }

        // Validation : somme des soldes restants ≈ montant tx (tolérance 1 MUR)
        const TOL_MULTI = 1
        const sommeSoldes = facturesMulti.reduce((s, f) => {
          const solde = f.solde_non_paye != null ? Number(f.solde_non_paye) : Number(f.montant_ttc) || 0
          return s + solde
        }, 0)
        if (Math.abs(sommeSoldes - txAmount) > TOL_MULTI) {
          return NextResponse.json({
            error: `Total factures (${sommeSoldes.toFixed(2)} MUR) ≠ montant tx (${txAmount.toFixed(2)} MUR). Écart > ${TOL_MULTI} MUR.`,
          }, { status: 400 })
        }

        // Compte bancaire pour les écritures BNQ
        let compteBanqueM = '512'
        if (releveMulti.compte_bancaire_id) {
          const { data: cbM } = await supabase
            .from('comptes_bancaires').select('compte_comptable')
            .eq('id', releveMulti.compte_bancaire_id).maybeSingle()
          if (cbM?.compte_comptable) compteBanqueM = String(cbM.compte_comptable)
        }

        const lettreCodeM = `MM${String(Date.now()).slice(-5)}`
        const reconcileDateM = new Date().toISOString()
        const datePayM = (prevTxM as any).date || new Date().toISOString().split('T')[0]

        const rollbackM: Array<() => Promise<any>> = []
        const processedFactures: string[] = []

        try {
          // Step 1 : flagger la transaction (statut rapproche + facture_ids)
          txsM[txIdxM] = {
            ...prevTxM,
            facture_ids: fIds,
            nb_factures: fIds.length,
            rapprochement_multi: true,
            lettre: lettreCodeM,
            statut: 'rapproche',
            rapproche_at: reconcileDateM,
          }
          const { error: updRelM } = await supabase
            .from('releves_bancaires').update({ transactions_json: txsM }).eq('id', releve_id)
          if (updRelM) throw new Error(`Releve update failed: ${updRelM.message}`)
          rollbackM.unshift(async () => {
            const revert = [...txsM]; revert[txIdxM] = prevTxM
            await supabase.from('releves_bancaires').update({ transactions_json: revert }).eq('id', releve_id)
          })

          // Step 2 : pour chaque facture, marquer paye et créer la BNQ
          for (const f of facturesMulti) {
            const soldeAvant = f.solde_non_paye != null ? Number(f.solde_non_paye) : Number(f.montant_ttc) || 0
            const amount_mur = Number((f as any).montant_mur) || Number(f.montant_ttc) || 0
            const prevState = {
              statut: f.statut, solde_non_paye: f.solde_non_paye,
              rapproche_releve_id: f.rapproche_releve_id, rapproche_transaction_idx: f.rapproche_transaction_idx,
              rapproche_date: f.rapproche_date, rapproche_source: f.rapproche_source,
            }
            const { error: updFErr } = await supabase.from('factures').update({
              statut: 'paye', solde_non_paye: 0,
              rapproche_releve_id: releve_id, rapproche_transaction_idx: txIdxM,
              rapproche_date: reconcileDateM, rapproche_source: 'manual_multi',
            }).eq('id', f.id)
            if (updFErr) throw new Error(`Facture ${f.numero_facture || f.id} update failed: ${updFErr.message}`)
            rollbackM.unshift(async () => {
              await supabase.from('factures').update(prevState).eq('id', f.id)
            })

            // Créer l'écriture BNQ pour cette facture (D 401/411 / C banque)
            if (amount_mur > 0) {
              const payType: 'supplier' | 'client' = f.type_facture === 'fournisseur' ? 'supplier' : 'client'
              const { error: bnqErr } = await createEcrituresForPayment(supabase, {
                societe_id: societe_id as string,
                date_payment: datePayM,
                amount_mur: soldeAvant > 0 ? soldeAvant : amount_mur,
                type: payType,
                tiers: String(f.tiers || '').trim(),
                ref_folio: `BANK-${releve_id}-${txIdxM}-${f.id}`,
                description: `Règlement groupé ${f.numero_facture || ''} — ${f.tiers || ''} (lot ${lettreCodeM})`.trim(),
                compte_banque: compteBanqueM,
                facture_id: f.id,
                lettre_code: lettreCodeM,
                numero_piece: (prevTxM as any).libelle || '',
                devise_origine: (prevTxM as any).devise || f.devise || null,
              })
              if (bnqErr) {
                console.warn(`[lettrer_manuel multi] BNQ insert failed for facture ${f.id}:`, bnqErr)
              }
            }
            processedFactures.push(f.id)
          }

          // Step 3 : audit log
          try {
            await supabase.from('rapprochement_audit_log').insert({
              societe_id: societe_id || null,
              action: 'lettrer_manuel_multi',
              releve_id, transaction_idx: txIdxM,
              facture_ids: fIds, ecriture_id: null,
              lettre_code: lettreCodeM, montant: txAmount,
              devise: (prevTxM as any).devise || null,
              reason: `Lettrage multi-factures (${fIds.length} factures)`,
              before_state: prevTxM, after_state: txsM[txIdxM],
              user_id: user.id, user_email: user.email || null,
            })
          } catch (auditErr) {
            console.warn('[audit] lettrer_manuel_multi log failed:', auditErr)
          }

          return NextResponse.json({
            success: true, lettre: lettreCodeM,
            nb_factures: fIds.length, montant_total: txAmount,
          })
        } catch (err: any) {
          console.error('[lettrer_manuel multi] failure, rolling back:', err.message)
          for (const undo of rollbackM) {
            try { await undo() } catch (e) { console.error('[multi] rollback step failed:', e) }
          }
          return NextResponse.json({
            error: `Lettrage multi échoué (rollback ${processedFactures.length} factures): ${err.message}`,
          }, { status: 500 })
        }
      }
      // ─────────────────────────────────────────────────────────────────
      // Fin branche multi — la suite traite le cas single-facture legacy.
      // ─────────────────────────────────────────────────────────────────

      // Classification manuelle sans facture (MRA, frais, associé, etc.)
      if (classification && !facture_id && !ecriture_id) {
        const { data: releve } = await supabase
          .from('releves_bancaires').select('id, transactions_json, compte_bancaire_id').eq('id', releve_id).single()
        if (!releve) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })
        // Résoudre la devise du compte bancaire du relevé (fallback si tx.devise absent)
        let releveDeviseMC = 'MUR'
        if (releve.compte_bancaire_id) {
          const { data: cb } = await supabase.from('comptes_bancaires').select('devise').eq('id', releve.compte_bancaire_id).maybeSingle()
          if (cb?.devise) releveDeviseMC = (cb.devise as string).toUpperCase()
        }

        const txIdx = parseInt(transaction_id.split('-').pop() || '0')
        const txs = [...(releve.transactions_json || [])]
        if (txIdx >= txs.length) return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })

        // B3 — Bloquer si la période de la transaction est verrouillée
        const txDate = txs[txIdx]?.date
        if (txDate && societe_id) {
          const lockStatus = await checkPeriodLock(supabase, societe_id, txDate)
          if (lockStatus.locked) {
            return NextResponse.json({
              error: `Période verrouillée — ${lockStatus.reason}. Modification interdite sur transaction du ${txDate}.`,
              period_end: lockStatus.period_end,
            }, { status: 403 })
          }
        }

        const code = `MC${String(Date.now()).slice(-4)}`
        txs[txIdx] = { ...txs[txIdx], statut: 'rapproche', matched_type: classification, lettre: code, note: `Classification manuelle: ${classification}` }
        await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)

        // Créer l'écriture BNQ avec le bon compte.
        // Mapping étendu pour les classifications proposées par le menu
        // "Classer..." de la page rapprochement (Part 2 redesign).
        // V3-22 : CLASSE_COMPTES extrait dans
        // lib/accounting/rapprochement/lettrage.ts (réutilisé par d'autres
        // handlers — éviter de dupliquer la même table).
        // PCM dynamique : si l'UI fournit un compte explicite (issu du PCM
        // éditable de la société, ex 4511.OCC, 70601…), il prime sur le
        // mapping statique CLASSE_COMPTES. Garde-fou : doit commencer par un
        // chiffre (numéro de compte valide).
        const compteChargeBody = typeof body.compte_charge === 'string' ? body.compte_charge.trim() : ''
        let compteCharge = /^[0-9]/.test(compteChargeBody)
          ? compteChargeBody
          : (CLASSE_COMPTES[classification] || '471')
        console.warn(`[lettrer_manuel] societe=${societe_id} tx=${transaction_id} classification=${classification} → compte=${compteCharge}`)

        // ── DÉTECTION INTER-SOCIÉTÉS (migration 302 / fix bug 291-293) ─────
        // Si la tx est classée 'virement_interne' (ou si on est en virement
        // implicite sans facture), on tente de la matcher contre les autres
        // sociétés du même groupe (groupe_id ou client_id). Match positif →
        // bascule de 5800 (transit) vers 451 (Comptes courants Groupe),
        // ET création du miroir comptable côté société destinataire.
        const txForDetect = txs[txIdx] || {}
        const libelleForDetect: string = String(txForDetect.libelle || '')
        const tiersForDetect: string = String(txForDetect.tiers_detecte || '')
        let interSocieteDest: string | null = null
        let interSocieteScore = 0
        if (
          classification === 'virement_interne' ||
          classification === 'inter_societe'
        ) {
          try {
            const detection = await resolveInterSocieteForTransaction(
              supabase,
              societe_id as string,
              libelleForDetect,
              tiersForDetect,
            )
            if (detection.is_inter && detection.societe_dest_id) {
              compteCharge = COMPTE_GROUPE_451  // basculer 5800 → 451
              interSocieteDest = detection.societe_dest_id
              interSocieteScore = detection.score
              console.warn(
                `[lettrer_manuel] INTER-SOCIÉTÉS détecté ` +
                `(${detection.match_method}, score=${detection.score.toFixed(2)}) — ` +
                `compte forcé à 451, dest=${detection.societe_dest_id}`,
              )
            }
          } catch (detErr: any) {
            console.warn('[lettrer_manuel] détection inter-sociétés échouée:', detErr?.message)
          }
        }

        const ratesMC = await getTauxChange().catch(() => ({ MUR: 1, EUR: 46.50, USD: 44.80, GBP: 54.20 } as Record<string, number>))
        const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
        if (dossier) {
          const tx = txs[txIdx]
          const txAmt = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
          const isOut = (Number(tx.debit) || 0) > 0
          // Migration 171/172 — résoudre la devise de la tx + taux historique.
          const dateEcr = tx.date || new Date().toISOString().split('T')[0]
          const deviseMC = (tx.devise || releveDeviseMC || 'MUR').toUpperCase()
          let historicalRateMC = 1
          let amountMurMC = txAmt
          if (deviseMC !== 'MUR') {
            const mcOutcome = await resolveHistoricalRateSafe(supabase, dateEcr, deviseMC, ratesMC)
            historicalRateMC = mcOutcome.rate ?? (ratesMC[deviseMC] || 1)
            amountMurMC = Math.round(txAmt * historicalRateMC * 100) / 100
            if (!mcOutcome.rate) {
              console.warn(`[lettrer_manuel] missing historical rate ${deviseMC}@${dateEcr} — using live fallback ${historicalRateMC}`)
            }
          }
          const freezeMC = bnqFreezeColumns(
            deviseMC,
            deviseMC === 'MUR' ? null : Math.round(txAmt * 100) / 100,
            historicalRateMC,
          )
          const refFolioMC = `MC-${releve_id}-${txIdx}`
          await supabase.from('ecritures_comptables_v2').insert([
            { dossier_id: dossier.id, societe_id, date_ecriture: dateEcr,
              journal: 'BNQ', numero_compte: compteCharge, libelle: `${classification} — ${(tx.tiers_detecte || tx.libelle || '').substring(0, 30)}`,
              debit_mur: isOut ? amountMurMC : 0, credit_mur: isOut ? 0 : amountMurMC, lettre: code, ref_folio: refFolioMC,
              ...freezeMC },
            { dossier_id: dossier.id, societe_id, date_ecriture: dateEcr,
              journal: 'BNQ', numero_compte: '512', libelle: `Banque — ${(tx.tiers_detecte || '').substring(0, 25)}`,
              debit_mur: isOut ? 0 : amountMurMC, credit_mur: isOut ? amountMurMC : 0, lettre: code, ref_folio: refFolioMC,
              ...freezeMC },
          ])

          // ── MIROIR INTER-SOCIÉTÉS ──────────────────────────────────────────
          // Si la détection a trouvé une société destinataire du même groupe,
          // on crée immédiatement la contre-partie miroir (DR 512_dest / CR 451)
          // pour éviter le bug historique 291-293 (transit 5800 qui s'accumule).
          if (interSocieteDest) {
            try {
              const mirrorRes = await creerMiroirInterSociete(supabase, {
                user_id: user.id,
                societe_source_id: societe_id as string,
                societe_dest_id: interSocieteDest,
                date_ecriture: dateEcr,
                montant_mur: amountMurMC,
                libelle_source: `${classification} — ${libelleForDetect.substring(0, 100)}`,
                isOut,
                ref_folio_source: refFolioMC,
                devise_origine: freezeMC.devise_origine,
                montant_origine: freezeMC.montant_origine,
                taux_change_applique: freezeMC.taux_change_applique,
                lettre_code: code,
              })
              if (mirrorRes.created) {
                console.warn(`[lettrer_manuel/inter] miroir créé dest=${interSocieteDest} score=${interSocieteScore.toFixed(2)}`)
              } else {
                console.warn(`[lettrer_manuel/inter] miroir non créé : ${mirrorRes.reason}`)
              }
            } catch (mirrorErr: any) {
              console.warn('[lettrer_manuel/inter] miroir échoué (non-bloquant):', mirrorErr?.message)
            }
          }

          // ⚠️ LETTRAGE CROISÉ (fix 2026-05-03)
          // Pour les classifications qui ont une CONTREPARTIE COMPTABLE
          // pré-existante (paye, MRA, cotisations), on cherche l'écriture
          // SAL/OD non-lettrée correspondante et on lui pose la même lettre
          // que la BNQ → balance du compte tiers (4210/421/444/431) soldée.
          //
          // Sans ce lettrage croisé : la BNQ existe (côté banque OK) mais la
          // dette d'origine reste non lettrée → balance gonflée → user voit
          // l'incohérence et tente de re-classifier → DOUBLON.
          //
          // Stratégie de matching :
          //   1. Récupérer toutes les écritures non-lettrées sur le compte
          //      tier dans les ±60 jours autour de la date du paiement
          //   2. Filtrer celles dont le crédit (dette) ≈ montant BNQ (±0.5%
          //      pour tolérer les arrondis de change)
          //   3. Si UNE seule trouvée → poser la lettre dessus
          //   4. Si plusieurs candidats → tentative match exact, sinon log
          //      sans rien faire (l'opérateur fera un lettrage manuel)
          //   5. Si aucune trouvée → log (cas normal pour 1ère paye, etc.)
          // V3-22 : CLASSIFICATIONS_AVEC_LETTRAGE_CROISE,
          // LETTRAGE_CROISE_DATE_WINDOW_DAYS, lettrageCroiseTolerance et
          // selectClosestByDate sont extraits dans
          // lib/accounting/rapprochement/lettrage.ts (helpers pures).
          if (CLASSIFICATIONS_AVEC_LETTRAGE_CROISE.has(classification) && isOut) {
            try {
              // Fenêtre date : ±60 jours pour gérer les paiements tardifs
              const dateRef = new Date(dateEcr)
              const dateMin = new Date(dateRef.getTime() - LETTRAGE_CROISE_DATE_WINDOW_DAYS * 86400000).toISOString().split('T')[0]
              const dateMax = new Date(dateRef.getTime() + LETTRAGE_CROISE_DATE_WINDOW_DAYS * 86400000).toISOString().split('T')[0]

              const { data: candidates } = await supabase
                .from('ecritures_comptables_v2')
                .select('id, date_ecriture, debit_mur, credit_mur, libelle, journal')
                .eq('societe_id', societe_id)
                .eq('numero_compte', compteCharge)
                .is('lettre', null)
                .neq('journal', 'BNQ')   // exclure les BNQ qu'on vient de créer
                .gte('date_ecriture', dateMin)
                .lte('date_ecriture', dateMax)

              // Tolérance 0.5% pour absorber arrondis de change/centimes
              const tolerance = lettrageCroiseTolerance(amountMurMC)
              const exactMatches = (candidates || []).filter((c: any) => {
                const credit = Number(c.credit_mur) || 0
                return credit > 0 && Math.abs(credit - amountMurMC) <= tolerance
              })

              if (exactMatches.length === 1) {
                const matchId = exactMatches[0].id
                await supabase.from('ecritures_comptables_v2')
                  .update({ lettre: code, date_lettrage: new Date().toISOString().split('T')[0] })
                  .eq('id', matchId)
                console.warn(`[lettrer_manuel/${classification}] lettrage croisé OK : écriture ${matchId} lettrée avec ${code}`)
              } else if (exactMatches.length === 0) {
                console.warn(`[lettrer_manuel/${classification}] aucun match pour ${amountMurMC} MUR sur compte ${compteCharge} (±${LETTRAGE_CROISE_DATE_WINDOW_DAYS}j) — BNQ créée mais pas de lettrage croisé`)
              } else {
                // Plusieurs candidats : on tente le match le plus proche en date
                const closestByDate = selectClosestByDate(exactMatches as any[], dateRef)!
                await supabase.from('ecritures_comptables_v2')
                  .update({ lettre: code, date_lettrage: new Date().toISOString().split('T')[0] })
                  .eq('id', closestByDate.id)
                console.warn(`[lettrer_manuel/${classification}] ${exactMatches.length} candidats — lettré le plus proche en date (${closestByDate.id})`)
              }
            } catch (lettrageErr: any) {
              console.warn(`[lettrer_manuel/${classification}] lettrage croisé échoué (non-bloquant):`, lettrageErr?.message)
            }
          }

          // ── CCA : mettre à jour comptes_courants_associes.solde ──
          // Quand une tx bancaire est classée 'compte_courant_associe', les
          // écritures 455/512 sont créées mais la table CCA n'est pas maj.
          // On cherche le CCA correspondant (par tiers_detecte) et on met
          // à jour le solde + on crée un mouvement (source traçable).
          if (classification === 'compte_courant_associe') {
            try {
              const tiersName = (txs[txIdx]?.tiers_detecte || '').trim().toLowerCase()
              const { data: ccaList } = await supabase
                .from('comptes_courants_associes')
                .select('id, nom, solde')
                .eq('societe_id', societe_id)
              const matchedCca = ccaList?.length === 1
                ? ccaList[0]
                : ccaList?.find((c: any) =>
                    tiersName && (c.nom || '').toLowerCase().includes(tiersName.slice(0, 10))
                  )
              if (matchedCca) {
                // isOut: company pays associate → reduce company liability (solde decreases)
                // !isOut: associate pays company → increase liability (solde increases)
                const delta = isOut ? -amountMurMC : amountMurMC
                const newSolde = (Number(matchedCca.solde) || 0) + delta
                await supabase.from('comptes_courants_associes')
                  .update({ solde: Math.round(newSolde * 100) / 100 })
                  .eq('id', matchedCca.id)
                await supabase.from('mouvements_compte_courant').insert({
                  compte_courant_id: matchedCca.id,
                  societe_id,
                  type: isOut ? 'remboursement' : 'avance',
                  montant: Math.round(amountMurMC * 100) / 100,
                  date_mouvement: dateEcr,
                  description: `Rapprochement BNQ — ${txs[txIdx]?.libelle?.substring(0, 60) || ''}`,
                  source_releve_id: releve_id,
                  source_transaction_idx: txIdx,
                })
                console.warn(`[lettrer_manuel/CCA] solde ${matchedCca.nom}: ${matchedCca.solde} → ${newSolde}`)
              } else {
                console.warn(`[lettrer_manuel/CCA] aucun CCA trouvé pour societe=${societe_id} tiers="${tiersName}" — solde non mis à jour`)
              }
            } catch (ccaErr: any) {
              console.warn('[lettrer_manuel/CCA] mise à jour CCA échouée (non-bloquant):', ccaErr?.message)
            }
          }
        }

        return NextResponse.json({ success: true, lettre: code, classification })
      }

      const { data: releve } = await supabase
        .from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
      if (!releve) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx >= txs.length) return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })

      const lettreCode = `M${String(Date.now()).slice(-4)}`
      const reconcileDate = new Date().toISOString()
      const prevTx = { ...txs[txIdx] }

      // Capture le montant pour l'audit
      const amount = Math.max(Number(prevTx.debit) || 0, Number(prevTx.credit) || 0)

      // ── Atomic multi-step update with rollback on any failure ──
      // We emulate a transaction: every step records its compensating undo in `rollback`.
      // If any step fails, we replay the rollbacks in reverse order.
      const rollback: Array<() => Promise<any>> = []

      try {
        // Step 1: update transactions_json
        txs[txIdx] = {
          ...prevTx,
          facture_id: facture_id || null,
          ecriture_id: ecriture_id || null,
          lettre: lettreCode,
          statut: 'rapproche',
          rapproche_at: reconcileDate,
        }
        const { error: updReleveErr } = await supabase
          .from('releves_bancaires')
          .update({ transactions_json: txs })
          .eq('id', releve_id)
        if (updReleveErr) throw new Error(`Releve update failed: ${updReleveErr.message}`)
        rollback.unshift(async () => {
          const revertTxs = [...txs]
          revertTxs[txIdx] = prevTx
          await supabase.from('releves_bancaires').update({ transactions_json: revertTxs }).eq('id', releve_id)
        })

        // Step 2: update facture if provided
        if (facture_id) {
          const { data: prevFacture } = await supabase
            .from('factures').select('statut, montant_ttc, solde_non_paye, rapproche_releve_id, rapproche_transaction_idx, rapproche_date, rapproche_source').eq('id', facture_id).single()

          // Détection paiement partiel : si le montant payé < solde restant - tolérance,
          // on marque 'partiel' (et on décrémente solde_non_paye). Sinon 'paye'.
          // Permet : 1 facture → N transactions (chaque tx solde une partie).
          // amount est le montant absolu de la tx (calculé ligne 2006).
          const factureMontant = Number(prevFacture?.montant_ttc) || 0
          const soldeRestantAvant = prevFacture?.solde_non_paye != null
            ? Number(prevFacture.solde_non_paye)
            : factureMontant
          const TOL = 0.5 // MUR — petits écarts traités comme solde complet
          const isPartial = amount > 0 && soldeRestantAvant > 0 && (soldeRestantAvant - amount) > TOL
          const nouveauSolde = Math.max(0, Math.round((soldeRestantAvant - amount) * 100) / 100)

          const updatePayload: Record<string, unknown> = {
            statut: isPartial ? 'partiel' : 'paye',
            solde_non_paye: isPartial ? nouveauSolde : 0,
            rapproche_releve_id: releve_id,
            rapproche_transaction_idx: txIdx,
            rapproche_date: reconcileDate,
            rapproche_source: 'manual',
          }
          const { error: updFacErr } = await supabase.from('factures').update(updatePayload).eq('id', facture_id)
          if (updFacErr) throw new Error(`Facture update failed: ${updFacErr.message}`)
          // Annote la transaction pour traçabilité côté UI
          if (isPartial) {
            txs[txIdx] = {
              ...txs[txIdx],
              paiement_partiel: true,
              montant_paye: amount,
              solde_restant_apres: nouveauSolde,
            }
            await supabase.from('releves_bancaires')
              .update({ transactions_json: txs })
              .eq('id', releve_id)
          }
          rollback.unshift(async () => {
            if (prevFacture) {
              await supabase.from('factures').update({
                statut: prevFacture.statut,
                solde_non_paye: prevFacture.solde_non_paye,
                rapproche_releve_id: prevFacture.rapproche_releve_id,
                rapproche_transaction_idx: prevFacture.rapproche_transaction_idx,
                rapproche_date: prevFacture.rapproche_date,
                rapproche_source: prevFacture.rapproche_source,
              }).eq('id', facture_id)
            }
          })
        }

        // Step 3: update ecriture if provided (bidirectional link)
        if (ecriture_id) {
          const { data: prevEcriture } = await supabase
            .from('ecritures_comptables_v2').select('lettre, date_lettrage, rapproche_releve_id, rapproche_transaction_idx, rapproche_at').eq('id', ecriture_id).single()
          const { error: updEcrErr } = await supabase.from('ecritures_comptables_v2').update({
            lettre: lettreCode,
            date_lettrage: new Date().toISOString().split('T')[0],
            rapproche_releve_id: releve_id,
            rapproche_transaction_idx: txIdx,
            rapproche_at: reconcileDate,
          }).eq('id', ecriture_id)
          if (updEcrErr) throw new Error(`Ecriture update failed: ${updEcrErr.message}`)
          rollback.unshift(async () => {
            if (prevEcriture) {
              await supabase.from('ecritures_comptables_v2').update(prevEcriture).eq('id', ecriture_id)
            }
          })
        }

        // Step 3.5: créer les écritures BNQ qui SOLDENT le compte tiers
        // ⚠️ FIX (2026-05-03) — Avant ce fix, lettrer_manuel marquait la
        // facture 'paye' et la tx 'rapproche' mais ne créait PAS les
        // écritures BNQ (411 cr / 512 dr ou 401 dr / 512 cr). Résultat : le
        // compte tiers restait débiteur/créditeur dans la balance, le user
        // voyait l'incohérence dans "l'espace banque" et tentait de
        // re-classifier la tx → DOUBLON via classer_transaction.
        if (facture_id) {
          try {
            const { data: facture } = await supabase
              .from('factures')
              .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, devise')
              .eq('id', facture_id).single()
            if (facture) {
              const { data: releveBanque } = await supabase
                .from('releves_bancaires')
                .select('compte_bancaire_id')
                .eq('id', releve_id).single()
              let compteBanque = '512'
              if (releveBanque?.compte_bancaire_id) {
                const { data: cb } = await supabase
                  .from('comptes_bancaires')
                  .select('compte_comptable')
                  .eq('id', releveBanque.compte_bancaire_id).maybeSingle()
                if (cb?.compte_comptable) compteBanque = String(cb.compte_comptable)
              }
              const payType: 'supplier' | 'client' =
                facture.type_facture === 'fournisseur' ? 'supplier' : 'client'
              const amount_mur = Number((facture as any).montant_mur) || Number(facture.montant_ttc) || 0
              const datePayment = (prevTx as any).date || new Date().toISOString().split('T')[0]
              if (amount_mur > 0) {
                const { error: payErr } = await createEcrituresForPayment(supabase, {
                  societe_id: societe_id as string,
                  date_payment: datePayment,
                  amount_mur,
                  type: payType,
                  tiers: String(facture.tiers || '').trim(),
                  ref_folio: `BANK-${releve_id}-${txIdx}-${facture.id}`,
                  description: `Règlement ${facture.numero_facture || ''} — ${facture.tiers || ''}`.trim(),
                  compte_banque: compteBanque,
                  facture_id: facture.id,
                  lettre_code: lettreCode,
                  numero_piece: (prevTx as any).libelle || '',
                  devise_origine: (prevTx as any).devise || facture.devise || null,
                })
                if (payErr) {
                  console.warn(`[lettrer_manuel] BNQ insert failed for facture ${facture.id}:`, payErr)
                }
              }
            }
          } catch (bnqErr: any) {
            console.warn('[lettrer_manuel] BNQ generation failed (non-blocking):', bnqErr?.message)
          }
        }

        // Step 4: audit log (best-effort — failure doesn't rollback business data)
        try {
          await supabase.from('rapprochement_audit_log').insert({
            societe_id: societe_id || null,
            action: 'lettrer_manuel',
            releve_id,
            transaction_idx: txIdx,
            facture_ids: facture_id ? [facture_id] : [],
            ecriture_id: ecriture_id || null,
            lettre_code: lettreCode,
            montant: amount,
            devise: prevTx.devise || null,
            reason: 'Lettrage manuel simple',
            before_state: prevTx,
            after_state: txs[txIdx],
            user_id: user.id,
            user_email: user.email || null,
          })
        } catch (auditErr) {
          console.warn('[audit] lettrer_manuel log failed:', auditErr)
        }

        return NextResponse.json({ success: true, lettre: lettreCode })
      } catch (err: any) {
        console.error('[lettrer_manuel] atomic failure, rolling back:', err.message)
        for (const undo of rollback) {
          try { await undo() } catch (e) { console.error('[lettrer_manuel] rollback step failed:', e) }
        }
        return NextResponse.json({ error: `Lettrage échoué (rollback effectué): ${err.message}` }, { status: 500 })
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // lettrer_partiel — Répartit UN prélèvement bancaire sur une ou
    // plusieurs factures, chacune pour un montant (MUR) librement affecté.
    // Couvre TROIS cas avec le même mécanisme :
    //   1. Un prélèvement règle UNE facture partiellement (versement <
    //      solde) → la facture reste 'partiel', re-sélectionnable pour le
    //      prélèvement suivant (= « deux prélèvements pour une facture »).
    //   2. Un prélèvement règle PLUSIEURS factures partiellement/mixte
    //      (ex. virement 10 000 = facture A 7 000 soldée + facture B 3 000
    //      sur 5 000 → B reste 'partiel').
    //   3. Cas dégénéré : 1 facture, versement = solde → facture soldée.
    //
    // Chaque affectation crée un versement (factures_paiements, le trigger
    // recalcule solde + statut) + une paire BNQ (512 ↔ 411/401) lettrée
    // avec une lettre STABLE par facture (tous les versements + l'écriture
    // VTE/ACH d'une facture partagent la même lettre → groupe équilibré une
    // fois la facture soldée).
    //
    // Entrée : soit `allocations: [{facture_id, montant}]` (montant en MUR),
    // soit l'ancien format `facture_id` (+ `montant_partiel` optionnel ;
    // défaut = montant du prélèvement). La somme des montants doit ≈ le
    // montant du prélèvement (tolérance 1 MUR).
    //
    // NB : les montants sont raisonnés en MUR (cas dominant : compte MUR).
    // L'écart de change réalisé n'est pas comptabilisé sur un versement
    // partiel (régularisable ultérieurement).
    // ═══════════════════════════════════════════════════════════════════
    if (action === 'lettrer_partiel') {
      const { transaction_id, releve_id, facture_id, societe_id, montant_partiel, allocations, ecart_compte, ecart_libelle } = body as {
        transaction_id?: string
        releve_id?: string
        facture_id?: string
        societe_id?: string
        montant_partiel?: number
        allocations?: Array<{ facture_id: string; montant: number }>
        // Qualification manuelle de l'écart (override du routage auto) : permet
        // d'imputer le delta sur un compte d'attente (471) ou un autre compte
        // plutôt que le booking automatique change/frais/acompte. Le sens
        // débit/crédit reste imposé par l'équilibrage (opposé de la banque).
        ecart_compte?: string
        ecart_libelle?: string
      }
      if (!releve_id || !societe_id) {
        return NextResponse.json({ error: 'releve_id et societe_id requis' }, { status: 400 })
      }

      const { data: releveP } = await supabase
        .from('releves_bancaires').select('id, transactions_json, compte_bancaire_id')
        .eq('id', releve_id).single()
      if (!releveP) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

      const txIdxP = parseInt(String(transaction_id).split('-').pop() || '0')
      const txsP = [...(releveP.transactions_json || [])]
      if (txIdxP >= txsP.length) return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })

      const prevTxP = { ...txsP[txIdxP] }
      const txAmountP = Math.max(Number(prevTxP.debit) || 0, Number(prevTxP.credit) || 0)
      if (txAmountP <= 0) {
        return NextResponse.json({ error: 'Montant de la transaction nul — impossible de lettrer' }, { status: 400 })
      }
      if (prevTxP.statut === 'rapproche' || prevTxP.statut === 'interne') {
        return NextResponse.json({ error: 'Transaction déjà rapprochée — déletrer d\'abord' }, { status: 409 })
      }

      // Normaliser les affectations (montant en MUR). Ancien format single →
      // une seule affectation, montant par défaut = montant du prélèvement.
      type RawAlloc = { facture_id: string; montant: number | null }
      let rawAllocs: RawAlloc[] = []
      if (Array.isArray(allocations) && allocations.length > 0) {
        rawAllocs = allocations
          .filter((a) => a && typeof a.facture_id === 'string' && a.facture_id.length > 0)
          .map((a) => ({ facture_id: a.facture_id, montant: Number(a.montant) }))
      } else if (facture_id) {
        rawAllocs = [{ facture_id, montant: montant_partiel != null ? Number(montant_partiel) : null }]
      }
      if (rawAllocs.length === 0) {
        return NextResponse.json({ error: 'facture_id ou allocations[] requis' }, { status: 400 })
      }
      // Pas de doublon de facture dans la même répartition
      const uniqIds = new Set(rawAllocs.map((a) => a.facture_id))
      if (uniqIds.size !== rawAllocs.length) {
        return NextResponse.json({ error: 'Une facture est présente en double dans la répartition' }, { status: 400 })
      }

      // Période verrouillée ?
      if (prevTxP.date) {
        const lockStatus = await checkPeriodLock(supabase, societe_id, prevTxP.date)
        if (lockStatus.locked) {
          return NextResponse.json({
            error: `Période verrouillée — ${lockStatus.reason}. Modification interdite sur transaction du ${prevTxP.date}.`,
            period_end: lockStatus.period_end,
          }, { status: 403 })
        }
      }

      // Charger toutes les factures
      const factIdsP = rawAllocs.map((a) => a.facture_id)
      const { data: facturesP, error: fErrP } = await supabase
        .from('factures')
        .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, solde_non_paye, devise, statut')
        .in('id', factIdsP)
      if (fErrP || !facturesP || facturesP.length !== factIdsP.length) {
        return NextResponse.json({
          error: `Factures introuvables (attendu ${factIdsP.length}, trouvé ${facturesP?.length || 0})`,
        }, { status: 404 })
      }
      const factByIdP = new Map<string, any>(facturesP.map((f: any) => [f.id, f]))

      // Construire les affectations finales (montant MUR + contrôles)
      const TOL_PARTIEL = 1
      const finalAllocs: Array<{ facture: any; montantMur: number; remaining: number }> = []
      for (const a of rawAllocs) {
        const f = factByIdP.get(a.facture_id)
        if (f.statut === 'annule') {
          return NextResponse.json({ error: `Facture ${f.numero_facture || f.id} annulée — paiement impossible` }, { status: 400 })
        }
        if (f.statut === 'paye') {
          return NextResponse.json({ error: `Facture ${f.numero_facture || f.id} déjà soldée — rien à régler` }, { status: 400 })
        }
        const factureMur = Number(f.montant_mur) || Number(f.montant_ttc) || 0
        const remaining = f.solde_non_paye != null ? Number(f.solde_non_paye) : factureMur
        // montant par défaut (single legacy sans montant) = montant du prélèvement
        const montantMur = Math.round((a.montant != null && Number.isFinite(a.montant) ? a.montant : txAmountP) * 100) / 100
        if (montantMur <= 0) {
          return NextResponse.json({ error: `Montant d'affectation nul pour ${f.numero_facture || f.id}` }, { status: 400 })
        }
        if (montantMur > remaining + TOL_PARTIEL) {
          return NextResponse.json({
            error: `Affectation ${montantMur.toFixed(2)} MUR > solde restant ${remaining.toFixed(2)} MUR pour ${f.numero_facture || f.id}.`,
            facture_id: f.id,
            solde_restant: Math.round(remaining * 100) / 100,
          }, { status: 400 })
        }
        finalAllocs.push({ facture: f, montantMur, remaining })
      }

      // La somme des affectations PEUT différer du montant du prélèvement :
      // l'écart (change / frais retenus / acompte) est comptabilisé sur une
      // 3e ligne BNQ équilibrée (cf. ecartInfo plus bas). Routage validé :
      //   • A > P (on solde plus que reçu)            → perte : 656 (devise) / 6270 (MUR)
      //   • A < P, petit écart (≤ max(50, 2%))        → gain : 756 (devise) / 6270 (MUR)
      //   • A < P, surplus important (> max(50, 2%))  → acompte 4191 (client) / 409 (fournisseur)
      const sommeAllocsP = Math.round(finalAllocs.reduce((s, x) => s + x.montantMur, 0) * 100) / 100
      const ecartBrut = Math.round((sommeAllocsP - txAmountP) * 100) / 100 // A − P (signé)
      const TOL_ECART = 1
      const cashIn = (Number(prevTxP.credit) || 0) >= (Number(prevTxP.debit) || 0) // crédit = encaissement client
      let ecartInfo: { compte: string; montant: number; libelle: string } | null = null
      if (Math.abs(ecartBrut) > TOL_ECART) {
        const anyDevise = finalAllocs.some((a) => {
          const d = String(a.facture.devise || 'MUR').toUpperCase()
          return d.length > 0 && d !== 'MUR'
        })
        const seuilAcompte = Math.max(50, 0.02 * txAmountP)
        const allClient = finalAllocs.every((a) => a.facture.type_facture !== 'fournisseur')
        let compte: string
        let libelle: string
        if (ecartBrut > 0) {
          compte = anyDevise ? '656' : '6270'
          libelle = anyDevise ? 'Écart de change réalisé (perte)' : 'Frais bancaires sur règlement'
        } else if (Math.abs(ecartBrut) > seuilAcompte) {
          compte = allClient ? '4191' : '409'
          libelle = allClient ? 'Acompte client reçu' : 'Avance versée fournisseur'
        } else {
          compte = anyDevise ? '756' : '6270'
          libelle = anyDevise ? 'Écart de change réalisé (gain)' : 'Écart sur règlement'
        }
        ecartInfo = { compte, montant: Math.abs(ecartBrut), libelle }

        // Override manuel : l'opérateur a qualifié l'écart (compte d'attente
        // 471, change 666/766, escompte, pénalité, exceptionnel…). On remplace
        // le compte/libellé auto ; le sens reste géré par l'équilibrage BNQ.
        const ecartCompteClean = typeof ecart_compte === 'string' ? ecart_compte.trim() : ''
        if (/^\d{3,}$/.test(ecartCompteClean)) {
          ecartInfo = {
            compte: ecartCompteClean,
            montant: ecartInfo.montant,
            libelle: (typeof ecart_libelle === 'string' && ecart_libelle.trim())
              ? ecart_libelle.trim()
              : ecartInfo.libelle,
          }
        }
      }

      // Compte bancaire pour les BNQ
      let compteBanqueP = '512'
      if (releveP.compte_bancaire_id) {
        const { data: cbP } = await supabase
          .from('comptes_bancaires').select('compte_comptable')
          .eq('id', releveP.compte_bancaire_id).maybeSingle()
        if (cbP?.compte_comptable) compteBanqueP = String(cbP.compte_comptable)
      }

      const datePayP = (prevTxP as any).date || new Date().toISOString().split('T')[0]
      const reconcileDateP = new Date().toISOString()
      const libellePrev = (prevTxP as any).libelle || ''
      const rollbackP: Array<() => Promise<any>> = []
      const lettresParFacture: string[] = []

      try {
        for (const alloc of finalAllocs) {
          const f = alloc.facture
          const payType: 'supplier' | 'client' = f.type_facture === 'fournisseur' ? 'supplier' : 'client'
          const refFolio = `BANK-${releve_id}-${txIdxP}-${f.id}`

          // Lettre STABLE par facture : réutiliser celle déjà posée sinon générer.
          const { data: existingLettreRows } = await supabase
            .from('ecritures_comptables_v2')
            .select('lettre')
            .eq('societe_id', societe_id)
            .eq('facture_id', f.id)
            .not('lettre', 'is', null)
            .limit(1)
          const lettreCode = existingLettreRows && existingLettreRows.length > 0 && existingLettreRows[0].lettre
            ? String(existingLettreRows[0].lettre)
            : `LP${String(Date.now()).slice(-5)}${lettresParFacture.length}`
          lettresParFacture.push(lettreCode)

          // 1) versement (trigger → solde + statut)
          const { data: paiement, error: payInsErr } = await supabase
            .from('factures_paiements')
            .insert({
              facture_id: f.id,
              societe_id,
              montant: alloc.montantMur,
              montant_mur: alloc.montantMur,
              devise: 'MUR',
              taux_change: 1,
              date_paiement: datePayP,
              mode_paiement: 'prelevement',
              reference: libellePrev.slice(0, 200) || null,
              notes: `Rapprochement réparti — relevé ${releve_id} tx#${txIdxP}`,
              source: 'rapprochement',
              rapproche_releve_id: releve_id,
              rapproche_transaction_idx: txIdxP,
              created_by: user.id,
            })
            .select('id')
            .single()
          if (payInsErr || !paiement) throw new Error(`Insert paiement (${f.numero_facture || f.id}): ${payInsErr?.message || 'inconnu'}`)
          rollbackP.unshift(async () => {
            await supabase.from('factures_paiements').delete().eq('id', paiement.id)
          })

          // 2) paire BNQ au montant affecté, lettre stable
          const ecrRes = await createEcrituresForPayment(supabase, {
            societe_id,
            date_payment: datePayP,
            amount_mur: alloc.montantMur,
            type: payType,
            tiers: String(f.tiers || '').trim(),
            ref_folio: refFolio,
            description: `Règlement ${f.numero_facture || ''} — ${f.tiers || ''} (${lettreCode})`.trim(),
            compte_banque: compteBanqueP,
            facture_id: f.id,
            lettre_code: lettreCode,
            numero_piece: libellePrev,
            allow_multiple_payments: true,
          })
          if (!ecrRes.ok) throw new Error(`Création écriture BNQ (${f.numero_facture || f.id}): ${ecrRes.error}`)
          rollbackP.unshift(async () => {
            await supabase.from('ecritures_comptables_v2').delete()
              .eq('societe_id', societe_id).eq('ref_folio', refFolio)
          })

          const ecritureId = ecrRes.bnq_ids?.[0]
          if (ecritureId) {
            await supabase.from('factures_paiements').update({ ecriture_id: ecritureId }).eq('id', paiement.id)
          }
        }

        // 3) Ligne d'écart BNQ (change 656/756 · frais 6270 · acompte 4191/409)
        // — équilibrée (512 ↔ compte d'écart), insérée seulement si la somme
        // affectée diffère réellement du prélèvement. Garantit que le 512 net
        // = le cash réellement mouvementé, et que le journal reste équilibré.
        if (ecartInfo) {
          const e = ecartInfo.montant
          const debit512 = cashIn ? (ecartBrut < 0 ? e : 0) : (ecartBrut > 0 ? e : 0)
          const credit512 = cashIn ? (ecartBrut > 0 ? e : 0) : (ecartBrut < 0 ? e : 0)
          const refEcart = `BANK-${releve_id}-${txIdxP}-ECART`
          const exerciceE = String(datePayP).slice(0, 4)
          const descEcart = `${ecartInfo.libelle} — règlement ${libellePrev.slice(0, 60)}`.trim()
          const { error: ecartErr } = await supabase.from('ecritures_comptables_v2').insert([
            {
              societe_id, journal: 'BNQ', date_ecriture: datePayP, exercice: exerciceE,
              numero_compte: compteBanqueP, debit_mur: debit512, credit_mur: credit512,
              libelle: descEcart, description: descEcart, ref_folio: refEcart,
            },
            {
              societe_id, journal: 'BNQ', date_ecriture: datePayP, exercice: exerciceE,
              numero_compte: ecartInfo.compte, debit_mur: credit512, credit_mur: debit512,
              libelle: descEcart, description: descEcart, ref_folio: refEcart,
            },
          ])
          if (ecartErr) throw new Error(`Écriture d'écart (${ecartInfo.compte}): ${ecartErr.message}`)
          rollbackP.unshift(async () => {
            await supabase.from('ecritures_comptables_v2').delete()
              .eq('societe_id', societe_id).eq('ref_folio', refEcart)
          })
        }

        // Marquer la transaction bancaire rapprochée (répartie/partielle)
        txsP[txIdxP] = {
          ...prevTxP,
          facture_id: finalAllocs[0].facture.id,
          facture_ids: finalAllocs.map((x) => x.facture.id),
          nb_factures: finalAllocs.length,
          lettre: lettresParFacture[0] || null,
          statut: 'rapproche',
          rapprochement_partiel: true,
          rapprochement_multi: finalAllocs.length > 1,
          montant_partiel: sommeAllocsP,
          rapproche_at: reconcileDateP,
        }
        const { error: updRelP } = await supabase
          .from('releves_bancaires').update({ transactions_json: txsP }).eq('id', releve_id)
        if (updRelP) throw new Error(`Releve update: ${updRelP.message}`)
        rollbackP.unshift(async () => {
          const revert = [...txsP]; revert[txIdxP] = prevTxP
          await supabase.from('releves_bancaires').update({ transactions_json: revert }).eq('id', releve_id)
        })

        // Soldes restants après répartition (relecture)
        const { data: factsAfter } = await supabase
          .from('factures').select('id, numero_facture, solde_non_paye, statut').in('id', factIdsP)

        // Audit (best-effort)
        try {
          await supabase.from('rapprochement_audit_log').insert({
            societe_id,
            action: 'lettrer_partiel',
            releve_id,
            transaction_idx: txIdxP,
            facture_ids: factIdsP,
            ecriture_id: null,
            lettre_code: lettresParFacture[0] || null,
            montant: sommeAllocsP,
            devise: (prevTxP as any).devise || null,
            reason: `Répartition ${sommeAllocsP.toFixed(2)} MUR sur ${finalAllocs.length} facture(s)`,
            before_state: prevTxP,
            after_state: txsP[txIdxP],
            user_id: user.id,
            user_email: user.email || null,
          })
        } catch (auditErr) {
          console.warn('[audit] lettrer_partiel log failed:', auditErr)
        }

        return NextResponse.json({
          success: true,
          lettre: lettresParFacture[0] || null,
          nb_factures: finalAllocs.length,
          montant_total: sommeAllocsP,
          ecart: ecartInfo
            ? { compte: ecartInfo.compte, montant: Math.round(ecartBrut * 100) / 100, libelle: ecartInfo.libelle }
            : null,
          factures: (factsAfter || []).map((f: any) => ({
            id: f.id,
            numero_facture: f.numero_facture,
            solde_restant: Math.round(Number(f.solde_non_paye ?? 0) * 100) / 100,
            statut: f.statut,
          })),
        })
      } catch (err: any) {
        console.error('[lettrer_partiel] failure, rolling back:', err.message)
        for (const undo of rollbackP) {
          try { await undo() } catch (e) { console.error('[lettrer_partiel] rollback step failed:', e) }
        }
        return NextResponse.json({ error: `Lettrage partiel échoué (rollback effectué): ${err.message}` }, { status: 500 })
      }
    }

    // === DELETTRER ===
    // ─────────────────────────────────────────────────────────────────
    // rejeter_suggestion — Annule une suggestion d'agent (statut "propose"
    // ou "a_verifier") sans toucher aux écritures comptables (aucune BNQ
    // n'a encore été créée). La transaction redevient orpheline et peut
    // être ré-évaluée au prochain run de l'agent.
    // ─────────────────────────────────────────────────────────────────
    if (action === 'rejeter_suggestion') {
      const { transaction_id, releve_id } = body
      if (!releve_id) return NextResponse.json({ error: 'releve_id requis' }, { status: 400 })
      if (!transaction_id) return NextResponse.json({ error: 'transaction_id requis' }, { status: 400 })

      const { data: releve, error: relErr } = await supabase
        .from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
      if (relErr || !releve) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

      const txIdx = parseInt(String(transaction_id).split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx < 0 || txIdx >= txs.length) {
        return NextResponse.json({ error: 'Index transaction invalide' }, { status: 400 })
      }
      const prevTx = txs[txIdx] || {}

      // Sécurité : ne rejeter QUE les suggestions d'agent (statut propose|a_verifier)
      // Pour ne pas casser un rapprochement humain validé.
      const currentStatut = prevTx.statut
      if (currentStatut === 'rapproche') {
        return NextResponse.json({
          error: 'Cette transaction est déjà rapprochée — utiliser delettrer pour l\'annuler',
        }, { status: 400 })
      }
      if (currentStatut !== 'propose' && currentStatut !== 'a_verifier') {
        return NextResponse.json({
          error: `Aucune suggestion à rejeter (statut actuel: ${currentStatut || 'aucun'})`,
        }, { status: 400 })
      }

      // Reset des champs agent
      const cleaned: any = { ...prevTx }
      cleaned.statut = 'non_identifie'
      delete cleaned.facture_id
      delete cleaned.facture_ids
      delete cleaned.matched_type
      delete cleaned.matched_strategy
      delete cleaned.matched_confidence
      delete cleaned.match_confidence
      delete cleaned.classification
      delete cleaned.classification_suggestion
      delete cleaned.compte_comptable
      delete cleaned.lettre
      delete cleaned.rapproche_at
      delete cleaned.rapprochement_multi
      delete cleaned.nb_factures
      delete cleaned.suggestion_source
      cleaned.note = 'Suggestion agent rejetée — à imputer manuellement'

      txs[txIdx] = cleaned
      const { error: updErr } = await supabase
        .from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
      if (updErr) {
        return NextResponse.json({ error: `Update relevé échoué: ${updErr.message}` }, { status: 500 })
      }

      return NextResponse.json({ ok: true, reset: true })
    }

    if (action === 'delettrer') {
      const { transaction_id, releve_id, facture_id, ecriture_id, societe_id } = body
      if (!releve_id) return NextResponse.json({ error: 'releve_id requis' }, { status: 400 })

      const { data: releve } = await supabase
        .from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
      if (!releve) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      const prevTx = txIdx < txs.length ? { ...txs[txIdx] } : null

      // B3 — Bloquer si la période de la transaction est verrouillée
      if (prevTx?.date && societe_id) {
        const lockStatus = await checkPeriodLock(supabase, societe_id, prevTx.date)
        if (lockStatus.locked) {
          return NextResponse.json({
            error: `Période verrouillée — ${lockStatus.reason}. Délettrage interdit sur transaction du ${prevTx.date}.`,
            period_end: lockStatus.period_end,
          }, { status: 403 })
        }
      }

      // Collect all facture_ids to unlink (support multi-facture delettrage)
      const faIds: string[] = facture_id
        ? [facture_id]
        : Array.isArray(prevTx?.facture_ids) ? prevTx.facture_ids : (prevTx?.facture_id ? [prevTx.facture_id] : [])

      // Délettrage d'un versement PARTIEL (action lettrer_partiel) : on ne force
      // PAS le statut de la facture — on supprime la ligne factures_paiements et
      // le trigger recalcule solde + statut (la facture peut rester 'partiel'
      // s'il subsiste d'autres versements).
      const isPartialUnmatch = prevTx?.rapprochement_partiel === true

      const rollback: Array<() => Promise<any>> = []

      try {
        if (prevTx) {
          txs[txIdx] = {
            ...prevTx,
            facture_id: null,
            facture_ids: undefined,
            ecriture_id: null,
            lettre: null,
            statut: 'a_verifier',
            rapprochement_multi: undefined,
            rapprochement_partiel: undefined,
            montant_partiel: undefined,
            paiement_id: undefined,
            nb_factures: undefined,
          }
          const { error: updErr } = await supabase
            .from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
          if (updErr) throw new Error(`Releve update failed: ${updErr.message}`)
          rollback.unshift(async () => {
            const revertTxs = [...txs]
            revertTxs[txIdx] = prevTx
            await supabase.from('releves_bancaires').update({ transactions_json: revertTxs }).eq('id', releve_id)
          })
        }

        if (isPartialUnmatch) {
          // Supprimer le(s) versement(s) factures_paiements de CETTE transaction
          // — le trigger recalcule solde_non_paye + statut de la facture.
          const { error: pDelErr } = await supabase
            .from('factures_paiements')
            .delete()
            .eq('rapproche_releve_id', releve_id)
            .eq('rapproche_transaction_idx', txIdx)
          if (pDelErr) throw new Error(`Suppression versement partiel: ${pDelErr.message}`)
        } else {
          for (const fId of faIds) {
            const { error } = await supabase.from('factures').update({
              statut: 'en_attente',
              rapproche_releve_id: null,
              rapproche_transaction_idx: null,
              rapproche_date: null,
              rapproche_source: null,
            }).eq('id', fId)
            if (error) throw new Error(`Facture ${fId} update failed: ${error.message}`)
          }
        }

        if (ecriture_id) {
          const { error } = await supabase.from('ecritures_comptables_v2').update({
            lettre: null,
            date_lettrage: null,
            rapproche_releve_id: null,
            rapproche_transaction_idx: null,
            rapproche_at: null,
          }).eq('id', ecriture_id)
          if (error) throw new Error(`Ecriture update failed: ${error.message}`)
        }

        // Supprimer les écritures BNQ créées par le rapprochement (BANK-, TDS-, CLS-, MC-)
        // pour éviter les écritures orphelines après délettrage
        try {
          const refPatterns = [`BANK-${releve_id}-${txIdx}`, `TDS-${releve_id}-${txIdx}`, `CLS-${releve_id}-${txIdx}`, `MC-${releve_id}-${txIdx}`]
          await supabase.from('ecritures_comptables_v2')
            .delete()
            .eq('societe_id', societe_id)
            .in('ref_folio', refPatterns)
          // BNQ par facture (lettrage multi/partiel) : ref_folio suffixé par
          // l'id facture → `BANK-<releve>-<idx>-<facture_id>`. Le délimiteur `-`
          // après l'index évite la collision préfixe (idx 1 vs 10).
          await supabase.from('ecritures_comptables_v2')
            .delete()
            .eq('societe_id', societe_id)
            .like('ref_folio', `BANK-${releve_id}-${txIdx}-%`)

          if (isPartialUnmatch) {
            // Cas RÉPARTI/PARTIEL : chaque facture a SA propre lettre stable.
            // Pour chacune, on retire la lettre sur l'écriture VTE/ACH
            // uniquement s'il NE RESTE PLUS aucune BNQ portant cette lettre
            // (d'autres versements de la même facture peuvent subsister).
            const faIdsPartial = Array.isArray(prevTx?.facture_ids) && prevTx.facture_ids.length > 0
              ? prevTx.facture_ids
              : (prevTx?.facture_id ? [prevTx.facture_id] : [])
            for (const fId of faIdsPartial) {
              const { data: tierRows } = await supabase
                .from('ecritures_comptables_v2')
                .select('lettre')
                .eq('societe_id', societe_id)
                .eq('facture_id', fId)
                .neq('journal', 'BNQ')
                .not('lettre', 'is', null)
              const lettres = Array.from(new Set((tierRows || []).map((r: any) => r.lettre).filter(Boolean)))
              for (const lt of lettres) {
                const { data: remainingBnq } = await supabase
                  .from('ecritures_comptables_v2')
                  .select('id')
                  .eq('societe_id', societe_id)
                  .eq('lettre', lt)
                  .eq('journal', 'BNQ')
                  .limit(1)
                if (!remainingBnq || remainingBnq.length === 0) {
                  await supabase.from('ecritures_comptables_v2')
                    .update({ lettre: null, date_lettrage: null })
                    .eq('societe_id', societe_id)
                    .eq('facture_id', fId)
                    .eq('lettre', lt)
                    .neq('journal', 'BNQ')
                }
              }
            }
          } else if (prevTx?.lettre) {
            // Délettrer les ACH/VTE/OD qui partageaient le même code lettre.
            await supabase.from('ecritures_comptables_v2')
              .update({ lettre: null, date_lettrage: null })
              .eq('societe_id', societe_id)
              .eq('lettre', prevTx.lettre)
              .neq('journal', 'BNQ')
          }
        } catch (clenupErr) {
          console.warn('[delettrer] cleanup BNQ failed:', clenupErr)
        }

        // Audit (best-effort)
        try {
          await supabase.from('rapprochement_audit_log').insert({
            societe_id: societe_id || null,
            action: 'delettrer',
            releve_id,
            transaction_idx: txIdx,
            facture_ids: faIds,
            ecriture_id: ecriture_id || null,
            lettre_code: prevTx?.lettre || null,
            reason: 'Délettrage manuel',
            before_state: prevTx,
            after_state: prevTx ? txs[txIdx] : null,
            user_id: user.id,
            user_email: user.email || null,
          })
        } catch (auditErr) {
          console.warn('[audit] delettrer log failed:', auditErr)
        }

        return NextResponse.json({ success: true })
      } catch (err: any) {
        console.error('[delettrer] atomic failure, rolling back:', err.message)
        for (const undo of rollback) {
          try { await undo() } catch (e) { console.error('[delettrer] rollback step failed:', e) }
        }
        return NextResponse.json({ error: `Délettrage échoué (rollback effectué): ${err.message}` }, { status: 500 })
      }
    }

    // === CREER RAPPROCHEMENT ===
    if (action === 'creer') {
      const { societe_id } = body
      const { data: dossiers } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id)
      const dossierIds = (dossiers || []).map((d: any) => d.id)

      let solde_comptable = 0
      if (dossierIds.length > 0) {
        const { data: ecritures } = await supabase
          .from('ecritures_comptables_v2').select('debit:debit_mur, credit:credit_mur')
          .in('dossier_id', dossierIds).like('compte', '51%')
          .gte('date_ecriture', body.periode_debut).lte('date_ecriture', body.periode_fin)
        solde_comptable = (ecritures || []).reduce((s: number, e: any) => s + Number(e.debit || 0) - Number(e.credit || 0), 0)
      }

      if (solde_comptable === 0) {
        const { data: rel } = await supabase
          .from('releves_bancaires').select('solde_cloture')
          .eq('societe_id', societe_id)
          .is('superseded_by_id', null)
          .lte('date_debut', body.periode_fin).gte('date_fin', body.periode_debut)
          .order('date_fin', { ascending: false }).limit(1).maybeSingle()
        if (rel) solde_comptable = Number(rel.solde_cloture) || 0
      }

      const { data, error } = await supabase.from('rapprochements_bancaires').insert({
        societe_id, compte_bancaire: body.compte_bancaire || '512',
        banque: body.banque, periode_debut: body.periode_debut,
        periode_fin: body.periode_fin, solde_releve: body.solde_releve,
        solde_comptable, created_by: user.id,
      }).select().single()
      if (error) throw error
      return NextResponse.json({ rapprochement: data, solde_comptable })
    }

    // === VALIDER ===
    if (action === 'valider') {
      const { data, error } = await supabase
        .from('rapprochements_bancaires')
        .update({ statut: 'valide', valide_par: user.id, valide_le: new Date().toISOString() })
        .eq('id', body.rapprochement_id).select().single()
      if (error) throw error
      return NextResponse.json({ rapprochement: data })
    }

    // === LETTRAGE MULTI — 1 paiement = plusieurs factures ===
    // FIX 6 — prise en compte type_ecart (PCG Mauritius) :
    //   'auto'         → |ecart| ≤ 1 MUR → 658/758 (régularisation)
    //   'change'       → 666 perte / 766 gain change
    //   'escompte'     → 665 escompte accordé / 765 escompte obtenu
    //   'penalite'     → 631 pénalités (toujours côté charge)
    //   'exceptionnel' → 658 charges / 758 produits exceptionnels
    //   undefined      → si |ecart| > 1, règle R4 : pas de lettrage forcé,
    //                     on refuse et on retourne un 409 avec les choix.
    // Les écritures d'écart ne reçoivent JAMAIS la lettre (règle R7 — pas
    // de lettrage sur résultat 6xxx/7xxx).
    if (action === 'lettrer_multi') {
      const { transaction_id, releve_id, facture_ids, societe_id, type_ecart } = body as {
        transaction_id?: string
        releve_id?: string
        facture_ids?: string[]
        societe_id?: string
        type_ecart?: 'auto' | 'change' | 'escompte' | 'penalite' | 'exceptionnel' | 'a_regulariser'
      }
      if (!releve_id || !facture_ids || !Array.isArray(facture_ids) || facture_ids.length === 0) {
        return NextResponse.json({ error: 'releve_id et facture_ids[] requis' }, { status: 400 })
      }

      const { data: releve } = await supabase
        .from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
      if (!releve) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

      const txIdx = parseInt((transaction_id || '').split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx >= txs.length) return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })

      const tx = txs[txIdx]
      const txAmount = Number(tx.credit) > 0 ? Number(tx.credit) : Number(tx.debit)

      // Vérifier que la somme des factures ≈ montant transaction
      const { data: facturesData } = await supabase.from('factures').select('id, montant_ttc, numero_facture, tiers, type_facture').in('id', facture_ids)
      const facturesTotal = (facturesData || []).reduce((s, f) => s + (Number(f.montant_ttc) || 0), 0)
      const ecart = Math.abs(txAmount - facturesTotal)
      const ecartSigne = txAmount - facturesTotal
      // Seuil auto : écarts < 2% sont acceptés automatiquement (frais bancaires,
      // TDS, arrondis de change). Au-delà de 2% → demander qualification.
      // V3-22 : seuils + check extraits dans lettrage.ts (ecartRequiresQualification).
      if (ecartRequiresQualification(ecart, facturesTotal, type_ecart as TypeEcart | undefined)) {
        return NextResponse.json({
          error: 'ecart_requires_qualification',
          message: `Écart de ${ecart.toFixed(2)} MUR entre la transaction (${txAmount.toFixed(2)}) et le total factures (${facturesTotal.toFixed(2)}). Règle R4 : pas de lettrage forcé. Qualifier l'écart avant de relancer.`,
          ecart: Math.round(ecart * 100) / 100,
          ecart_signe: Math.round(ecartSigne * 100) / 100,
          tx_amount: txAmount,
          factures_total: facturesTotal,
          options: [
            { type_ecart: 'change', label: 'Écart de change', compte: ecartSigne > 0 ? '766 (gain)' : '666 (perte)' },
            { type_ecart: 'escompte', label: 'Escompte', compte: ecartSigne > 0 ? '765 (escompte obtenu)' : '665 (escompte accordé)' },
            { type_ecart: 'penalite', label: 'Pénalité de retard', compte: '631' },
            { type_ecart: 'exceptionnel', label: 'Écart exceptionnel', compte: ecartSigne > 0 ? '758' : '658' },
            { type_ecart: 'a_regulariser', label: 'Forcer — à régulariser plus tard', compte: '471 (Comptes d\'attente)' },
          ],
        }, { status: 409 })
      }

      const lettreCode = `RM${String(Date.now()).slice(-4)}`
      const reconcileDate = new Date().toISOString()

      // Marquer toutes les factures comme payées WITH reconciliation link
      for (const fId of facture_ids) {
        await supabase.from('factures').update({
          statut: 'paye',
          rapproche_releve_id: releve_id,
          rapproche_transaction_idx: txIdx,
          rapproche_date: reconcileDate,
          rapproche_source: 'manual',
        }).eq('id', fId)
      }

      // Mettre à jour la transaction avec toutes les facture_ids
      const prevTxMulti = { ...tx }
      txs[txIdx] = {
        ...tx,
        facture_ids: facture_ids,
        facture_id: facture_ids[0],
        lettre: lettreCode,
        statut: 'rapproche',
        rapprochement_multi: true,
        nb_factures: facture_ids.length,
        ecart_montant: Math.round(ecart * 100) / 100,
        rapproche_at: reconcileDate,
      }
      await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)

      // ⚠️ FIX (2026-05-03) — Génération des écritures BNQ.
      // Avant ce fix, lettrer_multi ne créait QUE les marquages
      // (facture.statut='paye', tx.statut='rapproche') mais PAS les écritures
      // BNQ qui soldent les comptes tiers. Conséquence :
      //   • 411/401 restait débiteur/créditeur après le rapprochement
      //   • La balance comptable ne reflétait pas le règlement
      //   • Le user voyait l'incohérence dans "l'espace banque" et essayait
      //     de re-classifier la tx → CRÉAIT LES ÉCRITURES BNQ EN DOUBLE
      //     via classer_transaction
      //
      // Maintenant on appelle createEcrituresForPayment EXACTEMENT comme
      // auto_rapprocher le fait (ligne 994) → cohérence parfaite.
      // Prorata par facture sur le montant_mur de chaque facture (les
      // factures peuvent être dans des devises différentes, mais
      // montant_mur est déjà converti).
      try {
        // Résoudre le compte_comptable de la banque (ex: 512100, 512200)
        const { data: releveBanque } = await supabase
          .from('releves_bancaires')
          .select('compte_bancaire_id')
          .eq('id', releve_id)
          .single()
        let compteBanque = '512'
        if (releveBanque?.compte_bancaire_id) {
          const { data: cb } = await supabase
            .from('comptes_bancaires')
            .select('compte_comptable, devise')
            .eq('id', releveBanque.compte_bancaire_id)
            .maybeSingle()
          if (cb?.compte_comptable) compteBanque = String(cb.compte_comptable)
        }

        const factureRows = facturesData || []
        // Type unique : tous les factures ont le même type_facture (mix interdit
        // par l'UI). On déduit du premier élément.
        const firstType = factureRows[0]?.type_facture as string | undefined
        const payType: 'supplier' | 'client' =
          firstType === 'fournisseur' ? 'supplier' : 'client'
        const datePayment = (tx as any).date || new Date().toISOString().split('T')[0]
        const txLibelle = (tx as any).libelle || ''
        const txDevise = (tx as any).devise || null

        for (const fac of factureRows) {
          const amount_mur = Number((fac as any).montant_mur) || Number(fac.montant_ttc) || 0
          if (amount_mur <= 0) continue
          const tiers = String(fac.tiers || '').trim()
          const { error: payErr } = await createEcrituresForPayment(supabase, {
            societe_id: societe_id as string,
            date_payment: datePayment,
            amount_mur,
            type: payType,
            tiers,
            ref_folio: `BANK-${releve_id}-${txIdx}-${fac.id}`,
            description: `Règlement ${fac.numero_facture || ''} — ${tiers}`.trim(),
            compte_banque: compteBanque,
            facture_id: fac.id,
            lettre_code: lettreCode,
            numero_piece: txLibelle,
            devise_origine: txDevise,
          })
          if (payErr) {
            console.warn(`[lettrer_multi] BNQ insert failed for facture ${fac.id}:`, payErr)
          }
        }
      } catch (bnqErr: any) {
        console.warn('[lettrer_multi] BNQ generation failed (non-blocking):', bnqErr?.message)
      }

      // Audit log (best-effort)
      try {
        await supabase.from('rapprochement_audit_log').insert({
          societe_id: societe_id || null,
          action: 'lettrer_multi',
          releve_id,
          transaction_idx: txIdx,
          facture_ids,
          lettre_code: lettreCode,
          montant: txAmount,
          devise: prevTxMulti.devise || null,
          reason: `Lettrage multi-facture (${facture_ids.length} factures, écart ${ecart.toFixed(2)})`,
          before_state: prevTxMulti,
          after_state: txs[txIdx],
          user_id: user.id,
          user_email: user.email || null,
        })
      } catch (auditErr) {
        console.warn('[audit] lettrer_multi log failed:', auditErr)
      }

      // FIX 6 — Écriture d'écart selon type_ecart + règle R7 (pas de
      // lettre sur 6xxx/7xxx) : l'écart ne reçoit JAMAIS la lettre des
      // factures principales. Seul le bloc ACH/BNQ des factures est
      // lettré — l'écart est une ligne OD à part, consultable en
      // analyse financière mais pas mélangée avec le lettrage.
      if (ecart > 0.01) {
        const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
        if (dossier) {
          // Choix du compte selon type_ecart + sens (tx > factures → produit/crédit,
          // tx < factures → charge/débit).
          // ecartSigne > 0 = on a reçu/payé PLUS — gain pour la société si créance, perte si dette.
          // Ici on raisonne "bank moins facture" donc :
          //   - ecartSigne > 0 ⇒ on a encaissé plus que la facture (gain) ou payé plus (perte côté fournisseur)
          // La catégorisation finale est pilotée par type_ecart.
          // V3-22 : compute extrait dans lettrage.ts (computeEcartCompte) —
          // gère aussi le sens débit/crédit selon classe du compte (R7).
          const ecartOd = computeEcartCompte(
            ecart,
            ecartSigne,
            lettreCode,
            type_ecart as TypeEcart | undefined,
          )
          await supabase.from('ecritures_comptables_v2').insert({
            societe_id,
            dossier_id: dossier.id,
            date_ecriture: new Date().toISOString().split('T')[0],
            journal: 'OD',
            numero_compte: ecartOd.compte,
            libelle: ecartOd.libelle,
            debit_mur: ecartOd.debit,
            credit_mur: ecartOd.credit,
            // Règle R7 : pas de lettrage sur 6xxx/7xxx. Sur 471 (4xxx) le
            // lettrage est autorisé mais on l'omet ici — la régularisation
            // future créera l'écriture miroir et lettrera les deux à ce
            // moment-là.
          })
        }
      }

      return NextResponse.json({
        success: true, lettre: lettreCode,
        nb_factures: facture_ids.length,
        montant_transaction: txAmount,
        total_factures: facturesTotal,
        ecart: Math.round(ecart * 100) / 100,
      })
    }

    // === GENERATE ECRITURES BNQ for existing matched transactions ===
    if (action === 'generate_ecritures') {
      const { societe_id: socId } = body
      if (!socId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', socId).limit(1).maybeSingle()
      if (!dossier) return NextResponse.json({ error: 'Aucun dossier pour cette société' }, { status: 404 })

      const { data: releves } = await supabase.from('releves_bancaires').select('id, compte_bancaire_id, transactions_json').eq('societe_id', socId).is('superseded_by_id', null)
      const { data: comptesBanc } = await supabase.from('comptes_bancaires').select('id, devise').eq('societe_id', socId)
      const deviseMap: Record<string, string> = {}
      ;(comptesBanc || []).forEach((c: any) => { deviseMap[c.id] = c.devise || 'MUR' })

      const ratesLiveGen = await getTauxChange()

      let created = 0

      for (const releve of releves || []) {
        const txs: any[] = releve.transactions_json || []
        const releveDevise = deviseMap[releve.compte_bancaire_id] || 'MUR'

        for (const tx of txs) {
          const txDebit = Number(tx.debit) || 0
          const txCredit = Number(tx.credit) || 0
          const txAmount = txDebit > 0 ? txDebit : txCredit
          if (txAmount === 0) continue
          const txDate = tx.date || new Date().toISOString().split('T')[0]
          // Migration 171/172 — taux HISTORIQUE par (date, devise).
          const effectiveDeviseGen = (tx.devise || releveDevise || 'MUR').toUpperCase()
          const genOutcome = await resolveHistoricalRateSafe(
            supabase, txDate, effectiveDeviseGen, ratesLiveGen,
          )
          const effectiveRateGen = genOutcome.rate != null
            ? genOutcome.rate
            : (effectiveDeviseGen === 'MUR' ? 1 : (ratesLiveGen[effectiveDeviseGen] || 1))
          const txAmountMUR = Math.round(
            (effectiveDeviseGen === 'MUR' ? txAmount : txAmount * effectiveRateGen) * 100,
          ) / 100

          // --- Internal transfers → 581 both sides ---
          if (tx.statut === 'interne' || tx.matched_type === 'transfert_interne') {
            const { data: existing581 } = await supabase.from('ecritures_comptables_v2')
              .select('id').eq('dossier_id', dossier.id).eq('journal', 'BNQ')
              .eq('compte', '581').eq('date_ecriture', txDate)
              .or(`debit.eq.${txAmountMUR},credit.eq.${txAmountMUR}`)
              .limit(1)
            if (existing581 && existing581.length > 0) continue

            const lettre581 = `VI${String(created + 1).padStart(3, '0')}`
            const isOutgoing = txDebit > 0
            const libelle = `Virement interne ${(tx.libelle || '').substring(0, 30)}`

            // Sprint 2 — anti-doublon BNQ via safeInsertBnq (table v1 view).
            const insTransit = await safeInsertBnq(supabase, [
              { dossier_id: dossier.id, date_ecriture: txDate, journal: 'BNQ', numero_compte: '512',
                libelle, debit_mur: isOutgoing ? 0 : txAmountMUR, credit_mur: isOutgoing ? txAmountMUR : 0, lettre: lettre581 },
              { dossier_id: dossier.id, date_ecriture: txDate, journal: 'BNQ', numero_compte: '581',
                libelle, debit_mur: isOutgoing ? txAmountMUR : 0, credit_mur: isOutgoing ? 0 : txAmountMUR, lettre: lettre581 },
            ], 'ecritures_comptables_v2')
            if (insTransit.skipped > 0) console.warn(`[auto_rapprocher transit BNQ] skipped:`, insTransit.skipReasons)
            created++
            continue
          }

          // --- Regular matched transactions ---
          if (tx.statut !== 'rapproche' || !tx.facture_id) continue

          // Check if BNQ écriture already exists
          const { data: existing } = await supabase.from('ecritures_comptables_v2')
            .select('id').eq('dossier_id', dossier.id).eq('journal', 'BNQ')
            .eq('date_ecriture', txDate)
            .or(`debit.eq.${txAmountMUR},credit.eq.${txAmountMUR}`)
            .limit(1)
          if (existing && existing.length > 0) continue

          // Get facture details
          const { data: facture } = await supabase.from('factures')
            .select('numero_facture, tiers, type_facture, montant_mur')
            .eq('id', tx.facture_id).maybeSingle()
          if (!facture) continue

          const lettre = tx.lettre || `BNQ${String(created + 1).padStart(3, '0')}`
          const compte401 = facture.type_facture === 'fournisseur' ? '401' : '411'
          const isPayment = txDebit > 0 // debit = payment out

          // Sprint 2 — anti-doublon BNQ via safeInsertBnq.
          const insRegular = await safeInsertBnq(supabase, [
            { dossier_id: dossier.id, date_ecriture: txDate, journal: 'BNQ', numero_compte: compte401,
              libelle: `Paiement ${(facture.tiers || '').substring(0, 30)} — ${facture.numero_facture || ''}`,
              debit_mur: isPayment ? txAmountMUR : 0, credit_mur: isPayment ? 0 : txAmountMUR, lettre },
            { dossier_id: dossier.id, date_ecriture: txDate, journal: 'BNQ', numero_compte: '512',
              libelle: `Virement ${(facture.tiers || '').substring(0, 30)}`,
              debit_mur: isPayment ? 0 : txAmountMUR, credit_mur: isPayment ? txAmountMUR : 0, lettre },
          ], 'ecritures_comptables_v2')
          if (insRegular.skipped > 0) console.warn(`[auto_rapprocher regular BNQ] skipped:`, insRegular.skipReasons)

          // Letter existing 401/411 facture entry with same code
          const factureMUR = Math.round(Number(facture.montant_mur || 0) * 100) / 100
          if (factureMUR > 0) {
            await supabase.from('ecritures_comptables_v2')
              .update({ lettre })
              .eq('dossier_id', dossier.id).eq('compte', compte401).is('lettre', null)
              .eq('credit', factureMUR).limit(1)
          }

          created++
        }
      }

      return NextResponse.json({ success: true, created })
    }

    // === AUTO-LETTRAGE: use BNQ lettre codes to letter ACH entries ===
    if (action === 'auto_lettrage_bnq') {
      const { societe_id: socId } = body
      if (!socId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', socId).limit(1).maybeSingle()
      if (!dossier) return NextResponse.json({ error: 'Aucun dossier' }, { status: 404 })

      // Get BNQ entries WITH lettre codes on 401/411
      const { data: bnqEntries } = await supabase
        .from('ecritures_comptables_v2')
        .select('id, compte:numero_compte, debit:debit_mur, credit:credit_mur, lettre, date_ecriture, libelle')
        .eq('dossier_id', dossier.id)
        .eq('journal', 'BNQ')
        .not('lettre', 'is', null)
        .or('compte.like.40%,compte.like.41%')

      let letteredCount = 0

      for (const bnq of bnqEntries || []) {
        const bnqAmount = Number(bnq.debit) > 0 ? Number(bnq.debit) : Number(bnq.credit)
        const isDebit = Number(bnq.debit) > 0
        if (bnqAmount === 0) continue

        // Find ACH entry: same compte, opposite direction, same amount ±2%, no lettre yet
        // V3-22 : recherche + sélection extraites dans lettrage.ts.
        const achEntries = await findAchCandidatesForBnq(supabase, {
          dossierId: dossier.id,
          compte: bnq.compte,
          bnqAmount,
          isDebit,
        })

        if (!achEntries || achEntries.length === 0) continue

        // Pick closest by date
        const closest = selectClosestByDate(achEntries, new Date(bnq.date_ecriture || ''))
        if (!closest) continue

        // Apply same lettre to ACH entry
        await supabase.from('ecritures_comptables_v2')
          .update({ lettre: bnq.lettre, date_lettrage: new Date().toISOString().split('T')[0] })
          .eq('id', closest.id)

        letteredCount++
      }

      return NextResponse.json({ success: true, lettered: letteredCount })
    }

    // === SYNC LETTRAGE — Tout synchroniser automatiquement ====================
    //
    // For each facture marked statut='paye' in this société:
    //   1. Find its ACH/VTE ecriture (by facture_id — migration 133 — or by
    //      numero_piece = numero_facture as a fallback).
    //   2. Find the BNQ counterpart. If absent AND the facture carries a
    //      rapproche_date, CREATE a compensating BNQ ecriture using the
    //      montant_mur and the dossier's dedicated banque (512).
    //   3. Letter the ACH and BNQ entries together with a fresh R### code
    //      (next auto-number). Skip pairs already lettered.
    //
    // This replaces what an accountant would do by hand at month end to
    // close the loop between factures.paye and the ledger. Idempotent:
    // rows already lettered are skipped.
    // ========================================================================
    if (action === 'sync_lettrage') {
      const { societe_id: socId, mois: moisFilter } = body
      if (!socId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      console.warn(`[sync_lettrage] start societe=${socId} mois_filter=${moisFilter || 'all'}`)

      const { data: dossierRow } = await supabase
        .from('dossiers').select('id').eq('societe_id', socId).limit(1).maybeSingle()
      if (!dossierRow) {
        console.warn(`[sync_lettrage] no dossier for societe=${socId}`)
        return NextResponse.json({ error: 'Aucun dossier pour cette société' }, { status: 404 })
      }
      const dossierId = dossierRow.id

      // Fetch paid factures for this société.
      // FIX 7 — on récupère aussi type_document et facture_origine_id pour
      // pouvoir grouper un avoir avec sa facture d'origine dans le même
      // lettrage.
      let facturesQuery = supabase
        .from('factures')
        .select('id, numero_facture, montant_ht, montant_tva, montant_ttc, montant_mur, devise, taux_change, date_facture, date_echeance, rapproche_date, rapproche_releve_id, rapproche_transaction_idx, tiers, type_facture, type_document, facture_origine_id')
        .eq('societe_id', socId)
        .eq('statut', 'paye')
      // Filtre optionnel sur le mois (pour sync_lettrage scope mensuel)
      if (moisFilter && /^\d{4}-\d{2}$/.test(moisFilter)) {
        const [yy, mm] = moisFilter.split('-').map(Number)
        const startOfMonth = `${yy}-${String(mm).padStart(2, '0')}-01`
        const lastDay = new Date(yy, mm, 0).getDate()
        const endOfMonth = `${yy}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        facturesQuery = facturesQuery.gte('date_facture', startOfMonth).lte('date_facture', endOfMonth)
      }
      const { data: paidFactures, error: facturesErr } = await facturesQuery
      if (facturesErr) {
        console.error(`[sync_lettrage] factures fetch failed:`, facturesErr.message)
        return NextResponse.json({ error: `factures: ${facturesErr.message}` }, { status: 500 })
      }
      console.warn(`[sync_lettrage] ${(paidFactures || []).length} paid facture(s) found`)

      // FIX 2 — Charger comptes bancaires + relevés pour router la 2e
      // ligne BNQ sur le bon 512xxx. Map : releve_id → compte_comptable.
      // Fallback par devise si le facture n'a pas de rapproche_releve_id
      // (factures historiques antérieures au tracking).
      const { data: cbRows } = await supabase
        .from('comptes_bancaires')
        .select('id, devise, compte_comptable')
        .eq('societe_id', socId)
      const { data: releveRows } = await supabase
        .from('releves_bancaires')
        .select('id, compte_bancaire_id')
        .eq('societe_id', socId)
      const cbByDevise = new Map<string, string>()
      const cbById = new Map<string, string>()
      ;(cbRows || []).forEach((c: any) => {
        if (c.compte_comptable) {
          cbById.set(c.id, String(c.compte_comptable))
          if (!cbByDevise.has(c.devise || 'MUR')) {
            cbByDevise.set(c.devise || 'MUR', String(c.compte_comptable))
          }
        }
      })
      const releveToCbId = new Map<string, string>()
      ;(releveRows || []).forEach((r: any) => releveToCbId.set(r.id, r.compte_bancaire_id))
      const resolveCompteBanque = (facture: any): string => {
        // Priorité 1 : via rapproche_releve_id → cb → compte_comptable
        if (facture.rapproche_releve_id) {
          const cbId = releveToCbId.get(facture.rapproche_releve_id)
          if (cbId && cbById.has(cbId)) return cbById.get(cbId)!
        }
        // Priorité 2 : premier 512xxx de la société de la bonne devise
        const byDev = cbByDevise.get(String(facture.devise || 'MUR').toUpperCase())
        if (byDev) return byDev
        // Priorité 3 : n'importe quel 512xxx configuré
        const first = cbRows?.find((c: any) => c.compte_comptable)?.compte_comptable
        return first ? String(first) : '512'
      }

      // Probe whether the facture_id column exists on the view (migration 133).
      // If it's missing in this environment, we skip the by-facture_id lookup
      // and rely solely on numero_piece matching — the operator can still
      // reconcile manually until the migration is applied.
      let hasFactureIdColumn = true
      {
        const probe = await supabase.from('ecritures_comptables_v2').select('facture_id').limit(1)
        if (probe.error) {
          const msg = String(probe.error.message || '')
          if (/facture_id/i.test(msg) && /(does not exist|column)/i.test(msg)) {
            hasFactureIdColumn = false
            console.warn('[sync_lettrage] facture_id column missing — migration 133 not applied yet, falling back to numero_piece matching only')
          } else {
            console.error('[sync_lettrage] probe failed:', probe.error.message)
          }
        }
      }

      let pairsLettered = 0
      let pairsCreatedBnq = 0
      let alreadyLettered = 0
      const errors: Array<{ facture_id: string; reason: string }> = []

      // Find the highest existing "R###" code so we generate non-colliding ones.
      const { data: existingLettres } = await supabase
        .from('ecritures_comptables_v2')
        .select('lettre')
        .eq('dossier_id', dossierId)
        .not('lettre', 'is', null)
        .ilike('lettre', 'R%')
      let maxR = 0
      for (const r of existingLettres || []) {
        const m = String((r as any).lettre || '').match(/^R(\d+)$/i)
        if (m) maxR = Math.max(maxR, parseInt(m[1], 10))
      }
      const nextCode = (): string => {
        maxR += 1
        return `R${String(maxR).padStart(3, '0')}`
      }

      for (const f of paidFactures || []) {
        try {
          // 1. Find ACH/VTE ecriture — by facture_id first, fallback to numero_piece.
          let achRow: any = null
          {
            const { data } = await supabase.from('ecritures_comptables_v2')
              .select('id, compte:numero_compte, debit:debit_mur, credit:credit_mur, date_ecriture, libelle, lettre')
              .eq('dossier_id', dossierId).eq('facture_id', f.id)
              .or('compte.like.401%,compte.like.411%')
              .limit(1).maybeSingle()
            if (data) achRow = data
          }
          if (!achRow && f.numero_facture) {
            const { data } = await supabase.from('ecritures_comptables_v2')
              .select('id, compte:numero_compte, debit:debit_mur, credit:credit_mur, date_ecriture, libelle, lettre')
              .eq('dossier_id', dossierId)
              .eq('numero_piece', f.numero_facture)
              .or('compte.like.401%,compte.like.411%')
              .limit(1).maybeSingle()
            if (data) achRow = data
          }
          // FIX 3 — Si aucune ACH/VTE n'existe pour cette facture, on la
          // recrée à la volée (10 cas observés en prod : Baydon Murray,
          // E-Payroll, Jean Daril, Emtel). createEcrituresForFacture gère
          // déjà la ventilation complète (607/4456/401 pour fournisseur,
          // 411/706/4457 pour client). Ensuite on re-query pour récupérer
          // la nouvelle ACH et poursuivre le flux normal.
          if (!achRow) {
            const minimumOk = !!f.date_facture && Number(f.montant_ttc) > 0
            if (!minimumOk) {
              errors.push({ facture_id: f.id, reason: 'Aucune écriture ACH/VTE trouvée ET infos facture insuffisantes pour la recréer' })
              continue
            }
            const gen = await createEcrituresForFacture(supabase, {
              id: f.id,
              societe_id: socId,
              numero_facture: f.numero_facture || '',
              tiers: f.tiers || '',
              date_facture: f.date_facture,
              montant_ht: Number(f.montant_ht) || 0,
              montant_tva: Number(f.montant_tva) || 0,
              montant_ttc: Number(f.montant_ttc) || 0,
              type_facture: (f.type_facture === 'client' ? 'client' : 'fournisseur'),
              devise: f.devise || 'MUR',
              taux_change: Number(f.taux_change) || 1,
              montant_mur: Number(f.montant_mur) || undefined,
            })
            if (!gen.ok) {
              errors.push({ facture_id: f.id, reason: `ACH/VTE absente et recréation échouée : ${gen.error || 'inconnue'}` })
              continue
            }
            console.warn(`[sync_lettrage] ACH/VTE recréée pour facture ${f.id} (${f.numero_facture}) — ${gen.nb_entries} lignes`)
            // Re-query the ACH row that was just inserted.
            const { data: reAch } = await supabase.from('ecritures_comptables_v2')
              .select('id, compte:numero_compte, debit:debit_mur, credit:credit_mur, date_ecriture, libelle, lettre')
              .eq('dossier_id', dossierId)
              .eq('facture_id', f.id)
              .or('compte.like.401%,compte.like.411%')
              .limit(1).maybeSingle()
            if (reAch) {
              achRow = reAch
            } else {
              // Fallback lookup via numero_piece
              const { data: reAch2 } = await supabase.from('ecritures_comptables_v2')
                .select('id, compte:numero_compte, debit:debit_mur, credit:credit_mur, date_ecriture, libelle, lettre')
                .eq('dossier_id', dossierId)
                .eq('numero_piece', f.numero_facture || '')
                .or('compte.like.401%,compte.like.411%')
                .limit(1).maybeSingle()
              if (reAch2) achRow = reAch2
            }
            if (!achRow) {
              errors.push({ facture_id: f.id, reason: 'ACH/VTE recréée mais re-requête vide — incohérence société/dossier ?' })
              continue
            }
          }

          // FIX 2 — Garde PCG : on refuse de lettrer si le compte ACH n'est pas
          // dans la liste blanche LETTRABLE (401/411/...). En pratique les
          // factures écrivent toujours sur 401 ou 411, mais un back-fill
          // incorrect pourrait avoir pointé sur 627 (frais bancaires), 444
          // (TVA due), ou un compte 6xxx/7xxx — auquel cas le lettrage est
          // interdit par la règle R7 (pas de lettre sur résultat).
          const achClass = accountClass(achRow.compte)
          if (achClass !== 'lettrable') {
            errors.push({
              facture_id: f.id,
              reason: `Compte ACH ${achRow.compte} non lettrable (classe: ${achClass}). SKIP par règle PCG/R7.`,
            })
            continue
          }

          // 2. Find BNQ counterpart on the 401/411 account, opposite direction,
          //    same amount ±2%, no lettre yet, and (if possible) already linked
          //    to this facture.
          const achDebit = Number(achRow.debit) || 0
          const achCredit = Number(achRow.credit) || 0
          const montant = Math.max(achDebit, achCredit)
          if (montant <= 0) {
            errors.push({ facture_id: f.id, reason: 'Montant ACH = 0' })
            continue
          }
          const minAmt = Math.round(montant * 0.98 * 100) / 100
          const maxAmt = Math.round(montant * 1.02 * 100) / 100
          const bnqOppositeCol = achDebit > 0 ? 'credit' : 'debit'

          let bnqRow: any = null
          // Primary lookup: BNQ journal, same 401/411 account, opposite direction.
          {
            const { data } = await supabase.from('ecritures_comptables_v2')
              .select('id, lettre, debit:debit_mur, credit:credit_mur, date_ecriture, libelle, facture_id')
              .eq('dossier_id', dossierId)
              .eq('journal', 'BNQ')
              .eq('compte', achRow.compte)
              .gte(bnqOppositeCol, minAmt)
              .lte(bnqOppositeCol, maxAmt)
              .order('date_ecriture', { ascending: false })
              .limit(5)
            // Prefer entries already linked to this facture_id.
            // Anti-doublon : si aucune entrée liée/non-lettrée, on réutilise quand
            // même la première entrée qui matche (montant, compte, direction, date).
            // Sans ce fallback, sync_lettrage créait un doublon quand createEcrituresForPayment
            // avait déjà créé l'entrée avec un lettre_code mais sans facture_id (cas backfill).
            const linked = (data || []).find((e: any) => e.facture_id === f.id)
            const unletteredAny = (data || []).find((e: any) => !e.lettre)
            const anyMatch = (data || [])[0] || null
            bnqRow = linked || unletteredAny || anyMatch
          }

          // 3. If no BNQ counterpart exists, create TWO balanced BNQ
          //    entries (tier side + banque side) so Σdébit = Σcrédit.
          // FIX 2 — auparavant sync_lettrage n'insérait qu'une ligne 401
          // débit sans contrepartie 512 : le journal BNQ n'était pas
          // équilibré (R1 violée) et le compte 512xxx ne reflétait pas
          // le paiement. On insère maintenant les deux lignes ensemble,
          // on les lettre avec le même code, et on lettre aussi l'ACH.
          // FIX 1 — never block on a missing rapproche_date. Fallback to
          //    date_echeance, then date_facture, then today, and back-fill
          //    factures.rapproche_date so the invariant holds going forward.
          let bnqBanqueRow: any = null
          if (!bnqRow && montant > 0) {
            const payDate: string =
              (f as any).rapproche_date
              || (f as any).date_echeance
              || (f as any).date_facture
              || new Date().toISOString().split('T')[0]
            const montantMur = Number(f.montant_mur) || montant
            const compteBanque = resolveCompteBanque(f)
            const isSupplier = achCredit > 0 // ACH 401 credit → supplier
            const libelleBase = `Règlement ${f.numero_facture || ''} — ${(f.tiers || '').substring(0, 40)}`.trim()

            // Migration 171/172 — taux HISTORIQUE à payDate (fallback au
            // taux stocké sur la facture si absent : meilleure source de
            // vérité pour un paiement reconstruit).
            const factureDevise = (f.devise || 'MUR').toUpperCase()
            const factureTauxStored = Number((f as any).taux_change) > 0
              ? Number((f as any).taux_change)
              : null
            let historicalRateSync: number
            if (factureDevise === 'MUR') {
              historicalRateSync = 1
            } else {
              const outc = await resolveHistoricalRateSafe(supabase, payDate, factureDevise)
              historicalRateSync = outc.rate != null
                ? outc.rate
                : (factureTauxStored ?? 1)
              if (outc.rate == null) {
                console.warn(
                  `[sync_lettrage] no historical rate ${factureDevise}@${payDate}, fallback facture.taux_change=${factureTauxStored}`,
                )
              }
            }
            const montantOrigineSync = factureDevise === 'MUR'
              ? null
              : Math.round((montantMur / historicalRateSync) * 100) / 100
            const freezeSync = bnqFreezeColumns(factureDevise, montantOrigineSync, historicalRateSync)

            const tierSide = {
              dossier_id: dossierId,
              date_ecriture: payDate,
              journal: 'BNQ',
              numero_piece: f.numero_facture || null,
              compte: achRow.compte, // 401 ou 411
              libelle: libelleBase,
              debit: isSupplier ? montantMur : 0,
              credit: isSupplier ? 0 : montantMur,
              piece_justificative: f.id,
              facture_id: f.id,
              // NB : safeInsertBnq préserve les extras via EcritureCandidate
              // [key: string]: any. Quand table='ecritures_comptables' (v1),
              // la vue rejette les colonnes inconnues — on insère donc via v2
              // directement plus bas.
              ...freezeSync,
            }
            const bankSide = {
              dossier_id: dossierId,
              date_ecriture: payDate,
              journal: 'BNQ',
              numero_piece: f.numero_facture || null,
              compte: compteBanque,
              libelle: libelleBase,
              debit: isSupplier ? 0 : montantMur,
              credit: isSupplier ? montantMur : 0,
              piece_justificative: f.id,
              facture_id: f.id,
              ...freezeSync,
            }
            // Sprint 2 — anti-doublon BNQ : si sync_lettrage retourne 2x
            // sur la même facture, on ne crée pas 2 paires d'écritures.
            // On insère via v2 (pas via la view v1) pour que les 3 colonnes
            // de la migration 172 soient effectivement persistées (le trigger
            // INSTEAD OF INSERT de la vue v1 ne les propage pas).
            const toV2 = (e: any, societeId: string) => ({
              societe_id: societeId,
              dossier_id: e.dossier_id ?? null,
              date_ecriture: e.date_ecriture,
              journal: e.journal,
              numero_piece: e.numero_piece ?? null,
              ref_folio: e.piece_justificative ?? null,
              numero_compte: e.compte,
              libelle: e.libelle,
              debit_mur: Number(e.debit) || 0,
              credit_mur: Number(e.credit) || 0,
              facture_id: e.facture_id ?? null,
              devise_origine: e.devise_origine ?? null,
              montant_origine: e.montant_origine ?? null,
              taux_change_applique: e.taux_change_applique ?? null,
            })
            const insSync = await safeInsertBnq(
              supabase,
              [toV2(tierSide, socId), toV2(bankSide, socId)] as any,
              'ecritures_comptables_v2',
            )
            if (insSync.error) {
              errors.push({ facture_id: f.id, reason: `BNQ insert failed: ${(insSync.error as any).message || insSync.error}` })
              continue
            }
            if (insSync.skipped > 0) console.warn(`[sync_lettrage BNQ] skipped:`, insSync.skipReasons)
            const createdRows = insSync.data || []
            // v2 expose numero_compte (pas compte) — on couvre les 2 noms.
            const createdTier = createdRows.find((r: any) =>
              (r.compte ?? r.numero_compte) === achRow.compte,
            ) || createdRows[0]
            const createdBank = createdRows.find((r: any) =>
              (r.compte ?? r.numero_compte) === compteBanque,
            ) || createdRows[1]
            bnqRow = createdTier
            bnqBanqueRow = createdBank
            pairsCreatedBnq++

            // Back-fill factures.rapproche_date if it was missing so the
            // invariant "paye ⇒ rapproche_date not null" is enforced.
            if (!(f as any).rapproche_date) {
              await supabase.from('factures')
                .update({ rapproche_date: payDate })
                .eq('id', f.id)
                .is('rapproche_date', null)
            }
          }

          if (!bnqRow) {
            errors.push({ facture_id: f.id, reason: 'Aucune écriture BNQ trouvée ou créée (montant = 0 ?)' })
            continue
          }

          // 4. Letter the triplet (ACH + BNQ tier + BNQ banque si créée).
          // FIX 2 — le bank side de la BNQ est inclus dans le groupe
          // pour que le rapprochement 512 ↔ 401 soit explicite.
          if (achRow.lettre && bnqRow.lettre && achRow.lettre === bnqRow.lettre) {
            alreadyLettered++
            continue
          }
          const code = achRow.lettre || bnqRow.lettre || nextCode()
          const now = new Date().toISOString().slice(0, 10)
          const lettrageIds: string[] = [achRow.id, bnqRow.id]
          if (bnqBanqueRow?.id) lettrageIds.push(bnqBanqueRow.id)

          await supabase.from('ecritures_comptables_v2')
            .update({ lettre: code, date_lettrage: now })
            .in('id', lettrageIds)
            .is('lettre', null)
          // If one was already lettered, ensure all share the code.
          await supabase.from('ecritures_comptables_v2')
            .update({ lettre: code, date_lettrage: now })
            .in('id', lettrageIds)
            .neq('lettre', code)
          // Backfill facture_id on the BNQ if it wasn't set.
          await supabase.from('ecritures_comptables_v2')
            .update({ facture_id: f.id })
            .eq('id', bnqRow.id)
            .is('facture_id', null)

          // FIX 7 — Rattacher les avoirs au même groupe de lettrage.
          // Si la facture courante est une facture (pas un avoir) avec
          // des avoirs liés, on récupère leurs écritures 401/411 et on
          // leur applique la même lettre. Inversement si on traite un
          // avoir, on inclut ses écritures dans le groupe.
          try {
            const isAvoir = (f as any).type_document === 'avoir'
            const avoirLinks: string[] = []
            if (isAvoir && (f as any).facture_origine_id) {
              avoirLinks.push((f as any).facture_origine_id)
            } else if (!isAvoir && hasFactureIdColumn) {
              const { data: avoirs } = await supabase
                .from('factures')
                .select('id')
                .eq('facture_origine_id', f.id)
                .eq('type_document', 'avoir')
              for (const a of avoirs || []) avoirLinks.push((a as any).id)
            }
            if (avoirLinks.length > 0 && hasFactureIdColumn) {
              // Lettrer toutes les écritures 401/411 liées aux factures du groupe
              await supabase.from('ecritures_comptables_v2')
                .update({ lettre: code, date_lettrage: now })
                .in('facture_id', avoirLinks)
                .or('compte.like.401%,compte.like.411%')
                .is('lettre', null)
            }
          } catch (linkErr) {
            console.warn('[sync_lettrage] avoir link step failed for facture', f.id, linkErr)
          }

          pairsLettered++
        } catch (err: any) {
          errors.push({ facture_id: f.id, reason: err?.message || 'unknown error' })
        }
      }

      return NextResponse.json({
        success: true,
        pairs_lettered: pairsLettered,
        bnq_created: pairsCreatedBnq,
        already_lettered: alreadyLettered,
        errors,
        summary: `${pairsLettered} paire(s) lettrée(s)${pairsCreatedBnq > 0 ? ` · ${pairsCreatedBnq} écriture(s) BNQ créée(s)` : ''}${alreadyLettered > 0 ? ` · ${alreadyLettered} déjà synchronisée(s)` : ''}`,
      })
    }

    // ─────────────────────────────────────────────────────────────────────
    // V3-23 batch 3 — Dispatcher post-processing.
    //
    // Les ~1600 lignes d'actions ci-dessous (lettrer_ecritures, paye_par_associe,
    // compensation, paiement_employe, marquer_paye, classer_transaction,
    // cloturer_mois, rembourser_employe, annuler_paiement_factures) ont été
    // extraites dans `@/lib/accounting/rapprochement/post-processing.ts`.
    //
    // Chaque handler reçoit les dépendances (supabase admin, user, body) ainsi
    // que les 3 helpers conservés ici (bnqFreezeColumns, resolveHistoricalRateSafe,
    // creerMiroirInterSociete) pour préserver la sémantique 1:1 et éviter une
    // dépendance circulaire avec lib/comptable/inter-societes.
    // ─────────────────────────────────────────────────────────────────────
    const deps = {
      supabase,
      user,
      body,
      bnqFreezeColumns,
      resolveHistoricalRateSafe,
      creerMiroirInterSociete,
    }

    if (action === 'lettrer_ecritures') return handleLettrerEcritures(deps)
    if (action === 'paye_par_associe') return handlePayeParAssocie(deps)
    if (action === 'compensation') return handleCompensation(deps)
    if (action === 'paiement_employe') return handlePaiementEmploye(deps)
    if (action === 'marquer_paye') return handleMarquerPaye(deps)
    if (action === 'classer_transaction') return handleClasserTransaction(deps)
    if (action === 'cloturer_mois') return handleCloturerMois(deps)
    if (action === 'rembourser_employe') return handleRembourserEmploye(deps)
    if (action === 'annuler_paiement_factures') return handleAnnulerPaiementFactures(deps)

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack?.split('\n').slice(0, 5).join('\n') : ''
    console.error('[rapprochement POST] CRASH:', msg, stack)
    return NextResponse.json({
      error: msg,
      stack_preview: stack,
      _phase: 'uncaught',
    }, { status: 500 })
  }
}
