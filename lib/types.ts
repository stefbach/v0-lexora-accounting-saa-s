export interface ParametresPaieMRA {
  csg_seuil_taux_reduit: number
  csg_salarie_taux_reduit: number
  csg_salarie_taux_plein: number
  csg_patronal: number
  csg_patronal_taux_reduit: number  // 3% employeur si brut <= 50K
  nsf_salarie: number
  nsf_patronal: number
  training_levy: number
  prgf_patronal_par_jour: number    // PRGF par jour travaillé
  prgf_taux_emoluments: number      // 4.5% — Portable Retirement Gratuity Fund
  paye_seuil_exoneration: number
  paye_taux_1: number
  paye_seuil_taux_2: number
  paye_taux_2: number
  salary_compensation: number       // Rs 635 Salary Compensation
  salary_compensation_seuil: number // Applicable si salaire <= 50,000
}
