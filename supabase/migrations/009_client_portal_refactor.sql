-- ============================================================
-- LEXORA — Migration 009: Client portal refactor
-- Messages, résumés mensuels, droits dossiers
-- ============================================================

-- Messages comptable ↔ client on documents
CREATE TABLE IF NOT EXISTS public.messages_document (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  expediteur_type TEXT CHECK (expediteur_type IN ('comptable', 'client')),
  expediteur_id UUID,
  message TEXT NOT NULL,
  lu BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_doc ON public.messages_document(document_id);
ALTER TABLE public.messages_document ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their messages" ON public.messages_document FOR ALL USING (true);

-- Résumés mensuels générés par Claude
CREATE TABLE IF NOT EXISTS public.resumes_mensuels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID,
  societe_id UUID REFERENCES public.societes(id),
  periode TEXT,
  resume_texte TEXT,
  conseil_texte TEXT,
  tresorerie_j30 NUMERIC(15,2),
  tresorerie_j60 NUMERIC(15,2),
  tresorerie_j90 NUMERIC(15,2),
  kpis_json JSONB,
  envoye_whatsapp BOOLEAN DEFAULT false,
  envoye_email BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resumes_periode ON public.resumes_mensuels(periode);
ALTER TABLE public.resumes_mensuels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comptables can manage resumes" ON public.resumes_mensuels FOR ALL
  USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
CREATE POLICY "Clients can read their resumes" ON public.resumes_mensuels FOR SELECT
  USING (public.get_my_role() IN ('client_admin'));

-- Droits d'accès aux dossiers par client
CREATE TABLE IF NOT EXISTS public.droits_dossiers_client (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE CASCADE,
  client_id UUID,
  peut_uploader BOOLEAN DEFAULT true,
  peut_lire BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.droits_dossiers_client ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can read droits" ON public.droits_dossiers_client FOR SELECT USING (true);
