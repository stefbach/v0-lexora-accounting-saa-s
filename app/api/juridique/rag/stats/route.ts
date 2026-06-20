import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * /api/juridique/rag/stats — statistiques du corpus RAG juridique pour le
 * tableau de bord : total de passages, % vectorisés, et détail par source
 * (lois, jurisprudence…). Lecture pour tout utilisateur authentifié.
 */
export async function GET() {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data, error } = await supabase.rpc('juridique_rag_stats')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = (data || []) as Array<{ source: string; domaine: string; n: number; emb: number }>
    const total = rows.reduce((s, r) => s + Number(r.n), 0)
    const embedded = rows.reduce((s, r) => s + Number(r.emb), 0)
    return NextResponse.json({
      total,
      embedded,
      sources: rows.map((r) => ({ source: r.source, domaine: r.domaine, n: Number(r.n), emb: Number(r.emb) })),
      jurisprudence: rows.filter((r) => r.source === 'Jurisprudence').reduce((s, r) => s + Number(r.n), 0),
      nb_sources: rows.length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
