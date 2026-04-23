-- ═══════════════════════════════════════════════════════════════
-- Migration 192 — FIX audit : RLS manquante sur disturbance_heures_detail
--
-- Audit externe a identifié que la table disturbance_heures_detail
-- (sprint G9 Disturbance Allowance S.17A) n'avait pas de RLS activée.
-- N'importe quel user authentifié pouvait lire / écrire.
--
-- Fix : ENABLE RLS + policy FOR ALL réservée admin + rh
-- (aligné sur les autres modules RH sensibles).
-- Idempotent : DROP POLICY IF EXISTS avant CREATE POLICY.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.disturbance_heures_detail ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_rh_access_disturbance_detail"
  ON public.disturbance_heures_detail;

CREATE POLICY "admin_rh_access_disturbance_detail"
  ON public.disturbance_heures_detail
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'rh'))
  WITH CHECK (public.get_my_role() IN ('admin', 'rh'));

COMMENT ON POLICY "admin_rh_access_disturbance_detail" ON public.disturbance_heures_detail IS
  'Fix audit 192 : lecture/écriture limitée aux rôles admin et rh.';
