-- =====================================================================
-- Migration 496 — Exercices fiscaux : sélection + verrouillage 2 niveaux
-- =====================================================================
-- Contexte : la table exercices_fiscaux (mig 021) n'avait que deux statuts
-- ('ouvert','cloture'), aucune ligne n'était jamais créée, et le verrou DB
-- (mig 421/431) ne s'enclenchait donc jamais. On rend le dispositif utilisable :
--
--   • Statut 'verrouille' AJOUTÉ : gel RÉVERSIBLE d'un exercice (aucune saisie /
--     modif / suppression d'écriture dans la plage). « Réajuster » = déverrouiller.
--   • Statut 'cloture' : clôture définitive (écritures CL/AN + snapshot, RPC 423).
--   • Le verrou DB (is_in_closed_exercice + trigger) bloque désormais sur les
--     DEUX statuts verrouillants : IN ('verrouille','cloture').
--   • Colonnes de traçabilité : qui / quand a verrouillé / clôturé, snapshot lié.
--
-- Tout reste indexé sur les DATES (date_debut..date_fin), pas le libellé.
-- Additif et idempotent — aucune donnée existante modifiée.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Statut : ajoute 'verrouille' au CHECK
-- ---------------------------------------------------------------------
ALTER TABLE public.exercices_fiscaux
  DROP CONSTRAINT IF EXISTS exercices_fiscaux_statut_check;

ALTER TABLE public.exercices_fiscaux
  ADD CONSTRAINT exercices_fiscaux_statut_check
  CHECK (statut IN ('ouvert', 'verrouille', 'cloture'));

-- ---------------------------------------------------------------------
-- 2) Colonnes de traçabilité verrou / clôture
-- ---------------------------------------------------------------------
ALTER TABLE public.exercices_fiscaux
  ADD COLUMN IF NOT EXISTS date_verrouillage TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verrouille_par    UUID,
  ADD COLUMN IF NOT EXISTS date_cloture      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cloture_par       UUID,
  ADD COLUMN IF NOT EXISTS snapshot_id       UUID,
  ADD COLUMN IF NOT EXISTS notes             TEXT;

-- ---------------------------------------------------------------------
-- 3) Helper : la date tombe-t-elle dans un exercice VERROUILLANT ?
--    (verrouille OU cloture — les deux bloquent la saisie)
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
      AND ef.statut IN ('verrouille', 'cloture')
      AND p_date BETWEEN ef.date_debut AND ef.date_fin
  );
$$;

COMMENT ON FUNCTION public.is_in_closed_exercice(UUID, DATE) IS
  'true si la date tombe dans un exercice VERROUILLÉ ou CLÔTURÉ de la société (mig 496).';

-- ---------------------------------------------------------------------
-- 4) Fonction trigger (repart de la version corrigée mig 431 : NEW.journal)
--    — bloque verrouille + cloture ; audit override admin inchangé.
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
  v_statut      TEXT;
  v_is_admin    BOOLEAN;
  v_role        TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_societe_id  := OLD.societe_id;
    v_date        := OLD.date_ecriture;
    v_journal     := OLD.journal;
    v_ecriture_id := OLD.id;
  ELSE
    v_societe_id  := NEW.societe_id;
    v_date        := NEW.date_ecriture;
    v_journal     := NEW.journal;
    v_ecriture_id := NEW.id;
  END IF;

  -- 1) Journaux techniques de clôture / à-nouveaux → toujours autorisés
  IF v_journal IN ('CL', 'AN') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- 2) Date hors exercice verrouillant → pass-through
  IF NOT public.is_in_closed_exercice(v_societe_id, v_date) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- 3) Exercice verrouillé/clôturé : override admin ?
  v_is_admin := public._cloture_is_admin_override();
  v_role     := public._cloture_current_role();

  IF v_is_admin THEN
    SELECT ef.annee, ef.statut INTO v_exercice, v_statut
      FROM public.exercices_fiscaux ef
     WHERE ef.societe_id = v_societe_id
       AND ef.statut IN ('verrouille', 'cloture')
       AND v_date BETWEEN ef.date_debut AND ef.date_fin
     LIMIT 1;

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
      '[cloture-lock] Override admin (% / %) sur écriture % (journal %, date %, société %, statut %)',
      v_role, auth.uid(), v_ecriture_id, v_journal, v_date, v_societe_id, v_statut;

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- 4) Rejet non-admin
  RAISE EXCEPTION
    'Écriture rejetée : exercice verrouillé ou clôturé (date %, société %, journal %, op %). '
    'Déverrouillez/rouvrez l''exercice, ou utilisez les journaux CL/AN, ou contactez un administrateur.',
    v_date, v_societe_id, v_journal, TG_OP
    USING ERRCODE = 'check_violation',
          HINT    = 'Réajuster : déverrouiller/rouvrir l''exercice concerné dans la page Exercices.';
END;
$$;

COMMENT ON FUNCTION public.check_ecriture_in_closed_exercice() IS
  'Trigger guard (mig 496) : bloque toute mutation d''écriture sur exercice '
  'VERROUILLÉ ou CLÔTURÉ, sauf journaux CL/AN ou override admin (audité WORM).';

-- Le trigger ecriture_cloture_lock (mig 421) reste attaché — il appelle la
-- fonction ci-dessus, donc aucune ré-attache nécessaire.

DO $$
DECLARE v_n INTEGER; v_v INTEGER;
BEGIN
  SELECT COUNT(*) FILTER (WHERE statut = 'cloture'),
         COUNT(*) FILTER (WHERE statut = 'verrouille')
    INTO v_n, v_v FROM public.exercices_fiscaux;
  RAISE NOTICE '[mig 496] Statut ''verrouille'' actif. Exercices clôturés=%, verrouillés=%.', v_n, v_v;
END $$;

COMMIT;
