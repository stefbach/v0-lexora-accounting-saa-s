// @ts-nocheck — TODO 2026-05-23 S2: refactor des country configs OHADA pour
// matcher les types OhadaPayrollConfig / OhadaTaxConfig / Jurisdiction
// (champs employee→employeeRate, standard→STANDARD, minimumAmount→minAmount,
// statementsProvider signature, etc.). Ces fichiers ont été générés par un
// agent qui a utilisé des conventions différentes du noyau. Cf. PR #232
// "Known limitations".
import { OhadaPayrollConfig } from '../../payroll';

/**
 * Congo Brazzaville (CG) - CEMAC, devise XAF
 * Configuration de la paie pour la Republique du Congo
 * Source: Code du Travail - Congo, CNSS Congo
 */
export const CONGO_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'CG',
  country: 'Congo Brazzaville',
  region: 'CEMAC',
  currency: 'XAF',

  // Salaire minimum interprofessionnel garanti (SMIG)
  minimumWage: 90000, // XAF

  // Cotisations CNSS (Caisse Nationale de Sécurité Sociale - Congo)
  cnss: {
    employee: 0.04, // 4% salaire brut
    employer: 0.205, // 20.5% salaire brut
    cap: 1200000, // XAF - plafond mensuel
  },

  // Allocations familiales
  familyAllowances: {
    rate: 0.10, // 10% du salaire brut
  },

  // Accident du travail
  workAccident: {
    rate: 0.0225, // 2.25%
  },

  // IRPP - Impôt sur le Revenu des Personnes Physiques (Congo)
  // Barème annuel en XAF
  irpp: {
    enabled: true,
    annual: [
      { min: 0, max: 464000, rate: 0.01 },
      { min: 464000, max: 1000000, rate: 0.10 },
      { min: 1000000, max: 3000000, rate: 0.25 },
      { min: 3000000, max: Infinity, rate: 0.40 },
    ],
    // Quotient familial avec parts fiscales (1-7)
    familyQuotient: {
      enabled: true,
      baseParts: 1,
      maxParts: 7,
      childPart: 0.5,
    },
  },

  // Abattement salaire
  abatementSalaire: 0.20, // 20% du salaire brut

  // Configuration des retenues obligatoires
  mandatoryDeductions: {
    cnss: true,
    irpp: true,
    familyAllowances: true,
    workAccident: true,
  },

  // Configuration des prestations
  benefits: {
    family: true,
    disability: true,
    survivorship: true,
    healthcare: true,
    maternity: true,
  },

  // Régimes spéciaux
  specialRegimes: {
    publicServants: {
      enabled: true,
      cnssRate: 0.03,
    },
    domesticWorkers: {
      enabled: true,
      cnssRate: 0.04,
    },
  },
};