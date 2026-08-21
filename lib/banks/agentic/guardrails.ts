/**
 * lib/banks/agentic/guardrails.ts — Garde-fous LECTURE SEULE du robot bancaire.
 *
 * SÉCURITÉ NON NÉGOCIABLE (doc §2.2) : ce module est 100 % déterministe —
 * jamais l'IA ne s'auto-autorise. Chaque action projetée (issue du modèle OU
 * du rejeu d'une recette) passe par `checkAction` AVANT toute exécution.
 *
 * Politique : DENY BY DEFAULT.
 *  - Liste blanche de types d'action (consultation uniquement).
 *  - Liste noire absolue sur les URL ET les libellés cliqués : virement,
 *    transfer, payment, beneficiary, carte, standing order, paramètres de
 *    sécurité… → abort immédiat.
 *  - `fill` autorisé UNIQUEMENT dans les champs login / OTP / recherche de
 *    compte. Jamais dans un champ montant, bénéficiaire ou référence de
 *    paiement.
 *  - `press` restreint aux touches de navigation neutres.
 *
 * Le texte comparé est normalisé agressivement (minuscules, accents, décodage
 * URL, suppression des séparateurs et caractères invisibles) pour résister à
 * l'obfuscation (`Vire%20ment`, `bene-ficiaire`, zéro-width…). Un faux positif
 * est sans danger (le run s'arrête) ; un faux négatif est inacceptable.
 */

import type {
  AgenticAction,
  GuardrailVerdict,
  ObservedElement,
} from './types'

// ─── Normalisation anti-obfuscation ─────────────────────────────────────────

const ZERO_WIDTH_RE = /[\u200b-\u200f\u2060\ufeff\u00ad]/g
const SEPARATORS_RE = /[\s\-_./\\+:;,'"`|()[\]{}<>~!?*&^%$#@=]+/g

/** Décode les échappements URL de façon répétée et bornée (%2520 → ' '). */
function urlDecodeDeep(value: string): string {
  let current = value
  for (let i = 0; i < 3; i++) {
    let decoded: string
    try {
      decoded = decodeURIComponent(current.replace(/\+/g, '%20'))
    } catch {
      break
    }
    if (decoded === current) break
    current = decoded
  }
  return current
}

/**
 * Normalise une chaîne pour la comparaison aux motifs interdits :
 * décodage URL, minuscules, accents supprimés, invisibles supprimés.
 */
export function normalizeForMatching(value: string): string {
  return urlDecodeDeep(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // diacritiques combinants (é → e)
    .replace(ZERO_WIDTH_RE, '')
}

/** Variante compacte : tous les séparateurs retirés (`vire-ment` → `virement`). */
function compactForm(normalized: string): string {
  return normalized.replace(SEPARATORS_RE, '')
}

// ─── Liste noire absolue ────────────────────────────────────────────────────

/**
 * Motifs interdits, appliqués sur la forme normalisée ET la forme compacte
 * des URL et libellés. Écrits SANS accents ni majuscules (la normalisation
 * ramène toute entrée à cette forme).
 */
export const FORBIDDEN_PATTERNS: readonly string[] = [
  // Mouvements d'argent
  'virement',
  'transfer', // couvre transfer, transfers, transfert(s)
  'payment',
  'paiement',
  'payer',
  'remittance',
  // Bénéficiaires
  'beneficiary',
  'beneficiaire', // « bénéficiaire » après normalisation
  'payee',
  // Cartes
  'carte',
  'card',
  // Ordres permanents / prélèvements
  'standing order',
  'standingorder',
  'ordre permanent',
  'ordrepermanent',
  'direct debit',
  'directdebit',
  'prelevement', // « prélèvement » après normalisation
  // Paramètres de sécurité / gestion des accès
  'parametres de securite',
  'parametresdesecurite',
  'security settings',
  'securitysettings',
  'change password',
  'changepassword',
  'changer le mot de passe',
  'changerlemotdepasse',
] as const

/**
 * Retourne le motif interdit trouvé dans `value`, ou null.
 * Match sur la forme normalisée et sur la forme compacte (anti-obfuscation).
 */
export function findForbiddenPattern(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = normalizeForMatching(value)
  const compact = compactForm(normalized)
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (normalized.includes(pattern)) return pattern
    if (compact.includes(compactForm(pattern))) return pattern
  }
  return null
}

// ─── Classification des champs de saisie (fill) ─────────────────────────────

export type FillFieldPurpose = 'login_username' | 'login_password' | 'otp' | 'account_search'

/**
 * Motifs interdits SPÉCIFIQUES aux champs de saisie : même si un champ
 * ressemblait à un champ autorisé, ces motifs le disqualifient (montant,
 * bénéficiaire, IBAN…).
 */
const FORBIDDEN_FIELD_PATTERNS: readonly string[] = [
  'montant',
  'amount',
  'somme',
  'iban',
  'beneficiaire',
  'beneficiary',
  'payee',
  'motif',
  'reference du paiement',
  'payment reference',
] as const

const FIELD_PURPOSE_PATTERNS: ReadonlyArray<[FillFieldPurpose, readonly string[]]> = [
  ['login_password', ['password', 'passwd', 'pwd', 'mot de passe', 'motdepasse', 'pin']],
  ['otp', ['otp', 'one time', 'onetime', '2fa', 'mfa', 'code sms', 'codesms', 'verification code', 'code de verification', 'securecode', 'token']],
  ['login_username', ['username', 'user name', 'login', 'identifiant', 'user id', 'userid', 'customer id', 'customerid', 'email']],
  ['account_search', ['search', 'recherche', 'rechercher', 'filter', 'filtre', 'numero de compte', 'account number', 'accountnumber']],
]

/** Texte agrégé décrivant un champ (tous les attributs qui le nomment). */
function fieldDescriptor(element: ObservedElement): string {
  return [
    element.name,
    element.id,
    element.placeholder,
    element.ariaLabel,
    element.text,
    element.inputType,
    element.selector,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Classe un champ de saisie. Retourne null si le champ n'appartient pas à la
 * liste blanche (login / OTP / recherche de compte) → fill refusé.
 */
export function classifyFillTarget(element: ObservedElement): FillFieldPurpose | null {
  const descriptor = normalizeForMatching(fieldDescriptor(element))
  const compact = compactForm(descriptor)

  for (const pattern of FORBIDDEN_FIELD_PATTERNS) {
    if (descriptor.includes(pattern) || compact.includes(compactForm(pattern))) return null
  }
  // Le type natif du champ est un signal fort et difficile à obfusquer.
  if (element.inputType === 'password') return 'login_password'
  for (const [purpose, patterns] of FIELD_PURPOSE_PATTERNS) {
    for (const pattern of patterns) {
      if (descriptor.includes(pattern) || compact.includes(compactForm(pattern))) return purpose
    }
  }
  return null
}

// ─── Touches autorisées (press) ─────────────────────────────────────────────

const ALLOWED_KEYS = new Set([
  'enter',
  'tab',
  'escape',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'pageup',
  'pagedown',
  'home',
  'end',
])

// ─── Verdict ────────────────────────────────────────────────────────────────

function deny(rule: string, reason: string): GuardrailVerdict {
  return { allowed: false, rule, reason }
}

const ALLOW: GuardrailVerdict = { allowed: true }

/**
 * Filtre déterministe d'une action projetée, AVANT exécution.
 *
 * @param action      Action validée structurellement (voir decision.ts).
 * @param element     Élément observé correspondant à `action.target`
 *                    (null si introuvable — refus pour click/fill).
 * @param currentUrl  URL de la page courante (elle aussi filtrée).
 */
export function checkAction(
  action: AgenticAction,
  element: ObservedElement | null,
  currentUrl: string,
): GuardrailVerdict {
  // 0. L'URL courante elle-même ne doit jamais être une zone interdite.
  const urlHit = findForbiddenPattern(currentUrl)
  if (urlHit && action.type !== 'abort') {
    return deny('forbidden_url', `URL courante en zone interdite (motif « ${urlHit} »)`)
  }

  switch (action.type) {
    // Actions terminales / sans effet sur la banque : toujours permises.
    case 'done':
    case 'need_otp':
    case 'abort':
    case 'scroll':
      return ALLOW

    case 'press': {
      const key = normalizeForMatching(action.value ?? '')
      if (!ALLOWED_KEYS.has(key)) {
        return deny('forbidden_key', `Touche non autorisée : « ${action.value ?? ''} »`)
      }
      return ALLOW
    }

    case 'click': {
      if (!element) {
        return deny('target_not_observed', `Cible de clic introuvable dans l'observation : ${action.target ?? '(absente)'}`)
      }
      // Double filtre : URL de destination ET texte/attributs de l'élément.
      const hrefHit = findForbiddenPattern(element.href)
      if (hrefHit) return deny('forbidden_url', `Lien vers zone interdite (motif « ${hrefHit} »)`)
      const labelHit =
        findForbiddenPattern(element.text) ??
        findForbiddenPattern(element.ariaLabel) ??
        findForbiddenPattern(element.name) ??
        findForbiddenPattern(element.id) ??
        findForbiddenPattern(element.selector)
      if (labelHit) return deny('forbidden_label', `Libellé interdit (motif « ${labelHit} »)`)
      return ALLOW
    }

    case 'fill': {
      if (!element) {
        return deny('target_not_observed', `Champ de saisie introuvable dans l'observation : ${action.target ?? '(absente)'}`)
      }
      const purpose = classifyFillTarget(element)
      if (!purpose) {
        return deny('forbidden_fill_target', `Saisie refusée : le champ n'est ni login, ni OTP, ni recherche de compte (${element.selector})`)
      }
      return ALLOW
    }

    // Types inconnus : impossibles après decision.ts, mais deny by default.
    default:
      return deny('unknown_action', `Type d'action inconnu : ${(action as AgenticAction).type}`)
  }
}
