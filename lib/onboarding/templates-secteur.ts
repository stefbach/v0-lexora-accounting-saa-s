/**
 * Templates par secteur d'activité — pré-paramétrage TVA + comptes utiles.
 *
 * À l'onboarding, le client choisit son secteur. On lui propose alors :
 *   - Le taux TVA par défaut applicable à ses ventes
 *   - Le statut TVA (assujetti, exonéré)
 *   - Une short-list de comptes spécifiques utiles (en plus du PCM essentiel)
 *
 * Référentiel : MRA Mauritius — VAT Act 1998
 *   • Standard rate : 15 %
 *   • Zero-rated : exports, certains produits alimentaires de base
 *   • Exempt : santé, éducation, services financiers, location résidentielle
 */
export type SecteurCode =
  | 'services'
  | 'retail'
  | 'manufacturing'
  | 'healthcare'
  | 'education'
  | 'financial_services'
  | 'real_estate'
  | 'hospitality'
  | 'export'
  | 'other'

export type SecteurTemplate = {
  code: SecteurCode
  label: string
  description: string
  /** Taux TVA standard applicable aux ventes — 15 = 15 %, 0 = zéro, null = exempt (hors champ) */
  taux_tva_par_defaut: number | null
  /** Société assujettie à la TVA (TVA collectée + déductible) */
  statut_tva_par_defaut: boolean
  /** Comptes additionnels utiles à seeder en plus du PCM essentiel */
  comptes_specifiques: { compte: string; libelle: string; type_compte: 'actif' | 'passif' | 'charge' | 'produit' }[]
  /** Note d'aide affichée dans le wizard */
  note: string
}

export const TEMPLATES_SECTEUR: Record<SecteurCode, SecteurTemplate> = {
  services: {
    code: 'services',
    label: 'Services & conseil',
    description: 'Prestations B2B/B2C, conseil, IT, marketing, freelance.',
    taux_tva_par_defaut: 15,
    statut_tva_par_defaut: true,
    comptes_specifiques: [
      { compte: '706', libelle: 'Prestations de services', type_compte: 'produit' },
      { compte: '6225', libelle: 'Honoraires juridiques et conseils', type_compte: 'charge' },
    ],
    note: 'TVA standard 15 % à appliquer dès que le CA annuel dépasse 6M MUR (seuil MRA).',
  },
  retail: {
    code: 'retail',
    label: 'Commerce de détail',
    description: 'Boutiques, e-commerce, distribution de marchandises.',
    taux_tva_par_defaut: 15,
    statut_tva_par_defaut: true,
    comptes_specifiques: [
      { compte: '601', libelle: 'Achats de marchandises', type_compte: 'charge' },
      { compte: '701', libelle: 'Ventes de marchandises', type_compte: 'produit' },
      { compte: '603', libelle: 'Variation de stocks', type_compte: 'charge' },
    ],
    note: 'Penser à inventaire physique en fin d\'exercice (IAS 2).',
  },
  manufacturing: {
    code: 'manufacturing',
    label: 'Industrie / fabrication',
    description: 'Production de biens manufacturés.',
    taux_tva_par_defaut: 15,
    statut_tva_par_defaut: true,
    comptes_specifiques: [
      { compte: '601', libelle: 'Achats matières premières', type_compte: 'charge' },
      { compte: '7131', libelle: 'Production stockée', type_compte: 'produit' },
      { compte: '6151', libelle: 'Entretien et réparations', type_compte: 'charge' },
    ],
    note: 'Suivi des immobilisations importantes (IAS 16). Penser au coût de revient.',
  },
  healthcare: {
    code: 'healthcare',
    label: 'Santé (cabinet médical, clinique)',
    description: 'Services médicaux, paramédicaux, pharmacies.',
    taux_tva_par_defaut: null,
    statut_tva_par_defaut: false,
    comptes_specifiques: [
      { compte: '706', libelle: 'Prestations médicales (exempt TVA)', type_compte: 'produit' },
    ],
    note: 'Services médicaux exonérés de TVA (VAT Act 1998 — Schedule 1). TVA déductible non récupérable sur achats.',
  },
  education: {
    code: 'education',
    label: 'Éducation et formation',
    description: 'Écoles, organismes de formation, tutoring.',
    taux_tva_par_defaut: null,
    statut_tva_par_defaut: false,
    comptes_specifiques: [
      { compte: '706', libelle: 'Frais de scolarité (exempt TVA)', type_compte: 'produit' },
    ],
    note: 'Services éducatifs exonérés de TVA. Formation HRDC remboursable distinctement.',
  },
  financial_services: {
    code: 'financial_services',
    label: 'Services financiers',
    description: 'Banque, assurance, courtage, fintech.',
    taux_tva_par_defaut: null,
    statut_tva_par_defaut: false,
    comptes_specifiques: [
      { compte: '753', libelle: 'Commissions perçues', type_compte: 'produit' },
      { compte: '6272', libelle: 'Commissions bancaires', type_compte: 'charge' },
    ],
    note: 'La plupart des services financiers sont exonérés de TVA (Schedule 1 VAT Act).',
  },
  real_estate: {
    code: 'real_estate',
    label: 'Immobilier',
    description: 'Promotion, location, agence immobilière.',
    taux_tva_par_defaut: 15,
    statut_tva_par_defaut: true,
    comptes_specifiques: [
      { compte: '7081', libelle: 'Loyers perçus', type_compte: 'produit' },
      { compte: '6131', libelle: 'Loyers versés', type_compte: 'charge' },
    ],
    note: 'Location résidentielle exonérée. Location commerciale soumise à TVA. Agence = TVA standard.',
  },
  hospitality: {
    code: 'hospitality',
    label: 'Hôtellerie / restauration',
    description: 'Hôtels, restaurants, tour operators, guesthouses.',
    taux_tva_par_defaut: 15,
    statut_tva_par_defaut: true,
    comptes_specifiques: [
      { compte: '706', libelle: 'Prestations hôtelières / F&B', type_compte: 'produit' },
      { compte: '601', libelle: 'Achats F&B', type_compte: 'charge' },
    ],
    note: 'TVA 15 %. Penser aux licences (liquor, tourism authority) et aux droits d\'accise.',
  },
  export: {
    code: 'export',
    label: 'Export / zone franche',
    description: 'Société exportatrice, freeport, EOC.',
    taux_tva_par_defaut: 0,
    statut_tva_par_defaut: true,
    comptes_specifiques: [
      { compte: '707', libelle: 'Ventes à l\'export (zero-rated)', type_compte: 'produit' },
    ],
    note: 'Exports zero-rated (TVA 0 %, mais TVA déductible récupérable). Régime EOC = avantages fiscaux spécifiques.',
  },
  other: {
    code: 'other',
    label: 'Autre',
    description: 'Aucun des secteurs ci-dessus.',
    taux_tva_par_defaut: 15,
    statut_tva_par_defaut: true,
    comptes_specifiques: [],
    note: 'TVA standard 15 % par défaut. À ajuster selon nature exacte de l\'activité.',
  },
}

/** Retourne le template d'un secteur. Fallback "other" si inconnu. */
export function getSecteurTemplate(code: string | null | undefined): SecteurTemplate {
  if (!code) return TEMPLATES_SECTEUR.other
  const t = TEMPLATES_SECTEUR[code as SecteurCode]
  return t ?? TEMPLATES_SECTEUR.other
}

/** Liste l'ensemble des secteurs disponibles, dans l'ordre d'affichage. */
export function listSecteurs(): SecteurTemplate[] {
  return Object.values(TEMPLATES_SECTEUR)
}
