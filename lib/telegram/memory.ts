/**
 * Mémoire persistante de l'agent Lexora.
 *
 * Architecture double :
 *  - Faits structurés (memory_key + tags) → retrieval déterministe
 *  - Embeddings vectoriels → retrieval sémantique
 *
 * Le retrieval est hybride : la fonction SQL `agent_memory_recall` combine
 * importance, similarité cosine et récence pour produire un top-K pertinent.
 *
 * Embeddings : on utilise Voyage AI (recommandé par Anthropic) si VOYAGE_API_KEY
 * est définie, sinon OpenAI text-embedding-3-small si OPENAI_API_KEY. Si aucun,
 * on stocke sans embedding (mode key-value-only — recall se limite à tags/importance).
 */
import { getAdminClient } from '@/lib/supabase/admin'

const EMBEDDING_DIM = 1536

type EmbeddingProvider = 'voyage' | 'openai' | null

function detectProvider(): EmbeddingProvider {
  if (process.env.VOYAGE_API_KEY) return 'voyage'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return null
}

/**
 * Génère un embedding pour un texte. Retourne null si pas de provider configuré
 * (mémoire fonctionne en mode key-value-only dans ce cas).
 */
export async function embedText(text: string): Promise<number[] | null> {
  const provider = detectProvider()
  if (!provider) return null
  const trimmed = text.slice(0, 8000) // limite raisonnable pour embeddings

  if (provider === 'voyage') {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: [trimmed],
        // voyage-3-large = 1024 dims, voyage-3-lite = 512 dims
        // On pad à 1536 pour matcher la colonne vector(1536) si besoin
        model: 'voyage-3-large',
        input_type: 'document',
      }),
    })
    if (!res.ok) {
      console.error('[memory] Voyage embed failed:', res.status, await res.text().catch(() => ''))
      return null
    }
    const j = await res.json()
    const emb: number[] = j.data?.[0]?.embedding
    return emb ? padOrTruncate(emb, EMBEDDING_DIM) : null
  }

  // openai
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: trimmed,
      model: 'text-embedding-3-small',
    }),
  })
  if (!res.ok) {
    console.error('[memory] OpenAI embed failed:', res.status, await res.text().catch(() => ''))
    return null
  }
  const j = await res.json()
  const emb: number[] = j.data?.[0]?.embedding
  return emb ? padOrTruncate(emb, EMBEDDING_DIM) : null
}

function padOrTruncate(arr: number[], dim: number): number[] {
  if (arr.length === dim) return arr
  if (arr.length > dim) return arr.slice(0, dim)
  return arr.concat(new Array(dim - arr.length).fill(0))
}

/** Stringifie un embedding pour insertion pgvector. */
function embToPgvector(emb: number[] | null): string | null {
  if (!emb) return null
  return `[${emb.join(',')}]`
}

// ============================================================================
// Public API
// ============================================================================

export type MemorySetInput = {
  societe_id: string
  user_id: string | null     // NULL = mémoire société-wide
  memory_key?: string | null  // si fourni → upsert sur la clé
  content: string
  tags?: string[]
  importance?: number
  source?: 'agent' | 'user' | 'system'
  expires_at?: string | null  // ISO timestamp
  metadata?: Record<string, unknown>
}

export type MemoryRow = {
  id: string
  content: string
  memory_key: string | null
  tags: string[]
  importance: number
  similarity: number
  source: string
}

/**
 * Crée ou met à jour une mémoire. Si `memory_key` est fourni et qu'une
 * mémoire avec cette clé existe pour (societe_id, user_id), elle est UPDATE
 * — sinon INSERT.
 */
export async function memorySet(input: MemorySetInput): Promise<{ id: string; updated: boolean }> {
  const admin = getAdminClient()
  const embedding = await embedText(input.content)
  const embeddingStr = embToPgvector(embedding)

  // Upsert si memory_key fourni
  if (input.memory_key) {
    let q = admin
      .from('agent_memory')
      .select('id')
      .eq('societe_id', input.societe_id)
      .eq('memory_key', input.memory_key)
    if (input.user_id === null) q = q.is('user_id', null)
    else q = q.eq('user_id', input.user_id)
    const { data: existing } = await q.maybeSingle()

    if (existing?.id) {
      const { error } = await admin.from('agent_memory').update({
        content: input.content,
        tags: input.tags ?? [],
        importance: input.importance ?? 50,
        source: input.source ?? 'agent',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- colonne pgvector typée comme string mais Supabase générique l'attend en number[]
        embedding: embeddingStr as any,
        expires_at: input.expires_at ?? null,
        metadata: input.metadata ?? null,
        last_used_at: new Date().toISOString(),
      }).eq('id', existing.id)
      if (error) throw new Error(`memorySet update: ${error.message}`)
      return { id: existing.id, updated: true }
    }
  }

  const { data, error } = await admin.from('agent_memory').insert({
    societe_id: input.societe_id,
    user_id: input.user_id,
    memory_key: input.memory_key ?? null,
    content: input.content,
    tags: input.tags ?? [],
    importance: input.importance ?? 50,
    source: input.source ?? 'agent',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- colonne pgvector typée comme string mais Supabase générique l'attend en number[]
    embedding: embeddingStr as any,
    expires_at: input.expires_at ?? null,
    metadata: input.metadata ?? null,
  }).select('id').single()
  if (error || !data) throw new Error(`memorySet insert: ${error?.message}`)
  return { id: data.id, updated: false }
}

/**
 * Recall hybride : tags + similarité vectorielle + récence + importance.
 * Si `query` est fourni, on embed et on fait similarity search.
 * Si seuls les tags sont fournis, on filtre par tags + récence/importance.
 */
export async function memoryRecall(args: {
  societe_id: string
  user_id: string | null
  query?: string | null
  tags?: string[] | null
  top_k?: number
}): Promise<MemoryRow[]> {
  const admin = getAdminClient()
  const topK = Math.min(Math.max(args.top_k ?? 8, 1), 32)
  const queryEmb = args.query ? await embedText(args.query) : null
  const queryEmbStr = embToPgvector(queryEmb)

  const { data, error } = await admin.rpc('agent_memory_recall', {
    p_societe_id: args.societe_id,
    p_user_id: args.user_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arg RPC pgvector typé string non assignable au générique
    p_query_emb: queryEmbStr as any,
    p_top_k: topK,
    p_tag_filter: args.tags && args.tags.length > 0 ? args.tags : null,
  })
  if (error) {
    console.error('[memory] recall RPC failed:', error.message)
    return []
  }
  const rows = (data || []) as MemoryRow[]

  // Marque last_used_at des mémoires retournées (best-effort, ne bloque pas)
  if (rows.length > 0) {
    admin.from('agent_memory').update({
      last_used_at: new Date().toISOString(),
    }).in('id', rows.map(r => r.id)).then(() => {})
  }

  return rows
}

/**
 * Formate les mémoires pour injection dans le system prompt n8n / Claude.
 * Retourne null si aucune mémoire trouvée (l'agent évite alors de mentionner
 * la mémoire vide).
 */
export function formatMemoriesForPrompt(memories: MemoryRow[]): string | null {
  if (!memories.length) return null
  const lines = memories.map(m => {
    const key = m.memory_key ? `[${m.memory_key}] ` : ''
    return `- ${key}${m.content}`
  })
  return [
    '## Mémoire (faits appris au fil des conversations)',
    ...lines,
    '',
    'Utilise ces faits pour personnaliser tes réponses. Si tu apprends quelque chose de nouveau (préférence, alias, contexte récurrent), appelle l\'outil `memory.set` pour le retenir.',
  ].join('\n')
}
