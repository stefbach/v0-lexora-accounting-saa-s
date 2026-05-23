import type { Account } from '../../core/types'

/**
 * CLASSE 2: Comptes de l'Actif Immobilisé
 * Plan Comptable SYSCOHADA révisé (AUDCIF 2017)
 *
 * Cette classe regroupe tous les comptes relatifs aux immobilisations:
 * - Charges immobilisées (20)
 * - Immobilisations incorporelles (21)
 * - Terrains (22)
 * - Bâtiments, installations techniques et agencements (23)
 * - Matériel (24)
 * - Avances et acomptes versés sur immobilisations (25)
 * - Titres de participation (26)
 * - Autres immobilisations financières (27)
 * - Amortissements (28)
 * - Provisions pour dépréciation (29)
 */

export const CLASSE_2_ACCOUNTS: Account[] = [
  // 20 - CHARGES IMMOBILISÉES
  {
    number: '201',
    classNumber: 2,
    name: 'Frais d\'établissement',
    description: 'Frais engagés lors de la constitution ou de la modification de la structure juridique de l\'entreprise',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '202',
    classNumber: 2,
    name: 'Charges à répartir',
    description: 'Charges exceptionnelles imputables à plusieurs exercices',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '206',
    classNumber: 2,
    name: 'Primes de remboursement des obligations',
    description: 'Primes versées au remboursement d\'obligations émises par l\'entreprise',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },

  // 21 - IMMOBILISATIONS INCORPORELLES
  {
    number: '211',
    classNumber: 2,
    name: 'Frais de recherche et développement',
    description: 'Dépenses relatives aux programmes de recherche et de développement',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '212',
    classNumber: 2,
    name: 'Brevets, licences, marques et droits similaires',
    description: 'Droits de propriété intellectuelle acquis ou créés',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '213',
    classNumber: 2,
    name: 'Logiciels et applications informatiques',
    description: 'Logiciels d\'exploitation, logiciels d\'application, systèmes d\'exploitation acquis ou développés',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '214',
    classNumber: 2,
    name: 'Fonds de commerce',
    description: 'Éléments incorporels d\'une exploitation commerciale, agricole ou artisanale',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '215',
    classNumber: 2,
    name: 'Investissements de création',
    description: 'Dépenses pour la création de nouvelles activités ou produits',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '217',
    classNumber: 2,
    name: 'Droit au bail',
    description: 'Droit d\'occuper un immeuble en vertu d\'un bail',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '218',
    classNumber: 2,
    name: 'Autres immobilisations incorporelles',
    description: 'Autres éléments d\'actif immatériel non classés ailleurs',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },

  // 22 - TERRAINS
  {
    number: '221',
    classNumber: 2,
    name: 'Terrains agricoles et forestiers',
    description: 'Terrains destinés à l\'agriculture ou à la foresterie',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '222',
    classNumber: 2,
    name: 'Terrains nus',
    description: 'Terrains non bâtis sans destination économique spécifique',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '223',
    classNumber: 2,
    name: 'Terrains bâtis',
    description: 'Terrains supportant une construction immobilière',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '224',
    classNumber: 2,
    name: 'Travaux de mise en valeur des terrains',
    description: 'Aménagements durables des terrains augmentant leur valeur productive',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },

  // 23 - BÂTIMENTS, INSTALLATIONS TECHNIQUES ET AGENCEMENTS
  {
    number: '231',
    classNumber: 2,
    name: 'Bâtiments industriels, agricoles, administratifs sur sol propre',
    description: 'Constructions édifiées sur un terrain dont l\'entreprise est propriétaire',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '232',
    classNumber: 2,
    name: 'Bâtiments sur sol d\'autrui',
    description: 'Constructions édifiées sur un terrain appartenant à un tiers',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '233',
    classNumber: 2,
    name: 'Ouvrages d\'infrastructure',
    description: 'Routes, canaux, ports, aérodromes, réseaux et autres travaux publics',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '234',
    classNumber: 2,
    name: 'Installations techniques, machines et outillage',
    description: 'Installations de nature permanente destinées à rester attachées à l\'immeuble',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '235',
    classNumber: 2,
    name: 'Aménagements de bureaux, aménagements de magasins',
    description: 'Agencements et installations destinés à améliorer les locaux commerciaux ou administratifs',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '237',
    classNumber: 2,
    name: 'Bâtiments mis en concession',
    description: 'Bâtiments cédés en concession par l\'entreprise concédante',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '238',
    classNumber: 2,
    name: 'Autres installations et agencements',
    description: 'Autres constructions et installations non classées aux comptes précédents',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },

  // 24 - MATÉRIEL
  {
    number: '241',
    classNumber: 2,
    name: 'Matériel et outillage industriel et commercial',
    description: 'Machines, équipements et outils destinés à la production ou au commerce',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '242',
    classNumber: 2,
    name: 'Matériel et outillage agricole',
    description: 'Tracteurs, ensileuses, moissonneuses et autres machines agricoles',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '244',
    classNumber: 2,
    name: 'Matériel et mobilier de bureau',
    description: 'Mobilier de bureau, matériel informatique, électroménager des bureaux',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '245',
    classNumber: 2,
    name: 'Matériel de transport',
    description: 'Automobiles, camions, autocars, tracteurs routiers, navires, avions',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '246',
    classNumber: 2,
    name: 'Emballages récupérables identifiables',
    description: 'Récipients et conteneurs utilisés pour le transport de marchandises',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '247',
    classNumber: 2,
    name: 'Matériel en concession',
    description: 'Matériel cédé en concession par l\'entreprise concédante',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '248',
    classNumber: 2,
    name: 'Autres matériels',
    description: 'Matériels non classés aux comptes précédents',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },

  // 25 - AVANCES ET ACOMPTES VERSÉS SUR IMMOBILISATIONS
  {
    number: '251',
    classNumber: 2,
    name: 'Avances et acomptes versés sur immobilisations incorporelles',
    description: 'Versements partiels pour l\'acquisition d\'éléments incorporels',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '252',
    classNumber: 2,
    name: 'Avances et acomptes versés sur immobilisations corporelles',
    description: 'Versements partiels pour l\'acquisition d\'éléments corporels',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },

  // 26 - TITRES DE PARTICIPATION
  {
    number: '261',
    classNumber: 2,
    name: 'Titres de participation dans des sociétés liées',
    description: 'Titres conférant une participation de plus de 50% ou permettant d\'exercer une influence dominante',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '265',
    classNumber: 2,
    name: 'Titres de participation dans des sociétés conférant moins de 50%',
    description: 'Titres conférant une participation minoritaire',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '266',
    classNumber: 2,
    name: 'Parts dans des GIE',
    description: 'Parts détenues dans des Groupements d\'Intérêt Économique',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '268',
    classNumber: 2,
    name: 'Créances rattachées à des participations',
    description: 'Créances résultant de prêts ou d\'avances consentis aux sociétés participées',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },

  // 27 - AUTRES IMMOBILISATIONS FINANCIÈRES
  {
    number: '271',
    classNumber: 2,
    name: 'Prêts au personnel',
    description: 'Prêts consentis aux salariés et membres du personnel',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '272',
    classNumber: 2,
    name: 'Prêts aux associés',
    description: 'Prêts consentis aux associés et actionnaires',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '275',
    classNumber: 2,
    name: 'Dépôts et cautionnements versés',
    description: 'Dépôts de garantie et cautionnements immobilisés à long terme',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '276',
    classNumber: 2,
    name: 'Autres créances immobilisées',
    description: 'Autres créances à caractère immobilisé non classées ailleurs',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },

  // 28 - AMORTISSEMENTS (balance CREDIT)
  {
    number: '2801',
    classNumber: 2,
    name: 'Amortissements des charges immobilisées',
    description: 'Amortissement des frais d\'établissement et charges à répartir',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2811',
    classNumber: 2,
    name: 'Amortissements des frais de recherche et développement',
    description: 'Amortissement de la classe 211',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2812',
    classNumber: 2,
    name: 'Amortissements des brevets, licences et marques',
    description: 'Amortissement de la classe 212',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2813',
    classNumber: 2,
    name: 'Amortissements des logiciels',
    description: 'Amortissement de la classe 213',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2814',
    classNumber: 2,
    name: 'Amortissements du fonds de commerce',
    description: 'Amortissement de la classe 214',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2815',
    classNumber: 2,
    name: 'Amortissements des investissements de création',
    description: 'Amortissement de la classe 215',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2817',
    classNumber: 2,
    name: 'Amortissements du droit au bail',
    description: 'Amortissement de la classe 217',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2818',
    classNumber: 2,
    name: 'Amortissements des autres immobilisations incorporelles',
    description: 'Amortissement de la classe 218',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2824',
    classNumber: 2,
    name: 'Amortissements des bâtiments',
    description: 'Amortissement des classes 231, 232, 233, 238',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2825',
    classNumber: 2,
    name: 'Amortissements des installations techniques',
    description: 'Amortissement de la classe 234',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2826',
    classNumber: 2,
    name: 'Amortissements des agencements',
    description: 'Amortissement de la classe 235',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2841',
    classNumber: 2,
    name: 'Amortissements du matériel industriel et commercial',
    description: 'Amortissement de la classe 241',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2842',
    classNumber: 2,
    name: 'Amortissements du matériel agricole',
    description: 'Amortissement de la classe 242',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2844',
    classNumber: 2,
    name: 'Amortissements du mobilier de bureau',
    description: 'Amortissement de la classe 244',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2845',
    classNumber: 2,
    name: 'Amortissements du matériel de transport',
    description: 'Amortissement de la classe 245',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2846',
    classNumber: 2,
    name: 'Amortissements des emballages récupérables',
    description: 'Amortissement de la classe 246',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2847',
    classNumber: 2,
    name: 'Amortissements du matériel en concession',
    description: 'Amortissement de la classe 247',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2848',
    classNumber: 2,
    name: 'Amortissements des autres matériels',
    description: 'Amortissement de la classe 248',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },

  // 29 - PROVISIONS POUR DÉPRÉCIATION (balance CREDIT)
  {
    number: '2901',
    classNumber: 2,
    name: 'Provisions pour dépréciation des charges immobilisées',
    description: 'Provisions pour dépréciation des comptes 201, 202, 206',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2911',
    classNumber: 2,
    name: 'Provisions pour dépréciation des immobilisations incorporelles',
    description: 'Provisions pour dépréciation des comptes 211 à 218',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2922',
    classNumber: 2,
    name: 'Provisions pour dépréciation des terrains',
    description: 'Provisions pour dépréciation des comptes 221 à 224',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2923',
    classNumber: 2,
    name: 'Provisions pour dépréciation des bâtiments et installations',
    description: 'Provisions pour dépréciation des comptes 231 à 238',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2924',
    classNumber: 2,
    name: 'Provisions pour dépréciation du matériel',
    description: 'Provisions pour dépréciation des comptes 241 à 248',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2925',
    classNumber: 2,
    name: 'Provisions pour dépréciation des avances et acomptes',
    description: 'Provisions pour dépréciation des comptes 251, 252',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2926',
    classNumber: 2,
    name: 'Provisions pour dépréciation des titres de participation',
    description: 'Provisions pour dépréciation des comptes 261, 265, 266, 268',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  },
  {
    number: '2927',
    classNumber: 2,
    name: 'Provisions pour dépréciation des autres immobilisations financières',
    description: 'Provisions pour dépréciation des comptes 271, 272, 275, 276',
    category: 'BALANCE_SHEET_ASSET',
    normalBalance: 'CREDIT',
    isAuxiliary: false,
    isReconcilable: false,
    jurisdiction: 'OHADA'
  }
]
