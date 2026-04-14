-- ═══════════════════════════════════════════════════════════════
-- Migration 135: Conformité comptable + Classification automatique
--
-- Implémente les spécifications P1-C2, C3 et P2-A4 + P3-B2 :
-- - classification_rules : moteur de règles paramétrable
-- - directors_shareholders : registre des dirigeants/associés
-- - compliance_alerts : alertes légales (Companies Act 2001)
-- - bank_reconciliations : tableau de rapprochement officiel
-- - reconciliation_items : éléments du rapprochement
-- - audit_log : journal d'audit complet
-- - accounting_periods : verrouillage de période
-- ═══════════════════════════════════════════════════════════════

-- ── 1. CLASSIFICATION RULES (moteur paramétrable) ──
CREATE TABLE IF NOT EXISTS public.classification_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code       TEXT UNIQUE NOT NULL,        -- R01, R02, R03... ou custom
  societe_id      UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  -- societe_id NULL = règle globale (toutes sociétés)
  priority        INTEGER DEFAULT 100,         -- ordre d'application (asc)
  active          BOOLEAN DEFAULT TRUE,

  -- Patterns de détection
  pattern_libelle TEXT,                        -- regex/substring sur libellé
  pattern_tiers   TEXT,                        -- regex/substring sur tiers_detecte
  pattern_journal TEXT,                        -- BNQ, ACH, etc.
  amount_min      NUMERIC,
  amount_max      NUMERIC,

  -- Action de classification
  classification  TEXT NOT NULL,               -- nom user-friendly: "MRA", "Frais bancaires", etc.
  compte_debit    TEXT NOT NULL,               -- compte plan comptable: 447, 627, 421...
  compte_credit   TEXT DEFAULT '512',          -- contrepartie (banque par défaut)
  libelle_template TEXT,                       -- template avec {{tiers}}, {{date}}

  -- Alerte / validation
  requires_validation BOOLEAN DEFAULT FALSE,   -- true = bloque jusqu'à validation humaine
  compliance_flag TEXT,                        -- "director_loan", "tds", null
  legal_warning   TEXT,                        -- message à afficher à l'utilisateur

  -- Stats
  nb_used         INTEGER DEFAULT 0,
  last_used_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_classification_rules_societe ON public.classification_rules(societe_id, priority);
CREATE INDEX IF NOT EXISTS idx_classification_rules_active ON public.classification_rules(active, priority);

-- Seed des règles globales (R01 → R07)
INSERT INTO public.classification_rules (rule_code, priority, pattern_libelle, pattern_tiers, classification, compte_debit, compte_credit, libelle_template) VALUES
  ('R01_MRA_PAYE',          10, 'paye',                                     NULL,                                   'MRA — PAYE',                '447200', '512', 'Paiement PAYE — {{date}}'),
  ('R01_MRA_VAT',           11, 'vat|tva',                                  NULL,                                   'MRA — VAT',                 '44551',  '512', 'Paiement TVA — {{date}}'),
  ('R01_MRA_GENERAL',       12, NULL,                                       'mauritius revenue|mra',                'MRA — Impôts',              '447100', '512', 'Paiement MRA — {{date}}'),
  ('R02_BANK_FEES',         20, 'service fee|tax amount due|business banking subs|payment fee ft|merchant monthly fee|merchant discount|outward transfer charge|card repayment|stamp duty|swift charge', 'mcb|sbm|bom|mauritius commercial bank|state bank', 'Frais bancaires', '627100', '512', 'Frais bancaires {{tiers}} — {{date}}'),
  ('R03_SALARY_BULK',       30, 'bulk payment.*salary|salary|salaires|payroll', NULL,                               'Salaires nets',             '421100', '512', 'Salaires nets {{date}}'),
  ('R04_EPAYROLL',          40, NULL,                                       'e-payroll|epayroll|epay',              'Charges sociales (E-Payroll)', '431100', '512', 'E-Payroll {{date}}'),
  ('R04_NPF_NSF',           41, 'npf|nsf',                                  NULL,                                   'NPF/NSF',                   '431200', '512', 'NPF/NSF {{date}}'),
  ('R04_CSG',               42, 'csg',                                      NULL,                                   'CSG',                       '431100', '512', 'CSG {{date}}'),
  ('R04_PRGF',              43, 'prgf',                                     NULL,                                   'PRGF',                      '431300', '512', 'PRGF {{date}}'),
  ('R05_INTERCO',           50, NULL,                                       NULL,                                   'Virement interco',          '580',    '512', 'Virement interco {{tiers}}')
ON CONFLICT (rule_code) DO NOTHING;

ALTER TABLE public.classification_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY classification_rules_read ON public.classification_rules FOR SELECT USING (
    societe_id IS NULL OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY classification_rules_write ON public.classification_rules FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. DIRECTORS / SHAREHOLDERS (registre des dirigeants/associés) ──
CREATE TABLE IF NOT EXISTS public.directors_shareholders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id   UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom_complet  TEXT NOT NULL,
  role         TEXT NOT NULL,                  -- 'director' | 'shareholder' | 'both'
  nic          TEXT,                           -- numéro identité Maurice
  date_nomination DATE,
  parts_sociales NUMERIC,                      -- nombre de parts si shareholder
  pourcentage_capital NUMERIC,
  active       BOOLEAN DEFAULT TRUE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, nom_complet)
);
CREATE INDEX IF NOT EXISTS idx_directors_societe ON public.directors_shareholders(societe_id, active);
CREATE INDEX IF NOT EXISTS idx_directors_nom ON public.directors_shareholders(nom_complet);

ALTER TABLE public.directors_shareholders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY directors_read ON public.directors_shareholders FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY directors_write ON public.directors_shareholders FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. COMPLIANCE ALERTS (alertes légales) ──
CREATE TABLE IF NOT EXISTS public.compliance_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  alert_type      TEXT NOT NULL,
  -- 'director_loan'    : compte courant débiteur (Companies Act s.166)
  -- 'tds_missing'      : TDS détecté mais non comptabilisé
  -- 'period_locked'    : tentative modif période verrouillée
  -- 'partial_payment'  : facture marquée payée avec solde restant
  -- 'unbalanced_od'    : OD avec écart Débit ≠ Crédit
  severity        TEXT DEFAULT 'medium',       -- 'critical' | 'high' | 'medium' | 'low'
  status          TEXT DEFAULT 'open',         -- 'open' | 'acknowledged' | 'resolved'
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  legal_reference TEXT,                        -- "Companies Act 2001, s.166"
  amount          NUMERIC,
  related_entity_type TEXT,                    -- 'transaction' | 'facture' | 'ecriture' | 'director'
  related_entity_id   TEXT,                    -- ID de l'entité liée (peut être JSONB id)
  resolved_by     UUID REFERENCES auth.users(id),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_compliance_societe_status ON public.compliance_alerts(societe_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_compliance_open ON public.compliance_alerts(societe_id) WHERE status = 'open';

ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY compliance_read ON public.compliance_alerts FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY compliance_write ON public.compliance_alerts FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. BANK RECONCILIATIONS (tableau de rapprochement officiel) ──
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id            UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  compte_bancaire_id    UUID REFERENCES public.comptes_bancaires(id) ON DELETE CASCADE,
  numero_compte_compta  TEXT NOT NULL,         -- 512100, 512200...
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  bank_balance          NUMERIC NOT NULL,
  gl_balance            NUMERIC NOT NULL,
  adjusted_bank_balance NUMERIC,
  adjusted_gl_balance   NUMERIC,
  residual_gap          NUMERIC,
  status                TEXT DEFAULT 'draft',  -- 'draft' | 'submitted' | 'validated' | 'locked'
  prepared_by           UUID REFERENCES auth.users(id),
  prepared_at           TIMESTAMPTZ DEFAULT NOW(),
  validated_by          UUID REFERENCES auth.users(id),
  validated_at          TIMESTAMPTZ,
  locked_at             TIMESTAMPTZ,
  pdf_url               TEXT,
  notes                 TEXT,
  UNIQUE(societe_id, compte_bancaire_id, period_end)
);
CREATE INDEX IF NOT EXISTS idx_bank_recon_societe_period ON public.bank_reconciliations(societe_id, period_end DESC);

CREATE TABLE IF NOT EXISTS public.reconciliation_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id   UUID NOT NULL REFERENCES public.bank_reconciliations(id) ON DELETE CASCADE,
  side                TEXT NOT NULL,           -- 'bank' | 'compta'
  nature              TEXT NOT NULL,           -- 'cheque_emis_non_encaisse', 'virement_recu_non_saisi', etc.
  amount              NUMERIC NOT NULL,
  category            TEXT,                    -- E1, E2, E3, E4, E5, E6
  date_operation      DATE,
  description         TEXT,
  journal_entry_id    UUID,
  status              TEXT DEFAULT 'pending',
  auto_od_generated   BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recon_items_recon ON public.reconciliation_items(reconciliation_id);

ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY bank_recon_all ON public.bank_reconciliations FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY recon_items_all ON public.reconciliation_items FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. AUDIT LOG (journal d'audit complet) ──
CREATE TABLE IF NOT EXISTS public.audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id),
  user_email    TEXT,
  societe_id    UUID REFERENCES public.societes(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,                 -- 'classify', 'letter', 'unletter', 'validate', 'lock_period'
  entity_type   TEXT NOT NULL,                 -- 'transaction', 'facture', 'ecriture', 'reconciliation'
  entity_id     TEXT NOT NULL,
  old_value     JSONB,
  new_value     JSONB,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_societe ON public.audit_log(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY audit_log_read ON public.audit_log FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','comptable_dedie','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY audit_log_insert ON public.audit_log FOR INSERT WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. ACCOUNTING PERIODS (verrouillage de période) ──
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id   UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  status       TEXT DEFAULT 'open',            -- 'open' | 'closed' | 'locked'
  closed_by    UUID REFERENCES auth.users(id),
  closed_at    TIMESTAMPTZ,
  reopened_by  UUID REFERENCES auth.users(id),
  reopened_at  TIMESTAMPTZ,
  reopen_reason TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, period_end)
);
CREATE INDEX IF NOT EXISTS idx_periods_societe_status ON public.accounting_periods(societe_id, status);

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY periods_all ON public.accounting_periods FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.classification_rules IS 'Moteur de règles paramétrable pour classification automatique des transactions bancaires (R01-R07 + custom)';
COMMENT ON TABLE public.directors_shareholders IS 'Registre des dirigeants/associés pour détection automatique des transactions à qualifier';
COMMENT ON TABLE public.compliance_alerts IS 'Alertes de conformité (Companies Act 2001, MRA, etc.)';
COMMENT ON TABLE public.bank_reconciliations IS 'Tableau de rapprochement bancaire mensuel officiel avec workflow validation/verrouillage';
COMMENT ON TABLE public.audit_log IS 'Journal d''audit complet — toutes actions utilisateur tracées';
COMMENT ON TABLE public.accounting_periods IS 'Périodes comptables avec verrouillage après clôture';
