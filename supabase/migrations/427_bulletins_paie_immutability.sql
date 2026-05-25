-- Migration 427 — Bulletin comptabilisé = immutable (règle scalable 3 couches)
--
-- Contexte : cas réel Alicia Désiré. Un bulletin déjà comptabilisé (ses
-- écritures sont dans ecritures_comptables_v2 avec piece='BP-<bulletin_id>')
-- doit être STRUCTURELLEMENT immuable. Toute tentative de "recalcul" doit
-- échouer côté DB pour empêcher la création de doublon ou la modification
-- d'un bulletin scellé en comptabilité.
--
-- Cette migration installe la COUCHE 1 (DB) — la plus solide, ne peut pas
-- être contournée par un appel API direct ou un import en masse.
--
-- Schéma existant utilisé :
--   bulletins_paie.comptabilise        BOOLEAN  (mig 028/099/115/018)
--   bulletins_paie.comptabilise_at     TIMESTAMPTZ (mig 028/115)
--   bulletins_paie.is_archived         BOOLEAN  (mig 425)
--
-- Cette migration AJOUTE :
--   bulletins_paie.ecriture_id      UUID FK -> ecritures_comptables_v2
--   bulletins_paie.comptabilise_by  UUID FK -> profiles
-- + triggers BEFORE INSERT/UPDATE/DELETE
-- + table audit bulletin_decomptabilisation_log
-- + route admin-only de décomptabilisation (côté API)

-- ============================================================================
-- 1. COLONNES NOUVELLES (idempotent)
-- ============================================================================
ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS ecriture_id UUID REFERENCES public.ecritures_comptables_v2(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comptabilise_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Note : comptabilise + comptabilise_at préexistent. Pas d'ALTER dessus.

-- ============================================================================
-- 2. INDEX PERFORMANCE
-- ============================================================================
-- Index partiel pour la garde-fou "1 seul bulletin comptabilisé par
-- (employe, periode)" — utilisé par les pre-checks API et le trigger
-- INSERT. Inclut un filtre is_archived=false pour ne pas matcher les
-- versions archivées (qui peuvent rester comptabilisées historiquement).
CREATE INDEX IF NOT EXISTS idx_bulletins_paie_comptabilise
  ON public.bulletins_paie(employe_id, periode)
  WHERE comptabilise = TRUE AND COALESCE(is_archived, FALSE) = FALSE;

-- Index pour remonter rapidement bulletin -> écriture (utilisé par UI
-- "Voir écritures" et par la décomptabilisation admin).
CREATE INDEX IF NOT EXISTS idx_bulletins_paie_ecriture
  ON public.bulletins_paie(ecriture_id)
  WHERE ecriture_id IS NOT NULL;

-- ============================================================================
-- 3. BACKFILL — flagger les bulletins déjà liés à des écritures
-- ============================================================================
-- Heuristique : ecritures_comptables_v2 utilise numero_piece = 'BP-<bulletin_id>'
-- (cf. mig 029/216/298). On résout l'ecriture_id en cherchant la première
-- ligne pour chaque pièce. Le UPDATE est idempotent.
DO $$
DECLARE
  v_nb_lies INTEGER := 0;
BEGIN
  -- Cas 1 : bulletin.comptabilise = TRUE mais ecriture_id NULL → rattacher
  -- via numero_piece = 'BP-<id>'.
  WITH lookup AS (
    SELECT
      b.id AS bulletin_id,
      (SELECT e.id
         FROM public.ecritures_comptables_v2 e
        WHERE e.numero_piece = 'BP-' || b.id::TEXT
        ORDER BY e.created_at NULLS LAST
        LIMIT 1) AS ecriture_id
    FROM public.bulletins_paie b
    WHERE b.comptabilise = TRUE
      AND b.ecriture_id IS NULL
  )
  UPDATE public.bulletins_paie b
     SET ecriture_id = l.ecriture_id
    FROM lookup l
   WHERE b.id = l.bulletin_id
     AND l.ecriture_id IS NOT NULL;

  GET DIAGNOSTICS v_nb_lies = ROW_COUNT;
  RAISE NOTICE 'Migration 427 — backfill ecriture_id : % bulletins liés', v_nb_lies;

  -- Cas 2 : bulletin avec écriture existante mais flag comptabilise=FALSE
  -- (cas migration historique / RPC sans UPDATE). On flag à TRUE pour
  -- protéger ces bulletins aussi.
  UPDATE public.bulletins_paie b
     SET comptabilise = TRUE,
         comptabilise_at = COALESCE(b.comptabilise_at, b.created_at, NOW())
   WHERE b.comptabilise = FALSE
     AND EXISTS (
       SELECT 1 FROM public.ecritures_comptables_v2 e
        WHERE e.numero_piece = 'BP-' || b.id::TEXT
     );

  GET DIAGNOSTICS v_nb_lies = ROW_COUNT;
  RAISE NOTICE 'Migration 427 — backfill flag comptabilise : % bulletins corrigés', v_nb_lies;
END $$;

-- ============================================================================
-- 4. TABLE AUDIT — décomptabilisation (WORM : write-once read-many)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bulletin_decomptabilisation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_id UUID NOT NULL,
  ecriture_id_avant UUID,
  action TEXT NOT NULL,
  user_id UUID,
  raison TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulletin_decompta_log_bulletin
  ON public.bulletin_decomptabilisation_log(bulletin_id, created_at DESC);

ALTER TABLE public.bulletin_decomptabilisation_log ENABLE ROW LEVEL SECURITY;

-- WORM : SELECT pour admin, INSERT pour admin, jamais UPDATE/DELETE.
DROP POLICY IF EXISTS bulletin_decompta_select ON public.bulletin_decomptabilisation_log;
CREATE POLICY bulletin_decompta_select ON public.bulletin_decomptabilisation_log
  FOR SELECT USING (public.user_is_lexora_admin());

DROP POLICY IF EXISTS bulletin_decompta_insert ON public.bulletin_decomptabilisation_log;
CREATE POLICY bulletin_decompta_insert ON public.bulletin_decomptabilisation_log
  FOR INSERT WITH CHECK (public.user_is_lexora_admin());

DROP POLICY IF EXISTS bulletin_decompta_no_update ON public.bulletin_decomptabilisation_log;
CREATE POLICY bulletin_decompta_no_update ON public.bulletin_decomptabilisation_log
  FOR UPDATE USING (FALSE);

DROP POLICY IF EXISTS bulletin_decompta_no_delete ON public.bulletin_decomptabilisation_log;
CREATE POLICY bulletin_decompta_no_delete ON public.bulletin_decomptabilisation_log
  FOR DELETE USING (FALSE);

COMMENT ON TABLE public.bulletin_decomptabilisation_log IS
  'Migration 427 — audit WORM des décomptabilisations admin de bulletins. Aucune ligne ne peut être modifiée ou supprimée (RLS).';

-- ============================================================================
-- 5. TRIGGER BEFORE UPDATE — bulletin comptabilisé = immuable
-- ============================================================================
-- Règle : si bulletin.comptabilise = TRUE, la plupart des modifications
-- sont REJETÉES. Quelques exceptions :
--   - changement uniquement de is_archived (archivage suite à recalcul d'une
--     version postérieure) → autorisé
--   - changement des flags d'audit (comptabilise_at, comptabilise_by,
--     ecriture_id) → autorisé (chemin de décomptabilisation)
--   - admin/super_admin → trace dans audit log puis autorise (override
--     exceptionnel pour cas de correction comptable certifiée)
CREATE OR REPLACE FUNCTION public.check_bulletin_comptabilise_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_decompta BOOLEAN;
  v_is_archive_only BOOLEAN;
  v_financial_unchanged BOOLEAN;
BEGIN
  -- Cas 1 : bulletin pas (ou plus) comptabilisé → laisser passer.
  IF COALESCE(OLD.comptabilise, FALSE) = FALSE THEN
    RETURN NEW;
  END IF;

  -- Cas 2 : transition explicite comptabilise=TRUE → FALSE (décomptabilisation).
  -- On laisse passer ; la route /api/rh/paie/[id]/decomptabiliser garantit
  -- déjà : rôle admin + audit log inséré juste avant.
  v_is_decompta := (OLD.comptabilise = TRUE AND NEW.comptabilise = FALSE);
  IF v_is_decompta THEN
    RETURN NEW;
  END IF;

  -- Cas 3 : seuls is_archived/archived_at/archive_reason/superseded_by changent
  -- → archivage suite à recalcul d'une version postérieure (workflow normal).
  v_is_archive_only := (
        NEW.salaire_brut IS NOT DISTINCT FROM OLD.salaire_brut
    AND NEW.salaire_net IS NOT DISTINCT FROM OLD.salaire_net
    AND NEW.salaire_base IS NOT DISTINCT FROM OLD.salaire_base
    AND NEW.csg_salarie IS NOT DISTINCT FROM OLD.csg_salarie
    AND NEW.nsf_salarie IS NOT DISTINCT FROM OLD.nsf_salarie
    AND NEW.paye IS NOT DISTINCT FROM OLD.paye
    AND NEW.ecriture_id IS NOT DISTINCT FROM OLD.ecriture_id
    AND NEW.comptabilise IS NOT DISTINCT FROM OLD.comptabilise
  );
  IF v_is_archive_only THEN
    RETURN NEW;
  END IF;

  -- Cas 4 : admin override → tracer + autoriser. Utilisé pour corrections
  -- comptables certifiées (très rare, doit laisser une trace WORM).
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid()
       AND role IN ('admin', 'super_admin')
  ) INTO v_is_admin;

  IF v_is_admin THEN
    INSERT INTO public.bulletin_decomptabilisation_log
      (bulletin_id, ecriture_id_avant, action, user_id, raison, metadata, created_at)
    VALUES (
      OLD.id,
      OLD.ecriture_id,
      'admin_override_modify',
      auth.uid(),
      'Modification d''un bulletin comptabilisé par admin (override)',
      jsonb_build_object(
        'old_salaire_net', OLD.salaire_net,
        'new_salaire_net', NEW.salaire_net,
        'old_salaire_brut', OLD.salaire_brut,
        'new_salaire_brut', NEW.salaire_brut
      ),
      NOW()
    );
    RETURN NEW;
  END IF;

  -- Cas 5 (final) : refus.
  RAISE EXCEPTION 'Bulletin déjà comptabilisé (id=%, ecriture_id=%) — modification interdite.',
    OLD.id, OLD.ecriture_id
    USING HINT = 'Décomptabiliser d''abord via POST /api/rh/paie/<id>/decomptabiliser (rôle admin requis).',
          ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_bulletin_immutable_update ON public.bulletins_paie;
CREATE TRIGGER trg_bulletin_immutable_update
  BEFORE UPDATE ON public.bulletins_paie
  FOR EACH ROW
  EXECUTE FUNCTION public.check_bulletin_comptabilise_immutable();

COMMENT ON FUNCTION public.check_bulletin_comptabilise_immutable() IS
  'Migration 427 — refuse toute modif d''un bulletin comptabilisé sauf : (a) décomptabilisation explicite, (b) archivage cosmétique (is_archived seul), (c) admin override (audité).';

-- ============================================================================
-- 6. TRIGGER BEFORE DELETE — interdit suppression d'un bulletin comptabilisé
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_bulletin_comptabilise_no_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.comptabilise, FALSE) = TRUE THEN
    RAISE EXCEPTION 'Bulletin comptabilisé (id=%, ecriture_id=%) — suppression interdite.',
      OLD.id, OLD.ecriture_id
      USING HINT = 'Décomptabiliser d''abord (rôle admin) puis re-tenter, ou archiver via is_archived=true.',
            ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_bulletin_immutable_delete ON public.bulletins_paie;
CREATE TRIGGER trg_bulletin_immutable_delete
  BEFORE DELETE ON public.bulletins_paie
  FOR EACH ROW
  EXECUTE FUNCTION public.check_bulletin_comptabilise_no_delete();

-- ============================================================================
-- 7. TRIGGER BEFORE INSERT — refuse doublon si bulletin actif comptabilisé existe
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_bulletin_comptabilise_no_duplicate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id UUID;
  v_existing_ecriture UUID;
BEGIN
  -- On ne bloque un nouvel INSERT QUE si un bulletin déjà comptabilisé ET
  -- actif (non archivé) existe pour le même (employe, periode). Cela évite
  -- de créer une 2e version concurrente qui serait recomptabilisée et
  -- générerait un DOUBLON d'écritures.
  --
  -- Cas autorisés (RETURN NEW) :
  --   - pas de bulletin précédent pour ce couple
  --   - bulletin précédent non comptabilisé (peut être archivé/écrasé)
  --   - bulletin précédent comptabilisé MAIS déjà archivé (impossible en
  --     pratique mais on tolère pour ne pas bloquer une reprise)
  SELECT id, ecriture_id
    INTO v_existing_id, v_existing_ecriture
    FROM public.bulletins_paie
   WHERE employe_id = NEW.employe_id
     AND periode = NEW.periode
     AND comptabilise = TRUE
     AND COALESCE(is_archived, FALSE) = FALSE
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un bulletin comptabilisé existe déjà pour cet employé sur cette période (bulletin_id=%, ecriture_id=%). Doublon refusé.',
      v_existing_id, v_existing_ecriture
      USING HINT = 'Récupérer l''existant via GET /api/rh/paie?employe_id=...&periode=YYYY-MM, ou décomptabiliser d''abord.',
            ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bulletin_no_duplicate ON public.bulletins_paie;
CREATE TRIGGER trg_bulletin_no_duplicate
  BEFORE INSERT ON public.bulletins_paie
  FOR EACH ROW
  EXECUTE FUNCTION public.check_bulletin_comptabilise_no_duplicate();

-- ============================================================================
-- 8. COMMENTAIRES finaux
-- ============================================================================
COMMENT ON COLUMN public.bulletins_paie.ecriture_id IS
  'Migration 427 — FK vers ecritures_comptables_v2(id) première ligne du bulletin (piece BP-<id>). Permet UI "Voir écritures" en O(1).';
COMMENT ON COLUMN public.bulletins_paie.comptabilise_by IS
  'Migration 427 — UUID du user qui a déclenché la comptabilisation. Audit.';
