import { OhadaTaxConfig } from '../../types';

/**
 * Congo Brazzaville (CG) - CEMAC, devise XAF
 * Configuration fiscale pour la Republique du Congo
 * Source: Code General des Impots - Congo
 */
export const CONGO_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'CG',
  country: 'Congo Brazzaville',
  region: 'CEMAC',
  currency: 'XAF',

  // TVA Configuration
  // TVA standard 18% + surtaxe 5% = 18.9% effectif
  vatRates: {
    standard: 0.189, // 18% + 5% surtaxe = 18.9%
    zero: 0.0,
    exempt: 0.0,
  },
  vatThreshold: 50000000, // XAF

  // Impôt sur les sociétés
  corporateIncomeTaxRate: 0.30, // 30%

  // Retenues à la source (RAS)
  withholding: {
    SERVICES_RESIDENT: 0.077, // Services 7.7%
    NON_RESIDENT: 0.20, // Non-résidents 20%
    DIVIDENDS: 0.20, // Dividendes 20%
    INTERESTS: 0.20, // Intérêts 20%
    ROYALTIES: 0.20, // Royalties 20%
  },

  // Impôt minimum
  minimumCorporateTax: {
    rate: 0.01, // 1% du chiffre d'affaires
    minimumAmount: 1000000, // XAF
  },

  // Fiscalité des établissements permanents
  permanentEstablishment: {
    threshold: 183, // jours
    taxRate: 0.30,
  },

  // Régimes spéciaux
  specialRegimes: {
    smallBusiness: {
      enabled: true,
      thresholdCA: 100000000, // XAF
    },
  },
};
