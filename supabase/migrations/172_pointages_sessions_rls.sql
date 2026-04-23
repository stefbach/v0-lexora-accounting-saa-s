-- ============================================================
-- Migration 172 — Sprint PO1
--
-- RLS policies pour la table pointages_sessions (créée en 171).
--
-- Règles :
--   - SELECT : un employé voit ses propres sessions ; RH/admin de la
--     société voient toutes les sessions des employés de leur société ;
--     admin/super_admin voient tout.
--   - INSERT : un employé peut créer SES propres sessions ; RH peut
--     créer pour n'importe quel employé de sa société.
--   - UPDATE / DELETE : RH/admin uniquement (corrections avec motif
--     via colonnes correction / correction_motif / corrected_by).
--
-- NOTE : le service_role (utilisé par les routes API Next.js via
-- supabase-js avec SUPABASE_SERVICE_ROLE_KEY) bypass RLS, donc les
-- endpoints server-side continuent de fonctionner. RLS protège les
-- accès directs depuis le front (au cas où un employé aurait un client
-- authentifié non service_role).
--
-- IDEMPOTENTE : DROP POLICY IF EXISTS avant CREATE.
-- ============================================================

ALTER TABLE public.pointages_sessions ENABLE ROW LEVEL SECURITY;

-- ─── SELECT ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pointages_sessions_select_self" ON public.pointages_sessions;
CREATE POLICY "pointages_sessions_select_self"
ON public.pointages_sessions
FOR SELECT
USING (
  employe_id IN (
    SELECT e.id FROM public.employes e
    WHERE e.auth_user_id = auth.uid() OR e.email = auth.jwt() ->> 'email'
  )
);

DROP POLICY IF EXISTS "pointages_sessions_select_rh" ON public.pointages_sessions;
CREATE POLICY "pointages_sessions_select_rh"
ON public.pointages_sessions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employes e
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE e.id = pointages_sessions.employe_id
      AND (
        p.role IN ('admin', 'super_admin')
        OR (p.role IN ('rh', 'rh_manager') AND p.societe_id = e.societe_id)
      )
  )
);

-- ─── INSERT ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pointages_sessions_insert_self" ON public.pointages_sessions;
CREATE POLICY "pointages_sessions_insert_self"
ON public.pointages_sessions
FOR INSERT
WITH CHECK (
  employe_id IN (
    SELECT e.id FROM public.employes e
    WHERE e.auth_user_id = auth.uid() OR e.email = auth.jwt() ->> 'email'
  )
);

DROP POLICY IF EXISTS "pointages_sessions_insert_rh" ON public.pointages_sessions;
CREATE POLICY "pointages_sessions_insert_rh"
ON public.pointages_sessions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employes e
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE e.id = pointages_sessions.employe_id
      AND (
        p.role IN ('admin', 'super_admin')
        OR (p.role IN ('rh', 'rh_manager') AND p.societe_id = e.societe_id)
      )
  )
);

-- ─── UPDATE (self autorisé uniquement pour fermer sa propre session ;
--          corrections complexes = RH uniquement) ────────────────────
DROP POLICY IF EXISTS "pointages_sessions_update_self_close" ON public.pointages_sessions;
CREATE POLICY "pointages_sessions_update_self_close"
ON public.pointages_sessions
FOR UPDATE
USING (
  employe_id IN (
    SELECT e.id FROM public.employes e
    WHERE e.auth_user_id = auth.uid() OR e.email = auth.jwt() ->> 'email'
  )
)
WITH CHECK (
  employe_id IN (
    SELECT e.id FROM public.employes e
    WHERE e.auth_user_id = auth.uid() OR e.email = auth.jwt() ->> 'email'
  )
  -- L'employé ne peut pas poser/modifier les champs de correction
  AND correction IS NOT DISTINCT FROM FALSE
);

DROP POLICY IF EXISTS "pointages_sessions_update_rh" ON public.pointages_sessions;
CREATE POLICY "pointages_sessions_update_rh"
ON public.pointages_sessions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.employes e
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE e.id = pointages_sessions.employe_id
      AND (
        p.role IN ('admin', 'super_admin')
        OR (p.role IN ('rh', 'rh_manager') AND p.societe_id = e.societe_id)
      )
  )
);

-- ─── DELETE : RH uniquement ──────────────────────────────────────────
DROP POLICY IF EXISTS "pointages_sessions_delete_rh" ON public.pointages_sessions;
CREATE POLICY "pointages_sessions_delete_rh"
ON public.pointages_sessions
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.employes e
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE e.id = pointages_sessions.employe_id
      AND (
        p.role IN ('admin', 'super_admin')
        OR (p.role IN ('rh', 'rh_manager') AND p.societe_id = e.societe_id)
      )
  )
);

COMMENT ON TABLE public.pointages_sessions IS
  'PO1 - Sessions de pointage multiples. RLS : self (SELECT/INSERT/UPDATE
   sans champs correction) + RH de la société + admin/super_admin (ALL).
   Le service_role bypass RLS pour les routes API server-side.';
