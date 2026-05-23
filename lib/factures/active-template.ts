/**
 * Helpers partagés pour le template de facture actif.
 *
 * Source de vérité : `societes.facture_template_id` (DB, mig 287).
 * Lu via `useSocieteActive().societe.facture_template_id` côté client.
 *
 * Format de l'identifiant côté client :
 *   - "standard" / "professional" / "minimal"   → templates hardcoded
 *   - "ai-<uuid>"                                → template IA persisté en DB
 *
 * Note : on ne cache PAS dans localStorage. Le store local est partagé
 * entre toutes les sociétés du navigateur et faisait fuir le template
 * d'une société dans la suivante (bug observé : logo OCC sur DDS).
 */

export const AI_TEMPLATE_PREFIX = 'ai-'

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
