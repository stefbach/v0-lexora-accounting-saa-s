import type {
  FinancialNotes,
  FinancialNote,
  StatementInput,
} from '../../core/financial-statements.interface'

// ---------------------------------------------------------------------------
// Catalogue officiel des 35 notes obligatoires – SYSCOHADA Système Normal
// ---------------------------------------------------------------------------

export const OHADA_NOTES_NUMERIC: Array<{
  number: number
  title: string
  titleFr: string
  mandatory: boolean
}> = [
  { number: 1,   title: 'Accounting rules and methods',                         titleFr: 'Règles et méthodes comptables',                           mandatory: true },
  { number: 2,   title: 'Derogations and changes in accounting methods',        titleFr: 'Dérogations et changements de méthodes comptables',       mandatory: true },
  { number: '3A' as unknown as number, title: 'Gross fixed assets',             titleFr: 'Immobilisations brutes',                                  mandatory: true },
  { number: '3B' as unknown as number, title: 'Fixed assets: amortisation',     titleFr: 'Immobilisations : amortissements',                        mandatory: true },
  { number: '3C' as unknown as number, title: 'Fixed assets: gains/losses on disposal', titleFr: 'Immobilisations : plus ou moins-values de cession', mandatory: true },
  { number: '3D' as unknown as number, title: 'Financial fixed assets',         titleFr: 'Immobilisations financières',                             mandatory: true },
  { number: '3E' as unknown as number, title: 'Expected credit losses (IFRS 9 adapted)', titleFr: 'Pertes attendues de crédit (IFRS 9 adapté)',     mandatory: true },
  { number: 4,   title: 'Capitalised expenses',                                 titleFr: 'Charges immobilisées',                                   mandatory: true },
  { number: 5,   title: 'Advances and deposits paid on orders',                 titleFr: 'Avances et acomptes versés sur commandes',               mandatory: true },
  { number: 6,   title: 'Inventories',                                          titleFr: 'Stocks',                                                 mandatory: true },
  { number: 7,   title: 'Trade receivables (maturities, impairments)',          titleFr: 'Clients (échéances, dépréciations)',                      mandatory: true },
  { number: 8,   title: 'Other receivables',                                    titleFr: 'Autres créances',                                        mandatory: true },
  { number: 9,   title: 'Changes in other provisions',                          titleFr: 'Variation des autres provisions',                        mandatory: true },
  { number: 10,  title: 'Share capital',                                        titleFr: 'Capital',                                                mandatory: true },
  { number: 11,  title: 'Share premium and reserves (movements)',               titleFr: 'Primes et réserves (variation)',                         mandatory: true },
  { number: 12,  title: 'Subsidies and regulated provisions',                   titleFr: 'Subventions et provisions réglementées',                 mandatory: true },
  { number: 13,  title: 'Borrowings and financial liabilities (maturities)',    titleFr: 'Emprunts et dettes financières (échéances)',             mandatory: true },
  { number: 14,  title: 'Financial provisions for risks and charges',           titleFr: 'Provisions financières pour risques et charges',         mandatory: true },
  { number: 15,  title: 'Retirement obligations and similar benefits',          titleFr: 'Engagements de retraite et avantages similaires',        mandatory: true },
  { number: 16,  title: 'Trade payables (maturities, currencies)',              titleFr: "Fournisseurs d'exploitation (échéances, devises)",       mandatory: true },
  { number: 17,  title: 'Tax and social liabilities',                           titleFr: 'Dettes fiscales et sociales',                            mandatory: true },
  { number: 18,  title: 'Other liabilities and short-term risk provisions',     titleFr: 'Autres dettes et provisions pour risques à court terme', mandatory: true },
  { number: 19,  title: 'Cash (banks, cash registers)',                         titleFr: 'Trésorerie (banques, caisses)',                          mandatory: true },
  { number: 20,  title: 'Currency translation adjustments',                     titleFr: 'Écarts de conversion',                                   mandatory: true },
  { number: 21,  title: 'Revenue (by activity, geographic breakdown)',          titleFr: 'Chiffre d\'affaires (ventilation par activité, géographique)', mandatory: true },
  { number: 22,  title: 'Purchases (local / imported breakdown)',               titleFr: 'Achats (ventilation locaux/importés)',                   mandatory: true },
  { number: 23,  title: 'Changes in inventories',                               titleFr: 'Variation de stocks',                                   mandatory: true },
  { number: 24,  title: 'Transport costs',                                      titleFr: 'Transports',                                            mandatory: true },
  { number: 25,  title: 'External services',                                    titleFr: 'Services extérieurs',                                   mandatory: true },
  { number: 26,  title: 'Taxes and duties',                                     titleFr: 'Impôts et taxes',                                       mandatory: true },
  { number: 27,  title: 'Other charges',                                        titleFr: 'Autres charges',                                        mandatory: true },
  { number: 28,  title: 'Staff costs (headcount, payroll)',                     titleFr: 'Charges de personnel (effectifs, masse salariale)',      mandatory: true },
  { number: 29,  title: 'Finance charges and similar income',                   titleFr: 'Frais financiers et produits assimilés',                 mandatory: true },
  { number: 30,  title: 'Financial income',                                     titleFr: 'Produits financiers',                                   mandatory: true },
  { number: 31,  title: 'Other HAO income and charges',                         titleFr: 'Autres produits et charges HAO',                        mandatory: true },
  { number: 32,  title: 'Profit-sharing and income taxes',                      titleFr: 'Participation et impôts sur le résultat',               mandatory: true },
  { number: 33,  title: 'Production for the period',                            titleFr: "Production de l'exercice",                              mandatory: true },
  { number: 34,  title: 'Dividends distributed',                                titleFr: 'Distribution de bénéfices effectuée',                   mandatory: true },
  { number: 35,  title: 'Financial commitments and other disclosures',          titleFr: 'Engagements financiers et autres informations',          mandatory: true },
]

// ---------------------------------------------------------------------------
// Data-provider interface
// ---------------------------------------------------------------------------

export interface NotesDataProviders {
  getAccountBalances?: (codes: string[]) => Promise<Map<string, number>>
  getImmobilisations?: () => Promise<Record<string, unknown>[]>
  getAmortissements?: () => Promise<Record<string, unknown>[]>
  getCessions?: () => Promise<Record<string, unknown>[]>
  getStocks?: () => Promise<Record<string, unknown>[]>
  getClients?: () => Promise<Record<string, unknown>[]>
  getFournisseurs?: () => Promise<Record<string, unknown>[]>
  getEmprunts?: () => Promise<Record<string, unknown>[]>
  getCapital?: () => Promise<Record<string, unknown>[]>
  getReserves?: () => Promise<Record<string, unknown>[]>
  getSubventions?: () => Promise<Record<string, unknown>[]>
  getProvisions?: () => Promise<Record<string, unknown>[]>
  getPersonnel?: () => Promise<Record<string, unknown>[]>
  getChiffreAffaires?: () => Promise<Record<string, unknown>[]>
  getAchats?: () => Promise<Record<string, unknown>[]>
  getEngagements?: () => Promise<Record<string, unknown>[]>
  getEcartsConversion?: () => Promise<Record<string, unknown>[]>
  getTresorerie?: () => Promise<Record<string, unknown>[]>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (input: StatementInput): string => {
  const y = input.periodEnd.getFullYear()
  const m = String(input.periodEnd.getMonth() + 1).padStart(2, '0')
  const d = String(input.periodEnd.getDate()).padStart(2, '0')
  return `${d}/${m}/${y}`
}

async function safeLoad<T>(
  fn: (() => Promise<T>) | undefined,
  fallback: T
): Promise<T> {
  if (!fn) return fallback
  try {
    return await fn()
  } catch {
    return fallback
  }
}

function placeholder(noteTitle: string): string {
  return `Note non renseignée – ${noteTitle}. Les données doivent être fournies via le dataProvider correspondant.`
}

// ---------------------------------------------------------------------------
// Individual note builders
// ---------------------------------------------------------------------------

function buildNote1(input: StatementInput): FinancialNote {
  return {
    number: 1,
    title: 'Règles et méthodes comptables',
    content: `Les états financiers de la société ont été établis conformément au Système Comptable OHADA (SYSCOHADA révisé) en vigueur à compter du 1er janvier 2018. La présentation retenue est le Système Normal. Les conventions générales appliquées sont : continuité d'exploitation, permanence des méthodes, indépendance des exercices, prudence, transparence et importance significative. Les états couvrent la période du ${new Date(input.periodStart).toLocaleDateString('fr-FR')} au ${fmt(input)}.`,
  }
}

function buildNote2(): FinancialNote {
  return {
    number: 2,
    title: 'Dérogations et changements de méthodes comptables',
    content:
      "Aucune dérogation au SYSCOHADA n'a été appliquée au cours de l'exercice. Aucun changement de méthode comptable n'est intervenu par rapport à l'exercice précédent, sauf mention contraire ci-après.",
    tables: [],
  }
}

async function buildNote3A(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getImmobilisations, [])
  return {
    number: 3,
    title: 'Immobilisations brutes',
    content:
      "Tableau de variation des immobilisations brutes au cours de l'exercice (acquisitions, cessions, reclassements).",
    tables: rows.length
      ? rows
      : [
          {
            categorie: 'Immobilisations incorporelles',
            valeurDebutExercice: 0,
            acquisitions: 0,
            cessions: 0,
            autresVariations: 0,
            valeurFinExercice: 0,
          },
          {
            categorie: 'Immobilisations corporelles',
            valeurDebutExercice: 0,
            acquisitions: 0,
            cessions: 0,
            autresVariations: 0,
            valeurFinExercice: 0,
          },
          {
            categorie: 'Immobilisations financières',
            valeurDebutExercice: 0,
            acquisitions: 0,
            cessions: 0,
            autresVariations: 0,
            valeurFinExercice: 0,
          },
        ],
  }
}

async function buildNote3B(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getAmortissements, [])
  return {
    number: 3,
    title: 'Immobilisations : amortissements',
    content:
      "Tableau de variation des amortissements et dépréciations des immobilisations (dotations, reprises, sorties).",
    tables: rows.length
      ? rows
      : [
          {
            categorie: 'Immobilisations incorporelles',
            amortissementsDebutExercice: 0,
            dotations: 0,
            reprises: 0,
            sorties: 0,
            amortissementsFinExercice: 0,
          },
          {
            categorie: 'Immobilisations corporelles',
            amortissementsDebutExercice: 0,
            dotations: 0,
            reprises: 0,
            sorties: 0,
            amortissementsFinExercice: 0,
          },
        ],
  }
}

async function buildNote3C(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getCessions, [])
  return {
    number: 3,
    title: 'Immobilisations : plus ou moins-values de cession',
    content:
      "Détail des cessions d'immobilisations réalisées au cours de l'exercice et calcul des plus ou moins-values.",
    tables: rows.length
      ? rows
      : [
          {
            designation: 'Néant',
            valeurBrute: 0,
            amortissementsCumules: 0,
            valeurNette: 0,
            prixCession: 0,
            plusMoinsValue: 0,
          },
        ],
  }
}

async function buildNote3D(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getImmobilisations, [])
  return {
    number: 3,
    title: 'Immobilisations financières',
    content:
      "Détail des immobilisations financières : titres de participation, prêts, dépôts et cautionnements.",
    tables: rows.length
      ? rows
      : [
          {
            nature: 'Titres de participation',
            societe: '',
            pourcentageDetention: 0,
            valeurBrute: 0,
            provision: 0,
            valeurNette: 0,
          },
        ],
  }
}

function buildNote3E(): FinancialNote {
  return {
    number: 3,
    title: 'Pertes attendues de crédit (IFRS 9 adapté)',
    content:
      "Analyse des pertes de crédit attendues (ECL) sur les actifs financiers conformément aux dispositions adaptées de l'IFRS 9 au SYSCOHADA. Les instruments financiers sont classés selon les trois stades de dépréciation.",
    tables: [
      {
        stade: 'Stade 1 – Actifs sains',
        montantBrut: 0,
        tauxECL: '0%',
        provisionECL: 0,
      },
      {
        stade: 'Stade 2 – Actifs dégradés',
        montantBrut: 0,
        tauxECL: '0%',
        provisionECL: 0,
      },
      {
        stade: 'Stade 3 – Actifs douteux',
        montantBrut: 0,
        tauxECL: '0%',
        provisionECL: 0,
      },
    ],
  }
}

function buildNote4(): FinancialNote {
  return {
    number: 4,
    title: 'Charges immobilisées',
    content: placeholder('Charges immobilisées – comptes 20x'),
    tables: [
      {
        nature: 'Frais de constitution',
        montantBrut: 0,
        amortissements: 0,
        valeurNette: 0,
      },
      {
        nature: "Frais d'augmentation de capital",
        montantBrut: 0,
        amortissements: 0,
        valeurNette: 0,
      },
    ],
  }
}

function buildNote5(): FinancialNote {
  return {
    number: 5,
    title: 'Avances et acomptes versés sur commandes',
    content:
      "Détail des avances et acomptes versés à des fournisseurs en règlement partiel de commandes en cours (compte 4091).",
    tables: [{ fournisseur: 'Néant', montant: 0, dateVersement: '' }],
  }
}

async function buildNote6(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getStocks, [])
  return {
    number: 6,
    title: 'Stocks',
    content:
      "Détail des stocks et en-cours valorisés selon la méthode du coût moyen pondéré (CUMP) ou premier entré – premier sorti (FIFO) selon la catégorie.",
    tables: rows.length
      ? rows
      : [
          {
            categorie: 'Marchandises',
            valeurBrute: 0,
            provision: 0,
            valeurNette: 0,
            methodeValo: 'CUMP',
          },
          {
            categorie: 'Matières premières',
            valeurBrute: 0,
            provision: 0,
            valeurNette: 0,
            methodeValo: 'CUMP',
          },
          {
            categorie: 'Produits finis',
            valeurBrute: 0,
            provision: 0,
            valeurNette: 0,
            methodeValo: 'CUMP',
          },
        ],
  }
}

async function buildNote7(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getClients, [])
  return {
    number: 7,
    title: 'Clients (échéances, dépréciations)',
    content:
      "Analyse des créances clients par échéance et par niveau de dépréciation.",
    tables: rows.length
      ? rows
      : [
          {
            tranche: 'Moins de 30 jours',
            montantBrut: 0,
            provision: 0,
            montantNet: 0,
          },
          {
            tranche: '30 à 90 jours',
            montantBrut: 0,
            provision: 0,
            montantNet: 0,
          },
          {
            tranche: 'Plus de 90 jours',
            montantBrut: 0,
            provision: 0,
            montantNet: 0,
          },
          {
            tranche: 'Créances douteuses',
            montantBrut: 0,
            provision: 0,
            montantNet: 0,
          },
        ],
  }
}

function buildNote8(): FinancialNote {
  return {
    number: 8,
    title: 'Autres créances',
    content:
      "Détail des autres créances (comptes courants d'associés, créances sur cessions d'immobilisations, créances diverses).",
    tables: [
      { nature: 'Avances au personnel', montant: 0 },
      { nature: "Créances sur cessions d'immobilisations", montant: 0 },
      { nature: 'Débiteurs divers', montant: 0 },
      { nature: 'Crédit de TVA', montant: 0 },
    ],
  }
}

async function buildNote9(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getProvisions, [])
  return {
    number: 9,
    title: 'Variation des autres provisions',
    content:
      "Tableau de variation des provisions pour dépréciation d'actif et provisions pour risques et charges (hors provisions réglementées).",
    tables: rows.length
      ? rows
      : [
          {
            nature: 'Provisions pour dépréciation stocks',
            debutExercice: 0,
            dotations: 0,
            reprises: 0,
            finExercice: 0,
          },
          {
            nature: 'Provisions pour dépréciation créances',
            debutExercice: 0,
            dotations: 0,
            reprises: 0,
            finExercice: 0,
          },
          {
            nature: 'Provisions pour risques et charges',
            debutExercice: 0,
            dotations: 0,
            reprises: 0,
            finExercice: 0,
          },
        ],
  }
}

async function buildNote10(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getCapital, [])
  return {
    number: 10,
    title: 'Capital',
    content:
      "Structure du capital social : nature, montant nominal, nombre et catégories d'actions ou de parts sociales.",
    tables: rows.length
      ? rows
      : [
          {
            categorie: 'Capital nominal',
            nombreTitres: 0,
            valeurNominale: 0,
            montant: 0,
          },
          {
            categorie: 'Capital appelé',
            nombreTitres: 0,
            valeurNominale: 0,
            montant: 0,
          },
          {
            categorie: 'Capital versé',
            nombreTitres: 0,
            valeurNominale: 0,
            montant: 0,
          },
        ],
  }
}

async function buildNote11(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getReserves, [])
  return {
    number: 11,
    title: 'Primes et réserves (variation)',
    content:
      "Tableau de variation des primes et réserves au cours de l'exercice.",
    tables: rows.length
      ? rows
      : [
          {
            poste: "Prime d'émission",
            debutExercice: 0,
            augmentation: 0,
            diminution: 0,
            finExercice: 0,
          },
          {
            poste: 'Réserve légale',
            debutExercice: 0,
            augmentation: 0,
            diminution: 0,
            finExercice: 0,
          },
          {
            poste: 'Réserves statutaires',
            debutExercice: 0,
            augmentation: 0,
            diminution: 0,
            finExercice: 0,
          },
          {
            poste: 'Report à nouveau',
            debutExercice: 0,
            augmentation: 0,
            diminution: 0,
            finExercice: 0,
          },
        ],
  }
}

async function buildNote12(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getSubventions, [])
  return {
    number: 12,
    title: 'Subventions et provisions réglementées',
    content:
      "Variation des subventions d'investissement et des provisions réglementées (amortissements dérogatoires, provisions pour hausse des prix, etc.).",
    tables: rows.length
      ? rows
      : [
          {
            nature: "Subventions d'investissement",
            debutExercice: 0,
            reçues: 0,
            reprises: 0,
            finExercice: 0,
          },
          {
            nature: 'Amortissements dérogatoires',
            debutExercice: 0,
            dotations: 0,
            reprises: 0,
            finExercice: 0,
          },
        ],
  }
}

async function buildNote13(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getEmprunts, [])
  return {
    number: 13,
    title: 'Emprunts et dettes financières (échéances)',
    content:
      "Détail des emprunts et dettes financières ventilés par échéance.",
    tables: rows.length
      ? rows
      : [
          {
            nature: 'Emprunts obligataires',
            total: 0,
            moins1an: 0,
            de1a5ans: 0,
            plus5ans: 0,
            taux: '',
          },
          {
            nature: 'Emprunts bancaires',
            total: 0,
            moins1an: 0,
            de1a5ans: 0,
            plus5ans: 0,
            taux: '',
          },
          {
            nature: 'Dettes de location-acquisition',
            total: 0,
            moins1an: 0,
            de1a5ans: 0,
            plus5ans: 0,
            taux: '',
          },
        ],
  }
}

function buildNote14(): FinancialNote {
  return {
    number: 14,
    title: 'Provisions financières pour risques et charges',
    content:
      "Détail des provisions financières à long terme pour risques et charges (compte 19).",
    tables: [
      {
        nature: 'Provisions pour litiges',
        debutExercice: 0,
        dotations: 0,
        reprises: 0,
        finExercice: 0,
      },
      {
        nature: 'Provisions pour garanties données',
        debutExercice: 0,
        dotations: 0,
        reprises: 0,
        finExercice: 0,
      },
    ],
  }
}

function buildNote15(): FinancialNote {
  return {
    number: 15,
    title: 'Engagements de retraite et avantages similaires',
    content:
      "Évaluation et comptabilisation des engagements envers le personnel au titre des retraites, indemnités de fin de carrière et autres avantages à long terme.",
    tables: [
      {
        categorie: 'Indemnités de fin de carrière',
        engagementActuariel: 0,
        actifsDuPlan: 0,
        provisionNette: 0,
        hypotheseTauxActualisation: '0%',
      },
      {
        categorie: 'Retraites complémentaires',
        engagementActuariel: 0,
        actifsDuPlan: 0,
        provisionNette: 0,
        hypotheseTauxActualisation: '0%',
      },
    ],
  }
}

async function buildNote16(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getFournisseurs, [])
  return {
    number: 16,
    title: "Fournisseurs d'exploitation (échéances, devises)",
    content:
      "Analyse des dettes fournisseurs par échéance et par devise.",
    tables: rows.length
      ? rows
      : [
          {
            tranche: 'Moins de 30 jours',
            monnaieLocale: 0,
            devises: 0,
            total: 0,
          },
          {
            tranche: '30 à 60 jours',
            monnaieLocale: 0,
            devises: 0,
            total: 0,
          },
          {
            tranche: 'Plus de 60 jours',
            monnaieLocale: 0,
            devises: 0,
            total: 0,
          },
        ],
  }
}

function buildNote17(): FinancialNote {
  return {
    number: 17,
    title: 'Dettes fiscales et sociales',
    content:
      "Détail des dettes fiscales (TVA collectée, IS, autres impôts) et dettes sociales (CNSS, retenues à la source, etc.).",
    tables: [
      { nature: 'TVA à payer', montant: 0 },
      { nature: "Acompte d'impôt sur les sociétés", montant: 0 },
      { nature: "Retenues à la source sur salaires", montant: 0 },
      { nature: 'Cotisations sociales patronales', montant: 0 },
      { nature: 'Cotisations sociales salariales', montant: 0 },
      { nature: 'Autres dettes fiscales', montant: 0 },
    ],
  }
}

function buildNote18(): FinancialNote {
  return {
    number: 18,
    title: 'Autres dettes et provisions pour risques à court terme',
    content:
      "Détail des autres dettes et provisions pour risques à court terme non classées ailleurs.",
    tables: [
      { nature: "Produits constatés d'avance", montant: 0 },
      { nature: 'Dettes sur acquisitions de titres', montant: 0 },
      { nature: 'Créditeurs divers', montant: 0 },
      { nature: 'Provisions pour risques à court terme', montant: 0 },
    ],
  }
}

async function buildNote19(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getTresorerie, [])
  return {
    number: 19,
    title: 'Trésorerie (banques, caisses)',
    content:
      "Détail des comptes de trésorerie actif et passif par établissement bancaire et caisse.",
    tables: rows.length
      ? rows
      : [
          {
            etablissement: 'Banque principale',
            typeCompte: 'Compte courant',
            devise: 'XOF',
            soldeActif: 0,
            soldePassif: 0,
          },
          {
            etablissement: 'Caisse',
            typeCompte: 'Caisse principale',
            devise: 'XOF',
            soldeActif: 0,
            soldePassif: 0,
          },
        ],
  }
}

async function buildNote20(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getEcartsConversion, [])
  return {
    number: 20,
    title: 'Écarts de conversion',
    content:
      "Détail des écarts de conversion résultant de la réévaluation des créances et dettes en devises étrangères à la date de clôture.",
    tables: rows.length
      ? rows
      : [
          {
            nature: 'Écarts de conversion-Actif (compte 478)',
            montant: 0,
            provisionCorrespondante: 0,
          },
          {
            nature: 'Écarts de conversion-Passif (compte 479)',
            montant: 0,
            commentaire: '',
          },
        ],
  }
}

async function buildNote21(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getChiffreAffaires, [])
  return {
    number: 21,
    title: "Chiffre d'affaires (ventilation par activité, géographique)",
    content:
      "Ventilation du chiffre d'affaires par secteur d'activité et par zone géographique.",
    tables: rows.length
      ? rows
      : [
          {
            segment: 'Activité principale – marché local',
            montant: 0,
            pourcentage: '0%',
          },
          {
            segment: 'Activité principale – export',
            montant: 0,
            pourcentage: '0%',
          },
          {
            segment: 'Activités secondaires',
            montant: 0,
            pourcentage: '0%',
          },
          { segment: 'TOTAL', montant: 0, pourcentage: '100%' },
        ],
  }
}

async function buildNote22(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getAchats, [])
  return {
    number: 22,
    title: 'Achats (ventilation locaux/importés)',
    content:
      "Ventilation des achats de marchandises, matières premières et fournitures entre achats locaux et importations.",
    tables: rows.length
      ? rows
      : [
          { categorie: 'Achats locaux de marchandises', montant: 0 },
          { categorie: 'Achats importés de marchandises', montant: 0 },
          { categorie: 'Achats locaux de matières premières', montant: 0 },
          { categorie: 'Achats importés de matières premières', montant: 0 },
          { categorie: 'Autres achats locaux', montant: 0 },
          { categorie: 'Autres achats importés', montant: 0 },
        ],
  }
}

function buildNote23(): FinancialNote {
  return {
    number: 23,
    title: 'Variation de stocks',
    content:
      "Détail de la variation des stocks de marchandises, matières premières et produits finis entre l'ouverture et la clôture de l'exercice.",
    tables: [
      {
        categorie: 'Marchandises',
        stockInitial: 0,
        stockFinal: 0,
        variation: 0,
      },
      {
        categorie: 'Matières premières',
        stockInitial: 0,
        stockFinal: 0,
        variation: 0,
      },
      {
        categorie: 'Produits finis',
        stockInitial: 0,
        stockFinal: 0,
        variation: 0,
      },
    ],
  }
}

function buildNote24(): FinancialNote {
  return {
    number: 24,
    title: 'Transports',
    content:
      "Détail des charges de transport sur achats, transport sur ventes et autres transports.",
    tables: [
      { nature: 'Transports sur achats', montant: 0 },
      { nature: 'Transports sur ventes', montant: 0 },
      { nature: 'Transports du personnel', montant: 0 },
      { nature: 'Autres transports', montant: 0 },
    ],
  }
}

function buildNote25(): FinancialNote {
  return {
    number: 25,
    title: 'Services extérieurs',
    content:
      "Détail des services extérieurs (loyers, entretiens, assurances, documentation, publicité, etc.).",
    tables: [
      { nature: 'Loyers et charges locatives', montant: 0 },
      { nature: 'Entretien et réparations', montant: 0 },
      { nature: "Primes d'assurances", montant: 0 },
      { nature: 'Honoraires et frais de conseil', montant: 0 },
      { nature: 'Publicité et relations publiques', montant: 0 },
      { nature: 'Autres services extérieurs', montant: 0 },
    ],
  }
}

function buildNote26(): FinancialNote {
  return {
    number: 26,
    title: 'Impôts et taxes',
    content:
      "Détail des impôts et taxes autres que l'impôt sur les bénéfices.",
    tables: [
      { nature: 'Patente / contribution des patentes', montant: 0 },
      { nature: 'Taxe foncière', montant: 0 },
      { nature: 'Taxe sur les véhicules', montant: 0 },
      { nature: 'Droits de douane', montant: 0 },
      { nature: 'Autres impôts et taxes', montant: 0 },
    ],
  }
}

function buildNote27(): FinancialNote {
  return {
    number: 27,
    title: 'Autres charges',
    content:
      "Détail des autres charges d'exploitation non classées dans les rubriques précédentes.",
    tables: [
      { nature: 'Pertes sur créances irrécouvrables', montant: 0 },
      { nature: 'Charges diverses de gestion courante', montant: 0 },
      { nature: 'Charges exceptionnelles sur opérations de gestion', montant: 0 },
    ],
  }
}

async function buildNote28(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getPersonnel, [])
  return {
    number: 28,
    title: 'Charges de personnel (effectifs, masse salariale)',
    content:
      "Détail des charges de personnel par catégorie d'emploi et effectifs moyens.",
    tables: rows.length
      ? rows
      : [
          {
            categorie: 'Cadres et assimilés',
            effectifMoyen: 0,
            salaires: 0,
            chargesPatronales: 0,
            total: 0,
          },
          {
            categorie: 'Maîtrise et techniciens',
            effectifMoyen: 0,
            salaires: 0,
            chargesPatronales: 0,
            total: 0,
          },
          {
            categorie: "Agents d'exécution",
            effectifMoyen: 0,
            salaires: 0,
            chargesPatronales: 0,
            total: 0,
          },
          {
            categorie: 'TOTAL',
            effectifMoyen: 0,
            salaires: 0,
            chargesPatronales: 0,
            total: 0,
          },
        ],
  }
}

function buildNote29(): FinancialNote {
  return {
    number: 29,
    title: 'Frais financiers et produits assimilés',
    content:
      "Détail des charges financières : intérêts sur emprunts, agios bancaires, pertes de change, dotations aux provisions financières.",
    tables: [
      { nature: 'Intérêts sur emprunts bancaires', montant: 0 },
      { nature: 'Intérêts sur location-acquisition', montant: 0 },
      { nature: 'Agios et frais bancaires', montant: 0 },
      { nature: 'Pertes de change', montant: 0 },
      { nature: 'Dotations aux provisions financières', montant: 0 },
      { nature: 'Autres charges financières', montant: 0 },
    ],
  }
}

function buildNote30(): FinancialNote {
  return {
    number: 30,
    title: 'Produits financiers',
    content:
      "Détail des produits financiers : dividendes reçus, intérêts créditeurs, gains de change, reprises de provisions financières.",
    tables: [
      { nature: 'Dividendes et produits des participations', montant: 0 },
      { nature: 'Intérêts créditeurs et produits assimilés', montant: 0 },
      { nature: 'Gains de change', montant: 0 },
      { nature: 'Reprises de provisions financières', montant: 0 },
      { nature: 'Autres produits financiers', montant: 0 },
    ],
  }
}

function buildNote31(): FinancialNote {
  return {
    number: 31,
    title: 'Autres produits et charges HAO',
    content:
      "Détail des produits et charges hors activités ordinaires (HAO) : cessions d'immobilisations, subventions reçues/remboursées, opérations exceptionnelles.",
    tables: [
      { nature: "Produits de cession d'immobilisations", montant: 0 },
      { nature: 'Subventions reçues', montant: 0 },
      { nature: "Valeurs comptables nettes des cessions d'immobilisations (charge)", montant: 0 },
      { nature: 'Autres produits HAO', montant: 0 },
      { nature: 'Autres charges HAO', montant: 0 },
    ],
  }
}

function buildNote32(): FinancialNote {
  return {
    number: 32,
    title: 'Participation et impôts sur le résultat',
    content:
      "Détail du calcul de l'impôt sur les bénéfices (IS ou IBIC) et de la participation des salariés aux résultats le cas échéant.",
    tables: [
      {
        element: 'Résultat comptable avant impôt',
        montant: 0,
        commentaire: '',
      },
      {
        element: 'Réintégrations fiscales',
        montant: 0,
        commentaire: '',
      },
      {
        element: 'Déductions fiscales',
        montant: 0,
        commentaire: '',
      },
      {
        element: 'Résultat fiscal',
        montant: 0,
        commentaire: '',
      },
      {
        element: 'Taux IS/IBIC applicable',
        montant: 0,
        commentaire: '',
      },
      {
        element: 'Impôt exigible',
        montant: 0,
        commentaire: '',
      },
      {
        element: 'Participation des salariés',
        montant: 0,
        commentaire: 'Si applicable',
      },
    ],
  }
}

function buildNote33(): FinancialNote {
  return {
    number: 33,
    title: "Production de l'exercice",
    content:
      "Détail de la production de l'exercice : ventes de produits fabriqués, travaux, services rendus, production stockée et immobilisée.",
    tables: [
      { nature: 'Ventes de produits fabriqués', montant: 0 },
      { nature: 'Travaux et services facturés', montant: 0 },
      { nature: 'Produits accessoires', montant: 0 },
      { nature: 'Production stockée', montant: 0 },
      { nature: 'Production immobilisée', montant: 0 },
    ],
  }
}

function buildNote34(): FinancialNote {
  return {
    number: 34,
    title: 'Distribution de bénéfices effectuée',
    content:
      "Distribution du bénéfice de l'exercice précédent approuvée au cours de l'exercice (dividendes par action ou par part sociale).",
    tables: [
      {
        exerciceDistribue: '',
        beneficeNet: 0,
        reserveLegale: 0,
        reportANouveau: 0,
        dividendes: 0,
        dividendeParTitre: 0,
      },
    ],
  }
}

async function buildNote35(
  providers: NotesDataProviders
): Promise<FinancialNote> {
  const rows = await safeLoad(providers.getEngagements, [])
  return {
    number: 35,
    title: 'Engagements financiers et autres informations',
    content:
      "Engagements hors bilan : cautions, garanties données/reçues, engagements de crédit-bail, obligations contractuelles et autres informations significatives.",
    tables: rows.length
      ? rows
      : [
          {
            nature: 'Cautions et garanties données',
            montant: 0,
            beneficiaire: '',
            echeance: '',
          },
          {
            nature: 'Cautions et garanties reçues',
            montant: 0,
            emetteur: '',
            echeance: '',
          },
          {
            nature: 'Engagements de crédit-bail non encore comptabilisés',
            montant: 0,
            bailleur: '',
            echeance: '',
          },
          {
            nature: 'Engagements contractuels (commandes fermes)',
            montant: 0,
            contrepartie: '',
            echeance: '',
          },
        ],
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateNotesAnnexes(
  input: StatementInput,
  dataProviders: NotesDataProviders = {}
): Promise<FinancialNotes> {
  const notes: FinancialNote[] = await Promise.all([
    Promise.resolve(buildNote1(input)),
    Promise.resolve(buildNote2()),
    buildNote3A(dataProviders),
    buildNote3B(dataProviders),
    buildNote3C(dataProviders),
    buildNote3D(dataProviders),
    Promise.resolve(buildNote3E()),
    Promise.resolve(buildNote4()),
    Promise.resolve(buildNote5()),
    buildNote6(dataProviders),
    buildNote7(dataProviders),
    Promise.resolve(buildNote8()),
    buildNote9(dataProviders),
    buildNote10(dataProviders),
    buildNote11(dataProviders),
    buildNote12(dataProviders),
    buildNote13(dataProviders),
    Promise.resolve(buildNote14()),
    Promise.resolve(buildNote15()),
    buildNote16(dataProviders),
    Promise.resolve(buildNote17()),
    Promise.resolve(buildNote18()),
    buildNote19(dataProviders),
    buildNote20(dataProviders),
    buildNote21(dataProviders),
    buildNote22(dataProviders),
    Promise.resolve(buildNote23()),
    Promise.resolve(buildNote24()),
    Promise.resolve(buildNote25()),
    Promise.resolve(buildNote26()),
    Promise.resolve(buildNote27()),
    buildNote28(dataProviders),
    Promise.resolve(buildNote29()),
    Promise.resolve(buildNote30()),
    Promise.resolve(buildNote31()),
    Promise.resolve(buildNote32()),
    Promise.resolve(buildNote33()),
    Promise.resolve(buildNote34()),
    buildNote35(dataProviders),
  ])

  // Re-number notes sequentially to align with official numbering
  // Notes 3A-3E share the "3" slot in the official plan; we preserve
  // the builder-assigned numbers above and override them here for the
  // sub-notes to clearly reflect their SYSCOHADA identifier strings.
  const TITLES_OVERRIDE: Record<number, string> = {
    2:  '3A – Immobilisations brutes',
    3:  '3B – Immobilisations : amortissements',
    4:  '3C – Immobilisations : plus ou moins-values de cession',
    5:  '3D – Immobilisations financières',
    6:  '3E – Pertes attendues de crédit (IFRS 9 adapté)',
  }

  const sequentialNotes = notes.map((note, idx) => {
    const seqNum = idx + 1
    const titleOverride = TITLES_OVERRIDE[seqNum]
    return {
      ...note,
      number: seqNum,
      title: titleOverride ?? note.title,
    }
  })

  return {
    noteCount: sequentialNotes.length,
    notes: sequentialNotes,
  }
}
