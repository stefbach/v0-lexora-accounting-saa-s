/**
 * Calcul d'une clé stable pour identifier une alerte rule-based entre
 * plusieurs runs du générateur /api/client/alertes et persister son état
 * (lu/archivé/acknowledged) dans la table `alertes_user_state`.
 *
 * Règles :
 *   - Même input → même sortie (pas de timestamp, pas de random).
 *   - Format lisible : `{type}_{societe}_{periode}_{detail}`.
 *     Les segments vides sont représentés par "_" pour garder la structure.
 *   - Slug ASCII-safe, longueur bornée.
 *
 * Cette fonction est la SEULE source de vérité : elle est appelée côté
 * API (générateur d'alertes) et renvoyée telle quelle au frontend.
 * Le frontend ne recalcule JAMAIS la clé.
 */

export type AlerteType =
  | 'facture_retard'
  | 'facture_en_attente'
  | 'tva_deadline'
  | 'document_erreur'
  | 'tresorerie_critique'
  | 'tresorerie_surveillance'
  | 'doc_manquant'

export interface AlerteKeyInput {
  type: AlerteType
  societeId?: string | null
  periode?: string | null // ex "2026-04" ou "2026-04-20"
  detail?: string | null // identifiant spécifique (numéro facture, type doc, etc.)
}

/**
 * Slugify minimal : lowercase, ASCII, alphanum + tirets, tronque à 60 chars.
 * Volontairement simple — la collision est gérée par le préfixe `type_societe_periode`.
 */
function slug(input: string): string {
  return input
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function computeAlerteKey(input: AlerteKeyInput): string {
  const societe = input.societeId ? slug(input.societeId) : '_'
  const periode = input.periode ? slug(input.periode) : '_'
  const detail = input.detail ? slug(input.detail) : '_'
  return `${input.type}_${societe}_${periode}_${detail}`
}
