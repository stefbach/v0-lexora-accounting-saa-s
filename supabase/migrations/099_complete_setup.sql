-- ============================================================
-- LEXORA — SCRIPT COMPLET DE CREATION DE TOUTES LES TABLES
-- Exécuter dans le SQL Editor Supabase
-- Safe: utilise IF NOT EXISTS partout
-- ============================================================

-- ============================================================
-- 1. EMPLOYES — colonnes étendues
-- ============================================================
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS common_name TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS is_mauritian BOOLEAN DEFAULT TRUE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'M';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS date_naissance DATE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS statut_familial TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS education TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS badge_number TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS address_2 TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS postcode TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS type_contrat TEXT DEFAULT 'fulltime';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS office_site TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS working_days JSONB DEFAULT '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS departure_type TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS departure_reason TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS suspension_date DATE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS contribution_code TEXT DEFAULT 'S2';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS nsf_csg_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS paye_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS edf_total_deduction NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS paid_by_bank_transfer BOOLEAN DEFAULT TRUE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS phone_allowance NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS daily_bus_fare NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS prime_trimestrielle NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS it_equipment TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS internet_device TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS nic TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS tan TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS groupe TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS departement TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS date_poste_actuel DATE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS supervisor_id UUID;

-- Copier NIC/TAN si colonnes originales existent
DO $$ BEGIN
  UPDATE public.employes SET nic = nic_number WHERE nic IS NULL AND nic_number IS NOT NULL;
  UPDATE public.employes SET tan = tan_number WHERE tan IS NULL AND tan_number IS NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- ============================================================
-- 2. BULLETINS_PAIE — colonnes manquantes
-- ============================================================
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS montant_absence NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS jours_absence NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS comptabilise BOOLEAN DEFAULT FALSE;

-- ============================================================
-- 3. ECRITURES COMPTABLES — lettrage
-- ============================================================
ALTER TABLE public.ecritures_comptables ADD COLUMN IF NOT EXISTS lettre VARCHAR(10);
ALTER TABLE public.ecritures_comptables ADD COLUMN IF NOT EXISTS date_lettrage DATE;
ALTER TABLE public.ecritures_comptables ADD COLUMN IF NOT EXISTS lettrage_auto BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_ecritures_lettre ON public.ecritures_comptables(lettre);

-- ============================================================
-- 4. REGLES PRIMES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.regles_primes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'fixe',
  montant NUMERIC(15,2) DEFAULT 0,
  taux NUMERIC(5,2) DEFAULT 0,
  scope TEXT DEFAULT 'tous',
  scope_value TEXT,
  conditions JSONB DEFAULT '{}',
  periode TEXT DEFAULT 'mensuel',
  plafond NUMERIC(15,2),
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.regles_primes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rp_auth" ON public.regles_primes;
CREATE POLICY "rp_auth" ON public.regles_primes FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 5. CALCULS PRIMES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.calculs_primes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regle_prime_id UUID,
  employe_id UUID,
  societe_id UUID,
  periode TEXT NOT NULL,
  montant_calcule NUMERIC(15,2) DEFAULT 0,
  details JSONB DEFAULT '{}',
  statut TEXT DEFAULT 'calcule',
  valide_par UUID,
  valide_at TIMESTAMPTZ,
  integre_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.calculs_primes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cp_auth" ON public.calculs_primes;
CREATE POLICY "cp_auth" ON public.calculs_primes FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 6. COMPTES COURANTS ASSOCIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.comptes_courants_associes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  type TEXT DEFAULT 'associe',
  solde NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.comptes_courants_associes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cca_auth" ON public.comptes_courants_associes;
CREATE POLICY "cca_auth" ON public.comptes_courants_associes FOR ALL USING (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.mouvements_compte_courant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_courant_id UUID NOT NULL REFERENCES public.comptes_courants_associes(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id),
  date_mouvement DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'avance',
  montant NUMERIC(15,2) NOT NULL,
  description TEXT,
  facture_id UUID,
  lettre TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.mouvements_compte_courant ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mcc_auth" ON public.mouvements_compte_courant;
CREATE POLICY "mcc_auth" ON public.mouvements_compte_courant FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 7. FACTURES — colonnes étendues
-- ============================================================
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS mode_paiement TEXT DEFAULT 'banque';
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS paye_par TEXT;
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
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS contact_id UUID;

-- ============================================================
-- 8. CONTACTS FACTURATION
-- ============================================================
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
DROP POLICY IF EXISTS "fc_auth" ON public.factures_contacts;
CREATE POLICY "fc_auth" ON public.factures_contacts FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 9. CATALOGUE FACTURATION
-- ============================================================
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
DROP POLICY IF EXISTS "fcat_auth" ON public.factures_catalogue;
CREATE POLICY "fcat_auth" ON public.factures_catalogue FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 10. ROLE CLIENT_ASSISTANT
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin','super_admin','client_admin','client_user','client_assistant','comptable','comptable_dedie','rh','juridique','employe','manager','direction'));

-- ============================================================
-- 11. DOSSIERS — comptable_id nullable
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.dossiers ALTER COLUMN comptable_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- 12. SOCIETES — colonnes étendues
-- ============================================================
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS secteur_activite TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS ern TEXT;

-- ============================================================
-- 13. FK DOCUMENTS — ON DELETE SET NULL
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.releves_bancaires DROP CONSTRAINT IF EXISTS releves_bancaires_document_id_fkey;
  ALTER TABLE public.releves_bancaires ADD CONSTRAINT releves_bancaires_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- 14. RLS POLICIES RH
-- ============================================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "rh_employes_access" ON public.employes;
  CREATE POLICY "rh_employes_access" ON public.employes FOR ALL USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "rh_bulletins_access" ON public.bulletins_paie;
  CREATE POLICY "rh_bulletins_access" ON public.bulletins_paie FOR ALL USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "rh_pointages_access" ON public.pointages;
  CREATE POLICY "rh_pointages_access" ON public.pointages FOR ALL USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "rh_conges_access" ON public.demandes_conges;
  CREATE POLICY "rh_conges_access" ON public.demandes_conges FOR ALL USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- VERIFICATION FINALE
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
