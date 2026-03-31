-- 1. PLANNING
CREATE TABLE IF NOT EXISTS public.plannings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  periode TEXT NOT NULL,
  nom TEXT,
  type TEXT CHECK (type IN ('standard','3x8','custom')) DEFAULT 'standard',
  statut TEXT CHECK (statut IN ('brouillon','publie','archive')) DEFAULT 'brouillon',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.planning_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  planning_id UUID NOT NULL REFERENCES public.plannings(id) ON DELETE CASCADE,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_code TEXT NOT NULL DEFAULT 'jour',
  heure_debut TIME,
  heure_fin TIME,
  heures_prevues DECIMAL(4,2) DEFAULT 8,
  est_repos BOOLEAN DEFAULT false,
  commentaire TEXT,
  UNIQUE(planning_id, employe_id, date)
);

CREATE TABLE IF NOT EXISTS public.shift_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  nom TEXT NOT NULL,
  type TEXT CHECK (type IN ('standard_semaine','3x8','2x12','custom')) DEFAULT 'standard_semaine',
  heures_par_jour DECIMAL(4,2) DEFAULT 8,
  jours_cycle INTEGER DEFAULT 7,
  weekend_est_ot BOOLEAN DEFAULT true,
  shifts JSONB NOT NULL DEFAULT '[]',
  actif BOOLEAN DEFAULT true,
  UNIQUE(societe_id, code)
);

-- 2. FRAIS KM
CREATE TABLE IF NOT EXISTS public.frais_km_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  tarif_par_km DECIMAL(6,2) NOT NULL DEFAULT 5.00,
  plafond_mensuel DECIMAL(10,2),
  vehicule_type TEXT DEFAULT 'voiture',
  actif BOOLEAN DEFAULT true,
  date_effet DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS public.frais_km_mois (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  periode DATE NOT NULL,
  km_parcourus DECIMAL(8,2) NOT NULL DEFAULT 0,
  tarif_applique DECIMAL(6,2) NOT NULL,
  montant DECIMAL(10,2) GENERATED ALWAYS AS (km_parcourus * tarif_applique) STORED,
  justificatif TEXT,
  approuve BOOLEAN DEFAULT false,
  approuve_par UUID,
  UNIQUE(employe_id, periode)
);

-- 3. CONGES AVANCES
CREATE TABLE IF NOT EXISTS public.leave_entitlements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  type_conge TEXT NOT NULL,
  jours_par_an DECIMAL(5,2) NOT NULL,
  prorata_entree BOOLEAN DEFAULT true,
  prorata_sortie BOOLEAN DEFAULT true,
  max_report DECIMAL(5,2) DEFAULT 5,
  min_anciennete_mois INTEGER DEFAULT 0,
  genre_requis TEXT CHECK (genre_requis IN ('F','M')),
  conditions JSONB DEFAULT '{}',
  actif BOOLEAN DEFAULT true,
  UNIQUE(societe_id, type_conge)
);

-- 4. VALIDATION PRE-PAIE
CREATE TABLE IF NOT EXISTS public.payroll_validations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  periode TEXT NOT NULL,
  statut TEXT CHECK (statut IN ('en_cours','anomalies','valide','genere')) DEFAULT 'en_cours',
  anomalies JSONB DEFAULT '[]',
  nb_employes INTEGER DEFAULT 0,
  nb_anomalies INTEGER DEFAULT 0,
  validated_by UUID,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CHAMPS MANQUANTS
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS qualification TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS shift_template_id UUID;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS cycle_type TEXT DEFAULT 'standard';

ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS shift_code TEXT;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS planning_assignment_id UUID;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS absence_type TEXT;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS auto_detected BOOLEAN DEFAULT false;

-- 6. RLS
ALTER TABLE public.plannings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frais_km_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frais_km_mois ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_validations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "rh_full_plannings" ON public.plannings FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "rh_full_pa" ON public.planning_assignments FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "rh_full_st" ON public.shift_templates FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "rh_full_fkr" ON public.frais_km_rules FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "rh_full_fkm" ON public.frais_km_mois FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "rh_full_le" ON public.leave_entitlements FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "rh_full_pv" ON public.payroll_validations FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Default leave entitlements for Mauritius (WRA 2019)
INSERT INTO public.leave_entitlements (societe_id, type_conge, jours_par_an, prorata_entree, max_report, min_anciennete_mois, genre_requis)
SELECT s.id, t.type_conge, t.jours, t.prorata, t.report, t.anciennete, t.genre
FROM public.societes s
CROSS JOIN (VALUES
  ('AL', 20, true, 5, 12, NULL),
  ('SL', 15, false, 0, 0, NULL),
  ('MAT', 84, false, 0, 0, 'F'),
  ('PAT', 5, false, 0, 0, 'M'),
  ('SANS_SOLDE', 0, false, 0, 0, NULL)
) AS t(type_conge, jours, prorata, report, anciennete, genre)
ON CONFLICT (societe_id, type_conge) DO NOTHING;
