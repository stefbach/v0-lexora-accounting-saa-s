-- ============================================================
-- LEXORA — Migration 006: Complete data model refactoring
-- Separate clients, comptables, comptes_bancaires tables
-- ============================================================

-- ============================================================
-- 1. CLIENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  nom_complet TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telephone TEXT,
  type_client TEXT CHECK (type_client IN ('individuel', 'mono_societe', 'multi_societe')) DEFAULT 'mono_societe',
  adresse TEXT,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_user ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(email);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage clients" ON public.clients FOR ALL
  USING (public.get_my_role() IN ('admin'));

CREATE POLICY "Comptables can view clients" ON public.clients FOR SELECT
  USING (public.get_my_role() IN ('comptable', 'comptable_dedie'));

CREATE POLICY "Clients can view own record" ON public.clients FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- 2. COMPTABLES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.comptables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  nom_complet TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telephone TEXT,
  type TEXT CHECK (type IN ('principal', 'dedie')) DEFAULT 'dedie',
  principal_id UUID REFERENCES public.comptables(id),
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comptables_user ON public.comptables(user_id);
CREATE INDEX IF NOT EXISTS idx_comptables_principal ON public.comptables(principal_id);

ALTER TABLE public.comptables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage comptables" ON public.comptables FOR ALL
  USING (public.get_my_role() IN ('admin'));

CREATE POLICY "Comptables can view comptables" ON public.comptables FOR SELECT
  USING (public.get_my_role() IN ('comptable', 'comptable_dedie'));

-- ============================================================
-- 3. COMPTES BANCAIRES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.comptes_bancaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE NOT NULL,
  banque TEXT NOT NULL,
  numero_compte TEXT,
  iban TEXT,
  devise TEXT DEFAULT 'MUR',
  compte_comptable TEXT,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comptes_bancaires_societe ON public.comptes_bancaires(societe_id);

ALTER TABLE public.comptes_bancaires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage comptes bancaires" ON public.comptes_bancaires FOR ALL
  USING (public.get_my_role() IN ('admin'));

CREATE POLICY "Comptables can view comptes bancaires" ON public.comptes_bancaires FOR SELECT
  USING (public.get_my_role() IN ('comptable', 'comptable_dedie'));

CREATE POLICY "Clients can view their comptes bancaires" ON public.comptes_bancaires FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.societes s
      JOIN public.clients c ON c.id = s.client_id
      WHERE s.id = public.comptes_bancaires.societe_id
      AND c.user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. UPDATE SOCIETES — Add client_id, more fields
-- ============================================================
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id);
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS type_activite TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS pays TEXT DEFAULT 'Mauritius';
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS devise_principale TEXT DEFAULT 'MUR';
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS date_creation_legale DATE;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS date_fin_exercice DATE;

-- ============================================================
-- 5. ASSIGNATIONS TABLE (replaces assignations_comptable)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.assignations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE NOT NULL,
  comptable_id UUID REFERENCES public.comptables(id) NOT NULL,
  assigne_par UUID REFERENCES public.comptables(id),
  modules_autorises TEXT[] DEFAULT ARRAY['fournisseurs','clients','banque','salaires','charges_sociales','tva','documents','rapports'],
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, comptable_id)
);

CREATE INDEX IF NOT EXISTS idx_assignations_societe ON public.assignations(societe_id);
CREATE INDEX IF NOT EXISTS idx_assignations_comptable ON public.assignations(comptable_id);

ALTER TABLE public.assignations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage assignations" ON public.assignations FOR ALL
  USING (public.get_my_role() IN ('admin'));

CREATE POLICY "Comptables principaux can manage assignations" ON public.assignations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.comptables c
      WHERE c.user_id = auth.uid() AND c.type = 'principal'
    )
  );

CREATE POLICY "Comptables can view their assignations" ON public.assignations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.comptables c
      WHERE c.user_id = auth.uid() AND c.id = public.assignations.comptable_id
    )
  );

-- ============================================================
-- 6. UPDATE ALERTES TABLE (use new references)
-- ============================================================
-- Drop old alertes_comptable if exists and recreate as alertes
DROP TABLE IF EXISTS public.alertes_comptable;

CREATE TABLE IF NOT EXISTS public.alertes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comptable_id UUID REFERENCES public.comptables(id),
  societe_id UUID REFERENCES public.societes(id),
  client_id UUID REFERENCES public.clients(id),
  type_alerte TEXT NOT NULL,
  niveau TEXT NOT NULL CHECK (niveau IN ('critique', 'important', 'informatif')),
  titre TEXT NOT NULL,
  description TEXT,
  montant_mur NUMERIC(15,2),
  echeance DATE,
  statut TEXT DEFAULT 'active' CHECK (statut IN ('active', 'en_cours', 'resolue', 'ignoree')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alertes_comptable_new ON public.alertes(comptable_id);
CREATE INDEX IF NOT EXISTS idx_alertes_statut_new ON public.alertes(statut);
CREATE INDEX IF NOT EXISTS idx_alertes_niveau_new ON public.alertes(niveau);
CREATE INDEX IF NOT EXISTS idx_alertes_societe_new ON public.alertes(societe_id);

ALTER TABLE public.alertes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage alertes" ON public.alertes FOR ALL
  USING (public.get_my_role() IN ('admin'));

CREATE POLICY "Comptables can view their alertes" ON public.alertes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.comptables c
      WHERE c.user_id = auth.uid() AND c.id = public.alertes.comptable_id
    )
    OR public.get_my_role() = 'comptable'
  );

-- ============================================================
-- 7. DOSSIERS STANDARDS (auto-created per société)
-- ============================================================
-- Update existing dossiers table to match new schema
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS type_dossier TEXT;
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS annee INTEGER;
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS mois INTEGER;
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS cree_par_systeme BOOLEAN DEFAULT true;
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS nom TEXT;

-- Add societe_id to dossiers if not exists
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS societe_id UUID REFERENCES public.societes(id);

-- ============================================================
-- 8. UPDATE DOCUMENTS — Add anomalies field
-- ============================================================
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS anomalies_detectees JSONB;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS uploade_par_type TEXT CHECK (uploade_par_type IN ('client', 'comptable'));

-- ============================================================
-- 9. FUNCTION: Auto-create dossiers for new société
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_dossiers_for_societe()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.dossiers (societe_id, nom, type_dossier, description, cree_par_systeme) VALUES
    (NEW.id, 'Factures Fournisseurs', 'factures_fournisseurs', 'Factures reçues fournisseurs', true),
    (NEW.id, 'Factures Clients', 'factures_clients', 'Factures émises clients', true),
    (NEW.id, 'Relevés Bancaires', 'releves_bancaires', 'Relevés bancaires mensuels', true),
    (NEW.id, 'Fiches de Paie', 'fiches_paie', 'Bulletins de salaire', true),
    (NEW.id, 'Charges Sociales MRA', 'charges_sociales', 'NPF, HRDC, NPS, PAYE', true),
    (NEW.id, 'Déclarations TVA MRA', 'declarations_tva', 'Déclarations TVA mensuelles', true),
    (NEW.id, 'Rapprochement Bancaire', 'rapprochement_bancaire', 'Rapprochements mensuels', true),
    (NEW.id, 'Immobilisations', 'immobilisations', 'Actifs et amortissements', true),
    (NEW.id, 'Contrats', 'contrats', 'Contrats fournisseurs/clients/travail', true),
    (NEW.id, 'Rapports P&L', 'rapports_pnl', 'Rapports mensuels', true),
    (NEW.id, 'Liasse Fiscale Annuelle', 'liasse_fiscale', 'Bilan et IS annuel MRA', true),
    (NEW.id, 'Divers', 'divers', 'Documents non classifiés', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_create_dossiers ON public.societes;
CREATE TRIGGER auto_create_dossiers
  AFTER INSERT ON public.societes
  FOR EACH ROW EXECUTE FUNCTION public.create_dossiers_for_societe();
