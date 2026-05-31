-- =====================================================================
-- Migration 455 — Nettoyage écritures comptables orphelines des bulletins
--                 EOY archivés (séquelle du bug "import EOY deux fois")
-- =====================================================================
-- Bug constaté en prod (test OCC) : avant le fix #357 + suivants, l'import
-- EOY archivait l'ancien bulletin (is_archived=true) mais NE supprimait PAS
-- ses écritures comptables (ref_folio='BP-<old_id>'). Résultat : pour chaque
-- réimport, les écritures restaient en base alors que le bulletin n'était
-- plus actif → compte 6416 (13ème mois), 4011 (CSG bonus), 4444 (PAYE) etc.
-- doublés sur la période EOY.
--
-- L'index unique partiel uq_bulletins_paie_active garantit 1 seul bulletin
-- ACTIF par (employe_id, periode), donc on peut sans risque effacer toutes
-- les écritures ref_folio='BP-<id>' où le bulletin correspondant est archivé
-- (source='eoy_bonus_import') — ces écritures ne devraient pas exister.
--
-- Cette migration est idempotente : la 2e exécution ne trouve rien à effacer.
-- =====================================================================

DO $$
DECLARE
  v_deleted INT;
BEGIN
  WITH archived_eoy AS (
    SELECT 'BP-' || id::text AS ref_folio, societe_id
    FROM public.bulletins_paie
    WHERE source = 'eoy_bonus_import'
      AND is_archived = true
  ),
  doomed AS (
    DELETE FROM public.ecritures_comptables_v2 e
    USING archived_eoy a
    WHERE e.ref_folio = a.ref_folio
      AND e.societe_id = a.societe_id
      AND e.journal = 'OD-PAIE'
    RETURNING e.id
  )
  SELECT COUNT(*) INTO v_deleted FROM doomed;

  RAISE NOTICE '[455] Cleanup EOY orphan entries: % ecritures supprimees', v_deleted;
END $$;

-- Vérification : il ne doit plus exister d'écriture OD-PAIE rattachée à un
-- bulletin EOY archivé après cette migration.
DO $$
DECLARE
  v_remaining INT;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM public.ecritures_comptables_v2 e
  JOIN public.bulletins_paie b
    ON b.id::text = REPLACE(e.ref_folio, 'BP-', '')
   AND b.source = 'eoy_bonus_import'
   AND b.is_archived = true
  WHERE e.journal = 'OD-PAIE';

  IF v_remaining > 0 THEN
    RAISE WARNING '[455] % ecritures orphelines restantes — verifier manuellement', v_remaining;
  ELSE
    RAISE NOTICE '[455] Verification OK : aucune ecriture orpheline restante.';
  END IF;
END $$;
