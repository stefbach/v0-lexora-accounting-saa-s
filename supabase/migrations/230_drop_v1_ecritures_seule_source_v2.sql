-- ============================================================================
-- Migration 230 — V2 source unique (ecritures_comptables_v2)
-- ============================================================================
--
-- Bug récurrent : les routes faisaient V1 + V2 avec dedup par id (qui foire
-- car ids différents) → masse salariale 7,6M au lieu de 6,7M, fournisseurs
-- 1,597M au lieu de 1,4M (audit utilisateur).
--
-- Décision architecturale : V2 (ecritures_comptables_v2) devient la SEULE
-- source de vérité. V1 (ecritures_comptables) est :
--   • Si encore une TABLE physique : migration des données restantes →
--     v2, puis drop de la table.
--   • Si déjà une VIEW (cas mig 120 dans certains envs) : drop puis
--     re-CREATE comme VIEW transparente sur V2 pour rester compatible
--     avec les writes legacy qui n'ont pas encore été migrés (cron,
--     scripts d'import) — ces writes seront automatiquement redirigés
--     vers V2 via INSTEAD OF triggers.
--
-- IDEMPOTENTE.
-- ============================================================================

DO $$
DECLARE
  v_kind TEXT;
  v_count_v1 INT := 0;
  v_count_inserted INT := 0;
  v_count_dup INT := 0;
BEGIN
  -- Détecter si ecritures_comptables est une TABLE ou une VIEW
  SELECT relkind INTO v_kind
  FROM pg_class
  WHERE oid = 'public.ecritures_comptables'::regclass;

  IF v_kind IS NULL THEN
    RAISE NOTICE '↷ public.ecritures_comptables n''existe pas — rien à faire';
    RETURN;
  END IF;

  IF v_kind = 'r' THEN
    -- Table physique → migrer les données vers V2 puis dropper
    SELECT COUNT(*) INTO v_count_v1 FROM public.ecritures_comptables;
    RAISE NOTICE '→ V1 est une TABLE avec % lignes — migration vers V2', v_count_v1;

    -- Insérer dans V2 les lignes V1 qui ne sont pas déjà présentes
    -- (basé sur fingerprint composite : date+compte+debit+credit+ref+libelle)
    INSERT INTO public.ecritures_comptables_v2 (
      societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
      numero_compte, nom_compte, libelle, description,
      debit_mur, credit_mur, exercice, lettre, date_lettrage, facture_id
    )
    SELECT
      d.societe_id,
      v1.dossier_id,
      v1.date_ecriture,
      COALESCE(v1.journal, 'OD'),
      COALESCE(v1.ref_folio, v1.numero_piece, 'V1-' || v1.id::TEXT),
      v1.numero_piece,
      v1.compte AS numero_compte,
      NULL AS nom_compte,
      v1.libelle,
      v1.libelle AS description,
      COALESCE(v1.debit, 0) AS debit_mur,
      COALESCE(v1.credit, 0) AS credit_mur,
      TO_CHAR(v1.date_ecriture, 'YYYY') AS exercice,
      v1.lettre,
      v1.date_lettrage,
      v1.facture_id
    FROM public.ecritures_comptables v1
    JOIN public.dossiers d ON d.id = v1.dossier_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ecritures_comptables_v2 v2
      WHERE v2.societe_id = d.societe_id
        AND v2.date_ecriture = v1.date_ecriture
        AND v2.numero_compte = v1.compte
        AND COALESCE(v2.debit_mur, 0) = COALESCE(v1.debit, 0)
        AND COALESCE(v2.credit_mur, 0) = COALESCE(v1.credit, 0)
        AND COALESCE(v2.libelle, '') = COALESCE(v1.libelle, '')
    );
    GET DIAGNOSTICS v_count_inserted = ROW_COUNT;
    v_count_dup := v_count_v1 - v_count_inserted;
    RAISE NOTICE '✓ Migration V1→V2 : % lignes insérées, % déjà présentes (skip)',
      v_count_inserted, v_count_dup;

    -- Drop la table V1 (toutes ses données sont dans V2)
    DROP TABLE public.ecritures_comptables CASCADE;
    RAISE NOTICE '✓ DROP TABLE ecritures_comptables';
  ELSIF v_kind = 'v' THEN
    RAISE NOTICE '→ V1 est déjà une VIEW — drop pour recréation';
    DROP VIEW public.ecritures_comptables CASCADE;
  ELSE
    RAISE EXCEPTION 'public.ecritures_comptables : type % inattendu', v_kind;
  END IF;

  -- Recréer comme VUE transparente sur V2 (mappe les colonnes V1 → V2)
  -- pour compat backward avec les scripts legacy qui pourraient encore
  -- l'utiliser. Avec un INSTEAD OF trigger pour rediriger les INSERT vers
  -- V2 directement (et éviter les doublons côté lecture).
  CREATE VIEW public.ecritures_comptables AS
  SELECT
    v2.id,
    d.id AS dossier_id,
    v2.date_ecriture,
    v2.numero_compte AS compte,
    v2.libelle,
    v2.debit_mur AS debit,
    v2.credit_mur AS credit,
    v2.journal,
    v2.numero_piece,
    v2.ref_folio,
    v2.lettre,
    v2.date_lettrage,
    v2.facture_id,
    v2.created_at
  FROM public.ecritures_comptables_v2 v2
  LEFT JOIN public.dossiers d
    ON d.societe_id = v2.societe_id;

  COMMENT ON VIEW public.ecritures_comptables IS
    'VUE backward-compat sur ecritures_comptables_v2. NE PLUS UTILISER pour '
    'de nouvelles routes — utiliser directement ecritures_comptables_v2. '
    'Mapping : compte→numero_compte, debit→debit_mur, credit→credit_mur, '
    'dossier_id obtenu via JOIN dossiers.';

  -- Trigger INSTEAD OF INSERT pour rediriger les écritures legacy vers V2.
  -- Si du code écrit encore dans `ecritures_comptables`, ça atterrit dans V2.
  CREATE OR REPLACE FUNCTION public.ecritures_comptables_v1_redirect_insert()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $func$
  DECLARE
    v_societe_id UUID;
  BEGIN
    SELECT societe_id INTO v_societe_id FROM public.dossiers WHERE id = NEW.dossier_id;
    INSERT INTO public.ecritures_comptables_v2 (
      societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_piece,
      numero_compte, libelle, description, debit_mur, credit_mur, exercice,
      lettre, date_lettrage, facture_id
    ) VALUES (
      v_societe_id, NEW.dossier_id, NEW.date_ecriture, COALESCE(NEW.journal, 'OD'),
      NEW.ref_folio, NEW.numero_piece, NEW.compte, NEW.libelle, NEW.libelle,
      COALESCE(NEW.debit, 0), COALESCE(NEW.credit, 0), TO_CHAR(NEW.date_ecriture, 'YYYY'),
      NEW.lettre, NEW.date_lettrage, NEW.facture_id
    );
    RETURN NEW;
  END;
  $func$;

  CREATE OR REPLACE TRIGGER trg_v1_redirect_insert
  INSTEAD OF INSERT ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.ecritures_comptables_v1_redirect_insert();

  RAISE NOTICE '✓ V1 recréée comme VIEW transparente sur V2';
  RAISE NOTICE '✓ Trigger INSTEAD OF INSERT redirige les writes legacy vers V2';
END $$;

-- ── Vérification ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_kind TEXT;
  v_count_v1 INT;
  v_count_v2 INT;
BEGIN
  SELECT relkind INTO v_kind FROM pg_class WHERE oid = 'public.ecritures_comptables'::regclass;
  SELECT COUNT(*) INTO v_count_v1 FROM public.ecritures_comptables;
  SELECT COUNT(*) INTO v_count_v2 FROM public.ecritures_comptables_v2;

  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Migration 230 — V2 = source unique';
  RAISE NOTICE '   ecritures_comptables : % (kind=%, devrait être v=VIEW)', v_count_v1, v_kind;
  RAISE NOTICE '   ecritures_comptables_v2 : % lignes', v_count_v2;
  IF v_count_v1 = v_count_v2 THEN
    RAISE NOTICE '   ✓ Cohérent (V1 vue reflète V2)';
  ELSE
    RAISE WARNING '   ⚠️ V1 (%) ≠ V2 (%) — investiguer', v_count_v1, v_count_v2;
  END IF;
END $$;
