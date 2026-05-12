-- ═══════════════════════════════════════════════════════════════════════
-- Migration 241: Récurrence factures (génération automatique mensuelle/
--                trimestrielle/annuelle par cron)
--
-- La mig 042 avait introduit `recurrent` + `recurrent_frequence` sans
-- aucune logique. Cette migration ajoute les colonnes nécessaires au
-- moteur de génération et précise le contrat de données.
--
-- Modèle conceptuel :
--   • Une facture avec recurrent=true est un MODÈLE (template). Elle
--     n'est jamais comptabilisée (statut='modele' nouveau).
--   • Le cron quotidien clone le modèle à intervalle régulier en générant
--     de vraies factures (recurrent=false, statut='en_attente') liées
--     au modèle via recurrence_template_id.
--   • Le modèle mémorise dans derniere_generation_date la date à laquelle
--     la dernière génération a eu lieu → idempotence.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Colonnes de configuration sur le MODÈLE
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS recurrence_jour_du_mois   INTEGER
    CHECK (recurrence_jour_du_mois IS NULL OR recurrence_jour_du_mois BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS recurrence_date_debut     DATE,
  ADD COLUMN IF NOT EXISTS recurrence_date_fin       DATE,
  ADD COLUMN IF NOT EXISTS derniere_generation_date  DATE,
  -- Lien vers le modèle (pour les factures GÉNÉRÉES, pas le modèle lui-même)
  ADD COLUMN IF NOT EXISTS recurrence_template_id    UUID
    REFERENCES public.factures(id) ON DELETE SET NULL;

-- 2. Statut 'modele' pour identifier les templates récurrents
--    On ne peut pas modifier un CHECK existant sans le DROP / ADD.
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.factures'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%statut%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.factures DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.factures
  ADD CONSTRAINT factures_statut_check
  CHECK (statut IN ('en_attente', 'partiel', 'paye', 'retard', 'annule', 'modele'));

-- 3. Normalise les valeurs de recurrent_frequence (whitelist)
--    On accepte mensuel / trimestriel / annuel ; les anciennes valeurs
--    sont remappées sur 'mensuel' par défaut.
UPDATE public.factures
   SET recurrent_frequence = 'mensuel'
 WHERE recurrent = TRUE
   AND (recurrent_frequence IS NULL
     OR recurrent_frequence NOT IN ('mensuel', 'trimestriel', 'annuel'));

ALTER TABLE public.factures
  ADD CONSTRAINT factures_recurrent_frequence_check
  CHECK (recurrent_frequence IS NULL
      OR recurrent_frequence IN ('mensuel', 'trimestriel', 'annuel'));

-- 4. Cohérence : un modèle est forcément récurrent
--    Et inversement, un facture récurrente=true devrait avoir statut='modele'
--    (on l'auto-corrige pour les éventuels modèles existants).
UPDATE public.factures
   SET statut = 'modele'
 WHERE recurrent = TRUE
   AND statut <> 'modele';

-- 5. Index utiles au cron
CREATE INDEX IF NOT EXISTS idx_factures_recurrence_active
  ON public.factures(societe_id, derniere_generation_date)
  WHERE recurrent = TRUE AND statut = 'modele';

CREATE INDEX IF NOT EXISTS idx_factures_recurrence_template
  ON public.factures(recurrence_template_id)
  WHERE recurrence_template_id IS NOT NULL;

COMMENT ON COLUMN public.factures.recurrence_jour_du_mois  IS 'Jour du mois où la facture récurrente doit être générée (1..28). 28 max pour éviter les écueils fin de mois.';
COMMENT ON COLUMN public.factures.recurrence_date_debut    IS 'Date à partir de laquelle la récurrence commence. Pas de génération avant.';
COMMENT ON COLUMN public.factures.recurrence_date_fin      IS 'Date au-delà de laquelle plus aucune facture n''est générée (NULL = sans fin).';
COMMENT ON COLUMN public.factures.derniere_generation_date IS 'Date de la dernière facture générée à partir de ce modèle (idempotence).';
COMMENT ON COLUMN public.factures.recurrence_template_id   IS 'Pour une facture GÉNÉRÉE par le cron, pointe vers le modèle d''origine.';
