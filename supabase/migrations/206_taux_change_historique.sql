-- ============================================================================
-- Migration 171 — Table des taux de change HISTORIQUES (source de vérité)
-- ============================================================================
--
-- CONTEXTE :
-- Avant cette migration, Lexora utilisait `taux_change` (taux TEMPS RÉEL) pour
-- convertir en MUR des transactions HISTORIQUES. Conséquence : les montants
-- MUR des écritures anciennes dérivaient à chaque refresh du dashboard et ne
-- coïncidaient plus avec les relevés bancaires originaux.
--
-- PRINCIPE COMPTABLE :
-- Le taux de change appliqué à une transaction DOIT être figé au moment de
-- la transaction (même principe qu'un montant TTC sur une facture — immutable
-- une fois enregistré). Cette table fournit le taux de référence par (date,
-- devise) utilisé pour convertir une écriture historique en MUR.
--
-- IMPORTANT — SEED VALUES :
-- Les valeurs insérées ci-dessous sont des ESTIMATIONS basées sur les relevés
-- Digital Data observés et sur la tendance MUR/EUR + MUR/USD mi-2025 → T1-2026.
-- Elles NE SONT PAS des taux officiels Bank of Mauritius. Elles servent de
-- bootstrap pour que le système ne crashe pas à la première écriture ancienne.
--
-- L'admin DOIT affiner ces valeurs via un back-office futur (ou un import API
-- Bank of Mauritius). Tant qu'on n'a pas ce back-office, un opérateur peut
-- UPDATE manuellement les lignes avec les taux officiels publiés par la BoM.
-- ============================================================================

-- Table des taux de change historiques (source de vérité par date)
CREATE TABLE IF NOT EXISTS public.taux_change_historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_taux DATE NOT NULL,
  devise TEXT NOT NULL CHECK (devise ~ '^[A-Z]{3}$'),
  taux_vers_mur NUMERIC(12, 6) NOT NULL CHECK (taux_vers_mur > 0),
  source TEXT DEFAULT 'manuel',  -- 'manuel' | 'api' | 'releve_bancaire' | 'seed_estimate'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date_taux, devise)
);

COMMENT ON TABLE public.taux_change_historique IS
  'Taux de change figés par date. Source de vérité pour convertir en MUR toute '
  'transaction historique. NE JAMAIS utiliser le taux live (taux_change) pour '
  'des écritures passées — sinon amplification progressive des montants MUR.';

COMMENT ON COLUMN public.taux_change_historique.taux_vers_mur IS
  'Nombre de MUR pour 1 unité de la devise (ex: EUR=52.00 signifie 1 EUR = 52 MUR).';

COMMENT ON COLUMN public.taux_change_historique.source IS
  'Origine du taux : manuel (saisie admin), api (BoM/ExchangeRate-API), '
  'releve_bancaire (déduit d''un relevé), seed_estimate (valeur bootstrap).';

CREATE INDEX IF NOT EXISTS idx_taux_change_hist_date_devise
  ON public.taux_change_historique (date_taux DESC, devise);

-- ----------------------------------------------------------------------------
-- Seed avec des taux représentatifs observés dans les relevés Digital Data
-- (valeurs ajustées manuellement — À RAFFINER par l'opérateur via back-office)
-- ----------------------------------------------------------------------------
INSERT INTO public.taux_change_historique (date_taux, devise, taux_vers_mur, source) VALUES
  ('2025-07-01', 'EUR', 52.00, 'seed_estimate'),
  ('2025-08-01', 'EUR', 52.20, 'seed_estimate'),
  ('2025-09-01', 'EUR', 52.80, 'seed_estimate'),
  ('2025-10-01', 'EUR', 53.20, 'seed_estimate'),
  ('2025-11-01', 'EUR', 53.50, 'seed_estimate'),
  ('2025-12-01', 'EUR', 53.80, 'seed_estimate'),
  ('2026-01-01', 'EUR', 54.00, 'seed_estimate'),
  ('2026-02-01', 'EUR', 54.20, 'seed_estimate'),
  ('2026-03-01', 'EUR', 54.50, 'seed_estimate'),
  ('2026-04-01', 'EUR', 54.80, 'seed_estimate'),
  ('2025-07-01', 'USD', 45.50, 'seed_estimate'),
  ('2025-10-01', 'USD', 46.00, 'seed_estimate'),
  ('2026-01-01', 'USD', 46.50, 'seed_estimate'),
  ('2026-04-01', 'USD', 47.00, 'seed_estimate')
ON CONFLICT (date_taux, devise) DO NOTHING;

-- ----------------------------------------------------------------------------
-- RLS : lecture pour tous les auth users (donnée de référence publique tenant)
-- ----------------------------------------------------------------------------
ALTER TABLE public.taux_change_historique ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taux_change_read" ON public.taux_change_historique;
CREATE POLICY "taux_change_read" ON public.taux_change_historique
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "taux_change_write" ON public.taux_change_historique;
CREATE POLICY "taux_change_write" ON public.taux_change_historique
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin','super_admin','comptable','comptable_dedie')
    )
  );
