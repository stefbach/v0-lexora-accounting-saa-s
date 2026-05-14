-- =============================================================================
-- Migration 265 — Mémoire persistante de l'agent Telegram Lexora
-- =============================================================================
-- Architecture double :
--   1. Faits structurés (key-value, tagués) → retrieval par tags + récence
--   2. Embeddings vectoriels (pgvector) → retrieval par similarité sémantique
--
-- L'agent (Claude via n8n) appelle `memory.set` pour mémoriser, et au début
-- de chaque tour on charge les top-K mémoires les plus pertinentes via une
-- requête hybride (tags + similarité cosine).
--
-- Granularité : (societe_id, user_id) — chaque user a sa mémoire isolée
-- ET on garde une mémoire société-wide pour les faits partagés
-- (user_id NULL = mémoire commune à toute la société).

-- pgvector — Supabase l'a déjà installé sur la plupart des projets.
-- Idempotent.
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Table principale
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id    UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE,  -- NULL = société-wide

  -- Clé sémantique court (ex: "preferred_currency", "vip_clients", "alias_compte_courant")
  -- Optionnelle : si NULL, c'est une mémoire libre indexée seulement par embedding.
  memory_key    TEXT,

  -- Contenu de la mémoire (peut être long, jusqu'à plusieurs ko)
  content       TEXT NOT NULL,

  -- Tags pour retrieval rapide (ex: ["preferences", "currency", "facturation"])
  tags          TEXT[] NOT NULL DEFAULT '{}',

  -- Score d'importance 0-100 — l'agent peut prioriser ce qu'il garde
  importance    SMALLINT NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),

  -- Embedding : Voyage voyage-3-lite = 512 dims ; OpenAI text-embedding-3-small = 1536 dims
  -- On garde 1536 par défaut (OpenAI), Voyage 512 sera tronqué côté code.
  embedding     vector(1536),

  -- Source (qui a créé) : 'agent' = Claude via tool, 'user' = user via /remember, 'system' = trigger
  source        TEXT NOT NULL DEFAULT 'agent' CHECK (source IN ('agent', 'user', 'system')),

  -- Métadonnées libres (chat_id, intent qui a déclenché, etc.)
  metadata      JSONB,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  use_count     INT NOT NULL DEFAULT 0,

  -- Expiration optionnelle (la mémoire courte expire ; les préférences = NULL = permanent)
  expires_at    TIMESTAMPTZ
);

-- =============================================================================
-- Index
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_agent_memory_societe ON public.agent_memory(societe_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_societe_user ON public.agent_memory(societe_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memory_key ON public.agent_memory(societe_id, memory_key) WHERE memory_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memory_tags ON public.agent_memory USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_agent_memory_recent ON public.agent_memory(societe_id, last_used_at DESC);

-- Index vectoriel — IVFFlat avec 100 lists est un bon défaut jusqu'à 100k lignes
-- (Supabase recommande HNSW si > 100k mais IVFFlat suffit ici).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_agent_memory_embedding'
  ) THEN
    BEGIN
      EXECUTE 'CREATE INDEX idx_agent_memory_embedding ON public.agent_memory
               USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped ivfflat index (insufficient rows for training): %', SQLERRM;
    END;
  END IF;
END $$;

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_memory_societe_select ON public.agent_memory;
CREATE POLICY agent_memory_societe_select ON public.agent_memory
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_societes us
      WHERE us.user_id = auth.uid() AND us.societe_id = agent_memory.societe_id
    )
  );

-- Pas de policy INSERT/UPDATE/DELETE côté user : tout passe par service_role
-- via les endpoints /api/telegram/internal/memory-* avec X-Internal-Token.

-- =============================================================================
-- Trigger touch updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION public.agent_memory_touch() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_memory_touch ON public.agent_memory;
CREATE TRIGGER trg_agent_memory_touch BEFORE UPDATE ON public.agent_memory
  FOR EACH ROW EXECUTE FUNCTION public.agent_memory_touch();

-- =============================================================================
-- Fonction RPC pour retrieval hybride (tags + vector similarity)
-- =============================================================================
-- Usage : SELECT * FROM agent_memory_recall(societe_id, user_id, query_embedding, top_k, tag_filter)
CREATE OR REPLACE FUNCTION public.agent_memory_recall(
  p_societe_id   UUID,
  p_user_id      UUID,
  p_query_emb    vector(1536),
  p_top_k        INT DEFAULT 8,
  p_tag_filter   TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  memory_key  TEXT,
  tags        TEXT[],
  importance  SMALLINT,
  similarity  REAL,
  source      TEXT
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.memory_key,
    m.tags,
    m.importance,
    CASE WHEN p_query_emb IS NULL OR m.embedding IS NULL
         THEN 0::real
         ELSE (1 - (m.embedding <=> p_query_emb))::real
    END AS similarity,
    m.source
  FROM public.agent_memory m
  WHERE m.societe_id = p_societe_id
    AND (m.user_id = p_user_id OR m.user_id IS NULL)  -- user + société-wide
    AND (m.expires_at IS NULL OR m.expires_at > now())
    AND (p_tag_filter IS NULL OR m.tags && p_tag_filter)
  ORDER BY
    -- Score combiné : importance + similarité + récence
    (
      (m.importance::real / 100.0) * 0.3
      + CASE WHEN p_query_emb IS NOT NULL AND m.embedding IS NOT NULL
             THEN (1 - (m.embedding <=> p_query_emb)) * 0.5
             ELSE 0
        END
      + CASE WHEN m.last_used_at > now() - interval '7 days' THEN 0.2 ELSE 0 END
    ) DESC
  LIMIT p_top_k;
END;
$$;

COMMENT ON TABLE public.agent_memory IS
  'Mémoire persistante de l''agent Lexora — key-value structuré + embeddings vectoriels. Retrieval hybride via agent_memory_recall().';
COMMENT ON FUNCTION public.agent_memory_recall IS
  'Retrieval hybride : combine importance (30%), similarité cosine (50%), récence (20%). Filtrable par tags.';
