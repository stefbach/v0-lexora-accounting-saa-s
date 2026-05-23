-- ============================================================================
-- Migration 305 — Tracking des alertes Telegram "santé PCM"
-- ============================================================================
-- CONTEXTE :
--   Le cron horaire `/api/cron/sante-pcm-alert` surveille la vue v_sante_pcm
--   (mig 303) et envoie une alerte Telegram dès qu'une société passe en
--   "rouge" (score < 80 ou déséquilibre global > 1.00 MUR).
--
--   Pour éviter de spammer les destinataires (le cron tourne toutes les
--   heures), on enregistre chaque alerte envoyée dans la table ci-dessous.
--   Une nouvelle alerte n'est envoyée que si aucune alerte du même couple
--   (societe_id, sante_couleur) n'a déjà été envoyée AUJOURD'HUI.
--
--   Logique d'idempotence côté cron (cf. app/api/cron/sante-pcm-alert/route.ts) :
--     SELECT id FROM alertes_pcm_envoyees
--      WHERE societe_id = $1
--        AND sante_couleur = $2
--        AND sent_at >= date_trunc('day', NOW())
--      LIMIT 1
--
--   Si la requête remonte une ligne → on ne renvoie pas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alertes_pcm_envoyees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL,
  sante_couleur   TEXT NOT NULL CHECK (sante_couleur IN ('vert', 'orange', 'rouge')),
  sante_score     INT,
  desequilibre_global NUMERIC(18, 2),
  nb_destinataires INT NOT NULL DEFAULT 0,
  nb_envois_ok    INT NOT NULL DEFAULT 0,
  nb_envois_ko    INT NOT NULL DEFAULT 0,
  details         JSONB,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index principal : lookup par société + jour pour l'idempotence
CREATE INDEX IF NOT EXISTS idx_alertes_pcm_envoyees_societe_jour
  ON public.alertes_pcm_envoyees (societe_id, sent_at DESC);

-- Index secondaire : recherche par couleur + jour (pour stats / debug)
CREATE INDEX IF NOT EXISTS idx_alertes_pcm_envoyees_couleur_jour
  ON public.alertes_pcm_envoyees (sante_couleur, sent_at DESC);

COMMENT ON TABLE public.alertes_pcm_envoyees IS
  'Tracking des alertes Telegram envoyées par le cron sante-pcm-alert (mig 305). ' ||
  'Sert d''idempotence quotidienne : une seule alerte par (societe_id, couleur) par jour.';

COMMENT ON COLUMN public.alertes_pcm_envoyees.details IS
  'Payload JSON : { nb_journaux, nb_folios, nb_orphelines, recipients: [user_id...] }';

GRANT SELECT, INSERT ON public.alertes_pcm_envoyees TO service_role;
