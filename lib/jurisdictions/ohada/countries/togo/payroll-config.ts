import { OhadaPayrollConfig, IRPPBracket } from '../../types';

export const TOGO_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'TG',

  cnss: {
    employee: 0.04,
    employer: 0.175,
    cap: 400000, // XOF
  },

  familyAllowances: 0.03,

  workAccident: 0.02,

  irpp: {
    brackets: [
      {
        min: 0,
        max: 60000,
        rate: 0.005, // 0.5%
      },
      {
        min: 60000,
        max: 150000,
        rate: 0.07, // 7%
      },
      {
        min: 150000,
        max: 300000,
        rate: 0.15, // 15%
      },
      {
        min: 300000,
        max: 500000,
        rate: 0.25, // 25%
      },
      {
        min: 500000,
        max: 800000,
        rate: 0.30, // 30%
      },
      {
        min: 800000,
        max: Infinity,
        rate: 0.35, // 35%
      },
    ] as IRPPBracket[],
  },

  abatementSalaire: 0.28, // 28%

  minimumWage: 35000, // XOF
};
