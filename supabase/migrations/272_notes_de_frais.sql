-- =============================================================================
-- Migration 269 — Notes de frais employés (Phase E quick wins Telegram)
-- =============================================================================
-- Permet à un employé d'enregistrer une note de frais à valider par le comptable :
--   - Photo de ticket envoyée via Telegram → OCR Anthropic vision (montant, vendor,
--     date, devise) → INSERT notes_de_frais statut='brouillon'.
--   - Le comptable peut ensuite valider/refuser/rembourser via l'UI Lexora.
--
-- On stocke aussi le document_id (pièce justificative scannée dans storage) +
-- la sortie OCR brute (ocr_raw JSONB) pour audit et re-traitement éventuel.
--
-- Idempotente : IF NOT EXISTS + IF NOT EXISTS sur les index/policies.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notes_de_frais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  employe_id UUID REFERENCES public.employes(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Données ticket
  vendor TEXT,
  date_facture DATE,
  montant_ttc NUMERIC(14,2),
  devise TEXT DEFAULT 'MUR',
  categorie TEXT,          -- repas | taxi | essence | hotel | deplacement | divers
  description TEXT,

  -- Statut workflow
  statut TEXT NOT NULL DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon', 'en_validation', 'approuvee', 'refusee', 'remboursee')),

  -- Pièce justificative
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,

  -- OCR brut (debug / audit)
  ocr_raw JSONB,
  ocr_source TEXT,         -- 'anthropic-vision' | 'manuel' | 'n8n'
  ocr_confidence NUMERIC(3,2),

  -- Validation
  validee_par UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  validee_le TIMESTAMPTZ,
  motif_refus TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_de_frais_societe
  ON public.notes_de_frais(societe_id);

CREATE INDEX IF NOT EXISTS idx_notes_de_frais_employe
  ON public.notes_de_frais(employe_id);

CREATE INDEX IF NOT EXISTS idx_notes_de_frais_statut
  ON public.notes_de_frais(societe_id, statut);

CREATE INDEX IF NOT EXISTS idx_notes_de_frais_document
  ON public.notes_de_frais(document_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.trg_notes_de_frais_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_notes_de_frais_touch ON public.notes_de_frais;
CREATE TRIGGER trg_notes_de_frais_touch
BEFORE UPDATE ON public.notes_de_frais
FOR EACH ROW EXECUTE FUNCTION public.trg_notes_de_frais_touch();

-- RLS
ALTER TABLE public.notes_de_frais ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notes_de_frais'
      AND policyname = 'notes_de_frais_societe_access'
  ) THEN
    CREATE POLICY "notes_de_frais_societe_access" ON public.notes_de_frais
      FOR ALL USING (
        auth.uid() IS NOT NULL AND (
          -- Lecture pour les membres de la société
          societe_id IN (
            SELECT societe_id FROM public.user_societes WHERE user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.notes_de_frais IS
  'Notes de frais employés (Phase E Telegram). Workflow : brouillon (auto par bot)
   → en_validation → approuvee/refusee → remboursee. Source habituelle :
   photo ticket Telegram OCR Anthropic vision.';
