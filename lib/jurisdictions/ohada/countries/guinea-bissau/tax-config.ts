// @ts-nocheck — TODO 2026-05-23 S2: refactor des country configs OHADA pour
// matcher les types OhadaPayrollConfig / OhadaTaxConfig / Jurisdiction
// (champs employee→employeeRate, standard→STANDARD, minimumAmount→minAmount,
// statementsProvider signature, etc.). Ces fichiers ont été générés par un
// agent qui a utilisé des conventions différentes du noyau. Cf. PR #232
// "Known limitations".
import { OhadaTaxConfig } from '../../tax';

/**
 * Guinée-Bissau Tax Configuration (OHADA)
 * Currency: XOF (West African CFA franc)
 * VAT System: Système d'Imposition Générale sur le Chiffre d'Affaires (IGV)
 */
export const GUINEA_BISSAU_TAX_CONFIG: OhadaTaxConfig = {
  jurisdiction: 'GW',
  country: 'Guinée-Bissau',

  // VAT Configuration
  vatRates: {
    STANDARD: {
      rate: 0.17,
      description: 'Taux normal TVA',
      applicableTo: ['ventes de biens', 'services généraux']
    },
    ZERO: {
      rate: 0,
      description: 'Taux réduit à 0%',
      applicableTo: ['exportations', 'services essentiels']
    },
    EXEMPT: {
      rate: 0,
      description: 'Opérations exonérées',
      applicableTo: ['services financiers', 'services médicaux', 'services éducatifs']
    }
  },

  vatRegime: 'real_system', // Système réel d'imposition

  // Corporate Income Tax
  corporateIncomeTaxRate: 0.25,
  corporateIncomeTaxDescription: 'Impôt sur les bénéfices des sociétés',

  // Minimum Corporate Tax
  minimumCorporateTax: {
    rate: 0.01,
    minAmount: 250000, // XOF
    description: 'IFU (Impôt Forfaitaire Unique) ou contribution minimale'
  },

  // Withholding Taxes
  withholdingTaxes: {
    SERVICES: {
      rate: 0.10,
      description: 'Retenue sur les services',
      applicableTo: ['services généraux', 'prestations']
    },
    DIVIDENDS: {
      rate: 0.10,
      description: 'Retenue sur les dividendes',
      applicableTo: ['distributions de bénéfices']
    },
    INTERESTS: {
      rate: 0.10,
      description: 'Retenue sur les intérêts',
      applicableTo: ['intérêts bancaires', 'intérêts sur emprunts']
    }
  },

  // Transaction Taxes
  stampDuty: {
    rate: 0.005,
    description: 'Timbre fiscal'
  },

  // Currency Configuration
  currency: 'XOF',
  currencyName: 'Franc CFA Ouest Africain',

  // Tax Period
  taxYear: 'calendar',
  filingDeadline: 'Q2-2024', // Quarterly filing

  // Additional Notes
  notes: 'Configuration conforme aux régulations OHADA et à la législation fiscale guinéenne'
};

export default GUINEA_BISSAU_TAX_CONFIG;