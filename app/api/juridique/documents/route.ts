import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'documents'
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const MAX_SIZE = 20 * 1024 * 1024

/** Préfixe de rangement des pièces juridiques d'une société. */
function prefix(societeId: string): string {
  return `juridique/${societeId}`
}

async function guard(societeId: string | null) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  const supabase = getAdminClient()
  if (societeId) {
    try {
      await assertSocieteAccess(supabase, user.id, societeId)
    } catch (err) {
      if (err instanceof SocieteAccessError) {
        return { error: NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 }) }
      }
      throw err
    }
  }
  return { supabase, user }
}

// GET — liste les pièces juridiques d'une société
export async function GET(request: Request) {
  try {
    const societeId = new URL(request.url).searchParams.get('societe_id')
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const g = await guard(societeId)
    if (g.error) return g.error
    const { supabase } = g

    const { data, error } = await supabase.storage.from(BUCKET).list(prefix(societeId), {
      limit: 200,
      sortBy: { column: 'created_at', order: 'desc' },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const files = (data || [])
      .filter((f) => f.id) // exclure les "dossiers" virtuels
      .map((f) => {
        const path = `${prefix(societeId)}/${f.name}`
        const { data: signed } = supabase.storage.from(BUCKET).getPublicUrl(path)
        return {
          name: f.name,
          path,
          size: (f.metadata as { size?: number } | null)?.size ?? null,
          created_at: f.created_at,
          url: signed?.publicUrl ?? null,
        }
      })
    return NextResponse.json({ files })
  } catch (e) {
    console.error('[juridique/documents GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — upload d'une pièce
export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get('file') as File | null
    const societeId = String(form.get('societe_id') || '')
    if (!file) return NextResponse.json({ error: 'Aucun fichier' }, { status: 400 })
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!ALLOWED.includes(file.type) && !['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx'].includes(ext)) {
      return NextResponse.json({ error: `Type non supporté (.${ext})` }, { status: 400 })
    }
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Fichier trop volumineux (max 20 Mo)' }, { status: 400 })

    const g = await guard(societeId)
    if (g.error) return g.error
    const { supabase } = g

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${prefix(societeId)}/${Date.now()}_${safeName}`
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: signed } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ ok: true, path, url: signed?.publicUrl ?? null })
  } catch (e) {
    console.error('[juridique/documents POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// DELETE — suppression d'une pièce (?path=&societe_id=)
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url)
    const path = url.searchParams.get('path')
    const societeId = url.searchParams.get('societe_id')
    if (!path || !societeId) return NextResponse.json({ error: 'path et societe_id requis' }, { status: 400 })
    // Empêcher la suppression hors du préfixe de la société
    if (!path.startsWith(prefix(societeId) + '/')) {
      return NextResponse.json({ error: 'Chemin invalide' }, { status: 400 })
    }
    const g = await guard(societeId)
    if (g.error) return g.error
    const { supabase } = g

    const { error } = await supabase.storage.from(BUCKET).remove([path])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[juridique/documents DELETE]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
