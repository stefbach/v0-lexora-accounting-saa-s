-- Templates de facture générés par IA
CREATE TABLE IF NOT EXISTS public.facture_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  nom TEXT NOT NULL,
  couleur_primaire TEXT DEFAULT '#1E2A4A',
  couleur_secondaire TEXT DEFAULT '#C9A84C',
  logo_position TEXT DEFAULT 'top-left',
  entete_html TEXT,
  pied_page_html TEXT,
  colonnes JSONB DEFAULT '["description","quantite","prix_unitaire","montant"]',
  mentions_legales TEXT,
  conditions_paiement TEXT,
  devise_defaut TEXT DEFAULT 'MUR',
  tva_defaut DECIMAL(5,2) DEFAULT 15,
  format_numero TEXT DEFAULT 'INV-{YYYY}-{NNN}',
  style JSONB DEFAULT '{}',
  source_fichier TEXT,
  created_by UUID,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, nom)
);

ALTER TABLE public.facture_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "rh_full_ft" ON public.facture_templates FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','client_admin','comptable'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
