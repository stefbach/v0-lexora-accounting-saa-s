import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { CORPUS_JURIDIQUE } from '@/lib/juridique/rag/corpus'
import { embedText, toPgvector, embeddingProvider } from '@/lib/juridique/rag/embeddings'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * /api/juridique/rag/ingest — peuple/rafraîchit la table juridique_rag_corpus
 * à partir du corpus verrouillé (lib/juridique/rag/corpus.ts), avec embeddings.
 * Idempotent (upsert par slug). Réservé admin/super_admin.
 */
export async function POST() {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)
    const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'super_admin'].includes(profile?.role || '')) {
      return apiError('admins_only', 403)
    }

    const supabase = getAdminClient()
    const provider = embeddingProvider()
    let embedded = 0

    for (const p of CORPUS_JURIDIQUE) {
      const emb = await embedText(`${p.titre}. ${p.texte}`, 'document')
      if (emb) embedded++
      const row: Record<string, unknown> = {
        slug: p.id,
        domaine: p.domaine,
        source: p.source,
        reference: p.reference,
        titre: p.titre,
        texte: p.texte,
        url: p.url ?? null,
        maj: p.maj,
        updated_at: new Date().toISOString(),
      }
      const v = toPgvector(emb)
      if (v) row.embedding = v
      const { error } = await supabase.from('juridique_rag_corpus').upsert(row, { onConflict: 'slug' })
      if (error) {
        console.error('[rag/ingest] upsert error', p.id, error.message)
        return NextResponse.json({ error: `Échec sur ${p.id} : ${error.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({
      ok: true,
      total: CORPUS_JURIDIQUE.length,
      embedded,
      provider: provider || 'aucun (mode lexical)',
    })
  } catch (e) {
    console.error('[rag/ingest]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
