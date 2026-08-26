/**
 * Logique pure (testable) de l'export du Plan Comptable Mauricien (PCM).
 * Le rendu Excel/CSV et l'I/O Supabase vivent dans la route API ; ici on garde
 * les colonnes, la mise en forme des valeurs et la construction CSV.
 */

export interface PcmExportRow {
  compte: string
  libelle: string | null
  classe: number | null
  type_compte: string | null
  sens_normal: string | null
  compte_parent: string | null
  niveau: number | null
  est_analytique: boolean | null
  categorie_ifrs: string | null
  sous_categorie_ifrs: string | null
  poste_etat_financier_ifrs: string | null
  est_contra_ifrs: boolean | null
  type_mra_ifrs: string | null
  notes: string | null
}

export const PCM_EXPORT_COLUMNS: Array<{ key: keyof PcmExportRow; label: string }> = [
  { key: 'compte', label: 'Compte' },
  { key: 'libelle', label: 'Libellé' },
  { key: 'classe', label: 'Classe' },
  { key: 'type_compte', label: 'Type' },
  { key: 'sens_normal', label: 'Sens normal' },
  { key: 'categorie_ifrs', label: 'Catégorie IFRS' },
  { key: 'sous_categorie_ifrs', label: 'Sous-catégorie IFRS' },
  { key: 'poste_etat_financier_ifrs', label: 'Poste état financier IFRS' },
  { key: 'type_mra_ifrs', label: 'Code MRA' },
  { key: 'est_contra_ifrs', label: 'Contra' },
  { key: 'compte_parent', label: 'Compte parent' },
  { key: 'niveau', label: 'Niveau' },
  { key: 'est_analytique', label: 'Analytique' },
  { key: 'notes', label: 'Notes' },
]

export const PCM_CLASSE_LABELS: Record<string, string> = {
  '1': 'Capitaux et réserves',
  '2': 'Immobilisations',
  '3': 'Stocks',
  '4': 'Tiers',
  '5': 'Financier / Trésorerie',
  '6': 'Charges',
  '7': 'Produits',
}

/** Valeur affichable d'une cellule : booléens → « Oui »/vide, null → vide. */
export function pcmDisplay(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Oui' : ''
  return String(v)
}

/** Échappe un champ CSV (séparateur « ; », guillemets doublés, RFC 4180). */
export function pcmCsvField(v: unknown): string {
  const s = pcmDisplay(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Construit le CSV complet (en-tête + lignes), séparateur « ; », fins de ligne
 * CRLF, préfixé d'un BOM UTF-8 pour qu'Excel (locale FR) lise les accents.
 */
export function buildPcmCsv(rows: PcmExportRow[]): string {
  const lines = [PCM_EXPORT_COLUMNS.map((c) => pcmCsvField(c.label)).join(';')]
  for (const r of rows) {
    lines.push(PCM_EXPORT_COLUMNS.map((col) => pcmCsvField(r[col.key])).join(';'))
  }
  return '﻿' + lines.join('\r\n')
}

/** Compte les comptes par classe (clé string '1'..'7', '?' si nulle). */
export function pcmCountByClasse(rows: PcmExportRow[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    const k = r.classe != null ? String(r.classe) : '?'
    out.set(k, (out.get(k) || 0) + 1)
  }
  return out
}
