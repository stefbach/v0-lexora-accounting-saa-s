-- ============================================================
-- LEXORA — Migration 005: Alertes comptable + assignations
-- ============================================================

-- 1. Add comptable_type and assigned_by to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS comptable_type TEXT CHECK (comptable_type IN ('principal', 'dedie')) DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES public.profiles(id);

-- Update existing comptable profiles
UPDATE public.profiles SET comptable_type = 'principal' WHERE role = 'comptable' AND comptable_type IS NULL;
UPDATE public.profiles SET comptable_type = 'dedie' WHERE role = 'comptable_dedie' AND comptable_type IS NULL;

-- 2. Assignations comptable table
CREATE TABLE IF NOT EXISTS public.assignations_comptable (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comptable_dedie_id UUID NOT NULL REFERENCES public.profiles(id),
  comptable_principal_id UUID NOT NULL REFERENCES public.profiles(id),
  modules_accessibles TEXT[] DEFAULT ARRAY['tva','banque','salaires','fournisseurs','clients','charges_sociales','rapports'],
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, comptable_dedie_id)
);

CREATE INDEX IF NOT EXISTS idx_assignations_client ON public.assignations_comptable(client_id);
CREATE INDEX IF NOT EXISTS idx_assignations_dedie ON public.assignations_comptable(comptable_dedie_id);
CREATE INDEX IF NOT EXISTS idx_assignations_principal ON public.assignations_comptable(comptable_principal_id);

ALTER TABLE public.assignations_comptable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage assignations"
  ON public.assignations_comptable FOR ALL
  USING (public.get_my_role() = 'admin');

CREATE POLICY "Comptables principaux can manage their assignations"
  ON public.assignations_comptable FOR ALL
  USING (comptable_principal_id = auth.uid());

CREATE POLICY "Comptables dedies can view their assignations"
  ON public.assignations_comptable FOR SELECT
  USING (comptable_dedie_id = auth.uid());

-- 3. Alertes comptable table
CREATE TABLE IF NOT EXISTS public.alertes_comptable (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comptable_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.profiles(id),
  societe_id UUID REFERENCES public.societes(id),
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

CREATE INDEX IF NOT EXISTS idx_alertes_comptable ON public.alertes_comptable(comptable_id);
CREATE INDEX IF NOT EXISTS idx_alertes_statut ON public.alertes_comptable(statut);
CREATE INDEX IF NOT EXISTS idx_alertes_niveau ON public.alertes_comptable(niveau);
CREATE INDEX IF NOT EXISTS idx_alertes_type ON public.alertes_comptable(type_alerte);

ALTER TABLE public.alertes_comptable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage alertes"
  ON public.alertes_comptable FOR ALL
  USING (public.get_my_role() = 'admin');

CREATE POLICY "Comptables can view their alertes"
  ON public.alertes_comptable FOR ALL
  USING (comptable_id = auth.uid());

CREATE POLICY "Comptables principaux can view all alertes"
  ON public.alertes_comptable FOR SELECT
  USING (public.get_my_role() = 'comptable');
