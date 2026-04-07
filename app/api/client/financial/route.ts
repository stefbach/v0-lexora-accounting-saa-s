import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTauxChange } from '@/lib/taux-change'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function convertToMUR(amount: number, devise: string, rates: Record<string, number>): number {
  if (!devise || devise === 'MUR') return amount
  const key = devise.toUpperCase()
  const rate = rates[key]
  if (rate) return amount * rate
  return amount
}

// Helper: parse exercice string to date range
// Mauritius fiscal year: July 1 to June 30 (e.g., "2025-2026" = 2025-07-01 to 2026-06-30)
function parseExerciceDates(exercice: string): { debut: string; fin: string } | null {
  const match = exercice.match(/^(\d{4})-(\d{4})$/)
  if (!match) return null
  const startYear = parseInt(match[1])
  const endYear = parseInt(match[2])
  return { debut: `${startYear}-07-01`, fin: `${endYear}-06-30` }
}

function getCurrentExercice(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (month >= 7) return `${year}-${year + 1}`
  return `${year - 1}-${year}`
}

function getPreviousExercice(exercice: string): string {
  const match = exercice.match(/^(\d{4})-(\d{4})$/)
  if (!match) {
    const current = getCurrentExercice()
    const y = parseInt(current.split('-')[0])
    return `${y - 1}-${y}`
  }
  const startYear = parseInt(match[1])
  return `${startYear - 1}-${startYear}`
}

function getAvailableExercices(): string[] {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const currentStart = month >= 7 ? year : year - 1
  const exercices: string[] = []
  for (let i = 0; i < 5; i++) {
    const s = currentStart - i
    exercices.push(`${s}-${s + 1}`)
  }
  return exercices
}

// GET — Aggregated financial data for a client
// For clients: returns their own data
// For comptables: accepts ?client_id=xxx to view a client's data
// Supports ?exercice=2025-2026 and ?date_debut=...&date_fin=... for period filtering
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = getAdminClient()
    const rates = await getTauxChange()

    // Determine which client's data to fetch
    const { searchParams } = new URL(request.url)
    const requestedClientId = searchParams.get('client_id')

    // Exercice / date range filtering
    const requestedExercice = searchParams.get('exercice')
    const requestedDateDebut = searchParams.get('date_debut')
    const requestedDateFin = searchParams.get('date_fin')

    let dateFilter: { debut: string; fin: string } | null = null
    let exerciceActuel = getCurrentExercice()

    if (requestedExercice) {
      dateFilter = parseExerciceDates(requestedExercice)
      exerciceActuel = requestedExercice
    } else if (requestedDateDebut && requestedDateFin) {
      dateFilter = { debut: requestedDateDebut, fin: requestedDateFin }
    }

    const exercicePrecedent = getPreviousExercice(exerciceActuel)

    let targetClientId = user.id

    if (requestedClientId && requestedClientId !== user.id) {
      // Verify the logged-in user is a comptable
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!profile || !['comptable', 'comptable_dedie', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
      }
      targetClientId = requestedClientId
    }

    // Get client's dossiers, optionally filtered by société
    const requestedSocieteId = searchParams.get('societe_id')
    let dossierQuery = supabase.from('dossiers').select('id, societe_id').eq('client_id', targetClientId)
    if (requestedSocieteId) dossierQuery = dossierQuery.eq('societe_id', requestedSocieteId)
    const { data: dossiers } = await dossierQuery

    let allDossierIds: string[] = (dossiers || []).map(d => d.id)
    let societeIds: string[]

    if (requestedSocieteId) {
      // When a specific société is requested, use only that ID
      societeIds = [requestedSocieteId]
      // Include shared dossiers for that société only
      const { data: sharedDossiers } = await supabase
        .from('dossiers').select('id, societe_id').eq('societe_id', requestedSocieteId)
      if (sharedDossiers) {
        allDossierIds = [...new Set([...allDossierIds, ...sharedDossiers.map(d => d.id)])]
      }
    } else {
      // No filter: include all sociétés owned by client + from dossiers
      const { data: ownedSocietes } = await supabase
        .from('societes').select('id')
        .eq('created_by', targetClientId)

      societeIds = [...new Set([
        ...(dossiers || []).map(d => d.societe_id),
        ...(ownedSocietes || []).map(s => s.id),
      ].filter(Boolean))]

      if (dossiers && dossiers.length > 0) {
        const { data: sharedDossiers } = await supabase
          .from('dossiers').select('id, societe_id').in('societe_id', societeIds)
        if (sharedDossiers) {
          allDossierIds = [...new Set([...allDossierIds, ...sharedDossiers.map(d => d.id)])]
          societeIds = [...new Set([...societeIds, ...sharedDossiers.map(d => d.societe_id)])]
        }
      }
    }

    if (societeIds.length === 0) {
      return NextResponse.json({ financial: emptyFinancial() })
    }

    const dossierIds = allDossierIds

    // Get all société names for the filter dropdown
    const { data: ownedSocietesInfo } = await supabase
      .from('societes').select('id, nom').in('id', societeIds)
    const availableSocietes = (ownedSocietesInfo || [])
      .map((s: any) => ({ id: s.id, nom: s.nom }))

    // Get all accounting entries — depuis v2 en priorité, sinon v1
    let ecrituresV2Query = supabase
      .from('ecritures_comptables_v2').select('*').in('societe_id', societeIds)
      .order('date_ecriture', { ascending: false })
    if (dateFilter) {
      ecrituresV2Query = ecrituresV2Query.gte('date_ecriture', dateFilter.debut).lte('date_ecriture', dateFilter.fin)
    }
    const { data: ecrituresV2 } = await ecrituresV2Query

    let ecrituresV1Result: { data: any[] | null } = { data: [] }
    if (allDossierIds.length > 0) {
      let v1Query = supabase
        .from('ecritures_comptables').select('*').in('dossier_id', allDossierIds)
        .order('date_ecriture', { ascending: false })
      if (dateFilter) {
        v1Query = v1Query.gte('date_ecriture', dateFilter.debut).lte('date_ecriture', dateFilter.fin)
      }
      ecrituresV1Result = await v1Query
    }
    const ecrituresV1 = ecrituresV1Result.data

    // Fusionner v1 + v2 (v2 prioritaire, normaliser les noms de colonnes)
    const ecrituresFromV2 = (ecrituresV2 || []).map((e: any) => ({
      ...e,
      compte: e.numero_compte,
      debit: e.debit_mur,
      credit: e.credit_mur,
    }))
    const ecrituresFromV1 = (ecrituresV1 || []).map((e: any) => ({
      ...e,
      numero_compte: e.compte,
      debit_mur: e.debit,
      credit_mur: e.credit,
    }))
    const ecritures = ecrituresV2 && ecrituresV2.length > 0 ? ecrituresFromV2 : ecrituresFromV1

    // Get processed documents
    const { data: documents } = await supabase
      .from('documents').select('id, nom_fichier, type_document, statut, n8n_result, created_at, societe_detectee')
      .in('dossier_id', dossierIds).eq('statut', 'traite')
      .order('created_at', { ascending: false })

    // Get bank accounts
    const { data: comptesBank } = await supabase
      .from('comptes_bancaires').select('*').in('societe_id', societeIds).eq('actif', true)

    // Get TVA records
    const { data: tvaRecords } = await supabase
      .from('tva_mensuelle').select('*').in('societe_id', societeIds)
      .order('periode', { ascending: false })

    // Get factures from table (source of truth for CA/dépenses)
    let facturesFromTable: any[] = []
    let facturesQuery = supabase
      .from('factures').select('*').in('societe_id', societeIds)
      .order('date_facture', { ascending: false })
    if (dateFilter) {
      facturesQuery = facturesQuery.gte('date_facture', dateFilter.debut).lte('date_facture', dateFilter.fin)
    }
    const { data: facturesData, error: facturesErr } = await facturesQuery
    if (!facturesErr) facturesFromTable = facturesData || []

    // Compute CA and dépenses from factures table (more reliable than écritures)
    const caFromFactures = facturesFromTable
      .filter(f => f.type_facture === 'client' && f.statut !== 'annule')
      .reduce((s, f) => s + (Number(f.montant_mur) || convertToMUR(Number(f.montant_ttc) || 0, f.devise || 'MUR', rates)), 0)

    const depensesFromFactures = facturesFromTable
      .filter(f => f.type_facture === 'fournisseur' && f.statut !== 'annule')
      .reduce((s, f) => s + (Number(f.montant_mur) || convertToMUR(Number(f.montant_ttc) || 0, f.devise || 'MUR', rates)), 0)

    const allEcritures = ecritures || []
    const allDocs = documents || []

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentMonthEcritures = allEcritures.filter(e => e.date_ecriture?.startsWith(currentMonth))

    // === COMPUTE FINANCIAL METRICS ===

    // Exclude incomplete month payroll: SAL/OD-PAIE entries in current month
    const currentMonthFirst = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const isPayrollCurrentMonth = (e: any) =>
      (e.journal === 'SAL' || e.journal === 'OD-PAIE') && e.date_ecriture >= currentMonthFirst

    // Revenue: class 7 accounts
    const totalRevenue = allEcritures
      .filter(e => e.compte?.startsWith('7'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const monthlyRevenue = currentMonthEcritures
      .filter(e => e.compte?.startsWith('7'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    // Expenses: class 6 accounts (exclude incomplete month payroll)
    const totalExpenses = allEcritures
      .filter(e => e.compte?.startsWith('6') && !isPayrollCurrentMonth(e))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    const monthlyExpenses = currentMonthEcritures
      .filter(e => e.compte?.startsWith('6'))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    // TVA from ecritures: 4457 = collected, 4456 = deductible
    const tvaCollectee = allEcritures
      .filter(e => e.compte?.startsWith('4457'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const tvaDeductible = allEcritures
      .filter(e => e.compte?.startsWith('4456'))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    const tvaNette = tvaCollectee - tvaDeductible

    // Bank balances with currency conversion
    const societeNameMap: Record<string, string> = {}
    availableSocietes.forEach((s: any) => { societeNameMap[s.id] = s.nom })
    const bankAccounts = (comptesBank || []).map(c => ({
      id: c.id, banque: c.banque, nom_compte: c.nom_compte,
      numero_compte: c.numero_compte, iban: c.iban,
      date_dernier_releve: c.date_dernier_releve, societe_id: c.societe_id,
      societe_nom: societeNameMap[c.societe_id] || null,
      devise: c.devise, solde_actuel: Number(c.solde_actuel) || 0,
      solde_mur: convertToMUR(Number(c.solde_actuel) || 0, c.devise, rates),
    }))
    const totalBankMUR = bankAccounts.reduce((s, a) => s + a.solde_mur, 0)

    // Revenue breakdown by account prefix — from factures if available, else from écritures
    let revenueByAccount: Record<string, number> = {}
    let expensesByAccount: Record<string, number> = {}

    if (facturesFromTable.length > 0) {
      // Build revenue/expense breakdown from factures (amounts already in MUR)
      facturesFromTable.filter(f => f.type_facture === 'client' && f.statut !== 'annule').forEach(f => {
        const prefix = '706' // Default: prestations de services
        const mur = Number(f.montant_mur) || convertToMUR(Number(f.montant_ht) || 0, f.devise || 'MUR', rates)
        revenueByAccount[prefix] = (revenueByAccount[prefix] || 0) + mur
      })
      facturesFromTable.filter(f => f.type_facture === 'fournisseur' && f.statut !== 'annule').forEach(f => {
        const prefix = '628' // Default: charges diverses
        const mur = Number(f.montant_mur) || convertToMUR(Number(f.montant_ht) || 0, f.devise || 'MUR', rates)
        expensesByAccount[prefix] = (expensesByAccount[prefix] || 0) + mur
      })
    } else {
      // Fallback: from écritures (may be in foreign currency — not ideal)
      allEcritures.filter(e => e.compte?.startsWith('7')).forEach(e => {
        const prefix = (e.compte || '7').substring(0, 3)
        revenueByAccount[prefix] = (revenueByAccount[prefix] || 0) + (Number(e.credit) || 0) - (Number(e.debit) || 0)
      })
      allEcritures.filter(e => e.compte?.startsWith('6')).forEach(e => {
        const prefix = (e.compte || '6').substring(0, 3)
        expensesByAccount[prefix] = (expensesByAccount[prefix] || 0) + (Number(e.debit) || 0) - (Number(e.credit) || 0)
      })
    }

    // === BILAN: calculate from factures (MUR) when available, else from écritures ===

    // Créances clients (compte 411) — from unpaid factures client (montant_mur)
    let creances = 0
    const facturesClientImpayees = facturesFromTable.filter(f => f.type_facture === 'client' && f.statut !== 'paye' && f.statut !== 'annule')
    if (facturesClientImpayees.length > 0) {
      creances = facturesClientImpayees.reduce((s, f) => s + (Number(f.montant_mur) || convertToMUR(Number(f.montant_ttc) || 0, f.devise || 'MUR', rates)), 0)
    } else {
      creances = allEcritures
        .filter(e => e.compte?.startsWith('41'))
        .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)
    }

    // Dettes fournisseurs (compte 401) — from unpaid factures fournisseur
    let dettesFournisseurs = 0
    const facturesFournImpayees = facturesFromTable.filter(f => f.type_facture === 'fournisseur' && f.statut !== 'paye' && f.statut !== 'annule')
    if (facturesFournImpayees.length > 0) {
      dettesFournisseurs = facturesFournImpayees.reduce((s, f) => s + (Number(f.montant_mur) || convertToMUR(Number(f.montant_ttc) || 0, f.devise || 'MUR', rates)), 0)
    } else {
      dettesFournisseurs = allEcritures
        .filter(e => e.compte?.startsWith('40'))
        .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)
    }

    // Monthly revenue for last 2 months for trend
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`
    const lastMonthRevenue = allEcritures
      .filter(e => e.compte?.startsWith('7') && e.date_ecriture?.startsWith(lastMonthStr))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const lastMonthExpenses = allEcritures
      .filter(e => e.compte?.startsWith('6') && e.date_ecriture?.startsWith(lastMonthStr))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    // Payroll — P&L accounts (641 = salaires, 645 = charges patronales)
    // Exclude incomplete current month payroll
    const salaires = allEcritures
      .filter(e => e.compte?.startsWith('641') && !isPayrollCurrentMonth(e))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    const chargesSociales = allEcritures
      .filter(e => (e.compte?.startsWith('645') || e.compte?.startsWith('43')) && !isPayrollCurrentMonth(e))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    // Balance sheet items (from écritures — these are less impacted by currency)
    const immobilisations = allEcritures
      .filter(e => e.compte?.startsWith('2'))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    const stocks = allEcritures
      .filter(e => e.compte?.startsWith('3'))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    const autresCreances = allEcritures
      .filter(e => e.compte?.startsWith('46') || e.compte?.startsWith('47'))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    const capitauxPropres = allEcritures
      .filter(e => e.compte?.startsWith('1'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const emprunts = allEcritures
      .filter(e => e.compte?.startsWith('16'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    // dettesFournisseurs already computed above from factures

    const dettesFiscales = allEcritures
      .filter(e => e.compte?.startsWith('44'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const dettesSociales = allEcritures
      .filter(e => e.compte?.startsWith('43'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    // Extract bank transactions — source 1: releves_bancaires table (transactions_json)
    const bankTransactions: any[] = []

    const { data: relevesDB } = await supabase
      .from('releves_bancaires')
      .select('id, transactions_json, date_debut, date_fin, compte_bancaire_id')
      .in('societe_id', societeIds)
      .order('date_fin', { ascending: false })

    // Build a map of compte_bancaire_id → { banque, devise }
    const compteBankMap: Record<string, { banque: string; devise: string }> = {}
    ;(comptesBank || []).forEach((c: any) => {
      compteBankMap[c.id] = { banque: c.banque, devise: c.devise || 'MUR' }
    })

    if (relevesDB && relevesDB.length > 0) {
      relevesDB.forEach((releve: any) => {
        const compteInfo = compteBankMap[releve.compte_bancaire_id] || { banque: '—', devise: 'MUR' }
        const txDevise = compteInfo.devise || 'MUR'
        const txRate = rates[txDevise] || 1
        const txs: any[] = releve.transactions_json || []
        txs.forEach((tx: any, idx: number) => {
          const debit = Number(tx.debit) || 0
          const credit = Number(tx.credit) || 0
          bankTransactions.push({
            id: `releve-${releve.id}-tx-${idx}`,
            date: tx.date || tx.date_operation || '',
            libelle: tx.libelle || tx.description || '',
            debit,
            credit,
            debit_mur: Math.round(debit * txRate * 100) / 100,
            credit_mur: Math.round(credit * txRate * 100) / 100,
            devise: txDevise,
            solde_apres: tx.solde_apres ?? tx.solde ?? null,
            tiers: tx.tiers_detecte || tx.tiers || tx.tiers_identifie || null,
            compte_comptable: tx.compte_comptable || tx.compte || null,
            statut: tx.statut || 'non_identifie',
            banque: compteInfo.banque,
            compte_bancaire_id: releve.compte_bancaire_id,
          })
        })
      })
    }

    // Source 2: fallback from documents n8n_result (if releves_bancaires is empty)
    if (bankTransactions.length === 0) {
      allDocs
        .filter(d => d.type_document === 'releve_bancaire')
        .forEach(d => {
          const extraction = d.n8n_result?.extraction || {}
          const transactions = extraction.transactions || []
          transactions.forEach((tx: any, idx: number) => {
            bankTransactions.push({
              id: `${d.id}-tx-${idx}`,
              document_id: d.id,
              date: tx.date || tx.date_operation || '',
              libelle: tx.libelle || tx.description || '',
              debit: Number(tx.debit) || 0,
              credit: Number(tx.credit) || 0,
              solde_apres: tx.solde_apres ?? tx.solde ?? null,
              tiers: tx.tiers_detecte || tx.tiers || tx.tiers_identifie || null,
              compte_comptable: tx.compte_comptable || tx.compte || null,
              statut: tx.statut || 'non_identifie',
            })
          })
        })
    }

    // Also update bankAccounts from releves_bancaires solde_cloture if comptes_bancaires is empty
    if (bankAccounts.length === 0 && relevesDB && relevesDB.length > 0) {
      // Get latest releve per societe to build synthetic bank accounts
      const latestReleve = relevesDB[0] as any
      if (latestReleve) {
        const { data: docsForBankName } = await supabase
          .from('documents')
          .select('n8n_result')
          .in('dossier_id', dossierIds)
          .eq('type_document', 'releve_bancaire')
          .eq('statut', 'traite')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const bankName = docsForBankName?.n8n_result?.extraction?.banque || 'Banque'
        const socleCloture = (docsForBankName?.n8n_result?.extraction?.solde_cloture) ?? 0
        if (socleCloture !== 0 || bankName !== 'Banque') {
          bankAccounts.push({
            id: 'synthetic',
            banque: bankName,
            nom_compte: bankName,
            devise: docsForBankName?.n8n_result?.extraction?.devise || 'MUR',
            solde_actuel: Number(socleCloture),
            solde_mur: Number(socleCloture),
            date_dernier_releve: docsForBankName?.n8n_result?.extraction?.periode_fin || null,
          })
        }
      }
    }

    // Sort bank transactions by date descending
    bankTransactions.sort((a, b) => {
      if (!a.date) return 1
      if (!b.date) return -1
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })

    // Extract invoices from documents with currency conversion
    const extractedInvoices = allDocs
      .filter(d => d.type_document === 'facture_fournisseur' || d.type_document === 'facture_client')
      .map(d => {
        const ext = d.n8n_result?.extraction || {}
        const devise = (ext.devise || 'MUR').replace(/[^A-Za-z]/g, '').toUpperCase() || 'MUR'
        const montant_ttc = Number(ext.montant_ttc) || 0
        const montant_ht = Number(ext.montant_ht) || 0
        const montant_tva = Number(ext.montant_tva) || 0
        return {
          id: d.id, type: d.type_document, nom_fichier: d.nom_fichier,
          emetteur: ext.emetteur || '', destinataire: ext.destinataire || '',
          date: ext.date_document || d.created_at, numero: ext.numero_reference || '',
          devise,
          montant_ht, montant_tva, montant_ttc,
          montant_ttc_mur: convertToMUR(montant_ttc, devise, rates),
          montant_ht_mur: convertToMUR(montant_ht, devise, rates),
          montant_tva_mur: convertToMUR(montant_tva, devise, rates),
          lignes: ext.lignes || [],
        }
      })

    // Revenue: use factures clients (MUR) as primary, fallback to écritures classe 7
    // Expenses: ALWAYS use écritures classe 6 (includes salaires, charges, all operational costs)
    // Factures fournisseurs are a subset — they miss salaires (641), charges sociales (645), etc.
    const finalCA = caFromFactures > 0 ? caFromFactures : totalRevenue
    const finalDepenses = totalExpenses > 0 ? totalExpenses : depensesFromFactures
    const finalResultat = finalCA - finalDepenses

    return NextResponse.json({
      financial: {
        // CA/Dépenses: factures table (MUR) prend priorité sur écritures comptables
        totalRevenue: Math.round(finalCA * 100) / 100,
        monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
        totalExpenses: Math.round(finalDepenses * 100) / 100,
        monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
        resultat: Math.round(finalResultat * 100) / 100,
        resultatMensuel: Math.round((monthlyRevenue - monthlyExpenses) * 100) / 100,
        // Source info
        caSource: caFromFactures > 0 ? 'factures' : 'ecritures',
        caFromFactures: Math.round(caFromFactures * 100) / 100,
        caFromEcritures: Math.round(totalRevenue * 100) / 100,
        depensesFromFactures: Math.round(depensesFromFactures * 100) / 100,
        depensesFromEcritures: Math.round(totalExpenses * 100) / 100,
        factures: facturesFromTable,
        tvaCollectee: Math.round(tvaCollectee * 100) / 100,
        tvaDeductible: Math.round(tvaDeductible * 100) / 100,
        tvaNette: Math.round(tvaNette * 100) / 100,
        tvaRecords: tvaRecords || [],
        bankAccounts,
        totalBankMUR: Math.round(totalBankMUR * 100) / 100,
        salaires: Math.round(salaires * 100) / 100,
        chargesSociales: Math.round(chargesSociales * 100) / 100,
        revenueByAccount: Object.fromEntries(Object.entries(revenueByAccount).map(([k, v]) => [k, Math.round(v * 100) / 100])),
        expensesByAccount: Object.fromEntries(Object.entries(expensesByAccount).map(([k, v]) => [k, Math.round(v * 100) / 100])),
        creances: Math.round(creances * 100) / 100,
        immobilisations: Math.round(immobilisations * 100) / 100,
        stocks: Math.round(stocks * 100) / 100,
        autresCreances: Math.round(autresCreances * 100) / 100,
        capitauxPropres: Math.round(capitauxPropres * 100) / 100,
        emprunts: Math.round(emprunts * 100) / 100,
        dettesFournisseurs: Math.round(dettesFournisseurs * 100) / 100,
        dettesFiscales: Math.round(dettesFiscales * 100) / 100,
        dettesSociales: Math.round(dettesSociales * 100) / 100,
        lastMonthRevenue: Math.round(lastMonthRevenue * 100) / 100,
        lastMonthExpenses: Math.round(lastMonthExpenses * 100) / 100,
        docsByType: allDocs.reduce((acc: Record<string, number>, d) => {
          const t = d.type_document || 'autre'; acc[t] = (acc[t] || 0) + 1; return acc
        }, {}),
        totalDocuments: allDocs.length,
        extractedInvoices,
        bankTransactions,
        ecritures: allEcritures.map(e => ({
          id: e.id, date_ecriture: e.date_ecriture, journal: e.journal,
          numero_piece: e.numero_piece, compte: e.compte, libelle: e.libelle,
          debit: Number(e.debit) || 0, credit: Number(e.credit) || 0,
        })),
        totalEcritures: allEcritures.length,
        currentMonth,
        taux_change: rates,
        availableSocietes,
        selectedSocieteId: requestedSocieteId || null,
        exercice_actuel: exerciceActuel,
        exercice_precedent: exercicePrecedent,
        available_exercices: getAvailableExercices(),
      }
    })
  } catch (e: unknown) {
    console.error('Financial API error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

function emptyFinancial() {
  return {
    totalRevenue: 0, monthlyRevenue: 0, totalExpenses: 0, monthlyExpenses: 0,
    resultat: 0, resultatMensuel: 0,
    tvaCollectee: 0, tvaDeductible: 0, tvaNette: 0, tvaRecords: [],
    bankAccounts: [], totalBankMUR: 0,
    salaires: 0, chargesSociales: 0,
    revenueByAccount: {}, expensesByAccount: {},
    creances: 0, immobilisations: 0, stocks: 0, autresCreances: 0,
    capitauxPropres: 0, emprunts: 0, dettesFournisseurs: 0, dettesFiscales: 0, dettesSociales: 0,
    lastMonthRevenue: 0, lastMonthExpenses: 0,
    docsByType: {}, totalDocuments: 0, extractedInvoices: [], bankTransactions: [],
    totalEcritures: 0, currentMonth: '', taux_change: {},
  }
}
