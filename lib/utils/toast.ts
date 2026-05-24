/**
 * Helpers de notifications toast unifiés pour Lexora.
 *
 * Convention :
 * - `notifySuccess(action)` : action réussie (ex. "Enregistrer", "Supprimer").
 * - `notifyError(action, err)` : erreur lors d'une action, avec message d'erreur formaté.
 * - `notifyWarning(message)` : avertissement ou information non-critique.
 *
 * Toujours utiliser des verbes à l'infinitif en français pour `action`
 * ("Enregistrer", "Supprimer", "Envoyer", "Mettre à jour"...).
 */

import { toast } from "sonner"

export function notifySuccess(action: string): void {
  toast.success(action)
}

export function notifyError(action: string, err?: unknown): void {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Erreur inconnue"
  toast.error(`${action} : ${msg}`)
}

export function notifyWarning(message: string): void {
  toast.warning(message)
}
