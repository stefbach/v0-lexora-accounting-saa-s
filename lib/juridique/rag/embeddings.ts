/**
 * embeddings.ts — Génération d'embeddings pour le RAG juridique.
 * Réutilise la stratégie éprouvée de lib/telegram/memory.ts :
 *   Voyage AI (voyage-3-large) si VOYAGE_API_KEY, sinon OpenAI
 *   (text-embedding-3-small) si OPENAI_API_KEY, sinon null → fallback lexical.
 *
 * SERVEUR UNIQUEMENT.
 */

const EMBEDDING_DIM = 1536

type Provider = 'voyage' | 'openai' | null

export function embeddingProvider(): Provider {
  if (process.env.VOYAGE_API_KEY) return 'voyage'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return null
}

function padOrTruncate(arr: number[], dim: number): number[] {
  if (arr.length === dim) return arr
  if (arr.length > dim) return arr.slice(0, dim)
  return arr.concat(new Array(dim - arr.length).fill(0))
}

/** Embedding d'un texte. `kind` = 'query' (recherche) ou 'document' (ingestion). */
export async function embedText(
  text: string,
  kind: 'query' | 'document' = 'query',
): Promise<number[] | null> {
  const provider = embeddingProvider()
  if (!provider) return null
  const trimmed = (text || '').slice(0, 8000)
  if (!trimmed) return null

  try {
    if (provider === 'voyage') {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: [trimmed], model: 'voyage-3-large', input_type: kind === 'query' ? 'query' : 'document' }),
      })
      if (!res.ok) {
        console.error('[juridique/rag] Voyage embed failed:', res.status)
        return null
      }
      const j = await res.json()
      const emb: number[] | undefined = j.data?.[0]?.embedding
      return emb ? padOrTruncate(emb, EMBEDDING_DIM) : null
    }

    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: trimmed, model: 'text-embedding-3-small' }),
    })
    if (!res.ok) {
      console.error('[juridique/rag] OpenAI embed failed:', res.status)
      return null
    }
    const j = await res.json()
    const emb: number[] | undefined = j.data?.[0]?.embedding
    return emb ? padOrTruncate(emb, EMBEDDING_DIM) : null
  } catch (e) {
    console.error('[juridique/rag] embed error:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Sérialise un embedding au format littéral pgvector. */
export function toPgvector(emb: number[] | null): string | null {
  return emb ? `[${emb.join(',')}]` : null
}
