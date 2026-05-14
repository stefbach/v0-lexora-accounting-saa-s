/**
 * Helpers pour exports Excel structurés (grand-livre, balance, P&L).
 *
 * Le module xlsx (SheetJS community) supporte : number formats, column widths,
 * cell formulas, merged cells. Le styling visuel (couleurs, bordures) nécessite
 * la version pro — pour rester gratuit, on utilise les number formats + une
 * structure claire (sections, totaux en formules).
 *
 * Les sociétés Maurice raisonnent en MUR (Roupies Mauriciennes). Format
 * comptable mauricien : 1 234 567.89 ou (1 234 567.89) pour les négatifs.
 */
import * as XLSX from 'xlsx'

/** Format nombre comptable mauricien : 1 234.56 / (1 234.56) en rouge négatif */
export const FMT_MUR = '#,##0.00;[Red](#,##0.00);"–"'
export const FMT_INT = '#,##0;[Red](#,##0);"–"'
export const FMT_PCT = '0.00%;[Red](0.00%)'
export const FMT_DATE = 'dd/mm/yyyy'

/**
 * Crée une cellule avec valeur + format.
 * @param v   valeur (nombre, string, date)
 * @param fmt number format Excel (optionnel)
 */
export function cell(v: any, fmt?: string): XLSX.CellObject {
  if (v === null || v === undefined || v === '') {
    return { t: 's', v: '' }
  }
  if (typeof v === 'number') {
    return fmt ? { t: 'n', v, z: fmt } : { t: 'n', v }
  }
  if (v instanceof Date) {
    return { t: 'd', v, z: fmt || FMT_DATE }
  }
  return { t: 's', v: String(v) }
}

/** Cellule formule (ex: '=SUM(B2:B10)') */
export function formula(f: string, fmt?: string): XLSX.CellObject {
  return fmt ? { t: 'n', f, z: fmt } : { t: 'n', f }
}

/** Ligne d'en-tête en gras (via le contenu, le visuel reste limité en community) */
export function header(label: string): XLSX.CellObject {
  return { t: 's', v: label }
}

/**
 * Crée une feuille à partir d'un AOA (array of arrays). Cellules peuvent être
 * des valeurs primitives OU des CellObject pour formats avancés.
 */
/** Range type local (évite dépendance à XLSX.Range exporté de façon instable). */
type CellRange = { s: { r: number; c: number }; e: { r: number; c: number } }

export function aoaSheet(
  rows: Array<Array<any>>,
  opts?: { colWidths?: number[]; merges?: CellRange[]; freezeTopRows?: number },
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows.map(r => r.map(c => {
    if (c && typeof c === 'object' && ('t' in c || 'f' in c)) return c
    return c
  })))

  if (opts?.colWidths) {
    ws['!cols'] = opts.colWidths.map(w => ({ wch: w }))
  }
  if (opts?.merges) {
    ws['!merges'] = opts.merges
  }
  if (opts?.freezeTopRows) {
    ws['!freeze'] = { ySplit: opts.freezeTopRows }
  }
  return ws
}

/**
 * Crée un workbook avec plusieurs feuilles. Renvoie un Buffer prêt pour
 * Response.
 */
export function buildWorkbook(
  sheets: Array<{ name: string; ws: XLSX.WorkSheet }>,
  props?: { title?: string; author?: string; subject?: string },
): Buffer {
  const wb = XLSX.utils.book_new()
  if (props) {
    wb.Props = {
      Title: props.title,
      Author: props.author || 'Lexora',
      Subject: props.subject,
      CreatedDate: new Date(),
    }
  }
  for (const { name, ws } of sheets) {
    // Excel : noms de feuille max 31 chars, pas de caractères [ ] : * ? / \
    const safe = name.slice(0, 31).replace(/[\[\]:*?/\\]/g, '_')
    XLSX.utils.book_append_sheet(wb, ws, safe)
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer
}

/** Helper Response xlsx avec headers HTTP corrects */
export function xlsxResponse(buf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * Format MUR pour affichage in-cellule string (utilisé quand on veut un
 * fallback texte plutôt qu'une vraie cellule numérique).
 */
export function fmtMUR(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return '—'
  if (v === 0) return '—'
  const abs = Math.abs(v)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return v < 0 ? `(${abs})` : abs
}
