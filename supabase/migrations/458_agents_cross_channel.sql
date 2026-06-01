-- =====================================================================
-- Migration 458 — Communication cross-canal (Expert web ↔ Telegram)
-- =====================================================================
-- Objectifs :
--   1. agent_handoff_tokens — Niveau B (handoff Telegram → web) : un agent
--      (Telegram ou web) crée un token court qui pré-charge un message
--      dans le chat de l'autre canal. Le user clique le lien, le chat web
--      consomme le token et démarre la conversation au bon endroit.
--   2. web_chat_history    — Niveau C (historique partagé) : pendant des
--      mois `telegram_conversation_history` n'avait pas d'équivalent côté
--      web. On unifie : l'expert web persiste aussi ses tours, et chaque
--      canal peut consulter ce qui s'est dit ailleurs (vue unifiée).
-- =====================================================================

-- ── 1. Handoff tokens ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_handoff_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT NOT NULL UNIQUE,
  societe_id    UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  user_id       UUID,                                  -- destinataire prévu (NULL = libre)
  source_canal  TEXT NOT NULL CHECK (source_canal IN ('telegram','web')),
  target_canal  TEXT NOT NULL CHECK (target_canal IN ('telegram','web')),
  message       TEXT NOT NULL,                         -- message pré-chargé
  context       JSONB DEFAULT '{}'::jsonb,             -- meta (action proposée, ids…)
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handoff_token ON public.agent_handoff_tokens (token);
CREATE INDEX IF NOT EXISTS idx_handoff_societe_active
  ON public.agent_handoff_tokens (societe_id, expires_at DESC)
  WHERE consumed_at IS NULL;

ALTER TABLE public.agent_handoff_tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_handoff_tokens' AND policyname='handoff_service_role_only') THEN
    -- Service-role only : tokens manipulés UNIQUEMENT par les endpoints serveur.
    CREATE POLICY handoff_service_role_only ON public.agent_handoff_tokens
      FOR ALL TO public USING (FALSE) WITH CHECK (FALSE);
  END IF;
END $$;

-- ── 2. Web chat history ──────────────────────────────────────────────
-- Equivalent web de telegram_conversation_history (mig 454). Permet une
-- vue unifiée et que l'agent Telegram puisse "voir" ce que l'utilisateur
-- a dit sur le web (et inversement, via la vue vw_agent_history_unified).
CREATE TABLE IF NOT EXISTS public.web_chat_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  societe_id    UUID NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content       TEXT NOT NULL,
  meta          JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_chat_user_recent
  ON public.web_chat_history (user_id, societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_chat_societe_recent
  ON public.web_chat_history (societe_id, created_at DESC);

ALTER TABLE public.web_chat_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='web_chat_history' AND policyname='web_chat_service_role_only') THEN
    CREATE POLICY web_chat_service_role_only ON public.web_chat_history
      FOR ALL TO public USING (FALSE) WITH CHECK (FALSE);
  END IF;
END $$;

-- ── 3. Vue unifiée des conversations (web + telegram) ────────────────
-- Une seule timeline par société, pour que chaque canal puisse rappeler
-- ce qui s'est dit sur l'autre.
CREATE OR REPLACE VIEW public.vw_agent_history_unified AS
  SELECT
    'telegram'::TEXT AS canal,
    tch.chat_id::TEXT AS channel_ref,
    tch.user_id, tch.societe_id, tch.role, tch.content, tch.meta, tch.created_at
  FROM public.telegram_conversation_history tch
  UNION ALL
  SELECT
    'web'::TEXT AS canal,
    wch.user_id::TEXT AS channel_ref,
    wch.user_id, wch.societe_id, wch.role, wch.content, wch.meta, wch.created_at
  FROM public.web_chat_history wch;

COMMENT ON TABLE public.agent_handoff_tokens IS
  'mig 458 : tokens courts pour le handoff entre canaux Expert web et Telegram.';
COMMENT ON TABLE public.web_chat_history IS
  'mig 458 : historique conversationnel de l''Expert web (équivalent telegram_conversation_history pour le web). Lu/écrit via service role uniquement.';
COMMENT ON VIEW public.vw_agent_history_unified IS
  'mig 458 : timeline unifiée (web + telegram) par société/user — alimente recall_other_channel.';

DO $$ BEGIN
  RAISE NOTICE '[458] Cross-channel ready : agent_handoff_tokens + web_chat_history + vw_agent_history_unified';
END $$;
