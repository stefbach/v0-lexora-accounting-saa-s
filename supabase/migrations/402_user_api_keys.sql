-- Per-user API keys (Lexora MCP, n8n, scripts ops).
--
-- Le système précédent reposait sur un secret partagé INTERNAL_API_TOKEN +
-- header X-Internal-User-Id, ce qui permettait à n'importe quel client
-- interne d'usurper n'importe quel utilisateur. Pour exposer le MCP aux
-- clients finaux (Claude Desktop d'un utilisateur), on a besoin de tokens
-- liés à un user_id précis, révocables individuellement et audités.
--
-- Format token côté MCP : "lex_<32 chars random>"
-- Stockage DB        : hash SHA-256 du token (jamais en clair)
-- Préfixe visible    : 12 premiers caractères (ex: "lex_abc1...") affiché
--                       dans l'UI pour identifier la clé sans la révéler.

CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identification / audit
  name         TEXT NOT NULL,           -- label saisi par l'utilisateur ("MCP MacBook Pro")
  key_prefix   TEXT NOT NULL,           -- 12 premiers chars du token (visible pour identification)
  key_hash     TEXT NOT NULL UNIQUE,    -- SHA-256(token) — unique pour bloquer collision

  -- Métadonnées
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,             -- soft delete : on garde la ligne pour audit
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_user
  ON public.user_api_keys(user_id) WHERE revoked_at IS NULL;

-- Index sur key_hash (auth chaud — chaque requête MCP fait ce lookup)
CREATE INDEX IF NOT EXISTS idx_user_api_keys_hash_active
  ON public.user_api_keys(key_hash) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.user_api_keys IS
  'Clés API personnelles d''un utilisateur, hashées en SHA-256. Utilisées par le MCP Lexora (Claude Desktop), n8n, scripts ops.';

-- ── RLS : un utilisateur ne voit que SES clés ──────────────────────────
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY user_api_keys_select_own
    ON public.user_api_keys
    FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY user_api_keys_insert_own
    ON public.user_api_keys
    FOR INSERT
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pas de UPDATE direct par l'utilisateur — la révocation passe par un
-- endpoint serveur qui met revoked_at = NOW() avec le service role.
DO $$ BEGIN
  CREATE POLICY user_api_keys_update_own
    ON public.user_api_keys
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY user_api_keys_delete_own
    ON public.user_api_keys
    FOR DELETE
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
