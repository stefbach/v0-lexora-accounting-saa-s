import {
  validateFactureExtraction,
  validateReleveBancaireExtraction,
} from '@/lib/ai/validation-rules'

export interface FieldConfidence {
  field: string
  score: number
  reason?: string
}

export interface GranularConfidence {
  global: number
  fields: FieldConfidence[]
  validation_issues_count: number
  auto_decision: 'auto_approve' | 'quick_review' | 'full_review' | 'reject'
}

const FACTURE_FIELDS: ReadonlyArray<{
  key: string
  aliases: string[]
  weight: number
}> = [
  { key: 'emetteur', aliases: ['fournisseur', 'client', 'emetteur', 'tiers'], weight: 15 },
  { key: 'numero', aliases: ['numero_facture', 'numero_reference'], weight: 15 },
  { key: 'date', aliases: ['date_facture', 'date_document'], weight: 15 },
  { key: 'montant_ht', aliases: ['montant_ht'], weight: 15 },
  { key: 'montant_tva', aliases: ['montant_tva', 'tva'], weight: 15 },
  { key: 'montant_ttc', aliases: ['montant_ttc'], weight: 15 },
  { key: 'devise', aliases: ['devise'], weight: 10 },
]

const RELEVE_FIELDS: ReadonlyArray<{
  key: string
  aliases: string[]
  weight: number
}> = [
  { key: 'numero_compte', aliases: ['numero_compte', 'iban'], weight: 20 },
  { key: 'periode', aliases: ['periode_debut'], weight: 20 },
  { key: 'solde_ouverture', aliases: ['solde_ouverture', 'solde_debut'], weight: 20 },
  { key: 'solde_cloture', aliases: ['solde_cloture', 'solde_fin'], weight: 20 },
  { key: 'transactions', aliases: ['lignes', 'transactions'], weight: 20 },
]

function hasMeaningfulValue(val: unknown): boolean {
  if (val == null) return false
  if (typeof val === 'string') return val.trim().length > 0
  if (typeof val === 'number') return Number.isFinite(val)
  if (Array.isArray(val)) return val.length > 0
  if (typeof val === 'object') return Object.keys(val as Record<string, unknown>).length > 0
  return Boolean(val)
}

function pickAlias(
  extraction: Record<string, unknown>,
  aliases: string[]
): { present: boolean; value: unknown } {
  for (const a of aliases) {
    if (hasMeaningfulValue(extraction[a])) {
      return { present: true, value: extraction[a] }
    }
  }
  return { present: false, value: undefined }
}

function isFactureType(documentType: string): boolean {
  const t = documentType.toLowerCase()
  return t.includes('facture')
}

function isReleveType(documentType: string): boolean {
  const t = documentType.toLowerCase()
  return t.includes('releve') || t.includes('bancaire') || t.includes('bank')
}

export function decideWorkflowAction(
  score: number
): 'auto_approve' | 'quick_review' | 'full_review' | 'reject' {
  if (score >= 85) return 'auto_approve'
  if (score >= 70) return 'quick_review'
  if (score >= 50) return 'full_review'
  return 'reject'
}

export function computeGranularConfidence(
  extraction: Record<string, unknown>,
  documentType: string,
  validationIssuesCount?: number
): GranularConfidence {
  const fields: FieldConfidence[] = []

  if (!extraction || Object.keys(extraction).length === 0) {
    return {
      global: 0,
      fields: [],
      validation_issues_count: validationIssuesCount ?? 0,
      auto_decision: 'reject',
    }
  }

  const isFacture = isFactureType(documentType)
  const isReleve = isReleveType(documentType)

  let rawScore = 0
  let penalty = 0
  let validation
  let issuesCount = validationIssuesCount ?? 0

  if (isFacture) {
    validation = validateFactureExtraction(extraction)
  } else if (isReleve) {
    validation = validateReleveBancaireExtraction(extraction)
  }

  if (validation) {
    penalty += validation.confidence_penalty
    if (validationIssuesCount == null) {
      issuesCount = validation.issues.length
    }
  }

  const invalidFields = new Set<string>()
  if (validation) {
    for (const issue of validation.issues) {
      if (issue.severity === 'error' || issue.severity === 'warning') {
        invalidFields.add(issue.field)
      }
    }
  }

  const schema = isFacture ? FACTURE_FIELDS : isReleve ? RELEVE_FIELDS : null

  if (schema) {
    for (const f of schema) {
      const found = pickAlias(extraction, f.aliases)
      const hasIssue = f.aliases.some((a) => invalidFields.has(a)) ||
        invalidFields.has(f.key)

      if (found.present && !hasIssue) {
        rawScore += f.weight
        fields.push({ field: f.key, score: f.weight, reason: 'present + valide' })
      } else if (found.present && hasIssue) {
        const partial = Math.round(f.weight * 0.3)
        rawScore += partial
        fields.push({
          field: f.key,
          score: partial,
          reason: 'présent mais incohérent',
        })
      } else {
        fields.push({ field: f.key, score: 0, reason: 'absent' })
        penalty += Math.round(f.weight * 0.5)
      }
    }
  } else {
    const keys = Object.keys(extraction)
    const filled = keys.filter((k) => hasMeaningfulValue(extraction[k])).length
    const ratio = keys.length > 0 ? filled / keys.length : 0
    rawScore = Math.round(ratio * 60)
    fields.push({
      field: 'generic',
      score: rawScore,
      reason: `${filled}/${keys.length} champs renseignés`,
    })
  }

  const global = Math.max(0, Math.min(100, rawScore - penalty))

  return {
    global,
    fields,
    validation_issues_count: issuesCount,
    auto_decision: decideWorkflowAction(global),
  }
}
