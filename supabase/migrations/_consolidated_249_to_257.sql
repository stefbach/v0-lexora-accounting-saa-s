-- ═══════════════════════════════════════════════════════════════════════
-- LEXORA — Script consolidé migrations 249 → 257 (GBC + Full IFRS)
--
-- À lancer EN UNE FOIS dans Supabase Studio SQL editor.
-- Toutes les migrations sont idempotentes (IF NOT EXISTS / DO BEGIN
-- IF EXISTS) — safe à relancer plusieurs fois sans casser quoi que
-- ce soit.
--
-- Ordre fixe (séquentiel — chaque phase dépend de la précédente quand
-- elle utilise une RPC partagée) :
--   249  Phase A — Monnaie fonctionnelle IAS 21 + compte 1078 (CTA)
--   250  Phase B — Partial Exemption Regime (PER 80%) + Foreign Tax Credit
--   251  Phase C — Substance tracking (CIGA)
--   252  Phase D — Transfer Pricing documentation
--   253  Phase E — Beneficial Ownership Register
--   254  Phase F — Consolidation IFRS 10 + goodwill IFRS 3 + NCI
--   255  Phase G — CRS / FATCA reporting
--   256  Phase H — BEPS Pillar Two GloBE + DMTT
--   257  Phase I — IFRS 16 Leases (Right-of-Use + Lease Liability)
--
-- Comptes PCM ajoutés au total :
--   1078  Écart de conversion (CTA, IAS 21)
--   695   Impôt sur bénéfices PER 3%
--   6951  Foreign Tax Credit appliqué
--   1751  Dette de location IFRS 16 long terme
--   1752  Dette de location IFRS 16 court terme
--   2151  Droit d'utilisation (Right of Use)
--   28151 Amortissements cumulés RoU
--   6611  Charges d'intérêts lease
--   6811  Dotation amortissement RoU
--
-- Tables ajoutées :
--   societes : +1 colonne (devise_fonctionnelle)
--   ecritures_comptables_v2 : +5 colonnes (debit/credit_fonctionnelle,
--                            devise_origine, taux_fonct_vers_mur, per_category)
--   factures : +3 colonnes (per_category, related_party, related_party_type)
--   gbc_per_categories, gbc_foreign_tax_credits,
--   gbc_substance_requirements, gbc_substance_tracking,
--   tp_transactions, tp_master_file,
--   beneficial_owners, beneficial_owners_history,
--   societes_relationships, consolidation_eliminations,
--   crs_account_holders, crs_fatca_submissions,
--   globe_jurisdictions, globe_gir_submissions,
--   leases, lease_payment_schedule
--
-- RPCs ajoutées :
--   ias21_classify_account, ias21_compute_cta,
--   gbc_compute_tax_liability, gbc_assess_substance,
--   consolidate_aggregate, compute_nci,
--   compute_globe_top_up,
--   compute_lease_pv, generate_lease_schedule
--
-- Vues ajoutées :
--   vw_ias21_societes_multi_devises, vw_tp_threshold_transactions,
--   vw_active_ubos
--
-- ATTENTION : ce script s'exécute dans une seule transaction BEGIN/COMMIT.
-- Si une migration échoue, AUCUNE n'est appliquée (rollback automatique).
-- En cas d'erreur, lire le message PostgreSQL et corriger avant relance.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- Migration 249 — source : 249_ias21_monnaie_fonctionnelle.sql
-- ─────────────────────────────────────────────────────────────────────

-- ============================================================================
-- Migration 249 — Phase A.1 GBC : Monnaie fonctionnelle IAS 21 §38-49
-- ============================================================================
--
-- Problème actuel :
-- Lexora suppose MUR comme monnaie de tenue de comptes. Pour une Global
-- Business Company (GBC) qui opère en USD/EUR, c'est faux (IAS 21 §9-14).
-- La monnaie fonctionnelle est celle de l'environnement économique principal
-- de l'entité — pour une GBC1 holding internationale, c'est USD le plus
-- souvent.
--
-- Cette migration met en place le SOCLE technique pour gérer une monnaie
-- fonctionnelle ≠ MUR :
--
--   1. societes.devise_fonctionnelle (default 'MUR' — pas de breaking change)
--   2. Colonnes "fonctionnelle" sur ecritures_comptables_v2 :
--      • debit_fonctionnelle / credit_fonctionnelle = montant dans la
--        devise de l'entité (= comptabilité primaire)
--      • taux_fonct_vers_mur = taux utilisé pour traduire en MUR (reporting
--        fiscal MRA toujours en MUR)
--      • devise_origine = devise dans laquelle la transaction a eu lieu
--        (peut être différente de fonctionnelle si transaction tierce devise)
--   3. Compte 1078 — Écart de conversion (CTA = Cumulative Translation
--      Adjustment) pour comptabiliser les écarts de translation IAS 21 §39
--   4. RPC ias21_classify_account(numero_compte) → 'monetary' | 'non_monetary'
--      | 'pnl' | 'equity' pour appliquer le bon taux
--   5. RPC ias21_compute_cta(societe_id, exercice) qui calcule l'écart de
--      conversion à constater en OCI (Other Comprehensive Income)
--
-- BACKWARD COMPATIBLE : toutes les colonnes ajoutées sont NULLABLE. Les
-- sociétés existantes ont devise_fonctionnelle='MUR' → aucun impact sur
-- les calculs MUR existants.
--
-- IDEMPOTENTE : peut être rejouée sans effet de bord.
-- ============================================================================

-- ── 1. Colonne devise_fonctionnelle sur societes ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'societes' AND column_name = 'devise_fonctionnelle'
  ) THEN
    ALTER TABLE public.societes
      ADD COLUMN devise_fonctionnelle TEXT NOT NULL DEFAULT 'MUR';

    -- Contrainte : ISO 4217 (3 lettres uppercase) — accepte les principales
    -- devises GBC + extensibilité future.
    ALTER TABLE public.societes
      ADD CONSTRAINT societes_devise_fonctionnelle_check
      CHECK (devise_fonctionnelle ~ '^[A-Z]{3}$');
  END IF;
END $$;

COMMENT ON COLUMN public.societes.devise_fonctionnelle IS
  'Monnaie fonctionnelle de l''entité au sens IAS 21 §9 (devise de l''environnement '
  'économique principal). Par défaut MUR pour les PME domestiques. Pour les GBC, '
  'typiquement USD, EUR, GBP, ZAR. Code ISO 4217 (3 lettres).';

-- ── 2. Colonnes fonctionnelle sur ecritures_comptables_v2 ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecritures_comptables_v2' AND column_name = 'debit_fonctionnelle'
  ) THEN
    ALTER TABLE public.ecritures_comptables_v2
      ADD COLUMN debit_fonctionnelle  NUMERIC(15,2),
      ADD COLUMN credit_fonctionnelle NUMERIC(15,2),
      ADD COLUMN devise_origine       TEXT,
      ADD COLUMN taux_fonct_vers_mur  NUMERIC(15,8);

    -- Backfill : pour les sociétés MUR, fonctionnelle = MUR, taux = 1
    UPDATE public.ecritures_comptables_v2 e
       SET debit_fonctionnelle  = e.debit_mur,
           credit_fonctionnelle = e.credit_mur,
           devise_origine       = 'MUR',
           taux_fonct_vers_mur  = 1
      FROM public.societes s
     WHERE e.societe_id = s.id
       AND COALESCE(s.devise_fonctionnelle, 'MUR') = 'MUR';
  END IF;
END $$;

COMMENT ON COLUMN public.ecritures_comptables_v2.debit_fonctionnelle IS
  'Débit dans la monnaie fonctionnelle de la société (IAS 21). Pour une société '
  'MUR-only, égal à debit_mur. Pour une GBC USD, c''est le montant USD.';
COMMENT ON COLUMN public.ecritures_comptables_v2.credit_fonctionnelle IS
  'Crédit dans la monnaie fonctionnelle de la société (IAS 21).';
COMMENT ON COLUMN public.ecritures_comptables_v2.devise_origine IS
  'Devise dans laquelle la transaction a eu lieu (peut différer de la devise '
  'fonctionnelle, ex: GBC USD qui paie en EUR). Code ISO 4217.';
COMMENT ON COLUMN public.ecritures_comptables_v2.taux_fonct_vers_mur IS
  'Taux de change utilisé pour translater le montant fonctionnel vers MUR au '
  'moment de l''écriture (closing rate pour items monétaires, historique pour '
  'non-monétaires, transaction rate pour P&L). Voir ias21_classify_account().';

-- ── 3. Compte 1078 — Cumulative Translation Adjustment (CTA) ────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau)
VALUES (
  '1078',
  'Écart de conversion (CTA) — IAS 21',
  'capitaux_propres',
  'C',
  '107',
  4
)
ON CONFLICT (compte) DO UPDATE
  SET libelle = EXCLUDED.libelle,
      type_compte = EXCLUDED.type_compte,
      sens_normal = EXCLUDED.sens_normal;

COMMENT ON TABLE public.plan_comptable IS
  'Plan Comptable Mauricien (PCM) avec extensions IFRS for SMEs / Full IFRS. '
  'Compte 1078 ajouté pour la translation IAS 21 (Phase A monnaie fonctionnelle GBC).';

-- ── 4. RPC : classification IAS 21 par numéro de compte ─────────────────────
CREATE OR REPLACE FUNCTION public.ias21_classify_account(p_numero_compte TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  -- IAS 21 §23 — Items monétaires (closing rate à la translation) :
  --   • Trésorerie : 51, 52, 53, 54
  --   • Créances : 41, 411, 416, 417, 418
  --   • Dettes commerciales : 40, 401, 403, 408, 409
  --   • Dettes fiscales / sociales : 43, 44
  --   • Emprunts : 16, 17
  --   • Comptes courants associés : 45, 46 (partiel — voir below)
  IF p_numero_compte LIKE '5%'  -- Trésorerie (classe 5 entière)
     OR p_numero_compte LIKE '40%' OR p_numero_compte LIKE '41%'
     OR p_numero_compte LIKE '42%' OR p_numero_compte LIKE '43%'
     OR p_numero_compte LIKE '44%'
     OR p_numero_compte LIKE '16%' OR p_numero_compte LIKE '17%'
     OR p_numero_compte LIKE '46%'
  THEN
    RETURN 'monetary';
  END IF;

  -- Capitaux propres (sauf 1078 lui-même) — taux historique
  IF p_numero_compte LIKE '10%' OR p_numero_compte LIKE '11%'
     OR p_numero_compte LIKE '12%' OR p_numero_compte LIKE '13%'
     OR p_numero_compte LIKE '14%' OR p_numero_compte LIKE '15%'
  THEN
    -- Le compte 1078 (CTA) lui-même est le résultat de la translation
    -- — on le traite comme "equity_cta" pour ne pas le re-translater
    IF p_numero_compte = '1078' THEN
      RETURN 'equity_cta';
    END IF;
    RETURN 'equity';
  END IF;

  -- IAS 21 §23 — Items non monétaires (taux historique à la translation) :
  --   • Immobilisations : 2
  --   • Stocks : 3
  --   • Charges constatées d'avance : 486
  --   • Produits constatés d'avance : 487
  IF p_numero_compte LIKE '2%' OR p_numero_compte LIKE '3%' THEN
    RETURN 'non_monetary';
  END IF;

  -- P&L (taux de transaction ou moyen) :
  --   • Charges : 6
  --   • Produits : 7
  --   • Comptes spéciaux 8 : généralement pas dans le P&L mais on les
  --     classe pnl par défaut
  IF p_numero_compte LIKE '6%' OR p_numero_compte LIKE '7%'
     OR p_numero_compte LIKE '8%'
  THEN
    RETURN 'pnl';
  END IF;

  -- Comptes d'attente / autres
  RETURN 'other';
END;
$$;

COMMENT ON FUNCTION public.ias21_classify_account IS
  'Classifie un compte du PCM selon IAS 21 §23 pour déterminer le taux de change '
  'à appliquer lors de la translation : monetary (closing rate), non_monetary '
  '(historical rate), pnl (transaction/average rate), equity (historical), '
  'equity_cta (résultat de la translation, pas re-translaté).';

-- ── 5. RPC : compute CTA — calcule l'écart de conversion à constater ────────
-- Pour une société dont la devise fonctionnelle ≠ MUR, après translation MUR
-- de tous les éléments à leur taux approprié (closing pour monétaires,
-- historique pour non-monétaires, transaction pour P&L), il subsiste un
-- écart parce que les taux ne sont pas tous identiques. Cet écart va en OCI
-- (Other Comprehensive Income) — compte 1078 — au lieu du P&L.
--
-- Note : cette RPC est un OUTIL DE CONTRÔLE / RECALCUL. La translation
-- réelle s'opère lors de la création des écritures (côté API). Cette fonction
-- détecte les déséquilibres après translation.
CREATE OR REPLACE FUNCTION public.ias21_compute_cta(
  p_societe_id UUID,
  p_date_cloture DATE DEFAULT CURRENT_DATE,
  p_closing_rate NUMERIC DEFAULT NULL  -- taux fonctionnelle→MUR au p_date_cloture
) RETURNS TABLE (
  total_debit_mur            NUMERIC,
  total_credit_mur           NUMERIC,
  ecart_translation_mur      NUMERIC,
  total_debit_fonctionnelle  NUMERIC,
  total_credit_fonctionnelle NUMERIC,
  ecart_fonctionnelle        NUMERIC,
  devise_fonctionnelle       TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_devise_fonct TEXT;
BEGIN
  SELECT s.devise_fonctionnelle INTO v_devise_fonct
    FROM public.societes s WHERE s.id = p_societe_id;

  IF v_devise_fonct IS NULL THEN
    RAISE EXCEPTION 'Société % introuvable', p_societe_id;
  END IF;

  -- Si MUR-only, pas de CTA possible (par définition)
  IF v_devise_fonct = 'MUR' THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 'MUR'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(e.debit_mur), 0)             AS total_debit_mur,
    COALESCE(SUM(e.credit_mur), 0)            AS total_credit_mur,
    -- En théorie, après translation correcte : debit_mur ≠ credit_mur en
    -- raison des taux différents par classe. Cet écart = CTA à constater.
    COALESCE(SUM(e.debit_mur) - SUM(e.credit_mur), 0) AS ecart_translation_mur,
    COALESCE(SUM(e.debit_fonctionnelle), 0)   AS total_debit_fonctionnelle,
    COALESCE(SUM(e.credit_fonctionnelle), 0)  AS total_credit_fonctionnelle,
    -- En fonctionnelle, la balance DOIT être à zéro (sinon erreur comptable)
    COALESCE(SUM(e.debit_fonctionnelle) - SUM(e.credit_fonctionnelle), 0) AS ecart_fonctionnelle,
    v_devise_fonct AS devise_fonctionnelle
  FROM public.ecritures_comptables_v2 e
  WHERE e.societe_id = p_societe_id
    AND e.date_ecriture <= p_date_cloture;
END;
$$;

COMMENT ON FUNCTION public.ias21_compute_cta IS
  'Calcule l''écart de conversion (CTA) pour une société à une date donnée. '
  'L''écart de translation MUR doit être passé en OCI sur le compte 1078. '
  'L''écart fonctionnelle doit être ~0 (sinon erreur comptable). À utiliser '
  'en clôture mensuelle ou annuelle pour générer l''écriture CTA.';

-- ── 6. Vue : santé des sociétés multi-devises ──────────────────────────────
CREATE OR REPLACE VIEW public.vw_ias21_societes_multi_devises AS
SELECT
  s.id               AS societe_id,
  s.raison_sociale,
  s.devise_fonctionnelle,
  COUNT(e.id)        AS nb_ecritures,
  ROUND(SUM(COALESCE(e.debit_fonctionnelle, 0)),  2) AS total_debit_fonctionnelle,
  ROUND(SUM(COALESCE(e.credit_fonctionnelle, 0)), 2) AS total_credit_fonctionnelle,
  ROUND(SUM(COALESCE(e.debit_fonctionnelle, 0)) - SUM(COALESCE(e.credit_fonctionnelle, 0)), 2) AS ecart_fonctionnelle,
  ROUND(SUM(COALESCE(e.debit_mur, 0)),  2)  AS total_debit_mur,
  ROUND(SUM(COALESCE(e.credit_mur, 0)), 2)  AS total_credit_mur,
  ROUND(SUM(COALESCE(e.debit_mur, 0)) - SUM(COALESCE(e.credit_mur, 0)), 2) AS cta_potentiel_mur,
  COUNT(DISTINCT e.devise_origine) AS nb_devises_origine
FROM public.societes s
LEFT JOIN public.ecritures_comptables_v2 e ON e.societe_id = s.id
WHERE COALESCE(s.devise_fonctionnelle, 'MUR') <> 'MUR'
GROUP BY s.id, s.raison_sociale, s.devise_fonctionnelle;

COMMENT ON VIEW public.vw_ias21_societes_multi_devises IS
  'Vue de monitoring pour les sociétés à monnaie fonctionnelle non-MUR (GBC). '
  'Permet de détecter rapidement les écarts CTA potentiels et les déséquilibres '
  'en monnaie fonctionnelle (qui devraient être à zéro).';

-- ── 7. Rapport ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_societes_mur INT;
  v_societes_fx  INT;
BEGIN
  SELECT COUNT(*) INTO v_societes_mur FROM public.societes WHERE devise_fonctionnelle = 'MUR';
  SELECT COUNT(*) INTO v_societes_fx  FROM public.societes WHERE devise_fonctionnelle <> 'MUR';

  RAISE NOTICE '──────────────────────────────────────────────────────';
  RAISE NOTICE '✓ Migration 249 — Phase A.1 monnaie fonctionnelle IAS 21';
  RAISE NOTICE '  • societes.devise_fonctionnelle ajoutée (default MUR)';
  RAISE NOTICE '  • % sociétés en MUR, % sociétés en devise étrangère', v_societes_mur, v_societes_fx;
  RAISE NOTICE '  • ecritures_comptables_v2 : 4 colonnes ajoutées (debit/credit_fonctionnelle, devise_origine, taux_fonct_vers_mur)';
  RAISE NOTICE '  • Compte 1078 (CTA) ajouté au plan_comptable';
  RAISE NOTICE '  • RPC : ias21_classify_account, ias21_compute_cta';
  RAISE NOTICE '  • Vue : vw_ias21_societes_multi_devises';
  RAISE NOTICE 'Backward compatible : pas d''impact sur les sociétés MUR-only.';
  RAISE NOTICE '──────────────────────────────────────────────────────';
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- Migration 250 — source : 250_gbc_per_foreign_tax_credit.sql
-- ─────────────────────────────────────────────────────────────────────

-- ============================================================================
-- Migration 250 — Phase B GBC : Partial Exemption Regime (PER) + Foreign Tax Credit
-- ============================================================================
-- Income Tax Act 1995 §50C — 80% exemption pour revenus qualifiants des GBC.
-- Income Tax Act 1995 §77   — Foreign Tax Credit (crédit d'impôt étranger).
--
-- Effet : IS effectif = 15% × 20% = 3% sur revenu PER-éligible, vs 15% standard.
-- ============================================================================

-- ── 1. Catégories PER-éligibles (référentiel) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.gbc_per_categories (
  code           TEXT PRIMARY KEY,
  libelle        TEXT NOT NULL,
  description    TEXT,
  exemption_pct  NUMERIC(5,2) NOT NULL DEFAULT 80.0,  -- 80% par défaut
  substance_required BOOLEAN NOT NULL DEFAULT TRUE,
  legal_ref      TEXT
);
INSERT INTO public.gbc_per_categories (code, libelle, exemption_pct, legal_ref) VALUES
  ('foreign_dividends',  'Dividendes étrangers',                                80.0, 'ITA §50C(1)(a)'),
  ('foreign_interest',   'Intérêts de source étrangère',                       80.0, 'ITA §50C(1)(b)'),
  ('foreign_pe_profits', 'Profits attribuables à une PE étrangère',            80.0, 'ITA §50C(1)(c)'),
  ('foreign_royalties',  'Redevances IP holding (source étrangère)',            80.0, 'ITA §50C(1)(d)'),
  ('ship_aircraft',      'Profits sur navires/aéronefs (international)',        80.0, 'ITA §50C(1)(e)'),
  ('cis_reinsurance',    'Collective Investment Schemes / Reinsurance',         80.0, 'ITA §50C(1)(f)'),
  ('not_eligible',       'Non éligible PER — impôt 15% standard',                0.0, 'ITA §44A')
ON CONFLICT (code) DO UPDATE
  SET libelle = EXCLUDED.libelle, exemption_pct = EXCLUDED.exemption_pct, legal_ref = EXCLUDED.legal_ref;

-- ── 2. Tag PER sur les lignes de revenu (factures + écritures) ─────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='factures' AND column_name='per_category') THEN
    ALTER TABLE public.factures
      ADD COLUMN per_category TEXT REFERENCES public.gbc_per_categories(code) DEFAULT 'not_eligible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecritures_comptables_v2' AND column_name='per_category') THEN
    ALTER TABLE public.ecritures_comptables_v2
      ADD COLUMN per_category TEXT REFERENCES public.gbc_per_categories(code);
  END IF;
END $$;

-- ── 3. Foreign Tax Credit (FTC) tracking ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gbc_foreign_tax_credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice        TEXT NOT NULL,
  source_country  TEXT NOT NULL,          -- ISO 3166-1 alpha-2 (FR, ZA, IN, etc.)
  income_type     TEXT NOT NULL,          -- 'dividends' | 'interest' | 'royalties' | 'business_profits'
  foreign_income_mur  NUMERIC(15,2) NOT NULL,
  foreign_tax_paid_mur NUMERIC(15,2) NOT NULL,
  treaty_rate_pct NUMERIC(5,2),           -- taux conventionnel max si DTA existe
  ftc_applied_mur NUMERIC(15,2),          -- limité par le min(impôt étranger, impôt Maurice sur ce revenu)
  document_id     UUID REFERENCES public.documents(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gbc_ftc_societe ON public.gbc_foreign_tax_credits(societe_id, exercice);
ALTER TABLE public.gbc_foreign_tax_credits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gbc_foreign_tax_credits' AND policyname='ftc_tenant_select') THEN
    CREATE POLICY ftc_tenant_select ON public.gbc_foreign_tax_credits
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY ftc_tenant_modify ON public.gbc_foreign_tax_credits
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- ── 4. Comptes PCM ajoutés ─────────────────────────────────────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, niveau) VALUES
  ('695',  'Impôt sur bénéfices PER (3%)',           'charge', 'D', 3),
  ('6951', 'Foreign Tax Credit appliqué',             'charge', 'C', 4)
ON CONFLICT (compte) DO UPDATE SET libelle = EXCLUDED.libelle;

-- ── 5. RPC : calcul tax liability avec PER + FTC ───────────────────────────
CREATE OR REPLACE FUNCTION public.gbc_compute_tax_liability(
  p_societe_id UUID,
  p_exercice   TEXT
) RETURNS TABLE (
  total_revenue_mur          NUMERIC,
  per_eligible_revenue_mur   NUMERIC,
  non_eligible_revenue_mur   NUMERIC,
  total_deductible_charges   NUMERIC,
  taxable_profit_eligible    NUMERIC,
  taxable_profit_non_eligible NUMERIC,
  tax_on_eligible_3pct       NUMERIC,
  tax_on_non_eligible_15pct  NUMERIC,
  ftc_applied                NUMERIC,
  net_tax_liability_mur      NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_date_debut DATE;
  v_date_fin   DATE;
BEGIN
  -- Parse exercice "YYYY-YYYY" → dates Maurice (juillet→juin)
  v_date_debut := (substring(p_exercice from 1 for 4) || '-07-01')::DATE;
  v_date_fin   := (substring(p_exercice from 6 for 4) || '-06-30')::DATE;

  RETURN QUERY
  WITH revenue_split AS (
    SELECT
      SUM(CASE WHEN c.compte LIKE '7%' THEN COALESCE(e.credit_mur,0) - COALESCE(e.debit_mur,0) ELSE 0 END) AS total_rev,
      SUM(CASE WHEN c.compte LIKE '7%' AND e.per_category IS NOT NULL
                AND e.per_category <> 'not_eligible'
               THEN (COALESCE(e.credit_mur,0) - COALESCE(e.debit_mur,0)) * (cat.exemption_pct / 100.0)
               ELSE 0 END) AS per_exempt_portion,
      SUM(CASE WHEN c.compte LIKE '7%' AND (e.per_category IS NULL OR e.per_category = 'not_eligible')
               THEN COALESCE(e.credit_mur,0) - COALESCE(e.debit_mur,0)
               ELSE 0 END) AS non_eligible_rev,
      SUM(CASE WHEN c.compte LIKE '6%' AND c.compte NOT LIKE '695%'
               THEN COALESCE(e.debit_mur,0) - COALESCE(e.credit_mur,0)
               ELSE 0 END) AS charges
    FROM public.ecritures_comptables_v2 e
    LEFT JOIN public.plan_comptable c ON c.compte = e.numero_compte
    LEFT JOIN public.gbc_per_categories cat ON cat.code = e.per_category
    WHERE e.societe_id = p_societe_id
      AND e.date_ecriture BETWEEN v_date_debut AND v_date_fin
  ),
  ftc AS (
    SELECT COALESCE(SUM(ftc_applied_mur), 0) AS total_ftc
      FROM public.gbc_foreign_tax_credits
     WHERE societe_id = p_societe_id AND exercice = p_exercice
  )
  SELECT
    rs.total_rev,
    rs.total_rev - rs.non_eligible_rev - rs.per_exempt_portion AS per_eligible_taxable,
    rs.non_eligible_rev,
    rs.charges,
    -- Profit imposable PER-éligible (après exemption 80%, donc 20% imposable)
    GREATEST(0, (rs.total_rev - rs.non_eligible_rev - rs.per_exempt_portion) - 0) AS prof_eligible,
    GREATEST(0, rs.non_eligible_rev - rs.charges) AS prof_non_eligible,
    -- IS sur la portion PER : 15% × 20% = 3% (déjà reflété par le 0.20 dans rs.per_exempt_portion)
    ROUND((rs.total_rev - rs.non_eligible_rev - rs.per_exempt_portion) * 0.15, 2) AS tax_per,
    ROUND(GREATEST(0, rs.non_eligible_rev - rs.charges) * 0.15, 2) AS tax_non_eligible,
    ftc.total_ftc,
    ROUND(
      GREATEST(0,
        (rs.total_rev - rs.non_eligible_rev - rs.per_exempt_portion) * 0.15
        + GREATEST(0, rs.non_eligible_rev - rs.charges) * 0.15
        - ftc.total_ftc
      ), 2) AS net_tax
  FROM revenue_split rs, ftc;
END;
$$;

COMMENT ON FUNCTION public.gbc_compute_tax_liability IS
  'Calcule l''IS d''une GBC en distinguant revenu PER-éligible (taxé à 3% effectif) '
  'du revenu standard (15%), avec FTC appliqué. Source ITA §50C + §77.';

DO $$ BEGIN
  RAISE NOTICE '✓ Migration 250 — Phase B GBC : PER + Foreign Tax Credit en place';
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- Migration 251 — source : 251_gbc_substance_tracking.sql
-- ─────────────────────────────────────────────────────────────────────

-- ============================================================================
-- Migration 251 — Phase C GBC : Substance tracking (CIGA)
-- ============================================================================
-- ITA §73A + FSC Guidelines : pour bénéficier du PER, une GBC doit prouver :
--   • Core Income Generating Activities (CIGA) réalisées à Maurice
--   • Min expenditure à Maurice (varie par activité)
--   • Employés qualifiés à Maurice
--   • Locaux physiques
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gbc_substance_requirements (
  activity_code  TEXT PRIMARY KEY,
  libelle        TEXT NOT NULL,
  min_expenditure_mur NUMERIC(15,2) NOT NULL,
  min_employees  INT NOT NULL DEFAULT 1,
  qualified_employees_required BOOLEAN NOT NULL DEFAULT TRUE,
  description    TEXT
);
INSERT INTO public.gbc_substance_requirements (activity_code, libelle, min_expenditure_mur, min_employees, description) VALUES
  ('investment_holding', 'Investment holding',                                   4800000, 1, 'Holdings d''investissement / SPV'),
  ('headquartering',     'Headquartering',                                       8500000, 3, 'Sociétés de tête'),
  ('fund_management',    'Fund management',                                      10000000, 2, 'Gestion de fonds — Investment Managers'),
  ('shipping',           'Shipping / maritime',                                  5000000, 2, 'Transport maritime international'),
  ('aircraft_leasing',   'Aircraft leasing',                                     5000000, 2, 'Location d''aéronefs'),
  ('ict_ip_holding',     'ICT / IP holding',                                     6000000, 2, 'Détention propriété intellectuelle / ICT'),
  ('financial_services', 'Financial services',                                   5000000, 2, 'Services financiers et bancaires'),
  ('insurance',          'Insurance / reinsurance',                              5000000, 2, 'Assurance / réassurance'),
  ('professional',       'Professional services (consulting, legal, accounting)', 600000, 1, 'Services professionnels'),
  ('trading',            'International trading',                                 600000, 1, 'Négoce international'),
  ('other',              'Autres activités',                                      600000, 1, 'Catégorie générique')
ON CONFLICT (activity_code) DO UPDATE
  SET libelle = EXCLUDED.libelle,
      min_expenditure_mur = EXCLUDED.min_expenditure_mur,
      min_employees = EXCLUDED.min_employees,
      description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.gbc_substance_tracking (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id               UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice                 TEXT NOT NULL,
  activity_code            TEXT NOT NULL REFERENCES public.gbc_substance_requirements(activity_code),
  -- Mesures réelles
  actual_expenditure_mur   NUMERIC(15,2) DEFAULT 0,
  actual_employees         INT DEFAULT 0,
  qualified_employees      INT DEFAULT 0,
  premises_address         TEXT,
  premises_verified        BOOLEAN DEFAULT FALSE,
  -- CIGA réalisées à Maurice (JSON : meetings, decisions, etc.)
  ciga_activities          JSONB DEFAULT '[]'::JSONB,
  -- Statut
  compliance_status        TEXT NOT NULL DEFAULT 'pending'
                           CHECK (compliance_status IN ('compliant','at_risk','non_compliant','pending')),
  last_assessed_at         TIMESTAMPTZ,
  notes                    TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, exercice)
);
CREATE INDEX IF NOT EXISTS idx_gbc_substance_societe ON public.gbc_substance_tracking(societe_id);
ALTER TABLE public.gbc_substance_tracking ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gbc_substance_tracking' AND policyname='subst_tenant_select') THEN
    CREATE POLICY subst_tenant_select ON public.gbc_substance_tracking
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY subst_tenant_modify ON public.gbc_substance_tracking
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- RPC : auto-évaluation à partir des données existantes
CREATE OR REPLACE FUNCTION public.gbc_assess_substance(p_societe_id UUID, p_exercice TEXT)
RETURNS TABLE (
  activity_code            TEXT,
  required_expenditure_mur NUMERIC,
  actual_expenditure_mur   NUMERIC,
  expenditure_compliant    BOOLEAN,
  required_employees       INT,
  actual_employees         INT,
  employees_compliant      BOOLEAN,
  overall_status           TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_date_debut DATE;
  v_date_fin   DATE;
  v_activity   TEXT;
BEGIN
  v_date_debut := (substring(p_exercice from 1 for 4) || '-07-01')::DATE;
  v_date_fin   := (substring(p_exercice from 6 for 4) || '-06-30')::DATE;
  SELECT t.activity_code INTO v_activity FROM public.gbc_substance_tracking t
   WHERE t.societe_id = p_societe_id AND t.exercice = p_exercice;
  IF v_activity IS NULL THEN v_activity := 'other'; END IF;

  RETURN QUERY
  WITH req AS (SELECT * FROM public.gbc_substance_requirements WHERE activity_code = v_activity),
  actual_exp AS (
    SELECT COALESCE(SUM(e.debit_mur - e.credit_mur), 0) AS amt
      FROM public.ecritures_comptables_v2 e
     WHERE e.societe_id = p_societe_id
       AND e.date_ecriture BETWEEN v_date_debut AND v_date_fin
       AND e.numero_compte LIKE '6%'
       AND e.numero_compte NOT LIKE '66%'
       AND e.numero_compte NOT LIKE '68%'
  ),
  emp_count AS (
    SELECT COUNT(*) AS n FROM public.employes WHERE societe_id = p_societe_id AND COALESCE(actif, TRUE)
  )
  SELECT
    v_activity,
    req.min_expenditure_mur,
    actual_exp.amt,
    actual_exp.amt >= req.min_expenditure_mur,
    req.min_employees,
    emp_count.n::INT,
    emp_count.n >= req.min_employees,
    CASE
      WHEN actual_exp.amt >= req.min_expenditure_mur AND emp_count.n >= req.min_employees THEN 'compliant'
      WHEN actual_exp.amt >= req.min_expenditure_mur * 0.8 OR emp_count.n >= req.min_employees * 0.8 THEN 'at_risk'
      ELSE 'non_compliant'
    END
  FROM req, actual_exp, emp_count;
END;
$$;

DO $$ BEGIN RAISE NOTICE '✓ Migration 251 — Phase C GBC : Substance tracking (CIGA)'; END $$;


-- ─────────────────────────────────────────────────────────────────────
-- Migration 252 — source : 252_gbc_transfer_pricing.sql
-- ─────────────────────────────────────────────────────────────────────

-- ============================================================================
-- Migration 252 — Phase D GBC : Transfer Pricing documentation
-- ============================================================================
-- Maurice TP Act 2023 — documentation obligatoire pour transactions
-- intragroupe. Pénalité : 10% + ajustement fiscal si non-conforme.
-- ============================================================================

-- Tag related party sur les tiers (employes / factures.tiers)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='factures' AND column_name='related_party') THEN
    ALTER TABLE public.factures
      ADD COLUMN related_party BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN related_party_type TEXT;  -- 'parent' | 'subsidiary' | 'sister' | 'common_control' | 'key_management'
  END IF;
END $$;

-- Local File : enregistrement détaillé par transaction intragroupe > 5M MUR
CREATE TABLE IF NOT EXISTS public.tp_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id            UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice              TEXT NOT NULL,
  related_party_name    TEXT NOT NULL,
  related_party_country TEXT,                       -- ISO 3166-1
  relationship_type     TEXT NOT NULL,              -- parent / subsidiary / sister / common_control / key_management
  transaction_type      TEXT NOT NULL,              -- goods / services / royalties / interest / financing / cost_sharing
  amount_mur            NUMERIC(15,2) NOT NULL,
  tp_method             TEXT,                       -- CUP / RPM / CPM / TNMM / PSM
  arm_length_range_low  NUMERIC(15,2),
  arm_length_range_high NUMERIC(15,2),
  benchmarking_source   TEXT,                       -- ex: 'Orbis 2024', 'Manual analysis', 'Comparable agreement'
  is_within_range       BOOLEAN,                    -- TRUE si le prix est dans la fourchette arm's length
  rationale             TEXT,
  document_id           UUID REFERENCES public.documents(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tp_tx_societe ON public.tp_transactions(societe_id, exercice);
ALTER TABLE public.tp_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tp_transactions' AND policyname='tp_tx_tenant_select') THEN
    CREATE POLICY tp_tx_tenant_select ON public.tp_transactions
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY tp_tx_tenant_modify ON public.tp_transactions
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- Master File : description du groupe (un seul record par groupe / société)
CREATE TABLE IF NOT EXISTS public.tp_master_file (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id             UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice               TEXT NOT NULL,
  group_structure        TEXT,                  -- Description textuelle ou JSONB (organigramme)
  business_overview      TEXT,
  intangibles_description TEXT,
  financing_strategy     TEXT,
  financial_position     TEXT,
  consolidated_revenue_mur NUMERIC(15,2),       -- pour seuil CbCR € 750M
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, exercice)
);
ALTER TABLE public.tp_master_file ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tp_master_file' AND policyname='tp_mf_tenant_select') THEN
    CREATE POLICY tp_mf_tenant_select ON public.tp_master_file
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY tp_mf_tenant_modify ON public.tp_master_file
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- Vue : transactions intragroupe au-dessus du seuil MUR 5M
CREATE OR REPLACE VIEW public.vw_tp_threshold_transactions AS
SELECT
  societe_id, exercice, related_party_name, transaction_type,
  amount_mur, tp_method, is_within_range,
  CASE WHEN amount_mur >= 5000000 THEN 'documentation_required'
       WHEN amount_mur >= 1000000 THEN 'recommended'
       ELSE 'optional' END AS documentation_tier
FROM public.tp_transactions
WHERE amount_mur > 0
ORDER BY amount_mur DESC;

DO $$ BEGIN RAISE NOTICE '✓ Migration 252 — Phase D GBC : Transfer Pricing documentation'; END $$;


-- ─────────────────────────────────────────────────────────────────────
-- Migration 253 — source : 253_gbc_beneficial_owners.sql
-- ─────────────────────────────────────────────────────────────────────

-- ============================================================================
-- Migration 253 — Phase E GBC : Beneficial Ownership Register
-- ============================================================================
-- FSC AML Act + FATF. UBO ≥10% obligatoire. Pénalité non-conformité : MUR 1M
-- + suspension licence. Mise à jour < 30 jours d'un changement.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.beneficial_owners (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id          UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  prenom              TEXT NOT NULL,
  nom                 TEXT NOT NULL,
  date_naissance      DATE,
  nationalite         TEXT,                  -- ISO 3166-1
  pays_residence      TEXT,                  -- ISO 3166-1
  adresse_complete    TEXT,
  id_type             TEXT NOT NULL CHECK (id_type IN ('passport','national_id','driver_license')),
  id_number           TEXT NOT NULL,
  id_expiry           DATE,
  id_country          TEXT,                  -- pays émetteur
  pct_detention       NUMERIC(5,2) NOT NULL CHECK (pct_detention BETWEEN 0 AND 100),
  nature_controle     TEXT NOT NULL CHECK (nature_controle IN ('shares','voting','board','contract','other')),
  is_pep              BOOLEAN NOT NULL DEFAULT FALSE,
  pep_details         TEXT,
  sanctions_screened  BOOLEAN NOT NULL DEFAULT FALSE,
  sanctions_clear     BOOLEAN,
  kyc_docs_provided   JSONB DEFAULT '[]'::JSONB,  -- liste des documents fournis
  declared_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at    TIMESTAMPTZ,
  effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to        DATE,                   -- NULL = actif
  declared_by         UUID REFERENCES auth.users(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ubo_societe ON public.beneficial_owners(societe_id);
CREATE INDEX IF NOT EXISTS idx_ubo_active ON public.beneficial_owners(societe_id) WHERE effective_to IS NULL;

ALTER TABLE public.beneficial_owners ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='beneficial_owners' AND policyname='ubo_tenant_select') THEN
    CREATE POLICY ubo_tenant_select ON public.beneficial_owners
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY ubo_tenant_modify ON public.beneficial_owners
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- Audit trail des changements UBO (immuable, INSERT only)
CREATE TABLE IF NOT EXISTS public.beneficial_owners_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  ubo_id          UUID,
  action          TEXT NOT NULL CHECK (action IN ('declared','updated','revoked','attested')),
  old_value       JSONB,
  new_value       JSONB,
  changed_by      UUID REFERENCES auth.users(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ubo_history_societe ON public.beneficial_owners_history(societe_id, changed_at DESC);
ALTER TABLE public.beneficial_owners_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='beneficial_owners_history' AND policyname='ubo_hist_tenant_select') THEN
    CREATE POLICY ubo_hist_tenant_select ON public.beneficial_owners_history
      FOR SELECT USING (public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- Vue : UBOs actifs avec contrôle ≥10%
CREATE OR REPLACE VIEW public.vw_active_ubos AS
SELECT
  societe_id, id, prenom, nom, nationalite, pct_detention, nature_controle,
  is_pep, sanctions_clear,
  CASE
    WHEN pct_detention >= 25 THEN 'controlling'
    WHEN pct_detention >= 10 THEN 'significant'
    ELSE 'minor'
  END AS control_level
FROM public.beneficial_owners
WHERE effective_to IS NULL AND pct_detention >= 10;

DO $$ BEGIN RAISE NOTICE '✓ Migration 253 — Phase E GBC : Beneficial Owners (UBO)'; END $$;


-- ─────────────────────────────────────────────────────────────────────
-- Migration 254 — source : 254_gbc_consolidation_ifrs10.sql
-- ─────────────────────────────────────────────────────────────────────

-- ============================================================================
-- Migration 254 — Phase F GBC : Consolidation IFRS 10
-- ============================================================================
-- Pour holdings mauriciennes avec filiales étrangères : états consolidés
-- avec élimination intercompany, goodwill (IFRS 3), NCI, translation IAS 21.
-- ============================================================================

-- Relations parent-enfant entre sociétés
CREATE TABLE IF NOT EXISTS public.societes_relationships (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_societe_id        UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  child_societe_id         UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  pct_detention            NUMERIC(5,2) NOT NULL CHECK (pct_detention BETWEEN 0 AND 100),
  pct_voting_rights        NUMERIC(5,2),
  relationship_type        TEXT NOT NULL CHECK (relationship_type IN ('subsidiary','associate','joint_venture')),
  acquisition_date         DATE NOT NULL,
  acquisition_cost_mur     NUMERIC(15,2),
  fair_value_net_assets_acquisition_mur NUMERIC(15,2),  -- pour calcul goodwill
  goodwill_mur             NUMERIC(15,2),                -- IFRS 3 : Cost - FV net assets × pct
  effective_from           DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to             DATE,
  consolidation_method     TEXT NOT NULL DEFAULT 'full' CHECK (consolidation_method IN ('full','equity','proportional')),
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  CHECK (parent_societe_id <> child_societe_id),
  UNIQUE (parent_societe_id, child_societe_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_soc_rel_parent ON public.societes_relationships(parent_societe_id);
CREATE INDEX IF NOT EXISTS idx_soc_rel_child  ON public.societes_relationships(child_societe_id);
ALTER TABLE public.societes_relationships ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='societes_relationships' AND policyname='rel_tenant_select') THEN
    CREATE POLICY rel_tenant_select ON public.societes_relationships
      FOR SELECT USING (public.user_has_societe_access(parent_societe_id) OR public.user_has_societe_access(child_societe_id));
    CREATE POLICY rel_tenant_modify ON public.societes_relationships
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(parent_societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(parent_societe_id));
  END IF;
END $$;

-- Éliminations intercompany à appliquer lors de la consolidation
CREATE TABLE IF NOT EXISTS public.consolidation_eliminations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_societe_id   UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice            TEXT NOT NULL,
  elimination_type    TEXT NOT NULL CHECK (elimination_type IN (
    'intra_revenue', 'intra_cogs', 'intra_loan',
    'intra_dividend', 'intra_ar_ap', 'goodwill_amortization',
    'unrealized_profit_stock', 'fair_value_adjustment'
  )),
  from_societe_id     UUID REFERENCES public.societes(id),
  to_societe_id       UUID REFERENCES public.societes(id),
  amount_mur          NUMERIC(15,2) NOT NULL,
  description         TEXT,
  source_ecriture_ids UUID[],         -- références audit
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cons_elim_parent ON public.consolidation_eliminations(parent_societe_id, exercice);
ALTER TABLE public.consolidation_eliminations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='consolidation_eliminations' AND policyname='cons_elim_tenant_select') THEN
    CREATE POLICY cons_elim_tenant_select ON public.consolidation_eliminations
      FOR SELECT USING (public.user_has_societe_access(parent_societe_id));
    CREATE POLICY cons_elim_tenant_modify ON public.consolidation_eliminations
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(parent_societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(parent_societe_id));
  END IF;
END $$;

-- RPC : agrégation consolidée brut (avant éliminations)
CREATE OR REPLACE FUNCTION public.consolidate_aggregate(
  p_parent_societe_id UUID,
  p_exercice TEXT
) RETURNS TABLE (
  numero_compte TEXT,
  total_debit_mur NUMERIC,
  total_credit_mur NUMERIC,
  contributing_societes UUID[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_date_debut DATE;
  v_date_fin   DATE;
BEGIN
  v_date_debut := (substring(p_exercice from 1 for 4) || '-07-01')::DATE;
  v_date_fin   := (substring(p_exercice from 6 for 4) || '-06-30')::DATE;

  RETURN QUERY
  WITH scope AS (
    SELECT p_parent_societe_id AS sid
    UNION
    SELECT child_societe_id FROM public.societes_relationships
     WHERE parent_societe_id = p_parent_societe_id
       AND effective_to IS NULL
       AND consolidation_method = 'full'
  )
  SELECT
    e.numero_compte,
    SUM(COALESCE(e.debit_mur, 0))  AS total_debit_mur,
    SUM(COALESCE(e.credit_mur, 0)) AS total_credit_mur,
    ARRAY_AGG(DISTINCT e.societe_id) AS contributing_societes
  FROM public.ecritures_comptables_v2 e
  INNER JOIN scope s ON s.sid = e.societe_id
  WHERE e.date_ecriture BETWEEN v_date_debut AND v_date_fin
  GROUP BY e.numero_compte
  ORDER BY e.numero_compte;
END;
$$;

-- RPC : calcul NCI (Non-Controlling Interest)
CREATE OR REPLACE FUNCTION public.compute_nci(
  p_parent_societe_id UUID,
  p_exercice TEXT
) RETURNS TABLE (
  child_societe_id UUID,
  pct_nci NUMERIC,
  child_equity_mur NUMERIC,
  nci_share_mur NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_date_fin DATE;
BEGIN
  v_date_fin := (substring(p_exercice from 6 for 4) || '-06-30')::DATE;

  RETURN QUERY
  SELECT
    r.child_societe_id,
    (100 - r.pct_detention) AS pct_nci,
    COALESCE(
      (SELECT SUM(COALESCE(e.credit_mur,0) - COALESCE(e.debit_mur,0))
         FROM public.ecritures_comptables_v2 e
        WHERE e.societe_id = r.child_societe_id
          AND e.numero_compte LIKE '1%'
          AND e.numero_compte NOT LIKE '17%'
          AND e.numero_compte NOT LIKE '16%'
          AND e.date_ecriture <= v_date_fin
      ), 0) AS child_equity_mur,
    ROUND(
      COALESCE(
        (SELECT SUM(COALESCE(e.credit_mur,0) - COALESCE(e.debit_mur,0))
           FROM public.ecritures_comptables_v2 e
          WHERE e.societe_id = r.child_societe_id
            AND e.numero_compte LIKE '1%'
            AND e.numero_compte NOT LIKE '17%'
            AND e.numero_compte NOT LIKE '16%'
            AND e.date_ecriture <= v_date_fin
        ), 0) * (100 - r.pct_detention) / 100.0,
      2) AS nci_share_mur
  FROM public.societes_relationships r
  WHERE r.parent_societe_id = p_parent_societe_id
    AND r.effective_to IS NULL
    AND r.consolidation_method = 'full'
    AND r.pct_detention < 100;
END;
$$;

DO $$ BEGIN RAISE NOTICE '✓ Migration 254 — Phase F GBC : Consolidation IFRS 10'; END $$;


-- ─────────────────────────────────────────────────────────────────────
-- Migration 255 — source : 255_gbc_crs_fatca.sql
-- ─────────────────────────────────────────────────────────────────────

-- ============================================================================
-- Migration 255 — Phase G GBC : CRS / FATCA reporting
-- ============================================================================
-- OECD CRS + US-Mauritius IGA Model 1A. Annual filing à la MRA (31 juillet).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crs_account_holders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id           UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  reporting_year       INT NOT NULL,
  holder_type          TEXT NOT NULL CHECK (holder_type IN ('individual','entity','controlling_person')),
  holder_name          TEXT NOT NULL,
  holder_dob           DATE,
  holder_address       TEXT,
  country_of_residence TEXT NOT NULL,          -- ISO 3166-1
  tin                  TEXT,                    -- Tax Identification Number
  tin_issuing_country  TEXT,
  account_number       TEXT NOT NULL,
  account_balance_eoy_usd  NUMERIC(15,2),       -- End of year balance USD
  account_currency     TEXT NOT NULL DEFAULT 'USD',
  interest_paid_usd    NUMERIC(15,2) DEFAULT 0,
  dividends_paid_usd   NUMERIC(15,2) DEFAULT 0,
  gross_proceeds_usd   NUMERIC(15,2) DEFAULT 0,  -- sale proceeds
  other_income_usd     NUMERIC(15,2) DEFAULT 0,
  is_fatca_reportable  BOOLEAN NOT NULL DEFAULT FALSE,  -- US Person
  is_crs_reportable    BOOLEAN NOT NULL DEFAULT TRUE,
  document_status      TEXT NOT NULL DEFAULT 'pending'
                       CHECK (document_status IN ('pending','self_certified','due_diligence_complete','reported','closed')),
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crs_societe_year ON public.crs_account_holders(societe_id, reporting_year);
CREATE INDEX IF NOT EXISTS idx_crs_country ON public.crs_account_holders(country_of_residence);
ALTER TABLE public.crs_account_holders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crs_account_holders' AND policyname='crs_tenant_select') THEN
    CREATE POLICY crs_tenant_select ON public.crs_account_holders
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY crs_tenant_modify ON public.crs_account_holders
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- Submissions tracking (filings à la MRA)
CREATE TABLE IF NOT EXISTS public.crs_fatca_submissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id         UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  reporting_year     INT NOT NULL,
  submission_type    TEXT NOT NULL CHECK (submission_type IN ('crs','fatca','combined')),
  submission_date    DATE,
  nb_holders         INT NOT NULL DEFAULT 0,
  total_balance_usd  NUMERIC(15,2),
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','accepted','rejected','amended')),
  mra_ref            TEXT,                       -- référence MRA après acceptation
  xml_payload        TEXT,                       -- XML CRS schema 2.0 généré
  errors             TEXT,
  submitted_by       UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, reporting_year, submission_type)
);
ALTER TABLE public.crs_fatca_submissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crs_fatca_submissions' AND policyname='crs_sub_tenant_select') THEN
    CREATE POLICY crs_sub_tenant_select ON public.crs_fatca_submissions
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY crs_sub_tenant_modify ON public.crs_fatca_submissions
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✓ Migration 255 — Phase G GBC : CRS / FATCA'; END $$;


-- ─────────────────────────────────────────────────────────────────────
-- Migration 256 — source : 256_gbc_pillar_two_globe.sql
-- ─────────────────────────────────────────────────────────────────────

-- ============================================================================
-- Migration 256 — Phase H GBC : BEPS Pillar Two GloBE
-- ============================================================================
-- OECD Pillar Two — Global Minimum Tax 15% pour MNE > €750M de CA mondial.
-- Applicable Maurice depuis 2025. DMTT (Domestic Minimum Top-up Tax) si
-- ETR < 15%.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.globe_jurisdictions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice        TEXT NOT NULL,
  jurisdiction    TEXT NOT NULL,                    -- ISO 3166-1
  globe_income_mur     NUMERIC(15,2) NOT NULL DEFAULT 0,  -- profit financier ajusté GloBE
  covered_taxes_mur    NUMERIC(15,2) NOT NULL DEFAULT 0,
  payroll_mur          NUMERIC(15,2) NOT NULL DEFAULT 0,  -- pour SBIE
  tangible_assets_mur  NUMERIC(15,2) NOT NULL DEFAULT 0,  -- pour SBIE
  etr_pct              NUMERIC(5,3),                       -- Effective Tax Rate
  top_up_tax_mur       NUMERIC(15,2),                      -- (15% - ETR) × Excess Profit
  is_low_taxed         BOOLEAN GENERATED ALWAYS AS (etr_pct < 15) STORED,
  computed_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, exercice, jurisdiction)
);
CREATE INDEX IF NOT EXISTS idx_globe_societe ON public.globe_jurisdictions(societe_id, exercice);
ALTER TABLE public.globe_jurisdictions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='globe_jurisdictions' AND policyname='globe_tenant_select') THEN
    CREATE POLICY globe_tenant_select ON public.globe_jurisdictions
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY globe_tenant_modify ON public.globe_jurisdictions
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- GloBE Information Return (GIR) tracking
CREATE TABLE IF NOT EXISTS public.globe_gir_submissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id         UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice           TEXT NOT NULL,
  consolidated_revenue_eur NUMERIC(15,2) NOT NULL,
  is_in_scope        BOOLEAN GENERATED ALWAYS AS (consolidated_revenue_eur >= 750000000) STORED,
  total_top_up_mur   NUMERIC(15,2),
  total_dmtt_mur     NUMERIC(15,2),                 -- Domestic Minimum Top-up Tax (Maurice)
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','accepted','rejected')),
  submission_date    DATE,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, exercice)
);
ALTER TABLE public.globe_gir_submissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='globe_gir_submissions' AND policyname='gir_tenant_select') THEN
    CREATE POLICY gir_tenant_select ON public.globe_gir_submissions
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY gir_tenant_modify ON public.globe_gir_submissions
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- RPC : calcul ETR + top-up tax pour une juridiction
-- ETR = covered_taxes / globe_income
-- Excess profit = globe_income - SBIE (Substance-Based Income Exclusion)
-- SBIE = 5% × payroll + 5% × tangible_assets (taux 2024+, dégressif)
-- Top-up = (15% - ETR) × Excess Profit
CREATE OR REPLACE FUNCTION public.compute_globe_top_up(
  p_globe_id UUID
) RETURNS TABLE (
  jurisdiction TEXT,
  etr_pct NUMERIC,
  sbie_mur NUMERIC,
  excess_profit_mur NUMERIC,
  top_up_tax_mur NUMERIC,
  is_below_15pct BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_etr NUMERIC;
  v_sbie NUMERIC;
  v_excess NUMERIC;
  v_topup NUMERIC;
BEGIN
  SELECT * INTO r FROM public.globe_jurisdictions WHERE id = p_globe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'globe record % not found', p_globe_id; END IF;
  v_etr := CASE WHEN r.globe_income_mur > 0 THEN (r.covered_taxes_mur / r.globe_income_mur) * 100 ELSE 0 END;
  -- SBIE 2024+ : 5% payroll + 5% tangibles (en 2033 ce sera 5% / 5% — phase-in)
  v_sbie := (r.payroll_mur * 0.05) + (r.tangible_assets_mur * 0.05);
  v_excess := GREATEST(0, r.globe_income_mur - v_sbie);
  v_topup := CASE WHEN v_etr < 15 THEN v_excess * (15 - v_etr) / 100 ELSE 0 END;
  RETURN QUERY SELECT r.jurisdiction, ROUND(v_etr, 3), ROUND(v_sbie, 2), ROUND(v_excess, 2), ROUND(v_topup, 2), v_etr < 15;
END;
$$;

DO $$ BEGIN RAISE NOTICE '✓ Migration 256 — Phase H GBC : BEPS Pillar Two GloBE'; END $$;


-- ─────────────────────────────────────────────────────────────────────
-- Migration 257 — source : 257_ifrs16_leases.sql
-- ─────────────────────────────────────────────────────────────────────

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



COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ✓ Migrations 249 → 257 appliquées.
-- ═══════════════════════════════════════════════════════════════════════
--
-- VÉRIFICATION POST-APPLICATION :
--
--   -- Comptes PCM (9 attendus)
--   SELECT compte, libelle FROM plan_comptable
--    WHERE compte IN ('1078','695','6951','1751','1752','2151','28151','6611','6811')
--    ORDER BY compte;
--
--   -- Tables GBC créées (16 attendues)
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public'
--      AND (table_name LIKE 'gbc_%' OR table_name LIKE 'tp_%'
--           OR table_name LIKE 'crs_%' OR table_name LIKE 'globe_%'
--           OR table_name IN ('beneficial_owners','beneficial_owners_history',
--                             'societes_relationships','consolidation_eliminations',
--                             'leases','lease_payment_schedule'))
--    ORDER BY table_name;
--
--   -- Colonnes ajoutées sur societes
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'societes' AND column_name = 'devise_fonctionnelle';
--
--   -- Colonnes ajoutées sur ecritures_comptables_v2
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'ecritures_comptables_v2'
--      AND column_name IN ('debit_fonctionnelle','credit_fonctionnelle',
--                          'devise_origine','taux_fonct_vers_mur','per_category');
--
--   -- RPCs créées
--   SELECT routine_name FROM information_schema.routines
--    WHERE routine_schema = 'public'
--      AND routine_name IN ('ias21_classify_account','ias21_compute_cta',
--                           'gbc_compute_tax_liability','gbc_assess_substance',
--                           'consolidate_aggregate','compute_nci',
--                           'compute_globe_top_up','compute_lease_pv',
--                           'generate_lease_schedule')
--    ORDER BY routine_name;
--
-- ═══════════════════════════════════════════════════════════════════════
