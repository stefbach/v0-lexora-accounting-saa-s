-- ============================================================================
-- Migration 149 — Historique des relances automatiques factures clients
-- ============================================================================
--
-- Contexte :
--   Le cron `relances-factures-clients` (app/api/cron/relances-factures-clients)
--   envoie des relances gradées (rappel amical J-7, 1ère relance J+7,
--   2ème relance J+15, mise en demeure J+30) aux clients dont les factures
--   sont en retard de paiement.
--
--   Cette table trace TOUTES les relances envoyées pour assurer :
--     - l'idempotence (pas deux fois la même relance niveau N sur la même facture)
--     - l'audit (quand, par quel canal, avec quel template)
--     - le reporting (combien de relances, taux de succès, etc.)
--
-- Idempotent : IF NOT EXISTS partout. Pas de RLS pour l'instant (Wave 2).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.relances_factures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id  UUID NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  niveau      INT  NOT NULL CHECK (niveau BETWEEN 0 AND 3),
  canal       TEXT NOT NULL,
  template    TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  statut      TEXT NOT NULL DEFAULT 'envoye',
  erreur_msg  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (facture_id, niveau)
);

CREATE INDEX IF NOT EXISTS idx_relances_facture ON public.relances_factures(facture_id);
CREATE INDEX IF NOT EXISTS idx_relances_sent    ON public.relances_factures(sent_at DESC);

COMMENT ON TABLE public.relances_factures IS
  'Historique des relances automatiques envoyées par le cron
   relances-factures-clients. Un niveau (0..3) = une relance max par facture.';

COMMENT ON COLUMN public.relances_factures.niveau IS
  '0 = rappel amical (J-7), 1 = 1ère relance (J+7),
   2 = 2ème relance (J+15), 3 = mise en demeure (J+30).';

COMMENT ON COLUMN public.relances_factures.canal IS
  'Canaux utilisés séparés par virgule (ex: "app,email,whatsapp").';

COMMENT ON COLUMN public.relances_factures.statut IS
  'envoye, envoye_simule (mode dry-run), erreur.';

-- ---------------------------------------------------------------------------
-- Table bonus : alertes pour factures récurrentes manquantes
-- (utilisée par cron `factures-recurrentes-attendues` pour l'idempotence)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alertes_factures_manquantes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id     UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  tiers          TEXT NOT NULL,
  periode        TEXT NOT NULL, -- format YYYY-MM
  date_attendue  DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, tiers, periode)
);

CREATE INDEX IF NOT EXISTS idx_alertes_fact_manq_societe
  ON public.alertes_factures_manquantes(societe_id, periode DESC);

COMMENT ON TABLE public.alertes_factures_manquantes IS
  'Trace des alertes envoyées par le cron factures-recurrentes-attendues.
   Sert à l''idempotence : pas plus d''une alerte par (societe, tiers, periode).';
