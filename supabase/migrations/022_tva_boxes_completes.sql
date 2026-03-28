-- ============================================================
-- LEXORA — Migration 022: TVA Boxes 4-9 complètes (Sprint 9)
-- Mise à jour de tva_mensuelle avec toutes les cases MRA
-- ============================================================

-- Ajouter les colonnes TVA boxes 4-9
ALTER TABLE public.tva_mensuelle
  ADD COLUMN IF NOT EXISTS box1_output_standard    NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box2_exports_taxable     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box3_exempt_supplies     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box4_reverse_charge_output NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box5_reverse_charge_input  NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box6_exports_zero_rated  NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box7_capital_goods       NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box8_bad_debt_relief     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box9_input_other         NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalites_retard         NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interets_retard          NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reference_declaration_mra TEXT,
  ADD COLUMN IF NOT EXISTS date_soumission          DATE,
  ADD COLUMN IF NOT EXISTS mode_declaration         TEXT DEFAULT 'mensuel'
    CHECK (mode_declaration IN ('mensuel','trimestriel','annuel'));

-- Index sur societe_id pour les nouveaux lookups
CREATE INDEX IF NOT EXISTS idx_tva_societe_periode
  ON public.tva_mensuelle(societe_id, periode);

-- ============================================================
-- Vue TVA recap : récapitulatif avec calcul automatique
-- ============================================================
DROP VIEW IF EXISTS public.tva_recap CASCADE;

CREATE OR REPLACE VIEW public.tva_recap AS
SELECT
  t.*,
  -- TVA nette à payer
  COALESCE(t.box1_output_standard, t.tva_collectee, 0)
    + COALESCE(t.box4_reverse_charge_output, 0)
    - COALESCE(t.tva_deductible, 0)
    - COALESCE(t.box5_reverse_charge_input, 0)
    - COALESCE(t.box7_capital_goods, 0)
    - COALESCE(t.box8_bad_debt_relief, 0)
    - COALESCE(t.credit_reporte, 0)                AS tva_nette_calculee,
  -- Statut retard : date limite dépassée et non déclaré
  CASE
    WHEN t.statut_declaration = 'a_faire'
         AND t.date_limite < CURRENT_DATE
    THEN true
    ELSE false
  END                                               AS en_retard,
  -- Nombre de jours de retard
  CASE
    WHEN t.statut_declaration = 'a_faire'
         AND t.date_limite < CURRENT_DATE
    THEN (CURRENT_DATE - t.date_limite)
    ELSE 0
  END                                               AS jours_retard,
  -- Pénalités calculées : 2%/mois de retard sur montant dû
  CASE
    WHEN t.statut_declaration = 'a_faire'
         AND t.date_limite < CURRENT_DATE
    THEN ROUND(
      GREATEST(
        COALESCE(t.box1_output_standard, t.tva_collectee, 0)
          + COALESCE(t.box4_reverse_charge_output, 0)
          - COALESCE(t.tva_deductible, 0)
          - COALESCE(t.box5_reverse_charge_input, 0)
          - COALESCE(t.credit_reporte, 0),
        0
      ) * 0.02 * CEIL((CURRENT_DATE - t.date_limite)::NUMERIC / 30),
      2
    )
    ELSE COALESCE(t.penalites_retard, 0)
  END                                               AS penalites_calculees
FROM public.tva_mensuelle t;
