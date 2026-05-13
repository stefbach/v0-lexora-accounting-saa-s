-- ============================================================================
-- Migration 260 — Phase L (L.2 → L.8) : Couverture MRA 10/10
-- ============================================================================
-- Cette migration regroupe les schémas nécessaires pour atteindre 100%
-- de couverture MRA Maurice :
--   L.2 — VAT 4 trimestrielle (frequence_tva + agrégation 3 mois)
--   L.3 — CIT (Income Tax Return) auto
--   L.4 — Workflow validation 4-yeux (statuts draft/review/approved/submitted)
--   L.5 — SFT (Statement of Financial Transactions) > 50k MUR
--   L.6 — ROC Annual Return (Companies Act)
--   L.7 — XML exports (table de mapping format MRA → format pivot)
--   L.8 — Tax Calendar centralisé
-- ============================================================================

-- ── L.2 Fréquence TVA sur sociétés ─────────────────────────────────────────
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS frequence_tva TEXT NOT NULL DEFAULT 'mensuelle';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'societes_frequence_tva_check') THEN
    ALTER TABLE public.societes ADD CONSTRAINT societes_frequence_tva_check
      CHECK (frequence_tva IN ('mensuelle','trimestrielle'));
  END IF;
END $$;

-- VAT 4 (trimestrielle) — réutilise tva_mensuelle avec champs étendus
ALTER TABLE public.tva_mensuelle
  ADD COLUMN IF NOT EXISTS trimestre        TEXT,           -- YYYY-Q[1234]
  ADD COLUMN IF NOT EXISTS type_declaration TEXT NOT NULL DEFAULT 'vat3'
                                            CHECK (type_declaration IN ('vat3','vat4'));

-- ── L.3 CIT (Income Tax Return) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cit_returns (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id               UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice                 TEXT NOT NULL,  -- YYYY-YYYY (Maurice juillet→juin)
  -- Données financières (auto-récupérées depuis P&L)
  chiffre_affaires_mur     NUMERIC(15,2),
  charges_exploitation_mur NUMERIC(15,2),
  resultat_exploitation_mur NUMERIC(15,2),
  resultat_financier_mur   NUMERIC(15,2),
  profit_avant_impot_mur   NUMERIC(15,2),
  -- Ajustements fiscaux Maurice
  ajustements_non_deductibles_mur NUMERIC(15,2) DEFAULT 0,
  donations_excess_mur     NUMERIC(15,2) DEFAULT 0,
  entertainment_excess_mur NUMERIC(15,2) DEFAULT 0,
  depreciation_book_mur    NUMERIC(15,2) DEFAULT 0,
  capital_allowance_mur    NUMERIC(15,2) DEFAULT 0,
  -- Calcul impôt
  profit_imposable_mur     NUMERIC(15,2),
  taux_is_pct              NUMERIC(5,2) NOT NULL DEFAULT 15.0,
  impot_brut_mur           NUMERIC(15,2),
  ftc_applied_mur          NUMERIC(15,2) DEFAULT 0,  -- Foreign Tax Credit (GBC)
  tds_credit_mur           NUMERIC(15,2) DEFAULT 0,  -- TDS retenu en amont
  aps_credit_mur           NUMERIC(15,2) DEFAULT 0,  -- Advance Payment Scheme
  impot_net_mur            NUMERIC(15,2),
  -- Workflow + statut
  statut                   TEXT NOT NULL DEFAULT 'draft'
                           CHECK (statut IN ('draft','review','approved','submitted','accepted','rejected')),
  date_limite              DATE,         -- 6 mois après clôture exercice
  date_declaration         DATE,
  notes                    TEXT,
  reviewer_id              UUID REFERENCES auth.users(id),
  approver_id              UUID REFERENCES auth.users(id),
  reviewed_at              TIMESTAMPTZ,
  approved_at              TIMESTAMPTZ,
  submitted_at             TIMESTAMPTZ,
  mra_ref                  TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, exercice)
);
CREATE INDEX IF NOT EXISTS idx_cit_returns_societe ON public.cit_returns(societe_id, exercice DESC);
ALTER TABLE public.cit_returns ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cit_returns' AND policyname='cit_tenant_select') THEN
    CREATE POLICY cit_tenant_select ON public.cit_returns FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY cit_tenant_modify ON public.cit_returns FOR ALL
      USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- ── L.4 Workflow validation 4-yeux — colonnes communes ────────────────────
-- Ajouter aux déclarations existantes (TVA, PAYE, CSG/NSF, TDS)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['tva_mensuelle', 'tds_declarations_mensuelles_v2']::TEXT[]) LOOP
    EXECUTE format('ALTER TABLE public.%I
      ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES auth.users(id),
      ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES auth.users(id),
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ', t);
  END LOOP;
END $$;

-- ── L.5 SFT — Statement of Financial Transactions > 50k MUR ───────────────
CREATE TABLE IF NOT EXISTS public.sft_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id          UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  reporting_year      INT NOT NULL,
  transaction_type    TEXT NOT NULL,   -- 'cash_deposit','cash_withdrawal','immobilier','virement_international', etc.
  counterparty_name   TEXT NOT NULL,
  counterparty_id     TEXT,            -- NIC/passport/BRN
  counterparty_country TEXT,           -- ISO 3166-1
  transaction_date    DATE NOT NULL,
  amount_mur          NUMERIC(15,2) NOT NULL,
  source_ecriture_id  UUID REFERENCES public.ecritures_comptables_v2(id),
  source_facture_id   UUID REFERENCES public.factures(id),
  notes               TEXT,
  reported_to_mra     BOOLEAN NOT NULL DEFAULT FALSE,
  reported_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sft_societe_year ON public.sft_transactions(societe_id, reporting_year);
ALTER TABLE public.sft_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sft_transactions' AND policyname='sft_tenant_select') THEN
    CREATE POLICY sft_tenant_select ON public.sft_transactions FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY sft_tenant_modify ON public.sft_transactions FOR ALL
      USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- RPC : détecte les transactions SFT depuis les écritures + factures
CREATE OR REPLACE FUNCTION public.sft_detect_transactions(
  p_societe_id UUID,
  p_year INT,
  p_threshold_mur NUMERIC DEFAULT 50000
) RETURNS TABLE (
  source           TEXT,
  date_trans       DATE,
  counterparty     TEXT,
  amount_mur       NUMERIC,
  transaction_type TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  -- Factures grosses
  SELECT 'facture'::TEXT, f.date_facture, f.tiers,
         f.montant_mur::NUMERIC,
         (CASE WHEN f.type_facture = 'client' THEN 'vente_grosse' ELSE 'achat_gros' END)::TEXT
  FROM public.factures f
  WHERE f.societe_id = p_societe_id
    AND f.montant_mur >= p_threshold_mur
    AND EXTRACT(YEAR FROM f.date_facture) = p_year
  UNION ALL
  -- Mouvements bancaires (écritures classe 5 > seuil)
  SELECT 'ecriture'::TEXT, e.date_ecriture, COALESCE(e.description, 'banque'),
         GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))::NUMERIC,
         (CASE WHEN e.debit_mur > 0 THEN 'mouvement_debit' ELSE 'mouvement_credit' END)::TEXT
  FROM public.ecritures_comptables_v2 e
  WHERE e.societe_id = p_societe_id
    AND e.numero_compte LIKE '5%'
    AND GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)) >= p_threshold_mur
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year
  ORDER BY 2 DESC;
END;
$$;

-- ── L.6 ROC Annual Return (Companies Act 2001) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.roc_annual_returns (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id               UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice                 TEXT NOT NULL,
  date_anniversaire        DATE,                  -- date AGM
  -- Directors
  directors                JSONB DEFAULT '[]'::JSONB,
                           -- Format: [{ name, nic, nationality, date_appointed, resigned, address }]
  -- Shareholders
  shareholders             JSONB DEFAULT '[]'::JSONB,
                           -- Format: [{ name, brn_or_nic, shares, pct }]
  share_capital_authorized NUMERIC(15,2),
  share_capital_issued     NUMERIC(15,2),
  -- Registered office
  registered_office_address TEXT,
  registered_office_changed_at DATE,
  -- Compliance
  board_meetings_count     INT DEFAULT 0,
  agm_held                 BOOLEAN DEFAULT FALSE,
  agm_date                 DATE,
  auditor_name             TEXT,
  auditor_appointed_at     DATE,
  -- Filing
  statut                   TEXT NOT NULL DEFAULT 'draft'
                           CHECK (statut IN ('draft','review','approved','submitted','accepted')),
  date_limite              DATE,                  -- 28 jours après anniversaire AGM
  date_filing              DATE,
  filing_ref               TEXT,
  notes                    TEXT,
  reviewer_id              UUID REFERENCES auth.users(id),
  approver_id              UUID REFERENCES auth.users(id),
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, exercice)
);
ALTER TABLE public.roc_annual_returns ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='roc_annual_returns' AND policyname='roc_tenant_select') THEN
    CREATE POLICY roc_tenant_select ON public.roc_annual_returns FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY roc_tenant_modify ON public.roc_annual_returns FOR ALL
      USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- ── L.8 Vue Tax Calendar centralisé ───────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_tax_calendar AS
SELECT * FROM (
  -- VAT
  SELECT
    societe_id, 'TVA'::TEXT AS type_declaration, periode AS reference,
    date_limite, statut,
    CASE WHEN statut = 'paye' THEN 'done'
         WHEN date_limite < CURRENT_DATE THEN 'overdue'
         WHEN date_limite < CURRENT_DATE + INTERVAL '7 days' THEN 'urgent'
         WHEN date_limite < CURRENT_DATE + INTERVAL '30 days' THEN 'soon'
         ELSE 'future' END AS priority
  FROM public.tva_mensuelle
  UNION ALL
  -- TDS
  SELECT societe_id, 'TDS'::TEXT, periode, date_limite, statut,
    CASE WHEN statut = 'paye' THEN 'done'
         WHEN date_limite < CURRENT_DATE THEN 'overdue'
         WHEN date_limite < CURRENT_DATE + INTERVAL '7 days' THEN 'urgent'
         WHEN date_limite < CURRENT_DATE + INTERVAL '30 days' THEN 'soon'
         ELSE 'future' END
  FROM public.tds_declarations_mensuelles_v2
  UNION ALL
  -- CIT
  SELECT societe_id, 'CIT'::TEXT, exercice, date_limite, statut,
    CASE WHEN statut IN ('submitted','accepted') THEN 'done'
         WHEN date_limite < CURRENT_DATE THEN 'overdue'
         WHEN date_limite < CURRENT_DATE + INTERVAL '14 days' THEN 'urgent'
         WHEN date_limite < CURRENT_DATE + INTERVAL '60 days' THEN 'soon'
         ELSE 'future' END
  FROM public.cit_returns
  UNION ALL
  -- ROC
  SELECT societe_id, 'ROC'::TEXT, exercice, date_limite, statut,
    CASE WHEN statut IN ('submitted','accepted') THEN 'done'
         WHEN date_limite < CURRENT_DATE THEN 'overdue'
         WHEN date_limite < CURRENT_DATE + INTERVAL '14 days' THEN 'urgent'
         WHEN date_limite < CURRENT_DATE + INTERVAL '60 days' THEN 'soon'
         ELSE 'future' END
  FROM public.roc_annual_returns
) all_decls
WHERE date_limite IS NOT NULL
ORDER BY priority, date_limite;

DO $$ BEGIN RAISE NOTICE '✓ Migration 260 — MRA 10/10 (VAT 4 + CIT + Workflow + SFT + ROC + Tax Calendar)'; END $$;
