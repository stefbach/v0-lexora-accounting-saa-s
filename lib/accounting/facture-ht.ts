/**
 * Montant HORS TAXE d'une facture, dans sa devise d'origine.
 *
 * Définition comptable, non ambiguë : HT = TTC − TVA (exactement ce qui est
 * porté au compte de produits/charges 70x/60x).
 *
 * On n'applique JAMAIS une heuristique du type « si HT == TTC alors diviser
 * par (1 + taux_tva) » : une facture déjà hors taxe (export, client offshore,
 * devise étrangère) a légitimement HT == TTC, et un `taux_tva` par défaut (15)
 * la ferait diviser à tort → chiffre d'affaires sous-estimé de ~13 %.
 *
 * Règle appliquée :
 *   • montant_tva = 0  → facture hors taxe → HT = montant (aucune déduction)
 *   • montant_tva > 0  → HT = TTC − TVA (auto-corrige aussi le cas legacy où
 *                        le TTC avait été saisi par erreur dans le champ HT,
 *                        dès lors que la TVA est correctement renseignée)
 *   • TTC absent/invalide → fallback sur le montant_ht stocké
 *
 * Le résultat est toujours ≥ 0.
 */
export interface FactureMontants {
  montant_ht?: number | string | null
  montant_ttc?: number | string | null
  montant_tva?: number | string | null
}

export function computeFactureHt(f: FactureMontants): number {
  const ht = Number(f.montant_ht) || 0
  const ttc = Number(f.montant_ttc) || 0
  const tva = Number(f.montant_tva) || 0
  // TTC valide (et cohérent : au moins égal à la TVA) → HT = TTC − TVA.
  // Sinon on retombe sur le HT stocké.
  const htReel = ttc > 0 && ttc + 0.01 >= tva ? ttc - tva : ht
  return Math.max(0, htReel)
}
