-- ============================================================================
-- Migration 156 — Persistance de l'état des alertes par utilisateur
-- ============================================================================
--
-- Contexte :
--   Les alertes affichées dans /client/alertes sont générées dynamiquement par
--   /api/client/alertes (rule-based, aucune alerte n'est stockée).
--   Jusqu'ici l'état lu/archivé était purement local React → reset à chaque reload.
--
--   Cette table persiste l'état PAR UTILISATEUR (lue, archivée, acknowledged)
--   d'une alerte identifiée par une clé stable (`alerte_key`) calculée côté
--   générateur (voir lib/alertes/key.ts).
--
-- Idempotent : IF NOT EXISTS partout. RLS activée : un user ne voit que les
-- états qu'il a lui-même créés.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alertes_user_state (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  societe_id      UUID REFERENCES public.societes(id) ON DELETE CASCADE,

  -- Identifiant stable de l'alerte (hash du type + context).
  -- Calculé côté générateur via lib/alertes/key.ts, renvoyé au frontend,
  -- puis posté tel quel à l'API /api/client/alertes/state.
  alerte_key      TEXT NOT NULL,

  -- Type de l'alerte (facture_retard, tva_deadline, tresorerie_basse, etc.)
  -- Redondant avec ce qui est codé dans la clé, mais pratique pour filtrer.
  alerte_type     TEXT,

  -- État par user. NULL = action non effectuée.
  lue_at          TIMESTAMPTZ,
  archivee_at     TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, alerte_key)
);

CREATE INDEX IF NOT EXISTS idx_alertes_user_state_user
  ON public.alertes_user_state(user_id);
CREATE INDEX IF NOT EXISTS idx_alertes_user_state_societe
  ON public.alertes_user_state(societe_id);
CREATE INDEX IF NOT EXISTS idx_alertes_user_state_key
  ON public.alertes_user_state(alerte_key);

-- RLS : chaque user gère uniquement ses propres états.
ALTER TABLE public.alertes_user_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'alertes_user_state'
      AND policyname = 'alertes_state_own'
  ) THEN
    CREATE POLICY alertes_state_own ON public.alertes_user_state
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

COMMENT ON TABLE public.alertes_user_state IS
  'État par user des alertes rule-based (lu/archivé/acknowledged). Les alertes
   elles-mêmes sont calculées dynamiquement côté API /api/client/alertes.';

COMMENT ON COLUMN public.alertes_user_state.alerte_key IS
  'Clé stable calculée côté générateur (lib/alertes/key.ts). Même input →
   même clé, pour que les états persistent entre runs.';
