import { NextResponse } from 'next/server'
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
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'super_admin'].includes(profile?.role || '')) {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as { key?: string }
    const key = String(body.key || '')
    if (!key) return NextResponse.json({ error: 'key requis (ex: wra-2019 ou all)', disponibles: SOURCES_LOIS.map((s) => s.key) }, { status: 400 })

    const cibles = key === 'all' ? SOURCES_LOIS : [getSourceLoi(key)].filter(Boolean) as typeof SOURCES_LOIS
    if (cibles.length === 0) return NextResponse.json({ error: `Source inconnue: ${key}`, disponibles: SOURCES_LOIS.map((s) => s.key) }, { status: 400 })

    const supabase = getAdminClient()
    const provider = embeddingProvider()
    const rapport: Array<{ key: string; chunks: number; embedded: number }> = []

    for (const loi of cibles) {
      const text = await fetchPdfText(loi.url)
      const chunks = chunkLoi(text).slice(0, MAX_CHUNKS)

      // Refresh : on supprime les anciens passages de cette source.
      await supabase.from('juridique_rag_corpus').delete().like('slug', `${loi.key}#%`)

      let embedded = 0
      // Insertion par lots de 50 (embeddings calculés un par un).
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
        if (error) return NextResponse.json({ error: `Upsert ${loi.key}: ${error.message}` }, { status: 500 })
      }
      rapport.push({ key: loi.key, chunks: chunks.length, embedded })
    }

    return NextResponse.json({ ok: true, provider: provider || 'aucun (mode lexical)', rapport })
  } catch (e) {
    console.error('[rag/ingest-loi]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
