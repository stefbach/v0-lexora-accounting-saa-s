import type { SupabaseClient } from '@supabase/supabase-js'

export class SocieteAccessError extends Error {
  readonly code = 'SOCIETE_ACCESS_DENIED'
  constructor(message = 'Société non accessible') {
    super(message)
    this.name = 'SocieteAccessError'
  }
}

export class ResourceNotFoundError extends Error {
  readonly code = 'RESOURCE_NOT_FOUND'
  constructor(message = 'Ressource introuvable') {
    super(message)
    this.name = 'ResourceNotFoundError'
  }
}

/**
 * Returns the set of societe IDs a user can access via any of the three paths:
 * - user_societes.user_id (explicit linking)
 * - dossiers.client_id (client-of-a-dossier linking)
 * - societes.created_by (user created the société)
 *
 * Must be called with a service-role admin client (RLS is bypassed).
 */
export async function getAccessibleSocieteIds(
  admin: SupabaseClient,
  userId: string,
): Promise<string[]> {
  // Sprint 3 — Inclure les voies COMPTABLES :
  //   - dossiers.comptable_id (le user est comptable du dossier)
  //   - comptable_societes.comptable_id
  //   - societes.comptable_id (lien direct historique)
  //   - cabinet_collaborateurs_acces (collaborateur assigné par dirigeant)
  // Sans ça, un comptable en mode "Acting as" ne peut pas appeler les API
  // /api/client/* car assertSocieteAccess refuse.
  const [
    userSocietesRes, dossiersClientRes, ownedRes,
    dossiersComptableRes, comptableSocietesRes, societesComptableRes,
    cabinetAccesRes,
  ] = await Promise.all([
    admin.from('user_societes').select('societe_id').eq('user_id', userId),
    admin.from('dossiers').select('societe_id').eq('client_id', userId),
    admin.from('societes').select('id').eq('created_by', userId),
    admin.from('dossiers').select('societe_id').eq('comptable_id', userId),
    admin.from('comptable_societes').select('societe_id').eq('comptable_id', userId),
    admin.from('societes').select('id').eq('comptable_id', userId),
    admin.from('cabinet_collaborateurs_acces').select('societe_id').eq('collaborateur_id', userId),
  ])

  const ids = new Set<string>()
  for (const row of userSocietesRes.data ?? []) if (row?.societe_id) ids.add(row.societe_id as string)
  for (const row of dossiersClientRes.data ?? []) if (row?.societe_id) ids.add(row.societe_id as string)
  for (const row of ownedRes.data ?? []) if (row?.id) ids.add(row.id as string)
  for (const row of dossiersComptableRes.data ?? []) if (row?.societe_id) ids.add(row.societe_id as string)
  for (const row of comptableSocietesRes.data ?? []) if (row?.societe_id) ids.add(row.societe_id as string)
  for (const row of societesComptableRes.data ?? []) if (row?.id) ids.add(row.id as string)
  for (const row of cabinetAccesRes.data ?? []) if (row?.societe_id) ids.add(row.societe_id as string)
  return Array.from(ids)
}

/**
 * Throws SocieteAccessError if the user cannot access the given société.
 * Admins and super_admins are always allowed (role looked up from profiles).
 */
export async function assertSocieteAccess(
  admin: SupabaseClient,
  userId: string,
  societeId: string,
): Promise<void> {
  if (!societeId) throw new SocieteAccessError('societe_id manquant')

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  const role = profile?.role ?? ''
  if (['admin', 'super_admin'].includes(role)) return

  const accessible = await getAccessibleSocieteIds(admin, userId)
  if (!accessible.includes(societeId)) {
    throw new SocieteAccessError()
  }
}

/**
 * Fetches the facture, then asserts the caller has access to its société.
 * Throws ResourceNotFoundError if the facture does not exist.
 */
export async function assertFactureAccess(
  admin: SupabaseClient,
  userId: string,
  factureId: string,
): Promise<{ societe_id: string }> {
  if (!factureId) throw new ResourceNotFoundError('facture_id manquant')
  const { data: facture } = await admin
    .from('factures')
    .select('id, societe_id')
    .eq('id', factureId)
    .maybeSingle()
  if (!facture) throw new ResourceNotFoundError('Facture introuvable')
  await assertSocieteAccess(admin, userId, facture.societe_id as string)
  return { societe_id: facture.societe_id as string }
}

/**
 * Fetches the document, then asserts the caller has access to its société
 * (resolved via the linked dossier). Throws ResourceNotFoundError if missing.
 */
export async function assertDocumentAccess(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<{ societe_id: string | null; dossier_id: string | null }> {
  if (!documentId) throw new ResourceNotFoundError('document_id manquant')
  const { data: doc } = await admin
    .from('documents')
    .select('id, dossier_id')
    .eq('id', documentId)
    .maybeSingle()
  if (!doc) throw new ResourceNotFoundError('Document introuvable')

  const dossierId = doc.dossier_id as string | null
  if (!dossierId) {
    // No dossier → we cannot resolve a société. Refuse conservatively.
    throw new SocieteAccessError()
  }

  const { data: dossier } = await admin
    .from('dossiers')
    .select('societe_id')
    .eq('id', dossierId)
    .maybeSingle()
  const societeId = (dossier?.societe_id as string | null) ?? null
  if (!societeId) throw new SocieteAccessError()

  await assertSocieteAccess(admin, userId, societeId)
  return { societe_id: societeId, dossier_id: dossierId }
}

/**
 * Helper for route handlers: convert a SocieteAccessError / ResourceNotFoundError
 * into a structured error tuple. Returns null if the error is of another kind.
 */
export function mapSocieteAccessError(
  err: unknown,
): { status: number; body: { error: string } } | null {
  if (err instanceof SocieteAccessError) {
    return { status: 403, body: { error: 'Accès refusé' } }
  }
  if (err instanceof ResourceNotFoundError) {
    return { status: 404, body: { error: err.message } }
  }
  return null
}
