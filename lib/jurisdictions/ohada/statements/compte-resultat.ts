/**
 * Compte de Résultat SYSCOHADA (Révisé)
 * État financier officiel conforme au droit comptable OHADA
 * Codes de lignes alignés avec la liasse fiscale SYSCOHADA
 */

import type {
  IncomeStatement,
  IncomeStatementLine,
  StatementInput,
} from '../../core/financial-statements.interface'

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type LineType = IncomeStatementLine['type']

type GetAccountBalances = (
  societeId: string,
  accountPrefixes: string[],
  periodStart: Date,
  periodEnd: Date
) => Promise<number>

interface IntermediateSoldes {
  TA: number
  RA: number
  RB: number
  XA: number // Marge commerciale
  TB: number
  TC: number
  TD: number
  XB: number // Chiffre d'affaires
  TE: number
  TF: number
  TG: number
  TH: number
  TI: number
  RC: number
  RD: number
  RE: number
  RF: number
  RG: number
  RH: number
  RI: number
  RJ: number
  XC: number // Valeur ajoutée
  RK: number
  XD: number // Excédent brut d'exploitation
  TJ: number
  RL: number
  RM: number
  XE: number // Résultat d'exploitation
  TK: number
  TL: number
  TM: number
  RN: number
  RO: number
  XF: number // Résultat financier
  XG: number // Résultat des activités ordinaires
  TN: number
  TO: number
  RP: number
  RQ: number
  XH: number // Résultat hors activités ordinaires
  RS: number
  RT: number
  XI: number // Résultat net
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function line(
  code: string,
  label: string,
  amount: number,
  type: LineType,
  comparativeAmount?: number
): IncomeStatementLine {
  const l: IncomeStatementLine = { code, label, amount, type }
  if (comparativeAmount !== undefined) l.comparativeAmount = comparativeAmount
  return l
}

function subtotal(
  code: string,
  label: string,
  amount: number,
  comparativeAmount?: number
): IncomeStatementLine {
  return line(code, label, amount, 'SUBTOTAL', comparativeAmount)
}

function total(
  code: string,
  label: string,
  amount: number,
  comparativeAmount?: number
): IncomeStatementLine {
  return line(code, label, amount, 'TOTAL', comparativeAmount)
}

// ---------------------------------------------------------------------------
// Fetch soldes for a single set of account prefixes (sum of debit balances)
// Returns a positive number for expense accounts (debit nature)
// and a positive number for revenue accounts (credit nature).
// The sign convention is handled at the aggregation level.
// ---------------------------------------------------------------------------

async function fetch(
  getAccountBalances: GetAccountBalances,
  societeId: string,
  prefixes: string[],
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  return getAccountBalances(societeId, prefixes, periodStart, periodEnd)
}

// ---------------------------------------------------------------------------
// Compute all intermediate soldes for one period
// ---------------------------------------------------------------------------

async function computeSoldes(
  input: StatementInput,
  getAccountBalances: GetAccountBalances,
  periodStart: Date,
  periodEnd: Date
): Promise<IntermediateSoldes> {
  const g = (prefixes: string[]) =>
    fetch(getAccountBalances, input.societeId, prefixes, periodStart, periodEnd)

  // ── ACTIVITÉS D'EXPLOITATION ──────────────────────────────────────────────
  const TA = await g(['701'])                          // Ventes de marchandises
  const RA = await g(['601'])                          // Achats de marchandises
  const RB = await g(['6031'])                         // Variation stocks marchises (603/1)
  // XA = Marge commerciale: TA - RA - RB
  const XA = TA - RA - RB

  const TB = await g(['702', '703', '704'])            // Ventes de produits fabriqués
  const TC = await g(['705', '706'])                   // Travaux, services vendus
  const TD = await g(['707'])                          // Produits accessoires
  // XB = Chiffre d'affaires: TA + TB + TC + TD
  const XB = TA + TB + TC + TD

  const TE = await g(['73'])                           // Production stockée
  const TF = await g(['72'])                           // Production immobilisée
  const TG = await g(['71'])                           // Subventions d'exploitation
  const TH = await g(['75'])                           // Autres produits
  const TI = await g(['781'])                          // Transferts de charges d'exploitation

  const RC = await g(['602', '604'])                   // Achats matières premières & fournitures liées
  const RD = await g(['6033'])                         // Variation stocks matières premières
  const RE = await g(['605', '608'])                   // Autres achats
  const RF = await g(['6034'])                         // Variations stocks autres approvisionnements
  const RG = await g(['61'])                           // Transports
  const RH = await g(['62', '63'])                     // Services extérieurs
  const RI = await g(['64'])                           // Impôts et taxes
  const RJ = await g(['65'])                           // Autres charges

  // XC = Valeur ajoutée
  // XB + TE + TF + TG + TH + TI - RC - RD - RE - RF - RG - RH - RI - RJ
  const XC =
    XB + TE + TF + TG + TH + TI -
    RC - RD - RE - RF - RG - RH - RI - RJ

  const RK = await g(['66'])                           // Charges de personnel
  // XD = Excédent brut d'exploitation
  const XD = XC - RK

  const TJ = await g(['791'])                          // Reprises de provisions d'exploitation
  const RL = await g(['681'])                          // Dotations aux amortissements
  const RM = await g(['691'])                          // Dotations aux provisions d'exploitation

  // XE = Résultat d'exploitation
  const XE = XD + TJ - RL - RM

  // ── ACTIVITÉS FINANCIÈRES ─────────────────────────────────────────────────
  const TK = await g(['77'])                           // Revenus financiers et assimilés
  const TL = await g(['797'])                          // Reprises de provisions financières
  const TM = await g(['787'])                          // Transferts de charges financières
  const RN = await g(['67'])                           // Frais financiers et charges assimilés
  const RO = await g(['697'])                          // Dotations aux provisions financières

  // XF = Résultat financier
  const XF = TK + TL + TM - RN - RO
  // XG = Résultat des activités ordinaires
  const XG = XE + XF

  // ── HORS ACTIVITÉS ORDINAIRES (HAO) ──────────────────────────────────────
  const TN = await g(['82'])                           // Produits des cessions d'immobilisations
  const TO = await g(['84'])                           // Autres produits HAO
  const RP = await g(['81'])                           // Valeurs comptables des cessions d'immo
  const RQ = await g(['83'])                           // Autres charges HAO

  // XH = Résultat HAO
  const XH = TN + TO - RP - RQ

  const RS = await g(['87'])                           // Participation des travailleurs
  const RT = await g(['89'])                           // Impôts sur le résultat

  // XI = Résultat net
  const XI = XG + XH - RS - RT

  return {
    TA, RA, RB, XA,
    TB, TC, TD, XB,
    TE, TF, TG, TH, TI,
    RC, RD, RE, RF, RG, RH, RI, RJ,
    XC, RK, XD,
    TJ, RL, RM, XE,
    TK, TL, TM, RN, RO, XF, XG,
    TN, TO, RP, RQ, XH,
    RS, RT, XI,
  }
}

// ---------------------------------------------------------------------------
// Build lines array from soldes
// ---------------------------------------------------------------------------

function buildLines(
  s: IntermediateSoldes,
  comp?: IntermediateSoldes
): IncomeStatementLine[] {
  const c = comp
  const lines: IncomeStatementLine[] = []

  // ── ACTIVITÉS D'EXPLOITATION ──────────────────────────────────────────────
  lines.push(
    line('TA', 'Ventes de marchandises',                        s.TA, 'REVENUE',  c?.TA),
    line('RA', 'Achats de marchandises',                       -s.RA, 'EXPENSE',  c ? -c.RA : undefined),
    line('RB', 'Variation de stocks de marchandises',          -s.RB, 'EXPENSE',  c ? -c.RB : undefined),
    subtotal('XA', 'MARGE COMMERCIALE',                         s.XA,             c?.XA),
    line('TB', 'Ventes de produits fabriqués',                  s.TB, 'REVENUE',  c?.TB),
    line('TC', 'Travaux, services vendus',                      s.TC, 'REVENUE',  c?.TC),
    line('TD', 'Produits accessoires',                          s.TD, 'REVENUE',  c?.TD),
    subtotal('XB', 'CHIFFRE D\'AFFAIRES',                       s.XB,             c?.XB),
    line('TE', 'Production stockée ou déstockée',               s.TE, 'REVENUE',  c?.TE),
    line('TF', 'Production immobilisée',                        s.TF, 'REVENUE',  c?.TF),
    line('TG', 'Subventions d\'exploitation',                   s.TG, 'REVENUE',  c?.TG),
    line('TH', 'Autres produits',                               s.TH, 'REVENUE',  c?.TH),
    line('TI', 'Transferts de charges d\'exploitation',         s.TI, 'REVENUE',  c?.TI),
    line('RC', 'Achats de matières premières et fournitures',  -s.RC, 'EXPENSE',  c ? -c.RC : undefined),
    line('RD', 'Variation de stocks de matières premières',    -s.RD, 'EXPENSE',  c ? -c.RD : undefined),
    line('RE', 'Autres achats',                                -s.RE, 'EXPENSE',  c ? -c.RE : undefined),
    line('RF', 'Variations de stocks d\'autres approvisionnements', -s.RF, 'EXPENSE', c ? -c.RF : undefined),
    line('RG', 'Transports',                                   -s.RG, 'EXPENSE',  c ? -c.RG : undefined),
    line('RH', 'Services extérieurs',                          -s.RH, 'EXPENSE',  c ? -c.RH : undefined),
    line('RI', 'Impôts et taxes',                              -s.RI, 'EXPENSE',  c ? -c.RI : undefined),
    line('RJ', 'Autres charges',                               -s.RJ, 'EXPENSE',  c ? -c.RJ : undefined),
    subtotal('XC', 'VALEUR AJOUTÉE',                            s.XC,             c?.XC),
    line('RK', 'Charges de personnel',                         -s.RK, 'EXPENSE',  c ? -c.RK : undefined),
    subtotal('XD', 'EXCÉDENT BRUT D\'EXPLOITATION (EBE)',        s.XD,             c?.XD),
    line('TJ', 'Reprises de provisions d\'exploitation',        s.TJ, 'REVENUE',  c?.TJ),
    line('RL', 'Dotations aux amortissements',                 -s.RL, 'EXPENSE',  c ? -c.RL : undefined),
    line('RM', 'Dotations aux provisions d\'exploitation',     -s.RM, 'EXPENSE',  c ? -c.RM : undefined),
    subtotal('XE', 'RÉSULTAT D\'EXPLOITATION',                   s.XE,             c?.XE),
  )

  // ── ACTIVITÉS FINANCIÈRES ─────────────────────────────────────────────────
  lines.push(
    line('TK', 'Revenus financiers et assimilés',               s.TK, 'REVENUE',  c?.TK),
    line('TL', 'Reprises de provisions financières',            s.TL, 'REVENUE',  c?.TL),
    line('TM', 'Transferts de charges financières',             s.TM, 'REVENUE',  c?.TM),
    line('RN', 'Frais financiers et charges assimilés',        -s.RN, 'EXPENSE',  c ? -c.RN : undefined),
    line('RO', 'Dotations aux provisions financières',         -s.RO, 'EXPENSE',  c ? -c.RO : undefined),
    subtotal('XF', 'RÉSULTAT FINANCIER',                         s.XF,             c?.XF),
    subtotal('XG', 'RÉSULTAT DES ACTIVITÉS ORDINAIRES (RAO)',    s.XG,             c?.XG),
  )

  // ── HORS ACTIVITÉS ORDINAIRES ─────────────────────────────────────────────
  lines.push(
    line('TN', 'Produits des cessions d\'immobilisations',      s.TN, 'REVENUE',  c?.TN),
    line('TO', 'Autres produits HAO',                           s.TO, 'REVENUE',  c?.TO),
    line('RP', 'Valeurs comptables des cessions d\'immobilisations', -s.RP, 'EXPENSE', c ? -c.RP : undefined),
    line('RQ', 'Autres charges HAO',                           -s.RQ, 'EXPENSE',  c ? -c.RQ : undefined),
    subtotal('XH', 'RÉSULTAT HORS ACTIVITÉS ORDINAIRES (HAO)',   s.XH,             c?.XH),
    line('RS', 'Participation des travailleurs',               -s.RS, 'EXPENSE',  c ? -c.RS : undefined),
    line('RT', 'Impôts sur le résultat',                       -s.RT, 'EXPENSE',  c ? -c.RT : undefined),
    total('XI', 'RÉSULTAT NET',                                  s.XI,             c?.XI),
  )

  return lines
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Génère le Compte de Résultat SYSCOHADA pour une société et une période donnée.
 *
 * @param input            Paramètres de l'état (societeId, période, période comparative)
 * @param getAccountBalances Fonction de callback qui retourne le solde (net) pour
 *                          une liste de préfixes de comptes sur une période.
 *                          Conventions :
 *                            - Comptes de charges (cl.6, 8x charges) : retourne solde débiteur positif
 *                            - Comptes de produits (cl.7, 8x produits) : retourne solde créditeur positif
 */
export async function generateCompteDeResultat(
  input: StatementInput,
  getAccountBalances: GetAccountBalances
): Promise<IncomeStatement> {
  // Current period
  const s = await computeSoldes(input, getAccountBalances, input.periodStart, input.periodEnd)

  // Comparative period (optional)
  let comp: IntermediateSoldes | undefined
  if (input.comparativePeriodStart && input.comparativePeriodEnd) {
    comp = await computeSoldes(
      input,
      getAccountBalances,
      input.comparativePeriodStart,
      input.comparativePeriodEnd
    )
  }

  const lines = buildLines(s, comp)

  // Map to IncomeStatement interface fields
  const revenue = s.XB + s.TE + s.TF + s.TG + s.TH + s.TI
  const expenses = s.RC + s.RD + s.RE + s.RF + s.RG + s.RH + s.RI + s.RJ + s.RK + s.RL + s.RM

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    revenue,
    expenses,
    operatingIncome: s.XE,
    financialIncome: s.TK + s.TL + s.TM,
    financialExpenses: s.RN + s.RO,
    exceptionalItems: s.XH,
    incomeBeforeTax: s.XG + s.XH - s.RS,
    incomeTax: s.RT,
    netIncome: s.XI,
    lines,
  }
}
