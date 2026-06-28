import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { SOURCES_LOIS, getSourceLoi } from '@/lib/juridique/rag/sources-officielles'
import { fetchPdfText, chunkLoi } from '@/lib/juridique/rag/ingest-loi'
import { embedText, toPgvector, embeddingProvider } from '@/lib/juridique/rag/embeddings'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_CHUNKS = 800

/**
 * /api/juridique/rag/ingest-loi — ingère le TEXTE INTÉGRAL d'une loi (PDF
 * officiel) dans juridique_rag_corpus : fetch → extraction → découpage →
 * embeddings → upsert. Idempotent (rafraîchit les passages de la source).
 * Réservé admin/super_admin. Body: { key: 'wra-2019' } ou { key: 'all' }.
 */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)
    const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'super_admin'].includes(profile?.role || '')) {
      return apiError('admins_only', 403)
    }

    const body = await request.json().catch(() => ({})) as { key?: string }
    const key = String(body.key || '')
    if (!key) return NextResponse.json({ error: 'key requis (ex: wra-2019 ou all)', disponibles: SOURCES_LOIS.map((s) => s.key) }, { status: 400 })

    const cibles = key === 'all' ? SOURCES_LOIS : [getSourceLoi(key)].filter(Boolean) as typeof SOURCES_LOIS
    if (cibles.length === 0) return NextResponse.json({ error: `Source inconnue: ${key}`, disponibles: SOURCES_LOIS.map((s) => s.key) }, { status: 400 })

    const supabase = getAdminClient()
    const provider = embeddingProvider()
    const rapport: Array<{ key: string; chunks?: number; embedded?: number; erreur?: string }> = []

    for (const loi of cibles) {
      try {
        const text = await fetchPdfText(loi.url)
        const chunks = chunkLoi(text).slice(0, MAX_CHUNKS)

        // Refresh : on supprime les anciens passages de cette source.
        await supabase.from('juridique_rag_corpus').delete().like('slug', `${loi.key}#%`)

        let embedded = 0
        const rows: Record<string, unknown>[] = []
        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i]
          const emb = await embedText(`${loi.titre} ${c.reference}. ${c.texte}`, 'document')
          if (emb) embedded++
          const row: Record<string, unknown> = {
            slug: `${loi.key}#${i + 1}`,
            domaine: loi.domaine,
            source: loi.source,
            reference: c.reference,
            titre: `${loi.titre} — ${c.reference}`,
            texte: c.texte,
            url: loi.url,
            maj: loi.maj,
            updated_at: new Date().toISOString(),
          }
          const v = toPgvector(emb)
          if (v) row.embedding = v
          rows.push(row)
        }

        for (let i = 0; i < rows.length; i += 50) {
          const batch = rows.slice(i, i + 50)
          const { error } = await supabase.from('juridique_rag_corpus').upsert(batch, { onConflict: 'slug' })
          if (error) throw new Error(error.message)
        }
        rapport.push({ key: loi.key, chunks: chunks.length, embedded })
      } catch (err) {
        rapport.push({ key: loi.key, erreur: err instanceof Error ? err.message : 'échec' })
      }
    }

    return NextResponse.json({ ok: true, provider: provider || 'aucun (mode lexical)', rapport })
  } catch (e) {
    console.error('[rag/ingest-loi]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
