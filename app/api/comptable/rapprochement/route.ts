import { NextResponse } from 'next/server'
import { createEcrituresForPayment } from '@/lib/accounting/ecritures-factures'
import { analyzeAllTransactions, MatchingTransaction, MatchingFacture } from '@/lib/accounting/matching-engine'
import { runIntelligentRapprochement, buildAliasMap } from '@/lib/accounting/intelligent-rapprochement'
import type { SupplierAlias } from '@/lib/accounting/intelligent-rapprochement'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getTauxChange } from '@/lib/taux-change'
import { accountClass } from '@/lib/accounting/classification-rules'
import { validateLettrageGroup } from '@/lib/accounting/accounting-rules'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ── Advanced tiers scoring for Phase 5 (BNQ↔ACH lettrage) ──
function advancedTiersScoreForRoute(a: string, b: string): number {
  const na = (a || '').toLowerCase().replace(/\b(ltd|limited|sarl|sa|co|inc|pvt)\b/gi, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const nb = (b || '').toLowerCase().replace(/\b(ltd|limited|sarl|sa|co|inc|pvt)\b/gi, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const wA = new Set(na.split(' ').filter(w => w.length > 2))
  const wB = new Set(nb.split(' ').filter(w => w.length > 2))
  if (wA.size === 0 || wB.size === 0) return 0
  const inter = [...wA].filter(w => wB.has(w)).length
  return inter / new Set([...wA, ...wB]).size
}

// Normalize tiers name for matching
function normalizeTiers(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\s+(ltd|limited|sarl|sas|sa|co|company|cie|inc)\.?\s*$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

// Word overlap score between two strings
function wordOverlap(a: string, b: string): number {
  const wordsA = normalizeTiers(a).split(/\s+/).filter(w => w.length > 2)
  const wordsB = normalizeTiers(b).split(/\s+/).filter(w => w.length > 2)
  if (wordsA.length === 0 || wordsB.length === 0) return 0
  const overlap = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb))).length
  return overlap / Math.max(wordsA.length, wordsB.length)
}

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

    const supabase = getAdminClient()

    // 1. Rapprochements existants
    const { data: rapprochements } = await supabase
      .from('rapprochements_bancaires').select('*')
      .eq('societe_id', societe_id).order('periode_debut', { ascending: false })

    // 2. Bank transactions from releves
    const { data: releves } = await supabase
      .from('releves_bancaires')
      .select('id, compte_bancaire_id, periode, date_debut, date_fin, transactions_json, solde_ouverture, solde_cloture')
      .eq('societe_id', societe_id).order('date_fin', { ascending: false })

    const { data: comptes } = await supabase
      .from('comptes_bancaires').select('id, banque, devise, numero_compte').eq('societe_id', societe_id)
    const compteMap: Record<string, any> = {}
    ;(comptes || []).forEach(c => { compteMap[c.id] = c })

    const bankTransactions: any[] = []
    ;(releves || []).forEach((r: any) => {
      const compte = compteMap[r.compte_bancaire_id] || {}
      ;(r.transactions_json || []).forEach((tx: any, idx: number) => {
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
        })
      })
    })

    // 3. Factures (table may not exist)
    let factures: any[] = []
    const { data: facturesData, error: facturesErr } = await supabase
      .from('factures').select('*')
      .eq('societe_id', societe_id)
      .in('statut', ['en_attente', 'retard', 'partiel'])
      .order('date_facture', { ascending: false })
    if (!facturesErr) factures = facturesData || []

    // 4. Écritures comptables v1 (pour lettrage)
    const { data: dossiers } = await supabase
      .from('dossiers').select('id').eq('societe_id', societe_id)
    const dossierIds = (dossiers || []).map(d => d.id)

    let ecritures: any[] = []
    if (dossierIds.length > 0) {
      const { data } = await supabase
        .from('ecritures_comptables')
        .select('id, compte, libelle, debit, credit, date_ecriture, journal, lettre, piece_justificative')
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
  } catch (e: unknown) {
    console.error('[rapprochement GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
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
          supabase.from('releves_bancaires').select('id, compte_bancaire_id, transactions_json').eq('societe_id', societe_id),
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

      console.log(`[rapprochement] Parallel load done in ${Date.now() - t0}ms: ${releves.length} releves, ${(facturesData || []).length} factures`)

      if (!releves || releves.length === 0) {
        return NextResponse.json({ matched: 0, total: 0, message: 'Aucun relevé bancaire' })
      }

      const societeNames = (socData || []).flatMap((s: any) => [s.nom, ...(s.aliases || [])]).map((n: string) => (n || '').toLowerCase()).filter(Boolean)
      const dossierIds = (dossiers || []).map((d: any) => d.id)
      let factures: any[] = factErr ? [] : (facturesData || [])

      const toMUR = (amount: number, devise: string): number => {
        if (!devise || devise === 'MUR') return amount
        return amount * (rates[devise.toUpperCase()] || 1)
      }

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
            ? supabase.from('ecritures_comptables').select('id, compte, libelle, debit, credit, date_ecriture, lettre').in('dossier_id', dossierIds).is('lettre', null)
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

      // Pre-classification patterns
      const BANK_FEE_PATTERNS = ['service fee', 'banking subs fee', 'merchant monthly fee', 'payment fee',
        'outward transfer charge', 'tax amount due', 'card repayment', 'merchant discount',
        'merchant settlement', 'e-commerce transaction fee', 'contra entry', 'commission', 'frais']

      let counts = { matched: 0, interne: 0, frais_bancaires: 0, salaire_bulk: 0, mra: 0, salaire_individuel: 0, propose: 0, not_matched: 0, total: 0 }
      const matchesList: any[] = []

      console.log(`[rapprochement] Starting: ${releves.length} releves, ${ecritures.length} ecritures, ${factures.length} factures, loaded in ${Date.now() - t0}ms`)

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
          function isSelfMatch(selfName: string, tiersName: string): boolean {
            const selfWords = selfName.split(/\s+/).filter((w: string) => w.length > 2)
            const tiersWords = tiersName.split(/\s+/).filter((w: string) => w.length > 2)
            if (selfWords.length === 0 || tiersWords.length === 0) return false
            // Chaque mot de self doit être trouvé (ou début de mot) dans tiers
            const matchedSelf = selfWords.filter((sw: string) => tiersWords.some((tw: string) => tw.startsWith(sw.substring(0, 3)) || sw.startsWith(tw.substring(0, 3))))
            if (matchedSelf.length < selfWords.length * 0.7) return false
            // Le tiers ne doit pas avoir beaucoup de mots non-matchés
            const unmatchedTiers = tiersWords.filter((tw: string) => !selfWords.some((sw: string) => tw.startsWith(sw.substring(0, 3)) || sw.startsWith(tw.substring(0, 3))))
            return unmatchedTiers.length === 0 // Aucun mot extra dans le tiers
          }

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
            if (feeEcriture) { ecritures = ecritures.filter(e => e.id !== feeEcriture.id); await supabase.from('ecritures_comptables').update({ lettre: `FEE${i}`, date_lettrage: new Date().toISOString().split('T')[0] }).eq('id', feeEcriture.id) }
            counts.frais_bancaires++; counts.matched++; changed = true; classified = true
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
              await supabase.from('ecritures_comptables').update({ lettre: `MRA${i}`, date_lettrage: new Date().toISOString().split('T')[0] }).eq('id', mraEcriture.id)
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
                devise: releveDevise,
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

        const dateDiffDays = (a: string, b: string): number => {
          const da = new Date(a).getTime(), db = new Date(b).getTime()
          if (isNaN(da) || isNaN(db)) return 999
          return Math.abs(da - db) / (1000 * 60 * 60 * 24)
        }

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
            console.log(`[rapprochement] VI pair ${viCode}: ${a.amount} ${a.isDebit ? '→' : '←'} counterpart on ${match.compteBancaireId}`)
          } else {
            // No counterpart found — mark as waiting
            const entry = releveMap.get(a.releveId)!
            entry.updatedTxs[a.txIdx] = { ...entry.updatedTxs[a.txIdx], statut: 'interne_en_attente', note: 'Virement interne — contrepartie introuvable' }
            entry.changed = true
            console.log(`[rapprochement] VI unpaired: ${a.amount} on ${a.compteBancaireId} ${a.date} — marked interne_en_attente`)
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
            console.log(`[rapprochement] Loaded ${aliasRows.length} supplier aliases`)
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

        console.log(`[rapprochement] Running intelligent engine on ${allTxs.length} unclassified tx, ${engineFactures.length} factures, ${aliasMap.size} aliases`)

        const intelligentResult = runIntelligentRapprochement(allTxs, engineFactures, {
          societeNames,
          selfNames: selfNamesForEngine,
          bulletins: (allBulletins || []).map((b: any) => ({ periode: b.periode, salaire_net: Number(b.salaire_net) || 0 })),
          ecritures: ecritures.map((e: any) => ({ id: e.id, compte: e.compte, debit: Number(e.debit) || 0, credit: Number(e.credit) || 0, libelle: e.libelle || '' })),
          rates,
          aliasMap,
        })

        console.log(`[rapprochement] Intelligent engine results:`, intelligentResult.stats)

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

          if (conf >= 0.60) {
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
            for (const fId of match.factureIds) {
              const { error: updErr } = await supabase.from('factures').update({
                statut: 'paye',
                rapproche_releve_id: releveId,
                rapproche_transaction_idx: txIdx,
                rapproche_date: payDate,
                rapproche_source: 'auto_intelligent',
              }).eq('id', fId)
              if (updErr) {
                console.error(`[rapprochement] Failed to update facture ${fId}:`, updErr.message)
              } else {
                facturesUpdated++
              }
              factures = factures.filter((ff: any) => ff.id !== fId)
            }
            if (facturesUpdated > 0) {
              console.log(`[rapprochement] ${facturesUpdated} facture(s) → paye for ${match.supplierName}`)
            }

            // FIX 1 — Generate BNQ journal entries + lettrer ACH/BNQ ensemble.
            // On émet un jeu d'écritures par facture du groupe pour que
            // chacune porte son propre facture_id (le lettrage peut
            // ensuite solder tiers par tiers). Le 2e compte BNQ est
            // routé vers le bon 512xxx via cbToCompteComptable.
            const txRaw = entry.updatedTxs[txIdx]
            const txAmount = Math.max(Number(txRaw.debit) || 0, Number(txRaw.credit) || 0)
            const payAmountMUR = toMUR(txAmount, entry.releveDevise)
            const isOutgoing = (Number(txRaw.debit) || 0) > 0
            const payType: 'supplier' | 'client' = isOutgoing ? 'supplier' : 'client'
            const tiers = (match.supplierName || txRaw.tiers_detecte || '').substring(0, 50)
            // Résoudre le compte bancaire comptable à partir du relevé
            const releveRef = releves.find((r: any) => r.id === releveId)
            const compteBanque = (releveRef && cbToCompteComptable[releveRef.compte_bancaire_id]) || '512'
            const datePayment = txRaw.date || new Date().toISOString().split('T')[0]
            const txLibelle = String(txRaw.libelle || '').substring(0, 100)

            // Montant par facture : réparti au prorata du montant_ttc,
            // fallback équi-split. Arrondi à 2 décimales, reste sur la
            // dernière facture pour équilibrer centime par centime.
            const totalFactures = (match.factures || []).reduce(
              (s: number, f: any) => s + (Number(f.montant_ttc) || 0), 0
            )
            const amountMurRounded = Math.round(payAmountMUR * 100) / 100
            const perFactureAmounts: number[] = (match.factures || []).map((f: any, i: number) => {
              const base = match.factures.length === 1
                ? amountMurRounded
                : (totalFactures > 0
                    ? Math.round((Number(f.montant_ttc) || 0) / totalFactures * amountMurRounded * 100) / 100
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
              })
              if (payErr) {
                console.warn(`[rapprochement] BNQ insert failed for facture ${fac.id}:`, payErr)
              }
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
            await supabase.from('ecritures_comptables').update({
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
              console.log(`[rapprochement] Consistency repair: ${repaired} factures fixed to paye`)
            }
          }
        }
      } catch (repairErr) {
        console.warn('[rapprochement] Consistency repair failed:', repairErr)
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
            .from('ecritures_comptables')
            .select('id, compte, libelle, debit, credit, journal, lettre, ref_folio')
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

          console.log(`[rapprochement] Phase finale: ${achNonLettrees.length} ACH non lettrées à traiter`)

          for (const [releveId, entry] of releveMap) {
            for (let i = 0; i < entry.updatedTxs.length; i++) {
              const tx = entry.updatedTxs[i]
              const txDebit = Number(tx.debit) || 0
              const txCredit = Number(tx.credit) || 0
              const txAmount = txDebit > 0 ? txDebit : txCredit
              if (txAmount === 0) continue
              const txAmountMUR = Math.round(toMUR(txAmount, entry.releveDevise) * 100) / 100
              const txDate = tx.date || new Date().toISOString().split('T')[0]

              // ── Skip unmatched internal transfers (waiting for counterpart) ──
              if (tx.statut === 'interne_en_attente') {
                continue
              }

              // ── Virements internes → 581 ──
              if (tx.statut === 'interne' || tx.matched_type === 'transfert_interne') {
                const intRef = `VI-${releveId}-${i}`
                const alreadyExists = (allEcr401v2 || []).some((e: any) => e.ref_folio === intRef)
                if (alreadyExists) continue

                // Use shared VI code from counterpart matching if available
                const lettre581 = tx.vi_pair_code || `VI${String(ecrituresCreees + 1).padStart(3, '0')}`
                const isOutgoing = txDebit > 0
                const libelle = `Virement interne ${(tx.libelle || '').substring(0, 30)}`
                const socIdForInt = (dossiers || []).find((d: any) => d.id === dossier.id)?.societe_id || societe_id
                await supabase.from('ecritures_comptables_v2').insert([
                  { dossier_id: dossier.id, societe_id: socIdForInt, date_ecriture: txDate, journal: 'BNQ',
                    numero_compte: '512', libelle,
                    debit_mur: isOutgoing ? 0 : txAmountMUR, credit_mur: isOutgoing ? txAmountMUR : 0,
                    lettre: lettre581, ref_folio: intRef },
                  { dossier_id: dossier.id, societe_id: socIdForInt, date_ecriture: txDate, journal: 'BNQ',
                    numero_compte: '581', libelle,
                    debit_mur: isOutgoing ? txAmountMUR : 0, credit_mur: isOutgoing ? 0 : txAmountMUR,
                    lettre: lettre581, ref_folio: intRef },
                ])
                ecrituresCreees++
                continue
              }

              // ── Transactions rapprochées avec facture → BNQ 401↔512 + lettrage ACH ──
              if (tx.statut !== 'rapproche' || !tx.facture_id) continue

              const refFolio = `BANK-${releveId}-${i}`
              const existingEntry = (allEcr401v2 || []).find((e: any) => e.ref_folio === refFolio)

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
                  console.log(`[rapprochement] Updated lettre ${lettreCode} on existing BNQ ${refFolio}`)
                }
              } else {
                // Create new BNQ entries
                const societeIdForInsert = societe_id
                await supabase.from('ecritures_comptables_v2').insert([
                  { dossier_id: dossier.id, societe_id: societeIdForInsert, date_ecriture: txDate, journal: 'BNQ',
                    numero_compte: compte401,
                    libelle: `Paiement ${(facture.tiers || '').substring(0, 30)} — ${facture.numero_facture || ''}`,
                    debit_mur: isPayment ? txAmountMUR : 0, credit_mur: isPayment ? 0 : txAmountMUR,
                    lettre: lettreCode, ref_folio: refFolio },
                  { dossier_id: dossier.id, societe_id: societeIdForInsert, date_ecriture: txDate, journal: 'BNQ',
                    numero_compte: '512',
                    libelle: `Virement ${(facture.tiers || '').substring(0, 30)}`,
                    debit_mur: isPayment ? 0 : txAmountMUR, credit_mur: isPayment ? txAmountMUR : 0,
                    lettre: lettreCode, ref_folio: refFolio },
                ])
              }
              ecrituresCreees++

              // 2. Lettrer l'écriture ACH correspondante avec le MÊME code
              // Chercher par: même compte (401/411) + crédit + tiers similaire + non lettrée
              const factureTiers = (facture.tiers || '').toLowerCase().substring(0, 20)
              const factureMUR = Math.round(Number(facture.montant_mur || facture.montant_ttc || 0) * 100) / 100

              // Stratégie 1: montant exact (2%) + 5 premiers chars du tiers
              const tiersShort = factureTiers.length >= 5 ? factureTiers.substring(0, 5) : factureTiers
              let achFound = achNonLettrees.find((e: any) => {
                const eAmt = Math.round((Number(e.credit_mur) || 0) * 100) / 100
                if (eAmt === 0) return false
                const diff = Math.abs(eAmt - factureMUR) / Math.max(factureMUR, 1)
                if (diff > 0.02) return false
                const eLib = (e.libelle || '').toLowerCase()
                return tiersShort.length >= 3 && eLib.includes(tiersShort)
              })

              // Stratégie 2: montant exact (2%) sans filtre tiers
              if (!achFound) {
                achFound = achNonLettrees.find((e: any) => {
                  const eAmt = Math.round((Number(e.credit_mur) || 0) * 100) / 100
                  if (eAmt === 0) return false
                  return Math.abs(eAmt - factureMUR) / Math.max(factureMUR, 1) < 0.02
                })
              }

              // Stratégie 3: montant exact absolu
              if (!achFound) {
                achFound = achNonLettrees.find((e: any) => {
                  const eAmt = Math.round((Number(e.credit_mur) || 0) * 100) / 100
                  return eAmt === factureMUR
                })
              }

              // Stratégie 4: montant proche (10%) + tiers 5 chars
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
              const txAmountMUR2 = Math.round(toMUR(txAmount2, entry2.releveDevise) * 100) / 100
              const txDate2 = tx.date || new Date().toISOString().split('T')[0]

            // ── Transactions classifiées SANS facture → BNQ avec le bon compte ──
            // MRA → D 444 / C 512, Frais bancaires → D 627 / C 512,
            // Salaires → D 421 / C 512, Particuliers → D 467 / C 512
            if (tx.statut === 'rapproche' && !tx.facture_id && tx.matched_type) {
              const classRef = `CLS-${releveId2}-${i2}`
              const classExists = (allEcr401v2 || []).some((e: any) => e.ref_folio === classRef)
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
                }

                const classLettre = tx.lettre || `CLS${String(ecrituresCreees + 1).padStart(3, '0')}`
                const classLib = `${libellePrefix} — ${(tx.tiers_detecte || tx.libelle || '').substring(0, 30)}`
                const isOut = txDebit2 > 0

                await supabase.from('ecritures_comptables_v2').insert([
                  { dossier_id: dossier.id, societe_id: societe_id, date_ecriture: txDate2, journal: 'BNQ',
                    numero_compte: compteCharge, libelle: classLib,
                    debit_mur: isOut ? txAmountMUR2 : 0, credit_mur: isOut ? 0 : txAmountMUR2,
                    lettre: classLettre, ref_folio: classRef },
                  { dossier_id: dossier.id, societe_id: societe_id, date_ecriture: txDate2, journal: 'BNQ',
                    numero_compte: '512', libelle: `Banque — ${(tx.tiers_detecte || '').substring(0, 25)}`,
                    debit_mur: isOut ? 0 : txAmountMUR2, credit_mur: isOut ? txAmountMUR2 : 0,
                    lettre: classLettre, ref_folio: classRef },
                ])
                ecrituresCreees++
              }
            }
          }
          } // close for (releveId2)
          console.log(`[rapprochement] Phase finale: ${ecrituresCreees} BNQ créées, ${ecrituresLettrees} ACH lettrées`)
        }
      } catch (genErr) {
        console.warn('[rapprochement] Phase finale failed:', genErr)
      }

      console.log('[rapprochement] Result:', counts, 'ecritures_lettrees:', ecrituresLettrees)

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
      const { transaction_id, releve_id, facture_id, ecriture_id, societe_id, classification } = body
      if (!releve_id) return NextResponse.json({ error: 'releve_id requis' }, { status: 400 })

      // Classification manuelle sans facture (MRA, frais, associé, etc.)
      if (classification && !facture_id && !ecriture_id) {
        const { data: releve } = await supabase
          .from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
        if (!releve) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

        const txIdx = parseInt(transaction_id.split('-').pop() || '0')
        const txs = [...(releve.transactions_json || [])]
        if (txIdx >= txs.length) return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })

        const code = `MC${String(Date.now()).slice(-4)}`
        txs[txIdx] = { ...txs[txIdx], statut: 'rapproche', matched_type: classification, lettre: code, note: `Classification manuelle: ${classification}` }
        await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)

        // Créer l'écriture BNQ avec le bon compte.
        // Mapping étendu pour les classifications proposées par le menu
        // "Classer..." de la page rapprochement (Part 2 redesign).
        const CLASSE_COMPTES: Record<string, string> = {
          compte_courant_associe: '455',  // Comptes courants associés
          avance_personnel: '425',        // Avances au personnel
          charge_diverse: '658',          // Autres charges de gestion
          paiement_mra: '444',            // État, impôts (MRA)
          frais_bancaires: '627',         // Services bancaires et assimilés
          // Nouveaux types ajoutés par la refonte UI :
          salaire: '641',                 // Personnel — rémunérations
          virement_interne: '581',        // Virements internes (bridge account)
          remboursement_personnel: '108', // Compte de l'exploitant
          autre: '471',                   // Charges à classer (fallback explicite)
        }
        const compteCharge = CLASSE_COMPTES[classification] || '471'
        console.log(`[lettrer_manuel] societe=${societe_id} tx=${transaction_id} classification=${classification} → compte=${compteCharge}`)

        const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
        if (dossier) {
          const tx = txs[txIdx]
          const txAmt = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
          const isOut = (Number(tx.debit) || 0) > 0
          await supabase.from('ecritures_comptables_v2').insert([
            { dossier_id: dossier.id, societe_id, date_ecriture: tx.date || new Date().toISOString().split('T')[0],
              journal: 'BNQ', numero_compte: compteCharge, libelle: `${classification} — ${(tx.tiers_detecte || tx.libelle || '').substring(0, 30)}`,
              debit_mur: isOut ? txAmt : 0, credit_mur: isOut ? 0 : txAmt, lettre: code, ref_folio: `MC-${releve_id}-${txIdx}` },
            { dossier_id: dossier.id, societe_id, date_ecriture: tx.date || new Date().toISOString().split('T')[0],
              journal: 'BNQ', numero_compte: '512', libelle: `Banque — ${(tx.tiers_detecte || '').substring(0, 25)}`,
              debit_mur: isOut ? 0 : txAmt, credit_mur: isOut ? txAmt : 0, lettre: code, ref_folio: `MC-${releve_id}-${txIdx}` },
          ])
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
            .from('factures').select('statut, rapproche_releve_id, rapproche_transaction_idx, rapproche_date, rapproche_source').eq('id', facture_id).single()
          const { error: updFacErr } = await supabase.from('factures').update({
            statut: 'paye',
            rapproche_releve_id: releve_id,
            rapproche_transaction_idx: txIdx,
            rapproche_date: reconcileDate,
            rapproche_source: 'manual',
          }).eq('id', facture_id)
          if (updFacErr) throw new Error(`Facture update failed: ${updFacErr.message}`)
          rollback.unshift(async () => {
            if (prevFacture) {
              await supabase.from('factures').update(prevFacture).eq('id', facture_id)
            }
          })
        }

        // Step 3: update ecriture if provided (bidirectional link)
        if (ecriture_id) {
          const { data: prevEcriture } = await supabase
            .from('ecritures_comptables').select('lettre, date_lettrage, rapproche_releve_id, rapproche_transaction_idx, rapproche_at').eq('id', ecriture_id).single()
          const { error: updEcrErr } = await supabase.from('ecritures_comptables').update({
            lettre: lettreCode,
            date_lettrage: new Date().toISOString().split('T')[0],
            rapproche_releve_id: releve_id,
            rapproche_transaction_idx: txIdx,
            rapproche_at: reconcileDate,
          }).eq('id', ecriture_id)
          if (updEcrErr) throw new Error(`Ecriture update failed: ${updEcrErr.message}`)
          rollback.unshift(async () => {
            if (prevEcriture) {
              await supabase.from('ecritures_comptables').update(prevEcriture).eq('id', ecriture_id)
            }
          })
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

    // === DELETTRER ===
    if (action === 'delettrer') {
      const { transaction_id, releve_id, facture_id, ecriture_id, societe_id } = body
      if (!releve_id) return NextResponse.json({ error: 'releve_id requis' }, { status: 400 })

      const { data: releve } = await supabase
        .from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
      if (!releve) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      const prevTx = txIdx < txs.length ? { ...txs[txIdx] } : null

      // Collect all facture_ids to unlink (support multi-facture delettrage)
      const faIds: string[] = facture_id
        ? [facture_id]
        : Array.isArray(prevTx?.facture_ids) ? prevTx.facture_ids : (prevTx?.facture_id ? [prevTx.facture_id] : [])

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

        if (ecriture_id) {
          const { error } = await supabase.from('ecritures_comptables').update({
            lettre: null,
            date_lettrage: null,
            rapproche_releve_id: null,
            rapproche_transaction_idx: null,
            rapproche_at: null,
          }).eq('id', ecriture_id)
          if (error) throw new Error(`Ecriture update failed: ${error.message}`)
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
          .from('ecritures_comptables').select('debit, credit')
          .in('dossier_id', dossierIds).like('compte', '51%')
          .gte('date_ecriture', body.periode_debut).lte('date_ecriture', body.periode_fin)
        solde_comptable = (ecritures || []).reduce((s: number, e: any) => s + Number(e.debit || 0) - Number(e.credit || 0), 0)
      }

      if (solde_comptable === 0) {
        const { data: rel } = await supabase
          .from('releves_bancaires').select('solde_cloture')
          .eq('societe_id', societe_id)
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
        type_ecart?: 'auto' | 'change' | 'escompte' | 'penalite' | 'exceptionnel'
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
      const ecartSigne = txAmount - facturesTotal // + = reçu plus que prévu, - = reçu moins
      const SEUIL_AUTO = 1 // MUR — en-dessous on régularise automatiquement en 658/758

      // FIX 6 — Règle R4 : si écart > seuil auto ET aucun type_ecart fourni,
      // on refuse le lettrage plutôt que de forcer. L'utilisateur doit
      // qualifier l'écart (change, escompte, pénalité, exceptionnel).
      if (ecart > SEUIL_AUTO && !type_ecart) {
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
          const ecartAbs = Math.round(ecart * 100) / 100
          let compteEcart: string
          let libelleEcart: string
          if (ecart <= SEUIL_AUTO) {
            // Régularisation automatique <1 MUR
            compteEcart = ecartSigne > 0 ? '758' : '658'
            libelleEcart = `Régularisation écart <1 MUR — ${lettreCode}`
          } else {
            switch (type_ecart) {
              case 'change':
                compteEcart = ecartSigne > 0 ? '766' : '666'
                libelleEcart = `${ecartSigne > 0 ? 'Gain' : 'Perte'} de change — ${lettreCode}`
                break
              case 'escompte':
                compteEcart = ecartSigne > 0 ? '765' : '665'
                libelleEcart = `${ecartSigne > 0 ? 'Escompte obtenu' : 'Escompte accordé'} — ${lettreCode}`
                break
              case 'penalite':
                // Pénalité de retard — toujours en charge (631)
                compteEcart = '631'
                libelleEcart = `Pénalité de retard — ${lettreCode}`
                break
              case 'exceptionnel':
              default:
                compteEcart = ecartSigne > 0 ? '758' : '658'
                libelleEcart = `Écart exceptionnel rapprochement — ${lettreCode}`
                break
            }
          }
          await supabase.from('ecritures_comptables').insert({
            dossier_id: dossier.id,
            date_ecriture: new Date().toISOString().split('T')[0],
            journal: 'OD',
            compte: compteEcart,
            libelle: libelleEcart,
            // 631/658/666/665 = charges → débit. 758/766/765 = produits → crédit.
            debit: /^(6)/.test(compteEcart) ? ecartAbs : 0,
            credit: /^(7)/.test(compteEcart) ? ecartAbs : 0,
            // Règle R7 : pas de lettrage sur 6xxx/7xxx. `lettre` volontairement omis.
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

      const { data: releves } = await supabase.from('releves_bancaires').select('id, compte_bancaire_id, transactions_json').eq('societe_id', socId)
      const { data: comptesBanc } = await supabase.from('comptes_bancaires').select('id, devise').eq('societe_id', socId)
      const deviseMap: Record<string, string> = {}
      ;(comptesBanc || []).forEach((c: any) => { deviseMap[c.id] = c.devise || 'MUR' })

      const rates = await getTauxChange()
      const toMURLocal = (amount: number, devise: string): number => {
        if (!devise || devise === 'MUR') return amount
        return amount * (rates[devise.toUpperCase()] || 1)
      }

      let created = 0

      for (const releve of releves || []) {
        const txs: any[] = releve.transactions_json || []
        const releveDevise = deviseMap[releve.compte_bancaire_id] || 'MUR'

        for (const tx of txs) {
          const txDebit = Number(tx.debit) || 0
          const txCredit = Number(tx.credit) || 0
          const txAmount = txDebit > 0 ? txDebit : txCredit
          if (txAmount === 0) continue
          const txAmountMUR = Math.round(toMURLocal(txAmount, releveDevise) * 100) / 100
          const txDate = tx.date || new Date().toISOString().split('T')[0]

          // --- Internal transfers → 581 both sides ---
          if (tx.statut === 'interne' || tx.matched_type === 'transfert_interne') {
            const { data: existing581 } = await supabase.from('ecritures_comptables')
              .select('id').eq('dossier_id', dossier.id).eq('journal', 'BNQ')
              .eq('compte', '581').eq('date_ecriture', txDate)
              .or(`debit.eq.${txAmountMUR},credit.eq.${txAmountMUR}`)
              .limit(1)
            if (existing581 && existing581.length > 0) continue

            const lettre581 = `VI${String(created + 1).padStart(3, '0')}`
            const isOutgoing = txDebit > 0
            const libelle = `Virement interne ${(tx.libelle || '').substring(0, 30)}`

            await supabase.from('ecritures_comptables').insert([
              // 512 → 581 (bank to transit)
              { dossier_id: dossier.id, date_ecriture: txDate, journal: 'BNQ', compte: '512',
                libelle, debit: isOutgoing ? 0 : txAmountMUR, credit: isOutgoing ? txAmountMUR : 0, lettre: lettre581 },
              // 581 debit (transit out)
              { dossier_id: dossier.id, date_ecriture: txDate, journal: 'BNQ', compte: '581',
                libelle, debit: isOutgoing ? txAmountMUR : 0, credit: isOutgoing ? 0 : txAmountMUR, lettre: lettre581 },
            ])
            created++
            continue
          }

          // --- Regular matched transactions ---
          if (tx.statut !== 'rapproche' || !tx.facture_id) continue

          // Check if BNQ écriture already exists
          const { data: existing } = await supabase.from('ecritures_comptables')
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

          await supabase.from('ecritures_comptables').insert([
            { dossier_id: dossier.id, date_ecriture: txDate, journal: 'BNQ', compte: compte401,
              libelle: `Paiement ${(facture.tiers || '').substring(0, 30)} — ${facture.numero_facture || ''}`,
              debit: isPayment ? txAmountMUR : 0, credit: isPayment ? 0 : txAmountMUR, lettre },
            { dossier_id: dossier.id, date_ecriture: txDate, journal: 'BNQ', compte: '512',
              libelle: `Virement ${(facture.tiers || '').substring(0, 30)}`,
              debit: isPayment ? 0 : txAmountMUR, credit: isPayment ? txAmountMUR : 0, lettre },
          ])

          // Letter existing 401/411 facture entry with same code
          const factureMUR = Math.round(Number(facture.montant_mur || 0) * 100) / 100
          if (factureMUR > 0) {
            await supabase.from('ecritures_comptables')
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
        .from('ecritures_comptables')
        .select('id, compte, debit, credit, lettre, date_ecriture, libelle')
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
        const oppositeCol = isDebit ? 'credit' : 'debit'
        const minAmt = Math.round(bnqAmount * 0.98 * 100) / 100
        const maxAmt = Math.round(bnqAmount * 1.02 * 100) / 100

        const { data: achEntries } = await supabase
          .from('ecritures_comptables')
          .select('id, credit, debit, date_ecriture, libelle')
          .eq('dossier_id', dossier.id)
          .eq('compte', bnq.compte)
          .is('lettre', null)
          .gte(oppositeCol, minAmt)
          .lte(oppositeCol, maxAmt)
          .order('date_ecriture', { ascending: false })
          .limit(5)

        if (!achEntries || achEntries.length === 0) continue

        // Pick closest by date
        const closest = achEntries.reduce((prev, curr) => {
          const prevDiff = Math.abs(new Date(prev.date_ecriture || '').getTime() - new Date(bnq.date_ecriture || '').getTime())
          const currDiff = Math.abs(new Date(curr.date_ecriture || '').getTime() - new Date(bnq.date_ecriture || '').getTime())
          return currDiff < prevDiff ? curr : prev
        })

        // Apply same lettre to ACH entry
        await supabase.from('ecritures_comptables')
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
      const { societe_id: socId } = body
      if (!socId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      console.log(`[sync_lettrage] start societe=${socId}`)

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
      const { data: paidFactures, error: facturesErr } = await supabase
        .from('factures')
        .select('id, numero_facture, montant_ttc, montant_mur, devise, date_facture, date_echeance, rapproche_date, rapproche_releve_id, rapproche_transaction_idx, tiers, type_facture, type_document, facture_origine_id')
        .eq('societe_id', socId)
        .eq('statut', 'paye')
      if (facturesErr) {
        console.error(`[sync_lettrage] factures fetch failed:`, facturesErr.message)
        return NextResponse.json({ error: `factures: ${facturesErr.message}` }, { status: 500 })
      }
      console.log(`[sync_lettrage] ${(paidFactures || []).length} paid facture(s) found`)

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
        const probe = await supabase.from('ecritures_comptables').select('facture_id').limit(1)
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
        .from('ecritures_comptables')
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
            const { data } = await supabase.from('ecritures_comptables')
              .select('id, compte, debit, credit, date_ecriture, libelle, lettre')
              .eq('dossier_id', dossierId).eq('facture_id', f.id)
              .or('compte.like.401%,compte.like.411%')
              .limit(1).maybeSingle()
            if (data) achRow = data
          }
          if (!achRow && f.numero_facture) {
            const { data } = await supabase.from('ecritures_comptables')
              .select('id, compte, debit, credit, date_ecriture, libelle, lettre')
              .eq('dossier_id', dossierId)
              .eq('numero_piece', f.numero_facture)
              .or('compte.like.401%,compte.like.411%')
              .limit(1).maybeSingle()
            if (data) achRow = data
          }
          if (!achRow) {
            errors.push({ facture_id: f.id, reason: 'Aucune écriture ACH/VTE trouvée' })
            continue
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
            const { data } = await supabase.from('ecritures_comptables')
              .select('id, lettre, debit, credit, date_ecriture, libelle, facture_id')
              .eq('dossier_id', dossierId)
              .eq('journal', 'BNQ')
              .eq('compte', achRow.compte)
              .gte(bnqOppositeCol, minAmt)
              .lte(bnqOppositeCol, maxAmt)
              .order('date_ecriture', { ascending: false })
              .limit(5)
            // Prefer entries already linked to this facture_id.
            const linked = (data || []).find((e: any) => e.facture_id === f.id)
            const unletteredAny = (data || []).find((e: any) => !e.lettre)
            bnqRow = linked || unletteredAny || null
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
            }
            const { data: createdRows, error: createErr } = await supabase
              .from('ecritures_comptables')
              .insert([tierSide, bankSide])
              .select('id, lettre, debit, credit, compte')
            if (createErr) {
              errors.push({ facture_id: f.id, reason: `BNQ insert failed: ${createErr.message}` })
              continue
            }
            const createdTier = (createdRows || []).find((r: any) => r.compte === achRow.compte) || createdRows?.[0]
            const createdBank = (createdRows || []).find((r: any) => r.compte === compteBanque) || createdRows?.[1]
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

          await supabase.from('ecritures_comptables')
            .update({ lettre: code, date_lettrage: now })
            .in('id', lettrageIds)
            .is('lettre', null)
          // If one was already lettered, ensure all share the code.
          await supabase.from('ecritures_comptables')
            .update({ lettre: code, date_lettrage: now })
            .in('id', lettrageIds)
            .neq('lettre', code)
          // Backfill facture_id on the BNQ if it wasn't set.
          await supabase.from('ecritures_comptables')
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
              await supabase.from('ecritures_comptables')
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

    // === LETTRER ECRITURES COMPTABLES (401/411) ===
    // FIX 9 — applique les règles R1/R2/R7 avant de poser la lettre :
    //   R1 Équilibre  — ∑débit = ∑crédit sur les écritures groupées
    //   R2 Unicité    — aucune écriture ne doit déjà porter une lettre ≠
    //   R7 Pas de 6xxx/7xxx/skip — refus si un compte de résultat/skip
    // Retourne 409 avec le détail de la violation pour que le client
    // surface le message à l'utilisateur.
    if (action === 'lettrer_ecritures') {
      const { ecriture_ids, societe_id: socId } = body
      if (!ecriture_ids || !Array.isArray(ecriture_ids) || ecriture_ids.length < 2) {
        return NextResponse.json({ error: 'Au moins 2 ecriture_ids requis' }, { status: 400 })
      }
      const lettreCode = `LE${String(Date.now()).slice(-4)}`
      const now = new Date().toISOString().split('T')[0]

      // Charger les écritures pour valider les règles AVANT toute mutation
      const { data: ecrituresToLetter } = await supabase
        .from('ecritures_comptables')
        .select('id, compte, debit, credit, date_ecriture, lettre, journal')
        .in('id', ecriture_ids)
      if (!ecrituresToLetter || ecrituresToLetter.length !== ecriture_ids.length) {
        return NextResponse.json({ error: 'Certaines écritures sont introuvables' }, { status: 404 })
      }
      const violation = validateLettrageGroup({
        ecritures: ecrituresToLetter as any,
        newLettre: lettreCode,
      })
      if (violation) {
        return NextResponse.json({
          error: 'rule_violation',
          rule_violation: violation,
          message: violation,
        }, { status: 409 })
      }

      for (const eid of ecriture_ids) {
        await supabase.from('ecritures_comptables')
          .update({ lettre: lettreCode, date_lettrage: now })
          .eq('id', eid)
      }
      return NextResponse.json({ success: true, lettre: lettreCode, nb: ecriture_ids.length })
    }

    // === PAYE PAR ASSOCIE — l'associé a payé des factures ===
    if (action === 'paye_par_associe') {
      const { transaction_id, releve_id, facture_ids, societe_id, associe_nom, compte_courant_id } = body
      if (!societe_id || !facture_ids || facture_ids.length === 0) {
        return NextResponse.json({ error: 'societe_id et facture_ids[] requis' }, { status: 400 })
      }

      // Trouver ou créer le compte courant associé
      let ccaId = compte_courant_id
      if (!ccaId && associe_nom) {
        const { data: existingCCA } = await supabase.from('comptes_courants_associes')
          .select('id').eq('societe_id', societe_id).eq('nom', associe_nom).maybeSingle()
        if (existingCCA) {
          ccaId = existingCCA.id
        } else {
          const { data: newCCA } = await supabase.from('comptes_courants_associes')
            .insert({ societe_id, nom: associe_nom, type: 'associe', solde: 0 }).select('id').single()
          ccaId = newCCA?.id
        }
      }
      if (!ccaId) return NextResponse.json({ error: 'associe_nom ou compte_courant_id requis' }, { status: 400 })

      // Calculer le total des factures
      const { data: factures } = await supabase.from('factures').select('id, montant_ttc, tiers, numero_facture').in('id', facture_ids)
      const totalMontant = (factures || []).reduce((s, f) => s + (Number(f.montant_ttc) || 0), 0)

      // Marquer les factures comme payées par associé
      // FIX 1 — rapproche_date jamais NULL (fallback date du jour).
      const associePayDate = new Date().toISOString().split('T')[0]
      for (const f of factures || []) {
        await supabase.from('factures').update({
          statut: 'paye',
          mode_paiement: 'associe',
          paye_par: associe_nom,
          rapproche_date: associePayDate,
          rapproche_source: 'paye_par_associe',
        }).eq('id', f.id)
      }

      // Créer le mouvement CCA (avance)
      const description = facture_ids.length === 1
        ? `Paiement facture ${(factures || [])[0]?.numero_facture || ''}`
        : `Paiement ${facture_ids.length} factures`
      await supabase.from('mouvements_compte_courant').insert({
        compte_courant_id: ccaId, societe_id,
        date_mouvement: new Date().toISOString().split('T')[0],
        type: 'avance', montant: totalMontant,
        description,
        facture_id: facture_ids.length === 1 ? facture_ids[0] : null,
      })

      // Mettre à jour le solde CCA
      const { error: rpcError } = await supabase.rpc('increment_solde_cca', { cca_id: ccaId, delta: totalMontant })
      if (rpcError) {
        // Si la fonction RPC n'existe pas, faire manuellement
        const { data: ccaData } = await supabase.from('comptes_courants_associes')
          .select('solde').eq('id', ccaId).single()
        const newSolde = (Number(ccaData?.solde) || 0) + totalMontant
        await supabase.from('comptes_courants_associes').update({ solde: newSolde }).eq('id', ccaId)
      }

      // Créer les écritures comptables
      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
      if (dossier) {
        // Débit charges/fournisseur, Crédit 455 (CCA)
        for (const f of factures || []) {
          await supabase.from('ecritures_comptables').insert([
            { dossier_id: dossier.id, date_ecriture: new Date().toISOString().split('T')[0], journal: 'OD', compte: '401', libelle: `Fournisseur ${f.tiers || ''} — payé par ${associe_nom}`, debit: Number(f.montant_ttc), credit: 0 },
            { dossier_id: dossier.id, date_ecriture: new Date().toISOString().split('T')[0], journal: 'OD', compte: '455', libelle: `CCA ${associe_nom} — ${f.numero_facture || ''}`, debit: 0, credit: Number(f.montant_ttc) },
          ])
        }
      }

      // Si transaction bancaire fournie, la marquer aussi
      if (releve_id && transaction_id) {
        const { data: releve } = await supabase.from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
        if (releve) {
          const txIdx = parseInt(transaction_id.split('-').pop() || '0')
          const txs = [...(releve.transactions_json || [])]
          if (txIdx < txs.length) {
            txs[txIdx] = { ...txs[txIdx], lettre: `CCA${String(Date.now()).slice(-4)}`, statut: 'rapproche', paye_par_associe: associe_nom }
            await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
          }
        }
      }

      return NextResponse.json({
        success: true,
        cca_id: ccaId,
        montant_total: totalMontant,
        nb_factures: facture_ids.length,
        associe: associe_nom,
      })
    }

    // === COMPENSATION — remboursement associé via virement bancaire ===
    if (action === 'compensation') {
      const { transaction_id, releve_id, compte_courant_id, societe_id, montant } = body
      if (!compte_courant_id || !societe_id || !montant) {
        return NextResponse.json({ error: 'compte_courant_id, societe_id, montant requis' }, { status: 400 })
      }

      // Récupérer le CCA
      const { data: cca } = await supabase.from('comptes_courants_associes')
        .select('id, nom, solde').eq('id', compte_courant_id).single()
      if (!cca) return NextResponse.json({ error: 'Compte courant non trouvé' }, { status: 404 })

      const remboursementMontant = Number(montant)

      // Créer mouvement de remboursement
      await supabase.from('mouvements_compte_courant').insert({
        compte_courant_id, societe_id,
        date_mouvement: new Date().toISOString().split('T')[0],
        type: 'remboursement',
        montant: -remboursementMontant,
        description: `Remboursement par virement bancaire`,
      })

      // Mettre à jour le solde
      const newSolde = (Number(cca.solde) || 0) - remboursementMontant
      await supabase.from('comptes_courants_associes').update({ solde: newSolde }).eq('id', compte_courant_id)

      // Écritures comptables: Débit 455 (CCA) / Crédit 512 (Banque)
      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
      if (dossier) {
        await supabase.from('ecritures_comptables').insert([
          { dossier_id: dossier.id, date_ecriture: new Date().toISOString().split('T')[0], journal: 'BNQ', compte: '455', libelle: `Remboursement CCA ${cca.nom}`, debit: remboursementMontant, credit: 0 },
          { dossier_id: dossier.id, date_ecriture: new Date().toISOString().split('T')[0], journal: 'BNQ', compte: '512', libelle: `Virement remboursement ${cca.nom}`, debit: 0, credit: remboursementMontant },
        ])
      }

      // Marquer la transaction bancaire si fournie
      if (releve_id && transaction_id) {
        const { data: releve } = await supabase.from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
        if (releve) {
          const txIdx = parseInt(transaction_id.split('-').pop() || '0')
          const txs = [...(releve.transactions_json || [])]
          if (txIdx < txs.length) {
            txs[txIdx] = { ...txs[txIdx], lettre: `RMB${String(Date.now()).slice(-4)}`, statut: 'rapproche', compensation_cca: cca.nom }
            await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
          }
        }
      }

      return NextResponse.json({
        success: true,
        ancien_solde: Number(cca.solde),
        nouveau_solde: newSolde,
        associe: cca.nom,
        montant_rembourse: remboursementMontant,
      })
    }

    // === PAIEMENT EMPLOYÉ — virement individuel (hors bulk) ===
    if (action === 'paiement_employe') {
      const { transaction_id, releve_id, employe_id, societe_id, periode } = body
      if (!employe_id || !societe_id) {
        return NextResponse.json({ error: 'employe_id et societe_id requis' }, { status: 400 })
      }

      // Trouver l'employé
      const { data: employe } = await supabase.from('employes').select('id, nom, prenom, salaire_base').eq('id', employe_id).single()
      if (!employe) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

      // Trouver le bulletin de paie (si période fournie)
      let bulletin: any = null
      if (periode) {
        const periodeDate = periode.length === 7 ? `${periode}-01` : periode
        const { data: bul } = await supabase.from('bulletins_paie')
          .select('id, salaire_net, salaire_base, periode')
          .eq('employe_id', employe_id)
          .gte('periode', periodeDate)
          .lte('periode', `${periode}-31`)
          .limit(1).maybeSingle()
        bulletin = bul
      }

      const montantNet = bulletin ? Number(bulletin.salaire_net) : Number(employe.salaire_base) || 0
      const lettreCode = `SAL${String(Date.now()).slice(-4)}`
      const nomComplet = `${employe.prenom} ${employe.nom}`

      // Marquer la transaction bancaire
      if (releve_id && transaction_id) {
        const { data: releve } = await supabase.from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
        if (releve) {
          const txIdx = parseInt(transaction_id.split('-').pop() || '0')
          const txs = [...(releve.transactions_json || [])]
          if (txIdx < txs.length) {
            txs[txIdx] = {
              ...txs[txIdx],
              lettre: lettreCode,
              statut: 'rapproche',
              employe_id,
              employe_nom: nomComplet,
              type_rapprochement: 'salaire_individuel',
              bulletin_id: bulletin?.id || null,
            }
            await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
          }
        }
      }

      // Créer les écritures comptables (Débit 421 / Crédit 512)
      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
      if (dossier) {
        const dateEcriture = new Date().toISOString().split('T')[0]
        await supabase.from('ecritures_comptables').insert([
          { dossier_id: dossier.id, date_ecriture: dateEcriture, journal: 'BNQ', compte: '421000', libelle: `Virement salaire ${nomComplet}`, debit: Math.round(montantNet), credit: 0, lettre: lettreCode },
          { dossier_id: dossier.id, date_ecriture: dateEcriture, journal: 'BNQ', compte: '512000', libelle: `Virement salaire ${nomComplet}`, debit: 0, credit: Math.round(montantNet), lettre: lettreCode },
        ])
      }

      // Si bulletin trouvé, marquer comme payé
      if (bulletin) {
        await supabase.from('bulletins_paie').update({ statut: 'paye' }).eq('id', bulletin.id)
      }

      return NextResponse.json({
        success: true,
        lettre: lettreCode,
        employe: nomComplet,
        montant: montantNet,
        bulletin_id: bulletin?.id || null,
        bulletin_found: !!bulletin,
      })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
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
