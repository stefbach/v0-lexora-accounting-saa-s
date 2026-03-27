import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET — Aggregated financial data for the current client
// Returns: revenue, expenses, TVA, bank balances, payroll — all from ecritures_comptables + documents
export async function GET() {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = getAdminClient()

    // Get client's dossiers
    const { data: dossiers } = await supabase
      .from('dossiers').select('id, societe_id').eq('client_id', user.id)

    if (!dossiers || dossiers.length === 0) {
      return NextResponse.json({ financial: emptyFinancial() })
    }

    const dossierIds = dossiers.map(d => d.id)
    const societeIds = [...new Set(dossiers.map(d => d.societe_id))]

    // Get all accounting entries for this client's dossiers
    const { data: ecritures } = await supabase
      .from('ecritures_comptables')
      .select('*')
      .in('dossier_id', dossierIds)
      .order('date_ecriture', { ascending: false })

    // Get all processed documents for context
    const { data: documents } = await supabase
      .from('documents')
      .select('id, nom_fichier, type_document, statut, n8n_result, created_at, societe_detectee')
      .in('dossier_id', dossierIds)
      .eq('statut', 'traite')
      .order('created_at', { ascending: false })

    // Get bank accounts
    const { data: comptesBank } = await supabase
      .from('comptes_bancaires')
      .select('*')
      .in('societe_id', societeIds)
      .eq('actif', true)

    // Get TVA records
    const { data: tvaRecords } = await supabase
      .from('tva_mensuelle')
      .select('*')
      .in('societe_id', societeIds)
      .order('periode', { ascending: false })

    const allEcritures = ecritures || []
    const allDocs = documents || []

    // Current month
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentMonthEcritures = allEcritures.filter(e => e.date_ecriture?.startsWith(currentMonth))

    // === COMPUTE FINANCIAL METRICS ===

    // Revenue: class 7 accounts (credit side)
    const totalRevenue = allEcritures
      .filter(e => e.compte?.startsWith('7'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const monthlyRevenue = currentMonthEcritures
      .filter(e => e.compte?.startsWith('7'))
      .reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    // Expenses: class 6 accounts (debit side)
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

    // Bank balances
    const bankAccounts = (comptesBank || []).map(c => ({
      id: c.id,
      banque: c.banque,
      nom_compte: c.nom_compte,
      devise: c.devise,
      solde_actuel: Number(c.solde_actuel) || 0,
    }))
    const totalBankMUR = bankAccounts.reduce((s, a) => s + a.solde_actuel, 0)

    // Payroll from ecritures: 421 = salaries, 431 = CSG, 437 = other social
    const salaires = allEcritures
      .filter(e => e.compte?.startsWith('421') || e.compte?.startsWith('42'))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    const chargesSociales = allEcritures
      .filter(e => e.compte?.startsWith('43'))
      .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    // Documents by type
    const docsByType: Record<string, number> = {}
    allDocs.forEach(d => {
      const t = d.type_document || 'autre'
      docsByType[t] = (docsByType[t] || 0) + 1
    })

    // Extract line items from documents for detailed views
    const extractedInvoices = allDocs
      .filter(d => d.type_document === 'facture_fournisseur' || d.type_document === 'facture_client')
      .map(d => {
        const ext = d.n8n_result?.extraction || {}
        return {
          id: d.id,
          type: d.type_document,
          nom_fichier: d.nom_fichier,
          emetteur: ext.emetteur || '',
          destinataire: ext.destinataire || '',
          date: ext.date_document || d.created_at,
          numero: ext.numero_reference || '',
          devise: ext.devise || 'MUR',
          montant_ht: Number(ext.montant_ht) || 0,
          montant_tva: Number(ext.montant_tva) || 0,
          montant_ttc: Number(ext.montant_ttc) || 0,
          lignes: ext.lignes || [],
        }
      })

    return NextResponse.json({
      financial: {
        // Summary
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
        resultat: Math.round((totalRevenue - totalExpenses) * 100) / 100,
        resultatMensuel: Math.round((monthlyRevenue - monthlyExpenses) * 100) / 100,

        // TVA
        tvaCollectee: Math.round(tvaCollectee * 100) / 100,
        tvaDeductible: Math.round(tvaDeductible * 100) / 100,
        tvaNette: Math.round(tvaNette * 100) / 100,
        tvaRecords: tvaRecords || [],

        // Bank
        bankAccounts,
        totalBankMUR: Math.round(totalBankMUR * 100) / 100,

        // Payroll
        salaires: Math.round(salaires * 100) / 100,
        chargesSociales: Math.round(chargesSociales * 100) / 100,

        // Documents
        docsByType,
        totalDocuments: allDocs.length,
        extractedInvoices,

        // Ecritures count
        totalEcritures: allEcritures.length,

        // Period
        currentMonth,
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
    docsByType: {}, totalDocuments: 0, extractedInvoices: [],
    totalEcritures: 0, currentMonth: '',
  }
}
