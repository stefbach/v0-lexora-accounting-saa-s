/**
 * lib/banks/agentic/recipes.ts — Moteur de recettes (doc §2.3).
 *
 * Un parcours agentique réussi est sérialisé en RECETTE : séquence d'actions
 * rejouables sans IA. Les runs suivants rejouent la recette (rapide, coût ~0,
 * déterministe). Si une étape casse (sélecteur introuvable), le rejeu s'arrête
 * avec un signal de réparation → le mode agentique répare et enregistre une
 * NOUVELLE VERSION (l'ancienne est conservée pour rollback/diagnostic).
 *
 * Logique pure : le stockage (bank_scrape_recipes) est injecté via
 * `RecipeStore`. SÉCURITÉ : les valeurs sensibles (login, mot de passe, OTP)
 * ne sont JAMAIS sérialisées — la recette stocke une référence de credential
 * (`credentialRef`), résolue à l'exécution. Le rejeu repasse par les
 * guardrails à chaque étape.
 */

import { checkAction, classifyFillTarget } from './guardrails'
import type { AgenticAction, BrowserPort, ObservedElement } from './types'

// ─── Types de recette ───────────────────────────────────────────────────────

/** Référence de valeur résolue à l'exécution — jamais de secret en clair. */
export type CredentialRef = 'username' | 'password' | 'otp'

export type RecipeStep = {
  type: 'click' | 'fill' | 'press' | 'scroll'
  /** Sélecteur principal (click/fill). */
  selector?: string
  /** Sélecteurs de repli si le principal a disparu. */
  fallbackSelectors?: string[]
  /** Valeur littérale (recherche, touche, direction) — jamais un secret. */
  value?: string
  /** Pour fill sensible : référence de credential résolue à l'exécution. */
  credentialRef?: CredentialRef
}

export type Recipe = {
  id?: string
  banque: string
  objectif: string
  version: number
  actions: RecipeStep[]
  actif: boolean
}

export type RecipeDraft = Omit<Recipe, 'version' | 'actif' | 'id'>

/** Port de stockage injecté (Supabase en prod, in-memory dans les tests). */
export type RecipeStore = {
  /** Recette active pour (banque, objectif), ou null. */
  getActive(banque: string, objectif: string): Promise<Recipe | null>
  /** Toutes les versions pour (banque, objectif), plus récentes incluses. */
  listVersions(banque: string, objectif: string): Promise<Recipe[]>
  /** Insère une recette (nouvelle version). Ne modifie jamais une existante. */
  insert(recipe: Recipe): Promise<Recipe>
  /** Change quelle version est active — sans supprimer les autres. */
  setActiveVersion(banque: string, objectif: string, version: number): Promise<void>
}

// ─── Sérialisation d'un parcours réussi ─────────────────────────────────────

/** Une étape exécutée lors d'un run agentique réussi, avec son élément observé. */
export type ExecutedStep = {
  action: AgenticAction
  element: ObservedElement | null
}

/**
 * Sérialise un parcours agentique réussi en brouillon de recette :
 *  - ne conserve que les actions exécutables (click/fill/press/scroll) ;
 *  - pour un fill sensible (login/mot de passe/OTP), remplace la valeur par
 *    une `credentialRef` — le secret n'est jamais écrit dans la recette ;
 *  - un fill de recherche garde sa valeur littérale.
 */
export function serializeRecipe(
  banque: string,
  objectif: string,
  journey: ExecutedStep[],
): RecipeDraft {
  const actions: RecipeStep[] = []
  for (const { action, element } of journey) {
    switch (action.type) {
      case 'click':
        actions.push({ type: 'click', selector: element?.selector ?? action.target })
        break
      case 'press':
        actions.push({ type: 'press', value: action.value })
        break
      case 'scroll':
        actions.push({ type: 'scroll', value: action.value ?? 'down' })
        break
      case 'fill': {
        const selector = element?.selector ?? action.target
        const purpose = element ? classifyFillTarget(element) : null
        if (purpose === 'login_username') {
          actions.push({ type: 'fill', selector, credentialRef: 'username' })
        } else if (purpose === 'login_password') {
          actions.push({ type: 'fill', selector, credentialRef: 'password' })
        } else if (purpose === 'otp') {
          actions.push({ type: 'fill', selector, credentialRef: 'otp' })
        } else {
          // account_search : valeur littérale non sensible.
          actions.push({ type: 'fill', selector, value: action.value })
        }
        break
      }
      default:
        // done / need_otp / abort : états de contrôle, pas des étapes rejouables.
        break
    }
  }
  return { banque, objectif, actions }
}

// ─── Versionnement ──────────────────────────────────────────────────────────

/**
 * Enregistre une nouvelle version de recette : version = max existante + 1,
 * activée ; les versions antérieures sont conservées (rollback/diagnostic).
 */
export async function recordNewVersion(store: RecipeStore, draft: RecipeDraft): Promise<Recipe> {
  const versions = await store.listVersions(draft.banque, draft.objectif)
  const nextVersion = versions.reduce((max, r) => Math.max(max, r.version), 0) + 1
  const recipe = await store.insert({ ...draft, version: nextVersion, actif: true })
  await store.setActiveVersion(draft.banque, draft.objectif, nextVersion)
  return recipe
}

/** Rollback explicite vers une version antérieure existante. */
export async function rollbackToVersion(
  store: RecipeStore,
  banque: string,
  objectif: string,
  version: number,
): Promise<Recipe> {
  const versions = await store.listVersions(banque, objectif)
  const target = versions.find((r) => r.version === version)
  if (!target) {
    throw new Error(`Rollback impossible : version ${version} introuvable pour ${banque}/${objectif}`)
  }
  await store.setActiveVersion(banque, objectif, version)
  return { ...target, actif: true }
}

// ─── Rejeu déterministe ─────────────────────────────────────────────────────

export type ReplayCredentials = {
  username: string
  password: string
  /** Code OTP courant, si déjà reçu. Absent → l'étape OTP signale awaiting_otp. */
  otp?: string
}

export type ReplayResult =
  | { status: 'completed'; stepsExecuted: number }
  /** Étape cassée → signal de réparation pour le mode agentique. */
  | { status: 'broken'; stepIndex: number; reason: string }
  /** Étape refusée par les garde-fous → run à arrêter, recette suspecte. */
  | { status: 'blocked'; stepIndex: number; reason: string }
  /** Étape OTP atteinte sans code disponible. */
  | { status: 'awaiting_otp'; stepIndex: number }

/** Convertit une étape de recette en action pour le filtre guardrails. */
function stepToAction(step: RecipeStep, value?: string): AgenticAction {
  return {
    type: step.type,
    target: step.selector,
    value,
    raison: 'rejeu de recette',
  }
}

/**
 * Rejoue une recette étape par étape sur le navigateur injecté.
 *  - Sélecteur principal introuvable → essaie les sélecteurs de repli ;
 *    tous absents → `broken` (signal de réparation, doc §2.3).
 *  - Chaque action repasse par `checkAction` (les garde-fous s'appliquent
 *    aussi au rejeu, doc §2.2) → refus = `blocked`.
 *  - Étape `credentialRef: 'otp'` sans code fourni → `awaiting_otp`.
 */
export async function replayRecipe(
  recipe: Recipe,
  browser: BrowserPort,
  credentials: ReplayCredentials,
): Promise<ReplayResult> {
  for (let i = 0; i < recipe.actions.length; i++) {
    const step = recipe.actions[i]

    // 1. Résolution du sélecteur (principal puis replis).
    let selector: string | null = null
    if (step.type === 'click' || step.type === 'fill') {
      const candidates = [step.selector, ...(step.fallbackSelectors ?? [])].filter(
        (s): s is string => Boolean(s),
      )
      if (candidates.length === 0) {
        return { status: 'broken', stepIndex: i, reason: 'étape sans sélecteur' }
      }
      for (const candidate of candidates) {
        if (await browser.exists(candidate)) {
          selector = candidate
          break
        }
      }
      if (!selector) {
        return {
          status: 'broken',
          stepIndex: i,
          reason: `sélecteur introuvable (essayés : ${candidates.join(', ')})`,
        }
      }
    }

    // 2. Résolution de la valeur (secrets injectés à l'exécution seulement).
    let value = step.value
    if (step.type === 'fill' && step.credentialRef) {
      if (step.credentialRef === 'username') value = credentials.username
      else if (step.credentialRef === 'password') value = credentials.password
      else {
        if (!credentials.otp) return { status: 'awaiting_otp', stepIndex: i }
        value = credentials.otp
      }
    }

    // 3. Garde-fous — sur l'observation FRAÎCHE de l'élément visé.
    const observation = await browser.observe()
    const element = selector
      ? observation.elements.find((el) => el.selector === selector) ?? null
      : null
    if ((step.type === 'click' || step.type === 'fill') && !element) {
      return {
        status: 'broken',
        stepIndex: i,
        reason: `élément « ${selector} » présent mais absent de l'observation`,
      }
    }
    const verdict = checkAction(stepToAction(step, value), element, observation.url)
    if (!verdict.allowed) {
      return { status: 'blocked', stepIndex: i, reason: `${verdict.rule} : ${verdict.reason}` }
    }

    // 4. Exécution.
    try {
      if (step.type === 'click') await browser.click(selector as string)
      else if (step.type === 'fill') await browser.fill(selector as string, value ?? '')
      else if (step.type === 'press') await browser.press(step.value ?? '')
      else await browser.scroll(step.value === 'up' ? 'up' : 'down')
    } catch (e) {
      return {
        status: 'broken',
        stepIndex: i,
        reason: `échec d'exécution : ${e instanceof Error ? e.message : 'erreur inconnue'}`,
      }
    }
  }
  return { status: 'completed', stepsExecuted: recipe.actions.length }
}
