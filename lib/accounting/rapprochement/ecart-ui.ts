/**
 * ecart-ui.ts — Qualification d'écart côté UI (rapprochement).
 *
 * Miroir léger de `computeEcartCompte` (lettrage.ts) pour les dialogues
 * d'imputation : quand on solde une facture pour un montant ≠ du virement
 * (typiquement un règlement en devise étrangère), l'opérateur choisit où
 * imputer le delta. La résolution compte/libellé est centralisée ici pour
 * rester cohérente entre /client/rapprochement et /comptable/rapprochement.
 *
 * Le sens débit/crédit final reste imposé côté serveur par l'équilibrage BNQ
 * (action lettrer_partiel) ; on ne transmet que le compte + le libellé.
 */

export type EcartTypeChoice =
  | "auto"
  | "attente"
  | "change"
  | "escompte"
  | "penalite"
  | "exceptionnel"

export const ECART_TYPE_OPTIONS: { value: EcartTypeChoice; label: string }[] = [
  { value: "auto", label: "Automatique (change / frais / acompte)" },
  { value: "attente", label: "Compte d'attente 471 (à régulariser)" },
  { value: "change", label: "Écart de change (666 perte / 766 gain)" },
  { value: "escompte", label: "Escompte (665 accordé / 765 obtenu)" },
  { value: "penalite", label: "Pénalité de retard (631)" },
  { value: "exceptionnel", label: "Écart exceptionnel (658 / 758)" },
]

/**
 * Résout {compte, libellé} à partir du type d'écart choisi et de son signe.
 * @param signe  virement − somme affectée. signe ≥ 0 : reçu PLUS que soldé
 *               (gain) ; signe < 0 : reçu MOINS (perte). Aligné sur la
 *               convention `ecartSigne` de computeEcartCompte côté serveur.
 * @returns null pour "auto" (laisse le serveur décider).
 */
export function resolveEcartCompte(
  type: EcartTypeChoice,
  signe: number,
): { compte: string; libelle: string } | null {
  switch (type) {
    case "attente":
      return { compte: "471", libelle: "Écart à régulariser (compte d'attente)" }
    case "change":
      return signe >= 0
        ? { compte: "766", libelle: "Gain de change réalisé" }
        : { compte: "666", libelle: "Perte de change réalisée" }
    case "escompte":
      return signe >= 0
        ? { compte: "765", libelle: "Escompte obtenu" }
        : { compte: "665", libelle: "Escompte accordé" }
    case "penalite":
      return { compte: "631", libelle: "Pénalité de retard" }
    case "exceptionnel":
      return signe >= 0
        ? { compte: "758", libelle: "Écart exceptionnel (produit)" }
        : { compte: "658", libelle: "Écart exceptionnel (charge)" }
    case "auto":
    default:
      return null
  }
}
