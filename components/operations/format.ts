/**
 * components/operations/format.ts
 *
 * Helpers d'AFFICHAGE purs et testés pour les tableaux de bord "Opérations"
 * (inventaire, POS, production, jobs). Aucune dépendance React → importable
 * partout (server/client) et couvert par des tests vitest.
 *
 * ⚠️ Ces helpers formatent des montants DÉJÀ calculés. La précision monétaire
 * (partie double, conversions de change) reste la responsabilité de
 * `lib/money.ts` / `lib/pos/panier.ts` / `lib/jobcosting/couts.ts` /
 * `lib/manufacturing/ordres.ts` en amont. Ici on ne fait que présenter.
 */

/** Sévérités partagées par AlertsPanel et les insights IA. */
export type Severity = 'danger' | 'warning' | 'info' | 'success'

const PLACEHOLDER = '—'

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * Formate un nombre en style fr-FR (séparateur de milliers = espace fine).
 * `null`/`undefined`/`NaN`/`Infinity` → "—" (jamais "NaN" à l'écran).
 */
export function formatNumber(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (!isFiniteNumber(value)) return PLACEHOLDER
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Formate un montant en roupies mauriciennes : "1 234 MUR".
 * Par défaut sans décimale (lisibilité dashboard) ; passer `decimals=2` pour
 * les montants unitaires. `null`/NaN → "—".
 */
export function formatMUR(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (!isFiniteNumber(value)) return PLACEHOLDER
  return `${formatNumber(value, decimals)} MUR`
}

/**
 * Formate un pourcentage : "12,5 %". Le signe négatif est conservé ; on peut
 * forcer l'affichage du "+" pour les variations via `signed`.
 * `null`/NaN → "—".
 */
export function formatPct(
  value: number | null | undefined,
  decimals = 1,
  signed = false,
): string {
  if (!isFiniteNumber(value)) return PLACEHOLDER
  const sign = signed && value > 0 ? '+' : ''
  return `${sign}${formatNumber(value, decimals)} %`
}

/**
 * Classe Tailwind de couleur selon le signe d'une valeur :
 *  - positif → teal (#0F766E)
 *  - négatif → rouge (#9F1239)
 *  - nul / non fini → gris neutre
 * Utilisée pour colorer marges, écarts et variations.
 */
export function signedClass(value: number | null | undefined): string {
  if (!isFiniteNumber(value) || value === 0) return 'text-slate-500'
  return value > 0 ? 'text-[#0F766E]' : 'text-[#9F1239]'
}

export type SeverityPalette = {
  /** Couleur principale (texte + bordure) en hex. */
  hex: string
  text: string
  border: string
  /** Fond translucide dérivé de `hex`. */
  bg: string
}

const SEVERITY_HEX: Record<Severity, string> = {
  danger: '#9F1239',
  warning: '#B45309',
  info: '#2A6FCC',
  success: '#0F766E',
}

/**
 * Convertit un hex (#RGB ou #RRGGBB) en chaîne `rgba(r, g, b, alpha)`.
 * Entrée invalide → noir à l'alpha demandé (dégradation silencieuse, jamais
 * une couleur cassée à l'écran).
 */
export function hexToRgba(hex: string, alpha: number): string {
  let h = typeof hex === 'string' ? hex.trim().replace(/^#/, '') : ''
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    return `rgba(0, 0, 0, ${alpha})`
  }
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Palette (hex + fond translucide) pour une sévérité d'alerte/insight.
 * Sévérité inconnue → palette `info` (repli neutre non alarmant).
 */
export function severityColor(sev: Severity | string | null | undefined): SeverityPalette {
  const key: Severity = (sev as Severity) in SEVERITY_HEX ? (sev as Severity) : 'info'
  const hex = SEVERITY_HEX[key]
  return {
    hex,
    text: hex,
    border: hex,
    bg: hexToRgba(hex, 0.06),
  }
}

/** Ordre de tri décroissant en gravité (danger d'abord, success en dernier). */
export const SEVERITY_ORDER: Record<Severity, number> = {
  danger: 0,
  warning: 1,
  info: 2,
  success: 3,
}

/** Rang de tri d'une sévérité (inconnu → rangé comme `info`). */
export function severityRank(sev: Severity | string | null | undefined): number {
  const key = (sev as Severity) in SEVERITY_ORDER ? (sev as Severity) : 'info'
  return SEVERITY_ORDER[key]
}
