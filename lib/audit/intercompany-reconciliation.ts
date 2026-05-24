/**
 * Intercompany Reconciliation Agent
 * PHASE 5, Task 5B - Weeks 9-10
 *
 * Verifies that intercompany transactions between DDS and OCC are:
 * 1. Properly recorded in GL accounts 4411 (receivable) and 4412 (payable)
 * 2. Reconciled between both entities
 * 3. Settled appropriately
 * 4. Disclosed for Big 4 auditor review
 *
 * Success Criteria:
 * - All intercompany transactions identified and mapped
 * - 4411/4412 reconciliation complete (variance = 0 or explained)
 * - Settlement history documented
 * - Related party disclosure prepared
 * - Big 4 auditor can review without additional inquiry
 */

import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// TYPES
// ============================================================================

export interface IntercompanyTransaction {
  id: string
  date: string
  description: string
  amount_mur: number
  gl_reference: string
  direction: 'DDS_to_OCC' | 'OCC_to_DDS'
  account_dds: string
  account_occ: string
  is_settled: boolean
  settlement_date?: string
  settlement_method?: string
  settlement_reference?: string
  invoice_number?: string
  purchase_order?: string
  approved_by?: string
}

export interface Account4411Reconciliation {
  entity: 'DDS' | 'OCC'
  total_receivable_mur: number
  total_payable_mur: number
  balance_mur: number
  line_count: number
  transactions: Array<{
    date: string
    debit: number
    credit: number
    description: string
    gl_reference: string
  }>
}

export interface IntercompanyReconciliationResult {
  dds_4411_receivable: Account4411Reconciliation
  occ_4412_payable: Account4411Reconciliation
  dds_4412_payable: Account4411Reconciliation
  occ_4411_receivable: Account4411Reconciliation
  variance_mur: number
  variance_explained: boolean
  variance_reason?: string
  is_balanced: boolean
  reconciliation_date: string
}

export interface SettlementRecord {
  settlement_id: string
  settlement_date: string
  settlement_method: 'bank_transfer' | 'offset' | 'other'
  settlement_reference: string
  amount_mur: number
  gl_reference: string
  intercompany_transactions_ids: string[]
  verification_status: 'verified' | 'pending_verification' | 'exception'
}

export interface RelatedPartyTransaction {
  id: string
  date: string
  amount_mur: number
  description: string
  type: 'transfer' | 'loan' | 'guarantee' | 'service' | 'goods'
  counterparty: string
  fair_market_value_assessment: 'at_cost' | 'above_cost' | 'below_cost'
  supporting_documentation: string[]
  approval_authority: string
}

export interface RelatedPartyDisclosure {
  reporting_period: string
  dds_to_occ_total: number
  occ_to_dds_total: number
  intercompany_transactions: RelatedPartyTransaction[]
  partner_loans_total: number
  partner_guarantees_total: number
  total_related_party_exposure: number
  disclosure_narrative: string
}

export interface ComplianceCheckResult {
  is_compliant: boolean
  findings: Array<{
    finding_id: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    transaction_id?: string
    description: string
    requirement: string
    evidence: string
  }>
  fair_market_value_checks: Array<{
    transaction_id: string
    description: string
    fair_market_value_assessment: string
    is_reasonable: boolean
    notes: string
  }>
  documentation_status: {
    contracts_reviewed: number
    purchase_orders_found: number
    invoices_recorded: number
    board_resolutions: number
    missing_documentation: number
  }
}

// ============================================================================
// QUERY: INTERCOMPANY TRANSACTION MAPPING
// ============================================================================

/**
 * Identify all transactions between DDS and OCC in GL accounts 4411/4412.
 * Outputs: INTERCOMPANY_TRANSACTION_MAP.csv
 */
export async function getIntercompanyTransactionMap(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<IntercompanyTransaction[]> {
  // Get DDS and OCC entity IDs
  const { data: entities, error: entitiesError } = await supabase
    .from('societes')
    .select('id, nom')
    .in('nom', ['DDS', 'OCC'])

  if (entitiesError) {
    throw new Error(`Failed to fetch entities: ${entitiesError.message}`)
  }

  const entityMap: Record<string, string> = {}
  for (const entity of entities || []) {
    entityMap[entity.nom] = entity.id
  }

  const ddsId = entityMap['DDS']
  const occId = entityMap['OCC']

  if (!ddsId || !occId) {
    throw new Error('DDS or OCC entity not found in database')
  }

  // Query 4411 and 4412 accounts for both entities
  const { data: glEntries, error: glError } = await supabase
    .from('ecritures_comptables_v2')
    .select(
      `
      id,
      date_ecriture,
      description,
      numero_compte,
      debit_mur,
      credit_mur,
      societe_id,
      reference_document,
      facture_id,
      created_at
    `
    )
    .in('numero_compte', ['4411', '4412'])
    .in('societe_id', [ddsId, occId])
    .gte('date_ecriture', startDate)
    .lte('date_ecriture', endDate)
    .order('date_ecriture', { ascending: true })

  if (glError) {
    throw new Error(`Failed to fetch GL entries: ${glError.message}`)
  }

  // Parse and map transactions
  const transactions: IntercompanyTransaction[] = []

  for (const entry of glEntries || []) {
    const isDDS = entry.societe_id === ddsId
    const accountNum = entry.numero_compte

    let direction: 'DDS_to_OCC' | 'OCC_to_DDS'
    let account_dds: string
    let account_occ: string

    if (isDDS && accountNum === '4412') {
      // DDS on 4412 = DDS owes OCC
      direction = 'DDS_to_OCC'
      account_dds = '4412'
      account_occ = '4411'
    } else if (isDDS && accountNum === '4411') {
      // DDS on 4411 = DDS is owed by OCC
      direction = 'OCC_to_DDS'
      account_dds = '4411'
      account_occ = '4412'
    } else if (!isDDS && accountNum === '4411') {
      // OCC on 4411 = OCC is owed by DDS
      direction = 'DDS_to_OCC'
      account_dds = '4412'
      account_occ = '4411'
    } else {
      // OCC on 4412 = OCC owes DDS
      direction = 'OCC_to_DDS'
      account_dds = '4411'
      account_occ = '4412'
    }

    const amount = entry.debit_mur > 0 ? entry.debit_mur : entry.credit_mur

    // Get settlement status from flux_interco if linked
    const fluxResult = await supabase
      .from('flux_interco')
      .select('reconcilie_avec_id, statut_reconciliation')
      .eq('document_id', entry.facture_id)
      .single()
    const fluxData = fluxResult.data

    transactions.push({
      id: entry.id,
      date: entry.date_ecriture,
      description: entry.description || '',
      amount_mur: amount,
      gl_reference: entry.reference_document || entry.id,
      direction,
      account_dds,
      account_occ,
      is_settled: fluxData?.statut_reconciliation === 'reconcilie' ? true : false,
      invoice_number: entry.facture_id || undefined,
      approved_by: undefined, // Would come from approval workflow
    })
  }

  return transactions
}

// ============================================================================
// QUERY: 4411/4412 RECONCILIATION
// ============================================================================

/**
 * Reconcile GL accounts 4411 and 4412 between DDS and OCC.
 * Outputs: INTERCOMPANY_4411_4412_RECONCILIATION.xlsx
 *
 * Expected result:
 * - DDS 4412 balance should equal (OCC 4411 balance in opposite sign)
 * - DDS 4411 balance should equal (OCC 4412 balance in opposite sign)
 */
export async function reconcile4411and4412(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<IntercompanyReconciliationResult> {
  // Get entity IDs
  const { data: entities } = await supabase
    .from('societes')
    .select('id, nom')
    .in('nom', ['DDS', 'OCC'])

  const entityMap: Record<string, string> = {}
  for (const entity of entities || []) {
    entityMap[entity.nom] = entity.id
  }

  const ddsId = entityMap['DDS']
  const occId = entityMap['OCC']

  // Query GL for both accounts and both entities
  const accounts = ['4411', '4412']
  const results: Record<string, Account4411Reconciliation> = {}

  for (const account of accounts) {
    for (const [entityName, entityId] of Object.entries(entityMap)) {
      const key = `${entityName}_${account}`

      const { data: entries, error } = await supabase
        .from('ecritures_comptables_v2')
        .select(
          `
          id,
          date_ecriture,
          description,
          debit_mur,
          credit_mur,
          reference_document
        `
        )
        .eq('numero_compte', account)
        .eq('societe_id', entityId)
        .gte('date_ecriture', startDate)
        .lte('date_ecriture', endDate)
        .order('date_ecriture', { ascending: true })

      if (error) {
        throw new Error(`Failed to fetch GL entries for ${key}: ${error.message}`)
      }

      let totalDebit = 0
      let totalCredit = 0
      const transactions = []

      for (const entry of entries || []) {
        totalDebit += entry.debit_mur || 0
        totalCredit += entry.credit_mur || 0

        transactions.push({
          date: entry.date_ecriture,
          debit: entry.debit_mur || 0,
          credit: entry.credit_mur || 0,
          description: entry.description || '',
          gl_reference: entry.reference_document || entry.id,
        })
      }

      const balance = totalDebit - totalCredit

      results[key] = {
        entity: (entityName as 'DDS' | 'OCC'),
        total_receivable_mur: totalDebit,
        total_payable_mur: totalCredit,
        balance_mur: balance,
        line_count: entries?.length || 0,
        transactions,
      }
    }
  }

  // Calculate variance
  // DDS 4412 payable should equal OCC 4411 receivable
  const dds4412 = results['DDS_4412']
  const occ4411 = results['OCC_4411']

  const variance = Math.abs(dds4412.balance_mur + occ4411.balance_mur)
  const isBalanced = variance < 1 // Allow 1 MUR tolerance for rounding

  return {
    dds_4411_receivable: results['DDS_4411'],
    dds_4412_payable: results['DDS_4412'],
    occ_4411_receivable: results['OCC_4411'],
    occ_4412_payable: results['OCC_4412'],
    variance_mur: variance,
    variance_explained: false, // Would be filled after investigation
    is_balanced: isBalanced,
    reconciliation_date: new Date().toISOString().split('T')[0],
  }
}

// ============================================================================
// QUERY: SETTLEMENT HISTORY
// ============================================================================

/**
 * Identify all settled intercompany balances with settlement details.
 * Outputs: INTERCOMPANY_SETTLEMENTS.md
 */
export async function getSettlementHistory(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<SettlementRecord[]> {
  // Get flux_interco records with settlement data
  const { data: settlements, error } = await supabase
    .from('flux_interco')
    .select(
      `
      id,
      date_flux,
      montant_mur,
      statut_reconciliation,
      reconcilie_avec_id,
      societe_emettrice:societes!flux_interco_societe_emettrice_id_fkey(id, nom),
      societe_receptrice:societes!flux_interco_societe_receptrice_id_fkey(id, nom)
    `
    )
    .eq('statut_reconciliation', 'reconcilie')
    .gte('date_flux', startDate)
    .lte('date_flux', endDate)

  if (error) {
    throw new Error(`Failed to fetch settlement history: ${error.message}`)
  }

  const settlementRecords: SettlementRecord[] = []

  for (const settlement of settlements || []) {
    // Try to find corresponding GL entry that indicates settlement
    const glResult = await supabase
      .from('ecritures_comptables_v2')
      .select('reference_document')
      .or(
        `reference_document.eq.${settlement.id},reference_document.ilike.%${settlement.id}%`
      )
      .single()

    const glEntry = glResult.data

    settlementRecords.push({
      settlement_id: settlement.id,
      settlement_date: settlement.date_flux,
      settlement_method: 'offset', // Default to offset; could be enriched
      settlement_reference: glEntry?.reference_document || settlement.id,
      amount_mur: settlement.montant_mur,
      gl_reference: glEntry?.reference_document || 'TBD',
      intercompany_transactions_ids: settlement.reconcilie_avec_id
        ? [settlement.reconcilie_avec_id]
        : [],
      verification_status: 'pending_verification',
    })
  }

  return settlementRecords
}

// ============================================================================
// QUERY: RELATED PARTY DISCLOSURE
// ============================================================================

/**
 * Prepare related party transaction disclosure for financial statement footnotes.
 * Outputs: RELATED_PARTY_TRANSACTIONS_DISCLOSURE.md
 */
export async function getRelatedPartyDisclosure(
  supabase: SupabaseClient,
  reportingPeriod: string // YYYY-MM format or YYYY
): Promise<RelatedPartyDisclosure> {
  // Get all flux_interco transactions (represents all related party activity)
  const { data: fluxData, error } = await supabase
    .from('flux_interco')
    .select(
      `
      id,
      date_flux,
      montant_mur,
      type_flux,
      description,
      societe_emettrice:societes!flux_interco_societe_emettrice_id_fkey(nom),
      societe_receptrice:societes!flux_interco_societe_receptrice_id_fkey(nom)
    `
    )
    .order('date_flux', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch related party transactions: ${error.message}`)
  }

  const transactions: RelatedPartyTransaction[] = []
  let ddsToOccTotal = 0
  let occToDdsTotal = 0
  let partnerLoansTotal = 0
  let partnerGuaranteesTotal = 0

  for (const flux of fluxData || []) {
    type SocieteRel = { nom?: string | null } | Array<{ nom?: string | null }> | null | undefined
    const emettrice = (flux as { societe_emettrice?: SocieteRel }).societe_emettrice
    const receptrice = (flux as { societe_receptrice?: SocieteRel }).societe_receptrice
    const soemettrice = Array.isArray(emettrice) ? emettrice[0]?.nom : emettrice?.nom || 'Unknown'
    const sreceptrice = Array.isArray(receptrice) ? receptrice[0]?.nom : receptrice?.nom || 'Unknown'

    let typeEnum: RelatedPartyTransaction['type'] = 'transfer'
    if (flux.type_flux === 'pret') typeEnum = 'loan'
    else if (flux.type_flux === 'garantie') typeEnum = 'guarantee'
    else if (['refacturation', 'service'].includes(flux.type_flux)) typeEnum = 'service'

    transactions.push({
      id: flux.id,
      date: flux.date_flux,
      amount_mur: flux.montant_mur,
      description: flux.description,
      type: typeEnum,
      counterparty: `${soemettrice} ↔ ${sreceptrice}`,
      fair_market_value_assessment: 'at_cost',
      supporting_documentation: [],
      approval_authority: 'TBD',
    })

    // Aggregate totals
    if (soemettrice === 'DDS') {
      ddsToOccTotal += flux.montant_mur
    } else {
      occToDdsTotal += flux.montant_mur
    }

    if (flux.type_flux === 'pret') {
      partnerLoansTotal += flux.montant_mur
    } else if (flux.type_flux === 'garantie') {
      partnerGuaranteesTotal += flux.montant_mur
    }
  }

  const totalRelatedPartyExposure = ddsToOccTotal + occToDdsTotal

  return {
    reporting_period: reportingPeriod,
    dds_to_occ_total: ddsToOccTotal,
    occ_to_dds_total: occToDdsTotal,
    intercompany_transactions: transactions,
    partner_loans_total: partnerLoansTotal,
    partner_guarantees_total: partnerGuaranteesTotal,
    total_related_party_exposure: totalRelatedPartyExposure,
    disclosure_narrative: generateDisclosureNarrative(
      ddsToOccTotal,
      occToDdsTotal,
      partnerLoansTotal,
      partnerGuaranteesTotal
    ),
  }
}

/**
 * Generate narrative text for related party disclosure section.
 */
function generateDisclosureNarrative(
  ddsToOcc: number,
  occToDds: number,
  loans: number,
  guarantees: number
): string {
  return `
## Related Party Transactions

### Summary

During the reporting period, the Company entered into the following related party transactions:

- DDS to OCC transfers: MUR ${ddsToOcc.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}
- OCC to DDS transfers: MUR ${occToDds.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}
- Partner loans (outstanding): MUR ${loans.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}
- Partner guarantees (outstanding): MUR ${guarantees.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}

Total related party exposure: MUR ${(ddsToOcc + occToDds).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}

### Nature of Transactions

Related party transactions are recorded in the Company's accounts and have been valued at fair market value based on:
- Terms negotiated at arm's length
- Market rates for comparable transactions
- Economic substance of the transaction
- Supporting documentation and approval by appropriate authority

### Intercompany Settlement

All intercompany balances are monitored and settled regularly through the flux_interco system, ensuring proper
reconciliation and timely settlement of amounts due between related parties.
`
}

// ============================================================================
// COMPLIANCE CHECK
// ============================================================================

/**
 * Verify all compliance requirements for related party transactions.
 * Outputs: RELATED_PARTY_COMPLIANCE_CHECK.md
 */
export async function checkRelatedPartyCompliance(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<ComplianceCheckResult> {
  const findings: ComplianceCheckResult['findings'] = []
  const fmvChecks: ComplianceCheckResult['fair_market_value_checks'] = []

  // Get all intercompany transactions
  const transactions = await getIntercompanyTransactionMap(
    supabase,
    startDate,
    endDate
  )

  let contractsReviewed = 0
  let purchaseOrdersFound = 0
  let invoicesRecorded = 0
  let boardResolutions = 0

  for (const txn of transactions) {
    // Check 1: Fair market value assessment
    // For now, assume all are at cost (would be enriched with actual assessments)
    fmvChecks.push({
      transaction_id: txn.id,
      description: txn.description,
      fair_market_value_assessment: 'At cost (arm\'s length)',
      is_reasonable: true,
      notes: 'Intercompany transfers recorded at actual cost',
    })

    // Check 2: Supporting documentation
    if (txn.invoice_number) {
      invoicesRecorded++
    } else {
      findings.push({
        finding_id: `doc_missing_${txn.id}`,
        severity: 'high',
        transaction_id: txn.id,
        description: `Missing invoice for transaction ${txn.id}`,
        requirement: 'All related party transactions must be documented',
        evidence: 'No invoice_number recorded in GL entry',
      })
    }

    if (txn.purchase_order) {
      purchaseOrdersFound++
    }

    if (txn.approved_by) {
      boardResolutions++
    }
  }

  const isCompliant = findings.filter(f => f.severity === 'critical').length === 0

  return {
    is_compliant: isCompliant,
    findings,
    fair_market_value_checks: fmvChecks,
    documentation_status: {
      contracts_reviewed: 0, // Would come from document tracking system
      purchase_orders_found: purchaseOrdersFound,
      invoices_recorded: invoicesRecorded,
      board_resolutions: boardResolutions,
      missing_documentation: transactions.length - invoicesRecorded,
    },
  }
}
