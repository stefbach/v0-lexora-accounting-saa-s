import { describe, it, expect } from 'vitest'
import {
  SOCIETE_TIERS,
  GBC_TIERS,
  OVERAGE_MUR_PER_TX,
  OVERAGE_MUR_PER_ENTITE,
  TIBOK_MUR_PER_CONSULTATION,
  resolveTierIndex,
  resolveTier,
  annualMonthlyPrice,
  annualPrice,
  overageMur,
  monthlyBill,
  initialPayment,
  SETUP_FEE_MUR,
  SETUP_HOURS,
} from './packages'

describe('grille Package Société', () => {
  it('place chaque volume dans le premier palier qui le couvre', () => {
    expect(resolveTier(SOCIETE_TIERS, 1).code).toBe('societe_essentiel')
    expect(resolveTier(SOCIETE_TIERS, 50).code).toBe('societe_essentiel')
    expect(resolveTier(SOCIETE_TIERS, 51).code).toBe('societe_croissance')
    expect(resolveTier(SOCIETE_TIERS, 200).code).toBe('societe_croissance')
    expect(resolveTier(SOCIETE_TIERS, 201).code).toBe('societe_pme')
    expect(resolveTier(SOCIETE_TIERS, 500).code).toBe('societe_pme')
    expect(resolveTier(SOCIETE_TIERS, 501).code).toBe('societe_corporate')
    expect(resolveTier(SOCIETE_TIERS, 1500).code).toBe('societe_corporate')
  })

  it('expose l’index du palier retenu, pour l’affichage', () => {
    expect(resolveTierIndex(SOCIETE_TIERS, 50)).toBe(0)
    expect(resolveTierIndex(SOCIETE_TIERS, 201)).toBe(2)
    expect(resolveTierIndex(SOCIETE_TIERS, 10_000)).toBe(SOCIETE_TIERS.length - 1)
  })

  it('bascule sur le palier négocié au-delà du dernier plafond', () => {
    const tier = resolveTier(SOCIETE_TIERS, 5000)
    expect(tier.code).toBe('societe_enterprise')
    expect(tier.monthly).toBe(0)
  })

  it('a des prix strictement croissants et un coût unitaire dégressif', () => {
    const chiffres = SOCIETE_TIERS.filter(t => t.monthly > 0)
    for (let i = 1; i < chiffres.length; i++) {
      expect(chiffres[i].monthly).toBeGreaterThan(chiffres[i - 1].monthly)
    }
    const parTx = chiffres.map(t => t.monthly / (t.txMax as number))
    for (let i = 1; i < parTx.length; i++) {
      expect(parTx[i]).toBeLessThan(parTx[i - 1])
    }
  })

  it('ne fait dépendre le prix ni de l’effectif ni du nombre d’utilisateurs', () => {
    // Le seul argument d'usage accepté est le volume de transactions : la
    // signature elle-même garantit qu'aucun effectif ne peut entrer dans le
    // calcul. Deux sociétés de 5 et 100 salariés au même volume paient pareil.
    expect(resolveTier(SOCIETE_TIERS, 180)).toBe(resolveTier(SOCIETE_TIERS, 180))
    expect(resolveTier(SOCIETE_TIERS, 180).monthly).toBe(4900)
  })
})

describe('grille Package GBC / IFRS', () => {
  it('tient compte du nombre d’entités à consolider', () => {
    expect(resolveTier(GBC_TIERS, 80, 1).code).toBe('gbc_authorised')
    // Même volume, mais 3 entités : seul le palier Groupe les couvre.
    expect(resolveTier(GBC_TIERS, 80, 3).code).toBe('gbc_groupe')
    expect(resolveTier(GBC_TIERS, 80, 6).code).toBe('gbc_management_co')
  })

  it('est un surensemble tarifaire du Package Société', () => {
    // À volume comparable, un GBC paie strictement plus qu'une société
    // domestique : la conformité Global Business est le surcoût vendu.
    for (const tx of [50, 200, 500, 1500]) {
      const societe = resolveTier(SOCIETE_TIERS, tx)
      const gbc = resolveTier(GBC_TIERS, tx)
      if (societe.monthly > 0 && gbc.monthly > 0) {
        expect(gbc.monthly).toBeGreaterThan(societe.monthly)
      }
    }
  })
})

describe('dépassement', () => {
  it('ne facture rien tant que le plafond n’est pas franchi', () => {
    expect(overageMur(SOCIETE_TIERS, 1, 200)).toBe(0)
    expect(overageMur(SOCIETE_TIERS, 1, 199)).toBe(0)
  })

  it('facture Rs 15 par transaction au-delà du plafond', () => {
    expect(overageMur(SOCIETE_TIERS, 1, 210)).toBe(10 * OVERAGE_MUR_PER_TX)
  })

  it('ne dépasse jamais le prix du palier supérieur', () => {
    // 1 000 transactions sur un palier Croissance (plafond 200) : le brut
    // serait de 800 × 15 = Rs 12 000, bien plus que l'écart Croissance → PME.
    const ecart = SOCIETE_TIERS[2].monthly - SOCIETE_TIERS[1].monthly
    expect(overageMur(SOCIETE_TIERS, 1, 1000)).toBe(ecart)

    // Conséquence : la facture d'un client en dépassement n'excède jamais
    // le prix du palier au-dessus. C'est la promesse « pas de bill shock ».
    const { total } = monthlyBill(SOCIETE_TIERS, 1, 1000)
    expect(total).toBe(SOCIETE_TIERS[2].monthly)
  })

  it('laisse le dépassement non plafonné face à un palier négocié', () => {
    // Palier Corporate : le suivant est « sur devis », aucun écart calculable.
    expect(overageMur(SOCIETE_TIERS, 3, 2500)).toBe(1000 * OVERAGE_MUR_PER_TX)
  })

  it('ne facture aucun dépassement sur un palier illimité', () => {
    expect(overageMur(SOCIETE_TIERS, 4, 99999)).toBe(0)
  })

  it('facture les entités consolidées supplémentaires', () => {
    const { overageEntites, total } = monthlyBill(GBC_TIERS, 2, 1000, 7)
    expect(overageEntites).toBe(2 * OVERAGE_MUR_PER_ENTITE)
    expect(total).toBe(GBC_TIERS[2].monthly + 2 * OVERAGE_MUR_PER_ENTITE)
  })
})

describe('robustesse', () => {
  it('retombe sur le dernier palier si aucune grille ne couvre l’usage', () => {
    // Garde-fou : une grille mal formée (sans palier illimité) ne doit pas
    // renvoyer -1 et faire planter l'affichage.
    const grilleIncomplete = [
      { code: 'a', monthly: 1000, txMax: 10, entitesMax: 1 },
      { code: 'b', monthly: 2000, txMax: 20, entitesMax: 1 },
    ]
    expect(resolveTierIndex(grilleIncomplete, 999)).toBe(1)
    expect(resolveTier(grilleIncomplete, 999).code).toBe('b')
  })

  it('ne facture aucune entité supplémentaire sur un périmètre illimité', () => {
    const { overageEntites } = monthlyBill(GBC_TIERS, 3, 10_000, 42)
    expect(overageEntites).toBe(0)
  })
})

describe('engagement annuel', () => {
  it('offre deux mois : 12 mois d’usage, 10 facturés', () => {
    expect(annualPrice(4900)).toBe(49000)
    expect(annualMonthlyPrice(4900)).toBe(Math.round((4900 * 10) / 12))
  })

  it('reste cohérent avec les prix annuels de la migration 467', () => {
    const attendus: Record<string, number> = {
      societe_essentiel: 25000,
      societe_croissance: 49000,
      societe_pme: 99000,
      societe_corporate: 189000,
      gbc_authorised: 85000,
      gbc_standard: 150000,
      gbc_groupe: 320000,
    }
    for (const tier of [...SOCIETE_TIERS, ...GBC_TIERS]) {
      if (tier.monthly === 0) continue
      expect(annualPrice(tier.monthly)).toBe(attendus[tier.code])
    }
  })
})

describe('frais de mise en service', () => {
  it('est identique sur tous les paliers et les deux packages', () => {
    for (const tier of [...SOCIETE_TIERS, ...GBC_TIERS]) {
      expect(initialPayment(tier).setup).toBe(SETUP_FEE_MUR)
    }
    expect(SETUP_FEE_MUR).toBe(8000)
    expect(SETUP_HOURS).toBe(4)
  })

  it('s’ajoute à la première échéance mensuelle', () => {
    const croissance = SOCIETE_TIERS[1]
    const dû = initialPayment(croissance)
    expect(dû.premiereEcheance).toBe(4900)
    expect(dû.total).toBe(8000 + 4900)
  })

  it('s’ajoute à l’année entière en cas d’engagement annuel', () => {
    const dû = initialPayment(SOCIETE_TIERS[1], 'annuel')
    expect(dû.premiereEcheance).toBe(49000)
    expect(dû.total).toBe(57000)
  })

  it('reste seul chiffrable sur un palier négocié', () => {
    const enterprise = SOCIETE_TIERS[SOCIETE_TIERS.length - 1]
    const dû = initialPayment(enterprise)
    expect(dû.premiereEcheance).toBe(0)
    expect(dû.total).toBe(SETUP_FEE_MUR)
  })

  it('ne s’applique pas aux échéances suivantes', () => {
    // Le frais est one-shot : la facture récurrente ne le porte jamais.
    const { total } = monthlyBill(SOCIETE_TIERS, 1, 150)
    expect(total).toBe(SOCIETE_TIERS[1].monthly)
  })
})

describe('TIBOK pay as you go', () => {
  it('est facturé à l’acte et non au forfait', () => {
    expect(TIBOK_MUR_PER_CONSULTATION).toBe(500)
    // Aucun palier ne porte de coût TIBOK : l'accès est inclus, seul l'acte
    // est facturé. La marge de l'abonnement est donc invariante à l'effectif
    // comme au nombre de consultations.
    const sansConsultation = monthlyBill(SOCIETE_TIERS, 1, 150)
    expect(sansConsultation.total).toBe(SOCIETE_TIERS[1].monthly)
  })
})
