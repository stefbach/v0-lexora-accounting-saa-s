/**
 * Cascade hard-delete helpers for admin-only purges.
 *
 * Three entity types are supported:
 *   - 'facture'  : factures + lignes + paiements + écritures comptables liées
 *   - 'banque'   : écriture banque (journal BNQ/BQ) + sa contrepartie (même ref_folio)
 *                  + lettrage (set NULL sur lettre des écritures encore présentes)
 *   - 'document' : storage file + ligne documents + références cross-table
 *
 * Toutes les fonctions :
 *   - exigent un client Supabase ADMIN (service role, RLS bypass)
 *   - vérifient explicitement que chaque id appartient bien à `societe_id`
 *     (sinon un admin d'une autre société pourrait wiper la mauvaise cible)
 *   - logguent dans audit_trail avant chaque DELETE
 *   - retournent un rapport détaillé (ids deleted / failed / stats par table)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type CascadeDeleteType = 'facture' | 'banque' | 'document'

export interface CascadeDeleteInput {
  type: CascadeDeleteType
  ids: string[]
  societe_id: string
}

export interface CascadeDeleteReport {
  type: CascadeDeleteType
  societe_id: string
  requested: number
  deleted_ids: string[]
  failed: Array<{ id: string; error: string }>
  cascade_counts: Record<string, number>
}

export interface AuditContext {
  user_id: string
  user_email: string | null
  user_role: string | null
  ip_address?: string | null
  user_agent?: string | null
}

const MAX_BATCH = 500

async function logAudit(
  admin: SupabaseClient,
  ctx: AuditContext,
  table_name: string,
  row_id: string,
  old_values: Record<string, unknown>,
  description: string,
) {
  // Best-effort: audit_trail est partitionné (mig 403). Si l'écriture échoue
  // (partition manquante pour la date courante), on log mais on ne bloque pas
  // la suppression — la cohérence DB prime sur la traçabilité.
  const { error } = await admin.from('audit_trail').insert({
    user_id: ctx.user_id,
    user_email: ctx.user_email,
    user_role: ctx.user_role,
    action: 'DELETE',
    table_name,
    row_id,
    old_values,
    ip_address: ctx.ip_address ?? null,
    user_agent: ctx.user_agent ?? null,
    description,
  })
  if (error) console.warn(`[cascade-delete] audit_trail insert failed: ${error.message}`)
}

/** Filtre les ids à ceux qui appartiennent bien à la société visée. */
async function scopeIdsToSociete(
  admin: SupabaseClient,
  table: string,
  ids: string[],
  societe_id: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from(table)
    .select('id')
    .in('id', ids)
    .eq('societe_id', societe_id)
  if (error) throw new Error(`scopeIdsToSociete(${table}): ${error.message}`)
  return (data || []).map((r: { id: string }) => r.id)
}

/* ─────────────────────────────────────────────────────────── FACTURES ── */

async function cascadeFactures(
  admin: SupabaseClient,
  ids: string[],
  societe_id: string,
  ctx: AuditContext,
): Promise<CascadeDeleteReport> {
  const scopedIds = await scopeIdsToSociete(admin, 'factures', ids, societe_id)
  const counts: Record<string, number> = {}
  const failed: Array<{ id: string; error: string }> = []

  if (scopedIds.length === 0) {
    return {
      type: 'facture', societe_id, requested: ids.length,
      deleted_ids: [], failed: ids.map(id => ({ id, error: 'Hors périmètre société' })),
      cascade_counts: {},
    }
  }

  // Snapshot avant DELETE pour audit
  const { data: snapshot } = await admin
    .from('factures').select('*').in('id', scopedIds)
  const snapById = new Map<string, Record<string, unknown>>()
  for (const row of snapshot || []) snapById.set(row.id as string, row)

  for (const id of scopedIds) {
    const old = snapById.get(id) || { id }
    await logAudit(admin, ctx, 'factures', id, old,
      `Cascade hard-delete facture ${(old as { numero_facture?: string }).numero_facture || id}`)
  }

  // Tables filles potentielles. Toutes ont une FK vers factures.id.
  // On les supprime AVANT factures (sinon FK error) :
  const childTables: Array<{ table: string; field: string }> = [
    { table: 'factures_lignes',     field: 'facture_id' },
    { table: 'factures_contacts',   field: 'facture_id' },
    { table: 'factures_catalogue',  field: 'facture_id' },
    { table: 'paiements',           field: 'facture_id' },
    // ecritures_comptables_v2.facture_id est ON DELETE SET NULL (mig 133),
    // donc on peut soit laisser SET NULL soit DELETE explicitement. On
    // DELETE explicitement pour rester cohérent avec le "hard cascade" :
    // sans les écritures liées, la facture n'a aucune trace comptable.
    { table: 'ecritures_comptables_v2', field: 'facture_id' },
  ]

  for (const { table, field } of childTables) {
    const { count, error } = await admin
      .from(table)
      .delete({ count: 'exact' })
      .in(field, scopedIds)
    if (error) {
      // Table inexistante = pas grave (warn). Autre erreur = abort.
      const isMissingTable = /relation .* does not exist/i.test(error.message)
      if (isMissingTable) continue
      throw new Error(`cascade delete ${table}.${field}: ${error.message}`)
    }
    counts[table] = (counts[table] || 0) + (count || 0)
  }

  const { count: factCount, error: factErr } = await admin
    .from('factures').delete({ count: 'exact' }).in('id', scopedIds)
  if (factErr) throw new Error(`delete factures: ${factErr.message}`)
  counts['factures'] = factCount || 0

  const deletedIds = scopedIds
  for (const id of ids) {
    if (!scopedIds.includes(id)) failed.push({ id, error: 'Hors périmètre société' })
  }

  return {
    type: 'facture', societe_id, requested: ids.length,
    deleted_ids: deletedIds, failed, cascade_counts: counts,
  }
}

/* ───────────────────────────────────────────────────────────── BANQUE ── */

async function cascadeBanque(
  admin: SupabaseClient,
  ids: string[],
  societe_id: string,
  ctx: AuditContext,
): Promise<CascadeDeleteReport> {
  // Une "transaction banque" = une (ou deux) lignes dans ecritures_comptables_v2
  // avec journal IN ('BNQ', 'BQ'). On accepte aussi l'id d'une transaction de la
  // table de staging transactions_bancaires (si elle existe) en plus.
  const scopedIds = await scopeIdsToSociete(admin, 'ecritures_comptables_v2', ids, societe_id)
  const counts: Record<string, number> = {}
  const failed: Array<{ id: string; error: string }> = []

  if (scopedIds.length === 0) {
    return {
      type: 'banque', societe_id, requested: ids.length,
      deleted_ids: [], failed: ids.map(id => ({ id, error: 'Hors périmètre société ou pas une écriture' })),
      cascade_counts: {},
    }
  }

  // Snapshot complet pour audit + récupération des ref_folio (pour étendre
  // la suppression à la contrepartie : un paiement crée 2 lignes avec même
  // ref_folio — supprimer une seule ligne casse l'équilibre).
  const { data: snapshot } = await admin
    .from('ecritures_comptables_v2')
    .select('id, journal, ref_folio, facture_id, document_id, lettre, debit_mur, credit_mur')
    .in('id', scopedIds)

  if (!snapshot || snapshot.length === 0) {
    return { type: 'banque', societe_id, requested: ids.length, deleted_ids: [], failed, cascade_counts: counts }
  }

  // Vérifier que toutes les lignes ciblées sont bien des écritures banque
  const nonBnq = snapshot.filter(r => !['BNQ', 'BQ', 'BANK'].includes((r.journal || '').toUpperCase()))
  if (nonBnq.length > 0) {
    return {
      type: 'banque', societe_id, requested: ids.length, deleted_ids: [], cascade_counts: {},
      failed: nonBnq.map(r => ({ id: r.id, error: `Pas une écriture banque (journal=${r.journal})` })),
    }
  }

  // Étendre aux contreparties via ref_folio (même lot) — UNIQUEMENT dans les
  // journaux banque. Sans ce filtre, une écriture OD-PAIE / AN / VTE / ACH qui
  // partagerait un ref_folio (cas typique : ref_folio = "BP-{uuid}" porté par
  // l'OD-PAIE de la charge salariale ET le BNQ du paiement du salaire) serait
  // wipée par effet de bord — c'est exactement le bug du 2026-05-23 sur la
  // société 1826dde7-7b41-4d14-bc75-d8d22dfc75fb (2025 écritures OD-PAIE
  // supprimées involontairement).
  const refFolios = [...new Set(snapshot.map(r => r.ref_folio).filter(Boolean) as string[])]
  let counterparts: Array<{ id: string; lettre: string | null }> = []
  if (refFolios.length > 0) {
    const { data: cp } = await admin
      .from('ecritures_comptables_v2')
      .select('id, lettre')
      .eq('societe_id', societe_id)
      .in('ref_folio', refFolios)
      .in('journal', ['BNQ', 'BQ', 'BANK'])
    counterparts = cp || []
  }
  const allEcritureIds = [...new Set([...scopedIds, ...counterparts.map(c => c.id)])]

  // Audit log pour chaque ligne ciblée
  for (const row of snapshot) {
    await logAudit(admin, ctx, 'ecritures_comptables_v2', row.id, row as Record<string, unknown>,
      `Cascade hard-delete écriture banque ref_folio=${row.ref_folio || '?'}`)
  }

  // Audit log pour les contreparties (extension par ref_folio). Sans ce snapshot
  // explicite, on perd la trace des contreparties supprimées en cascade — le
  // trigger automatique fn_log_audit_trail (mig 403) les capture aussi mais
  // sans le contexte ("cascade banque contrepartie ref_folio=X"), donc on
  // double-log côté application pour avoir la description métier.
  const counterpartIdsNotInSnapshot = counterparts
    .map(c => c.id)
    .filter(id => !scopedIds.includes(id))
  if (counterpartIdsNotInSnapshot.length > 0) {
    const { data: counterpartSnapshot } = await admin
      .from('ecritures_comptables_v2')
      .select('id, journal, ref_folio, numero_compte, debit_mur, credit_mur, lettre, libelle')
      .in('id', counterpartIdsNotInSnapshot)
    for (const row of counterpartSnapshot || []) {
      await logAudit(admin, ctx, 'ecritures_comptables_v2', row.id, row as Record<string, unknown>,
        `Cascade hard-delete contrepartie banque (ref_folio=${row.ref_folio || '?'}, journal=${row.journal || '?'})`)
    }
  }

  // Si certaines écritures étaient lettrées avec des contreparties HORS
  // du périmètre supprimé (cas rare : un paiement client lettré avec une
  // facture non encore supprimée), on remet ces contreparties à lettre=NULL
  // pour éviter un lettrage orphelin.
  const lettresAffectees = [
    ...new Set([
      ...snapshot.map(r => r.lettre).filter(Boolean) as string[],
      ...counterparts.map(c => c.lettre).filter(Boolean) as string[],
    ]),
  ]
  if (lettresAffectees.length > 0) {
    const { count: unlettered } = await admin
      .from('ecritures_comptables_v2')
      .update({ lettre: null, date_lettrage: null }, { count: 'exact' })
      .eq('societe_id', societe_id)
      .in('lettre', lettresAffectees)
      .not('id', 'in', `(${allEcritureIds.join(',')})`)
    counts['ecritures_unlettered'] = unlettered || 0
  }

  // Suppression des écritures (lot complet : ciblées + contreparties)
  const { count: ecCount, error: ecErr } = await admin
    .from('ecritures_comptables_v2')
    .delete({ count: 'exact' })
    .in('id', allEcritureIds)
  if (ecErr) throw new Error(`delete ecritures_comptables_v2: ${ecErr.message}`)
  counts['ecritures_comptables_v2'] = ecCount || 0

  // Nettoyage table de staging transactions_bancaires (si elle existe et
  // contient des lignes ayant produit ces écritures via ref_folio).
  if (refFolios.length > 0) {
    const { count: txCount, error: txErr } = await admin
      .from('transactions_bancaires')
      .delete({ count: 'exact' })
      .eq('societe_id', societe_id)
      .in('reference', refFolios)
    if (!txErr) counts['transactions_bancaires'] = txCount || 0
  }

  return {
    type: 'banque', societe_id, requested: ids.length,
    deleted_ids: scopedIds, failed, cascade_counts: counts,
  }
}

/* ───────────────────────────────────────────────────────── DOCUMENTS ── */

async function cascadeDocuments(
  admin: SupabaseClient,
  ids: string[],
  societe_id: string,
  ctx: AuditContext,
): Promise<CascadeDeleteReport> {
  // Les documents ne portent pas tous societe_id (legacy). On accepte les
  // documents rattachés à un dossier de la société via dossier_id.
  const { data: dossiers } = await admin
    .from('dossiers').select('id').eq('societe_id', societe_id)
  const dossierIds = (dossiers || []).map((d: { id: string }) => d.id)

  let q = admin.from('documents').select('id, storage_path, nom_fichier, type_document').in('id', ids)
  if (dossierIds.length > 0) {
    q = q.or(`societe_id.eq.${societe_id},dossier_id.in.(${dossierIds.join(',')})`)
  } else {
    q = q.eq('societe_id', societe_id)
  }
  const { data: docs, error: docsErr } = await q
  if (docsErr) throw new Error(`scope documents: ${docsErr.message}`)

  const scopedDocs = docs || []
  const scopedIds = scopedDocs.map((d: { id: string }) => d.id)
  const counts: Record<string, number> = {}
  const failed: Array<{ id: string; error: string }> = []

  if (scopedIds.length === 0) {
    return {
      type: 'document', societe_id, requested: ids.length, deleted_ids: [],
      failed: ids.map(id => ({ id, error: 'Hors périmètre société' })),
      cascade_counts: {},
    }
  }

  // Audit log pour chaque doc
  for (const d of scopedDocs) {
    await logAudit(admin, ctx, 'documents', d.id, d as Record<string, unknown>,
      `Cascade hard-delete document ${(d as { nom_fichier?: string }).nom_fichier || d.id}`)
  }

  // 1. Storage cleanup (best-effort)
  const paths = scopedDocs.map((d: { storage_path?: string }) => d.storage_path).filter(Boolean) as string[]
  if (paths.length > 0) {
    try {
      await admin.storage.from('documents').remove(paths)
      counts['storage_files'] = paths.length
    } catch (e: unknown) {
      console.warn('[cascade-delete] storage.remove failed:', e instanceof Error ? e.message : String(e))
    }
  }

  // 2. Tables liées via document_id (toujours appliqué) ou ref_folio (UNIQUEMENT
  //    pour les relevés bancaires).
  //
  //    Bug fix (cf. PR #237 sur cascadeBanque) : supprimer ecritures_comptables_v2
  //    par `ref_folio IN (document_ids)` sans filtrer par societe_id ni journal
  //    risque de wiper des écritures non-bancaires d'autres sociétés si un
  //    ref_folio collisionne avec un uuid de document (cross-tenant + cross-
  //    journal contamination). On scope donc :
  //      - société (via .eq('societe_id', societe_id)) — sécurité multi-tenant
  //      - journaux bancaires uniquement (BNQ/BQ/BANK)
  //      - documents de type 'releve_bancaire' uniquement (les autres types
  //        n'utilisent jamais leur uuid comme ref_folio bancaire)
  //
  //    Pour les autres types de document (facture, fiche_paie, etc.), la
  //    suppression se fait via document_id uniquement.
  const releveBancaireIds = scopedDocs
    .filter((d: { type_document?: string | null }) => d.type_document === 'releve_bancaire')
    .map((d: { id: string }) => d.id)

  const CHILD: Array<{ table: string; field: string; ids: string[]; scopeSociete: boolean; journalsBancaires?: boolean }> = [
    { table: 'releves_bancaires',       field: 'document_id',     ids: scopedIds,         scopeSociete: true },
    { table: 'factures',                field: 'document_id',     ids: scopedIds,         scopeSociete: true },
    { table: 'ecritures_comptables_v2', field: 'ref_folio',       ids: releveBancaireIds, scopeSociete: true, journalsBancaires: true },
    { table: 'ecritures_comptables_v2', field: 'document_id',     ids: scopedIds,         scopeSociete: true },
    { table: 'transactions_bancaires',  field: 'document_lie_id', ids: scopedIds,         scopeSociete: true },
    { table: 'messages_document',       field: 'document_id',     ids: scopedIds,         scopeSociete: false },
    { table: 'immobilisations',         field: 'document_id',     ids: scopedIds,         scopeSociete: true },
    { table: 'depenses',                field: 'document_id',     ids: scopedIds,         scopeSociete: true },
  ]
  for (const { table, field, ids: childIds, scopeSociete, journalsBancaires } of CHILD) {
    if (childIds.length === 0) continue
    let del = admin.from(table).delete({ count: 'exact' }).in(field, childIds)
    if (scopeSociete) del = del.eq('societe_id', societe_id)
    if (journalsBancaires) del = del.in('journal', ['BNQ', 'BQ', 'BANK'])
    const { count, error } = await del
    if (error) {
      const isMissing = /relation .* does not exist/i.test(error.message)
      // Si societe_id n'existe pas sur cette table (legacy), retry sans scope
      const missingSocieteCol = /column .*societe_id.* does not exist/i.test(error.message)
      if (isMissing) continue
      if (missingSocieteCol && scopeSociete) {
        let retry = admin.from(table).delete({ count: 'exact' }).in(field, childIds)
        if (journalsBancaires) retry = retry.in('journal', ['BNQ', 'BQ', 'BANK'])
        const { count: c2, error: e2 } = await retry
        if (e2) { console.warn(`[cascade-delete] ${table}.${field} retry: ${e2.message}`); continue }
        counts[`${table}.${field}`] = (counts[`${table}.${field}`] || 0) + (c2 || 0)
        continue
      }
      console.warn(`[cascade-delete] ${table}.${field}: ${error.message}`)
      continue
    }
    counts[`${table}.${field}`] = (counts[`${table}.${field}`] || 0) + (count || 0)
  }

  // 3. Documents row
  const { count: docCount, error: rowErr } = await admin
    .from('documents').delete({ count: 'exact' }).in('id', scopedIds)
  if (rowErr) throw new Error(`delete documents: ${rowErr.message}`)
  counts['documents'] = docCount || 0

  for (const id of ids) {
    if (!scopedIds.includes(id)) failed.push({ id, error: 'Hors périmètre société' })
  }

  return {
    type: 'document', societe_id, requested: ids.length,
    deleted_ids: scopedIds, failed, cascade_counts: counts,
  }
}

/* ──────────────────────────────────────────────────────────── DISPATCHER ── */

export async function runCascadeDelete(
  admin: SupabaseClient,
  input: CascadeDeleteInput,
  ctx: AuditContext,
): Promise<CascadeDeleteReport> {
  const { type, ids, societe_id } = input
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('ids[] requis (tableau non vide)')
  }
  if (ids.length > MAX_BATCH) {
    throw new Error(`Maximum ${MAX_BATCH} ids par appel`)
  }
  if (!societe_id) throw new Error('societe_id requis')

  switch (type) {
    case 'facture':  return cascadeFactures(admin, ids, societe_id, ctx)
    case 'banque':   return cascadeBanque(admin, ids, societe_id, ctx)
    case 'document': return cascadeDocuments(admin, ids, societe_id, ctx)
    default:
      throw new Error(`type inconnu: ${type as string}`)
  }
}

/** Check si l'utilisateur a le droit de cascade-delete sur cette société.
 *  Règle : rôle admin/super_admin global OU rôle 'admin' explicite sur user_societes. */
export async function assertAdminForSociete(
  admin: SupabaseClient,
  user_id: string,
  societe_id: string,
): Promise<{ role: string }> {
  // 1. Rôle global (profiles.role)
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user_id).maybeSingle()
  const globalRole = profile?.role || ''
  if (['admin', 'super_admin'].includes(globalRole)) return { role: globalRole }

  // 2. Rôle scopé à la société (user_societes.role)
  const { data: us } = await admin
    .from('user_societes')
    .select('role')
    .eq('user_id', user_id)
    .eq('societe_id', societe_id)
    .eq('actif', true)
    .maybeSingle()
  const scopedRole = us?.role || ''
  if (['admin', 'client_admin'].includes(scopedRole)) return { role: scopedRole }

  throw new Error('Rôle insuffisant : seul un admin peut effectuer un cascade hard-delete')
}
