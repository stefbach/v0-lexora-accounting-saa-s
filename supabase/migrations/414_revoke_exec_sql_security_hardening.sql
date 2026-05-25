-- supabase/migrations/414_revoke_exec_sql_security_hardening.sql
-- SEC-002 : retire la fonction exec_sql ouverte (DDL arbitraire SECURITY DEFINER)
--
-- Contexte :
--   La fonction public.exec_sql(sql text) était SECURITY DEFINER et accessible
--   via PostgREST RPC. Tout porteur du service-role-key (ou bypass auth futur)
--   pouvait exécuter du DDL arbitraire (DROP TABLE, désactiver RLS, créer un
--   super_admin, etc.). Voir docs/audit-partials/wave2-F-secu-critique.md SEC-002.
--
-- Décision :
--   Toutes les DDL doivent désormais passer par des migrations versionnées
--   dans supabase/migrations/ (appliquées via Supabase CLI ou Studio).
--   Les 5 routes admin qui appelaient cette RPC ont été désactivées
--   (tryAutoFixRoleConstraint -> no-op + warning, /api/admin/fix-db -> 410).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'exec_sql'
  ) THEN
    -- Étape 1 : révoquer tous les grants
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM service_role;

    -- Étape 2 : supprimer la fonction
    DROP FUNCTION public.exec_sql(text);

    RAISE NOTICE 'SEC-002 : public.exec_sql REVOKE + DROP done';
  ELSE
    RAISE NOTICE 'SEC-002 : public.exec_sql already absent — OK';
  END IF;
END $$;

-- Audit : marquer le schéma pour traçabilité
COMMENT ON SCHEMA public IS 'exec_sql removed 2026-05-24 (SEC-002). All DDL must go via supabase/migrations.';
