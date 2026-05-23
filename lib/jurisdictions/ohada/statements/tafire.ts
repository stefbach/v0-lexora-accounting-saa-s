/**
 * TAFIRE - Tableau Financier des Ressources et des Emplois
 * Spécifique SYSCOHADA (AUDCIF) - Acte Uniforme relatif au Droit Comptable
 *
 * Le TAFIRE est l'équivalent OHADA du tableau des flux de trésorerie mais plus
 * détaillé, distinguant la Capacité d'AutoFinancement Globale (CAFG),
 * la variation du Fonds de Roulement (FdR), et la variation de Trésorerie.
 *
 * Référence normative : SYSCOHADA Révisé 2017 - Tableau n°7
 */

import type {
  TAFIRE,
  TAFIRELine,
  StatementInput,
} from '../../core/financial-statements.interface'

// ---------------------------------------------------------------------------
// Types internes
// ---------------------------------------------------------------------------

/**
 * Fonction de lecture des soldes de comptes pour l'exercice en cours.
 * Retourne le solde net (débiteur positif, créditeur négatif) d'un préfixe de compte.
 */
export type GetBalancesFn = (
  societeId: string,
  accountPrefix: string,
  periodStart: Date,
  periodEnd: Date
) => Promise<number>

// ---------------------------------------------------------------------------
// Utilitaires internes
// ---------------------------------------------------------------------------

/**
 * Crée une TAFIRELine avec code officiel SYSCOHADA et calcul automatique.
 * Convention : resources (entrées) positives, uses (emplois) positifs.
 * netVariation = resources - uses
 */
function makeLine(
  code: string,
  label: string,
  resources: number,
  uses: number
): TAFIRELine {
  return {
    code,
    label,
    resources: Math.max(0, resources),
    uses: Math.max(0, uses),
    netVariation: resources - uses,
  }
}

/**
 * Somme les soldes de plusieurs préfixes de comptes.
 */
async function sumAccounts(
  societeId: string,
  prefixes: string[],
  periodStart: Date,
  periodEnd: Date,
  getBalances: GetBalancesFn
): Promise<number> {
  const amounts = await Promise.all(
    prefixes.map((prefix) => getBalances(societeId, prefix, periodStart, periodEnd))
  )
  return amounts.reduce((acc, v) => acc + v, 0)
}

/**
 * Variation d'un poste de bilan entre N-1 et N.
 * Pour un compte d'actif : variation positive = emploi (emplois augmentent).
 * Pour un compte de passif : variation positive = ressource (dettes augmentent).
 */
async function bilanVariation(
  societeId: string,
  prefixes: string[],
  periodStart: Date,
  periodEnd: Date,
  getPriorBalances: GetBalancesFn,
  periodEndDate: Date,
  priorEndDate: Date
): Promise<number> {
  const current = await sumAccounts(societeId, prefixes, periodStart, periodEnd, getPriorBalances)
  // Solde au 31/12/N-1 : on utilise la fonction avec les dates de l'exercice précédent
  const prior = await sumAccounts(
    societeId,
    prefixes,
    new Date(priorEndDate.getFullYear(), 0, 1),
    priorEndDate,
    getPriorBalances
  )
  return current - prior
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Génère le TAFIRE SYSCOHADA complet.
 *
 * @param input          - Paramètres de la période
 * @param getBalances    - Lecture des mouvements de l'exercice N
 * @param getPriorBalances - Lecture des mouvements de l'exercice N-1 (pour variations de bilan)
 */
export async function generateTAFIRE(
  input: StatementInput,
  getBalances: GetBalancesFn,
  getPriorBalances: GetBalancesFn
): Promise<TAFIRE> {
  const { societeId, periodStart, periodEnd } = input

  // Période comparative N-1
  const priorEnd = input.comparativePeriodEnd ?? new Date(periodEnd.getFullYear() - 1, 11, 31)
  const priorStart = input.comparativePeriodStart ?? new Date(priorEnd.getFullYear(), 0, 1)

  // Raccourci pour lire les soldes N
  const bal = (prefix: string) =>
    getBalances(societeId, prefix, periodStart, periodEnd)

  // Raccourci pour variation bilan N vs N-1 (signe: N minus N-1)
  const varBilan = async (prefixes: string[]): Promise<number> => {
    const curr = await sumAccounts(societeId, prefixes, periodStart, periodEnd, getBalances)
    const prev = await sumAccounts(societeId, prefixes, priorStart, priorEnd, getPriorBalances)
    return curr - prev
  }

  // =========================================================================
  // PARTIE I – CAPACITÉ D'AUTOFINANCEMENT GLOBALE (CAFG)
  // =========================================================================

  // CA – Résultat net de l'exercice (compte 12 ou solde XI du compte de résultat)
  // Le solde du compte 12 représente le bénéfice (créditeur = positif)
  const CA_resultNet = -(await bal('12')) // créditeur en comptabilité → inverser

  // CB – Dotations aux amortissements et provisions (charges calculées)
  // 681: dotations aux amortissements d'exploitation
  // 687: dotations aux provisions d'exploitation
  // 691: dotations aux amortissements financiers
  // 697: dotations aux provisions financières
  // 852: dotations aux amortissements HAO
  // 853: dotations aux provisions HAO
  // 858: autres charges calculées HAO
  const CB_dotations = await sumAccounts(
    societeId,
    ['681', '687', '691', '697', '852', '853', '858'],
    periodStart,
    periodEnd,
    getBalances
  )

  // CC – Reprises sur amortissements et provisions (produits calculés)
  // 791: reprises sur amortissements et provisions d'exploitation
  // 797: reprises sur provisions financières
  // 862: reprises sur amortissements HAO
  // 863: reprises sur provisions HAO
  const CC_reprises = await sumAccounts(
    societeId,
    ['791', '797', '862', '863'],
    periodStart,
    periodEnd,
    getBalances
  )

  // CD – Valeurs comptables des cessions d'immobilisations (compte 81)
  // Charges HAO sur cessions d'actif immobilisé
  const CD_vceCessions = await bal('81')

  // CE – Produits des cessions d'immobilisations (compte 82)
  // Produits HAO sur cessions d'actif immobilisé (créditeur → positif)
  const CE_produitsCessions = -(await bal('82'))

  // CF – Quote-part de subventions d'investissement virée au résultat (compte 865)
  const CF_quotePartSubventions = -(await bal('865'))

  // CAFG = CA + CB - CC + CD - CE - CF
  const CAFG =
    CA_resultNet + CB_dotations - CC_reprises + CD_vceCessions - CE_produitsCessions - CF_quotePartSubventions

  // CG – Distributions de dividendes mises en paiement (compte 465 ou mouvement 12→11/44)
  // Dividendes versés pendant l'exercice = débit compte 465 (actionnaires dividendes à payer)
  const CG_dividendes = await bal('465')

  // AUTOFINANCEMENT (AF) = CAFG - CG
  const AF = CAFG - CG_dividendes

  // =========================================================================
  // PARTIE II – VARIATION DU FONDS DE ROULEMENT (FdR)
  // =========================================================================
  //
  // EMPLOIS À FINANCER
  // =========================================================================

  // CH – Dividendes versés (= CG, déjà calculé ci-dessus)
  const CH_dividendesVerses = CG_dividendes

  // CI – Investissements et acquisitions d'actifs immobilisés
  // Variation classe 21 (immobilisations incorporelles): augmentation = emploi
  const varImmo_21 = await varBilan(['21'])
  // Variation classes 22-24 (immobilisations corporelles)
  const varImmo_22 = await varBilan(['22'])
  const varImmo_23 = await varBilan(['23'])
  const varImmo_24 = await varBilan(['24'])
  // Variation classes 26-27 (immobilisations financières)
  const varImmo_26 = await varBilan(['26'])
  const varImmo_27 = await varBilan(['27'])

  // Total investissements bruts : seules les augmentations (variations positives)
  const CI_investissements = Math.max(
    0,
    varImmo_21 + varImmo_22 + varImmo_23 + varImmo_24 + varImmo_26 + varImmo_27
  )

  // CJ – Charges à répartir sur plusieurs exercices (compte 20)
  const varChargesRepartir = await varBilan(['20'])
  const CJ_chargesRepartir = Math.max(0, varChargesRepartir)

  // CK – Réduction des capitaux propres (rachats d'actions, capital réduit)
  // Variation négative des comptes 101-109 (hors résultat 12)
  const varCapitaux = await varBilan(['101', '102', '103', '104', '105', '106', '107', '108', '109'])
  const CK_reductionCapitaux = Math.max(0, -varCapitaux)

  // CL – Remboursement des dettes financières (variation négative classe 16-17)
  const varDettesLT = await varBilan(['16', '17'])
  const CL_remboursementDettes = Math.max(0, -varDettesLT)

  // Total des emplois
  const totalEmplois = CH_dividendesVerses + CI_investissements + CJ_chargesRepartir + CK_reductionCapitaux + CL_remboursementDettes

  // =========================================================================
  // RESSOURCES NETTES DE FINANCEMENT
  // =========================================================================

  // CM – Augmentation des capitaux propres par apports nouveaux
  // Variation positive des comptes 101-104 (capital et primes)
  const varCapitauxApports = await varBilan(['101', '102', '103', '104'])
  const CM_augmentationCapitaux = Math.max(0, varCapitauxApports)

  // CN – Subventions d'investissement reçues (variation classe 13)
  const varSubventions = await varBilan(['13'])
  const CN_subventions = Math.max(0, varSubventions)

  // CO – Autres ressources (autres ressources durables non classifiées ailleurs)
  // Variation classe 14 (provisions réglementées) + classe 15 (provisions pour risques)
  const varProvRegl = await varBilan(['14', '15'])
  const CO_autresRessources = Math.max(0, varProvRegl)

  // CP – Emprunts nouveaux (variation positive classe 16-17)
  const CP_emprunts = Math.max(0, varDettesLT)

  // CQ – Produits de cessions ou réductions d'actif immobilisé
  // = CE (produits cessions) - CD (valeur comptable cessions) = plus/moins-value nette
  // Mais dans le TAFIRE, on utilise le prix de cession total (CE)
  const CQ_cessions = CE_produitsCessions

  // Total des ressources (hors autofinancement)
  const totalRessources = CM_augmentationCapitaux + CN_subventions + CO_autresRessources + CP_emprunts + CQ_cessions

  // Excédent ou Insuffisance des Ressources (EIR)
  // EIR = (totalRessources + AF) - totalEmplois
  const EIR = totalRessources + AF - totalEmplois

  // =========================================================================
  // PARTIE III – VARIATION DE LA TRÉSORERIE NETTE
  // =========================================================================

  // CR – Variation des stocks (classes 3)
  // Augmentation des stocks = emploi (besoin de financement)
  const varStocks = await varBilan(['31', '32', '33', '34', '35', '36', '37', '38'])
  const CR_variationStocks = varStocks // positif = augmentation = emploi

  // CS – Variation des créances et emplois assimilés (41, 47)
  // Augmentation des créances = emploi
  const varCreances = await varBilan(['41', '47'])
  const CS_variationCreances = varCreances

  // CT – Variation des fournisseurs et autres dettes circulantes (40, 42-48)
  // Augmentation des dettes = ressource
  const varDettesCirc = await varBilan(['40', '42', '43', '44', '45', '46', '48'])
  const CT_variationDettes = varDettesCirc

  // BFE = Besoin en Fonds d'Exploitation = (CR + CS) - CT
  // Positif = besoin augmente = emploi net
  const deltaBFE = CR_variationStocks + CS_variationCreances - CT_variationDettes

  // TRÉSORERIE NETTE = EIR - ΔBFE
  const tresorerieNetteVariation = EIR - deltaBFE

  // =========================================================================
  // VÉRIFICATION DE RÉCONCILIATION
  // =========================================================================
  // La variation de trésorerie via TAFIRE doit égaler la variation des comptes
  // de trésorerie au bilan (classe 5 : 51, 52, 53, 57 moins 52 créditeurs)

  const varTresorerieBilan = await varBilan(['51', '52', '53', '54', '57'])

  const ecartReconciliation = Math.abs(tresorerieNetteVariation - varTresorerieBilan)
  // L'écart doit être < 1 unité monétaire (arrondi)
  const reconciled = ecartReconciliation < 1

  // =========================================================================
  // CONSTRUCTION DE L'OBJET TAFIRE
  // =========================================================================

  // --- Activités d'investissement (lignes CA-CQ) ---
  const investmentActivities: TAFIRELine[] = [
    // PARTIE I
    makeLine('CA', 'Résultat net de l\'exercice (XI)', CA_resultNet > 0 ? CA_resultNet : 0, CA_resultNet < 0 ? Math.abs(CA_resultNet) : 0),
    makeLine('CB', 'Dotations aux amortissements et provisions (681+687+691+697+852+853+858)', CB_dotations, 0),
    makeLine('CC', 'Reprises sur amortissements et provisions (791+797+862+863)', 0, CC_reprises),
    makeLine('CD', 'Valeurs comptables des cessions d\'immobilisations (81)', 0, CD_vceCessions),
    makeLine('CE', 'Produits des cessions d\'immobilisations (82)', CE_produitsCessions, 0),
    makeLine('CF', 'Quote-part subventions investissement virée au résultat (865)', 0, CF_quotePartSubventions),
    {
      code: 'CAFG',
      label: 'Capacité d\'AutoFinancement Globale (CA+CB-CC+CD-CE-CF)',
      resources: CAFG > 0 ? CAFG : 0,
      uses: CAFG < 0 ? Math.abs(CAFG) : 0,
      netVariation: CAFG,
    },
    makeLine('CG', 'Distributions de dividendes mises en paiement', 0, CG_dividendes),
    {
      code: 'AF',
      label: 'Autofinancement (CAFG - CG)',
      resources: AF > 0 ? AF : 0,
      uses: AF < 0 ? Math.abs(AF) : 0,
      netVariation: AF,
    },
    // PARTIE II – Emplois
    makeLine('CH', 'Dividendes versés', 0, CH_dividendesVerses),
    makeLine('CI', 'Investissements et acquisitions d\'actifs immobilisés (21+22-24+26-27)', 0, CI_investissements),
    makeLine('CJ', 'Charges à répartir sur plusieurs exercices (20)', 0, CJ_chargesRepartir),
    makeLine('CK', 'Réduction des capitaux propres', 0, CK_reductionCapitaux),
    makeLine('CL', 'Remboursement des dettes financières (16+17)', 0, CL_remboursementDettes),
    // PARTIE II – Ressources
    makeLine('CM', 'Augmentation des capitaux propres par apports nouveaux (101-104)', CM_augmentationCapitaux, 0),
    makeLine('CN', 'Subventions d\'investissement reçues (13)', CN_subventions, 0),
    makeLine('CO', 'Autres ressources (14+15)', CO_autresRessources, 0),
    makeLine('CP', 'Emprunts nouveaux (16+17)', CP_emprunts, 0),
    makeLine('CQ', 'Cessions ou réductions d\'actif immobilisé (82)', CQ_cessions, 0),
    {
      code: 'EIR',
      label: 'Excédent (Insuffisance) des Ressources de Financement',
      resources: EIR > 0 ? EIR : 0,
      uses: EIR < 0 ? Math.abs(EIR) : 0,
      netVariation: EIR,
    },
  ]

  // --- Activités de financement (lignes CR-CT = variation BFR + trésorerie) ---
  const financingActivities: TAFIRELine[] = [
    // PARTIE III – Variation du BFE
    makeLine(
      'CR',
      'Variation des stocks (classes 3)',
      CR_variationStocks < 0 ? Math.abs(CR_variationStocks) : 0,
      CR_variationStocks > 0 ? CR_variationStocks : 0
    ),
    makeLine(
      'CS',
      'Variation des créances et emplois assimilés (41, 47)',
      CS_variationCreances < 0 ? Math.abs(CS_variationCreances) : 0,
      CS_variationCreances > 0 ? CS_variationCreances : 0
    ),
    makeLine(
      'CT',
      'Variation des fournisseurs et autres dettes circulantes (40, 42-48)',
      CT_variationDettes > 0 ? CT_variationDettes : 0,
      CT_variationDettes < 0 ? Math.abs(CT_variationDettes) : 0
    ),
    {
      code: 'DBFE',
      label: 'Variation du Besoin en Fonds d\'Exploitation (CR+CS-CT)',
      resources: deltaBFE < 0 ? Math.abs(deltaBFE) : 0,
      uses: deltaBFE > 0 ? deltaBFE : 0,
      netVariation: -deltaBFE,
    },
    {
      code: 'VTN',
      label: 'Variation de la Trésorerie Nette (EIR - ΔBFE)',
      resources: tresorerieNetteVariation > 0 ? tresorerieNetteVariation : 0,
      uses: tresorerieNetteVariation < 0 ? Math.abs(tresorerieNetteVariation) : 0,
      netVariation: tresorerieNetteVariation,
    },
    // Ligne de contrôle réconciliation bilan
    {
      code: 'CTR',
      label: `Contrôle : variation trésorerie bilan (classe 5) – écart ${ecartReconciliation.toFixed(2)} ${reconciled ? '✓' : '⚠'}`,
      resources: varTresorerieBilan > 0 ? varTresorerieBilan : 0,
      uses: varTresorerieBilan < 0 ? Math.abs(varTresorerieBilan) : 0,
      netVariation: varTresorerieBilan,
    },
  ]

  // =========================================================================
  // RETOUR
  // =========================================================================

  return {
    periodStart,
    periodEnd,
    // Partie I : CAFG
    capacityForSelfFinancing: CAFG,
    // Partie II : variation FdR = EIR (excédent des ressources sur les emplois)
    workingCapitalChange: EIR,
    // Trésorerie libre générée = AF (autofinancement après dividendes)
    freeCashFlow: AF,
    investmentActivities,
    financingActivities,
    // Variation nette de trésorerie (EIR - ΔBFE)
    netVariationOfTreasury: tresorerieNetteVariation,
  }
}

// ---------------------------------------------------------------------------
// Export nommé pour faciliter les tests unitaires
// ---------------------------------------------------------------------------

export {
  sumAccounts,
  makeLine,
}
