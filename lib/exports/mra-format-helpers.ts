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
