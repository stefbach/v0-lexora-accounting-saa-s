/**
 * Helpers communs pour la génération de fichiers d'export officiels MRA
 * (VAT3, DSN/CSG, PAYE...).
 *
 * Tous les formats ci-dessous sont des **scaffolds** à valider avec la
 * spec MRA officielle avant mise en production.
 */

/**
 * Formate un nombre au format "1234.56" (standard MRA : point décimal,
 * 2 décimales, pas de séparateur de milliers).
 */
export function formatAmountMra(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '0.00'
  return Number(n).toFixed(2)
}

/**
 * Formate une date au format "YYYY-MM-DD" (UTC).
 */
export function formatDateMra(d: string | Date | null | undefined): string {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  if (!(dt instanceof Date) || isNaN(dt.getTime())) return ''
  const yyyy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Échappe les caractères XML dangereux (`& < > " '`).
 */
export function escapeXml(s: string | number | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Échappe un champ CSV : entoure de guillemets doubles si la valeur
 * contient un séparateur (`;`), un guillemet (`"`) ou un saut de ligne.
 * Les guillemets internes sont doublés.
 */
export function escapeCsv(s: string | number | null | undefined): string {
  if (s == null) return ''
  const str = String(s)
  if (/[;"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Préfixe une chaîne avec le BOM UTF-8 (\uFEFF) pour améliorer la
 * compatibilité Excel/Windows sur les fichiers CSV/XML.
 */
export function addUtf8Bom(content: string): string {
  return '\uFEFF' + content
}

/**
 * Retourne l'année fiscale mauricienne pour une date donnée.
 *
 * À Maurice, l'année fiscale court du 1er juillet au 30 juin de l'année
 * suivante (ex : FY 2025-2026 = 1er juillet 2025 → 30 juin 2026).
 * Cette fonction renvoie l'année de *début* de l'exercice.
 *
 * Exemples :
 *   getAnneeFiscaleMaurice(new Date('2025-08-15')) → 2025
 *   getAnneeFiscaleMaurice(new Date('2026-03-10')) → 2025
 *   getAnneeFiscaleMaurice(new Date('2026-07-01')) → 2026
 */
export function getAnneeFiscaleMaurice(date: Date = new Date()): number {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1 // 1-12
  return month >= 7 ? year : year - 1
}

/**
 * Retourne les bornes (date de début / date de fin, format YYYY-MM-DD)
 * de l'année fiscale mauricienne dont le paramètre `annee` est l'année
 * de début (ex : anneeFiscaleBounds(2025) → juillet 2025 → juin 2026).
 */
export function anneeFiscaleBounds(annee: number): { debut: string; fin: string } {
  return {
    debut: `${annee}-07-01`,
    fin: `${annee + 1}-06-30`,
  }
}
