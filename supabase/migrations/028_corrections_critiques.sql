-- =============================================================================
-- Migration 028 — Corrections critiques identifiées lors de l'audit du 28/03/2026
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colonnes manquantes sur societes (ERN pour déclarations MRA)
-- -----------------------------------------------------------------------------
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS ern              TEXT,           -- Employer Registration Number MRA
  ADD COLUMN IF NOT EXISTS tan_societe      TEXT,           -- Tax Account Number société
  ADD COLUMN IF NOT EXISTS brn              TEXT,           -- Business Registration Number (si pas déjà là)
  ADD COLUMN IF NOT EXISTS date_incorporation DATE,
  ADD COLUMN IF NOT EXISTS nature_activite  TEXT,
  ADD COLUMN IF NOT EXISTS registered_office TEXT,
  ADD COLUMN IF NOT EXISTS capital_social   NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nb_actions_total INTEGER DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. Colonnes manquantes sur employes (TAN pour déclarations PAYE + auth salarié)
-- -----------------------------------------------------------------------------
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS tan              TEXT,           -- Tax Account Number MRA (ex: A123456789)
  ADD COLUMN IF NOT EXISTS auth_user_id     UUID REFERENCES auth.users(id),  -- lien Auth Supabase
  ADD COLUMN IF NOT EXISTS email            TEXT;           -- email (si pas déjà ajouté par migration 017)

-- Index pour recherche par email et auth_user_id
CREATE INDEX IF NOT EXISTS idx_employes_email       ON public.employes(email);
CREATE INDEX IF NOT EXISTS idx_employes_auth_user   ON public.employes(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_employes_tan         ON public.employes(tan);

-- -----------------------------------------------------------------------------
-- 3. Colonne integre_paie manquante sur primes_variables_mois
-- -----------------------------------------------------------------------------
ALTER TABLE public.primes_variables_mois
  ADD COLUMN IF NOT EXISTS integre_paie     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_integration TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_primes_vars_non_integres
  ON public.primes_variables_mois(employe_id, periode)
  WHERE integre_paie = false AND approuve = true;

-- -----------------------------------------------------------------------------
-- 4. Colonne absent_justifie manquante sur pointages
-- -----------------------------------------------------------------------------
ALTER TABLE public.pointages
  ADD COLUMN IF NOT EXISTS absent_justifie  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS motif_absence    TEXT,
  ADD COLUMN IF NOT EXISTS type_absence     TEXT,   -- SL, AL, UL, MAT, PAT, ABS_INJUST
  ADD COLUMN IF NOT EXISTS duree_minutes    INTEGER; -- si pas déjà présente

-- Index pour requêtes paie sur les absences
CREATE INDEX IF NOT EXISTS idx_pointages_absent
  ON public.pointages(employe_id, date_pointage)
  WHERE absent_justifie = false AND heure_entree IS NULL;

-- -----------------------------------------------------------------------------
-- 5. Recréer contrats_employes (détruite par migration 016_paie_tibok_complet.sql)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrats_employes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id      UUID REFERENCES public.employes(id) ON DELETE CASCADE,
  societe_id      UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  type_contrat    TEXT DEFAULT 'CDI'
    CHECK (type_contrat IN ('CDI','CDD','Temps_partiel','Stage','Consultant','Freelance')),
  secteur         TEXT DEFAULT 'general',
  poste           TEXT,
  date_debut      DATE NOT NULL,
  date_fin        DATE,
  salaire_brut    NUMERIC(15,2),
  periode_essai_mois INTEGER DEFAULT 3,
  html_content    TEXT,                     -- HTML du contrat généré par IA
  pdf_url         TEXT,                     -- URL storage si PDF généré
  statut          TEXT DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon','signe','expire','resilie')),
  date_signature  DATE,
  signe_par       TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contrats_employe  ON public.contrats_employes(employe_id);
CREATE INDEX IF NOT EXISTS idx_contrats_societe  ON public.contrats_employes(societe_id);
CREATE INDEX IF NOT EXISTS idx_contrats_statut   ON public.contrats_employes(statut);

ALTER TABLE public.contrats_employes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "contrats_admin_rh" ON public.contrats_employes
    FOR ALL USING (public.get_my_role() IN ('admin','comptable','comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "contrats_employe_read" ON public.contrats_employes
    FOR SELECT USING (
      employe_id IN (
        SELECT id FROM public.employes
        WHERE auth_user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 6. Colonne comptabilise manquante sur bulletins_paie (utilisée dans comptabiliser/route.ts)
-- -----------------------------------------------------------------------------
ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS comptabilise     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_comptabilisation TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nb_ecritures_generees INTEGER DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 7. Colonnes manquantes sur heures_travaillees (utilisées dans recap-mensuel)
-- -----------------------------------------------------------------------------
ALTER TABLE public.heures_travaillees
  ADD COLUMN IF NOT EXISTS ot15             NUMERIC(5,2) DEFAULT 0,  -- alias heures_ot_1_5
  ADD COLUMN IF NOT EXISTS ot2              NUMERIC(5,2) DEFAULT 0,  -- alias heures_ot_2
  ADD COLUMN IF NOT EXISTS taux_horaire     NUMERIC(10,2) DEFAULT 0; -- alias taux_horaire_base

-- -----------------------------------------------------------------------------
-- 8. Ajouter colonne tan sur profiles pour portail salarié
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employe_id UUID REFERENCES public.employes(id);

CREATE INDEX IF NOT EXISTS idx_profiles_employe ON public.profiles(employe_id);

-- Trigger: quand un employé reçoit auth_user_id, lier aussi dans profiles
CREATE OR REPLACE FUNCTION public.sync_employe_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.auth_user_id IS NOT NULL AND OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id THEN
    UPDATE public.profiles SET employe_id = NEW.id WHERE id = NEW.auth_user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_employe_profile ON public.employes;
CREATE TRIGGER trigger_sync_employe_profile
  AFTER UPDATE OF auth_user_id ON public.employes
  FOR EACH ROW EXECUTE FUNCTION public.sync_employe_profile();

-- =============================================================================
-- FIN MIGRATION 028
-- =============================================================================
