-- ============================================================================
-- admin_slow_queries — Helper RPC pour /api/admin/slow-queries
-- ============================================================================
--
-- À exécuter UNE FOIS côté Supabase (Dashboard → SQL Editor) :
--   1. Activer l'extension pg_stat_statements depuis Database → Extensions.
--   2. Exécuter ce fichier.
--
-- Idempotente. Réservée au service-role.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_slow_queries(p_limit INT DEFAULT 50)
RETURNS TABLE (
  query                TEXT,
  calls                BIGINT,
  total_exec_time_ms   DOUBLE PRECISION,
  mean_exec_time_ms    DOUBLE PRECISION,
  rows                 BIGINT,
  shared_blks_hit      BIGINT,
  shared_blks_read     BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.query,
    s.calls,
    s.total_exec_time AS total_exec_time_ms,
    s.mean_exec_time  AS mean_exec_time_ms,
    s.rows,
    s.shared_blks_hit,
    s.shared_blks_read
  FROM extensions.pg_stat_statements s
  WHERE
    -- Exclude Supabase / PostgREST / internal noise
        s.query NOT ILIKE 'BEGIN%'
    AND s.query NOT ILIKE 'COMMIT%'
    AND s.query NOT ILIKE 'ROLLBACK%'
    AND s.query NOT ILIKE 'SET %'
    AND s.query NOT ILIKE 'SHOW %'
    AND s.query NOT ILIKE 'DEALLOCATE%'
    AND s.query NOT ILIKE 'DISCARD%'
    AND s.query NOT ILIKE '%pg_catalog%'
    AND s.query NOT ILIKE '%information_schema%'
    AND s.query NOT ILIKE '%pgrst%'
    AND s.query NOT ILIKE '%pgbouncer%'
    AND s.query NOT ILIKE '%supabase_admin%'
    AND s.query NOT ILIKE '%pg_stat_statements%'
  ORDER BY s.total_exec_time DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_slow_queries(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_slow_queries(INT) TO service_role;
