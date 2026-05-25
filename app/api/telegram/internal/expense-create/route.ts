import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { ocrExpenseTicket } from '@/lib/telegram/expense-ocr'
import { verifyHmac } from '@/lib/security/hmac-auth'

/**
 * POST /api/telegram/internal/expense-create
 *
 * Crée une note de frais (table notes_de_frais, mig 269) à partir :
 *   - soit d'un document déjà ingéré dans la table `documents` (document_id)
 *     → on download l'image depuis storage et on appelle l'OCR Anthropic vision
 *   - soit de valeurs explicites fournies dans le body (vendor / montant_ttc /
 *     date_facture / devise / categorie / description)
 *   - soit des deux : on extrait l'OCR puis on écrase avec les valeurs explicites.
 *
 * Body :
 *   - chat_id        (auth)
 *   - document_id?   : UUID d'une row dans `documents`
 *   - vendor?, montant_ttc?, date_facture?, devise?, categorie?, description?
 *   - statut?        : 'brouillon' (défaut) | 'en_validation'
 *
 * Rôle minimum : employe (l'utilisateur soumet SA note).
 * Audit : intent='expense.create'.
 */

const ALLOWED_CATEGORIES = ['repas', 'taxi', 'essence', 'hotel', 'deplacement', 'divers']
const ALLOWED_STATUTS = ['brouillon', 'en_validation']

export async function POST(req: NextRequest) {
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'expense.create', async (ctx, body) => {
    const admin = getAdminClient()

    // Pré-validation employé / société (si l'user est un employé)
    // employe_id reste optionnel : les dirigeants/admins peuvent aussi
    // soumettre une note (table notes_de_frais.employe_id est nullable).
    if (ctx.employe_id) {
      const { data: emp } = await admin
        .from('employes')
        .select('id, prenom, nom, societe_id')
        .eq('id', ctx.employe_id)
        .maybeSingle()
      if (emp && emp.societe_id !== ctx.societe_id) {
        return { result: null, status: 'denied', error_msg: 'Employé hors société active' }
      }
    }

    const documentId: string | null = body?.document_id ? String(body.document_id) : null

    // ---- OCR (si document_id fourni) ---------------------------------------
    let ocrData: any = null
    let ocrRaw: any = null
    let ocrSource: string | null = null
    let ocrConfidence: number | null = null
    let documentRow: any = null

    if (documentId) {
      const { data: doc } = await admin
        .from('documents')
        .select('id, dossier_id, storage_path, nom_fichier, type_fichier, dossiers!inner(societe_id)')
        .eq('id', documentId)
        .maybeSingle()
      if (!doc) {
        return { result: null, status: 'error', error_msg: `Document ${documentId} introuvable` }
      }
      const docSocId = (doc as any).dossiers?.societe_id
      if (docSocId && docSocId !== ctx.societe_id) {
        return { result: null, status: 'denied', error_msg: 'Document hors société active' }
      }
      documentRow = doc

      // Seules les images sont OCR-isables ici (le PDF reste lisible mais l'API
      // vision attend image/...; on saute l'OCR pour le PDF — laissé en TODO).
      const tf = String((doc as any).type_fichier || '').toLowerCase()
      const isImage = tf === 'jpeg' || tf === 'png'

      if (isImage) {
        const { data: file, error: dlErr } = await admin.storage
          .from('documents')
          .download((doc as any).storage_path)
        if (dlErr || !file) {
          return { result: null, status: 'error', error_msg: `Download document échoué: ${dlErr?.message || 'inconnu'}` }
        }
        const buf = await file.arrayBuffer()
        const mime = tf === 'png' ? 'image/png' : 'image/jpeg'

        const ocr = await ocrExpenseTicket({ image_bytes: buf, mime_type: mime })
        if (ocr.ok) {
          ocrData = ocr.data
          ocrRaw = ocr.data
          ocrSource = 'anthropic-vision'
          ocrConfidence = ocr.data.confidence
        } else {
          // On continue quand même : l'employé pourra corriger manuellement
          ocrRaw = { error: ocr.error }
          ocrSource = 'anthropic-vision-failed'
        }

        // Marque le document comme note de frais
        await admin
          .from('documents')
          .update({ categorie: 'frais_employe', type_document: 'autre' })
          .eq('id', documentId)
      }
    }

    // ---- Merge OCR + body explicite ----------------------------------------
    const explicit = {
      vendor: body?.vendor ? String(body.vendor).slice(0, 200) : null,
      date_facture: body?.date_facture && /^\d{4}-\d{2}-\d{2}$/.test(String(body.date_facture))
        ? String(body.date_facture)
        : null,
      montant_ttc:
        body?.montant_ttc !== undefined && body?.montant_ttc !== null && body?.montant_ttc !== ''
          ? Number(body.montant_ttc)
          : null,
      devise: body?.devise ? String(body.devise).toUpperCase().slice(0, 5) : null,
      categorie: body?.categorie && ALLOWED_CATEGORIES.includes(String(body.categorie).toLowerCase())
        ? String(body.categorie).toLowerCase()
        : null,
      description: body?.description ? String(body.description).slice(0, 240) : null,
    }

    const final = {
      vendor: explicit.vendor ?? ocrData?.vendor ?? null,
      date_facture: explicit.date_facture ?? ocrData?.date_facture ?? null,
      montant_ttc: explicit.montant_ttc ?? ocrData?.montant_ttc ?? null,
      devise: (explicit.devise ?? ocrData?.devise ?? 'MUR').toUpperCase(),
      categorie: explicit.categorie ?? ocrData?.categorie_suggeree ?? 'divers',
      description: explicit.description ?? ocrData?.description ?? null,
    }

    if (
      final.montant_ttc !== null &&
      (!Number.isFinite(final.montant_ttc) || final.montant_ttc < 0)
    ) {
      return { result: null, status: 'error', error_msg: 'montant_ttc invalide' }
    }

    const statut =
      body?.statut && ALLOWED_STATUTS.includes(String(body.statut)) ? String(body.statut) : 'brouillon'

    // ---- INSERT notes_de_frais ---------------------------------------------
    const { data: inserted, error: insErr } = await admin
      .from('notes_de_frais')
      .insert({
        societe_id: ctx.societe_id,
        employe_id: ctx.employe_id || null,
        user_id: ctx.user_id,
        vendor: final.vendor,
        date_facture: final.date_facture,
        montant_ttc: final.montant_ttc,
        devise: final.devise,
        categorie: final.categorie,
        description: final.description,
        statut,
        document_id: documentRow ? documentRow.id : null,
        ocr_raw: ocrRaw,
        ocr_source: ocrSource,
        ocr_confidence: ocrConfidence,
      })
      .select('id, statut, vendor, date_facture, montant_ttc, devise, categorie')
      .single()

    if (insErr || !inserted) {
      return {
        result: null,
        status: 'error',
        error_msg: `INSERT notes_de_frais: ${insErr?.message || 'inconnu'}`,
      }
    }

    return {
      result: {
        id: inserted.id,
        statut: inserted.statut,
        vendor: inserted.vendor,
        date_facture: inserted.date_facture,
        montant_ttc: inserted.montant_ttc,
        devise: inserted.devise,
        categorie: inserted.categorie,
        document_id: documentRow ? documentRow.id : null,
        ocr_used: !!ocrData,
        ocr_confidence: ocrConfidence,
      },
    }
  })
}
