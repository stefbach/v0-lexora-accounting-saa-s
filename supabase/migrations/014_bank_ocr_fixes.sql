-- ============================================================
-- Migration 014: Fix OCR/Bank document processing
-- ============================================================

-- 1. comptes_bancaires: colonnes manquantes selon upload.ts
ALTER TABLE public.comptes_bancaires
  ADD COLUMN IF NOT EXISTS nom_compte TEXT,
  ADD COLUMN IF NOT EXISTS solde_dernier_releve NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS date_dernier_releve DATE,
  ADD COLUMN IF NOT EXISTS ordre_affichage INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compte_principal BOOLEAN DEFAULT false;

-- 2. releves_bancaires: ajouter colonne lignes_json (alias transactions_json pour rétrocompat)
ALTER TABLE public.releves_bancaires
  ADD COLUMN IF NOT EXISTS lignes_json JSONB,
  ADD COLUMN IF NOT EXISTS nb_transactions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nb_ecritures_generees INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ecart_solde NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lignes_manquantes BOOLEAN DEFAULT false;

-- 3. documents: ajouter colonnes pour debug OCR
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS confiance_type INTEGER,
  ADD COLUMN IF NOT EXISTS societe_detectee TEXT,
  ADD COLUMN IF NOT EXISTS ocr_version TEXT DEFAULT 'claude-haiku-4-5';

-- 4. ecritures_comptables: ajouter colonne lettrage (rapprochement)
ALTER TABLE public.ecritures_comptables
  ADD COLUMN IF NOT EXISTS lettrage TEXT,
  ADD COLUMN IF NOT EXISTS lettrage_date DATE,
  ADD COLUMN IF NOT EXISTS rapproche BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ecritures_lettrage ON public.ecritures_comptables(lettrage) WHERE lettrage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ecritures_rapproche ON public.ecritures_comptables(rapproche);
CREATE INDEX IF NOT EXISTS idx_releves_compte ON public.releves_bancaires(compte_bancaire_id);
CREATE INDEX IF NOT EXISTS idx_releves_periode ON public.releves_bancaires(periode);
