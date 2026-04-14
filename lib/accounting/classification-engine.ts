/**
 * classification-engine.ts — Moteur de règles de classification
 *
 * Applique les règles R01-R07 sur les transactions bancaires
 * pour déterminer automatiquement le compte comptable approprié.
 *
 * Spécification : NIVEAU P1-C2 du référentiel rapprochement Lexora
 */

export interface ClassificationRule {
  id: string
  rule_code: string
  societe_id: string | null
  priority: number
  active: boolean
  pattern_libelle: string | null
  pattern_tiers: string | null
  pattern_journal: string | null
  amount_min: number | null
  amount_max: number | null
  classification: string
  compte_debit: string
  compte_credit: string
  libelle_template: string | null
  requires_validation: boolean
  compliance_flag: string | null
  legal_warning: string | null
}

export interface BankTransaction {
  date: string
  libelle: string
  tiers_detecte: string | null
  debit: number
  credit: number
  devise: string
}

export interface ClassificationResult {
  matched: boolean
  rule_code?: string
  rule_id?: string
  classification?: string
  compte_debit?: string
  compte_credit?: string
  libelle?: string
  requires_validation?: boolean
  compliance_flag?: string | null
  legal_warning?: string | null
}

/**
 * Applique les règles de classification dans l'ordre de priorité (asc).
 * Première règle qui matche → résultat retourné.
 */
export function classifyTransaction(
  tx: BankTransaction,
  rules: ClassificationRule[],
): ClassificationResult {
  const lib = (tx.libelle || '').toLowerCase()
  const tiers = (tx.tiers_detecte || '').toLowerCase()
  const amount = Math.max(tx.debit, tx.credit)

  // Trier par priorité ascendante (R01 d'abord, puis R02, etc.)
  const sortedRules = [...rules]
    .filter(r => r.active)
    .sort((a, b) => a.priority - b.priority)

  for (const rule of sortedRules) {
    // Match libellé (regex tolérant ou substring séparée par |)
    if (rule.pattern_libelle) {
      const patterns = rule.pattern_libelle.toLowerCase().split('|').map(p => p.trim())
      const libMatch = patterns.some(p => {
        try {
          return new RegExp(p, 'i').test(lib)
        } catch {
          return lib.includes(p)
        }
      })
      if (!libMatch) continue
    }

    // Match tiers (substring séparé par |)
    if (rule.pattern_tiers) {
      const patterns = rule.pattern_tiers.toLowerCase().split('|').map(p => p.trim())
      const tiersMatch = patterns.some(p => {
        try {
          return new RegExp(p, 'i').test(tiers) || new RegExp(p, 'i').test(lib)
        } catch {
          return tiers.includes(p) || lib.includes(p)
        }
      })
      if (!tiersMatch) continue
    }

    // Match montant
    if (rule.amount_min !== null && amount < rule.amount_min) continue
    if (rule.amount_max !== null && amount > rule.amount_max) continue

    // Match journal (si défini)
    // (le journal vient de la transaction bancaire = toujours BNQ ici)

    // Cette règle matche !
    const libelle = (rule.libelle_template || `${rule.classification} — ${tx.tiers_detecte || ''}`)
      .replace(/\{\{tiers\}\}/g, tx.tiers_detecte || '')
      .replace(/\{\{date\}\}/g, tx.date || '')
      .replace(/\{\{libelle\}\}/g, tx.libelle || '')

    return {
      matched: true,
      rule_code: rule.rule_code,
      rule_id: rule.id,
      classification: rule.classification,
      compte_debit: rule.compte_debit,
      compte_credit: rule.compte_credit,
      libelle,
      requires_validation: rule.requires_validation,
      compliance_flag: rule.compliance_flag,
      legal_warning: rule.legal_warning,
    }
  }

  return { matched: false }
}

/**
 * Détecte si une transaction concerne un dirigeant/associé enregistré.
 * Retourne le nom du dirigeant si match, sinon null.
 */
export function detectDirector(
  tx: BankTransaction,
  directors: Array<{ id: string; nom_complet: string; role: string }>,
): { matched: true; director_id: string; director_name: string; role: string } | null {
  const tiers = (tx.tiers_detecte || '').toLowerCase()
  const lib = (tx.libelle || '').toLowerCase()

  for (const d of directors) {
    const nom = d.nom_complet.toLowerCase()
    if (nom.length < 4) continue

    // Match exact ou substring (ex: "BACH STEPHANE" matche "MR STEPHANE HENRI BACH")
    const nomWords = nom.split(/\s+/).filter(w => w.length > 2)
    const tiersWords = tiers.split(/\s+/).filter(w => w.length > 2)
    // Au moins 2 mots du nom doivent être dans le tiers OU le libellé
    const matchedWords = nomWords.filter(nw =>
      tiersWords.some(tw => tw.startsWith(nw.substring(0, 4)) || nw.startsWith(tw.substring(0, 4))) ||
      lib.includes(nw)
    )
    if (matchedWords.length >= 2 || (nomWords.length === 1 && matchedWords.length === 1)) {
      return {
        matched: true,
        director_id: d.id,
        director_name: d.nom_complet,
        role: d.role,
      }
    }
  }
  return null
}

/**
 * Détermine la sévérité d'une alerte de conformité selon le type.
 */
export function getComplianceSeverity(alertType: string, amount?: number): 'critical' | 'high' | 'medium' | 'low' {
  switch (alertType) {
    case 'director_loan': return 'critical'           // Companies Act s.166
    case 'unbalanced_od': return 'critical'           // OD non équilibrée = comptabilité fausse
    case 'tds_missing': return 'high'                 // Retenue à source manquante
    case 'partial_payment': return amount && amount > 10000 ? 'high' : 'medium'
    case 'period_locked': return 'medium'             // Tentative modif période fermée
    default: return 'low'
  }
}
