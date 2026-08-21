/**
 * lib/banks/agentic/types.ts — Types partagés du robot bancaire agentique.
 *
 * Voir docs/roadmap/robot-bancaire-agentique.md. Ces types décrivent la
 * boucle observation → décision → action et les structures échangées entre
 * les modules purs (guardrails, decision, recipes, otp-state, navigator).
 *
 * AUCUNE dépendance à Playwright ni au réseau : le navigateur réel est
 * injecté via l'interface `BrowserPort` (adaptateur écrit ultérieurement).
 */

/** Types d'action que le modèle peut proposer. Tout autre type est rejeté. */
export const AGENTIC_ACTION_TYPES = [
  'click',
  'fill',
  'press',
  'scroll',
  'done',
  'need_otp',
  'abort',
] as const

export type AgenticActionType = (typeof AGENTIC_ACTION_TYPES)[number]

/** Action structurée validée, prête à passer les garde-fous. */
export type AgenticAction = {
  type: AgenticActionType
  /** Sélecteur CSS/texte de l'élément visé (click/fill, parfois press). */
  target?: string
  /** Valeur à saisir (fill) ou touche à presser (press) ou direction (scroll). */
  value?: string
  /** Justification donnée par le modèle — journalisée, jamais exécutée. */
  raison: string
}

/** Élément observé sur la page (extrait du DOM simplifié, pas de HTML brut). */
export type ObservedElement = {
  selector: string
  /** Rôle accessibilité (button, link, textbox…). */
  role?: string
  /** Texte visible / libellé de l'élément. */
  text?: string
  /** Cible de navigation pour les liens. */
  href?: string
  /** Attributs utiles à la classification des champs de saisie. */
  inputType?: string
  name?: string
  id?: string
  placeholder?: string
  ariaLabel?: string
}

/** Observation d'une page à un instant t. */
export type PageObservation = {
  url: string
  title?: string
  elements: ObservedElement[]
}

/**
 * Port navigateur injecté (implémenté par un adaptateur Playwright réel
 * hors de ce périmètre, et par un mock dans les tests).
 */
export type BrowserPort = {
  observe(): Promise<PageObservation>
  click(selector: string): Promise<void>
  fill(selector: string, value: string): Promise<void>
  press(key: string): Promise<void>
  scroll(direction: 'up' | 'down'): Promise<void>
  /** Vérifie qu'un sélecteur est présent — utilisé par le rejeu de recette. */
  exists(selector: string): Promise<boolean>
}

/** Verdict des garde-fous sur une action projetée. */
export type GuardrailVerdict =
  | { allowed: true }
  | { allowed: false; rule: string; reason: string }

/** Entrée du journal d'audit (persistée par un sink injecté). */
export type ActionLogEntry = {
  runId: string
  societeId: string
  stepIndex: number
  mode: 'recipe' | 'agentic'
  observationResumee: string
  /** Décision brute du modèle (texte), avant parsing. */
  decisionModele: string | null
  action: AgenticAction | null
  resultat: 'executed' | 'blocked' | 'error' | 'done' | 'awaiting_otp' | 'aborted'
  detail?: string
}

/** Sink d'audit injecté (Supabase en prod, tableau en tests). */
export type AuditSink = {
  record(entry: ActionLogEntry): Promise<void>
}

/** Identifiants injectés — jamais inventés ni recopiés par le modèle. */
export type BankCredentials = {
  username: string
  password: string
}
