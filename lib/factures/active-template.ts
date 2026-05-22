/**
 * Helpers partagés pour le template de facture actif côté client.
 *
 * Source de vérité : `societes.facture_template_id` (DB, mig 287).
 * Cache navigateur : `localStorage["lexora_invoice_template"]`.
 *
 * Le store local est lu en synchrone (au render) ; la valeur DB est
 * hydratée par /api/client/societes au chargement de facturation-settings
 * et propagée à localStorage à la sauvegarde.
 *
 * Format de l'identifiant côté client :
 *   - "standard" / "professional" / "minimal"   → templates hardcoded
 *   - "ai-<uuid>"                                → template IA persisté en DB
 */

export const AI_TEMPLATE_PREFIX = 'ai-'
export const ACTIVE_TEMPLATE_LS_KEY = 'lexora_invoice_template'

export function toAiTemplateId(uuid: string): string {
  return `${AI_TEMPLATE_PREFIX}${uuid}`
}

/** Renvoie l'UUID du template IA, ou null si l'identifiant pointe vers un template hardcoded. */
export function parseAiTemplateId(selected: string | null | undefined): string | null {
  if (!selected) return null
  return selected.startsWith(AI_TEMPLATE_PREFIX)
    ? selected.slice(AI_TEMPLATE_PREFIX.length)
    : null
}

/** Lecture safe côté browser : retourne null en SSR ou si la clé est absente. */
export function readActiveTemplateFromStorage(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(ACTIVE_TEMPLATE_LS_KEY)
  } catch {
    return null
  }
}

/** Lecture spécifique : ne renvoie que l'UUID si template IA, sinon null. */
export function readActiveAiTemplateIdFromStorage(): string | null {
  return parseAiTemplateId(readActiveTemplateFromStorage())
}
