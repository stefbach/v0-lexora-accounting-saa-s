-- =====================================================================
-- Migration 454 — Historique conversationnel Telegram (mémoire de session)
-- =====================================================================
-- Bug constaté en prod : l'agent LLM Telegram oublie instantanément le
-- contexte de la conversation entre deux messages. Cause : chaque appel
-- à runLexoraAgent() recrée un `convo` vide (juste le nouveau message
-- utilisateur + recall mémoire long-terme sémantique). L'historique des
-- échanges précédents n'est PAS réinjecté.
--
-- Fix : table `telegram_conversation_history` qui persiste les tours
-- de conversation par chat_id. Au début de chaque appel, on charge les
-- N derniers tours et on les préfixe dans `convo`. À la fin, on
-- persiste le nouveau tour (user message + agent response).
--
-- Rétention : la table peut grossir vite. Index sur (chat_id, created_at
-- DESC) permet un LIMIT N efficace. Une purge périodique (cron
-- d'archivage > 30j) sera ajoutée dans une migration suivante si besoin.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.telegram_conversation_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id         BIGINT NOT NULL,
  user_id         UUID,
  societe_id      UUID,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  -- Métadonnées agent (turn, tools_used, model) pour debug et analytics.
  meta            JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index principal : récupération rapide des N derniers tours par chat.
CREATE INDEX IF NOT EXISTS idx_telegram_conv_history_chat_recent
  ON public.telegram_conversation_history (chat_id, created_at DESC);

-- Index secondaire : analytics par société.
CREATE INDEX IF NOT EXISTS idx_telegram_conv_history_societe
  ON public.telegram_conversation_history (societe_id, created_at DESC)
  WHERE societe_id IS NOT NULL;

-- RLS : la table est accédée exclusivement via le service role (webhook
-- Lexora). Aucune lecture côté front utilisateur n'est prévue.
ALTER TABLE public.telegram_conversation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_conv_history_service_role_only"
  ON public.telegram_conversation_history;
CREATE POLICY "telegram_conv_history_service_role_only"
  ON public.telegram_conversation_history
  FOR ALL
  TO public
  USING (FALSE) WITH CHECK (FALSE);

COMMENT ON TABLE public.telegram_conversation_history IS
  'Mémoire de session Telegram : tours user/assistant persistés par chat_id pour réinjection dans le convo Claude. Lu/écrit uniquement par le webhook via service role.';

DO $$ BEGIN
  RAISE NOTICE '[454] Table telegram_conversation_history créée — mémoire de session Telegram activée';
END $$;
