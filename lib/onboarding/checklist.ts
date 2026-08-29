/**
 * lib/onboarding/checklist.ts — Checklist de mise en route (cible A).
 *
 * Pour le dirigeant autonome : une liste guidée « ce qu'il reste à faire pour
 * démarrer » calculée à partir de signaux réels (profil complété, banque
 * connectée, 1er document, soldes d'ouverture, salariés). Pur → testable.
 */

export interface OnboardingSignals {
  /** date_fin_exercice renseignée (profil comptable minimal). */
  profil_complet: boolean
  /** au moins un compte bancaire OU un relevé importé. */
  banque_connectee: boolean
  /** au moins un document (facture/relevé) traité par l'OCR. */
  a_document: boolean
  /** soldes d'ouverture saisis (à-nouveaux). */
  soldes_ouverture: boolean
  /** au moins un salarié enregistré (étape optionnelle). */
  a_salarie: boolean
}

export interface ChecklistItem {
  key: string
  titre: string
  description: string
  fait: boolean
  optionnel: boolean
  lien: string
}

export interface ChecklistResult {
  items: ChecklistItem[]
  /** progression sur les étapes requises (0-100). */
  progression: number
  /** toutes les étapes requises sont faites. */
  termine: boolean
  nb_requis: number
  nb_requis_faits: number
}

/** Construit la checklist ordonnée à partir des signaux. */
export function computeChecklist(s: OnboardingSignals): ChecklistResult {
  const items: ChecklistItem[] = [
    {
      key: 'profil',
      titre: 'Compléter le profil de votre société',
      description: "Régime TVA, date de clôture — pour des calculs et échéances justes.",
      fait: s.profil_complet,
      optionnel: false,
      lien: '/client/societes',
    },
    {
      key: 'banque',
      titre: 'Connecter votre banque',
      description: "Importez un relevé (PDF) ou reliez votre compte pour le suivi et le rapprochement.",
      fait: s.banque_connectee,
      optionnel: false,
      lien: '/client/banque',
    },
    {
      key: 'document',
      titre: 'Importer votre première facture',
      description: "L'IA lit et enregistre le document — testez avec une facture fournisseur.",
      fait: s.a_document,
      optionnel: false,
      lien: '/client/documents',
    },
    {
      key: 'soldes',
      titre: "Saisir vos soldes d'ouverture",
      description: "Solde de banque, clients et fournisseurs au démarrage — pour un bilan exact.",
      fait: s.soldes_ouverture,
      optionnel: false,
      lien: '/client/echeances',
    },
    {
      key: 'salaries',
      titre: 'Ajouter vos salariés',
      description: "Si vous employez du personnel — active la paie et les déclarations MRA.",
      fait: s.a_salarie,
      optionnel: true,
      lien: '/rh/employes',
    },
  ]

  const requis = items.filter(i => !i.optionnel)
  const nb_requis = requis.length
  const nb_requis_faits = requis.filter(i => i.fait).length
  const progression = nb_requis === 0 ? 100 : Math.round((nb_requis_faits / nb_requis) * 100)

  return {
    // Étapes à faire d'abord (non faites en tête), puis faites ; optionnelles à la fin.
    items: [...items].sort((a, b) => {
      if (a.optionnel !== b.optionnel) return a.optionnel ? 1 : -1
      if (a.fait !== b.fait) return a.fait ? 1 : -1
      return 0
    }),
    progression,
    termine: nb_requis_faits === nb_requis,
    nb_requis,
    nb_requis_faits,
  }
}
