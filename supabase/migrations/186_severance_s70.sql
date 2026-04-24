-- ============================================================
-- Migration 186 — Sprint G12
--
-- Severance Allowance (Workers' Rights Act 2019 Section 70).
--
-- FORMULE :
--   severance = mois_remuneration × 3 × (anciennete_en_mois / 12)
--   avec mois_remuneration = MAX(dernier_mois_complet, moyenne_12_derniers_mois)
--
-- ÉLIGIBILITÉ : >= 12 mois d'ancienneté continue.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.severance_calculs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,

  date_licenciement DATE NOT NULL,
  motif_licenciement TEXT,

  date_arrivee DATE NOT NULL,
  anciennete_annees INTEGER NOT NULL DEFAULT 0,
  anciennete_mois_additionnels INTEGER NOT NULL DEFAULT 0,
  anciennete_total_mois NUMERIC NOT NULL DEFAULT 0,

  dernier_mois_remuneration NUMERIC NOT NULL DEFAULT 0,
  moyenne_12_mois NUMERIC NOT NULL DEFAULT 0,
  mois_remuneration_retenu NUMERIC NOT NULL DEFAULT 0,
  base_mois_retenue TEXT,

  severance_brut NUMERIC NOT NULL DEFAULT 0,

  deduction_gratifications NUMERIC DEFAULT 0,
  deduction_pension_privee NUMERIC DEFAULT 0,
  deduction_prgf NUMERIC DEFAULT 0,
  deduction_total NUMERIC DEFAULT 0,

  severance_net NUMERIC NOT NULL DEFAULT 0,

  statut TEXT NOT NULL DEFAULT 'simulation',
  date_paiement DATE,
  bulletin_paiement_id UUID REFERENCES public.bulletins_paie(id) ON DELETE SET NULL,

  commentaire TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'severance_motif_check') THEN
    ALTER TABLE public.severance_calculs ADD CONSTRAINT severance_motif_check
      CHECK (motif_licenciement IS NULL OR motif_licenciement IN
        ('non_justifie', 'redundancy_injustifiee', 'cdd_avant_terme', 'autre'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'severance_base_check') THEN
    ALTER TABLE public.severance_calculs ADD CONSTRAINT severance_base_check
      CHECK (base_mois_retenue IS NULL OR base_mois_retenue IN ('dernier_mois', 'moyenne_12'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'severance_statut_check') THEN
    ALTER TABLE public.severance_calculs ADD CONSTRAINT severance_statut_check
      CHECK (statut IN ('simulation', 'valide', 'paye', 'annule'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_severance_employe ON public.severance_calculs(employe_id);
CREATE INDEX IF NOT EXISTS idx_severance_societe ON public.severance_calculs(societe_id, date_licenciement DESC);
CREATE INDEX IF NOT EXISTS idx_severance_statut ON public.severance_calculs(statut);

COMMENT ON TABLE public.severance_calculs IS
  'G12 - WRA S.70 Severance Allowance. Simulations + validations + paiements.';

-- Trigger updated_at.
CREATE OR REPLACE FUNCTION public.trg_severance_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $fn$;

DROP TRIGGER IF EXISTS trg_severance_updated_at ON public.severance_calculs;
CREATE TRIGGER trg_severance_updated_at
BEFORE UPDATE ON public.severance_calculs
FOR EACH ROW EXECUTE FUNCTION public.trg_severance_updated();

-- RLS : admin + rh uniquement.
ALTER TABLE public.severance_calculs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "severance_rh_all" ON public.severance_calculs;
CREATE POLICY "severance_rh_all" ON public.severance_calculs FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','rh')
));

-- ─── RPC calculer_severance ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculer_severance(
  p_employe_id UUID,
  p_date_licenciement DATE DEFAULT CURRENT_DATE,
  p_deduction_gratifications NUMERIC DEFAULT 0,
  p_deduction_pension_privee NUMERIC DEFAULT 0,
  p_deduction_prgf NUMERIC DEFAULT 0
) RETURNS TABLE (
  employe_id UUID,
  date_arrivee DATE,
  anciennete_annees INTEGER,
  anciennete_mois_additionnels INTEGER,
  anciennete_total_mois NUMERIC,
  dernier_mois_remuneration NUMERIC,
  moyenne_12_mois NUMERIC,
  mois_remuneration_retenu NUMERIC,
  base_mois_retenue TEXT,
  severance_brut NUMERIC,
  deduction_total NUMERIC,
  severance_net NUMERIC,
  eligible BOOLEAN,
  motif_non_eligible TEXT
) LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_employe RECORD;
  v_anciennete_mois NUMERIC;
  v_annees INTEGER;
  v_mois_add INTEGER;
  v_dernier_mois NUMERIC := 0;
  v_moyenne_12 NUMERIC := 0;
  v_mois_retenu NUMERIC := 0;
  v_base TEXT;
  v_severance_brut NUMERIC := 0;
  v_deduction NUMERIC;
  v_severance_net NUMERIC;
BEGIN
  SELECT * INTO v_employe FROM public.employes WHERE id = p_employe_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_employe_id, NULL::DATE, 0, 0, 0::NUMERIC, 0::NUMERIC,
      0::NUMERIC, 0::NUMERIC, NULL::TEXT, 0::NUMERIC, 0::NUMERIC,
      0::NUMERIC, FALSE, 'employe_inexistant'::TEXT;
    RETURN;
  END IF;

  IF v_employe.date_arrivee IS NULL THEN
    RETURN QUERY SELECT p_employe_id, NULL::DATE, 0, 0, 0::NUMERIC, 0::NUMERIC,
      0::NUMERIC, 0::NUMERIC, NULL::TEXT, 0::NUMERIC, 0::NUMERIC,
      0::NUMERIC, FALSE, 'date_arrivee_manquante'::TEXT;
    RETURN;
  END IF;

  v_anciennete_mois := ROUND(
    (EXTRACT(EPOCH FROM (p_date_licenciement::timestamp - v_employe.date_arrivee::timestamp))
     / (30.4375 * 86400))::NUMERIC, 2
  );

  IF v_anciennete_mois < 12 THEN
    RETURN QUERY SELECT p_employe_id, v_employe.date_arrivee, 0, 0, v_anciennete_mois,
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC, NULL::TEXT, 0::NUMERIC, 0::NUMERIC,
      0::NUMERIC, FALSE, 'anciennete_inferieure_12_mois'::TEXT;
    RETURN;
  END IF;

  v_annees := FLOOR(v_anciennete_mois / 12)::INTEGER;
  v_mois_add := FLOOR(v_anciennete_mois - (v_annees * 12))::INTEGER;

  -- Dernier mois complet : bulletin le plus récent AVANT date_licenciement.
  SELECT COALESCE(b.salaire_brut, 0) INTO v_dernier_mois
  FROM public.bulletins_paie b
  WHERE b.employe_id = p_employe_id
    AND b.periode < p_date_licenciement
    AND b.statut IN ('valide', 'comptabilise', 'paye')
  ORDER BY b.periode DESC
  LIMIT 1;

  -- Moyenne 12 derniers mois (earnings complètes).
  SELECT COALESCE(AVG(b.salaire_brut + COALESCE(b.heures_sup_montant, 0)), 0)
  INTO v_moyenne_12
  FROM public.bulletins_paie b
  WHERE b.employe_id = p_employe_id
    AND b.periode >= (p_date_licenciement - INTERVAL '12 months')
    AND b.periode < p_date_licenciement
    AND b.statut IN ('valide', 'comptabilise', 'paye');

  IF COALESCE(v_dernier_mois, 0) >= COALESCE(v_moyenne_12, 0) THEN
    v_mois_retenu := COALESCE(v_dernier_mois, 0);
    v_base := 'dernier_mois';
  ELSE
    v_mois_retenu := COALESCE(v_moyenne_12, 0);
    v_base := 'moyenne_12';
  END IF;

  v_severance_brut := ROUND((v_mois_retenu * 3 * (v_anciennete_mois / 12))::NUMERIC, 2);

  v_deduction := COALESCE(p_deduction_gratifications, 0)
               + COALESCE(p_deduction_pension_privee, 0)
               + COALESCE(p_deduction_prgf, 0);

  v_severance_net := GREATEST(v_severance_brut - v_deduction, 0);

  RETURN QUERY SELECT
    p_employe_id, v_employe.date_arrivee, v_annees, v_mois_add, v_anciennete_mois,
    COALESCE(v_dernier_mois, 0), COALESCE(v_moyenne_12, 0),
    v_mois_retenu, v_base,
    v_severance_brut, v_deduction, v_severance_net,
    TRUE, NULL::TEXT;
END $fn$;

COMMENT ON FUNCTION public.calculer_severance(UUID, DATE, NUMERIC, NUMERIC, NUMERIC) IS
  'G12 - WRA S.70 : 3 mois × anciennete × max(dernier_mois, moyenne_12). Retourne non-eligible si <12 mois.';
