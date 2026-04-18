import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getBankTransaction(id: string) {
  const { data } = await getSupabase()
    .from('transactions_bancaires').select('*').eq('id', id).maybeSingle()
  return data
}

export async function getPendingTransactions(societeId: string, limit = 100) {
  const { data } = await getSupabase()
    .from('transactions_bancaires')
    .select('*')
    .eq('societe_id', societeId)
    .eq('statut_lettrage', 'a_lettrer')
    .is('classified_type', null)
    .order('date_transaction', { ascending: true })
    .limit(limit)
  return data || []
}

export async function getOpenInvoices(societeId: string, filter?: { customerId?: string; supplierId?: string; type?: 'client' | 'fournisseur' }) {
  let query = getSupabase()
    .from('factures')
    .select('id, numero_facture, tiers, montant_ttc, montant_mur, montant_ht, montant_tva, devise, taux_change, statut, type_facture, date_facture, date_echeance')
    .eq('societe_id', societeId)
    .in('statut', ['en_attente', 'retard', 'partiel'])
  if (filter?.type) query = query.eq('type_facture', filter.type)
  if (filter?.customerId) query = query.eq('tiers', filter.customerId)
  if (filter?.supplierId) query = query.eq('tiers', filter.supplierId)
  const { data } = await query.order('date_facture', { ascending: false })
  return data || []
}

export async function getClientByIban(iban: string) {
  const { data } = await getSupabase()
    .from('comptes_bancaires')
    .select('societe_id, banque, iban, devise, societes(id, nom)')
    .eq('iban', iban)
    .limit(1)
    .maybeSingle()
  return data
}

export async function getEmployeeByIban(iban: string, societeId: string) {
  const { data } = await getSupabase()
    .from('employes')
    .select('id, nom, prenom, poste, salaire_base, iban, societe_id')
    .eq('societe_id', societeId)
    .eq('iban', iban)
    .maybeSingle()
  return data
}

export async function getEmployees(societeId: string) {
  const { data } = await getSupabase()
    .from('employes')
    .select('id, nom, prenom, poste, salaire_base, iban, actif')
    .eq('societe_id', societeId)
    .eq('actif', true)
    .order('nom')
  return data || []
}

export async function getSupplierByName(name: string, societeId: string) {
  const { data } = await getSupabase()
    .from('factures')
    .select('tiers, type_facture')
    .eq('societe_id', societeId)
    .eq('type_facture', 'fournisseur')
    .ilike('tiers', `%${name}%`)
    .limit(5)
  const unique = [...new Set((data || []).map(f => f.tiers))]
  return unique
}

export async function getCustomerByName(name: string, societeId: string) {
  const { data } = await getSupabase()
    .from('factures')
    .select('tiers, type_facture')
    .eq('societe_id', societeId)
    .eq('type_facture', 'client')
    .ilike('tiers', `%${name}%`)
    .limit(5)
  const unique = [...new Set((data || []).map(f => f.tiers))]
  return unique
}

export async function getShareholderByName(name: string, societeId: string) {
  const { data } = await getSupabase()
    .from('comptes_courants_associes')
    .select('id, nom, type, solde')
    .eq('societe_id', societeId)
    .ilike('nom', `%${name}%`)
    .limit(5)
  return data || []
}

export async function getShareholders(societeId: string) {
  const { data } = await getSupabase()
    .from('comptes_courants_associes')
    .select('id, nom, type, solde')
    .eq('societe_id', societeId)
  return data || []
}

export async function getDirectors(societeId: string) {
  const { data } = await getSupabase()
    .from('directors_shareholders')
    .select('id, nom_complet, role, nic, pourcentage_capital, active')
    .eq('societe_id', societeId)
    .eq('active', true)
  return data || []
}

export async function getCompanyBankAccounts(societeId: string) {
  const { data } = await getSupabase()
    .from('comptes_bancaires')
    .select('id, banque, iban, devise, numero_compte, compte_comptable, actif')
    .eq('societe_id', societeId)
    .eq('actif', true)
  return data || []
}

export async function getPayrollPeriod(societeId: string, periode: string) {
  const { data } = await getSupabase()
    .from('bulletins_paie')
    .select('id, employe_id, periode, salaire_base, salaire_net, salaire_brut, csg_salarie, nsf_salarie, paye, total_deductions, total_charges_patronales, statut')
    .eq('societe_id', societeId)
    .eq('periode', periode)
  return data || []
}

export async function getPayrollHistory(societeId: string, employeId: string, months = 6) {
  const { data } = await getSupabase()
    .from('bulletins_paie')
    .select('periode, salaire_net, salaire_base')
    .eq('societe_id', societeId)
    .eq('employe_id', employeId)
    .order('periode', { ascending: false })
    .limit(months)
  return data || []
}

export async function getTaxDeclarations(societeId: string) {
  const { data } = await getSupabase()
    .from('tva_mensuelle')
    .select('id, societe_id, periode, tva_collectee, tva_deductible, tva_nette, statut')
    .eq('societe_id', societeId)
    .order('periode', { ascending: false })
    .limit(12)
  return data || []
}

export async function getClientPaymentHistory(societeId: string, customerName: string, limit = 12) {
  const { data } = await getSupabase()
    .from('factures')
    .select('id, numero_facture, tiers, montant_ttc, montant_mur, devise, statut, date_facture, rapproche_date')
    .eq('societe_id', societeId)
    .eq('type_facture', 'client')
    .ilike('tiers', `%${customerName}%`)
    .eq('statut', 'paye')
    .order('rapproche_date', { ascending: false })
    .limit(limit)
  return data || []
}

export async function getAllocationsByTransaction(transactionId: string) {
  const { data } = await getSupabase()
    .from('transaction_allocations')
    .select('*')
    .eq('transaction_id', transactionId)
    .neq('status', 'reversed')
  return data || []
}
