import { describe, it, expect } from 'vitest'
import {
  arrondiMra,
  calculerCsgNsf,
  resoudreBaremeCotisations,
  type BaremeCotisationsMra,
} from './cotisations-mra'
import { calculerBulletin, PARAMS_MRA_DEFAUT, appliquerBaremeCotisations } from './paie'
import { genererPacoMra } from './declarations-mra-paco'

// Lignes telles que seedées par la migration 513 (NUMERIC renvoyés en string).
const ROWS = [
  {
    date_debut: '2025-07-01', date_fin: '2026-06-30', annee: 2025,
    csg_seuil_taux_reduit: '50000.00', csg_salarie_taux_reduit: '0.0150', csg_salarie_taux_plein: '0.0300',
    csg_patronal_taux_reduit: '0.0300', csg_patronal_taux_plein: '0.0600',
    nsf_salarie: '0.0100', nsf_patronal: '0.0250', nsf_plafond_mensuel: '28570.00',
  },
  {
    date_debut: '2026-07-01', date_fin: null, annee: 2026,
    csg_seuil_taux_reduit: '50000.00', csg_salarie_taux_reduit: '0.0150', csg_salarie_taux_plein: '0.0300',
    csg_patronal_taux_reduit: '0.0300', csg_patronal_taux_plein: '0.0600',
    nsf_salarie: '0.0100', nsf_patronal: '0.0250', nsf_plafond_mensuel: '29710.00',
  },
]

const JUILLET_2026: BaremeCotisationsMra = resoudreBaremeCotisations(ROWS, '2026-07-01')

// Cas validés par la MRA sur l'export PACO de juillet 2026.
const CAS_MRA = [
  { salaire: 20945, csg: 942, nsf: 733 },
  { salaire: 21245, csg: 956, nsf: 743 },
  { salaire: 20780, csg: 935, nsf: 728 },
  { salaire: 28915, csg: 1301, nsf: 1012 },
  { salaire: 20170, csg: 908, nsf: 706 },
  { salaire: 19170, csg: 863, nsf: 671 },
]

describe('calculerCsgNsf — cas MRA juillet 2026', () => {
  it.each(CAS_MRA)('salaire $salaire → CSG $csg, NSF $nsf', ({ salaire, csg, nsf }) => {
    const r = calculerCsgNsf(salaire, JUILLET_2026)
    expect(r.csg_total).toBe(csg)
    expect(r.nsf_total).toBe(nsf)
  })

  it('arrondit chaque part séparément (pas round(base × 4,5 %))', () => {
    // 20 945 × 4,5 % = 942,525 → 943 si arrondi global ; MRA attend 314 + 628 = 942.
    const r = calculerCsgNsf(20945, JUILLET_2026)
    expect([r.csg_salarie, r.csg_patronal]).toEqual([314, 628])
    expect(Math.round(20945 * 0.045)).toBe(943)
  })

  it('demi-roupie arrondie vers le haut, sans erreur flottante', () => {
    // 20 780 × 2,5 % = 519,5 → 520
    expect(calculerCsgNsf(20780, JUILLET_2026).nsf_patronal).toBe(520)
    expect(arrondiMra('433.725')).toBe(434)
    expect(arrondiMra('0.5')).toBe(1)
  })
})

describe('calculerCsgNsf — tranches et plafond', () => {
  it('au-delà de 50 000 : 3 % + 6 %, chaque part arrondie', () => {
    const r = calculerCsgNsf(60010, JUILLET_2026)
    expect([r.csg_taux_salarie, r.csg_taux_patronal]).toEqual([0.03, 0.06])
    expect([r.csg_salarie, r.csg_patronal]).toEqual([1800, 3601]) // 1800,3 et 3600,6
  })

  it('50 000 pile reste au taux réduit', () => {
    expect(calculerCsgNsf(50000, JUILLET_2026).csg_total).toBe(750 + 1500)
  })

  it('NSF plafonné à 29 710 depuis juillet 2026', () => {
    const r = calculerCsgNsf(60000, JUILLET_2026)
    expect(r.nsf_assiette).toBe(29710)
    expect([r.nsf_salarie, r.nsf_patronal]).toEqual([297, 743]) // 297,1 et 742,75
  })

  it('base négative traitée comme 0', () => {
    expect(calculerCsgNsf(-100, JUILLET_2026)).toMatchObject({ csg_total: 0, nsf_total: 0 })
  })
})

describe('resoudreBaremeCotisations — date d’effet', () => {
  it('juin 2026 : plafond 28 570 ; juillet 2026 : 29 710', () => {
    expect(resoudreBaremeCotisations(ROWS, '2026-06-30').nsf_plafond_mensuel).toBe(28570)
    expect(resoudreBaremeCotisations(ROWS, '2026-07-01').nsf_plafond_mensuel).toBe(29710)
    expect(resoudreBaremeCotisations(ROWS, '2027-03-01').nsf_plafond_mensuel).toBe(29710)
  })

  it('le cas 28 915 serait plafonné avec le barème 2025 (1 000 ≠ 1 012)', () => {
    const juin = resoudreBaremeCotisations(ROWS, '2026-06-01')
    expect(calculerCsgNsf(28915, juin).nsf_total).toBe(1000)
  })

  it('refuse une date sans barème (pas de repli sur un taux en dur)', () => {
    expect(() => resoudreBaremeCotisations(ROWS, '2025-06-01')).toThrow(/Aucun barème/)
  })

  it('refuse un barème incomplet', () => {
    const incomplet = [{ ...ROWS[1], nsf_plafond_mensuel: null }]
    expect(() => resoudreBaremeCotisations(incomplet, '2026-08-01')).toThrow(/nsf_plafond_mensuel/)
  })
})

describe('bulletin de paie = déclaration PACO', () => {
  const params = appliquerBaremeCotisations(PARAMS_MRA_DEFAUT, JUILLET_2026)

  it.each(CAS_MRA)('salaire $salaire : parts du bulletin = parts déclarées', ({ salaire, csg, nsf }) => {
    const b = calculerBulletin({ salaire_base: salaire }, params, 22)
    const d = calculerCsgNsf(salaire, JUILLET_2026)
    expect(b.csg_salarie).toBe(d.csg_salarie)
    expect(b.nsf_salarie).toBe(d.nsf_salarie)
    expect(b.csg_salarie + b.csg_patronal).toBe(csg)
    expect(b.nsf_salarie + b.nsf_patronal).toBe(nsf)
  })

  it('export PACO : colonnes CSG / NSF = cas MRA', () => {
    const employes = CAS_MRA.map((c, i) => ({ id: `e${i}`, nom: `NOM${i}`, prenom: 'X', nic_number: `N${i}` }))
    const bulletins = CAS_MRA.map((c, i) => ({
      employe_id: `e${i}`, periode: '2026-07-01', salaire_base: c.salaire, base_csg_nsf: c.salaire, salaire_brut: c.salaire,
    }))
    const res = genererPacoMra({
      societe: { nom: 'Test', ern: '12345678', brn: 'C12345678' },
      employes, bulletins, periode: '2026-07', params: JUILLET_2026,
    })
    expect(res.total_csg).toBe(CAS_MRA.reduce((s, c) => s + c.csg, 0))
    expect(res.total_nsf).toBe(CAS_MRA.reduce((s, c) => s + c.nsf, 0))
  })
})
