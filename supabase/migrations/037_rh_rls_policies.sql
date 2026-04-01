-- Migration 037: RLS policies for RH tables
-- Ensures users can only access RH data for their own societe(s)

-- ═══════════════════════════════════════════════════════════
-- Enable RLS on all RH tables
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletins_paie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pointages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demandes_conges ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- Drop existing policies if any (idempotent)
-- ═══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "rh_employes_access" ON public.employes;
DROP POLICY IF EXISTS "rh_bulletins_paie_access" ON public.bulletins_paie;
DROP POLICY IF EXISTS "rh_pointages_access" ON public.pointages;
DROP POLICY IF EXISTS "rh_demandes_conges_access" ON public.demandes_conges;

-- ═══════════════════════════════════════════════════════════
-- EMPLOYES: users can see employees of their societe
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "rh_employes_access" ON public.employes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND (
      p.role IN ('admin', 'super_admin')
      OR p.societe_id = employes.societe_id
      OR EXISTS (
        SELECT 1 FROM public.dossiers d
        WHERE d.client_id = auth.uid()
        AND d.societe_id = employes.societe_id
      )
    )
  )
);

-- ═══════════════════════════════════════════════════════════
-- BULLETINS_PAIE: same scope as employes
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "rh_bulletins_paie_access" ON public.bulletins_paie FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND (
      p.role IN ('admin', 'super_admin')
      OR p.societe_id = bulletins_paie.societe_id
      OR EXISTS (
        SELECT 1 FROM public.dossiers d
        WHERE d.client_id = auth.uid()
        AND d.societe_id = bulletins_paie.societe_id
      )
    )
  )
);

-- ═══════════════════════════════════════════════════════════
-- POINTAGES: access via employe's societe
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "rh_pointages_access" ON public.pointages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.employes e
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE e.id = pointages.employe_id
    AND (
      p.role IN ('admin', 'super_admin')
      OR p.societe_id = e.societe_id
      OR EXISTS (
        SELECT 1 FROM public.dossiers d
        WHERE d.client_id = auth.uid()
        AND d.societe_id = e.societe_id
      )
    )
  )
);

-- ═══════════════════════════════════════════════════════════
-- DEMANDES_CONGES: access via employe's societe
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "rh_demandes_conges_access" ON public.demandes_conges FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.employes e
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE e.id = demandes_conges.employe_id
    AND (
      p.role IN ('admin', 'super_admin')
      OR p.societe_id = e.societe_id
      OR EXISTS (
        SELECT 1 FROM public.dossiers d
        WHERE d.client_id = auth.uid()
        AND d.societe_id = e.societe_id
      )
    )
  )
);
