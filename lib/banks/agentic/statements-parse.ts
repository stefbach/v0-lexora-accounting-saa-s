/**
 * Lecture intelligente de la page « Documents & statements » (MCB Internet
 * Banking Pro et équivalents) : lister les relevés PDF téléchargeables d'un
 * compte, année par année, pour les récupérer et les passer à l'OCR Lexora.
 *
 * Structure réelle observée (compte EUR 000447954587) :
 *   Onglets : Statements | Advices | Reports
 *   Année   : 2026 (sélectionnée) 2025 2024 …
 *   Tableau : Date generated | Document type            | Filename                  | ⧉  ↓
 *             31 Jul 2026     | Current account statement| Current Account statement | (lien externe + download)
 *
 * Chaque relevé mensuel est « généré » en fin de mois : la date generated
 * « 31 Jul 2026 » identifie le relevé de juillet 2026. On en dérive une période
 * `YYYY-MM` qui sert de clé de dédoublonnage stable (un même relevé mensuel ne
 * doit être téléchargé + OCRisé qu'une seule fois, pas à chaque run quotidien).
 *
 * Déterministe, pur, testé — le parse/dédoublonnage vit ici (Node), pas dans le
 * navigateur. Réutilise normalizeStatementDate (transactions-parse).
 */

import { normalizeStatementDate } from './transactions-parse'

/** Ligne brute extraite du tableau « Documents & statements » (header-mappée). */
export interface RawStatementRow {
  /** « 31 Jul 2026 ». */
  dateGenerated?: string
  /** « Current account statement ». */
  docType?: string
  /** « Current Account statement ». */
  filename?: string
  /** href du bouton de téléchargement, si capté côté navigateur. */
  downloadHref?: string
}

export interface StatementRef {
  /** Date de génération ISO (YYYY-MM-DD). */
  date_generated: string
  /** Période comptable dérivée (YYYY-MM) — clé de dédoublonnage mensuelle. */
  period: string
  doc_type: string
  filename: string
  download_href: string | null
}

/** Période comptable YYYY-MM d'une date ISO. */
function periodOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}

const MONTHS_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Motif regex (source) ciblant la date telle qu'affichée par MCB (« 30 Jun
 * 2026 ») à partir d'une date ISO (YYYY-MM-DD). Sert à CLIQUER la BONNE ligne de
 * relevé au téléchargement.
 *
 * ⚠️ Bug corrigé : le sélecteur de ligne ne matchait que l'ANNÉE (`slice(0,4)`
 * → « 2026 »), donc `.first()` cliquait toujours le relevé le PLUS RÉCENT, quel
 * que soit le mois demandé → on téléchargeait juillet en croyant récupérer juin.
 * En ciblant jour+mois+année, chaque mois est atteint correctement.
 */
export function mcbDisplayDatePattern(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim())
  if (!m) return null
  const [, y, mo, d] = m
  const mon = MONTHS_ABBR[parseInt(mo, 10) - 1]
  if (!mon) return null
  const day = String(parseInt(d, 10)) // sans zéro initial (MCB affiche « 3 » ou « 30 »)
  // Tolère un éventuel zéro initial et un séparateur d'espace variable.
  return `\\b0?${day}\\s+${mon}\\s+${y}\\b`
}

/**
 * Parse une ligne brute. `null` si la ligne n'est pas un relevé exploitable
 * (date de génération illisible) — ignore en-têtes / lignes vides.
 */
export function parseStatementRow(row: RawStatementRow): StatementRef | null {
  const date = normalizeStatementDate(row.dateGenerated)
  if (!date) return null
  const docType = (row.docType || '').replace(/\s+/g, ' ').trim() || 'Statement'
  const filename = (row.filename || '').replace(/\s+/g, ' ').trim() || docType
  const href = (row.downloadHref || '').trim() || null
  return {
    date_generated: date,
    period: periodOf(date),
    doc_type: docType,
    filename,
    download_href: href,
  }
}

/** Parse le tableau complet ; ignore silencieusement les lignes non exploitables. */
export function parseStatements(rows: RawStatementRow[]): StatementRef[] {
  if (!rows || rows.length === 0) return []
  const out: StatementRef[] = []
  for (const row of rows) {
    const parsed = parseStatementRow(row)
    if (parsed) out.push(parsed)
  }
  return out
}

/**
 * Clé de dédoublonnage stable d'un relevé : période + type. Un relevé de compte
 * courant de juillet 2026 a la même clé quel que soit le jour de run.
 */
export function statementDedupeKey(s: { period: string; doc_type: string }): string {
  return `${s.period}|${s.doc_type.toLowerCase()}`
}

/**
 * Filtre : ne garde que les relevés absents de `existingKeys` (déjà stockés /
 * OCRisés) et non dupliqués dans le lot. Ordre d'entrée préservé (MCB liste du
 * plus récent au plus ancien).
 */
export function selectNewStatements(
  statements: StatementRef[],
  existingKeys: Set<string>,
): StatementRef[] {
  const out: StatementRef[] = []
  const seen = new Set<string>()
  for (const s of statements) {
    const k = statementDedupeKey(s)
    if (existingKeys.has(k) || seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

/**
 * Sélection pour le BACKFILL historique complet : dédoublonne le lot, EXCLUT les
 * périodes déjà ingérées (relevé PDF déjà stocké/OCRisé), trie du plus récent au
 * plus ancien, puis borne à `maxN`. Permet à des runs successifs de remonter
 * TOUT l'historique MCB (onglets année 2026/2025/2024…) sans jamais
 * re-télécharger un mois déjà présent : chaque run récupère les mois manquants
 * les plus récents en priorité, et les plus anciens run après run.
 */
export function selectStatementsForBackfill(
  statements: StatementRef[],
  knownPeriods: Set<string>,
  maxN: number,
): StatementRef[] {
  const ranked = selectNewStatements(statements, new Set())
    .filter((s) => !knownPeriods.has(s.period))
    .sort((a, b) => b.period.localeCompare(a.period))
  // UN SEUL relevé par PÉRIODE. MCB liste souvent le même mois DEUX fois — via
  // l'API (doc_type « Statement ») ET via le DOM (« Current account statement »).
  // Sans ce dédoublonnage, on tentait deux téléchargements pour juin ; le 2e clic
  // ciblé ne se redéclenchait pas et retombait sur le href générique = juillet →
  // un doc parasite « juin » au contenu de juillet. On garde le 1er (le clic
  // ciblé, tenté en premier, ramène le bon mois).
  const seenPeriod = new Set<string>()
  const out: StatementRef[] = []
  for (const s of ranked) {
    if (seenPeriod.has(s.period)) continue
    seenPeriod.add(s.period)
    out.push(s)
  }
  return out.slice(0, Math.max(0, maxN))
}

/**
 * Nom de fichier de stockage normalisé, stable et sans collision entre comptes /
 * périodes : « MCB_<compte>_<periode>_<type>.pdf ». Sert aussi de garde-fou de
 * dédoublonnage au niveau du stockage.
 */
export function statementStorageName(
  s: { period: string; doc_type: string },
  ctx: { banque: string; numero_compte: string },
): string {
  const slug = (v: string) => v.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  return `${slug(ctx.banque)}_${slug(ctx.numero_compte)}_${s.period}_${slug(s.doc_type)}.pdf`
}
