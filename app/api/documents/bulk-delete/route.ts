/**
 * POST /api/documents/bulk-delete
 *
 * Suppression en masse de N documents. Pour chaque document :
 *   - Efface le fichier du storage Supabase (bucket `documents`)
 *   - Cascade delete sur les tables liées (factures, écritures, relevés,
 *     transactions bancaires, messages, immobilisations, dépenses)
 *   - Supprime la ligne `documents`
 *
 * Body :
 *   { ids: string[] }
 *
 * Renvoie un rapport détaillé :
 *   { deleted: string[], failed: { id: string, error: string }[] }
 *
 * Le traitement est séquentiel (on ne parallélise pas pour éviter de
 * saturer Supabase et pour pouvoir continuer si une suppression plante).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ⚠️ V2 ONLY (mig 230). Legacy : `piece_justificative` était l'ancien nom V1 de
// `ref_folio` ; certaines écritures historiques ont leur ref_folio = document.id.
const CHILD_TABLES: Array<{ table: string; field: string }> = [
  { table: 'releves_bancaires',      field: 'document_id' },
  { table: 'factures',               field: 'document_id' },
  { table: 'ecritures_comptables_v2', field: 'ref_folio' },
  { table: 'ecritures_comptables_v2', field: 'document_id' },
  { table: 'transactions_bancaires', field: 'document_lie_id' },
  { table: 'messages_document',      field: 'document_id' },
  { table: 'immobilisations',        field: 'document_id' },
  { table: 'depenses',               field: 'document_id' },
]

export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string') : []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids[] requis (tableau non vide de document IDs)' }, { status: 400 })
    }
    if (ids.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 documents par appel' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Récupérer les storage_path en un seul batch
    const { data: docs } = await supabase
      .from('documents')
      .select('id, storage_path')
      .in('id', ids)

    const docMap = new Map<string, string | null>()
    for (const d of docs || []) docMap.set(d.id, d.storage_path || null)

    const deleted: string[] = []
    const failed: Array<{ id: string; error: string }> = []

    // Suppression storage en un batch (plus efficace que N remove individuels)
    const paths = (docs || []).map(d => d.storage_path).filter(Boolean) as string[]
    if (paths.length > 0) {
      try {
        await supabase.storage.from('documents').remove(paths)
      } catch (storageErr: any) {
        // On n'abandonne pas — on continue sur les tables (mieux vaut un fichier
        // orphelin en storage qu'une incohérence en DB)
        console.warn('[bulk-delete] storage.remove failed:', storageErr?.message)
      }
    }

    // Suppression tables liées en batch par table (1 seul DELETE par table)
    for (const { table, field } of CHILD_TABLES) {
      const { error: childErr } = await supabase.from(table).delete().in(field, ids)
      if (childErr) {
        console.warn(`[bulk-delete] ${table}.${field} delete failed:`, childErr.message)
        // On continue quand même — certaines tables peuvent ne pas exister
      }
    }

    // Suppression en masse de la table documents
    const { error: docsErr, data: deletedDocs } = await supabase
      .from('documents')
      .delete()
      .in('id', ids)
      .select('id')

    if (docsErr) {
      return NextResponse.json({ error: docsErr.message }, { status: 500 })
    }

    const deletedIdSet = new Set((deletedDocs || []).map((d: any) => d.id))
    for (const id of ids) {
      if (deletedIdSet.has(id)) deleted.push(id)
      else failed.push({ id, error: 'Non supprimé (introuvable ou bloqué par contrainte)' })
    }

    return NextResponse.json({
      success: true,
      total: ids.length,
      deleted_count: deleted.length,
      failed_count: failed.length,
      deleted,
      failed,
    })
  } catch (e: unknown) {
    console.error('[bulk-delete]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
