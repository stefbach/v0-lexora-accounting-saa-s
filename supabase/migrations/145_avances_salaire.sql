-- Migration 145 : Sprint 15 FIX 1 — Avances sur salaire (WRA Art. 29)
-- =====================================================================
-- L'employeur peut consentir une avance. Déduction max = 50% du net/mois.

CREATE TABLE IF NOT EXISTS public.avances_salaire (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  montant_total NUMERIC(12,2) NOT NULL,
  mensualite NUMERIC(12,2) NOT NULL,
  solde_restant NUMERIC(12,2) NOT NULL,
  date_octroi DATE NOT NULL,
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif', 'rembourse', 'annule')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_avances_employe ON public.avances_salaire(employe_id);
CREATE INDEX IF NOT EXISTS idx_avances_societe ON public.avances_salaire(societe_id);

ALTER TABLE public.avances_salaire ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "rh_full_avances" ON public.avances_salaire FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
