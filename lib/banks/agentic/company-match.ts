/**
 * Rapprochement intelligent de nom de société pour la sélection du « context »
 * bancaire (page « Select company » de MCB Pro et équivalents).
 *
 * Problème résolu : les banques abrègent/tronquent les raisons sociales dans
 * leur sélecteur (« Digital Data Solutions Ltd » affiché « DIGITAL DATA SOL
 * LTD »). Un match par égalité stricte ou par « tous les mots présents »
 * échoue. Ce module fait un rapprochement par tokens tolérant :
 *   - insensible à la casse, aux accents et à la ponctuation ;
 *   - tolérant aux abréviations par préfixe (sol↔solutions, comm↔commercial,
 *     intl↔international, mgmt↔management…) ;
 *   - synonymes de forme juridique (ltd↔limited, and↔&…) ;
 *   - pondère la couverture des tokens cible ET candidat pour éviter de
 *     sélectionner une société plus large qui contiendrait la cible.
 *
 * Déterministe, pur, testé — aucune dépendance réseau ni IA. Fait partie du
 * cœur intelligent du robot bancaire (garde-fous / décision restant dédiés à
 * la navigation et l'OTP).
 */

/** Tokens de forme juridique / génériques : ignorés dans le score de fond. */
const GENERIC_TOKENS = new Set([
  'ltd', 'ltee', 'limited', 'co', 'company', 'the', 'and', 'cie', 'sa', 'sarl',
  'plc', 'pvt', 'private', 'inc', 'incorporated', 'llc', 'llp', 'group', 'holding',
  'holdings', 'international', 'intl',
])

/** Synonymes non couverts par le simple préfixe. */
const SYNONYMS: Record<string, string> = {
  limited: 'ltd',
  ltee: 'ltd',
  'ltée': 'ltd',
  incorporated: 'inc',
  '&': 'and',
  intl: 'international',
}

/** Normalise : minuscules, accents retirés, ponctuation → espace, espaces compactés. */
export function normalizeCompany(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string): string[] {
  return normalizeCompany(s).split(' ').filter(Boolean)
}

function canonical(tok: string): string {
  return SYNONYMS[tok] || tok
}

/** Deux tokens correspondent-ils (exact, préfixe ≥ 3, ou synonyme) ? */
export function tokenMatches(a: string, b: string): boolean {
  const ca = canonical(a)
  const cb = canonical(b)
  if (ca === cb) return true
  // Préfixe : gère les troncatures/abréviations (sol↔solutions, comm↔commercial).
  const min = Math.min(ca.length, cb.length)
  if (min >= 3 && (ca.startsWith(cb) || cb.startsWith(ca))) return true
  return false
}

/**
 * Score de rapprochement [0..1] entre une raison sociale cible et un libellé
 * candidat. 1 = tous les tokens distinctifs de la cible sont couverts et le
 * candidat n'introduit pas de token distinctif étranger.
 */
export function scoreCompanyMatch(target: string, candidate: string): number {
  const tTarget = tokens(target)
  const tCand = tokens(candidate)
  if (tTarget.length === 0 || tCand.length === 0) return 0

  const sigTarget = tTarget.filter((t) => !GENERIC_TOKENS.has(canonical(t)))
  const sigCand = tCand.filter((t) => !GENERIC_TOKENS.has(canonical(t)))
  const baseTarget = sigTarget.length ? sigTarget : tTarget
  const baseCand = sigCand.length ? sigCand : tCand

  // Couverture cible : fraction des tokens distinctifs cible retrouvés dans le candidat.
  const matchedTarget = baseTarget.filter((t) => baseCand.some((c) => tokenMatches(t, c))).length
  const coverTarget = matchedTarget / baseTarget.length

  // Couverture candidat : le candidat n'introduit pas trop de tokens étrangers
  // (évite qu'« Digital Data Marketing Analytics Ltd » gagne sur « Digital Data »).
  const matchedCand = baseCand.filter((c) => baseTarget.some((t) => tokenMatches(t, c))).length
  const coverCand = matchedCand / baseCand.length

  // La couverture de la cible prime ; le candidat est un garde-fou anti-sur-match.
  return Number((coverTarget * 0.7 + coverCand * 0.3).toFixed(4))
}

export interface CompanyMatchResult {
  index: number
  candidate: string
  score: number
  ambiguous: boolean
}

/**
 * Choisit le meilleur candidat pour la raison sociale cible.
 * - `null` si aucun candidat au-dessus de `threshold`.
 * - `ambiguous = true` si le 2e candidat est trop proche du 1er (choix incertain).
 * - Un candidat unique est retenu s'il dépasse un seuil bas de sécurité.
 */
export function pickBestCompany(
  target: string,
  candidates: string[],
  threshold = 0.6,
): CompanyMatchResult | null {
  if (!candidates || candidates.length === 0) return null

  const scored = candidates.map((candidate, index) => ({
    index,
    candidate,
    score: scoreCompanyMatch(target, candidate),
  }))
  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]
  const second = scored[1]

  // Candidat unique : accepté dès un seuil de sécurité plus bas (la recherche
  // a déjà filtré la liste — cf. « Select company (1) »).
  const effectiveThreshold = candidates.length === 1 ? 0.4 : threshold
  if (best.score < effectiveThreshold) return null

  const ambiguous =
    second !== undefined && best.score < 0.95 && best.score - second.score < 0.15

  return { index: best.index, candidate: best.candidate, score: best.score, ambiguous }
}
