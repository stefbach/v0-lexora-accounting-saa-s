/**
 * lib/banks/agentic/decision.ts — Parsing et validation de la décision du
 * modèle IA (doc §2.1).
 *
 * AUCUN appel réseau ici : ce module prend le TEXTE BRUT retourné par le
 * modèle et retourne une action structurée validée, ou `abort` si le JSON est
 * malformé, l'action inconnue ou la cible manquante. Il applique aussi les
 * bornes dures anti-emballement (étapes max, timeout, budget) — le budget est
 * comparé en Decimal (lib/money.ts), jamais en flottant natif.
 */

import Decimal from 'decimal.js'
import { money, type MoneyInput } from '@/lib/money'
import { AGENTIC_ACTION_TYPES, type AgenticAction, type AgenticActionType } from './types'

// ─── Parsing de la décision ─────────────────────────────────────────────────

export type DecisionParseResult =
  | { ok: true; action: AgenticAction }
  | { ok: false; error: string; action: AgenticAction /* abort de repli */ }

function abortResult(error: string): DecisionParseResult {
  return {
    ok: false,
    error,
    action: { type: 'abort', raison: `Décision invalide : ${error}` },
  }
}

const ACTION_TYPE_SET: ReadonlySet<string> = new Set(AGENTIC_ACTION_TYPES)

/** Actions qui exigent une cible (`target`). */
const TARGET_REQUIRED: ReadonlySet<AgenticActionType> = new Set(['click', 'fill'])
/** Actions qui exigent une valeur (`value`). */
const VALUE_REQUIRED: ReadonlySet<AgenticActionType> = new Set(['fill', 'press'])

/**
 * Extrait le premier objet JSON équilibré d'un texte (le modèle enrobe parfois
 * sa réponse de markdown ```json … ``` ou de prose).
 */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return raw.slice(start, i + 1)
    }
  }
  return null
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Parse le texte brut du modèle en action structurée validée.
 * Toute anomalie → `{ ok: false }` avec une action `abort` de repli, à
 * journaliser puis exécuter (l'abort arrête le run proprement).
 */
export function parseDecision(raw: string): DecisionParseResult {
  const jsonText = extractJsonObject(raw)
  if (!jsonText) return abortResult('aucun objet JSON trouvé dans la réponse du modèle')

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    return abortResult(`JSON malformé (${e instanceof Error ? e.message : 'erreur de parsing'})`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return abortResult('la décision doit être un objet JSON')
  }

  const record = parsed as Record<string, unknown>
  const type = asTrimmedString(record.type)?.toLowerCase() ?? null
  if (!type || !ACTION_TYPE_SET.has(type)) {
    return abortResult(`type d'action inconnu : « ${record.type ?? '(absent)'} »`)
  }
  const actionType = type as AgenticActionType

  const target = asTrimmedString(record.target)
  if (TARGET_REQUIRED.has(actionType) && !target) {
    return abortResult(`cible (target) manquante pour l'action « ${actionType} »`)
  }

  const value = asTrimmedString(record.value)
  if (VALUE_REQUIRED.has(actionType) && !value) {
    return abortResult(`valeur (value) manquante pour l'action « ${actionType} »`)
  }

  const raison = asTrimmedString(record.raison) ?? asTrimmedString(record.reason) ?? '(non fournie)'

  const action: AgenticAction = { type: actionType, raison }
  if (target) action.target = target
  if (value !== null) action.value = value
  return { ok: true, action }
}

// ─── Bornes dures du run ────────────────────────────────────────────────────

export type RunBounds = {
  /** Nombre maximal d'étapes (décisions) par run. */
  maxSteps: number
  /** Durée maximale du run en millisecondes. */
  timeoutMs: number
  /** Budget IA maximal du run en USD (string/Decimal — jamais de flottant en calcul). */
  budgetUsd?: MoneyInput
}

export type RunProgress = {
  /** Étapes déjà exécutées. */
  steps: number
  /** Timestamp epoch ms du début de run. */
  startedAtMs: number
  /** Timestamp epoch ms courant. */
  nowMs: number
  /** Coût IA déjà dépensé en USD. */
  spentUsd?: MoneyInput
}

export type BoundsCheck = { withinBounds: true } | { withinBounds: false; reason: string }

/** Bornes par défaut, volontairement conservatrices. */
export const DEFAULT_RUN_BOUNDS: RunBounds = {
  maxSteps: 40,
  timeoutMs: 5 * 60 * 1000,
  budgetUsd: '2.00',
}

/**
 * Vérifie les bornes anti-emballement / anti-coût AVANT chaque nouvelle
 * décision. Dépassement → abort propre côté navigator.
 */
export function checkRunBounds(bounds: RunBounds, progress: RunProgress): BoundsCheck {
  if (progress.steps >= bounds.maxSteps) {
    return { withinBounds: false, reason: `nombre maximal d'étapes atteint (${bounds.maxSteps})` }
  }
  const elapsed = progress.nowMs - progress.startedAtMs
  if (elapsed >= bounds.timeoutMs) {
    return { withinBounds: false, reason: `timeout global du run atteint (${bounds.timeoutMs} ms)` }
  }
  if (bounds.budgetUsd != null) {
    const budget: Decimal = money(bounds.budgetUsd)
    const spent: Decimal = money(progress.spentUsd ?? 0)
    if (spent.greaterThanOrEqualTo(budget)) {
      return { withinBounds: false, reason: `budget IA du run épuisé (${budget.toFixed(2)} USD)` }
    }
  }
  return { withinBounds: true }
}
