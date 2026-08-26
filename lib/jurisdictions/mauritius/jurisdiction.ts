import type { Jurisdiction, ValidationResult } from '../core/jurisdiction.interface'
import type { JurisdictionConfig, Account, JournalEntry, FiscalPeriod, AccountClass, AccountCategory } from '../core/types'
import type { ChartOfAccountsProvider, AccountingOperation } from '../core/chart-of-accounts.interface'
import type { TaxEngine, VatCalculation, TaxCalculation, VatReturn, TaxDeclaration } from '../core/tax-engine.interface'
import type { PayrollEngine, PayslipInput, Payslip, SocialContributionRates, IncomeTaxBracket, SeveranceInput, SeveranceCalculation } from '../core/payroll-engine.interface'
import type { FinancialStatementsProvider, StatementInput, BalanceSheet, IncomeStatement, CashFlowStatement, FinancialNotes } from '../core/financial-statements.interface'

// PCG account numbers that support lettrage (bank reconciliation / tiers matching).
// Mirrors MauritiusJurisdiction.isAccountReconcilable below — kept in sync manually,
// both are small closed lists unlikely to drift.
const RECONCILABLE_PREFIXES = ['411', '401', '512', '4210', '5800']

// Mirrors plan_comptable.categorie_ifrs (migration 479) / comptes_ifrs.categorie_ifrs (migration 478).
type IfrsCategorie =
  | 'actif_courant' | 'actif_non_courant'
  | 'passif_courant' | 'passif_non_courant'
  | 'capitaux_propres' | 'produits' | 'charges'

// Maps the IFRS classification carried by comptes_ifrs (migration 478) to the
// generic AccountCategory used by the jurisdiction abstraction.
const IFRS_CATEGORY_TO_ACCOUNT_CATEGORY: Record<IfrsCategorie, AccountCategory> = {
  actif_courant: 'BALANCE_SHEET_ASSET',
  actif_non_courant: 'BALANCE_SHEET_ASSET',
  passif_courant: 'BALANCE_SHEET_LIABILITY',
  passif_non_courant: 'BALANCE_SHEET_LIABILITY',
  capitaux_propres: 'BALANCE_SHEET_EQUITY',
  produits: 'INCOME_STATEMENT_REVENUE',
  charges: 'INCOME_STATEMENT_EXPENSE',
}

interface MauritiusAccountSeed {
  ancien_code_pcg: string
  libelle: string
  categorie_ifrs: IfrsCategorie
  sous_categorie: string
  sens_normal: 'D' | 'C'
  type_mra?: 'PAYE' | 'NSF' | 'CSG' | 'PRGF' | 'TRAINING_LEVY' | 'TVA'
}

// PCM chart of accounts actually seeded for this tenant base, restated from the
// comptes_ifrs seed in supabase/migrations/478_plan_comptable_ifrs_maurice.sql
// (rows with a non-null ancien_code_pcg only — the IFRS-only creations such as
// ROU-ASSET or CTA-ECART-CONVERSION have no PCG account number and therefore no
// place in this PCM-numbered chart). Keep this list in sync with that migration
// seed if it is ever extended; source of truth for the classification stays the
// SQL migration + comptes_ifrs/plan_comptable, this is a static read-only mirror
// for the synchronous ChartOfAccountsProvider contract.
const MAURITIUS_ACCOUNT_SEEDS: MauritiusAccountSeed[] = [
  { ancien_code_pcg: '5121', libelle: 'Banque — compte courant MUR', categorie_ifrs: 'actif_courant', sous_categorie: 'tresorerie_equivalents', sens_normal: 'D' },
  { ancien_code_pcg: '5122', libelle: 'Banque — compte courant EUR', categorie_ifrs: 'actif_courant', sous_categorie: 'tresorerie_equivalents', sens_normal: 'D' },
  { ancien_code_pcg: '5123', libelle: 'Banque — compte courant USD', categorie_ifrs: 'actif_courant', sous_categorie: 'tresorerie_equivalents', sens_normal: 'D' },
  { ancien_code_pcg: '5800', libelle: 'Virements internes (transit)', categorie_ifrs: 'actif_courant', sous_categorie: 'tresorerie_equivalents', sens_normal: 'D' },
  { ancien_code_pcg: '411', libelle: 'Clients — comptes commerciaux', categorie_ifrs: 'actif_courant', sous_categorie: 'clients_et_autres_creances', sens_normal: 'D' },
  { ancien_code_pcg: '4250', libelle: 'Avances et acomptes au personnel', categorie_ifrs: 'actif_courant', sous_categorie: 'clients_et_autres_creances', sens_normal: 'D' },
  { ancien_code_pcg: '4456', libelle: 'TVA déductible sur achats', categorie_ifrs: 'actif_courant', sous_categorie: 'autres_actifs_courants', sens_normal: 'D', type_mra: 'TVA' },
  { ancien_code_pcg: '4670', libelle: 'Tiers divers — inter-sociétés', categorie_ifrs: 'actif_courant', sous_categorie: 'autres_actifs_courants', sens_normal: 'D' },
  { ancien_code_pcg: '4710', libelle: 'Comptes d\'attente à reclasser', categorie_ifrs: 'actif_courant', sous_categorie: 'autres_actifs_courants', sens_normal: 'D' },
  { ancien_code_pcg: '2181', libelle: 'Installations générales, agencements', categorie_ifrs: 'actif_non_courant', sous_categorie: 'immobilisations_corporelles', sens_normal: 'D' },
  { ancien_code_pcg: '2183', libelle: 'Matériel de bureau et informatique', categorie_ifrs: 'actif_non_courant', sous_categorie: 'immobilisations_corporelles', sens_normal: 'D' },
  { ancien_code_pcg: '2184', libelle: 'Mobilier de bureau', categorie_ifrs: 'actif_non_courant', sous_categorie: 'immobilisations_corporelles', sens_normal: 'D' },
  { ancien_code_pcg: '2815', libelle: 'Amortissement cumulé — installations', categorie_ifrs: 'actif_non_courant', sous_categorie: 'immobilisations_corporelles', sens_normal: 'C' },
  { ancien_code_pcg: '2818', libelle: 'Amortissement cumulé — autres immobilisations', categorie_ifrs: 'actif_non_courant', sous_categorie: 'immobilisations_corporelles', sens_normal: 'C' },
  { ancien_code_pcg: '401', libelle: 'Fournisseurs — comptes commerciaux', categorie_ifrs: 'passif_courant', sous_categorie: 'fournisseurs_et_charges_a_payer', sens_normal: 'C' },
  { ancien_code_pcg: '4210', libelle: 'Salaires nets à payer', categorie_ifrs: 'passif_courant', sous_categorie: 'fournisseurs_et_charges_a_payer', sens_normal: 'C' },
  { ancien_code_pcg: '4211', libelle: 'Primes et gratifications à payer', categorie_ifrs: 'passif_courant', sous_categorie: 'fournisseurs_et_charges_a_payer', sens_normal: 'C' },
  { ancien_code_pcg: '4212', libelle: '13e mois à payer (EOY Bonus)', categorie_ifrs: 'passif_courant', sous_categorie: 'fournisseurs_et_charges_a_payer', sens_normal: 'C' },
  { ancien_code_pcg: '4280', libelle: 'Notes de frais à rembourser', categorie_ifrs: 'passif_courant', sous_categorie: 'fournisseurs_et_charges_a_payer', sens_normal: 'C' },
  { ancien_code_pcg: '4311', libelle: 'CSG salarié à verser — MRA', categorie_ifrs: 'passif_courant', sous_categorie: 'dettes_fiscales_et_sociales', sens_normal: 'C', type_mra: 'CSG' },
  { ancien_code_pcg: '4312', libelle: 'NSF salarié à verser — MRA', categorie_ifrs: 'passif_courant', sous_categorie: 'dettes_fiscales_et_sociales', sens_normal: 'C', type_mra: 'NSF' },
  { ancien_code_pcg: '4321', libelle: 'CSG patronal à verser — MRA', categorie_ifrs: 'passif_courant', sous_categorie: 'dettes_fiscales_et_sociales', sens_normal: 'C', type_mra: 'CSG' },
  { ancien_code_pcg: '4322', libelle: 'NSF patronal à verser — MRA', categorie_ifrs: 'passif_courant', sous_categorie: 'dettes_fiscales_et_sociales', sens_normal: 'C', type_mra: 'NSF' },
  { ancien_code_pcg: '4323', libelle: 'PRGF à verser — MRA', categorie_ifrs: 'passif_courant', sous_categorie: 'dettes_fiscales_et_sociales', sens_normal: 'C', type_mra: 'PRGF' },
  { ancien_code_pcg: '4324', libelle: 'Training Levy HRDC à verser — MRA', categorie_ifrs: 'passif_courant', sous_categorie: 'dettes_fiscales_et_sociales', sens_normal: 'C', type_mra: 'TRAINING_LEVY' },
  { ancien_code_pcg: '4330', libelle: 'PAYE à reverser — MRA', categorie_ifrs: 'passif_courant', sous_categorie: 'dettes_fiscales_et_sociales', sens_normal: 'C', type_mra: 'PAYE' },
  { ancien_code_pcg: '4455', libelle: 'TVA à décaisser', categorie_ifrs: 'passif_courant', sous_categorie: 'dettes_fiscales_et_sociales', sens_normal: 'C', type_mra: 'TVA' },
  { ancien_code_pcg: '4457', libelle: 'TVA collectée sur ventes', categorie_ifrs: 'passif_courant', sous_categorie: 'dettes_fiscales_et_sociales', sens_normal: 'C', type_mra: 'TVA' },
  { ancien_code_pcg: '4471', libelle: 'MRA — impôts et taxes divers (attente)', categorie_ifrs: 'passif_courant', sous_categorie: 'dettes_fiscales_et_sociales', sens_normal: 'C' },
  { ancien_code_pcg: '4550', libelle: 'Comptes courants associés', categorie_ifrs: 'passif_courant', sous_categorie: 'fournisseurs_et_charges_a_payer', sens_normal: 'C' },
  { ancien_code_pcg: '1640', libelle: 'Emprunts bancaires', categorie_ifrs: 'passif_non_courant', sous_categorie: 'emprunts_et_dettes_financieres', sens_normal: 'C' },
  { ancien_code_pcg: '1010', libelle: 'Capital social', categorie_ifrs: 'capitaux_propres', sous_categorie: 'capital_social', sens_normal: 'C' },
  { ancien_code_pcg: '1061', libelle: 'Réserve légale', categorie_ifrs: 'capitaux_propres', sous_categorie: 'reserves', sens_normal: 'C' },
  { ancien_code_pcg: '1068', libelle: 'Autres réserves', categorie_ifrs: 'capitaux_propres', sous_categorie: 'reserves', sens_normal: 'C' },
  { ancien_code_pcg: '1190', libelle: 'Report à nouveau', categorie_ifrs: 'capitaux_propres', sous_categorie: 'resultat_non_distribue', sens_normal: 'C' },
  { ancien_code_pcg: '1200', libelle: 'Résultat de l\'exercice', categorie_ifrs: 'capitaux_propres', sous_categorie: 'resultat_non_distribue', sens_normal: 'C' },
  { ancien_code_pcg: '701', libelle: 'Ventes de marchandises', categorie_ifrs: 'produits', sous_categorie: 'chiffre_affaires', sens_normal: 'C' },
  { ancien_code_pcg: '706', libelle: 'Prestations de services', categorie_ifrs: 'produits', sous_categorie: 'chiffre_affaires', sens_normal: 'C' },
  { ancien_code_pcg: '708', libelle: 'Produits accessoires', categorie_ifrs: 'produits', sous_categorie: 'autres_produits_operationnels', sens_normal: 'C' },
  { ancien_code_pcg: '7131', libelle: 'Production stockée', categorie_ifrs: 'produits', sous_categorie: 'autres_produits_operationnels', sens_normal: 'C' },
  { ancien_code_pcg: '753', libelle: 'Commissions reçues', categorie_ifrs: 'produits', sous_categorie: 'autres_produits_operationnels', sens_normal: 'C' },
  { ancien_code_pcg: '766', libelle: 'Gains de change', categorie_ifrs: 'produits', sous_categorie: 'produits_financiers', sens_normal: 'C' },
  { ancien_code_pcg: '771', libelle: 'Produits exceptionnels', categorie_ifrs: 'produits', sous_categorie: 'autres_produits_operationnels', sens_normal: 'C' },
  { ancien_code_pcg: '601', libelle: 'Achats de marchandises', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '606', libelle: 'Fournitures non stockées', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '607', libelle: 'Achats de services et prestations', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '611', libelle: 'Sous-traitance', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '6131', libelle: 'Loyers (baux courts termes / faible valeur — hors IFRS 16)', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '6135', libelle: 'Charges locatives', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '6151', libelle: 'Entretien et réparations', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '6160', libelle: 'Assurances', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '6221', libelle: 'Honoraires comptables', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '6225', libelle: 'Honoraires juridiques', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '623', libelle: 'Publicité et marketing', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '6251', libelle: 'Frais de déplacement', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '6256', libelle: 'Missions et réceptions', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '6261', libelle: 'Téléphone et internet', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '6271', libelle: 'Frais bancaires', categorie_ifrs: 'charges', sous_categorie: 'charges_financieres', sens_normal: 'D' },
  { ancien_code_pcg: '6272', libelle: 'Commissions bancaires (SWIFT)', categorie_ifrs: 'charges', sous_categorie: 'charges_financieres', sens_normal: 'D' },
  { ancien_code_pcg: '628', libelle: 'Charges externes diverses', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '6351', libelle: 'Droits de timbre', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '6411', libelle: 'Salaires et appointements bruts', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D' },
  { ancien_code_pcg: '6412', libelle: 'Transport allowance', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D' },
  { ancien_code_pcg: '6413', libelle: 'Petrol allowance', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D' },
  { ancien_code_pcg: '6414', libelle: 'Heures supplémentaires', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D' },
  { ancien_code_pcg: '6415', libelle: 'Primes et gratifications', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D' },
  { ancien_code_pcg: '6416', libelle: '13e mois — EOY (provision)', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D' },
  { ancien_code_pcg: '6417', libelle: 'Indemnités compensatrices et départ', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D' },
  { ancien_code_pcg: '6418', libelle: 'Indemnités compensatrices (préavis)', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D' },
  { ancien_code_pcg: '6419', libelle: 'Autres rémunérations', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D' },
  { ancien_code_pcg: '6451', libelle: 'CSG patronale', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D', type_mra: 'CSG' },
  { ancien_code_pcg: '6452', libelle: 'NSF patronal', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D', type_mra: 'NSF' },
  { ancien_code_pcg: '6453', libelle: 'PRGF (charge)', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D', type_mra: 'PRGF' },
  { ancien_code_pcg: '6454', libelle: 'Training Levy HRDC (1%)', categorie_ifrs: 'charges', sous_categorie: 'charges_de_personnel', sens_normal: 'D', type_mra: 'TRAINING_LEVY' },
  { ancien_code_pcg: '651', libelle: 'Redevances licences SaaS', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
  { ancien_code_pcg: '661', libelle: 'Intérêts bancaires', categorie_ifrs: 'charges', sous_categorie: 'charges_financieres', sens_normal: 'D' },
  { ancien_code_pcg: '666', libelle: 'Pertes de change', categorie_ifrs: 'charges', sous_categorie: 'charges_financieres', sens_normal: 'D' },
  { ancien_code_pcg: '671', libelle: 'Charges exceptionnelles', categorie_ifrs: 'charges', sous_categorie: 'achats_et_charges_externes', sens_normal: 'D' },
]

const MAURITIUS_ACCOUNTS: Account[] = MAURITIUS_ACCOUNT_SEEDS.map((seed) => ({
  number: seed.ancien_code_pcg,
  labelFr: seed.libelle,
  description: `IFRS: ${seed.categorie_ifrs} / ${seed.sous_categorie}`,
  classNumber: Number(seed.ancien_code_pcg.charAt(0)),
  category: IFRS_CATEGORY_TO_ACCOUNT_CATEGORY[seed.categorie_ifrs],
  isAuxiliary: seed.ancien_code_pcg === '411' || seed.ancien_code_pcg === '401',
  normalBalance: seed.sens_normal === 'D' ? 'DEBIT' : 'CREDIT',
  isReconcilable: RECONCILABLE_PREFIXES.some((p) => seed.ancien_code_pcg.startsWith(p)),
  taxCode: seed.type_mra,
  jurisdiction: 'MU',
}))

// Minimal PCM chart of accounts (uses existing Mauritius accounting code by reference)
class MauritiusChartOfAccounts implements ChartOfAccountsProvider {
  jurisdiction = 'MU' as const
  framework = 'PCM'

  getClasses(): AccountClass[] {
    return [
      { number: 1, code: '1', label: 'Capital and reserves', labelFr: 'Capitaux et réserves', category: 'BALANCE_SHEET_EQUITY' },
      { number: 2, code: '2', label: 'Fixed assets', labelFr: 'Immobilisations', category: 'BALANCE_SHEET_ASSET' },
      { number: 3, code: '3', label: 'Inventory', labelFr: 'Stocks', category: 'BALANCE_SHEET_ASSET' },
      { number: 4, code: '4', label: 'Third parties', labelFr: 'Tiers', category: 'BALANCE_SHEET_ASSET' },
      { number: 5, code: '5', label: 'Financial', labelFr: 'Financier', category: 'BALANCE_SHEET_ASSET' },
      { number: 6, code: '6', label: 'Expenses', labelFr: 'Charges', category: 'INCOME_STATEMENT_EXPENSE' },
      { number: 7, code: '7', label: 'Revenue', labelFr: 'Produits', category: 'INCOME_STATEMENT_REVENUE' },
    ]
  }

  getAccountsByClass(classNumber: number): Account[] {
    return MAURITIUS_ACCOUNTS.filter((a) => a.classNumber === classNumber)
  }

  getAccount(accountNumber: string): Account | undefined {
    return MAURITIUS_ACCOUNTS.find((a) => a.number === accountNumber)
  }

  searchAccounts(query: string): Account[] {
    const q = query.toLowerCase().trim()
    if (!q) return []
    return MAURITIUS_ACCOUNTS.filter(
      (a) => a.number.includes(q) || a.labelFr.toLowerCase().includes(q),
    )
  }

  getAllAccounts(): Account[] {
    return MAURITIUS_ACCOUNTS
  }

  isValidAccountNumber(num: string): boolean { return /^[1-7]\d{2,5}$/.test(num) }

  getDefaultAccountFor(op: AccountingOperation): string | undefined {
    // Codes VALIDÉS contre le plan comptable réel (table plan_comptable, comptes
    // globaux actifs). Les anciennes valeurs 4443/4452/4421/4310/4441/6200/7660/
    // 6660 n'existaient PAS dans le plan et sont corrigées ici :
    //   VAT_COLLECTED 4443→4457, VAT_DEDUCTIBLE 4452→4456 (4452 = TVA intracom.),
    //   PAYROLL_TAX 4421→4330 (PAYE), SOCIAL_CONTRIBUTIONS 4310→4321 (CSG patronal),
    //   CORPORATE_TAX 4441→4421 (acomptes IS/APS), PERSONNEL_EXPENSES 6200→6411,
    //   FX_GAIN 7660→766, FX_LOSS 6660→666.
    const map: Record<AccountingOperation, string> = {
      'CLIENT_RECEIVABLE': '411',      // Clients
      'SUPPLIER_PAYABLE': '401',       // Fournisseurs
      'BANK_MAIN': '512',              // Banque (compte principal)
      'BANK_TRANSIT': '5800',          // Virements internes (transit)
      'CASH': '531',                   // Caisse principale
      'VAT_COLLECTED': '4457',         // TVA collectée
      'VAT_DEDUCTIBLE': '4456',        // TVA déductible
      'PAYROLL_NET': '4210',           // Salaires nets à payer
      'PAYROLL_TAX': '4330',           // PAYE à reverser à la MRA
      'SOCIAL_CONTRIBUTIONS': '4321',  // CSG patronal à verser (MRA)
      'CORPORATE_TAX': '4421',         // État, acomptes IS (APS)
      'SALES_REVENUE': '701',          // Ventes de marchandises
      'SERVICE_REVENUE': '706',        // Prestations de services
      'PURCHASES': '601',              // Achats de marchandises
      'PERSONNEL_EXPENSES': '6411',    // Salaires et appointements bruts
      'FX_GAIN': '766',                // Gains de change
      'FX_LOSS': '666',                // Pertes de change
      'INTERCOMPANY_TRANSFER': '5800', // Virements internes (transit)
    }
    return map[op]
  }
}

// Stub tax engine - delegates to existing Mauritius MRA code
class MauritiusTaxEngine implements TaxEngine {
  jurisdiction = 'MU' as const

  getVatRates() {
    // Maurice n'a PAS de taux réduit 8% : VAT Act → 15 % standard, 0 %
    // (zero-rated, 1re annexe) et exonéré (exempt, 2e annexe) uniquement.
    return [
      { code: 'STD', label: 'Standard 15%', rate: 0.15 },
      { code: 'ZERO', label: 'Zero-rated', rate: 0 },
      { code: 'EXEMPT', label: 'Exempt', rate: 0 },
    ]
  }

  calculateVat(amount: number, vatCode: string): VatCalculation {
    const rate = this.getVatRates().find(r => r.code === vatCode)?.rate ?? 0
    return {
      netAmount: amount,
      vatAmount: amount * rate,
      grossAmount: amount * (1 + rate),
      vatRate: rate,
      vatCode,
    }
  }

  calculateCorporateIncomeTax(taxable: number, _fiscalYear: number): TaxCalculation {
    const rate = 0.15  // Mauritius standard rate
    return {
      baseAmount: taxable,
      taxAmount: taxable * rate,
      effectiveRate: rate,
      breakdown: [{ from: 0, to: null, rate, amount: taxable * rate }],
    }
  }

  calculateWithholdingTax(amount: number, _beneficiaryType: string, _country?: string): TaxCalculation {
    return {
      baseAmount: amount,
      taxAmount: 0,
      effectiveRate: 0,
      breakdown: [],
    }
  }

  async getVatReturn(_periodStart: Date, _periodEnd: Date, _societeId: string): Promise<VatReturn> {
    throw new Error('Mauritius VAT return: use existing MRA endpoints')
  }

  getRequiredDeclarations(_periodStart: Date, _periodEnd: Date): TaxDeclaration[] {
    return []  // Defer to existing MRA module
  }
}

// Stub payroll - delegates to existing /app/rh module
class MauritiusPayrollEngine implements PayrollEngine {
  jurisdiction = 'MU' as const

  calculatePayslip(_input: PayslipInput): Payslip {
    throw new Error('Mauritius payslip: use existing /app/rh module')
  }

  getSocialContributionRates(_asOf: Date): SocialContributionRates {
    // Taux « pleins » MRA (base > 50 000 MUR) — cf. PARAMS_MRA_DEFAUT dans
    // lib/rh/paie.ts, seule source de vérité du moteur de paie.
    return {
      cnss: { employee: 0.03, employer: 0.06 },     // CSG (taux plein)
      pension: { employee: 0.01, employer: 0.025 }, // NSF (1 % / 2,5 %)
    }
  }

  getIncomeTaxBrackets(_fiscalYear: number): IncomeTaxBracket[] {
    // Barème PAYE Budget 2025-2026 (cf. PARAMS_MRA_DEFAUT, lib/rh/paie.ts) :
    // 0 % jusqu'à 500 000, 10 % de 500 000 à 1 000 000, 20 % au-delà.
    return [
      { from: 0, to: 500000, rate: 0 },
      { from: 500000, to: 1000000, rate: 0.10 },
      { from: 1000000, to: null, rate: 0.20 },
    ]
  }

  calculateSeverancePay(_input: SeveranceInput): SeveranceCalculation {
    throw new Error('Mauritius severance: use existing /app/rh/severance module')
  }

  getMinimumWage(_asOf: Date): number {
    return 16500  // Mauritius minimum wage MUR (2024)
  }
}

// Stub financial statements - delegates to existing Mauritius IFRS reports
class MauritiusStatementsProvider implements FinancialStatementsProvider {
  jurisdiction = 'MU' as const
  system = 'FULL_IFRS' as const

  async generateBalanceSheet(_input: StatementInput): Promise<BalanceSheet> {
    throw new Error('Use existing Mauritius IFRS reports')
  }

  async generateIncomeStatement(_input: StatementInput): Promise<IncomeStatement> {
    throw new Error('Use existing Mauritius IFRS reports')
  }

  async generateCashFlowStatement(_input: StatementInput): Promise<CashFlowStatement> {
    throw new Error('Use existing Mauritius IFRS reports')
  }

  async generateNotes(_input: StatementInput): Promise<FinancialNotes> {
    throw new Error('Use existing Mauritius IFRS reports')
  }
}

export class MauritiusJurisdiction implements Jurisdiction {
  readonly config: JurisdictionConfig = {
    code: 'MU',
    name: 'Mauritius',
    nameFr: 'Maurice',
    framework: 'PCM',
    currency: 'MUR',
    fiscalYearStart: '07-01',  // Mauritius fiscal year July-June
    fiscalYearEnd: '06-30',
    vatRates: [
      { code: 'STD', label: 'Standard 15%', rate: 0.15 },
      { code: 'ZERO', label: 'Zero', rate: 0 },
      { code: 'EXEMPT', label: 'Exempt', rate: 0 },
    ],
    corporateIncomeTaxRate: 0.15,
    withholdingTaxes: [],
  }

  readonly chartOfAccounts = new MauritiusChartOfAccounts()
  readonly taxEngine = new MauritiusTaxEngine()
  readonly payrollEngine = new MauritiusPayrollEngine()
  readonly statementsProvider = new MauritiusStatementsProvider()

  validateJournalEntry(entry: JournalEntry): ValidationResult {
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0)
    const errors: ValidationResult['errors'] = []
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      errors.push({ code: 'R1_UNBALANCED', message: `Debit (${totalDebit}) ≠ Credit (${totalCredit})`, severity: 'ERROR' })
    }
    return { valid: errors.length === 0, errors, warnings: [] }
  }

  getAccount(num: string): Account | undefined { return this.chartOfAccounts.getAccount(num) }

  getCurrentFiscalPeriod(asOf?: Date): FiscalPeriod {
    const d = asOf ?? new Date()
    const year = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
    return {
      start: new Date(year, 6, 1),        // July 1
      end: new Date(year + 1, 5, 30),     // June 30 next year
      status: 'OPEN',
      jurisdictionCode: 'MU',
    }
  }

  isAccountReconcilable(num: string): boolean {
    return ['411', '401', '512', '4210', '5800'].some(p => num.startsWith(p))
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-MU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + ' MUR'
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-MU').format(date)
  }
}

export const mauritiusJurisdiction = new MauritiusJurisdiction()
