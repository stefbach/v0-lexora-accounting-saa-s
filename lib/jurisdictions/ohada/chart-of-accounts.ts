import type { Account, AccountClass, JurisdictionCode } from '../core/types'
import type { ChartOfAccountsProvider, AccountingOperation } from '../core/chart-of-accounts.interface'
import { CLASSE_1_ACCOUNTS } from './classes/classe-1-ressources-durables'
import { CLASSE_2_ACCOUNTS } from './classes/classe-2-actif-immobilise'
import { CLASSE_3_ACCOUNTS } from './classes/classe-3-stocks'
import { CLASSE_4_ACCOUNTS } from './classes/classe-4-tiers'
import { CLASSE_5_ACCOUNTS } from './classes/classe-5-tresorerie'
import { CLASSE_6_ACCOUNTS } from './classes/classe-6-charges'
import { CLASSE_7_ACCOUNTS } from './classes/classe-7-produits'
import { CLASSE_8_ACCOUNTS } from './classes/classe-8-hao'
import { CLASSE_9_ACCOUNTS } from './classes/classe-9-analytique'

export const SYSCOHADA_CLASSES: AccountClass[] = [
  {
    number: 1,
    code: 'CL1',
    label: 'Long-term Resources',
    labelFr: 'Ressources Durables',
    description: 'Capitaux propres, emprunts et dettes financières',
    category: 'BALANCE_SHEET_LIABILITY',
  },
  {
    number: 2,
    code: 'CL2',
    label: 'Fixed Assets',
    labelFr: 'Actif Immobilisé',
    description: 'Immobilisations incorporelles, corporelles et financières',
    category: 'BALANCE_SHEET_ASSET',
  },
  {
    number: 3,
    code: 'CL3',
    label: 'Inventories',
    labelFr: 'Stocks',
    description: 'Stocks et en-cours',
    category: 'BALANCE_SHEET_ASSET',
  },
  {
    number: 4,
    code: 'CL4',
    label: 'Third-Party Accounts',
    labelFr: 'Comptes de Tiers',
    description: 'Fournisseurs, clients, personnel, État et autres tiers',
    category: 'BALANCE_SHEET_ASSET',
  },
  {
    number: 5,
    code: 'CL5',
    label: 'Treasury',
    labelFr: 'Trésorerie',
    description: 'Valeurs mobilières de placement, banques et caisse',
    category: 'BALANCE_SHEET_ASSET',
  },
  {
    number: 6,
    code: 'CL6',
    label: 'Expenses',
    labelFr: 'Charges des Activités Ordinaires',
    description: 'Charges d\'exploitation, financières et HAO',
    category: 'INCOME_STATEMENT_EXPENSE',
  },
  {
    number: 7,
    code: 'CL7',
    label: 'Revenue',
    labelFr: 'Produits des Activités Ordinaires',
    description: 'Produits d\'exploitation, financiers et HAO',
    category: 'INCOME_STATEMENT_REVENUE',
  },
  {
    number: 8,
    code: 'CL8',
    label: 'Other Activities (HAO)',
    labelFr: 'Hors Activités Ordinaires (HAO)',
    description: 'Charges et produits des activités hors exploitation ordinaire',
    category: 'OFF_BALANCE',
  },
  {
    number: 9,
    code: 'CL9',
    label: 'Analytical Accounts',
    labelFr: 'Comptabilité Analytique',
    description: 'Comptes de comptabilité analytique d\'exploitation',
    category: 'ANALYTICAL',
  },
]

export const ALL_OHADA_ACCOUNTS: Account[] = [
  ...CLASSE_1_ACCOUNTS,
  ...CLASSE_2_ACCOUNTS,
  ...CLASSE_3_ACCOUNTS,
  ...CLASSE_4_ACCOUNTS,
  ...CLASSE_5_ACCOUNTS,
  ...CLASSE_6_ACCOUNTS,
  ...CLASSE_7_ACCOUNTS,
  ...CLASSE_8_ACCOUNTS,
  ...CLASSE_9_ACCOUNTS,
]

const DEFAULT_ACCOUNTS: Record<AccountingOperation, string> = {
  CLIENT_RECEIVABLE: '411',
  SUPPLIER_PAYABLE: '401',
  BANK_MAIN: '521',
  BANK_TRANSIT: '588',
  CASH: '571',
  VAT_COLLECTED: '4431',
  VAT_DEDUCTIBLE: '4452',
  PAYROLL_NET: '422',
  PAYROLL_TAX: '447',
  SOCIAL_CONTRIBUTIONS: '431',
  CORPORATE_TAX: '441',
  SALES_REVENUE: '701',
  SERVICE_REVENUE: '706',
  PURCHASES: '601',
  PERSONNEL_EXPENSES: '661',
  FX_GAIN: '776',
  FX_LOSS: '676',
  INTERCOMPANY_TRANSFER: '588',
}

export class OhadaChartOfAccounts implements ChartOfAccountsProvider {
  readonly jurisdiction: 'OHADA' = 'OHADA'
  readonly framework = 'SYSCOHADA'

  getClasses(): AccountClass[] {
    return SYSCOHADA_CLASSES
  }

  getAllAccounts(): Account[] {
    return ALL_OHADA_ACCOUNTS
  }

  getAccountsByClass(classNumber: number): Account[] {
    return ALL_OHADA_ACCOUNTS.filter((a) => a.classNumber === classNumber)
  }

  getAccount(accountNumber: string): Account | undefined {
    return ALL_OHADA_ACCOUNTS.find((a) => a.number === accountNumber)
  }

  searchAccounts(query: string): Account[] {
    const q = query.toLowerCase().trim()
    if (!q) return []
    return ALL_OHADA_ACCOUNTS.filter(
      (a) =>
        a.number.includes(q) ||
        (a.label?.toLowerCase().includes(q) ?? false) ||
        a.labelFr.toLowerCase().includes(q),
    )
  }

  isValidAccountNumber(accountNumber: string): boolean {
    // SYSCOHADA: 2–6 digits, starts with 1–9
    return /^[1-9]\d{1,5}$/.test(accountNumber)
  }

  getDefaultAccountFor(operation: AccountingOperation): string | undefined {
    return DEFAULT_ACCOUNTS[operation]
  }
}

export const ohadaChartOfAccounts = new OhadaChartOfAccounts()
