import { NextResponse } from 'next/server'
import { createEcrituresForPayment, createEcrituresForFacture } from '@/lib/accounting/ecritures-factures'
import { safeInsertBnq } from '@/lib/accounting/bnq-dedupe'
import { analyzeAllTransactions, MatchingTransaction, MatchingFacture } from '@/lib/accounting/matching-engine'
import { runIntelligentRapprochement, buildAliasMap } from '@/lib/accounting/intelligent-rapprochement'
import type { SupplierAlias } from '@/lib/accounting/intelligent-rapprochement'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { lastDayOfMonth } from '@/lib/rh/period'
import { getTauxChange } from '@/lib/taux-change'
import { accountClass } from '@/lib/accounting/classification-rules'
import { validateLettrageGroup } from '@/lib/accounting/accounting-rules'
import { classifyTransaction, detectDirector, getComplianceSeverity, type ClassificationRule } from '@/lib/accounting/classification-engine'
import { checkPeriodLock } from '@/lib/accounting/period-lock'

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
        console.log(`[rapprochement] Loaded ${classificationRules.length} rules, ${directors.length} directors`)
      } catch (rulesErr) {
        console.warn('[rapprochement] classification_rules/directors not available (migration 135 not applied?):', rulesErr)
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
            ? (async () => {
                // Essayer avec facture_id + journal (migration 133 appliquée) → fallback sur select minimal sinon
                const full = await supabase.from('ecritures_comptables').select('id, compte, libelle, debit, credit, date_ecriture, lettre, facture_id, journal').in('dossier_id', dossierIds).is('lettre', null)
                if (!full.error) return full
                return supabase.from('ecritures_comptables').select('id, compte, libelle, debit, credit, date_ecriture, lettre').in('dossier_id', dossierIds).is('lettre', null)
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
          function isSelfMatch(selfName: string, tiersName: string): boolean {
            const selfWords = selfName.split(/\s+/).filter((w: string) => w.length > 2)
            const tiersWords = tiersName.split(/\s+/).filter((w: string) => w.length > 2)
            if (selfWords.length === 0 || tiersWords.length === 0) return false
            // Minimum 4 caractères pour le matching (évite "myt" matchant n'importe quoi)
            const matchedSelf = selfWords.filter((sw: string) => tiersWords.some((tw: string) => {
              if (sw.length < 4 || tw.length < 4) return false
              return tw.startsWith(sw.substring(0, 4)) || sw.startsWith(tw.substring(0, 4))
            }))
            if (matchedSelf.length < selfWords.length * 0.7) return false
            const unmatchedTiers = tiersWords.filter((tw: string) => !selfWords.some((sw: string) => {
              if (sw.length < 4 || tw.length < 4) return false
              return tw.startsWith(sw.substring(0, 4)) || sw.startsWith(tw.substring(0, 4))
            }))
            return unmatchedTiers.length === 0
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
                  .from('ecritures_comptables')
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
                  .from('ecritures_comptables')
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
          console.log(`[rapprochement] FIX 4 backfill: ${backfilled} tx rapproche ← facture_id inféré`)
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
              const txAmountMUR2 = Math.round(toMUR(txAmount2, entry2.releveDevise) * 100) / 100
              const txDate2 = tx.date || new Date().toISOString().split('T')[0]

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
                devise: entry2.releveDevise,
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
                devise: entry2.releveDevise,
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
                    description: `Virement de ${txAmount2.toFixed(2)} ${entry2.releveDevise} concernant ${dirMatch.director_name} (${dirMatch.role}). Doit être qualifié comme: A) Remboursement NDF / B) Avance salaire / C) Rémunération / D) Avance dividendes / E) Prêt (⚠ interdit dirigeants - Companies Act s.166)`,
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

                await supabase.from('ecritures_comptables_v2').insert([
                  { dossier_id: dossier.id, societe_id: societe_id, date_ecriture: txDate2, journal: 'BNQ',
                    numero_compte: compteCharge, libelle: classLib,
                    debit_mur: isOut ? txAmountMUR2 : 0, credit_mur: isOut ? 0 : txAmountMUR2,
                    lettre: lettreOnCharge, ref_folio: classRef },
                  { dossier_id: dossier.id, societe_id: societe_id, date_ecriture: txDate2, journal: 'BNQ',
                    numero_compte: '512', libelle: `Banque — ${(tx.tiers_detecte || '').substring(0, 25)}`,
                    debit_mur: isOut ? 0 : txAmountMUR2, credit_mur: isOut ? txAmountMUR2 : 0,
                    lettre: classLettre, ref_folio: classRef },
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
                      console.log(`[rapprochement] Lettrage salaire: BNQ ${classLettre} ↔ SAL ${matched.id}`)
                    }
                  }
                }
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
        const CLASSE_COMPTES: Record<string, string> = {
          fournisseur: '401',
          client: '411',
          compte_courant_associe: '455',
          remboursement_associe: '108',
          avance_personnel: '425',
          charge_diverse: '658',
          paiement_mra: '444',
          frais_bancaires: '627',
          salaire: '4210',
          salaire_bulk: '421',
          virement_interne: '580',
          remboursement_personnel: '108',
          loyer: '613',
          entretien: '615',
          assurance: '616',
          honoraires: '622',
          deplacement: '625',
          telecom: '626',
          impot_taxe: '635',
          materiel: '606',
          produit_divers: '706',
          charge_sociale: '431',
          autre: '471',
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

        // Supprimer les écritures BNQ créées par le rapprochement (BANK-, TDS-, CLS-, MC-)
        // pour éviter les écritures orphelines après délettrage
        try {
          const refPatterns = [`BANK-${releve_id}-${txIdx}`, `TDS-${releve_id}-${txIdx}`, `CLS-${releve_id}-${txIdx}`, `MC-${releve_id}-${txIdx}`]
          await supabase.from('ecritures_comptables_v2')
            .delete()
            .eq('societe_id', societe_id)
            .in('ref_folio', refPatterns)
          // Délettrer aussi les ACH/OD qui avaient le même code lettre
          if (prevTx?.lettre) {
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
      const ecartSigne = txAmount - facturesTotal
      const ecartPct = facturesTotal > 0 ? ecart / facturesTotal : 0
      // Seuil auto : écarts < 2% sont acceptés automatiquement (frais bancaires,
      // TDS, arrondis de change). Au-delà de 2% → demander qualification.
      const SEUIL_AUTO_PCT = 0.02
      const SEUIL_AUTO_ABS = 100 // MUR — petits montants toujours acceptés

      if (ecart > SEUIL_AUTO_ABS && ecartPct > SEUIL_AUTO_PCT && !type_ecart) {
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
          if (ecart <= SEUIL_AUTO_ABS) {
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

            // Sprint 2 — anti-doublon BNQ via safeInsertBnq (table v1 view).
            const insTransit = await safeInsertBnq(supabase, [
              { dossier_id: dossier.id, date_ecriture: txDate, journal: 'BNQ', numero_compte: '512',
                libelle, debit_mur: isOutgoing ? 0 : txAmountMUR, credit_mur: isOutgoing ? txAmountMUR : 0, lettre: lettre581 },
              { dossier_id: dossier.id, date_ecriture: txDate, journal: 'BNQ', numero_compte: '581',
                libelle, debit_mur: isOutgoing ? txAmountMUR : 0, credit_mur: isOutgoing ? 0 : txAmountMUR, lettre: lettre581 },
            ], 'ecritures_comptables')
            if (insTransit.skipped > 0) console.log(`[auto_rapprocher transit BNQ] skipped:`, insTransit.skipReasons)
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

          // Sprint 2 — anti-doublon BNQ via safeInsertBnq.
          const insRegular = await safeInsertBnq(supabase, [
            { dossier_id: dossier.id, date_ecriture: txDate, journal: 'BNQ', numero_compte: compte401,
              libelle: `Paiement ${(facture.tiers || '').substring(0, 30)} — ${facture.numero_facture || ''}`,
              debit_mur: isPayment ? txAmountMUR : 0, credit_mur: isPayment ? 0 : txAmountMUR, lettre },
            { dossier_id: dossier.id, date_ecriture: txDate, journal: 'BNQ', numero_compte: '512',
              libelle: `Virement ${(facture.tiers || '').substring(0, 30)}`,
              debit_mur: isPayment ? 0 : txAmountMUR, credit_mur: isPayment ? txAmountMUR : 0, lettre },
          ], 'ecritures_comptables')
          if (insRegular.skipped > 0) console.log(`[auto_rapprocher regular BNQ] skipped:`, insRegular.skipReasons)

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
      const { societe_id: socId, mois: moisFilter } = body
      if (!socId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      console.log(`[sync_lettrage] start societe=${socId} mois_filter=${moisFilter || 'all'}`)

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
        .select('id, numero_facture, montant_ht, montant_tva, montant_ttc, montant_mur, devise, date_facture, date_echeance, rapproche_date, rapproche_releve_id, rapproche_transaction_idx, tiers, type_facture, type_document, facture_origine_id')
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
            })
            if (!gen.ok) {
              errors.push({ facture_id: f.id, reason: `ACH/VTE absente et recréation échouée : ${gen.error || 'inconnue'}` })
              continue
            }
            console.log(`[sync_lettrage] ACH/VTE recréée pour facture ${f.id} (${f.numero_facture}) — ${gen.nb_entries} lignes`)
            // Re-query the ACH row that was just inserted.
            const { data: reAch } = await supabase.from('ecritures_comptables')
              .select('id, compte, debit, credit, date_ecriture, libelle, lettre')
              .eq('dossier_id', dossierId)
              .eq('facture_id', f.id)
              .or('compte.like.401%,compte.like.411%')
              .limit(1).maybeSingle()
            if (reAch) {
              achRow = reAch
            } else {
              // Fallback lookup via numero_piece
              const { data: reAch2 } = await supabase.from('ecritures_comptables')
                .select('id, compte, debit, credit, date_ecriture, libelle, lettre')
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
            // Sprint 2 — anti-doublon BNQ : si sync_lettrage retourne 2x
            // sur la même facture, on ne crée pas 2 paires d'écritures.
            // safeInsertBnq normalise compte→numero_compte / debit→debit_mur
            // pour la comparaison côté v2.
            const insSync = await safeInsertBnq(supabase, [tierSide, bankSide] as any, 'ecritures_comptables')
            if (insSync.error) {
              errors.push({ facture_id: f.id, reason: `BNQ insert failed: ${(insSync.error as any).message || insSync.error}` })
              continue
            }
            if (insSync.skipped > 0) console.log(`[sync_lettrage BNQ] skipped:`, insSync.skipReasons)
            const createdRows = insSync.data || []
            const createdTier = createdRows.find((r: any) => r.compte === achRow.compte) || createdRows[0]
            const createdBank = createdRows.find((r: any) => r.compte === compteBanque) || createdRows[1]
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
            // FIX 4 — stocker facture_id(s) pour que la transaction reste
            // traçable jusqu'aux factures payées via CCA.
            txs[txIdx] = {
              ...txs[txIdx],
              lettre: `CCA${String(Date.now()).slice(-4)}`,
              statut: 'rapproche',
              paye_par_associe: associe_nom,
              facture_id: facture_ids[0] || null,
              facture_ids,
            }
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
          .lte('periode', lastDayOfMonth(periode))
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
          { dossier_id: dossier.id, date_ecriture: dateEcriture, journal: 'BNQ', compte: '4210', libelle: `Virement salaire ${nomComplet}`, debit: Math.round(montantNet), credit: 0, lettre: lettreCode },
          { dossier_id: dossier.id, date_ecriture: dateEcriture, journal: 'BNQ', compte: '512', libelle: `Virement salaire ${nomComplet}`, debit: 0, credit: Math.round(montantNet), lettre: lettreCode },
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

    // === MARQUER PAYÉE — action rapide sans transaction bancaire ===
    // Crée directement les écritures BNQ (D: 401, C: 512) et le lettrage,
    // marque la facture comme payée, sans nécessiter de transaction bancaire.
    // Utilisé depuis la liste "Factures fournisseurs" quand l'utilisateur
    // sait que le paiement a été effectué mais que le relevé n'est pas importé
    // ou que la tx n'a pas matché.
    if (action === 'marquer_paye') {
      const { facture_id, societe_id, date_paiement, compte_bancaire } = body
      if (!facture_id || !societe_id) {
        return NextResponse.json({ error: 'facture_id et societe_id requis' }, { status: 400 })
      }

      // Récupérer la facture
      const { data: facture, error: factErr } = await supabase
        .from('factures')
        .select('id, numero_facture, tiers, montant_ttc, montant_mur, devise, type_facture, date_facture, statut')
        .eq('id', facture_id)
        .single()
      if (factErr || !facture) {
        return NextResponse.json({ error: `Facture non trouvée: ${factErr?.message}` }, { status: 404 })
      }
      if (facture.statut === 'paye') {
        return NextResponse.json({ error: 'Facture déjà payée' }, { status: 400 })
      }

      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
      if (!dossier) {
        return NextResponse.json({ error: 'Dossier comptable introuvable' }, { status: 400 })
      }

      const isFournisseur = facture.type_facture === 'fournisseur' || !facture.type_facture
      const compteAux = isFournisseur ? '401' : '411'
      const compteBanque = compte_bancaire || '512'
      const montantMUR = Math.round((Number(facture.montant_mur) || Number(facture.montant_ttc) || 0) * 100) / 100
      if (montantMUR <= 0) {
        return NextResponse.json({ error: 'Montant facture invalide' }, { status: 400 })
      }
      const dateOp = date_paiement || new Date().toISOString().split('T')[0]
      const lettre = `MP${String(Date.now()).slice(-6)}`
      const refFolio = `MP-${facture.id.substring(0, 8)}`
      const tiers = (facture.tiers || '').substring(0, 80)

      // Pour un fournisseur payé:
      //   D: 401 Fournisseur (solde la dette) — lettre avec ACH
      //   C: 512 Banque (sortie de trésorerie)
      // Pour un client encaissé:
      //   D: 512 Banque (entrée)
      //   C: 411 Client (solde la créance) — lettre avec VTE
      const buildEcritures = (withFactureId: boolean) => {
        const withFk = (fkId: string) => withFactureId ? { facture_id: fkId } : {}
        return isFournisseur
          ? [
              {
                dossier_id: dossier.id, societe_id,
                date_ecriture: dateOp, journal: 'BNQ',
                numero_compte: compteAux,
                libelle: `Paiement ${tiers} — ${facture.numero_facture}`.substring(0, 100),
                debit_mur: montantMUR, credit_mur: 0,
                lettre, ref_folio: refFolio,
                ...withFk(facture.id),
              },
              {
                dossier_id: dossier.id, societe_id,
                date_ecriture: dateOp, journal: 'BNQ',
                numero_compte: compteBanque,
                libelle: `Banque — Paiement ${tiers}`.substring(0, 100),
                debit_mur: 0, credit_mur: montantMUR,
                lettre, ref_folio: refFolio,
              },
            ]
          : [
              {
                dossier_id: dossier.id, societe_id,
                date_ecriture: dateOp, journal: 'BNQ',
                numero_compte: compteBanque,
                libelle: `Banque — Encaissement ${tiers}`.substring(0, 100),
                debit_mur: montantMUR, credit_mur: 0,
                lettre, ref_folio: refFolio,
              },
              {
                dossier_id: dossier.id, societe_id,
                date_ecriture: dateOp, journal: 'BNQ',
                numero_compte: compteAux,
                libelle: `Encaissement ${tiers} — ${facture.numero_facture}`.substring(0, 100),
                debit_mur: 0, credit_mur: montantMUR,
                lettre, ref_folio: refFolio,
                ...withFk(facture.id),
              },
            ]
      }

      // Tenter d'abord avec facture_id (migration 133) puis fallback sans
      let insResult = await supabase.from('ecritures_comptables_v2').insert(buildEcritures(true))
      let insErr: any = insResult.error
      if (insErr && /facture_id/i.test(String(insErr.message || '')) && /(does not exist|column)/i.test(String(insErr.message || ''))) {
        console.warn('[marquer_paye] facture_id column missing, retry without it')
        insResult = await supabase.from('ecritures_comptables_v2').insert(buildEcritures(false))
        insErr = insResult.error
      }
      if (insErr) {
        console.error('[marquer_paye] insertion failed:', insErr.message)
        // Si doublon (unique index ref_folio), on peut considérer que c'est déjà fait
        if (/duplicate key value|unique constraint/i.test(String(insErr.message || ''))) {
          console.log('[marquer_paye] already inserted previously, continuing to mark facture paye')
        } else {
          return NextResponse.json({
            error: `Erreur insertion écritures: ${insErr.message}`,
            hint: 'La migration 128 (ref_folio unique) et 133 (facture_id) doivent être appliquées.',
          }, { status: 500 })
        }
      }

      // Lettrer l'ACH/VTE existante sur le compte auxiliaire pour cette facture
      // (l'écriture originale créée lors de l'import facture)
      // On tente plusieurs stratégies : par facture_id (m133), sinon par ref_folio
      // qui matche le numero_facture, sinon par libellé contenant le numero.
      try {
        const upd1 = await supabase
          .from('ecritures_comptables_v2')
          .update({ lettre, date_lettrage: dateOp })
          .eq('dossier_id', dossier.id)
          .eq('facture_id', facture.id)
          .in('journal', ['ACH', 'VTE'])
          .is('lettre', null)
        if (upd1.error && /facture_id/i.test(String(upd1.error.message || ''))) {
          // Fallback : par libellé
          await supabase
            .from('ecritures_comptables_v2')
            .update({ lettre, date_lettrage: dateOp })
            .eq('dossier_id', dossier.id)
            .in('journal', ['ACH', 'VTE'])
            .is('lettre', null)
            .ilike('libelle', `%${facture.numero_facture}%`)
        }
      } catch (e: any) { console.warn('[marquer_paye] lettrage ACH failed:', e.message) }

      // Marquer la facture payée (avec fallback progressif si colonnes manquantes)
      // Migration 128 ajoute solde_non_paye, migration 121 ajoute rapproche_date/source
      const tryUpdate = async (payload: Record<string, any>) => {
        return supabase.from('factures').update(payload).eq('id', facture_id).select('id, statut')
      }
      let factUpdData: any = null
      let factUpdErr: any = null
      // Niveau 1 : tout
      let r = await tryUpdate({ statut: 'paye', solde_non_paye: 0, rapproche_date: dateOp, rapproche_source: 'marquer_paye' })
      if (r.error && /solde_non_paye/i.test(r.error.message || '')) {
        console.warn('[marquer_paye] fallback: colonne solde_non_paye manquante (migration 128)')
        r = await tryUpdate({ statut: 'paye', rapproche_date: dateOp, rapproche_source: 'marquer_paye' })
      }
      if (r.error && /(rapproche_source|rapproche_date)/i.test(r.error.message || '')) {
        console.warn('[marquer_paye] fallback: colonnes rapproche_* manquantes (migration 121)')
        r = await tryUpdate({ statut: 'paye' })
      }
      factUpdErr = r.error
      factUpdData = r.data
      if (factUpdErr) {
        console.error('[marquer_paye] facture update FAILED:', factUpdErr.message, factUpdErr)
        return NextResponse.json({
          error: `Ecritures creees (lettre ${lettre}) MAIS facture non marquee payee: ${factUpdErr.message}`,
          hint: 'Verifiez que les colonnes statut/rapproche_date/solde_non_paye existent',
          lettre,
          nb_ecritures: 2,
        }, { status: 500 })
      }
      if (!factUpdData || factUpdData.length === 0) {
        console.error('[marquer_paye] update silencieusement ignore - RLS ou ligne non trouvee')
        return NextResponse.json({
          error: `Facture non mise a jour (0 ligne affectee). Verifiez RLS ou que la facture existe bien`,
          lettre,
          nb_ecritures: 2,
        }, { status: 500 })
      }
      console.log('[marquer_paye] facture updated:', factUpdData)

      return NextResponse.json({
        success: true,
        facture_id,
        lettre,
        montant: montantMUR,
        nb_ecritures: 2,
        facture_updated: factUpdData[0],
      })
    }

    // === CLASSER TRANSACTION — raccourci avec auto-learn pattern ===
    // Classe manuellement une transaction "à vérifier" avec une nature comptable,
    // crée les écritures BNQ associées, ET sauvegarde le pattern (tiers) comme
    // règle de classification pour appliquer automatiquement la prochaine fois.
    // Si apply_to_similar=true : classe aussi TOUTES les autres tx de la société
    // avec le même tiers (propagation retroactive en 1 clic).
    if (action === 'classer_transaction') {
      const { transaction_id, releve_id, societe_id, classification, learn_pattern, apply_to_similar } = body
      if (!releve_id || !transaction_id || !classification) {
        return NextResponse.json({ error: 'releve_id, transaction_id, classification requis' }, { status: 400 })
      }
      console.log(`[classer_transaction] societe=${societe_id} tx=${transaction_id} classification=${classification}`)

      const { data: releve, error: relErr } = await supabase
        .from('releves_bancaires').select('id, transactions_json, compte_bancaire_id').eq('id', releve_id).single()
      if (relErr || !releve) {
        console.error('[classer_transaction] relevé introuvable:', relErr?.message)
        return NextResponse.json({ error: `Relevé non trouvé: ${relErr?.message}` }, { status: 404 })
      }

      // Recuperer la devise du compte bancaire + taux de change pour conversion MUR
      const { data: compteBancaire } = await supabase
        .from('comptes_bancaires').select('devise').eq('id', releve.compte_bancaire_id).maybeSingle()
      const txDevise = (compteBancaire?.devise || 'MUR').toUpperCase()
      const rates: Record<string, number> = await getTauxChange().catch(() => ({ MUR: 1, EUR: 46.50, USD: 44.80, GBP: 54.20 }))
      const tauxDevise = rates[txDevise] || 1
      console.log(`[classer_transaction] devise=${txDevise} taux=${tauxDevise}`)

      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx >= txs.length) return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })

      const txDate = txs[txIdx]?.date
      if (txDate && societe_id) {
        const lockStatus = await checkPeriodLock(supabase, societe_id, txDate)
        if (lockStatus.locked) {
          return NextResponse.json({ error: `Période verrouillée — ${lockStatus.reason}` }, { status: 403 })
        }
      }

      const code = `CL${String(Date.now()).slice(-6)}`
      // Lire l'ancien code lettre AVANT de mettre à jour la transaction
      const oldLettre = txs[txIdx]?.lettre || null
      txs[txIdx] = { ...txs[txIdx], statut: 'rapproche', matched_type: classification, lettre: code, note: `Classification manuelle: ${classification}` }
      const { error: updRelErr, data: updRelData } = await supabase
        .from('releves_bancaires')
        .update({ transactions_json: txs })
        .eq('id', releve_id)
        .select('id')
      if (updRelErr) {
        console.error('[classer_transaction] update releve FAILED:', updRelErr.message, updRelErr)
        return NextResponse.json({ error: `MAJ releve echouee: ${updRelErr.message}` }, { status: 500 })
      }
      if (!updRelData || updRelData.length === 0) {
        console.error('[classer_transaction] update silencieusement ignore (0 ligne) - probablement RLS')
        return NextResponse.json({
          error: `Relevé non mis à jour (0 ligne affectée). RLS bloquante ou relevé inexistant.`,
        }, { status: 500 })
      }
      console.log(`[classer_transaction] releve ${releve_id} mis a jour, tx ${txIdx} classee en ${classification}`)

      // Mapping classification → compte comptable
      const CLASSE_COMPTES: Record<string, string> = {
        fournisseur: '401',
        client: '411',
        compte_courant_associe: '455',
        remboursement_associe: '108',
        avance_personnel: '425',
        charge_diverse: '658',
        paiement_mra: '447',
        frais_bancaires: '627',
        salaire: '4210',
        salaire_bulk: '421',
        virement_interne: '580',
        remboursement_personnel: '108',
        charge_sociale: '431',
        loyer: '613',
        entretien: '615',
        assurance: '616',
        honoraires: '622',
        deplacement: '625',
        telecom: '626',
        impot_taxe: '635',
        materiel: '606',
        produit_divers: '706',
        autre: '471',
      }
      const compte = CLASSE_COMPTES[classification] || '471'

      const { data: dossier, error: dossierErr } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
      let nbEcritures = 0
      let nbEcrituresSupprimees = 0
      let ecrituresError: string | null = null
      let ecrituresAlreadyExisted = false
      if (!dossier) {
        ecrituresError = `Aucun dossier comptable trouve pour societe ${societe_id}${dossierErr ? ' : ' + dossierErr.message : ''}`
        console.warn('[classer_transaction]', ecrituresError)
      } else {
        const tx = txs[txIdx]
        const txAmt = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
        const isOut = (Number(tx.debit) || 0) > 0
        // Conversion en MUR : si la tx est en EUR/USD/GBP, on convertit via le taux
        const txAmtMUR = Math.round(txAmt * tauxDevise * 100) / 100
        const deviseLabel = txDevise === 'MUR' ? '' : ` [${txDevise} @ ${tauxDevise}]`
        // ref_folio determinISTE pour cette tx specifique (releve_id complet + txIdx)
        // Permet la detection idempotente du doublon = re-click sur la meme tx.
        const refFolio = `CL-${releve_id}-${txIdx}`

        // ── RECLASSIFICATION : supprimer les anciennes écritures AVANT d'insérer ──
        // Quand l'utilisateur corrige une classification, les écritures de l'ancienne
        // classification (ref_folio CL-xxx ou CLS-xxx ou ancien code lettre) doivent
        // disparaître. Sinon le compte comptable précédent reste pollué avec un montant
        // fantôme.
        // 1) Supprimer par ref_folio CL-xxx (reclassification manuelle précédente)
        const { count: delByFolio } = await supabase
          .from('ecritures_comptables_v2')
          .delete({ count: 'exact' })
          .eq('societe_id', societe_id)
          .eq('ref_folio', refFolio)
        nbEcrituresSupprimees += (delByFolio || 0)
        // 2) Supprimer par ref_folio CLS-xxx (créé par auto_rapprocher phase finale)
        const refFolioCLS = `CLS-${releve_id}-${txIdx}`
        const { count: delByCLS } = await supabase
          .from('ecritures_comptables_v2')
          .delete({ count: 'exact' })
          .eq('societe_id', societe_id)
          .eq('ref_folio', refFolioCLS)
        nbEcrituresSupprimees += (delByCLS || 0)
        // 3) Supprimer par ancien code lettre (A043, CLS005, etc.)
        // oldLettre est lu AVANT la mise à jour de txs[txIdx] (ligne 3200)
        if (oldLettre && oldLettre !== code) {
          const { count: delByLettre } = await supabase
            .from('ecritures_comptables_v2')
            .delete({ count: 'exact' })
            .eq('societe_id', societe_id)
            .eq('lettre', oldLettre)
            .eq('journal', 'BNQ')
          nbEcrituresSupprimees += (delByLettre || 0)
        }
        if (nbEcrituresSupprimees > 0) {
          console.log(`[classer_transaction] ${nbEcrituresSupprimees} anciennes ecritures supprimees (ref_folio=${refFolio}|${refFolioCLS}, lettre=${oldLettre})`)
        }

        // R7 : pas de lettre sur comptes de résultat (6xxx/7xxx).
        // Le ref_folio assure la traçabilité, la lettre ne va que sur le 512.
        const compteClass = compte.charAt(0)
        const lettreOnCompte = (compteClass !== '6' && compteClass !== '7') ? code : null

        const ecrituresPayload = [
          {
            dossier_id: dossier.id, societe_id, date_ecriture: tx.date || new Date().toISOString().split('T')[0],
            journal: 'BNQ', numero_compte: compte,
            libelle: `${classification} — ${(tx.tiers_detecte || tx.libelle || '').substring(0, 60)}${deviseLabel}`,
            debit_mur: isOut ? txAmtMUR : 0, credit_mur: isOut ? 0 : txAmtMUR,
            lettre: lettreOnCompte, ref_folio: refFolio,
          },
          {
            dossier_id: dossier.id, societe_id, date_ecriture: tx.date || new Date().toISOString().split('T')[0],
            journal: 'BNQ', numero_compte: '512',
            libelle: `Banque${deviseLabel} — ${(tx.tiers_detecte || '').substring(0, 25)}`,
            debit_mur: isOut ? 0 : txAmtMUR, credit_mur: isOut ? txAmtMUR : 0,
            lettre: code, ref_folio: refFolio,
          },
        ]
        const { error: insEcrErr, data: insEcrData } = await supabase
          .from('ecritures_comptables_v2')
          .insert(ecrituresPayload)
          .select('id')
        if (insEcrErr) {
          // Cas idempotent : ecritures deja inserees pour ce ref_folio (re-click)
          if (/duplicate key value|unique constraint/i.test(String(insEcrErr.message || ''))) {
            ecrituresAlreadyExisted = true
            // Mettre a jour la classification sur les ecritures existantes (compte + lettre + classification)
            const { data: existing } = await supabase
              .from('ecritures_comptables_v2')
              .update({ lettre: code, numero_compte: compte })
              .eq('ref_folio', refFolio)
              .neq('numero_compte', '512')
              .select('id')
            // Update libelle pour refleter la nouvelle classification choisie
            await supabase
              .from('ecritures_comptables_v2')
              .update({ libelle: `${classification} — ${(tx.tiers_detecte || tx.libelle || '').substring(0, 60)}` })
              .eq('ref_folio', refFolio)
              .neq('numero_compte', '512')
            nbEcritures = (existing?.length || 0) + 1
            console.log(`[classer_transaction] ecritures deja existantes (re-click) pour ref_folio=${refFolio}, mises a jour avec nouvelle classif=${classification}`)
          } else {
            ecrituresError = insEcrErr.message
            console.error('[classer_transaction] insertion ecritures FAILED:', insEcrErr.message, insEcrErr)
          }
        } else {
          nbEcritures = insEcrData?.length || 2
          console.log('[classer_transaction] ecritures inserees:', nbEcritures)
        }
      }

      // === SYNC CCA : si classification = compte_courant_associe, creer/maj
      // le compte courant + le mouvement pour que la page CCA le voie ===
      let ccaSynced = false
      let ccaError: string | null = null
      if (classification === 'compte_courant_associe') {
        try {
          const tx = txs[txIdx]
          const nomAssocie = (tx.tiers_detecte || '').trim()
          if (!nomAssocie || nomAssocie.length < 3) {
            ccaError = 'Tiers absent ou trop court pour creer le CCA'
          } else {
            // Trouver ou creer le compte courant associe
            const { data: existingCompte } = await supabase
              .from('comptes_courants_associes')
              .select('id, solde')
              .eq('societe_id', societe_id)
              .ilike('nom', nomAssocie)
              .limit(1)
              .maybeSingle()

            let compteId: string | null = existingCompte?.id || null
            let currentSolde = Number(existingCompte?.solde || 0)

            if (!compteId) {
              const { data: newCompte, error: createErr } = await supabase
                .from('comptes_courants_associes')
                .insert({ societe_id, nom: nomAssocie, type: 'associe', solde: 0 })
                .select('id, solde')
                .single()
              if (createErr) {
                ccaError = `Impossible de creer le compte courant: ${createErr.message}`
              } else {
                compteId = newCompte.id
                currentSolde = 0
              }
            }

            if (compteId) {
              const montantOrig = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
              // Conversion en MUR : le solde du CCA doit etre coherent en MUR
              // meme si la tx est en EUR/USD/GBP. On convertit avec le taux.
              const montant = Math.round(montantOrig * tauxDevise * 100) / 100
              const isOut = (Number(tx.debit) || 0) > 0
              const type = isOut ? 'avance' : 'apport'
              const deltaSolde = isOut ? -montant : montant
              const conversionLabel = txDevise === 'MUR' ? '' : ` (${montantOrig.toFixed(2)} ${txDevise} @ ${tauxDevise})`
              const description = `${isOut ? 'Avance societe a associe' : 'Apport associe a societe'}${conversionLabel} — ${(tx.libelle || '').substring(0, 60)}`

              const { error: mvtErr } = await supabase
                .from('mouvements_compte_courant')
                .insert({
                  compte_courant_id: compteId,
                  societe_id,
                  date_mouvement: tx.date || new Date().toISOString().split('T')[0],
                  type,
                  montant,
                  description,
                })
              if (mvtErr) {
                ccaError = `Mouvement CCA non cree: ${mvtErr.message}`
              } else {
                // Mettre a jour le solde
                await supabase
                  .from('comptes_courants_associes')
                  .update({ solde: currentSolde + deltaSolde, updated_at: new Date().toISOString() })
                  .eq('id', compteId)
                ccaSynced = true
                console.log(`[classer_transaction] CCA synced: ${nomAssocie} type=${type} montant=${montant} nouveau_solde=${currentSolde + deltaSolde}`)
              }
            }
          }
        } catch (e: any) {
          ccaError = e.message
          console.error('[classer_transaction] CCA sync exception:', e)
        }
      }

      // === AUTO-LEARN : sauvegarder le pattern comme règle de classification ===
      let patternSaved = false
      let learnError: string | null = null
      try {
        const tx = txs[txIdx]
        const patternTiers = (learn_pattern?.tiers || tx.tiers_detecte || '').trim()
        if (!patternTiers || patternTiers.length < 3) {
          learnError = 'Pattern tiers trop court ou absent'
        } else {
          const { data: existing, error: existErr } = await supabase
            .from('classification_rules')
            .select('id')
            .eq('societe_id', societe_id)
            .eq('pattern_tiers', patternTiers)
            .eq('classification', classification)
            .maybeSingle()
          if (existErr && /does not exist/i.test(String(existErr.message || ''))) {
            learnError = 'Table classification_rules absente (migration 135 non appliquee)'
          } else if (existing) {
            patternSaved = true // Règle déjà présente = OK
            console.log(`[classer_transaction] regle existe deja pour "${patternTiers}" -> ${classification}`)
          } else {
            const ruleCode = `LEARN_${societe_id.substring(0, 8)}_${Date.now().toString(36)}`
            const { error: ruleErr } = await supabase.from('classification_rules').insert({
              rule_code: ruleCode,
              societe_id,
              priority: 100,
              active: true,
              pattern_libelle: null,
              pattern_tiers: patternTiers,
              classification,
              compte_debit: compte,
              compte_credit: '512',
              libelle_template: `${classification} — {{tiers}}`,
              requires_validation: false,
            })
            if (ruleErr) {
              learnError = ruleErr.message
              console.error('[classer_transaction] auto-learn insert FAILED:', ruleErr.message, ruleErr)
            } else {
              patternSaved = true
              console.log(`[classer_transaction] auto-learn: regle ${ruleCode} creee pour tiers="${patternTiers}" -> ${classification}`)
            }
          }
        }
      } catch (e: any) {
        learnError = e.message
        console.warn('[classer_transaction] auto-learn exception:', e.message)
      }

      // === PROPAGATION : appliquer la classification à toutes les tx similaires ===
      // Avec compteurs diagnostiques detaillés pour identifier pourquoi une tx
      // serait ecartee du lot. Match sur tiers_detecte OR tiers (fallback).
      let nbPropagated = 0
      let propagationError: string | null = null
      const propStats = { scanned: 0, skip_facture: 0, skip_already: 0, skip_tiers_vide: 0, skip_tiers_diff: 0, matched: 0 }
      const normalize = (s: string) => (s || '')
        .trim()
        .toLowerCase()
        .replace(/\b(mr|mrs|ms|mme|monsieur|madame|m\.|sir)\b/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (apply_to_similar) {
        try {
          const currentTx = txs[txIdx]
          const rawTiers = currentTx.tiers_detecte || currentTx.tiers || ''
          const targetTiers = normalize(rawTiers)
          console.log(`[classer_transaction] propagation demarree - raw="${rawTiers}" normalized="${targetTiers}"`)
          if (!targetTiers || targetTiers.length < 3) {
            propagationError = `Tiers trop court pour propager (raw="${rawTiers}", normalized="${targetTiers}")`
          } else {
            const { data: allReleves } = await supabase
              .from('releves_bancaires')
              .select('id, transactions_json, compte_bancaire_id')
              .eq('societe_id', societe_id)

            // Map relev_id -> devise du compte bancaire pour conversion MUR par tx
            const cbIds = Array.from(new Set((allReleves || []).map((r: any) => r.compte_bancaire_id).filter(Boolean)))
            const { data: cbData } = cbIds.length > 0
              ? await supabase.from('comptes_bancaires').select('id, devise').in('id', cbIds)
              : { data: [] }
            const deviseByCb: Record<string, string> = {}
            for (const c of cbData || []) deviseByCb[(c as any).id] = ((c as any).devise || 'MUR').toUpperCase()

            for (const rel of allReleves || []) {
              const relTxs = [...(rel.transactions_json || [])]
              let changed = false
              const relDevise = deviseByCb[(rel as any).compte_bancaire_id] || 'MUR'
              const relTauxDevise = rates[relDevise] || 1
              for (let i = 0; i < relTxs.length; i++) {
                const t = relTxs[i]
                if (rel.id === releve_id && i === txIdx) continue
                propStats.scanned++
                if (t.facture_id) { propStats.skip_facture++; continue }
                if (t.matched_type === classification) { propStats.skip_already++; continue }
                const rawTxTiers = t.tiers_detecte || t.tiers || ''
                const txTiers = normalize(rawTxTiers)
                if (!txTiers || txTiers.length < 3) { propStats.skip_tiers_vide++; continue }
                if (txTiers !== targetTiers) { propStats.skip_tiers_diff++; continue }
                // Match trouve - on classifie meme si matched_type commence par rule_
                // (l utilisateur a explicitement demande la propagation)
                propStats.matched++
                const propCode = `CL${String(Date.now()).slice(-6)}${i}`
                relTxs[i] = {
                  ...t,
                  statut: 'rapproche',
                  matched_type: classification,
                  lettre: propCode,
                  note: `Propage depuis ${transaction_id} (classifie manuellement en ${classification})`,
                }
                changed = true
                nbPropagated++
                if (dossier) {
                  const txAmtOrig = Math.max(Number(t.debit) || 0, Number(t.credit) || 0)
                  // Conversion en MUR par tx (devise du compte bancaire du releve)
                  const txAmt = Math.round(txAmtOrig * relTauxDevise * 100) / 100
                  const isOut = (Number(t.debit) || 0) > 0
                  const propRef = `CL-${rel.id}-${i}`
                  const devLbl = relDevise === 'MUR' ? '' : ` [${relDevise} @ ${relTauxDevise}]`
                  try {
                    const { error: insErr } = await supabase.from('ecritures_comptables_v2').insert([
                      {
                        dossier_id: dossier.id, societe_id,
                        date_ecriture: t.date || new Date().toISOString().split('T')[0],
                        journal: 'BNQ', numero_compte: compte,
                        libelle: `${classification} — ${(rawTxTiers || t.libelle || '').substring(0, 60)}${devLbl}`,
                        debit_mur: isOut ? txAmt : 0, credit_mur: isOut ? 0 : txAmt,
                        lettre: propCode, ref_folio: propRef,
                      },
                      {
                        dossier_id: dossier.id, societe_id,
                        date_ecriture: t.date || new Date().toISOString().split('T')[0],
                        journal: 'BNQ', numero_compte: '512',
                        libelle: `Banque${devLbl} — ${(rawTxTiers || '').substring(0, 25)}`,
                        debit_mur: isOut ? 0 : txAmt, credit_mur: isOut ? txAmt : 0,
                        lettre: propCode, ref_folio: propRef,
                      },
                    ])
                    if (insErr && !/duplicate key|unique constraint/i.test(String(insErr.message))) {
                      console.warn(`[propagation] ecritures insert failed for tx=${rel.id}-${i}:`, insErr.message)
                    }
                  } catch (e: any) {
                    console.warn(`[propagation] ecritures exception for tx=${rel.id}-${i}:`, e.message)
                  }

                  // CCA sync pour les tx propagees aussi
                  if (classification === 'compte_courant_associe' && rawTxTiers) {
                    try {
                      const { data: existingCcaProp } = await supabase
                        .from('comptes_courants_associes')
                        .select('id, solde')
                        .eq('societe_id', societe_id)
                        .ilike('nom', rawTxTiers.trim())
                        .limit(1)
                        .maybeSingle()
                      let ccaId = existingCcaProp?.id
                      let solde = Number(existingCcaProp?.solde || 0)
                      if (!ccaId) {
                        const { data: newCca } = await supabase
                          .from('comptes_courants_associes')
                          .insert({ societe_id, nom: rawTxTiers.trim(), type: 'associe', solde: 0 })
                          .select('id, solde')
                          .single()
                        ccaId = newCca?.id
                      }
                      if (ccaId) {
                        const delta = isOut ? -txAmt : txAmt
                        await supabase.from('mouvements_compte_courant').insert({
                          compte_courant_id: ccaId, societe_id,
                          date_mouvement: t.date || new Date().toISOString().split('T')[0],
                          type: isOut ? 'avance' : 'apport',
                          montant: txAmt,
                          description: `Propage (${classification}) ${relDevise !== 'MUR' ? `[${txAmtOrig.toFixed(2)} ${relDevise} @ ${relTauxDevise}]` : ''} — ${(t.libelle || '').substring(0, 60)}`,
                        })
                        await supabase.from('comptes_courants_associes')
                          .update({ solde: solde + delta, updated_at: new Date().toISOString() })
                          .eq('id', ccaId)
                      }
                    } catch (e: any) {
                      console.warn(`[propagation] CCA sync exception:`, e.message)
                    }
                  }
                }
              }
              if (changed) {
                await supabase.from('releves_bancaires').update({ transactions_json: relTxs }).eq('id', rel.id)
              }
            }
            console.log(`[classer_transaction] propagation: ${nbPropagated} tx classees avec tiers "${targetTiers}" = ${classification}. Stats=`, propStats)
          }
        } catch (e: any) {
          propagationError = e.message
          console.error('[classer_transaction] propagation FAILED:', e)
        }
      }

      return NextResponse.json({
        success: true,
        lettre: code,
        classification,
        nb_ecritures: nbEcritures,
        ecritures_already_existed: ecrituresAlreadyExisted,
        pattern_saved: patternSaved,
        cca_synced: ccaSynced,
        nb_propagated: nbPropagated,
        propagation_stats: apply_to_similar ? propStats : undefined,
        warnings: {
          ecritures: ecrituresError,
          learn: learnError,
          propagation: propagationError,
          cca: ccaError,
        },
      })
    }

    // === CLOTURER MOIS — Verifie invariants + cree bank_reconciliation + verrouille ===
    // body: { societe_id, mois: 'YYYY-MM', force?: boolean }
    // Invariants :
    //   - Aucune tx non_identifie ou a_verifier dans le mois
    //   - Aucune ecriture 401/411 non lettree du mois
    //   - Solde 580 = 0 (virements internes soldes)
    // Si force=true, cree quand meme en mode 'draft' avec warnings.
    if (action === 'cloturer_mois') {
      const { societe_id, mois, force } = body
      if (!societe_id || !mois) {
        return NextResponse.json({ error: 'societe_id et mois (YYYY-MM) requis' }, { status: 400 })
      }
      if (!/^\d{4}-\d{2}$/.test(mois)) {
        return NextResponse.json({ error: 'Format mois invalide - attendu YYYY-MM' }, { status: 400 })
      }

      const [annee, moisNum] = mois.split('-').map(Number)
      const period_start = `${annee}-${String(moisNum).padStart(2, '0')}-01`
      const lastDay = new Date(annee, moisNum, 0).getDate()
      const period_end = `${annee}-${String(moisNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      // === Verification des invariants ===
      const invariants: { check: string; ok: boolean; details?: string }[] = []

      // 1. Transactions bancaires du mois
      const { data: releves } = await supabase
        .from('releves_bancaires').select('id, transactions_json, compte_bancaire_id').eq('societe_id', societe_id)
      let tx_non_identifie = 0
      let tx_a_verifier = 0
      let tx_total_mois = 0
      for (const r of releves || []) {
        for (const tx of ((r as any).transactions_json || [])) {
          const d = tx.date || ''
          if (d.substring(0, 7) !== mois) continue
          tx_total_mois++
          if (tx.statut === 'non_identifie') tx_non_identifie++
          else if (tx.statut === 'a_verifier') tx_a_verifier++
        }
      }
      invariants.push({
        check: 'Aucune transaction non identifiee',
        ok: tx_non_identifie === 0,
        details: tx_non_identifie > 0 ? `${tx_non_identifie} tx en statut non_identifie` : undefined,
      })
      invariants.push({
        check: 'Aucune transaction a verifier',
        ok: tx_a_verifier === 0,
        details: tx_a_verifier > 0 ? `${tx_a_verifier} tx en statut a_verifier` : undefined,
      })

      // 2. Ecritures 401/411 non lettrees du mois
      const { data: dossierClosure } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
      let ecr_non_lettrees = 0
      let solde_580 = 0
      if (dossierClosure) {
        const { data: ecrs } = await supabase
          .from('ecritures_comptables_v2')
          .select('numero_compte, debit_mur, credit_mur, lettre')
          .eq('dossier_id', dossierClosure.id)
          .gte('date_ecriture', period_start)
          .lte('date_ecriture', period_end)
        for (const e of ecrs || []) {
          const c = String(e.numero_compte || '')
          if (!e.lettre && (c.startsWith('401') || c.startsWith('411'))) ecr_non_lettrees++
          if (c.startsWith('580')) solde_580 += (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0)
        }
      }
      invariants.push({
        check: 'Toutes ecritures 401/411 du mois lettrees',
        ok: ecr_non_lettrees === 0,
        details: ecr_non_lettrees > 0 ? `${ecr_non_lettrees} ecritures 401/411 non lettrees` : undefined,
      })
      invariants.push({
        check: 'Solde 580 (virements internes) = 0',
        ok: Math.abs(solde_580) < 0.01,
        details: Math.abs(solde_580) >= 0.01 ? `Solde restant : ${solde_580.toFixed(2)} MUR` : undefined,
      })

      const allOk = invariants.every(i => i.ok)
      const failedChecks = invariants.filter(i => !i.ok)

      if (!allOk && !force) {
        return NextResponse.json({
          error: 'Invariants non respectes - classez toutes les transactions et lettrez les ecritures avant la cloture',
          invariants,
          blockers: failedChecks.map(f => f.check + (f.details ? ` (${f.details})` : '')),
        }, { status: 400 })
      }

      // === Creer ou mettre a jour bank_reconciliations pour chaque compte bancaire ===
      const compteBancaireIds = Array.from(new Set((releves || []).map((r: any) => r.compte_bancaire_id).filter(Boolean)))
      const createdReconciliations: any[] = []
      for (const cbId of compteBancaireIds) {
        const { data: cb } = await supabase.from('comptes_bancaires')
          .select('compte_comptable').eq('id', cbId).single()
        const numeroCompteCompta = cb?.compte_comptable || '512'

        // GL balance au period_end
        let gl_balance = 0
        if (dossierClosure) {
          const { data: ecrGl } = await supabase
            .from('ecritures_comptables_v2')
            .select('debit_mur, credit_mur')
            .eq('dossier_id', dossierClosure.id)
            .eq('numero_compte', numeroCompteCompta)
            .lte('date_ecriture', period_end)
          gl_balance = (ecrGl || []).reduce((s: number, e: any) => s + (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0), 0)
          gl_balance = Math.round(gl_balance * 100) / 100
        }

        const { data: reconCreated, error: reconErr } = await supabase.from('bank_reconciliations').upsert({
          societe_id, compte_bancaire_id: cbId,
          numero_compte_compta: numeroCompteCompta,
          period_start, period_end,
          bank_balance: 0, // A saisir manuellement si besoin dans le tableau officiel
          gl_balance,
          adjusted_bank_balance: 0,
          adjusted_gl_balance: gl_balance,
          residual_gap: -gl_balance,
          status: allOk ? 'validated' : 'draft',
          prepared_by: user.id,
          validated_by: allOk ? user.id : null,
          validated_at: allOk ? new Date().toISOString() : null,
        }, { onConflict: 'societe_id,compte_bancaire_id,period_end' }).select().single()

        if (!reconErr && reconCreated) createdReconciliations.push(reconCreated)
      }

      // === Verrouiller accounting_periods (seulement si invariants OK) ===
      let periodLocked = false
      if (allOk) {
        const { error: lockErr } = await supabase.from('accounting_periods').upsert({
          societe_id, period_start, period_end,
          status: 'locked',
          closed_by: user.id,
          closed_at: new Date().toISOString(),
        }, { onConflict: 'societe_id,period_end' })
        if (!lockErr) periodLocked = true
      }

      return NextResponse.json({
        success: true,
        mois,
        period_start, period_end,
        all_invariants_ok: allOk,
        invariants,
        stats: { tx_total_mois, tx_non_identifie, tx_a_verifier, ecr_non_lettrees, solde_580 },
        reconciliations_created: createdReconciliations.length,
        period_locked: periodLocked,
        forced: !!force,
      })
    }

    // === REMBOURSER NOTE DE FRAIS (NDF) EMPLOYE ===
    // Cree l ecriture comptable : D 425 Avances personnel / C 512 Banque
    // Avec lien optionnel a un employe_id + description de la depense.
    // Le montant est converti MUR selon la devise du compte bancaire.
    if (action === 'rembourser_employe') {
      const { transaction_id, releve_id, societe_id, employe_id, employe_nom, description, compte_charge } = body
      if (!releve_id || !transaction_id || !societe_id) {
        return NextResponse.json({ error: 'releve_id, transaction_id, societe_id requis' }, { status: 400 })
      }

      const { data: releve } = await supabase
        .from('releves_bancaires')
        .select('id, transactions_json, compte_bancaire_id')
        .eq('id', releve_id).single()
      if (!releve) return NextResponse.json({ error: 'Releve non trouve' }, { status: 404 })

      const { data: cb } = await supabase
        .from('comptes_bancaires').select('devise').eq('id', releve.compte_bancaire_id).maybeSingle()
      const devise = (cb?.devise || 'MUR').toUpperCase()
      const rates: Record<string, number> = await getTauxChange().catch(() => ({ MUR: 1, EUR: 46.50, USD: 44.80, GBP: 54.20 }))
      const taux = rates[devise] || 1

      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx >= txs.length) return NextResponse.json({ error: 'Transaction non trouvee' }, { status: 404 })

      // Verif periode non verrouillee
      const txDate = txs[txIdx]?.date
      if (txDate) {
        const lockStatus = await checkPeriodLock(supabase, societe_id, txDate)
        if (lockStatus.locked) {
          return NextResponse.json({ error: `Periode verrouillee — ${lockStatus.reason}` }, { status: 403 })
        }
      }

      const tx = txs[txIdx]
      const montantOrig = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
      const montantMUR = Math.round(montantOrig * taux * 100) / 100

      // Employe optionnel
      let employeInfo = null
      if (employe_id) {
        const { data: emp } = await supabase.from('employes').select('id, nom, prenom').eq('id', employe_id).single()
        if (emp) employeInfo = emp
      }
      const nomEmploye = employeInfo
        ? `${employeInfo.prenom || ''} ${employeInfo.nom || ''}`.trim()
        : (employe_nom || 'Employé')

      const code = `NDF${String(Date.now()).slice(-6)}`
      const compteDebit = compte_charge || '425' // 425 Avances personnel par defaut
      const refFolio = `NDF-${releve_id}-${txIdx}`

      // Marquer la transaction
      txs[txIdx] = {
        ...tx,
        statut: 'rapproche',
        matched_type: 'remboursement_personnel',
        lettre: code,
        employe_id: employeInfo?.id || null,
        employe_nom: nomEmploye,
        note: `Remboursement ${nomEmploye} — ${description || 'Note de frais'}`,
      }
      await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)

      // Ecritures BNQ : D 425 (ou compte_charge) / C 512
      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
      if (dossier) {
        const devLbl = devise === 'MUR' ? '' : ` [${devise} @ ${taux}]`
        await supabase.from('ecritures_comptables_v2').insert([
          {
            dossier_id: dossier.id, societe_id,
            date_ecriture: tx.date || new Date().toISOString().split('T')[0],
            journal: 'BNQ', numero_compte: compteDebit,
            libelle: `Remboursement ${nomEmploye} — ${(description || 'NDF').substring(0, 60)}${devLbl}`,
            debit_mur: montantMUR, credit_mur: 0,
            lettre: code, ref_folio: refFolio,
          },
          {
            dossier_id: dossier.id, societe_id,
            date_ecriture: tx.date || new Date().toISOString().split('T')[0],
            journal: 'BNQ', numero_compte: '512',
            libelle: `Banque${devLbl} — Remboursement ${nomEmploye.substring(0, 40)}`,
            debit_mur: 0, credit_mur: montantMUR,
            lettre: code, ref_folio: refFolio,
          },
        ])
      }

      return NextResponse.json({
        success: true,
        lettre: code,
        montant_mur: montantMUR,
        devise,
        employe: nomEmploye,
        compte: compteDebit,
      })
    }

    // ── annuler_paiement_factures : remettre N factures en "en_attente" ──
    // Remet le statut, clear rapproche_*, et délettrer les tx bancaires associées.
    // Si facture_ids = ['ALL'], remet TOUTES les factures + TOUTES les tx bancaires
    // à zéro pour la société (reset complet du rapprochement).
    if (action === 'annuler_paiement_factures') {
      const { societe_id: socId, facture_ids } = body
      if (!socId) {
        return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      }

      const isResetAll = Array.isArray(facture_ids) && facture_ids.length === 1 && facture_ids[0] === 'ALL'

      // 1. Remettre les factures en attente
      let resetQuery = supabase
        .from('factures')
        .update({
          statut: 'en_attente',
          rapproche_releve_id: null,
          rapproche_transaction_idx: null,
          rapproche_date: null,
          rapproche_source: null,
        })
        .eq('societe_id', socId)
        .neq('statut', 'annule')
        .neq('statut', 'brouillon')

      if (!isResetAll && Array.isArray(facture_ids) && facture_ids.length > 0) {
        resetQuery = resetQuery.in('id', facture_ids)
      }

      const { data: resetData, error: resetErr } = await resetQuery.select('id')
      if (resetErr) {
        return NextResponse.json({ error: resetErr.message }, { status: 500 })
      }

      // 2. Remettre TOUTES les tx bancaires à non_identifie
      // (pas seulement celles liées aux factures, car les tx auto-classifiées
      // Phase 1/3 ne sont liées à aucune facture mais bloquent le re-rapprochement)
      let txReset = 0
      const { data: releves } = await supabase
        .from('releves_bancaires')
        .select('id, transactions_json')
        .eq('societe_id', socId)

      for (const rel of releves || []) {
        const txs = [...(rel.transactions_json || [])]
        let changed = false
        for (let i = 0; i < txs.length; i++) {
          const tx = txs[i]
          if (!tx) continue
          // Garder les virements internes (ils sont corrects)
          if (tx.statut === 'interne' || tx.matched_type === 'transfert_interne') continue
          // Tout le reste → non_identifie
          if (tx.statut === 'rapproche' || tx.statut === 'propose' || tx.lettre || tx.facture_id || tx.facture_ids || tx.matched_type) {
            const { lettre, facture_id, facture_ids: fids, ecriture_id, matched_type, match_confidence, note, rapproche_at, rapprochement_multi, nb_factures, ecart_montant, ...rest } = tx
            txs[i] = { ...rest, statut: 'non_identifie' }
            changed = true
            txReset++
          }
        }
        if (changed) {
          await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', rel.id)
        }
      }

      // 3. Supprimer les écritures BNQ liées au rapprochement
      const { count: ecrituresDeleted } = await supabase
        .from('ecritures_comptables_v2')
        .delete({ count: 'exact' })
        .eq('societe_id', socId)
        .eq('journal', 'BNQ')

      return NextResponse.json({
        ok: true,
        nb_factures_reset: (resetData || []).length,
        nb_tx_delettrees: txReset,
        nb_ecritures_supprimees: ecrituresDeleted || 0,
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
