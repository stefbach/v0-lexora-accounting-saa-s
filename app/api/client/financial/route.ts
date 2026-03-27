import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTauxChange } from '@/lib/taux-change'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
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

// GET — Aggregated financial data for a client
// For clients: returns their own data
// For comptables: accepts ?client_id=xxx to view a client's data
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

    // Also include dossiers from the same sociétés (shared between client_admin and client_user)
    let allDossierIds: string[] = (dossiers || []).map(d => d.id)
    let societeIds = [...new Set((dossiers || []).map(d => d.societe_id))]

    if (dossiers && dossiers.length > 0) {
      const { data: sharedDossiers } = await supabase
        .from('dossiers').select('id, societe_id').in('societe_id', societeIds)
      if (sharedDossiers) {
        allDossierIds = [...new Set([...allDossierIds, ...sharedDossiers.map(d => d.id)])]
        societeIds = [...new Set([...societeIds, ...sharedDossiers.map(d => d.societe_id)])]
      }
    }

    if (allDossierIds.length === 0) {
      return NextResponse.json({ financial: emptyFinancial() })
    }

    const dossierIds = allDossierIds

    // Get all société names for the filter dropdown
    const { data: allClientDossiers } = await supabase
      .from('dossiers').select('societe_id, societe:societes(id, nom)')
      .eq('client_id', targetClientId)
    const availableSocietes = (allClientDossiers || [])
      .filter((d: any) => d.societe && !(d.societe as any).nom?.endsWith('— Personnel'))
      .map((d: any) => ({ id: d.societe_id, nom: (d.societe as any).nom }))
      .filter((s: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === s.id) === i)

    // Get all accounting entries
    const { data: ecritures } = await supabase
      .from('ecritures_comptables').select('*').in('dossier_id', dossierIds)
      .order('date_ecriture', { ascending: false })

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

    const allEcritures = ecritures || []
    const allDocs = documents || []

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentMonthEcritures = allEcritures.filter(e => e.date_ecriture?.startsWith(currentMonth))

    // === COMPUTE FINANCIAL METRICS ===

    // Revenue: class 7 accounts
    const totalRevenue = allEcritures
      .filter(e => e.compte?.startsWith('7'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const monthlyRevenue = currentMonthEcritures
      .filter(e => e.compte?.startsWith('7'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    // Expenses: class 6 accounts
    const totalExpenses = allEcritures
      .filter(e => e.compte?.startsWith('6'))
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
    const bankAccounts = (comptesBank || []).map(c => ({
      id: c.id, banque: c.banque, nom_compte: c.nom_compte,
      devise: c.devise, solde_actuel: Number(c.solde_actuel) || 0,
      solde_mur: convertToMUR(Number(c.solde_actuel) || 0, c.devise, rates),
    }))
    const totalBankMUR = bankAccounts.reduce((s, a) => s + a.solde_mur, 0)

    // Revenue breakdown by account prefix
    const revenueByAccount: Record<string, number> = {}
    allEcritures.filter(e => e.compte?.startsWith('7')).forEach(e => {
      const prefix = (e.compte || '7').substring(0, 3)
      revenueByAccount[prefix] = (revenueByAccount[prefix] || 0) + (Number(e.credit) || 0) - (Number(e.debit) || 0)
    })

    // Expense breakdown by account prefix (first 2 digits for grouping into ranges)
    const expensesByAccount: Record<string, number> = {}
    allEcritures.filter(e => e.compte?.startsWith('6')).forEach(e => {
      const prefix = (e.compte || '6').substring(0, 3)
      expensesByAccount[prefix] = (expensesByAccount[prefix] || 0) + (Number(e.debit) || 0) - (Number(e.credit) || 0)
    })

    // Creances (class 41 - clients receivables)
    const creances = allEcritures
      .filter(e => e.compte?.startsWith('41'))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    // Monthly revenue for last 2 months for trend
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`
    const lastMonthRevenue = allEcritures
      .filter(e => e.compte?.startsWith('7') && e.date_ecriture?.startsWith(lastMonthStr))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const lastMonthExpenses = allEcritures
      .filter(e => e.compte?.startsWith('6') && e.date_ecriture?.startsWith(lastMonthStr))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    // Payroll
    const salaires = allEcritures
      .filter(e => e.compte?.startsWith('421') || e.compte?.startsWith('42'))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    const chargesSociales = allEcritures
      .filter(e => e.compte?.startsWith('43'))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    // Balance sheet items
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

    const dettesFournisseurs = allEcritures
      .filter(e => e.compte?.startsWith('40'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const dettesFiscales = allEcritures
      .filter(e => e.compte?.startsWith('44'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const dettesSociales = allEcritures
      .filter(e => e.compte?.startsWith('43'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    // Extract bank transactions from releve_bancaire documents
    const bankTransactions: any[] = []
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
            tiers: tx.tiers || tx.tiers_identifie || null,
            compte_comptable: tx.compte_comptable || tx.compte || null,
            statut: tx.statut || 'non_identifie',
          })
        })
      })

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

    return NextResponse.json({
      financial: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
        resultat: Math.round((totalRevenue - totalExpenses) * 100) / 100,
        resultatMensuel: Math.round((monthlyRevenue - monthlyExpenses) * 100) / 100,
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
        totalEcritures: allEcritures.length,
        currentMonth,
        taux_change: rates,
        availableSocietes,
        selectedSocieteId: requestedSocieteId || null,
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
    creances: 0, lastMonthRevenue: 0, lastMonthExpenses: 0,
    docsByType: {}, totalDocuments: 0, extractedInvoices: [], bankTransactions: [],
    totalEcritures: 0, currentMonth: '', taux_change: {},
  }
}
