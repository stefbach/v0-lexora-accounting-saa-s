-- ============================================================
-- Architecture multi-tenant : CLIENT → SOCIÉTÉ → données
-- ============================================================

-- 1. Table clients (l'entité contractuelle avec Lexora)
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  email_principal TEXT,
  telephone TEXT,
  adresse TEXT,
  plan TEXT DEFAULT 'premium' CHECK (plan IN ('comptabilite','rh','premium','compta_rh')),
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Lien client → sociétés (une société appartient à UN client)
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id);

-- 3. Lien profiles → client (un user appartient à UN client)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id);

-- 4. Index pour performance multi-tenant
CREATE INDEX IF NOT EXISTS idx_societes_client ON public.societes(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_client ON public.profiles(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employes_societe ON public.employes(societe_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_societe ON public.bulletins_paie(societe_id);
CREATE INDEX IF NOT EXISTS idx_ecritures_dossier ON public.ecritures_comptables(dossier_id);
CREATE INDEX IF NOT EXISTS idx_documents_dossier ON public.documents(dossier_id);
CREATE INDEX IF NOT EXISTS idx_factures_societe ON public.factures(societe_id);
CREATE INDEX IF NOT EXISTS idx_pointages_employe ON public.pointages(employe_id);
CREATE INDEX IF NOT EXISTS idx_demandes_conges_employe ON public.demandes_conges(employe_id);

-- 5. RLS sur clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admin_clients" ON public.clients FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "own_client" ON public.clients FOR SELECT USING (
    id IN (SELECT client_id FROM public.profiles WHERE id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Vue pour vérifier l'isolation des données
CREATE OR REPLACE VIEW public.vue_multi_tenant AS
SELECT
  c.id AS client_id,
  c.nom AS client_nom,
  s.id AS societe_id,
  s.nom AS societe_nom,
  (SELECT COUNT(*) FROM public.employes e WHERE e.societe_id = s.id) AS nb_employes,
  (SELECT COUNT(*) FROM public.dossiers d WHERE d.societe_id = s.id) AS nb_dossiers,
  (SELECT COUNT(*) FROM public.factures f WHERE f.societe_id = s.id) AS nb_factures
FROM public.clients c
LEFT JOIN public.societes s ON s.client_id = c.id
ORDER BY c.nom, s.nom;
