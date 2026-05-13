-- ============================================================================
-- Migration 258 — Phase K : Paramétrage type de société (regime)
-- ============================================================================
-- Ajoute un champ `regime` typé sur societes pour distinguer :
--   • domestic           — PME Maurice classique (défaut)
--   • gbc1               — Global Business License (ex-GBC Category 1)
--   • authorised_company — Authorised Company (ex-GBC2)
--   • holding            — Société holding consolidante (avec filiales)
--   • branch_foreign_pe  — Succursale d'une entité étrangère
--
-- Permet à Lexora d'activer/désactiver dynamiquement les modules GBC
-- (PER, substance, TP, UBO, consolidation, CRS, Pillar Two) selon le profil.
--
-- Ajoute aussi les fields FSC (numéro de licence, type) pour les GBC/AC.
--
-- BACKWARD COMPATIBLE : default 'domestic' pour toutes les sociétés
-- existantes — aucun impact sur les PME déjà en place.
-- ============================================================================

ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS regime TEXT NOT NULL DEFAULT 'domestic',
  ADD COLUMN IF NOT EXISTS fsc_license_number TEXT,
  ADD COLUMN IF NOT EXISTS fsc_license_type   TEXT,
  ADD COLUMN IF NOT EXISTS fsc_license_issued DATE,
  ADD COLUMN IF NOT EXISTS fsc_license_expiry DATE,
  ADD COLUMN IF NOT EXISTS tax_residency_country TEXT,   -- ISO 3166-1 (MU par défaut)
  ADD COLUMN IF NOT EXISTS gbc_activity_main TEXT;       -- pour préremplir gbc_substance_tracking.activity_code

-- Contrainte enum (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'societes_regime_check'
       AND conrelid = 'public.societes'::regclass
  ) THEN
    ALTER TABLE public.societes
      ADD CONSTRAINT societes_regime_check
      CHECK (regime IN ('domestic', 'gbc1', 'authorised_company', 'holding', 'branch_foreign_pe'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_societes_regime ON public.societes(regime);

COMMENT ON COLUMN public.societes.regime IS
  'Type de société (régime fiscal/réglementaire) :
   - domestic           : PME Maurice classique (IFRS for SMEs, IS 15%, MRA standard)
   - gbc1               : Global Business License (FSC, Full IFRS, PER 80%, substance CIGA, UBO obligatoire)
   - authorised_company : Authorised Company (FSC, non-résidente fiscale, taxée pays de contrôle, UBO obligatoire)
   - holding            : Holding consolidante (IFRS 10 + Goodwill IFRS 3, possible MNE Pillar Two)
   - branch_foreign_pe  : Succursale d''une entité étrangère (reporting siège + IAS 21)';

COMMENT ON COLUMN public.societes.fsc_license_number IS 'Numéro de licence FSC (obligatoire si regime gbc1/authorised_company).';
COMMENT ON COLUMN public.societes.fsc_license_type IS 'Type FSC : GBL, Authorised Company, CIS Manager, Investment Adviser, etc.';

-- Vue : résumé activation modules par société
CREATE OR REPLACE VIEW public.vw_societes_modules_actives AS
SELECT
  s.id AS societe_id,
  s.nom,
  s.regime,
  s.devise_fonctionnelle,
  s.fsc_license_number IS NOT NULL AS has_fsc_license,
  -- Activation modules
  s.regime <> 'domestic'                                        AS gbc_modules_active,
  s.regime IN ('gbc1','authorised_company','holding')           AS per_active,
  s.regime IN ('gbc1','holding')                                AS substance_required,
  s.regime IN ('gbc1','authorised_company','holding')           AS ubo_required,
  s.regime IN ('gbc1','authorised_company','holding')           AS tp_required,
  s.regime = 'holding'                                          AS consolidation_active,
  s.regime IN ('gbc1','authorised_company')                     AS crs_fatca_active,
  s.regime = 'holding'                                          AS pillar_two_eligible,  -- nécessite check CA > €750M en plus
  s.devise_fonctionnelle <> 'MUR'                               AS ias21_translation_active,
  TRUE                                                          AS ifrs16_leases_active  -- IFRS 16 cross-cutting
FROM public.societes s;

COMMENT ON VIEW public.vw_societes_modules_actives IS
  'Quels modules GBC sont actifs pour chaque société selon son regime. '
  'Source de vérité pour le sidebar dynamique et le dashboard.';

DO $$ BEGIN
  RAISE NOTICE '✓ Migration 258 — Phase K : societes.regime + fields FSC';
  RAISE NOTICE '  Régimes : domestic | gbc1 | authorised_company | holding | branch_foreign_pe';
  RAISE NOTICE '  Vue : vw_societes_modules_actives (activation dynamique des modules)';
END $$;
