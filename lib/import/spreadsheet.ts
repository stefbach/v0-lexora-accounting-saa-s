/**
 * lib/import/spreadsheet.ts
 *
 * Lecture d'un classeur CSV / XLSX / XLS via SheetJS (déjà présent : `xlsx`).
 * SheetJS lit les trois formats depuis un ArrayBuffer — un seul lecteur suffit.
 * Renvoie les en-têtes (1re ligne non vide) et les lignes en objets.
 */

import * as XLSX from 'xlsx'

export interface ParsedSheet {
  headers: string[]
  /** Une ligne = objet {header: valeur cellule (string|number)}. */
  rows: Record<string, unknown>[]
  sheetName: string
  totalRows: number
}

const MAX_ROWS = 5000

/**
 * Parse le 1er onglet non vide d'un classeur.
 * @param data ArrayBuffer/Uint8Array (xlsx/xls) ou string (csv).
 */
export function parseSpreadsheet(data: ArrayBuffer | Uint8Array | string): ParsedSheet {
  const wb =
    typeof data === 'string'
      ? XLSX.read(data, { type: 'string' })
      : XLSX.read(data instanceof Uint8Array ? data : new Uint8Array(data), { type: 'array' })

  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { headers: [], rows: [], sheetName: '', totalRows: 0 }
  const ws = wb.Sheets[sheetName]

  // header:1 → matrice brute ; on repère la 1re ligne porteuse d'en-têtes.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' })
  if (!matrix.length) return { headers: [], rows: [], sheetName, totalRows: 0 }

  const headerRow = (matrix[0] as unknown[]).map((c) => String(c ?? '').trim())
  const headers = headerRow.filter((h) => h !== '')
  const rows: Record<string, unknown>[] = []
  for (let r = 1; r < matrix.length && rows.length < MAX_ROWS; r++) {
    const cells = matrix[r] as unknown[]
    if (!cells || cells.every((c) => String(c ?? '').trim() === '')) continue
    const obj: Record<string, unknown> = {}
    headerRow.forEach((h, i) => {
      if (h !== '') obj[h] = cells[i]
    })
    rows.push(obj)
  }
  return { headers, rows, sheetName, totalRows: matrix.length - 1 }
}

/** Sérialise une matrice (AoA) en classeur XLSX (buffer) — pour le modèle. */
export function aoaToXlsxBuffer(aoa: (string | number)[][], sheetName = 'Produits'): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx', bookSST: true }) as Uint8Array
}
