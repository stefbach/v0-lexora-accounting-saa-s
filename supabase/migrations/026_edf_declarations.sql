-- =============================================================================
-- Migration 026 — Déclarations EDF Annuelles MRA
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.declarations_edf (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id              UUID REFERENCES public.societes(id) ON DELETE CASCADE NOT NULL,
  exercice                TEXT NOT NULL,              -- ex: "FY2024-2025"
  annee_assessment        TEXT,                       -- ex: "2025"
  nb_employes             INTEGER DEFAULT 0,
  total_salaires_bruts    NUMERIC(15,2) DEFAULT 0,
  total_csg_salarie       NUMERIC(15,2) DEFAULT 0,
  total_csg_patronal      NUMERIC(15,2) DEFAULT 0,
  total_paye              NUMERIC(15,2) DEFAULT 0,
  total_nsf               NUMERIC(15,2) DEFAULT 0,
  total_training_levy     NUMERIC(15,2) DEFAULT 0,
  total_prgf              NUMERIC(15,2) DEFAULT 0,
  date_limite             DATE,
  date_soumission         DATE,
  reference_mra           TEXT,
  statut                  TEXT DEFAULT 'a_faire' CHECK (statut IN ('a_faire','en_cours','soumis','accepte')),
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, exercice)
);

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE public.declarations_edf ENABLE ROW LEVEL SECURITY;

CREATE POLICY "declarations_edf_admin_comptable_full" ON public.declarations_edf
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','comptable','comptable_dedie')
    )
  );

CREATE POLICY "declarations_edf_client_read" ON public.declarations_edf
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('client_admin','client_user')
    )
    AND EXISTS (
      SELECT 1 FROM public.societes s
      JOIN public.dossiers d ON d.societe_id = s.id
      WHERE s.id = declarations_edf.societe_id
        AND d.client_id = auth.uid()
    )
  );

-- =============================================================================
-- Index
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_declarations_edf_societe ON public.declarations_edf(societe_id);
CREATE INDEX IF NOT EXISTS idx_declarations_edf_exercice ON public.declarations_edf(exercice);
CREATE INDEX IF NOT EXISTS idx_declarations_edf_statut ON public.declarations_edf(statut);
