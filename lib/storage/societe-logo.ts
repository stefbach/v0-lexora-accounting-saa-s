/**
 * Helpers pour le bucket `societes-logos` (mig 242).
 *
 * - Validation MIME / taille en amont des uploads
 * - Génération du path déterministe `<societe_id>/<filename>`
 * - Upload + récupération de l'URL publique
 * - Suppression idempotente
 */

type SupabaseClient = any

export const BUCKET = 'societes-logos'
export const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
export const ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const

export type AllowedMime = (typeof ALLOWED_MIME)[number]

export interface ValidationResult {
  ok: boolean
  error?: string
  ext?: string
}

const EXT_BY_MIME: Record<AllowedMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export function validateLogo(file: { type: string; size: number }): ValidationResult {
  if (!file || !file.type) return { ok: false, error: 'Fichier manquant' }
  if (!ALLOWED_MIME.includes(file.type as AllowedMime)) {
    return {
      ok: false,
      error: `Format non supporté (${file.type}). Acceptés : PNG, JPEG, WebP, SVG.`,
    }
  }
  if (file.size <= 0) return { ok: false, error: 'Fichier vide' }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `Fichier trop volumineux (max ${MAX_BYTES / 1024 / 1024} Mo)` }
  }
  return { ok: true, ext: EXT_BY_MIME[file.type as AllowedMime] }
}

export function logoPath(societe_id: string, ext: string): string {
  // Path déterministe → permet de remplacer le logo sans laisser d'orphelins.
  return `${societe_id}/logo.${ext}`
}

/**
 * Upload du logo dans le bucket et retourne l'URL publique.
 * Supprime les variantes d'extensions précédentes pour garder 1 logo unique.
 */
export async function uploadLogo(
  supabase: SupabaseClient,
  societe_id: string,
  file: { arrayBuffer: () => Promise<ArrayBuffer>; type: string; size: number },
): Promise<{ ok: boolean; url?: string; path?: string; error?: string }> {
  const valid = validateLogo(file)
  if (!valid.ok || !valid.ext) return { ok: false, error: valid.error }

  // Supprime les anciennes variantes (extensions différentes) pour éviter
  // d'avoir 2 fichiers `logo.png` + `logo.jpg` qui traînent.
  await Promise.all(
    Object.values(EXT_BY_MIME)
      .filter((e) => e !== valid.ext)
      .map((e) =>
        supabase.storage.from(BUCKET).remove([logoPath(societe_id, e)]).catch(() => null),
      ),
  )

  const path = logoPath(societe_id, valid.ext)
  const bytes = await file.arrayBuffer()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true, cacheControl: '3600' })
  if (error) return { ok: false, error: error.message }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { ok: true, url: data?.publicUrl, path }
}

/**
 * Supprime toutes les variantes possibles du logo d'une société.
 * Idempotent : pas d'erreur si rien à supprimer.
 */
export async function deleteLogo(
  supabase: SupabaseClient,
  societe_id: string,
): Promise<{ ok: boolean; error?: string }> {
  const paths = Object.values(EXT_BY_MIME).map((e) => logoPath(societe_id, e))
  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
