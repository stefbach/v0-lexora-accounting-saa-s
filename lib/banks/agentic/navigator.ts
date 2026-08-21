/**
 * lib/banks/agentic/navigator.ts — Orchestrateur observation → décision →
 * action (doc §2.1), avec bascule recette d'abord / IA en secours (doc §1).
 *
 * AUCUN import Playwright ni appel réseau : le navigateur (`BrowserPort`),
 * le fournisseur de décision (`DecisionProvider` — l'appel Claude réel est un
 * câblage ultérieur), le journal d'audit (`AuditSink`) et le stockage de
 * recettes (`RecipeStore`) sont tous INJECTÉS — 100 % testable avec des mocks.
 *
 * Sécurité :
 *  - chaque action passe par guardrails.checkAction AVANT exécution ;
 *    un refus = arrêt immédiat du run (aborted), jamais de contournement ;
 *  - les valeurs saisies dans les champs login/mot de passe/OTP proviennent
 *    EXCLUSIVEMENT des credentials injectés — jamais du texte du modèle ;
 *    seule la recherche de compte accepte une valeur littérale du modèle ;
 *  - bornes dures (étapes max, timeout, budget Decimal) vérifiées à chaque tour.
 */

import Decimal from 'decimal.js'
import { money, type MoneyInput } from '@/lib/money'
import { checkAction, classifyFillTarget } from './guardrails'
import { checkRunBounds, DEFAULT_RUN_BOUNDS, parseDecision, type RunBounds } from './decision'
import {
  recordNewVersion,
  replayRecipe,
  serializeRecipe,
  type ExecutedStep,
  type RecipeStore,
} from './recipes'
import {
  createOtpSession,
  transitionOtpSession,
  type OtpSessionSnapshot,
} from './otp-state'
import type {
  AgenticAction,
  AuditSink,
  BankCredentials,
  BrowserPort,
  ObservedElement,
  PageObservation,
} from './types'

// ─── Dépendances injectées ──────────────────────────────────────────────────

/**
 * Fournisseur de décision : reçoit l'objectif et l'observation, retourne le
 * TEXTE BRUT du modèle (parsé/validé par decision.ts) et le coût de l'appel.
 * L'implémentation réelle (client Anthropic) est hors de ce périmètre.
 */
export type DecisionProvider = (
  objectif: string,
  observation: PageObservation,
) => Promise<{ raw: string; costUsd?: MoneyInput }>

export type NavigatorDeps = {
  browser: BrowserPort
  decide: DecisionProvider
  audit: AuditSink
  recipeStore?: RecipeStore
  /** Horloge injectable pour les tests. */
  now?: () => number
}

export type NavigationParams = {
  runId: string
  societeId: string
  banque: string
  /** Objectif transmis au modèle (ex. « relevé du compte X, période P »). */
  objectif: string
  credentials: BankCredentials
  /** Code OTP déjà reçu (reprise de session), sinon absent. */
  otp?: string
  bounds?: RunBounds
}

export type NavigationOutcome = {
  status: 'done' | 'aborted' | 'failed' | 'awaiting_otp'
  mode: 'recipe' | 'agentic'
  steps: number
  reason?: string
  session: OtpSessionSnapshot
}

// ─── Boucle agentique ───────────────────────────────────────────────────────

function summarizeObservation(observation: PageObservation): string {
  return `${observation.url} — ${observation.elements.length} éléments`
}

/**
 * Boucle observation → décision → action, sous garde-fous et bornes dures.
 * En cas de succès, enregistre une nouvelle version de recette si un
 * `recipeStore` est fourni (apprentissage, doc §2.3).
 */
export async function runAgenticNavigation(
  deps: NavigatorDeps,
  params: NavigationParams,
): Promise<NavigationOutcome> {
  const now = deps.now ?? Date.now
  const bounds = params.bounds ?? DEFAULT_RUN_BOUNDS
  const startedAtMs = now()

  let session = createOtpSession()
  session = transitionOtpSession(session, { type: 'start' }, now()).snapshot

  let steps = 0
  let spentUsd: Decimal = money(0)
  const journey: ExecutedStep[] = []

  const log = (
    entry: Omit<Parameters<AuditSink['record']>[0], 'runId' | 'societeId' | 'mode'>,
  ) =>
    deps.audit.record({
      runId: params.runId,
      societeId: params.societeId,
      mode: 'agentic',
      ...entry,
    })

  const finish = (
    status: NavigationOutcome['status'],
    reason?: string,
  ): NavigationOutcome => ({ status, mode: 'agentic', steps, reason, session })

  for (;;) {
    // 1. Bornes dures AVANT toute nouvelle décision (anti-emballement/coût).
    const boundsCheck = checkRunBounds(bounds, {
      steps,
      startedAtMs,
      nowMs: now(),
      spentUsd,
    })
    if (!boundsCheck.withinBounds) {
      session = transitionOtpSession(session, { type: 'abort', reason: boundsCheck.reason }, now()).snapshot
      await log({
        stepIndex: steps,
        observationResumee: '(bornes du run)',
        decisionModele: null,
        action: null,
        resultat: 'aborted',
        detail: boundsCheck.reason,
      })
      return finish('aborted', boundsCheck.reason)
    }

    // 2. Observation.
    const observation = await deps.browser.observe()

    // 3. Décision du modèle (texte brut), coût cumulé en Decimal.
    const decision = await deps.decide(params.objectif, observation)
    if (decision.costUsd != null) spentUsd = spentUsd.plus(money(decision.costUsd))
    steps++

    // 4. Parsing/validation structurelle.
    const parsed = parseDecision(decision.raw)
    if (!parsed.ok) {
      session = transitionOtpSession(session, { type: 'abort', reason: parsed.error }, now()).snapshot
      await log({
        stepIndex: steps,
        observationResumee: summarizeObservation(observation),
        decisionModele: decision.raw,
        action: parsed.action,
        resultat: 'aborted',
        detail: parsed.error,
      })
      return finish('aborted', parsed.error)
    }
    const action = parsed.action

    // 5. Résolution de l'élément visé dans l'observation courante.
    const element: ObservedElement | null = action.target
      ? observation.elements.find((el) => el.selector === action.target) ?? null
      : null

    // 6. GARDE-FOUS — déterministes, avant toute exécution.
    const verdict = checkAction(action, element, observation.url)
    if (!verdict.allowed) {
      const reason = `${verdict.rule} : ${verdict.reason}`
      session = transitionOtpSession(session, { type: 'abort', reason }, now()).snapshot
      await log({
        stepIndex: steps,
        observationResumee: summarizeObservation(observation),
        decisionModele: decision.raw,
        action,
        resultat: 'blocked',
        detail: reason,
      })
      return finish('aborted', reason)
    }

    // 7. Exécution.
    if (action.type === 'done') {
      session = transitionOtpSession(session, { type: 'complete' }, now()).snapshot
      await log({
        stepIndex: steps,
        observationResumee: summarizeObservation(observation),
        decisionModele: decision.raw,
        action,
        resultat: 'done',
      })
      if (deps.recipeStore) {
        await recordNewVersion(
          deps.recipeStore,
          serializeRecipe(params.banque, params.objectif, journey),
        )
      }
      return finish('done')
    }

    if (action.type === 'abort') {
      session = transitionOtpSession(session, { type: 'abort', reason: action.raison }, now()).snapshot
      await log({
        stepIndex: steps,
        observationResumee: summarizeObservation(observation),
        decisionModele: decision.raw,
        action,
        resultat: 'aborted',
        detail: action.raison,
      })
      return finish('aborted', action.raison)
    }

    if (action.type === 'need_otp') {
      session = transitionOtpSession(session, { type: 'otp_required' }, now()).snapshot
      await log({
        stepIndex: steps,
        observationResumee: summarizeObservation(observation),
        decisionModele: decision.raw,
        action,
        resultat: 'awaiting_otp',
      })
      return finish('awaiting_otp')
    }

    try {
      if (action.type === 'click') {
        await deps.browser.click(action.target as string)
      } else if (action.type === 'press') {
        await deps.browser.press(action.value as string)
      } else if (action.type === 'scroll') {
        await deps.browser.scroll(action.value === 'up' ? 'up' : 'down')
      } else {
        // fill — la valeur vient des credentials injectés, jamais du modèle
        // (sauf recherche de compte). `element` est non-null : garanti par
        // les garde-fous (fill sans élément observé = refus).
        const purpose = classifyFillTarget(element as ObservedElement)
        let value: string
        if (purpose === 'login_username') value = params.credentials.username
        else if (purpose === 'login_password') value = params.credentials.password
        else if (purpose === 'otp') {
          if (!params.otp) {
            // Champ OTP présent mais aucun code disponible → suspension.
            session = transitionOtpSession(session, { type: 'otp_required' }, now()).snapshot
            await log({
              stepIndex: steps,
              observationResumee: summarizeObservation(observation),
              decisionModele: decision.raw,
              action,
              resultat: 'awaiting_otp',
              detail: 'champ OTP sans code disponible',
            })
            return finish('awaiting_otp')
          }
          value = params.otp
        } else {
          value = action.value as string
        }
        await deps.browser.fill(action.target as string, value)
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'erreur navigateur inconnue'
      session = transitionOtpSession(session, { type: 'fail', reason }, now()).snapshot
      await log({
        stepIndex: steps,
        observationResumee: summarizeObservation(observation),
        decisionModele: decision.raw,
        action,
        resultat: 'error',
        detail: reason,
      })
      return finish('failed', reason)
    }

    journey.push({ action, element })
    await log({
      stepIndex: steps,
      observationResumee: summarizeObservation(observation),
      decisionModele: decision.raw,
      action,
      resultat: 'executed',
    })
  }
}

// ─── Routage : recette d'abord, IA en secours (doc §1) ──────────────────────

/**
 * Point d'entrée : rejoue la recette active si elle existe ; toute étape
 * cassée bascule en mode agentique qui répare et réenregistre une nouvelle
 * version. Sans recette, démarre directement en agentique (nouvelle banque).
 */
export async function runNavigation(
  deps: NavigatorDeps,
  params: NavigationParams,
): Promise<NavigationOutcome> {
  const now = deps.now ?? Date.now

  const recipe = deps.recipeStore
    ? await deps.recipeStore.getActive(params.banque, params.objectif)
    : null

  if (recipe) {
    const replay = await replayRecipe(recipe, deps.browser, {
      username: params.credentials.username,
      password: params.credentials.password,
      otp: params.otp,
    })

    let session = createOtpSession()
    session = transitionOtpSession(session, { type: 'start' }, now()).snapshot

    if (replay.status === 'completed') {
      session = transitionOtpSession(session, { type: 'complete' }, now()).snapshot
      await deps.audit.record({
        runId: params.runId,
        societeId: params.societeId,
        stepIndex: replay.stepsExecuted,
        mode: 'recipe',
        observationResumee: `rejeu recette v${recipe.version}`,
        decisionModele: null,
        action: null,
        resultat: 'done',
      })
      return { status: 'done', mode: 'recipe', steps: replay.stepsExecuted, session }
    }

    if (replay.status === 'awaiting_otp') {
      session = transitionOtpSession(session, { type: 'otp_required' }, now()).snapshot
      await deps.audit.record({
        runId: params.runId,
        societeId: params.societeId,
        stepIndex: replay.stepIndex,
        mode: 'recipe',
        observationResumee: `rejeu recette v${recipe.version}`,
        decisionModele: null,
        action: null,
        resultat: 'awaiting_otp',
      })
      return { status: 'awaiting_otp', mode: 'recipe', steps: replay.stepIndex, session }
    }

    if (replay.status === 'blocked') {
      // Une recette qui déclenche un garde-fou est suspecte : arrêt, pas de
      // réparation automatique.
      const reason = `recette v${recipe.version} bloquée à l'étape ${replay.stepIndex} : ${replay.reason}`
      session = transitionOtpSession(session, { type: 'abort', reason }, now()).snapshot
      await deps.audit.record({
        runId: params.runId,
        societeId: params.societeId,
        stepIndex: replay.stepIndex,
        mode: 'recipe',
        observationResumee: `rejeu recette v${recipe.version}`,
        decisionModele: null,
        action: null,
        resultat: 'blocked',
        detail: reason,
      })
      return { status: 'aborted', mode: 'recipe', steps: replay.stepIndex, reason, session }
    }

    // broken → signal de réparation : bascule agentique (nouvelle version
    // enregistrée par runAgenticNavigation en cas de succès).
    await deps.audit.record({
      runId: params.runId,
      societeId: params.societeId,
      stepIndex: replay.stepIndex,
      mode: 'recipe',
      observationResumee: `rejeu recette v${recipe.version}`,
      decisionModele: null,
      action: null,
      resultat: 'error',
      detail: `étape cassée : ${replay.reason} — bascule en mode agentique`,
    })
  }

  return runAgenticNavigation(deps, params)
}
