/**
 * store.ts — Récupération RAG depuis Supabase (sémantique + lexical).
 * Interroge la fonction SQL juridique_rag_match (pgvector si embedding dispo,
 * sinon tsvector). Repli automatique sur le corpus en dur (retriever lexical)
 * si la base est vide ou indisponible — robustesse totale.
 *
 * SERVEUR UNIQUEMENT.
 */
import { getAdminClient } from '@/lib/supabase/admin'
import { embedText, toPgvector } from './embeddings'
import { retrieve, type PassagePertinent } from './retriever'
import type { DomaineJuridique } from '../referentielMauricien'

export async function retrieveRag(
  query: string,
  opts: { domaines?: DomaineJuridique[]; k?: number } = {},
): Promise<PassagePertinent[]> {
  const { domaines, k = 6 } = opts
  try {
    const emb = await embedText(query, 'query')
    const supabase = getAdminClient()
    const { data, error } = await supabase.rpc('juridique_rag_match', {
      query_embedding: toPgvector(emb),
      query_text: query.slice(0, 2000),
      match_count: k,
      filter_domaines: domaines ?? null,
    })
    if (error) throw error
    if (Array.isArray(data) && data.length > 0) {
      return data.map((r: Record<string, unknown>) => ({
        id: String(r.slug || r.id),
        domaine: r.domaine as PassagePertinent['domaine'],
        source: String(r.source),
        reference: String(r.reference),
        titre: String(r.titre),
        texte: String(r.texte),
        url: (r.url as string) || undefined,
        maj: String(r.maj || ''),
        score: Number(r.score ?? 0),
      }))
    }
  } catch (e) {
    console.error('[juridique/rag] retrieveRag → fallback corpus:', e instanceof Error ? e.message : e)
  }
  // Repli : corpus verrouillé en dur (recherche lexicale en mémoire).
  return retrieve(query, { domaines, k })
}
