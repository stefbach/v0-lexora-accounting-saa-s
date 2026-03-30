-- MRA e-Invoicing (IFP) fields for factures
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS irn TEXT;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS qr_code_data TEXT;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS fiscalisation_date TIMESTAMPTZ;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS mra_status TEXT DEFAULT 'non_fiscalise';
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS type_document TEXT DEFAULT 'facture' CHECK (type_document IN ('facture', 'avoir', 'note_debit'));
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS facture_reference_id UUID REFERENCES public.factures(id);

-- MRA configuration per societe
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS mra_ebs_id TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS mra_api_key TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS mra_environment TEXT DEFAULT 'sandbox';
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS mra_fiscalisation_active BOOLEAN DEFAULT FALSE;

-- Index for fast lookup of fiscalised invoices
CREATE INDEX IF NOT EXISTS idx_factures_irn ON public.factures(irn) WHERE irn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_factures_mra_status ON public.factures(mra_status);
CREATE INDEX IF NOT EXISTS idx_factures_type_document ON public.factures(type_document);
CREATE INDEX IF NOT EXISTS idx_factures_reference ON public.factures(facture_reference_id) WHERE facture_reference_id IS NOT NULL;
