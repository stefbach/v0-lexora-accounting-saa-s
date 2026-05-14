/**
 * Ingestion d'un document/photo reçu via Telegram.
 *
 * Pipeline :
 *  1. Telegram getFile(file_id) → file_path
 *  2. Download `https://api.telegram.org/file/bot<TOKEN>/<file_path>` → ArrayBuffer
 *  3. Résout `dossier_id` (premier dossier de la société active)
 *  4. Upload vers Supabase storage bucket `documents`
 *  5. INSERT documents (statut='en_attente') — picked up par la pipeline OCR existante
 *  6. Audit telegram_actions (intent='document.ingest')
 *
 * Limitations :
 *  - 20 Mo max côté Telegram bot API (cf. doc Telegram)
 *  - Types acceptés : pdf, jpeg, png, xlsx
 *  - Le statut reste 'en_attente' jusqu'à ce qu'un worker/cron lance le retraitement
 *    (cf. /api/documents/[id]/reanalyze pour le déclenchement manuel)
 */
import { getAdminClient } from '@/lib/supabase/admin'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const MAX_SIZE_BYTES = 20 * 1024 * 1024

type IngestResult =
  | { ok: true; doc_id: string; nom_fichier: string; type_fichier: string; taille: number }
  | { ok: false; error: string }

function extToTypeFichier(name: string, mime?: string): 'pdf' | 'jpeg' | 'png' | 'xlsx' | null {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'png') return 'png'
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg'
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  if (mime?.includes('pdf')) return 'pdf'
  if (mime?.includes('png')) return 'png'
  if (mime?.includes('jpeg') || mime?.includes('jpg')) return 'jpeg'
  if (mime?.includes('spreadsheet')) return 'xlsx'
  return null
}

export async function ingestTelegramDocument(args: {
  chat_id: number
  user_id: string
  societe_id: string
  file_id: string
  file_name?: string
  mime_type?: string
  declared_size?: number
}): Promise<IngestResult> {
  if (!BOT_TOKEN) return { ok: false, error: 'TELEGRAM_BOT_TOKEN missing' }

  // 1. getFile
  const gfRes = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(args.file_id)}`,
  )
  if (!gfRes.ok) return { ok: false, error: `Telegram getFile failed: ${gfRes.status}` }
  const gf = await gfRes.json()
  if (!gf.ok || !gf.result?.file_path) return { ok: false, error: 'Telegram getFile invalide' }
  const filePath: string = gf.result.file_path
  const fileSize: number = gf.result.file_size || args.declared_size || 0

  if (fileSize > MAX_SIZE_BYTES) {
    return { ok: false, error: `Fichier trop volumineux (${Math.round(fileSize / 1024 / 1024)} Mo, max 20 Mo)` }
  }

  // 2. Download
  const dlRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
  if (!dlRes.ok) return { ok: false, error: `Téléchargement échoué: ${dlRes.status}` }
  const buf = await dlRes.arrayBuffer()

  // Determine filename + type
  const inferredName = args.file_name || filePath.split('/').pop() || 'telegram_document'
  const typeFichier = extToTypeFichier(inferredName, args.mime_type)
  if (!typeFichier) {
    return { ok: false, error: `Type de fichier non supporté (PDF/PNG/JPG/XLSX uniquement)` }
  }

  const admin = getAdminClient()

  // 3. Résoudre dossier_id (premier dossier de la société)
  const { data: dossier } = await admin
    .from('dossiers')
    .select('id')
    .eq('societe_id', args.societe_id)
    .limit(1)
    .maybeSingle()
  if (!dossier?.id) {
    return { ok: false, error: `Aucun dossier configuré pour cette société` }
  }

  // 4. Upload storage
  const safeName = inferredName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${args.user_id}/telegram_${Date.now()}_${safeName}`
  const { error: stErr } = await admin.storage
    .from('documents')
    .upload(storagePath, buf, {
      contentType: args.mime_type || 'application/octet-stream',
      upsert: false,
    })
  if (stErr) return { ok: false, error: `Upload storage: ${stErr.message}` }

  // 5. INSERT documents — statut='en_attente' (la pipeline OCR la prendra)
  const { data: doc, error: dbErr } = await admin
    .from('documents')
    .insert({
      dossier_id: dossier.id,
      uploaded_by: args.user_id,
      nom_fichier: inferredName,
      type_fichier: typeFichier,
      statut: 'en_attente',
      storage_path: storagePath,
      taille_fichier: fileSize,
    })
    .select('id')
    .single()
  if (dbErr || !doc) {
    // rollback storage best-effort
    await admin.storage.from('documents').remove([storagePath])
    return { ok: false, error: `Insert document: ${dbErr?.message || 'inconnu'}` }
  }

  // 6. Audit
  await admin.from('telegram_actions').insert({
    chat_id: args.chat_id,
    user_id: args.user_id,
    societe_id: args.societe_id,
    intent: 'document.ingest',
    payload: { doc_id: doc.id, nom_fichier: inferredName, type_fichier: typeFichier, taille: fileSize },
    status: 'success',
  })

  return { ok: true, doc_id: doc.id, nom_fichier: inferredName, type_fichier: typeFichier, taille: fileSize }
}
