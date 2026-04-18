import type { AgentToolDefinition } from '@/lib/types/reconciliation'

// ═══════════════════════════════════════════════════════════════
// Outils du CLASSIFICATEUR (étage 1)
// ═══════════════════════════════════════════════════════════════

export const GET_TRANSACTION: AgentToolDefinition = {
  name: 'get_transaction',
  description: 'Récupère les détails complets d\'une transaction bancaire (date, libellé, montant, tiers, IBAN, devise).',
  input_schema: {
    type: 'object',
    properties: {
      transaction_id: { type: 'string', description: 'UUID de la transaction bancaire' },
    },
    required: ['transaction_id'],
  },
}

export const MATCH_EMPLOYEE_IBAN: AgentToolDefinition = {
  name: 'match_employee_iban',
  description: 'Vérifie si un IBAN correspond à un employé de la société. Retourne l\'employé si trouvé.',
  input_schema: {
    type: 'object',
    properties: {
      iban: { type: 'string', description: 'IBAN à vérifier' },
      societe_id: { type: 'string', description: 'UUID de la société' },
    },
    required: ['iban', 'societe_id'],
  },
}

export const MATCH_SUPPLIER: AgentToolDefinition = {
  name: 'match_supplier',
  description: 'Cherche un fournisseur par nom (fuzzy match sur les factures fournisseur existantes).',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nom ou partie du nom du fournisseur' },
      societe_id: { type: 'string', description: 'UUID de la société' },
    },
    required: ['name', 'societe_id'],
  },
}

export const MATCH_CUSTOMER: AgentToolDefinition = {
  name: 'match_customer',
  description: 'Cherche un client par nom (fuzzy match sur les factures client existantes).',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nom ou partie du nom du client' },
      societe_id: { type: 'string', description: 'UUID de la société' },
    },
    required: ['name', 'societe_id'],
  },
}

export const MATCH_SHAREHOLDER: AgentToolDefinition = {
  name: 'match_shareholder',
  description: 'Cherche un associé/actionnaire par nom dans les comptes courants associés.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nom de l\'associé' },
      societe_id: { type: 'string', description: 'UUID de la société' },
    },
    required: ['name', 'societe_id'],
  },
}

export const GET_HISTORICAL_PATTERNS: AgentToolDefinition = {
  name: 'get_historical_patterns',
  description: 'Interroge les patterns d\'apprentissage (client puis tenant) pour cette transaction. Retourne les classifications apprises antérieurement pour des transactions similaires.',
  input_schema: {
    type: 'object',
    properties: {
      societe_id: { type: 'string', description: 'UUID de la société' },
      fingerprint: { type: 'string', description: 'Empreinte de la transaction (label|bucket|iban)' },
    },
    required: ['societe_id', 'fingerprint'],
  },
}

export const CLASSIFY: AgentToolDefinition = {
  name: 'classify',
  description: 'Outil terminal : enregistre la classification finale de la transaction. Appeler UNE SEULE FOIS à la fin de l\'analyse.',
  input_schema: {
    type: 'object',
    properties: {
      transaction_id: { type: 'string', description: 'UUID de la transaction' },
      class: {
        type: 'string',
        enum: ['customer_payment', 'supplier_payment', 'payroll', 'tax_payment', 'shareholder_loan', 'internal_transfer', 'expense_reimbursement', 'bank_fee', 'unknown'],
        description: 'Classe de la transaction',
      },
      confidence: { type: 'number', description: 'Score de confiance 0-100' },
      rationale: { type: 'string', description: '1-2 phrases en français expliquant la classification' },
    },
    required: ['transaction_id', 'class', 'confidence', 'rationale'],
  },
}

// ═══════════════════════════════════════════════════════════════
// Outils des RÉSOLVEURS (étage 2)
// ═══════════════════════════════════════════════════════════════

export const GET_OPEN_INVOICES: AgentToolDefinition = {
  name: 'get_open_invoices',
  description: 'Retourne les factures ouvertes (impayées) d\'une société. Filtrable par type (client/fournisseur) et par nom de tiers.',
  input_schema: {
    type: 'object',
    properties: {
      societe_id: { type: 'string', description: 'UUID de la société' },
      type: { type: 'string', enum: ['client', 'fournisseur'], description: 'Type de facture (optionnel)' },
      customer_name: { type: 'string', description: 'Nom du client/fournisseur pour filtrer (optionnel)' },
    },
    required: ['societe_id'],
  },
}

export const FIND_INVOICE_COMBINATIONS: AgentToolDefinition = {
  name: 'find_invoice_combinations',
  description: 'Cherche les combinaisons de factures dont la somme correspond au montant cible (±2%). Gère la conversion de devises EUR↔MUR. Retourne jusqu\'à 10 combinaisons triées par écart.',
  input_schema: {
    type: 'object',
    properties: {
      societe_id: { type: 'string', description: 'UUID de la société' },
      target_amount: { type: 'number', description: 'Montant cible de la transaction' },
      target_devise: { type: 'string', description: 'Devise de la transaction (EUR, MUR)' },
      type: { type: 'string', enum: ['client', 'fournisseur'], description: 'Type de facture' },
      customer_name: { type: 'string', description: 'Nom du tiers pour filtrer (optionnel)' },
      tolerance: { type: 'number', description: 'Tolérance en pourcentage (défaut 0.02 = 2%)' },
    },
    required: ['societe_id', 'target_amount', 'target_devise'],
  },
}

export const GET_EXCHANGE_RATE: AgentToolDefinition = {
  name: 'get_exchange_rate',
  description: 'Retourne le taux de change EUR/MUR pour une date donnée (source : Banque de Maurice, J-1).',
  input_schema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Date au format YYYY-MM-DD' },
      currency_from: { type: 'string', description: 'Devise source (défaut EUR)' },
      currency_to: { type: 'string', description: 'Devise cible (défaut MUR)' },
    },
    required: ['date'],
  },
}

export const GET_COMPANY_BANK_ACCOUNTS: AgentToolDefinition = {
  name: 'get_company_bank_accounts',
  description: 'Liste les comptes bancaires actifs de la société (banque, IBAN, devise).',
  input_schema: {
    type: 'object',
    properties: {
      societe_id: { type: 'string', description: 'UUID de la société' },
    },
    required: ['societe_id'],
  },
}

export const GET_EMPLOYEES: AgentToolDefinition = {
  name: 'get_employees',
  description: 'Liste les employés actifs de la société avec leurs IBAN et salaire de base.',
  input_schema: {
    type: 'object',
    properties: {
      societe_id: { type: 'string', description: 'UUID de la société' },
    },
    required: ['societe_id'],
  },
}

export const GET_PAYROLL_PERIOD: AgentToolDefinition = {
  name: 'get_payroll_period',
  description: 'Récupère les bulletins de paie d\'une période pour une société.',
  input_schema: {
    type: 'object',
    properties: {
      societe_id: { type: 'string', description: 'UUID de la société' },
      periode: { type: 'string', description: 'Période au format YYYY-MM-DD (premier du mois)' },
    },
    required: ['societe_id', 'periode'],
  },
}

export const GET_PAYROLL_HISTORY: AgentToolDefinition = {
  name: 'get_payroll_history',
  description: 'Historique des salaires nets d\'un employé sur les N derniers mois.',
  input_schema: {
    type: 'object',
    properties: {
      societe_id: { type: 'string', description: 'UUID de la société' },
      employe_id: { type: 'string', description: 'UUID de l\'employé' },
      months: { type: 'number', description: 'Nombre de mois (défaut 6)' },
    },
    required: ['societe_id', 'employe_id'],
  },
}

export const GET_SHAREHOLDERS: AgentToolDefinition = {
  name: 'get_shareholders',
  description: 'Liste les associés et leurs comptes courants associés.',
  input_schema: {
    type: 'object',
    properties: {
      societe_id: { type: 'string', description: 'UUID de la société' },
    },
    required: ['societe_id'],
  },
}

export const FIND_MIRROR_TRANSACTION: AgentToolDefinition = {
  name: 'find_mirror_transaction',
  description: 'Cherche la transaction miroir (même montant, direction opposée, ±2 jours) pour détecter un virement interne.',
  input_schema: {
    type: 'object',
    properties: {
      societe_id: { type: 'string', description: 'UUID de la société' },
      source_tx_id: { type: 'string', description: 'UUID de la transaction source' },
      amount: { type: 'number', description: 'Montant de la transaction' },
      devise: { type: 'string', description: 'Devise' },
      date: { type: 'string', description: 'Date de la transaction (YYYY-MM-DD)' },
      is_debit: { type: 'boolean', description: 'true si la tx source est un débit' },
    },
    required: ['societe_id', 'source_tx_id', 'amount', 'devise', 'date', 'is_debit'],
  },
}

export const GET_CLIENT_PAYMENT_HISTORY: AgentToolDefinition = {
  name: 'get_client_payment_history',
  description: 'Historique des paiements d\'un client (factures payées, montants, dates).',
  input_schema: {
    type: 'object',
    properties: {
      societe_id: { type: 'string', description: 'UUID de la société' },
      customer_name: { type: 'string', description: 'Nom du client' },
      limit: { type: 'number', description: 'Nombre max de résultats (défaut 12)' },
    },
    required: ['societe_id', 'customer_name'],
  },
}

// Outils terminaux des résolveurs
export const CREATE_ALLOCATIONS: AgentToolDefinition = {
  name: 'create_allocations',
  description: 'Outil terminal : crée les allocations et les auto-valide. Confiance ≥ seuil requis.',
  input_schema: {
    type: 'object',
    properties: {
      transaction_id: { type: 'string' },
      societe_id: { type: 'string' },
      confidence: { type: 'number', description: 'Score de confiance 0-100' },
      rationale: { type: 'string', description: 'Justification en français' },
      typology: { type: 'string', enum: ['A', 'B', 'C', 'P1', 'P2', 'P3'] },
      allocations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            facture_id: { type: 'string' },
            employee_id: { type: 'string' },
            payroll_period: { type: 'string' },
            tax_type: { type: 'string' },
            destination_account_id: { type: 'string' },
            account_code: { type: 'string' },
            allocated_amount: { type: 'number' },
            exchange_rate: { type: 'number' },
            is_partial: { type: 'boolean' },
            third_party_name: { type: 'string' },
          },
          required: ['account_code', 'allocated_amount', 'is_partial'],
        },
      },
    },
    required: ['transaction_id', 'societe_id', 'confidence', 'rationale', 'allocations'],
  },
}

export const PROPOSE_ALLOCATIONS: AgentToolDefinition = {
  name: 'propose_allocations',
  description: 'Outil terminal : propose des allocations sans les valider. L\'utilisateur devra confirmer.',
  input_schema: CREATE_ALLOCATIONS.input_schema,
}

export const FLAG_FOR_REVIEW: AgentToolDefinition = {
  name: 'flag_for_review',
  description: 'Outil terminal : marque la transaction pour revue manuelle avec une raison et les candidats possibles.',
  input_schema: {
    type: 'object',
    properties: {
      transaction_id: { type: 'string' },
      societe_id: { type: 'string' },
      reason: { type: 'string', description: 'Raison du flag en français' },
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            facture_id: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['description'],
        },
      },
    },
    required: ['transaction_id', 'reason'],
  },
}

// ═══════════════════════════════════════════════════════════════
// Groupes d'outils par agent
// ═══════════════════════════════════════════════════════════════

export const CLASSIFIER_TOOLS: AgentToolDefinition[] = [
  GET_TRANSACTION,
  MATCH_EMPLOYEE_IBAN,
  MATCH_SUPPLIER,
  MATCH_CUSTOMER,
  MATCH_SHAREHOLDER,
  GET_HISTORICAL_PATTERNS,
  CLASSIFY,
]

export const CUSTOMER_PAYMENT_TOOLS: AgentToolDefinition[] = [
  GET_OPEN_INVOICES,
  FIND_INVOICE_COMBINATIONS,
  GET_CLIENT_PAYMENT_HISTORY,
  GET_EXCHANGE_RATE,
  CREATE_ALLOCATIONS,
  PROPOSE_ALLOCATIONS,
  FLAG_FOR_REVIEW,
]

export const SUPPLIER_PAYMENT_TOOLS: AgentToolDefinition[] = [
  GET_OPEN_INVOICES,
  FIND_INVOICE_COMBINATIONS,
  GET_EXCHANGE_RATE,
  CREATE_ALLOCATIONS,
  PROPOSE_ALLOCATIONS,
  FLAG_FOR_REVIEW,
]

export const PAYROLL_TOOLS: AgentToolDefinition[] = [
  GET_EMPLOYEES,
  GET_PAYROLL_PERIOD,
  GET_PAYROLL_HISTORY,
  MATCH_EMPLOYEE_IBAN,
  GET_EXCHANGE_RATE,
  CREATE_ALLOCATIONS,
  PROPOSE_ALLOCATIONS,
  FLAG_FOR_REVIEW,
]

export const TAX_TOOLS: AgentToolDefinition[] = [
  GET_HISTORICAL_PATTERNS,
  GET_EXCHANGE_RATE,
  CREATE_ALLOCATIONS,
  PROPOSE_ALLOCATIONS,
  FLAG_FOR_REVIEW,
]

export const SHAREHOLDER_TOOLS: AgentToolDefinition[] = [
  GET_SHAREHOLDERS,
  MATCH_SHAREHOLDER,
  GET_EXCHANGE_RATE,
  CREATE_ALLOCATIONS,
  PROPOSE_ALLOCATIONS,
  FLAG_FOR_REVIEW,
]

export const INTERNAL_TRANSFER_TOOLS: AgentToolDefinition[] = [
  GET_COMPANY_BANK_ACCOUNTS,
  FIND_MIRROR_TRANSACTION,
  CREATE_ALLOCATIONS,
  FLAG_FOR_REVIEW,
]
