import type {
  BalanceSheet,
  BalanceSheetSection,
  BalanceSheetGroup,
  BalanceSheetLine,
  StatementInput,
} from '../../core/financial-statements.interface'

type GetAccountBalances = (codes: string[]) => Promise<Map<string, number>>

interface RubriqueDefinition {
  code: string
  label: string
  accountPrefixes: string[]
}

function sum(balances: Map<string, number>, prefixes: string[]): number {
  let total = 0
  balances.forEach((balance, account) => {
    if (prefixes.some((p) => account.startsWith(p))) {
      total += balance
    }
  })
  return total
}

function buildLine(
  accountCode: string,
  label: string,
  balances: Map<string, number>,
  prefixes: string[],
  comparativeBalances?: Map<string, number>
): BalanceSheetLine {
  return {
    accountCode,
    label,
    amount: sum(balances, prefixes),
    ...(comparativeBalances !== undefined && {
      comparativeAmount: sum(comparativeBalances, prefixes),
    }),
  }
}

function buildGroup(
  def: RubriqueDefinition,
  lines: BalanceSheetLine[]
): BalanceSheetGroup {
  const amount = lines.reduce((acc, l) => acc + l.amount, 0)
  const hasComparative = lines.some((l) => l.comparativeAmount !== undefined)
  return {
    code: def.code,
    label: def.label,
    amount,
    ...(hasComparative && {
      comparativeAmount: lines.reduce(
        (acc, l) => acc + (l.comparativeAmount ?? 0),
        0
      ),
    }),
    lines,
  }
}

async function buildActif(
  b: Map<string, number>,
  bc?: Map<string, number>
): Promise<BalanceSheetSection> {
  const groups: BalanceSheetGroup[] = []

  // ── ACTIF IMMOBILISÉ ──────────────────────────────────────────────────────
  const immobilise: BalanceSheetGroup[] = [
    buildGroup(
      { code: 'AD', label: 'Charges immobilisées', accountPrefixes: ['20'] },
      [buildLine('20', 'Charges immobilisées', b, ['20'], bc)]
    ),
    buildGroup(
      { code: 'AE', label: 'Frais de développement et de prospection', accountPrefixes: ['211', '212'] },
      [buildLine('211-212', 'Frais de développement et de prospection', b, ['211', '212'], bc)]
    ),
    buildGroup(
      { code: 'AF', label: 'Brevets, licences, logiciels et droits similaires', accountPrefixes: ['213', '217'] },
      [buildLine('213-217', 'Brevets, licences, logiciels et droits similaires', b, ['213', '217'], bc)]
    ),
    buildGroup(
      { code: 'AG', label: 'Fonds commercial et droit au bail', accountPrefixes: ['214', '215'] },
      [buildLine('214-215', 'Fonds commercial et droit au bail', b, ['214', '215'], bc)]
    ),
    buildGroup(
      { code: 'AH', label: 'Autres immobilisations incorporelles', accountPrefixes: ['218'] },
      [buildLine('218', 'Autres immobilisations incorporelles', b, ['218'], bc)]
    ),
    buildGroup(
      { code: 'AI', label: 'Terrains', accountPrefixes: ['22'] },
      [buildLine('22', 'Terrains', b, ['22'], bc)]
    ),
    buildGroup(
      { code: 'AJ', label: 'Bâtiments', accountPrefixes: ['231', '232', '233', '234', '235'] },
      [buildLine('231-235', 'Bâtiments', b, ['231', '232', '233', '234', '235'], bc)]
    ),
    buildGroup(
      { code: 'AK', label: 'Aménagements, agencements et installations', accountPrefixes: ['238'] },
      [buildLine('238', 'Aménagements, agencements et installations', b, ['238'], bc)]
    ),
    buildGroup(
      { code: 'AL', label: 'Matériel, mobilier et actifs biologiques', accountPrefixes: ['24'] },
      [buildLine('24', 'Matériel, mobilier et actifs biologiques', b, ['24'], bc)]
    ),
    buildGroup(
      { code: 'AM', label: 'Matériel de transport', accountPrefixes: ['245'] },
      [buildLine('245', 'Matériel de transport', b, ['245'], bc)]
    ),
    buildGroup(
      { code: 'AN', label: 'Avances et acomptes versés sur immobilisations', accountPrefixes: ['25'] },
      [buildLine('25', 'Avances et acomptes versés sur immobilisations', b, ['25'], bc)]
    ),
    buildGroup(
      { code: 'AP', label: "Titres de participation", accountPrefixes: ['26'] },
      [buildLine('26', "Titres de participation", b, ['26'], bc)]
    ),
    buildGroup(
      { code: 'AQ', label: 'Autres immobilisations financières', accountPrefixes: ['27', '275'] },
      [buildLine('27', 'Autres immobilisations financières', b, ['27'], bc)]
    ),
  ]

  const totalImmobilise = immobilise.reduce((acc, g) => acc + g.amount, 0)
  const comparativeImmobilise = bc
    ? immobilise.reduce((acc, g) => acc + (g.comparativeAmount ?? 0), 0)
    : undefined

  groups.push(
    ...immobilise,
    // Subtotal marker group for ACTIF IMMOBILISÉ
    {
      code: 'AZ',
      label: 'TOTAL ACTIF IMMOBILISÉ',
      amount: totalImmobilise,
      ...(comparativeImmobilise !== undefined && { comparativeAmount: comparativeImmobilise }),
      lines: [],
    }
  )

  // ── ACTIF CIRCULANT ───────────────────────────────────────────────────────
  const circulant: BalanceSheetGroup[] = [
    buildGroup(
      { code: 'BA', label: 'Actif circulant HAO', accountPrefixes: ['485', '488'] },
      [buildLine('485-488', 'Actif circulant HAO', b, ['485', '488'], bc)]
    ),
    buildGroup(
      { code: 'BB', label: 'Stocks et en-cours', accountPrefixes: ['31', '32', '33', '34', '35', '36', '37', '38'] },
      [buildLine('31-38', 'Stocks et en-cours', b, ['31', '32', '33', '34', '35', '36', '37', '38'], bc)]
    ),
    buildGroup(
      { code: 'BG', label: 'Créances et emplois assimilés', accountPrefixes: ['409', '411', '412', '413', '414', '415', '416', '417', '418'] },
      [buildLine('409-418', 'Créances et emplois assimilés', b, ['409', '411', '412', '413', '414', '415', '416', '417', '418'], bc)]
    ),
    buildGroup(
      { code: 'BH', label: 'Fournisseurs, avances versées', accountPrefixes: ['4091'] },
      [buildLine('4091', 'Fournisseurs, avances versées', b, ['4091'], bc)]
    ),
    buildGroup(
      { code: 'BI', label: 'Clients', accountPrefixes: ['411'] },
      [buildLine('411', 'Clients', b, ['411'], bc)]
    ),
    buildGroup(
      { code: 'BJ', label: 'Autres créances', accountPrefixes: ['42', '43', '44', '45', '46', '47', '48'] },
      [buildLine('4xx-autres', 'Autres créances', b, ['42', '43', '44', '45', '46', '47', '48'], bc)]
    ),
  ]

  const totalCirculant = circulant.reduce((acc, g) => acc + g.amount, 0)
  const comparativeCirculant = bc
    ? circulant.reduce((acc, g) => acc + (g.comparativeAmount ?? 0), 0)
    : undefined

  groups.push(
    ...circulant,
    {
      code: 'BZ',
      label: 'TOTAL ACTIF CIRCULANT',
      amount: totalCirculant,
      ...(comparativeCirculant !== undefined && { comparativeAmount: comparativeCirculant }),
      lines: [],
    }
  )

  // ── TRÉSORERIE-ACTIF ──────────────────────────────────────────────────────
  const tresorerie: BalanceSheetGroup[] = [
    buildGroup(
      { code: 'BQ', label: 'Titres de placement', accountPrefixes: ['50'] },
      [buildLine('50', 'Titres de placement', b, ['50'], bc)]
    ),
    buildGroup(
      { code: 'BR', label: 'Valeurs à encaisser', accountPrefixes: ['51'] },
      [buildLine('51', 'Valeurs à encaisser', b, ['51'], bc)]
    ),
    buildGroup(
      { code: 'BS', label: 'Banques, chèques postaux, caisse', accountPrefixes: ['52', '53', '57'] },
      [buildLine('52-53-57', 'Banques, chèques postaux, caisse', b, ['52', '53', '57'], bc)]
    ),
  ]

  const totalTresorerie = tresorerie.reduce((acc, g) => acc + g.amount, 0)
  const comparativeTresorerie = bc
    ? tresorerie.reduce((acc, g) => acc + (g.comparativeAmount ?? 0), 0)
    : undefined

  groups.push(
    ...tresorerie,
    {
      code: 'BT',
      label: 'TOTAL TRÉSORERIE-ACTIF',
      amount: totalTresorerie,
      ...(comparativeTresorerie !== undefined && { comparativeAmount: comparativeTresorerie }),
      lines: [],
    }
  )

  // ── ÉCARTS DE CONVERSION-ACTIF ────────────────────────────────────────────
  const ecarts = buildGroup(
    { code: 'BU', label: "Écarts de conversion-Actif", accountPrefixes: ['478'] },
    [buildLine('478', "Écarts de conversion-Actif", b, ['478'], bc)]
  )
  groups.push(ecarts)

  const total =
    totalImmobilise + totalCirculant + totalTresorerie + ecarts.amount
  const comparativeTotal = bc
    ? (comparativeImmobilise ?? 0) +
      (comparativeCirculant ?? 0) +
      (comparativeTresorerie ?? 0) +
      (ecarts.comparativeAmount ?? 0)
    : undefined

  return {
    label: 'ACTIF',
    total,
    ...(comparativeTotal !== undefined && { comparativeTotal }),
    groups,
  }
}

async function buildPassif(
  b: Map<string, number>,
  bc?: Map<string, number>
): Promise<{ equity: BalanceSheetSection; liabilities: BalanceSheetSection }> {
  // ── CAPITAUX PROPRES ET RESSOURCES ASSIMILÉES ─────────────────────────────
  const capitauxGroups: BalanceSheetGroup[] = [
    buildGroup({ code: 'CA', label: 'Capital', accountPrefixes: ['101', '102', '103', '104'] },
      [buildLine('101-104', 'Capital', b, ['101', '102', '103', '104'], bc)]),
    buildGroup({ code: 'CB', label: 'Apporteurs capital non appelé', accountPrefixes: ['109'] },
      [buildLine('109', 'Apporteurs capital non appelé', b, ['109'], bc)]),
    buildGroup({ code: 'CC', label: 'Primes et réserves', accountPrefixes: ['105', '106'] },
      [buildLine('105-106', 'Primes et réserves', b, ['105', '106'], bc)]),
    buildGroup({ code: 'CD', label: "Écarts de réévaluation", accountPrefixes: ['1052'] },
      [buildLine('1052', "Écarts de réévaluation", b, ['1052'], bc)]),
    buildGroup({ code: 'CE', label: 'Réserves', accountPrefixes: ['1061', '1068'] },
      [buildLine('1061-1068', 'Réserves', b, ['1061', '1068'], bc)]),
    buildGroup({ code: 'CF', label: 'Report à nouveau', accountPrefixes: ['11'] },
      [buildLine('11', 'Report à nouveau', b, ['11'], bc)]),
    buildGroup({ code: 'CG', label: "Résultat net de l'exercice", accountPrefixes: ['12'] },
      [buildLine('12', "Résultat net de l'exercice", b, ['12'], bc)]),
    buildGroup({ code: 'CH', label: "Subventions d'investissement", accountPrefixes: ['13'] },
      [buildLine('13', "Subventions d'investissement", b, ['13'], bc)]),
    buildGroup({ code: 'CI', label: 'Provisions réglementées et fonds assimilés', accountPrefixes: ['14'] },
      [buildLine('14', 'Provisions réglementées et fonds assimilés', b, ['14'], bc)]),
  ]

  const totalCapitaux = capitauxGroups.reduce((acc, g) => acc + g.amount, 0)
  const comparativeCapitaux = bc
    ? capitauxGroups.reduce((acc, g) => acc + (g.comparativeAmount ?? 0), 0)
    : undefined

  capitauxGroups.push({
    code: 'CZ',
    label: 'TOTAL CAPITAUX PROPRES ET RESSOURCES ASSIMILÉES',
    amount: totalCapitaux,
    ...(comparativeCapitaux !== undefined && { comparativeAmount: comparativeCapitaux }),
    lines: [],
  })

  const equity: BalanceSheetSection = {
    label: 'CAPITAUX PROPRES ET RESSOURCES ASSIMILÉES',
    total: totalCapitaux,
    ...(comparativeCapitaux !== undefined && { comparativeTotal: comparativeCapitaux }),
    groups: capitauxGroups,
  }

  // ── DETTES FINANCIÈRES ET RESSOURCES ASSIMILÉES ───────────────────────────
  const dettesFinGroups: BalanceSheetGroup[] = [
    buildGroup({ code: 'DA', label: 'Emprunts et dettes financières diverses', accountPrefixes: ['16'] },
      [buildLine('16', 'Emprunts et dettes financières diverses', b, ['16'], bc)]),
    buildGroup({ code: 'DB', label: 'Dettes de location acquisition', accountPrefixes: ['17'] },
      [buildLine('17', 'Dettes de location acquisition', b, ['17'], bc)]),
    buildGroup({ code: 'DC', label: 'Provisions pour risques et charges', accountPrefixes: ['19'] },
      [buildLine('19', 'Provisions pour risques et charges', b, ['19'], bc)]),
  ]

  // ── PASSIF CIRCULANT ──────────────────────────────────────────────────────
  const circulantPassifGroups: BalanceSheetGroup[] = [
    buildGroup({ code: 'DH', label: 'Dettes circulantes HAO', accountPrefixes: ['482', '484'] },
      [buildLine('482-484', 'Dettes circulantes HAO', b, ['482', '484'], bc)]),
    buildGroup({ code: 'DI', label: 'Clients, avances reçues', accountPrefixes: ['419'] },
      [buildLine('419', 'Clients, avances reçues', b, ['419'], bc)]),
    buildGroup({ code: 'DJ', label: "Fournisseurs d'exploitation", accountPrefixes: ['401', '408'] },
      [buildLine('401-408', "Fournisseurs d'exploitation", b, ['401', '408'], bc)]),
    buildGroup({ code: 'DK', label: 'Dettes fiscales et sociales', accountPrefixes: ['43', '44'] },
      [buildLine('43-44', 'Dettes fiscales et sociales', b, ['43', '44'], bc)]),
    buildGroup({ code: 'DM', label: 'Autres dettes', accountPrefixes: ['47'] },
      [buildLine('47', 'Autres dettes', b, ['47'], bc)]),
    buildGroup({ code: 'DN', label: 'Provisions pour risques à court terme', accountPrefixes: ['499', '599'] },
      [buildLine('499-599', 'Provisions pour risques à court terme', b, ['499', '599'], bc)]),
  ]

  // ── TRÉSORERIE-PASSIF ─────────────────────────────────────────────────────
  const tresoreriePassifGroups: BalanceSheetGroup[] = [
    buildGroup({ code: 'DQ', label: "Banques, crédits d'escompte", accountPrefixes: ['564', '565'] },
      [buildLine('564-565', "Banques, crédits d'escompte", b, ['564', '565'], bc)]),
    buildGroup({ code: 'DR', label: 'Banques, crédits de trésorerie', accountPrefixes: ['561'] },
      [buildLine('561', 'Banques, crédits de trésorerie', b, ['561'], bc)]),
    buildGroup({ code: 'DS', label: 'Banques, découverts', accountPrefixes: ['566'] },
      [buildLine('566', 'Banques, découverts', b, ['566'], bc)]),
  ]

  // ── ÉCARTS DE CONVERSION-PASSIF ───────────────────────────────────────────
  const ecartPassif = buildGroup(
    { code: 'DV', label: "Écarts de conversion-Passif", accountPrefixes: ['479'] },
    [buildLine('479', "Écarts de conversion-Passif", b, ['479'], bc)]
  )

  const allLiabGroups = [...dettesFinGroups, ...circulantPassifGroups, ...tresoreriePassifGroups, ecartPassif]
  const totalLiab = allLiabGroups.reduce((acc, g) => acc + g.amount, 0)
  const comparativeLiab = bc
    ? allLiabGroups.reduce((acc, g) => acc + (g.comparativeAmount ?? 0), 0)
    : undefined

  allLiabGroups.push({
    code: 'DZ',
    label: 'TOTAL DETTES ET PASSIF CIRCULANT',
    amount: totalLiab,
    ...(comparativeLiab !== undefined && { comparativeAmount: comparativeLiab }),
    lines: [],
  })

  const liabilities: BalanceSheetSection = {
    label: 'DETTES FINANCIÈRES, PASSIF CIRCULANT ET TRÉSORERIE-PASSIF',
    total: totalLiab,
    ...(comparativeLiab !== undefined && { comparativeTotal: comparativeLiab }),
    groups: allLiabGroups,
  }

  return { equity, liabilities }
}

/** Collect all account prefixes referenced by the bilan */
function getAllBilanPrefixes(): string[] {
  return [
    // Actif immobilisé
    '20', '211', '212', '213', '217', '214', '215', '218',
    '22', '231', '232', '233', '234', '235', '238', '24', '245', '25', '26', '27',
    // Actif circulant
    '485', '488',
    '31', '32', '33', '34', '35', '36', '37', '38',
    '409', '411', '412', '413', '414', '415', '416', '417', '418',
    '4091',
    '42', '43', '44', '45', '46', '47', '48',
    // Trésorerie actif
    '50', '51', '52', '53', '57',
    // Écarts conv actif
    '478',
    // Capitaux propres
    '101', '102', '103', '104', '109', '105', '106', '1052', '1061', '1068',
    '11', '12', '13', '14',
    // Dettes financières
    '16', '17', '19',
    // Passif circulant
    '482', '484', '419', '401', '408', '499', '599',
    // Trésorerie passif
    '564', '565', '561', '566',
    // Écarts conv passif
    '479',
  ]
}

export async function generateBilan(
  input: StatementInput,
  getAccountBalances: GetAccountBalances
): Promise<BalanceSheet> {
  const prefixes = getAllBilanPrefixes()

  // Fetch current period balances
  const balances = await getAccountBalances(prefixes)

  // Fetch comparative period balances if requested
  let comparativeBalances: Map<string, number> | undefined
  if (input.comparativePeriodStart && input.comparativePeriodEnd) {
    comparativeBalances = await getAccountBalances(prefixes)
  }

  const assets = await buildActif(balances, comparativeBalances)
  const { equity, liabilities } = await buildPassif(balances, comparativeBalances)

  const totalAssets = assets.total
  const totalLiabilitiesAndEquity = equity.total + liabilities.total
  const balanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01

  return {
    periodEnd: input.periodEnd,
    ...(input.comparativePeriodEnd && { comparative: input.comparativePeriodEnd }),
    assets,
    equity,
    liabilities,
    totalAssets,
    totalLiabilitiesAndEquity,
    balanced,
  }
}
