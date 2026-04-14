-- ============================================================
-- MIGRATION 128 — Tiers annuaire (supplier/client directory)
-- ============================================================
-- Tracks known suppliers/clients with their offshore status
-- so the OCR pipeline can auto-apply client_offshore + reverse
-- charge flags without human intervention on repeat suppliers.

-- Add reverse_charge column to factures (not previously present)
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS reverse_charge BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_factures_reverse_charge
  ON public.factures (reverse_charge) WHERE reverse_charge = TRUE;

CREATE TABLE IF NOT EXISTS tiers_annuaire (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  nom_variants TEXT[] DEFAULT ARRAY[]::TEXT[],
  brn TEXT,
  vat_number TEXT,
  est_offshore BOOLEAN DEFAULT FALSE,
  reverse_charge BOOLEAN DEFAULT FALSE,
  type_tiers TEXT CHECK (type_tiers IN ('client', 'fournisseur', 'both')) DEFAULT 'both',
  pays TEXT DEFAULT 'MU',
  devise_principale TEXT DEFAULT 'MUR',
  source TEXT CHECK (source IN ('manuel', 'ocr_auto', 'import')) DEFAULT 'ocr_auto',
  verifie BOOLEAN DEFAULT FALSE,
  confiance INT DEFAULT 50,
  nb_utilisations INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Si la table existait déjà avec un schéma partiel, s'assurer que
-- toutes les colonnes sont présentes avant de créer les index.
ALTER TABLE public.tiers_annuaire
  ADD COLUMN IF NOT EXISTS nom_variants TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS brn TEXT,
  ADD COLUMN IF NOT EXISTS vat_number TEXT,
  ADD COLUMN IF NOT EXISTS est_offshore BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reverse_charge BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS type_tiers TEXT DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS pays TEXT DEFAULT 'MU',
  ADD COLUMN IF NOT EXISTS devise_principale TEXT DEFAULT 'MUR',
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ocr_auto',
  ADD COLUMN IF NOT EXISTS verifie BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confiance INT DEFAULT 50,
  ADD COLUMN IF NOT EXISTS nb_utilisations INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Unique by normalized name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tiers_annuaire_nom_lower
  ON tiers_annuaire (LOWER(nom));
CREATE INDEX IF NOT EXISTS idx_tiers_annuaire_variants
  ON tiers_annuaire USING GIN (nom_variants);
CREATE INDEX IF NOT EXISTS idx_tiers_annuaire_brn
  ON tiers_annuaire (brn) WHERE brn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tiers_annuaire_offshore
  ON tiers_annuaire (est_offshore, verifie);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_tiers_annuaire_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tiers_annuaire_updated_at ON tiers_annuaire;
CREATE TRIGGER trigger_tiers_annuaire_updated_at
  BEFORE UPDATE ON tiers_annuaire
  FOR EACH ROW EXECUTE FUNCTION update_tiers_annuaire_updated_at();

-- RLS
ALTER TABLE tiers_annuaire ENABLE ROW LEVEL SECURITY;

-- All authenticated users can READ (shared directory)
CREATE POLICY tiers_annuaire_read ON tiers_annuaire
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- comptable/admin/client_admin can write
CREATE POLICY tiers_annuaire_write ON tiers_annuaire
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin')
    )
  );

COMMENT ON TABLE tiers_annuaire IS 'Directory of known tiers (suppliers/clients) with offshore and reverse-charge flags, used by OCR pipeline for auto-classification.';
COMMENT ON COLUMN tiers_annuaire.nom_variants IS 'Alternative spellings detected by OCR (e.g. "SKYCALL Ltd", "SKYCALL LIMITED", "Skycall")';
COMMENT ON COLUMN tiers_annuaire.verifie IS 'TRUE when a human (client_admin/comptable) has confirmed the offshore/reverse_charge flags';
COMMENT ON COLUMN tiers_annuaire.source IS 'manuel = created by user; ocr_auto = auto-created on first OCR; import = bulk import';
