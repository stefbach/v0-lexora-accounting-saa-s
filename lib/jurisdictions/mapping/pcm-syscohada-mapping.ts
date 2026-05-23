import type { Account } from '../core/types'

export interface AccountMapping {
  pcmAccount: string  // Account number in PCM (Mauritius)
  syscohadaAccount: string  // Account number in SYSCOHADA
  description: string
  category: 'EXACT' | 'APPROXIMATE' | 'STRUCTURAL_DIFF'
  notes?: string
}

/**
 * Major equivalences between PCM (Mauritius) and SYSCOHADA accounts.
 * Used for consolidation across jurisdictions and migration.
 */
export const PCM_TO_SYSCOHADA_MAPPING: AccountMapping[] = [
  // Capital and reserves
  { pcmAccount: '101', syscohadaAccount: '101', description: 'Capital social', category: 'EXACT' },
  { pcmAccount: '106', syscohadaAccount: '106', description: 'Réserves', category: 'EXACT' },
  { pcmAccount: '120', syscohadaAccount: '121', description: 'Résultat (bénéfice)', category: 'APPROXIMATE',
    notes: 'PCM: 120 unique. SYSCOHADA: 121 (bénéfice) ou 129 (perte) selon signe.' },

  // Fixed assets
  { pcmAccount: '21', syscohadaAccount: '21', description: 'Immobilisations incorporelles', category: 'EXACT' },
  { pcmAccount: '22', syscohadaAccount: '22', description: 'Terrains', category: 'EXACT' },
  { pcmAccount: '23', syscohadaAccount: '23', description: 'Bâtiments', category: 'EXACT' },
  { pcmAccount: '24', syscohadaAccount: '24', description: 'Matériel', category: 'EXACT' },
  { pcmAccount: '28', syscohadaAccount: '28', description: 'Amortissements', category: 'EXACT' },

  // Inventory
  { pcmAccount: '31', syscohadaAccount: '31', description: 'Marchandises', category: 'EXACT' },
  { pcmAccount: '32', syscohadaAccount: '32', description: 'Matières premières', category: 'EXACT' },
  { pcmAccount: '36', syscohadaAccount: '36', description: 'Produits finis', category: 'EXACT' },

  // Third parties
  { pcmAccount: '401', syscohadaAccount: '401', description: 'Fournisseurs', category: 'EXACT' },
  { pcmAccount: '411', syscohadaAccount: '411', description: 'Clients', category: 'EXACT' },
  { pcmAccount: '421', syscohadaAccount: '422', description: 'Personnel - rémunérations dues', category: 'APPROXIMATE',
    notes: 'PCM 421 = SYSCOHADA 422. PCM 422 (charges sociales) = SYSCOHADA 431 (CNSS)' },
  { pcmAccount: '4210', syscohadaAccount: '422', description: 'Personnel salaires', category: 'EXACT' },
  { pcmAccount: '4310', syscohadaAccount: '431', description: 'Sécurité sociale (CSG/CNSS)', category: 'EXACT' },
  { pcmAccount: '4441', syscohadaAccount: '441', description: 'État impôt sur résultat', category: 'EXACT' },
  { pcmAccount: '4443', syscohadaAccount: '4431', description: 'TVA collectée', category: 'EXACT' },
  { pcmAccount: '4452', syscohadaAccount: '4452', description: 'TVA déductible', category: 'EXACT' },

  // Bank / Treasury
  { pcmAccount: '512', syscohadaAccount: '521', description: 'Banque', category: 'EXACT' },
  { pcmAccount: '531', syscohadaAccount: '571', description: 'Caisse', category: 'APPROXIMATE',
    notes: 'PCM 531 (caisse) = SYSCOHADA 571 (caisse). Numérotation différente.' },
  { pcmAccount: '5800', syscohadaAccount: '588', description: 'Virements internes / transit', category: 'APPROXIMATE',
    notes: 'PCM 5800 (4 chiffres) = SYSCOHADA 588 (3 chiffres). Même rôle.' },

  // Expenses (Class 6)
  { pcmAccount: '601', syscohadaAccount: '601', description: 'Achats marchandises', category: 'EXACT' },
  { pcmAccount: '6200', syscohadaAccount: '661', description: 'Personnel - rémunérations', category: 'APPROXIMATE',
    notes: 'PCM 6200 charges personnel = SYSCOHADA 661 (national) ou 662 (non-national).' },

  // Revenue (Class 7)
  { pcmAccount: '701', syscohadaAccount: '701', description: 'Ventes marchandises', category: 'EXACT' },
  { pcmAccount: '706', syscohadaAccount: '706', description: 'Prestations de services', category: 'EXACT' },

  // Structural differences
  { pcmAccount: 'N/A', syscohadaAccount: '8', description: 'Classe 8 (HAO) - n\'existe pas en PCM', category: 'STRUCTURAL_DIFF',
    notes: 'SYSCOHADA classe 8 = Hors Activités Ordinaires (HAO). PCM intègre dans classes 6/7 exceptionnels.' },
  { pcmAccount: 'N/A', syscohadaAccount: '9', description: 'Classe 9 (Analytique) - n\'existe pas en PCM', category: 'STRUCTURAL_DIFF',
    notes: 'SYSCOHADA classe 9 = Comptabilité analytique séparée. PCM utilise extra-comptable.' },
]

export function mapPcmToSyscohada(pcmAccount: string): AccountMapping | undefined {
  return PCM_TO_SYSCOHADA_MAPPING.find(m => m.pcmAccount === pcmAccount)
}

export function mapSyscohadaToPcm(syscohadaAccount: string): AccountMapping | undefined {
  return PCM_TO_SYSCOHADA_MAPPING.find(m => m.syscohadaAccount === syscohadaAccount)
}

export function getMappingByCategory(category: AccountMapping['category']): AccountMapping[] {
  return PCM_TO_SYSCOHADA_MAPPING.filter(m => m.category === category)
}

export function getStructuralDifferences(): AccountMapping[] {
  return getMappingByCategory('STRUCTURAL_DIFF')
}
