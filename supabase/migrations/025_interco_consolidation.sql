-- =============================================================================
-- Migration 025 — INTERCO Multi-Sociétés + Consolidation
-- =============================================================================

-- Table des flux interco
CREATE TABLE IF NOT EXISTS public.flux_interco (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_emettrice_id    UUID REFERENCES public.societes(id) ON DELETE CASCADE NOT NULL,
  societe_receptrice_id   UUID REFERENCES public.societes(id) ON DELETE CASCADE NOT NULL,
  date_flux               DATE NOT NULL,
  description             TEXT NOT NULL,
  montant_mur             NUMERIC(15,2) NOT NULL,
  devise                  TEXT DEFAULT 'MUR',
  montant_devise          NUMERIC(15,4),
  taux_change             NUMERIC(12,6) DEFAULT 1,
  type_flux               TEXT CHECK (type_flux IN ('mise_a_disposition','refacturation','pret','dividende','remboursement','avance')),
  document_id             UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  compte_debit            TEXT DEFAULT '451',
  compte_credit           TEXT DEFAULT '451',
  statut_reconciliation   TEXT DEFAULT 'en_attente' CHECK (statut_reconciliation IN ('en_attente','reconcilie','litige')),
  reconcilie_avec_id      UUID REFERENCES public.flux_interco(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE public.flux_interco ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flux_interco_admin_comptable_full" ON public.flux_interco
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','comptable','comptable_dedie')
    )
  );

-- =============================================================================
-- Vue réconciliation interco
-- =============================================================================

CREATE OR REPLACE VIEW public.reconciliation_interco AS
SELECT
  LEAST(f.societe_emettrice_id, f.societe_receptrice_id)     AS societe_a_id,
  GREATEST(f.societe_emettrice_id, f.societe_receptrice_id)  AS societe_b_id,
  sa.nom                                                      AS societe_a_nom,
  sb.nom                                                      AS societe_b_nom,
  SUM(CASE WHEN f.societe_emettrice_id < f.societe_receptrice_id
           THEN f.montant_mur ELSE 0 END)                    AS flux_a_vers_b,
  SUM(CASE WHEN f.societe_emettrice_id > f.societe_receptrice_id
           THEN f.montant_mur ELSE 0 END)                    AS flux_b_vers_a,
  SUM(CASE WHEN f.societe_emettrice_id < f.societe_receptrice_id
           THEN f.montant_mur
           ELSE -f.montant_mur END)                          AS ecart_net,
  COUNT(*)                                                    AS nb_flux,
  SUM(CASE WHEN f.statut_reconciliation = 'reconcilie'
           THEN 1 ELSE 0 END)                                AS nb_reconcilies,
  SUM(CASE WHEN f.statut_reconciliation = 'litige'
           THEN 1 ELSE 0 END)                                AS nb_litiges
FROM public.flux_interco f
JOIN public.societes sa ON sa.id = LEAST(f.societe_emettrice_id, f.societe_receptrice_id)
JOIN public.societes sb ON sb.id = GREATEST(f.societe_emettrice_id, f.societe_receptrice_id)
GROUP BY
  LEAST(f.societe_emettrice_id, f.societe_receptrice_id),
  GREATEST(f.societe_emettrice_id, f.societe_receptrice_id),
  sa.nom,
  sb.nom;

-- =============================================================================
-- Index
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_flux_interco_emettrice ON public.flux_interco(societe_emettrice_id);
CREATE INDEX IF NOT EXISTS idx_flux_interco_receptrice ON public.flux_interco(societe_receptrice_id);
CREATE INDEX IF NOT EXISTS idx_flux_interco_date ON public.flux_interco(date_flux);
CREATE INDEX IF NOT EXISTS idx_flux_interco_type ON public.flux_interco(type_flux);
CREATE INDEX IF NOT EXISTS idx_flux_interco_statut ON public.flux_interco(statut_reconciliation);
