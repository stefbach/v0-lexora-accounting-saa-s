import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/repair-orphan-documents?societe_id=<UUID>&dry_run=1
 *
 * Pour la société donnée :
 *   1. Identifie les écritures orphelines (sans FAC- en ref_folio, sans facture_id)
 *      qui pointent vers un document (piece_justificative)
 *   2. Supprime ces écritures buggées (montants EUR brut, sans conversion MUR)
 *   3. Pour chaque document concerné, réinitialise statut='en_attente' et
 *      réinvoque /api/documents/process (pipeline canonique corrigé) qui
 *      crée proprement factures + écritures via le helper canonique
 *
 * Auth : admin/super_admin OU X-Internal-Token
 * Param dry_run=1 → ne supprime rien, retourne juste la liste à traiter
 */
export const maxDuration = 300

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: NextRequest) {
  // Auth
  const internalToken = request.headers.get('x-internal-token')
  const isInternal = internalToken && internalToken === process.env.INTERNAL_API_TOKEN
  if (!isInternal) {
    const sup = await createServerClient()
    const { data: { user } } = await sup.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await sup.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (!profile || !['admin', 'super_admin'].includes(profile.role || '')) {
      return NextResponse.json({ error: 'Forbidden — admin required' }, { status: 403 })
    }
  }

  const { searchParams } = new URL(request.url)
  const societeId = searchParams.get('societe_id')
  const dryRun = searchParams.get('dry_run') === '1'
  if (!societeId) {
    return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
  }

  const admin = getAdmin()

  // 1. Trouve les écritures orphelines (sans FAC-, sans facture_id)
  //    qui pointent vers un document via piece_justificative
  const { data: orphanEcritures } = await admin
    .from('ecritures_comptables_v2')
    .select('id, date_ecriture, libelle, debit_mur, credit_mur, numero_compte, ref_folio, piece_justificative')
    .eq('societe_id', societeId)
    .is('facture_id', null)
    .not('piece_justificative', 'is', null)
    .or('ref_folio.is.null,ref_folio.not.ilike.FAC-%')
    .order('date_ecriture', { ascending: false })

  // 2. Documents distincts à re-processer
  const docIds = Array.from(new Set(
    (orphanEcritures || []).map((e: any) => e.piece_justificative).filter(Boolean),
  ))

  const { data: docs } = await admin
    .from('documents')
    .select('id, nom_fichier, type_document, storage_path, statut, dossier_id')
    .in('id', docIds.length > 0 ? docIds : ['00000000-0000-0000-0000-000000000000'])

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      orphan_ecritures_count: orphanEcritures?.length || 0,
      total_amount_to_remove: (orphanEcritures || []).reduce((s: number, e: any) =>
        s + (Number(e.debit_mur) || 0) + (Number(e.credit_mur) || 0), 0),
      documents_to_reprocess: docs?.length || 0,
      documents: docs,
      orphan_ecritures: orphanEcritures?.slice(0, 20),
    })
  }

  // 3. Supprime les écritures orphelines
  const orphanIds = (orphanEcritures || []).map((e: any) => e.id)
  if (orphanIds.length > 0) {
    await admin.from('ecritures_comptables_v2').delete().in('id', orphanIds)
  }

  // 4. Pour chaque doc, supprime aussi les rows factures sans montant_mur correct
  //    (montant_mur = montant_ttc → conversion EUR pas faite, à régénérer)
  const { data: facturesBuggees } = await admin
    .from('factures')
    .select('id, document_id, devise, montant_ttc, montant_mur')
    .in('document_id', docIds.length > 0 ? docIds : ['00000000-0000-0000-0000-000000000000'])
    .neq('devise', 'MUR')
  const facturesAReprocesser = (facturesBuggees || []).filter((f: any) =>
    Number(f.montant_mur) === Number(f.montant_ttc),
  )
  if (facturesAReprocesser.length > 0) {
    const facIds = facturesAReprocesser.map((f: any) => f.id)
    await admin.from('ecritures_comptables_v2').delete().in('facture_id', facIds)
    await admin.from('ecritures_comptables_v2').delete()
      .in('ref_folio', facIds.map((id: string) => `FAC-${id}`))
    await admin.from('factures').delete().in('id', facIds)
  }

  // 5. Re-process chaque document via /api/documents/process
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || process.env.LEXORA_BASE_URL
    || (request.headers.get('host') ? `https://${request.headers.get('host')}` : '')
  const tokenInternal = process.env.INTERNAL_API_TOKEN || ''
  const results: any[] = []

  for (const doc of docs || []) {
    if (!doc.storage_path) {
      results.push({ doc_id: doc.id, nom_fichier: doc.nom_fichier, status: 'skipped', reason: 'no_storage_path' })
      continue
    }
    // Reset statut to allow re-processing
    await admin.from('documents').update({ statut: 'en_attente' }).eq('id', doc.id)
    try {
      const res = await fetch(`${baseUrl}/api/documents/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Token': tokenInternal },
        body: JSON.stringify({
          document_id: doc.id,
          storage_path: doc.storage_path,
          nom_fichier: doc.nom_fichier,
        }),
      })
      const json = await res.json().catch(() => null)
      results.push({
        doc_id: doc.id,
        nom_fichier: doc.nom_fichier,
        http_status: res.status,
        result: json,
      })
    } catch (e: any) {
      results.push({ doc_id: doc.id, nom_fichier: doc.nom_fichier, status: 'error', error: e?.message })
    }
  }

  return NextResponse.json({
    societe_id: societeId,
    orphan_ecritures_deleted: orphanIds.length,
    factures_buggees_deleted: facturesAReprocesser.length,
    documents_reprocessed: results.length,
    results,
  })
}
