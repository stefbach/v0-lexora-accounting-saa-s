import { describe, it, expect } from "vitest"
import {
  calculerBulletin,
  calculerBulletinDevise,
  calculerTreizMois,
  calculerPAYE,
  calculerNIT,
  calculerPRGF,
  PARAMS_MRA_DEFAUT,
  type ElementsBrut,
} from "./paie"

const P = PARAMS_MRA_DEFAUT

/**
 * Tests du moteur de paie MRA. On valide la LOGIQUE et les INVARIANTS
 * (barème, bascule de tranche, plafonnement, équilibre brut/net) de façon
 * PARAMÉTRIQUE — sans figer les constantes débattues (ex. plafond NSF), pour
 * rester robuste si les taux officiels évoluent.
 */

describe("calculerPAYE — barème cumulatif × 13", () => {
  it("0 sous le seuil d'exonération (annuel ≤ 500K)", () => {
    // 38 000 × 13 = 494 000 ≤ 500 000 → 0
    expect(calculerPAYE(38000)).toBe(0)
  })
  it("exactement au seuil → 0", () => {
    const mensuelAuSeuil = P.paye_seuil_exoneration / 13
    expect(calculerPAYE(mensuelAuSeuil)).toBe(0)
  })
  it("tranche 1 (10%) juste au-dessus du seuil", () => {
    // 40 000 × 13 = 520 000 → (520000-500000)*10% = 2000 /13 = 153.84 → floor 153
    expect(calculerPAYE(40000)).toBe(Math.floor(((40000 * 13 - 500000) * 0.1) / 13))
    expect(calculerPAYE(40000)).toBeGreaterThan(0)
  })
  it("tranche 2 (20%) au-dessus de 1M annuel", () => {
    // 100 000 × 13 = 1 300 000 → t1=(1M-500K)*10%=50000 ; t2=(1.3M-1M)*20%=60000 ; /13
    const attendu = Math.floor((50000 + 60000) / 13)
    expect(calculerPAYE(100000)).toBe(attendu)
  })
  it("monotone croissant", () => {
    const a = calculerPAYE(45000)
    const b = calculerPAYE(60000)
    const c = calculerPAYE(120000)
    expect(b).toBeGreaterThanOrEqual(a)
    expect(c).toBeGreaterThan(b)
  })
})

describe("calculerNIT — crédit bas revenus", () => {
  it("éligible si 0 < revenu ≤ 25 000", () => {
    expect(calculerNIT(20000)).toEqual({ eligible: true, montant: 1000 })
    expect(calculerNIT(25000)).toEqual({ eligible: true, montant: 1000 })
  })
  it("non éligible au-dessus du seuil", () => {
    expect(calculerNIT(25001)).toEqual({ eligible: false, montant: 0 })
  })
  it("non éligible si revenu nul ou négatif", () => {
    expect(calculerNIT(0)).toEqual({ eligible: false, montant: 0 })
    expect(calculerNIT(-5)).toEqual({ eligible: false, montant: 0 })
  })
})

describe("calculerPRGF — max(4.5% émoluments, 4.50/jour)", () => {
  it("choisit le pourcentage quand il domine", () => {
    const r = calculerPRGF(50000, 26)
    expect(r.prgf_pct).toBe(Math.round(50000 * P.prgf_taux_emoluments * 100) / 100)
    expect(r.method).toBe("percentage")
    expect(r.prgf).toBe(Math.max(r.prgf_pct, r.prgf_jour))
  })
  it("choisit le forfait/jour pour de très bas émoluments", () => {
    const r = calculerPRGF(100, 26)
    expect(r.method).toBe("per_day")
    expect(r.prgf).toBe(r.prgf_jour)
  })
})

describe("calculerBulletin — invariants", () => {
  const base = (o: Partial<ElementsBrut> = {}): ElementsBrut => ({ salaire_base: 30000, ...o })

  it("net = brut − total_deductions et net ≥ 0", () => {
    const r = calculerBulletin(base())
    expect(r.salaire_net).toBeCloseTo(r.salaire_brut - r.total_deductions, 2)
    expect(r.salaire_net).toBeGreaterThanOrEqual(0)
  })

  it("total_deductions = csg + csg_bonus + nsf + paye", () => {
    const r = calculerBulletin(base({ salaire_base: 80000, eoy_bonus: 80000 }))
    expect(r.total_deductions).toBeCloseTo(r.csg_salarie + r.csg_bonus + r.nsf_salarie + r.paye, 2)
  })

  it("coût employeur = brut + charges patronales", () => {
    const r = calculerBulletin(base({ salaire_base: 60000 }))
    expect(r.cout_total_employeur).toBeCloseTo(r.salaire_brut + r.total_charges_patronales, 2)
  })

  it("CSG bascule de taux au seuil (≤ réduit, > plein)", () => {
    const sous = calculerBulletin(base({ salaire_base: P.csg_seuil_taux_reduit })) // = seuil → réduit
    const sur = calculerBulletin(base({ salaire_base: P.csg_seuil_taux_reduit + 1000 }))
    expect(sous.csg_taux).toBe(P.csg_salarie_taux_reduit)
    expect(sur.csg_taux).toBe(P.csg_salarie_taux_plein)
  })

  it("NSF plafonné : au-delà du plafond, NSF = plafond × taux (pas base × taux)", () => {
    const plafond = P.nsf_plafond_mensuel as number
    const r = calculerBulletin(base({ salaire_base: plafond + 50000 }))
    expect(r.nsf_salarie).toBe(Math.round(plafond * P.nsf_salarie))
    // patronal capé sur la même base plafonnée
    expect(r.nsf_patronal).toBe(Math.round(plafond * P.nsf_patronal))
  })

  it("les allowances entrent dans la base CSG/NSF", () => {
    const sans = calculerBulletin(base({ salaire_base: 20000 }))
    const avec = calculerBulletin(base({ salaire_base: 20000, transport_allowance: 5000, special_allowance_1: 3000 }))
    // base plus élevée ⇒ CSG salarié plus élevée
    expect(avec.csg_salarie).toBeGreaterThan(sans.csg_salarie)
  })

  it("deductionAbsence réduit les bases (moins de CSG/NSF/PAYE)", () => {
    const plein = calculerBulletin(base({ salaire_base: 60000 }))
    const absent = calculerBulletin(base({ salaire_base: 60000 }), P, 26, 0, 924.48, 818.22, 10000)
    expect(absent.csg_salarie).toBeLessThan(plein.csg_salarie)
    expect(absent.paye).toBeLessThanOrEqual(plein.paye)
  })

  it("EOY bonus exclu de la base mensuelle mais ajouté au brut", () => {
    const r = calculerBulletin(base({ salaire_base: 40000, eoy_bonus: 40000 }))
    // brut inclut le bonus
    expect(r.salaire_brut).toBeCloseTo(80000, 2)
    // csg_bonus calculée séparément, au même taux que le salaire
    expect(r.csg_bonus).toBe(Math.round(40000 * r.csg_taux))
  })

  it("NIT réduit le PAYE pour un bas salaire (paye = max(0, brut − nit))", () => {
    const r = calculerBulletin(base({ salaire_base: 24000 }))
    expect(r.nit_eligible).toBe(true)
    expect(r.paye).toBe(Math.max(0, r.paye_brut - r.nit_montant))
  })

  it("tous les montants arrondis à 2 décimales", () => {
    const r = calculerBulletin(base({ salaire_base: 33333, transport_allowance: 1111 }))
    for (const v of [r.salaire_brut, r.csg_salarie, r.nsf_salarie, r.paye, r.salaire_net, r.cout_total_employeur]) {
      expect(Math.round(v * 100) / 100).toBe(v)
    }
  })

  it("salaire nul → tout à zéro, net ≥ 0", () => {
    const r = calculerBulletin(base({ salaire_base: 0 }))
    expect(r.salaire_brut).toBe(0)
    expect(r.total_deductions).toBe(0)
    expect(r.salaire_net).toBe(0)
  })
})

describe("calculerTreizMois — 13e mois (WRA S.52)", () => {
  it("total au prorata des mois travaillés", () => {
    expect(calculerTreizMois(30000, 12, "total")).toBe(30000)
    expect(calculerTreizMois(30000, 6, "total")).toBe(15000)
  })
  it("tranches 75% / 25% somment au total", () => {
    const base = 30000
    const t75 = calculerTreizMois(base, 12, "75pct")
    const t25 = calculerTreizMois(base, 12, "25pct")
    expect(t75).toBe(22500)
    expect(t25).toBe(7500)
    expect(Math.round((t75 + t25) * 100) / 100).toBe(calculerTreizMois(base, 12, "total"))
  })
  it("arrondi 2 décimales", () => {
    expect(calculerTreizMois(33333, 7)).toBe(Math.round((33333 / 12) * 7 * 100) / 100)
  })
})

describe("calculerBulletinDevise — salaire en EUR converti MUR", () => {
  it("MUR : pas de conversion", async () => {
    const r = await calculerBulletinDevise({ salaire_base: 40000 }, "MUR")
    expect(r.devise_info.devise).toBe("MUR")
    expect(r.salaire_brut).toBeCloseTo(40000, 2)
  })
  it("EUR : salaire converti au taux, info devise renseignée", async () => {
    const taux = 46.5
    const r = await calculerBulletinDevise({ salaire_base: 1000 }, "EUR", taux)
    expect(r.devise_info.devise).toBe("EUR")
    expect(r.devise_info.montant_eur).toBe(1000)
    expect(r.devise_info.taux_applique).toBe(taux)
    // salaire_brut en MUR = 1000 × 46.5
    expect(r.salaire_brut).toBeCloseTo(46500, 0)
  })
})
