-- ============================================================================
-- Migration 236 — ecritures_comptables_v2 : societe_id / dossier_id NOT NULL
-- ============================================================================
--
-- Audit (2026-05-11) :
-- La table ecritures_comptables_v2 (créée mig 007) n'a JAMAIS forcé NOT NULL
-- sur societe_id ni sur dossier_id. Une écriture orpheline (societe_id NULL)
-- est invisible des RLS tenant-scoped (user_has_societe_access(NULL) = false)
-- mais visible des policies admin/comptable. Risque :
--   • Écritures perdues du P&L tenant (filter .eq('societe_id', X) skip NULL)
--   • Lettres déséquilibrées (GROUP BY societe_id, lettre groupe les NULL)
--   • Trous d'audit : on ne sait pas à qui appartient l'écriture
--
-- Cette migration :
--   1. BACKFILL : pour les écritures orphelines, tente de récupérer le
--      societe_id depuis le facture_id ou le document_id liés. Si rien
--      ne match, on supprime l'écriture (orpheline irrécupérable).
--   2. ALTER : pose NOT NULL sur societe_id (impératif). Pour dossier_id,
--      on tolère encore NULL si une société n'a pas de dossier actif
--      (cas multi-dossiers, transition exercice) — on log mais on ne
--      bloque pas. À revoir si tous les flux d'écriture passent par un
--      dossier (mig 237 si besoin).
--
-- IDEMPOTENTE : peut être rejouée sans effet de bord.
-- ============================================================================

DO $$
DECLARE
  v_orphans_avant      INT;
  v_recovered_facture  INT := 0;
  v_recovered_document INT := 0;
  v_deleted            INT := 0;
  v_orphans_apres      INT;
  v_dossier_nulls      INT;
BEGIN
  SELECT COUNT(*) INTO v_orphans_avant
    FROM public.ecritures_comptables_v2 WHERE societe_id IS NULL;

  RAISE NOTICE '──────────────────────────────────────────────────────';
  RAISE NOTICE 'Migration 236 — état initial : % écritures sans societe_id', v_orphans_avant;

  -- ── 1a. Backfill via facture_id ──────────────────────────────────────
  WITH upd AS (
    UPDATE public.ecritures_comptables_v2 e
       SET societe_id = f.societe_id
      FROM public.factures f
     WHERE e.societe_id IS NULL
       AND e.facture_id IS NOT NULL
       AND f.id = e.facture_id
       AND f.societe_id IS NOT NULL
    RETURNING e.id
  )
  SELECT COUNT(*) INTO v_recovered_facture FROM upd;

  -- ── 1b. Backfill via document_id ─────────────────────────────────────
  WITH upd AS (
    UPDATE public.ecritures_comptables_v2 e
       SET societe_id = d.societe_id
      FROM public.documents d
     WHERE e.societe_id IS NULL
       AND e.document_id IS NOT NULL
       AND d.id = e.document_id
       AND d.societe_id IS NOT NULL
    RETURNING e.id
  )
  SELECT COUNT(*) INTO v_recovered_document FROM upd;

  -- ── 1c. Suppression des orphelines irrécupérables ────────────────────
  -- Ces écritures n'ont aucun lien valide vers une société : impossibles
  -- à attribuer, on les supprime (elles n'étaient déjà visibles de personne
  -- côté tenant via RLS).
  WITH del AS (
    DELETE FROM public.ecritures_comptables_v2
     WHERE societe_id IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM del;

  SELECT COUNT(*) INTO v_orphans_apres
    FROM public.ecritures_comptables_v2 WHERE societe_id IS NULL;

  RAISE NOTICE 'Backfill via facture_id  : % écritures réparées', v_recovered_facture;
  RAISE NOTICE 'Backfill via document_id : % écritures réparées', v_recovered_document;
  RAISE NOTICE 'Supprimées (irrécupérables) : % écritures', v_deleted;
  RAISE NOTICE 'Reste % orphelines (devrait être 0)', v_orphans_apres;

  IF v_orphans_apres > 0 THEN
    RAISE EXCEPTION 'Migration 236 ABORT : % orphelines restantes — fix manuel requis avant NOT NULL', v_orphans_apres;
  END IF;

  -- ── 2. ALTER : societe_id NOT NULL ────────────────────────────────────
  -- Empêche définitivement la création d'écritures sans société.
  ALTER TABLE public.ecritures_comptables_v2
    ALTER COLUMN societe_id SET NOT NULL;

  RAISE NOTICE '✓ societe_id SET NOT NULL appliqué';

  -- ── 3. État dossier_id pour info (non bloquant) ──────────────────────
  -- On ne force PAS dossier_id NOT NULL ici : certaines écritures techniques
  -- (RAN d'ouverture exercice, écart de change global société) peuvent
  -- légitimement n'avoir aucun dossier rattaché. À reconsidérer si les
  -- métriques montrent que c'est marginal.
  SELECT COUNT(*) INTO v_dossier_nulls
    FROM public.ecritures_comptables_v2 WHERE dossier_id IS NULL;
  RAISE NOTICE 'Info : % écritures sans dossier_id (toléré pour le moment)', v_dossier_nulls;

  RAISE NOTICE '──────────────────────────────────────────────────────';
  RAISE NOTICE '✓ Migration 236 terminée';
END $$;

COMMENT ON COLUMN public.ecritures_comptables_v2.societe_id IS
  'Société propriétaire de l''écriture. NOT NULL depuis migration 236 — '
  'aucune écriture ne peut être créée sans rattachement société (audit RLS).';
