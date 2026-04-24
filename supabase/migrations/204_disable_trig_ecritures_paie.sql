-- ============================================================================
-- Migration 169 — Désactiver trig_ecritures_paie (pipeline OD-PAIE obsolète)
-- ============================================================================
--
-- Contexte : 2 pipelines de génération d'écritures paie coexistaient :
--   A) SAL agrégé mensuel — via `/api/rh/import-paie` (TS route)
--      Écrit 1 batch par mois sur 4210/4311/4312/... en journal SAL.
--      Utilisé en prod.
--   B) OD-PAIE par bulletin — via RPC `generer_ecritures_paie(bulletin_id)`
--      fire par le trigger `trig_ecritures_paie` sur UPDATE bulletins_paie
--      (quand statut transitionne vers 'valide').
--      Reste d'une architecture antérieure, plus utilisé.
--
-- Problème : quand les 2 tournent (bulletin créé brouillon puis validé +
-- mensuel import-paie), on a des doublons sur toutes les comptes 421x/43xx.
--
-- Décision : on garde SAL comme source unique. Le trigger B est désactivé
-- (pas supprimé — la fonction reste dispo si besoin de re-basculer un jour).
--
-- IDEMPOTENTE. REVERSIBLE via `ENABLE TRIGGER`.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.bulletins_paie'::regclass
      AND tgname = 'trig_ecritures_paie'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE public.bulletins_paie DISABLE TRIGGER trig_ecritures_paie;
    RAISE NOTICE '▶ Migration 169 : trigger trig_ecritures_paie désactivé';
    RAISE NOTICE '  Pipeline paie unifié sur SAL (via /api/rh/import-paie).';
    RAISE NOTICE '  La fonction generer_ecritures_paie reste disponible pour appel manuel.';
  ELSE
    RAISE NOTICE '▶ Migration 169 : trigger absent, rien à faire.';
  END IF;
END $$;

-- Pour réactiver plus tard (si basculement vers OD-PAIE souhaité) :
--   ALTER TABLE public.bulletins_paie ENABLE TRIGGER trig_ecritures_paie;
--
-- AVANT réactivation, IMPORTANT : purger les lignes SAL existantes pour le
-- même bulletin, sinon doublons immédiats (SAL mensuel + OD-PAIE par bulletin).
