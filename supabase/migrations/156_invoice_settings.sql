-- ============================================================================
-- Migration 156 — invoice_settings : paramètres de facturation par société
-- ============================================================================
--
-- Remplace le stockage localStorage (`lexora_invoice_settings`,
-- `lexora_invoice_template`, `lexora_invoice_template_colors`,
-- `lexora_mra_settings`) qui était perdu entre appareils / sessions.
--
-- Une seule ligne par société (contrainte UNIQUE sur societe_id). L'UI
-- fait un upsert à chaque sauvegarde.
--
-- Les sous-sections "Clients" et "Catalogue" restent en localStorage pour
-- ce sprint (scope limit).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invoice_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,

  -- Entreprise
  logo_url TEXT,
  brn TEXT,
  vat_number TEXT,
  adresse TEXT,
  telephone TEXT,
  email TEXT,
  website TEXT,

  -- Bancaire
  banque_nom TEXT,
  banque_compte TEXT,
  banque_iban TEXT,
  banque_swift TEXT,

  -- Facturation
  devise_defaut TEXT DEFAULT 'MUR',
  conditions_paiement TEXT,
  prefixe_facture TEXT DEFAULT 'FV',
  prochain_numero INT DEFAULT 1,
  pied_de_page TEXT,
  mention_legale_mra TEXT,

  -- Template
  template_id TEXT DEFAULT 'standard',
  couleur_primaire TEXT DEFAULT '#000000',
  couleur_secondaire TEXT DEFAULT '#cccccc',

  -- MRA
  mra_active BOOLEAN DEFAULT false,
  mra_ebs_id TEXT,
  mra_api_key_encrypted TEXT, -- à chiffrer plus tard (app-level secret)
  mra_env TEXT DEFAULT 'sandbox' CHECK (mra_env IN ('sandbox', 'production')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_settings_societe
  ON public.invoice_settings(societe_id);

-- RLS : accès via user_societes (table présente depuis migration 031)
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'invoice_settings'
      AND policyname = 'invoice_settings_select'
  ) THEN
    CREATE POLICY invoice_settings_select ON public.invoice_settings
      FOR SELECT TO authenticated
      USING (
        societe_id IN (
          SELECT societe_id FROM public.user_societes WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'invoice_settings'
      AND policyname = 'invoice_settings_write'
  ) THEN
    CREATE POLICY invoice_settings_write ON public.invoice_settings
      FOR ALL TO authenticated
      USING (
        societe_id IN (
          SELECT societe_id FROM public.user_societes WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        societe_id IN (
          SELECT societe_id FROM public.user_societes WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.invoice_settings_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_settings_updated_at ON public.invoice_settings;
CREATE TRIGGER trg_invoice_settings_updated_at
  BEFORE UPDATE ON public.invoice_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_settings_set_updated_at();

COMMENT ON TABLE public.invoice_settings IS
  'Paramètres de facturation persistés par société (remplace localStorage).';
