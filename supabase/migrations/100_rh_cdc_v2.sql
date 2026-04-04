-- ============================================================
-- 100_rh_cdc_v2.sql
-- Lexora RH Module Improvements — CDC v2
-- Idempotent: safe to run multiple times
-- ============================================================

-- ============================================================
-- 1. ALTER TABLE employes — additional columns
-- ============================================================

-- photo_url already may exist (047), IF NOT EXISTS handles it
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS passport_no TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS email_personnel TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS medecin_travail_date DATE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS date_fin_periode_essai DATE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS situation_handicap BOOLEAN DEFAULT FALSE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS contact_urgence JSONB DEFAULT '{}'::jsonb;

-- nationalite may exist (047) with different default; add only if missing
DO $$ BEGIN
  ALTER TABLE public.employes ADD COLUMN nationalite TEXT DEFAULT 'MU';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- langue_preferee has CHECK constraint — needs DO block
DO $$ BEGIN
  ALTER TABLE public.employes ADD COLUMN langue_preferee TEXT DEFAULT 'FR'
    CHECK (langue_preferee IN ('FR', 'EN'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- statut_enrichi has CHECK constraint — needs DO block
DO $$ BEGIN
  ALTER TABLE public.employes ADD COLUMN statut_enrichi TEXT DEFAULT 'actif'
    CHECK (statut_enrichi IN ('actif', 'suspendu', 'preavis', 'parti', 'periode_essai'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- 2. ALTER TABLE bulletins_paie — additional columns
-- ============================================================

ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS pdf_genere_le TIMESTAMPTZ;
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS email_envoye_le TIMESTAMPTZ;
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS lu_le TIMESTAMPTZ;
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS version_pdf INTEGER DEFAULT 1;

-- qr_code_token has UNIQUE constraint — needs DO block
DO $$ BEGIN
  ALTER TABLE public.bulletins_paie ADD COLUMN qr_code_token TEXT UNIQUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- 3. ALTER TABLE documents — additional columns (if table exists)
-- ============================================================

DO $$ BEGIN
  -- categorie column already exists (TEXT, no CHECK); add CHECK constraint
  -- We add it as a named constraint so we can skip if it exists
  ALTER TABLE public.documents
    ADD CONSTRAINT documents_categorie_v2_check
    CHECK (categorie IN ('contrat', 'piece_identite', 'certificat', 'bulletin_archive', 'autre',
                         -- original values from type_document era
                         'facture_fournisseur', 'facture_client', 'releve_bancaire',
                         'fiche_paie', 'charges_sociales', 'contrat', 'autre'));
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS date_expiration DATE;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS signature_requise BOOLEAN DEFAULT FALSE;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS signe_le TIMESTAMPTZ;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS signe_par_employe BOOLEAN DEFAULT FALSE;

-- ============================================================
-- 4. ALTER TABLE demandes_conges — additional columns
-- ============================================================

ALTER TABLE public.demandes_conges ADD COLUMN IF NOT EXISTS certificat_url TEXT;
ALTER TABLE public.demandes_conges ADD COLUMN IF NOT EXISTS approuve_par JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.demandes_conges ADD COLUMN IF NOT EXISTS commentaire_refus TEXT;
ALTER TABLE public.demandes_conges ADD COLUMN IF NOT EXISTS niveau_approbation INTEGER DEFAULT 0;

-- ============================================================
-- 5. CREATE TABLE audit_logs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id),
  utilisateur_id UUID,
  entite TEXT NOT NULL,
  entite_id UUID,
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'VIEW', 'EXPORT', 'SEND')),
  valeur_avant JSONB,
  valeur_apres JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS: users can only see audit_logs for their own societe_id
DO $$ BEGIN
  CREATE POLICY "audit_logs_societe_isolation" ON public.audit_logs
    FOR ALL
    USING (
      societe_id IN (
        SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
        UNION
        SELECT cs.societe_id FROM public.comptable_societes cs WHERE cs.comptable_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_societe_created
  ON public.audit_logs (societe_id, created_at DESC);

-- ============================================================
-- 6. CREATE TABLE historique_salaires
-- ============================================================

CREATE TABLE IF NOT EXISTS public.historique_salaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id),
  salaire_precedent DECIMAL(12,2),
  salaire_nouveau DECIMAL(12,2),
  motif TEXT,
  date_effet DATE NOT NULL,
  modifie_par UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.historique_salaires ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "historique_salaires_auth" ON public.historique_salaires
    FOR ALL
    USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 7. CREATE TABLE contrats_emploi
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contrats_emploi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id),
  poste TEXT,
  type_contrat TEXT CHECK (type_contrat IN ('CDI', 'CDD', 'INTERIM', 'CONSULTANT')),
  date_debut DATE NOT NULL,
  date_fin DATE,
  departement TEXT,
  superviseur_id UUID REFERENCES public.employes(id),
  is_current BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contrats_emploi ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "contrats_emploi_auth" ON public.contrats_emploi
    FOR ALL
    USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Done
-- ============================================================
