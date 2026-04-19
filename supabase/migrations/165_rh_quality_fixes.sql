-- ============================================================================
-- Migration 165: RH quality fixes
-- ============================================================================
-- 1. Email employés case-insensitive (CITEXT) pour empêcher doublons par casse
-- 2. TTL sur token_signature contrats (expiration 48h)
-- 3. Historique modifications salaire (audit trail)
-- ============================================================================

-- CITEXT extension si pas déjà présente
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- 1. Email case-insensitive sur employes
-- ============================================================================
-- Change employes.email en CITEXT (case-insensitive comparison)
-- Note: cette ALTER peut échouer si UNIQUE constraint existe déjà avec case-sensitive.
-- On fait un DROP puis re-CREATE pour être sûr.

DO $$
BEGIN
  -- Vérifie si la colonne existe et n'est pas déjà CITEXT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employes' AND column_name = 'email' AND data_type <> 'USER-DEFINED'
  ) THEN
    -- Dédoublonnage case-insensitive AVANT conversion (garde la ligne la plus récente)
    WITH doublons AS (
      SELECT id, email,
             ROW_NUMBER() OVER (PARTITION BY LOWER(email) ORDER BY created_at DESC NULLS LAST, id DESC) AS rn
      FROM public.employes
      WHERE email IS NOT NULL
    )
    UPDATE public.employes
    SET email = NULL
    WHERE id IN (SELECT id FROM doublons WHERE rn > 1);

    -- Converti en CITEXT
    ALTER TABLE public.employes ALTER COLUMN email TYPE CITEXT;

    RAISE NOTICE '[mig 165] employes.email converti en CITEXT (doublons case-insensitive déduplicatés)';
  END IF;
END $$;

-- Index UNIQUE case-insensitive (en plus du type CITEXT qui implique auto)
CREATE UNIQUE INDEX IF NOT EXISTS uq_employes_email_ci
  ON public.employes (email)
  WHERE email IS NOT NULL;

-- ============================================================================
-- 2. TTL sur token_signature des contrats employés
-- ============================================================================

ALTER TABLE public.contrats_employes
  ADD COLUMN IF NOT EXISTS token_signature_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_signature_attempts INT DEFAULT 0;

-- Set expiration à 48h pour les tokens existants (NULL = jamais expiré = risque)
UPDATE public.contrats_employes
SET token_signature_expires_at = created_at + INTERVAL '48 hours'
WHERE token_signature IS NOT NULL AND token_signature_expires_at IS NULL;

COMMENT ON COLUMN public.contrats_employes.token_signature_expires_at IS
  'Expiration du token de signature (48h par défaut). Vérifier avant d''accepter une signature.';
COMMENT ON COLUMN public.contrats_employes.token_signature_attempts IS
  'Nombre de tentatives de signature (max 3 avant blocage).';

-- ============================================================================
-- 3. Historique salaire (audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.historique_salaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  ancien_salaire NUMERIC(18,2),
  nouveau_salaire NUMERIC(18,2) NOT NULL,
  date_effet DATE NOT NULL DEFAULT CURRENT_DATE,
  motif TEXT,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historique_salaires_employe
  ON public.historique_salaires(employe_id, changed_at DESC);

ALTER TABLE public.historique_salaires ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='historique_salaires' AND policyname='hist_sal_read') THEN
    CREATE POLICY hist_sal_read ON public.historique_salaires
      FOR SELECT TO authenticated
      USING (
        employe_id IN (
          SELECT id FROM public.employes
          WHERE societe_id IN (SELECT societe_id FROM public.user_societes WHERE user_id = auth.uid())
        )
      );
  END IF;
END $$;

-- Trigger qui log les changements de salaire sur employes
CREATE OR REPLACE FUNCTION fn_log_salaire_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.salaire_base IS DISTINCT FROM NEW.salaire_base THEN
    BEGIN
      INSERT INTO public.historique_salaires (
        employe_id, ancien_salaire, nouveau_salaire, date_effet, changed_by
      ) VALUES (
        NEW.id, OLD.salaire_base, NEW.salaire_base, CURRENT_DATE, auth.uid()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[fn_log_salaire_change] failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_salaire_change ON public.employes;
CREATE TRIGGER trg_log_salaire_change
AFTER UPDATE OF salaire_base ON public.employes
FOR EACH ROW
EXECUTE FUNCTION fn_log_salaire_change();

-- ============================================================================
-- 4. Verrouillage automatique bulletins post-paiement
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_auto_verrouille_bulletin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Quand un bulletin passe en statut 'paye' ou 'declare_mra', le verrouille
  IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut
     AND NEW.statut IN ('paye', 'declare_mra')
     AND (NEW.verrouille IS NULL OR NEW.verrouille = false) THEN
    NEW.verrouille = true;
    NEW.date_verrouillage = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_verrouille_bulletin ON public.bulletins_paie;
CREATE TRIGGER trg_auto_verrouille_bulletin
BEFORE UPDATE OF statut ON public.bulletins_paie
FOR EACH ROW
EXECUTE FUNCTION fn_auto_verrouille_bulletin();

COMMENT ON FUNCTION fn_auto_verrouille_bulletin IS
  'Verrouille automatiquement un bulletin quand son statut passe à paye/declare_mra.';
