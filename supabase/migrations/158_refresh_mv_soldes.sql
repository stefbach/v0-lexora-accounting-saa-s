-- ============================================================================
-- Migration 157: Fonction helper REFRESH MV mv_soldes_comptes_exercice
-- ============================================================================
-- La vue matérialisée mv_soldes_comptes_exercice (migration 152) ne se
-- rafraîchit pas automatiquement. Cette fonction permet à un appel RPC
-- (app/api/comptable/grand-livre/refresh-mv) de forcer le REFRESH.
--
-- Prérequis : index UNIQUE idx_mv_soldes_key (créé en migration 152) pour
-- supporter REFRESH MATERIALIZED VIEW CONCURRENTLY.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_refresh_mv_soldes()
RETURNS void
LANGUAGE sql
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_soldes_comptes_exercice;
$$;

COMMENT ON FUNCTION fn_refresh_mv_soldes IS
  'Rafraîchit mv_soldes_comptes_exercice en mode CONCURRENTLY (pas de lock).';
