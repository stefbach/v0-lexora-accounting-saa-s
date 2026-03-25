-- ============================================================
-- LEXORA — Schéma initial Supabase
-- Plateforme SaaS de comptabilité IA pour Maurice (MRA compliant)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'client', 'comptable')),
  phone TEXT,
  comptable_id UUID REFERENCES public.profiles(id),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for role-based queries
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_comptable ON public.profiles(comptable_id);

-- ============================================================
-- 2. SOCIETES
-- ============================================================
CREATE TABLE public.societes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom TEXT NOT NULL,
  brn TEXT UNIQUE,
  numero_tva_mra TEXT,
  statut_tva BOOLEAN DEFAULT false,
  adresse TEXT,
  telephone TEXT,
  email TEXT,
  comptable_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_societes_comptable ON public.societes(comptable_id);

-- ============================================================
-- 3. DOSSIERS (client ↔ comptable ↔ société)
-- ============================================================
CREATE TABLE public.dossiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comptable_id UUID NOT NULL REFERENCES public.profiles(id),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dossiers_client ON public.dossiers(client_id);
CREATE INDEX idx_dossiers_comptable ON public.dossiers(comptable_id);
CREATE INDEX idx_dossiers_societe ON public.dossiers(societe_id);

-- ============================================================
-- 4. DOCUMENTS
-- ============================================================
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  nom_fichier TEXT NOT NULL,
  type_fichier TEXT NOT NULL CHECK (type_fichier IN ('pdf', 'jpeg', 'png', 'xlsx')),
  type_document TEXT CHECK (type_document IN (
    'facture_fournisseur', 'facture_client', 'releve_bancaire',
    'fiche_paie', 'charges_sociales', 'contrat', 'autre'
  )),
  categorie TEXT,
  societe_detectee TEXT CHECK (societe_detectee IN ('TIBOK', 'BPO', 'OBESITY_CARE', 'NHS_S2')),
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_cours', 'traite', 'erreur')),
  n8n_result JSONB,
  storage_path TEXT NOT NULL,
  taille_fichier BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_dossier ON public.documents(dossier_id);
CREATE INDEX idx_documents_uploaded_by ON public.documents(uploaded_by);
CREATE INDEX idx_documents_statut ON public.documents(statut);
CREATE INDEX idx_documents_type ON public.documents(type_document);

-- ============================================================
-- 5. TVA MENSUELLE
-- ============================================================
CREATE TABLE public.tva_mensuelle (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  societe TEXT NOT NULL CHECK (societe IN ('TIBOK', 'BPO', 'OBESITY_CARE', 'NHS_S2')),
  periode TEXT NOT NULL, -- YYYY-MM
  tva_collectee NUMERIC(15,2) DEFAULT 0,
  tva_deductible NUMERIC(15,2) DEFAULT 0,
  credit_reporte NUMERIC(15,2) DEFAULT 0,
  tva_nette NUMERIC(15,2) DEFAULT 0,
  statut TEXT DEFAULT 'neant' CHECK (statut IN ('a_payer', 'credit', 'neant')),
  date_limite DATE NOT NULL, -- 20 du mois suivant
  date_declaration DATE,
  date_paiement DATE,
  reference_mra TEXT,
  penalites NUMERIC(15,2) DEFAULT 0,
  statut_declaration TEXT DEFAULT 'a_faire' CHECK (statut_declaration IN ('a_faire', 'declare', 'en_retard')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, societe_id, periode)
);

CREATE INDEX idx_tva_client ON public.tva_mensuelle(client_id);
CREATE INDEX idx_tva_societe ON public.tva_mensuelle(societe_id);
CREATE INDEX idx_tva_periode ON public.tva_mensuelle(periode);
CREATE INDEX idx_tva_statut_declaration ON public.tva_mensuelle(statut_declaration);

-- ============================================================
-- 6. RAPPORTS MENSUELS (P&L JSON)
-- ============================================================
CREATE TABLE public.rapports_mensuels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  periode TEXT NOT NULL, -- YYYY-MM
  data JSONB NOT NULL, -- JSON du Prompt 6 (P&L CFO)
  type_rapport TEXT DEFAULT 'pnl' CHECK (type_rapport IN ('pnl', 'bilan', 'tresorerie', 'cfo_summary')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rapports_client ON public.rapports_mensuels(client_id);
CREATE INDEX idx_rapports_periode ON public.rapports_mensuels(periode);

-- ============================================================
-- 7. CHARGES SOCIALES
-- ============================================================
CREATE TABLE public.charges_sociales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  periode TEXT NOT NULL, -- YYYY-MM
  npf NUMERIC(15,2) DEFAULT 0,
  hrdc NUMERIC(15,2) DEFAULT 0,
  nps NUMERIC(15,2) DEFAULT 0,
  paye NUMERIC(15,2) DEFAULT 0,
  statut TEXT DEFAULT 'conforme' CHECK (statut IN ('conforme', 'ecart_detecte')),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, societe_id, periode)
);

CREATE INDEX idx_charges_client ON public.charges_sociales(client_id);
CREATE INDEX idx_charges_societe ON public.charges_sociales(societe_id);

-- ============================================================
-- 8. NOTIFICATIONS (historique WhatsApp/email)
-- ============================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  destinataire_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('whatsapp', 'email')),
  sujet TEXT,
  message TEXT NOT NULL,
  statut TEXT DEFAULT 'pending' CHECK (statut IN ('pending', 'sent', 'failed')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_destinataire ON public.notifications(destinataire_id);
CREATE INDEX idx_notifications_statut ON public.notifications(statut);
CREATE INDEX idx_notifications_type ON public.notifications(type);

-- ============================================================
-- 9. ECRITURES COMPTABLES (journal général)
-- ============================================================
CREATE TABLE public.ecritures_comptables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  date_ecriture DATE NOT NULL,
  journal TEXT NOT NULL, -- ACH, VTE, BNQ, OD, etc.
  numero_piece TEXT,
  compte TEXT NOT NULL,
  libelle TEXT NOT NULL,
  debit NUMERIC(15,2) DEFAULT 0,
  credit NUMERIC(15,2) DEFAULT 0,
  piece_justificative TEXT, -- ref vers document.id
  lettrage TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ecritures_dossier ON public.ecritures_comptables(dossier_id);
CREATE INDEX idx_ecritures_date ON public.ecritures_comptables(date_ecriture);
CREATE INDEX idx_ecritures_journal ON public.ecritures_comptables(journal);
CREATE INDEX idx_ecritures_compte ON public.ecritures_comptables(compte);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.societes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tva_mensuelle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapports_mensuels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charges_sociales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecritures_comptables ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES — PROFILES
-- ============================================================

-- Admins can see all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- Comptables can view their assigned clients
CREATE POLICY "Comptables can view assigned clients"
  ON public.profiles FOR SELECT
  USING (
    comptable_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'comptable'
      AND public.profiles.comptable_id = auth.uid()
    )
  );

-- Admins can insert/update profiles
CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- ============================================================
-- RLS POLICIES — SOCIETES
-- ============================================================

CREATE POLICY "Admins can manage societes"
  ON public.societes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Comptables can view assigned societes"
  ON public.societes FOR SELECT
  USING (
    comptable_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.dossiers d
      WHERE d.societe_id = public.societes.id AND d.comptable_id = auth.uid()
    )
  );

CREATE POLICY "Clients can view their societes"
  ON public.societes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dossiers d
      WHERE d.societe_id = public.societes.id AND d.client_id = auth.uid()
    )
  );

-- ============================================================
-- RLS POLICIES — DOSSIERS
-- ============================================================

CREATE POLICY "Admins can manage dossiers"
  ON public.dossiers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Comptables can view their dossiers"
  ON public.dossiers FOR SELECT
  USING (comptable_id = auth.uid());

CREATE POLICY "Clients can view their dossiers"
  ON public.dossiers FOR SELECT
  USING (client_id = auth.uid());

-- ============================================================
-- RLS POLICIES — DOCUMENTS
-- ============================================================

CREATE POLICY "Admins can manage documents"
  ON public.documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Users can view documents in their dossiers"
  ON public.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dossiers d
      WHERE d.id = public.documents.dossier_id
      AND (d.client_id = auth.uid() OR d.comptable_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert documents in their dossiers"
  ON public.documents FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dossiers d
      WHERE d.id = dossier_id
      AND (d.client_id = auth.uid() OR d.comptable_id = auth.uid())
    )
  );

-- ============================================================
-- RLS POLICIES — TVA MENSUELLE
-- ============================================================

CREATE POLICY "Admins can manage tva"
  ON public.tva_mensuelle FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Clients can view their tva"
  ON public.tva_mensuelle FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "Comptables can view client tva"
  ON public.tva_mensuelle FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.tva_mensuelle.client_id AND p.comptable_id = auth.uid()
    )
  );

-- ============================================================
-- RLS POLICIES — RAPPORTS MENSUELS
-- ============================================================

CREATE POLICY "Admins can manage rapports"
  ON public.rapports_mensuels FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Clients can view their rapports"
  ON public.rapports_mensuels FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "Comptables can view client rapports"
  ON public.rapports_mensuels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.rapports_mensuels.client_id AND p.comptable_id = auth.uid()
    )
  );

-- ============================================================
-- RLS POLICIES — CHARGES SOCIALES
-- ============================================================

CREATE POLICY "Admins can manage charges"
  ON public.charges_sociales FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Clients can view their charges"
  ON public.charges_sociales FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "Comptables can view client charges"
  ON public.charges_sociales FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.charges_sociales.client_id AND p.comptable_id = auth.uid()
    )
  );

-- ============================================================
-- RLS POLICIES — NOTIFICATIONS
-- ============================================================

CREATE POLICY "Admins can manage notifications"
  ON public.notifications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Users can view their notifications"
  ON public.notifications FOR SELECT
  USING (destinataire_id = auth.uid());

-- ============================================================
-- RLS POLICIES — ECRITURES COMPTABLES
-- ============================================================

CREATE POLICY "Admins can manage ecritures"
  ON public.ecritures_comptables FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Users can view ecritures in their dossiers"
  ON public.ecritures_comptables FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dossiers d
      WHERE d.id = public.ecritures_comptables.dossier_id
      AND (d.client_id = auth.uid() OR d.comptable_id = auth.uid())
    )
  );

-- ============================================================
-- TRIGGERS — Auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_societes
  BEFORE UPDATE ON public.societes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_dossiers
  BEFORE UPDATE ON public.dossiers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_documents
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_tva
  BEFORE UPDATE ON public.tva_mensuelle
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_rapports
  BEFORE UPDATE ON public.rapports_mensuels
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_charges
  BEFORE UPDATE ON public.charges_sociales
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- TRIGGER — Auto-create profile on user signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- STORAGE BUCKET — Documents
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can view their documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Admins can manage all documents"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ============================================================
-- SEED DATA — Sociétés initiales
-- ============================================================

INSERT INTO public.societes (nom, brn, numero_tva_mra, statut_tva) VALUES
  ('TIBOK', 'C07012345', 'VAT20230001', true),
  ('BPO', 'C08023456', 'VAT20230002', true),
  ('Obesity Care Malta', 'C09034567', 'VAT20230003', true),
  ('NHS S2', 'C10045678', 'VAT20230004', false)
ON CONFLICT DO NOTHING;
