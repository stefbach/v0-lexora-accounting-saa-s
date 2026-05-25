-- =====================================================================
-- Migration 421 — Verrouillage DB des écritures sur exercices clôturés
-- =====================================================================
-- Branche : feat/cloture-immutability
-- Objectif : Empêcher au niveau base toute mutation (INSERT/UPDATE/DELETE)
--            d'une écriture comptable dont la date tombe dans un exercice
--            dont le statut = 'cloture', SAUF :
--              - les journaux techniques de clôture/à-nouveaux ('CL', 'AN')
--              - les admins Lexora (super_admin/admin), avec audit WORM
--                obligatoire dans la table `cloture_lock_overrides`.
--
-- Dépend de :
--   - mig 021 : exercices_fiscaux (statut 'ouvert'|'cloture')
--   - mig 225 : RPC cloture_exercice() — produit les écritures CL/AN
--   - Table publique `ecritures_comptables_v2` (cols : id, societe_id,
--     date_ecriture, journal_code, created_by)
--   - Table publique `profiles` (col `role` ∈ admin/client/comptable)
--
-- Idempotent : DROP TRIGGER IF EXISTS + CREATE OR REPLACE FUNCTION
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Table d'audit WORM des overrides admin
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cloture_lock_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  UUID NOT NULL,
  exercice    TEXT,                       -- format 'YYYY-YYYY'
  action      TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  ecriture_id UUID,                       -- id de l'écriture concernée
  date_ecriture DATE,
  journal_code  TEXT,
  user_id     UUID NOT NULL,              -- auth.uid() de l'admin
  user_role   TEXT,                       -- rôle au moment de l'override
  reason      TEXT,                       -- réservé futur — set via SET LOCAL
  payload     JSONB,                      -- snapshot NEW/OLD pour forensique
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloture_lock_overrides_societe
  ON public.cloture_lock_overrides(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloture_lock_overrides_user
  ON public.cloture_lock_overrides(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloture_lock_overrides_ecriture
  ON public.cloture_lock_overrides(ecriture_id);

-- WORM : aucune ligne ne peut être modifiée ou supprimée
ALTER TABLE public.cloture_lock_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cloture_lock_overrides_no_update ON public.cloture_lock_overrides;
CREATE POLICY cloture_lock_overrides_no_update
  ON public.cloture_lock_overrides
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS cloture_lock_overrides_no_delete ON public.cloture_lock_overrides;
CREATE POLICY cloture_lock_overrides_no_delete
  ON public.cloture_lock_overrides
  FOR DELETE
  USING (false);

-- Lecture : admins seulement
DROP POLICY IF EXISTS cloture_lock_overrides_select_admin ON public.cloture_lock_overrides;
CREATE POLICY cloture_lock_overrides_select_admin
  ON public.cloture_lock_overrides
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Insert : doit passer par le trigger (SECURITY DEFINER), pas via client
DROP POLICY IF EXISTS cloture_lock_overrides_insert_none ON public.cloture_lock_overrides;
CREATE POLICY cloture_lock_overrides_insert_none
  ON public.cloture_lock_overrides
  FOR INSERT
  WITH CHECK (false);

-- ---------------------------------------------------------------------
-- 2) Helper : exercice clôturé pour (societe_id, date) ?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_in_closed_exercice(
  p_societe_id UUID,
  p_date       DATE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exercices_fiscaux ef
    WHERE ef.societe_id = p_societe_id
      AND ef.statut     = 'cloture'
      AND p_date BETWEEN ef.date_debut AND ef.date_fin
  );
$$;

COMMENT ON FUNCTION public.is_in_closed_exercice(UUID, DATE) IS
  'Retourne true si la date tombe dans un exercice fiscal clôturé de la société.';

-- ---------------------------------------------------------------------
-- 3) Helper interne : current user est-il admin Lexora ?
--    (super_admin ou admin — la hiérarchie SEC-001 reste appliquée
--     côté lib/auth/roles.ts, ici on autorise simplement l'override)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._cloture_is_admin_override()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public._cloture_current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- 4) Fonction trigger : check + audit override
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_ecriture_in_closed_exercice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_societe_id  UUID;
  v_date        DATE;
  v_journal     TEXT;
  v_ecriture_id UUID;
  v_exercice    TEXT;
  v_is_admin    BOOLEAN;
  v_role        TEXT;
BEGIN
  -- Sélection des valeurs selon le type d'opération
  IF TG_OP = 'DELETE' THEN
    v_societe_id  := OLD.societe_id;
    v_date        := OLD.date_ecriture;
    v_journal     := OLD.journal_code;
    v_ecriture_id := OLD.id;
  ELSE
    v_societe_id  := NEW.societe_id;
    v_date        := NEW.date_ecriture;
    v_journal     := NEW.journal_code;
    v_ecriture_id := NEW.id;
  END IF;

  -- 1) Bypass : journaux techniques de clôture / à-nouveaux
  --    (mig 225 — cloture_exercice() doit pouvoir écrire malgré le verrou)
  IF v_journal IN ('CL', 'AN') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- 2) La date n'est pas dans un exercice clôturé → pass-through
  IF NOT public.is_in_closed_exercice(v_societe_id, v_date) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- 3) La date EST dans un exercice clôturé. Override admin ?
  v_is_admin := public._cloture_is_admin_override();
  v_role     := public._cloture_current_role();

  IF v_is_admin THEN
    -- Récupère le nom de l'exercice pour l'audit
    SELECT ef.annee INTO v_exercice
      FROM public.exercices_fiscaux ef
     WHERE ef.societe_id = v_societe_id
       AND ef.statut     = 'cloture'
       AND v_date BETWEEN ef.date_debut AND ef.date_fin
     LIMIT 1;

    -- Audit WORM (insertion en SECURITY DEFINER → bypass RLS INSERT=false)
    INSERT INTO public.cloture_lock_overrides (
      societe_id, exercice, action, ecriture_id, date_ecriture,
      journal_code, user_id, user_role, payload
    ) VALUES (
      v_societe_id,
      v_exercice,
      TG_OP,
      v_ecriture_id,
      v_date,
      v_journal,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      v_role,
      CASE
        WHEN TG_OP = 'DELETE' THEN jsonb_build_object('old', to_jsonb(OLD))
        WHEN TG_OP = 'INSERT' THEN jsonb_build_object('new', to_jsonb(NEW))
        ELSE jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
      END
    );

    RAISE NOTICE
      '[cloture-lock] Override admin (% / %) sur écriture % (journal %, date %, société %)',
      v_role, auth.uid(), v_ecriture_id, v_journal, v_date, v_societe_id;

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- 4) Rejet : utilisateur non-admin sur exercice clôturé
  RAISE EXCEPTION
    'Écriture rejetée : exercice clôturé (date %, société %, journal %, op %). '
    'Seuls les journaux CL/AN ou un admin Lexora peuvent écrire dans cet exercice.',
    v_date, v_societe_id, v_journal, TG_OP
    USING ERRCODE = 'check_violation',
          HINT    = 'Passer par une écriture de l''exercice ouvert ou contacter un administrateur.';
END;
$$;

COMMENT ON FUNCTION public.check_ecriture_in_closed_exercice() IS
  'Trigger guard : bloque toute mutation d''écriture sur exercice clôturé, '
  'sauf journaux CL/AN ou override admin (auditée WORM dans cloture_lock_overrides).';

-- ---------------------------------------------------------------------
-- 5) Attache le trigger sur ecritures_comptables_v2
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS ecriture_cloture_lock ON public.ecritures_comptables_v2;

CREATE TRIGGER ecriture_cloture_lock
  BEFORE INSERT OR UPDATE OR DELETE
  ON public.ecritures_comptables_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.check_ecriture_in_closed_exercice();

COMMENT ON TRIGGER ecriture_cloture_lock ON public.ecritures_comptables_v2 IS
  'Mig 421 — Verrouille les mutations d''écritures sur exercices fiscaux clôturés.';

-- ---------------------------------------------------------------------
-- 6) Vérification post-migration
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_nb_cloture INTEGER;
  v_nb_societes INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT societe_id)
    INTO v_nb_cloture, v_nb_societes
    FROM public.exercices_fiscaux
   WHERE statut = 'cloture';

  RAISE NOTICE '[mig 421] Trigger ecriture_cloture_lock attaché sur ecritures_comptables_v2.';
  RAISE NOTICE '[mig 421] Exercices clôturés détectés : % (sur % société(s)).',
    v_nb_cloture, v_nb_societes;
  RAISE NOTICE '[mig 421] Table cloture_lock_overrides prête (WORM, RLS UPDATE/DELETE=false).';
  RAISE NOTICE '[mig 421] Bypass autorisés : journaux CL/AN + admin Lexora (audit obligatoire).';
END;
$$;

COMMIT;
