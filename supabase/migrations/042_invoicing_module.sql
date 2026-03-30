-- ============================================================
-- Migration 042: Invoicing module enhancements
-- MRA-compliant invoicing for Mauritius companies
-- ============================================================

-- Extend factures table with line items and invoicing fields
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS lignes JSONB DEFAULT '[]';
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS conditions_paiement INTEGER DEFAULT 30;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS notes_internes TEXT;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS termes TEXT;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS template TEXT DEFAULT 'standard';
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS client_offshore BOOLEAN DEFAULT FALSE;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS remise_pct NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS remise_montant NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS recurrent BOOLEAN DEFAULT FALSE;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS recurrent_frequence TEXT;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS mode_paiement TEXT DEFAULT 'banque';
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS paye_par TEXT;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS contact_id UUID;

-- Invoice contacts (billing clients)
CREATE TABLE IF NOT EXISTS public.factures_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  entreprise TEXT,
  adresse TEXT,
  email TEXT,
  telephone TEXT,
  vat_number TEXT,
  devise TEXT DEFAULT 'MUR',
  conditions_paiement INTEGER DEFAULT 30,
  offshore BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.factures_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fc_auth' AND tablename = 'factures_contacts') THEN
    CREATE POLICY "fc_auth" ON public.factures_contacts FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_factures_contacts_societe ON public.factures_contacts(societe_id);

-- Invoice catalogue (services/products)
CREATE TABLE IF NOT EXISTS public.factures_catalogue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  prix_unitaire NUMERIC(15,2) DEFAULT 0,
  devise TEXT DEFAULT 'MUR',
  tva_applicable BOOLEAN DEFAULT TRUE,
  categorie TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.factures_catalogue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fcat_auth' AND tablename = 'factures_catalogue') THEN
    CREATE POLICY "fcat_auth" ON public.factures_catalogue FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_factures_catalogue_societe ON public.factures_catalogue(societe_id);
