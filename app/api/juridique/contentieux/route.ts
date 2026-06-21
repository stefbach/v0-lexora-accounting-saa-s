import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import {
  qualifierLitige,
  evaluerDossier,
  genererActe,
  questionContentieux,
  type FaitsLitige,
  type ParametresActe,
} from '@/lib/juridique/expertContentieux'
import { DEPARTEMENTS } from '@/lib/juridique/departements'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BUCKET = 'documents'
const MAX_DOCS = 6
const MAX_TOTAL_BYTES = 24 * 1024 * 1024 // 24 Mo cumulés (avant base64)

function mediaTypeFor(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  return null // docx & autres : pas d'analyse native
}

/** Télécharge les pièces sélectionnées du storage et les encode en base64. */
async function loadDocumentsFromStorage(
  supabase: ReturnType<typeof getAdminClient>,
  societeId: string | undefined,
  paths: string[],
): Promise<Array<{ name: string; media_type: string; data: string }>> {
  if (!societeId || paths.length === 0) return []
  const prefix = `juridique/${societeId}/`
  const out: Array<{ name: string; media_type: string; data: string }> = []
  let total = 0
  for (const path of paths.slice(0, MAX_DOCS)) {
    if (!path.startsWith(prefix)) continue // garde tenant : hors périmètre société
    const media_type = mediaTypeFor(path)
    if (!media_type) continue // type non analysable nativement (docx…)
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    if (error || !data) continue
    const bytes = Buffer.from(await data.arrayBuffer())
    total += bytes.length
    if (total > MAX_TOTAL_BYTES) break
    out.push({
      name: path.split('/').pop()?.replace(/^\d+_/, '') || 'document',
      media_type,
      data: bytes.toString('base64'),
    })
  }
  return out
}

/**
 * /api/juridique/contentieux — moteur du Département Juridique (contentieux).
 *
 * Actions :
 *   • qualifier    → qualification juridique d'un litige (juridiction, prescription...)
 *   • evaluer      → analyse stratégique + chances de succès + étapes
 *   • generer_acte → rédaction d'un acte (mise en demeure, sommation...)
 *   • question     → conseil juridique / recherche (chat)
 */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const action = String((body as { action?: string }).action || '')

    // Multi-tenant guard
    const societeId = (body as { societe_id?: string }).societe_id
    if (societeId) {
      try {
        await assertSocieteAccess(supabase, user.id, societeId)
      } catch (err) {
        if (err instanceof SocieteAccessError) {
          return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
        }
        throw err
      }
    }

    // Pièces sélectionnées à analyser (téléchargées du storage) — partagées
    // par toutes les actions (qualification, évaluation, acte, conseil).
    const docPaths = (body as { document_paths?: string[] }).document_paths || []
    const documents = await loadDocumentsFromStorage(supabase, societeId, docPaths)

    if (action === 'qualifier') {
      const faits = (body as { faits?: FaitsLitige }).faits
      if (!faits?.description) return NextResponse.json({ error: 'Description requise' }, { status: 400 })
      const qualification = await qualifierLitige(faits, documents)
      return NextResponse.json({ qualification, documents_analyses: documents.map((d) => d.name) })
    }

    if (action === 'evaluer') {
      const faits = (body as { faits?: FaitsLitige }).faits
      if (!faits?.description) return NextResponse.json({ error: 'Description requise' }, { status: 400 })
      const evaluation = await evaluerDossier(faits, documents)
      return NextResponse.json({ evaluation, documents_analyses: documents.map((d) => d.name) })
    }

    if (action === 'generer_acte') {
      const params = (body as { params?: ParametresActe }).params
      if (!params?.type_acte || !params?.objet) {
        return NextResponse.json({ error: 'type_acte et objet requis' }, { status: 400 })
      }
      // Pré-remplissage émetteur depuis la société
      if (societeId && (!params.societe?.nom || params.societe.nom === '')) {
        const { data: soc } = await supabase
          .from('societes')
          .select('nom, brn, adresse')
          .eq('id', societeId)
          .single()
        if (soc) {
          params.societe = {
            nom: soc.nom || params.societe?.nom || 'Société',
            brn: soc.brn || params.societe?.brn,
            adresse: (soc as { adresse?: string }).adresse || params.societe?.adresse,
          }
        }
      }
      const acte = await genererActe(params, documents)
      return NextResponse.json({ acte, documents_analyses: documents.map((d) => d.name) })
    }

    if (action === 'question') {
      const question = String((body as { question?: string }).question || '')
      if (!question) return NextResponse.json({ error: 'Question requise' }, { status: 400 })

      const depId = (body as { departement?: string }).departement
      const dep = depId ? DEPARTEMENTS.find((d) => d.id === depId) : undefined
      const { texte, sources } = await questionContentieux({
        question,
        contexte: (body as { contexte?: string }).contexte,
        domaines: (body as { domaines?: import('@/lib/juridique/referentielMauricien').DomaineJuridique[] }).domaines,
        expert: dep?.expert,
        historique: (body as { historique?: Array<{ role: 'user' | 'assistant'; content: string }> }).historique,
        documents,
      })
      return NextResponse.json({ reponse: texte, sources, documents_analyses: documents.map((d) => d.name) })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e) {
    console.error('[juridique/contentieux]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
