-- ============================================================================
-- Migration 257 — Phase I : IFRS 16 Leases (cross-cutting, toutes sociétés)
-- ============================================================================
-- IFRS 16 §22-28 : reconnaissance Right-of-Use (RoU) + Lease Liability pour
-- tout bail > 12 mois ou > USD 5,000.
-- Comptes ajoutés : 1751/1752 (dette lease LT/CT), 2151 (RoU asset),
-- 28151 (amortissement RoU), 6811 (dotation amort RoU), 6611 (intérêts lease)
-- ============================================================================

INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, niveau) VALUES
  ('1751',  'Dette de location IFRS 16 (long terme)',     'capitaux_propres', 'C', 4),
  ('1752',  'Dette de location IFRS 16 (court terme)',    'tiers',            'C', 4),
  ('2151',  'Droit d''utilisation (Right of Use)',        'immobilisation',   'D', 4),
  ('28151', 'Amortissements cumulés du droit d''utilisation', 'immobilisation','C', 5),
  ('6811',  'Dotation amortissement droit d''utilisation', 'charge',          'D', 4),
  ('6611',  'Charges d''intérêts sur dette de location IFRS 16', 'charge',    'D', 4)
ON CONFLICT (compte) DO UPDATE SET libelle = EXCLUDED.libelle;

CREATE TABLE IF NOT EXISTS public.leases (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id               UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  lessor                   TEXT NOT NULL,
  asset_description        TEXT NOT NULL,
  asset_category           TEXT NOT NULL CHECK (asset_category IN ('property','vehicle','equipment','it','other')),
  commencement_date        DATE NOT NULL,
  term_months              INT NOT NULL CHECK (term_months > 0),
  monthly_payment_amount   NUMERIC(15,2) NOT NULL,
  currency                 TEXT NOT NULL DEFAULT 'MUR',
  implicit_rate_pct        NUMERIC(5,3),                    -- taux implicite si connu
  incremental_borrowing_rate_pct NUMERIC(5,3),               -- IBR fallback
  initial_direct_costs_mur NUMERIC(15,2) DEFAULT 0,
  restoration_obligation_mur NUMERIC(15,2) DEFAULT 0,
  payment_frequency        TEXT NOT NULL DEFAULT 'monthly' CHECK (payment_frequency IN ('monthly','quarterly','annual')),
  payment_in_advance       BOOLEAN NOT NULL DEFAULT TRUE,
  short_term_exemption     BOOLEAN NOT NULL DEFAULT FALSE,   -- IFRS 16 §5 : leases ≤ 12 mois
  low_value_exemption      BOOLEAN NOT NULL DEFAULT FALSE,   -- IFRS 16 §5 : actifs < USD 5,000
  -- Calculated at inception
  initial_rou_mur          NUMERIC(15,2),
  initial_liability_mur    NUMERIC(15,2),
  -- Status
  status                   TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','terminated','expired')),
  termination_date         DATE,
  notes                    TEXT,
  modification_history     JSONB DEFAULT '[]'::JSONB,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leases_societe ON public.leases(societe_id);
CREATE INDEX IF NOT EXISTS idx_leases_status  ON public.leases(status) WHERE status = 'active';

ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leases' AND policyname='leases_tenant_select') THEN
    CREATE POLICY leases_tenant_select ON public.leases
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY leases_tenant_modify ON public.leases
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- Échéancier de paiements (amortization schedule)
CREATE TABLE IF NOT EXISTS public.lease_payment_schedule (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id              UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
  period_number         INT NOT NULL,
  period_date           DATE NOT NULL,
  payment_amount_mur    NUMERIC(15,2) NOT NULL,
  interest_amount_mur   NUMERIC(15,2) NOT NULL,
  principal_amount_mur  NUMERIC(15,2) NOT NULL,
  liability_balance_mur NUMERIC(15,2) NOT NULL,
  posted                BOOLEAN NOT NULL DEFAULT FALSE,
  posted_at             TIMESTAMPTZ,
  ecriture_ids          UUID[],                          -- audit trail
  UNIQUE (lease_id, period_number)
);
CREATE INDEX IF NOT EXISTS idx_lease_sched_lease ON public.lease_payment_schedule(lease_id, period_date);

-- RPC : calculer la valeur actuelle (PV) d'un lease à l'inception
CREATE OR REPLACE FUNCTION public.compute_lease_pv(
  p_monthly_payment NUMERIC,
  p_term_months INT,
  p_annual_rate_pct NUMERIC,
  p_in_advance BOOLEAN DEFAULT TRUE
) RETURNS NUMERIC
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_monthly_rate NUMERIC;
  v_pv NUMERIC;
BEGIN
  IF p_annual_rate_pct = 0 THEN RETURN p_monthly_payment * p_term_months; END IF;
  v_monthly_rate := p_annual_rate_pct / 100.0 / 12.0;
  -- PV = PMT × [1 - (1+r)^-n] / r  (ordinary annuity, in arrears)
  v_pv := p_monthly_payment * ((1 - POWER(1 + v_monthly_rate, -p_term_months)) / v_monthly_rate);
  -- Adjustment if payment in advance (annuity due)
  IF p_in_advance THEN v_pv := v_pv * (1 + v_monthly_rate); END IF;
  RETURN ROUND(v_pv, 2);
END;
$$;

-- RPC : générer l'échéancier complet d'un lease
CREATE OR REPLACE FUNCTION public.generate_lease_schedule(p_lease_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  l            RECORD;
  v_monthly_rate NUMERIC;
  v_balance    NUMERIC;
  v_interest   NUMERIC;
  v_principal  NUMERIC;
  v_payment_date DATE;
  i INT;
  v_count INT := 0;
BEGIN
  SELECT * INTO l FROM public.leases WHERE id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lease % not found', p_lease_id; END IF;
  IF l.short_term_exemption OR l.low_value_exemption THEN
    RAISE NOTICE 'Lease % bénéficie d''exemption (short-term ou low-value) — pas d''échéancier IFRS 16', p_lease_id;
    RETURN 0;
  END IF;

  -- Purger échéancier précédent non posté
  DELETE FROM public.lease_payment_schedule WHERE lease_id = p_lease_id AND NOT posted;

  v_monthly_rate := COALESCE(l.implicit_rate_pct, l.incremental_borrowing_rate_pct, 5) / 100.0 / 12.0;
  v_balance := COALESCE(l.initial_liability_mur,
    public.compute_lease_pv(l.monthly_payment_amount, l.term_months, COALESCE(l.implicit_rate_pct, l.incremental_borrowing_rate_pct, 5), l.payment_in_advance));

  FOR i IN 1..l.term_months LOOP
    v_payment_date := (l.commencement_date + (i - 1) * INTERVAL '1 month')::DATE;
    v_interest := ROUND(v_balance * v_monthly_rate, 2);
    v_principal := ROUND(l.monthly_payment_amount - v_interest, 2);
    v_balance := v_balance - v_principal;
    IF v_balance < 0 THEN v_balance := 0; END IF;

    INSERT INTO public.lease_payment_schedule (
      lease_id, period_number, period_date,
      payment_amount_mur, interest_amount_mur, principal_amount_mur,
      liability_balance_mur
    ) VALUES (
      p_lease_id, i, v_payment_date,
      l.monthly_payment_amount, v_interest, v_principal, v_balance
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

DO $$ BEGIN RAISE NOTICE '✓ Migration 257 — Phase I : IFRS 16 Leases'; END $$;
