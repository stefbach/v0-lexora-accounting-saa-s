import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchDocText, chunkLoi } from '@/lib/juridique/rag/ingest-loi'
import { embedText, toPgvector, embeddingProvider } from '@/lib/juridique/rag/embeddings'
import type { DomaineJuridique } from '@/lib/juridique/referentielMauricien'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_CHUNKS = 800

/**
 * /api/juridique/rag/ingest-doc — ingère N'IMPORTE QUEL document juridique par
 * URL (PDF ou HTML) dans le RAG : lois additionnelles, JURISPRUDENCE (jugements
 * Supreme Court / Privy Council), circulaires, etc. Admin only.
 *
 * Body: { key, source, titre, domaine, url, maj? }
 *   key     : slug unique (préfixe des passages, ex: 'jp-2024-scj-123')
 *   source  : libellé affiché (ex: 'Jurisprudence' ou 'SCJ 2024')
 *   domaine : domaine juridique
 *   url     : PDF ou page HTML
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

    const b = await request.json().catch(() => ({})) as {
      key?: string; source?: string; titre?: string; domaine?: DomaineJuridique; url?: string; maj?: string
    }
    if (!b.key || !b.source || !b.titre || !b.domaine || !b.url) {
      return NextResponse.json({ error: 'key, source, titre, domaine et url requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const provider = embeddingProvider()

    const text = await fetchDocText(b.url)
    const chunks = chunkLoi(text).slice(0, MAX_CHUNKS)
    await supabase.from('juridique_rag_corpus').delete().like('slug', `${b.key}#%`)

    let embedded = 0
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      const emb = await embedText(`${b.titre} ${c.reference}. ${c.texte}`, 'document')
      if (emb) embedded++
      const row: Record<string, unknown> = {
        slug: `${b.key}#${i + 1}`,
        domaine: b.domaine,
        source: b.source,
        reference: c.reference,
        titre: `${b.titre} — ${c.reference}`,
        texte: c.texte,
        url: b.url,
        maj: b.maj ?? new Date().toISOString().slice(0, 7),
        updated_at: new Date().toISOString(),
      }
      const v = toPgvector(emb)
      if (v) row.embedding = v
      rows.push(row)
    }
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await supabase.from('juridique_rag_corpus').upsert(rows.slice(i, i + 50), { onConflict: 'slug' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, key: b.key, chunks: chunks.length, embedded, provider: provider || 'aucun (mode lexical)' })
  } catch (e) {
    console.error('[rag/ingest-doc]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
