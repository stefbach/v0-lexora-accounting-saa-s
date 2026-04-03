export const BANK_NAMES_BLACKLIST = [
  'mcb', 'mauritius commercial bank', 'sbm', 'state bank of mauritius',
  'absa', 'barclays', 'hsbc', 'maubank', 'bank', 'banque', 'banking',
  'bmo', 'bnp', 'afrasia', 'abc banking', 'warwyck', 'standard chartered',
]

export function isBankName(name: string): boolean {
  const lower = name.toLowerCase().trim()
  return BANK_NAMES_BLACKLIST.some(b => lower.includes(b))
}
