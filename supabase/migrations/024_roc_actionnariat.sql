-- =============================================================================
-- Migration 024 — Annual Return ROC + Actionnariat
-- =============================================================================

-- Table des actionnaires
CREATE TABLE IF NOT EXISTS public.actionnaires (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id       UUID REFERENCES public.societes(id) ON DELETE CASCADE NOT NULL,
  nom              TEXT NOT NULL,
  prenom           TEXT,
  type_personne    TEXT DEFAULT 'physique' CHECK (type_personne IN ('physique','morale')),
  nationalite      TEXT DEFAULT 'mauricienne',
  adresse          TEXT,
  nb_actions       INTEGER DEFAULT 0,
  type_actions     TEXT DEFAULT 'ordinaires' CHECK (type_actions IN ('ordinaires','preferentielles','rerachetables')),
  valeur_nominale  NUMERIC(10,2) DEFAULT 1.00,
  pourcentage      NUMERIC(5,2),
  date_entree      DATE,
  date_sortie      DATE,
  actif            BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Table des administrateurs / dirigeants
CREATE TABLE IF NOT EXISTS public.administrateurs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id       UUID REFERENCES public.societes(id) ON DELETE CASCADE NOT NULL,
  nom              TEXT NOT NULL,
  prenom           TEXT,
  type             TEXT CHECK (type IN ('director','secretary','chairperson','ceo','cfo')),
  nationalite      TEXT DEFAULT 'mauricienne',
  adresse          TEXT,
  nic              TEXT,
  date_nomination  DATE,
  date_fin         DATE,
  actif            BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Table des déclarations Annual Return ROC
CREATE TABLE IF NOT EXISTS public.annual_returns_roc (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id        UUID REFERENCES public.societes(id) ON DELETE CASCADE NOT NULL,
  annee             INTEGER NOT NULL,
  date_agm          DATE,
  date_echeance     DATE,
  date_soumission   DATE,
  reference_roc     TEXT,
  statut            TEXT DEFAULT 'a_faire' CHECK (statut IN ('a_faire','en_cours','soumis','accepte','rejete')),
  actif_total       NUMERIC(15,2) DEFAULT 0,
  passif_total      NUMERIC(15,2) DEFAULT 0,
  chiffre_affaires  NUMERIC(15,2) DEFAULT 0,
  resultat_net      NUMERIC(15,2) DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, annee)
);

-- Étendre la table societes avec informations légales ROC
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS registered_office   TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS date_incorporation  DATE;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS nature_activite     TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS capital_social      NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS nb_actions_total    INTEGER DEFAULT 0;

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE public.actionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administrateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annual_returns_roc ENABLE ROW LEVEL SECURITY;

-- Actionnaires : admin et comptable ont accès complet, clients en lecture
CREATE POLICY "actionnaires_admin_comptable_full" ON public.actionnaires
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','comptable','comptable_dedie')
    )
  );

CREATE POLICY "actionnaires_client_read" ON public.actionnaires
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('client_admin','client_user')
    )
    AND EXISTS (
      SELECT 1 FROM public.societes s
      JOIN public.dossiers d ON d.societe_id = s.id
      WHERE s.id = actionnaires.societe_id
        AND d.client_id = auth.uid()
    )
  );

-- Administrateurs : admin et comptable ont accès complet, clients en lecture
CREATE POLICY "administrateurs_admin_comptable_full" ON public.administrateurs
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','comptable','comptable_dedie')
    )
  );

CREATE POLICY "administrateurs_client_read" ON public.administrateurs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('client_admin','client_user')
    )
    AND EXISTS (
      SELECT 1 FROM public.societes s
      JOIN public.dossiers d ON d.societe_id = s.id
      WHERE s.id = administrateurs.societe_id
        AND d.client_id = auth.uid()
    )
  );

-- Annual Returns ROC : admin et comptable ont accès complet, clients en lecture
CREATE POLICY "annual_returns_roc_admin_comptable_full" ON public.annual_returns_roc
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','comptable','comptable_dedie')
    )
  );

CREATE POLICY "annual_returns_roc_client_read" ON public.annual_returns_roc
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('client_admin','client_user')
    )
    AND EXISTS (
      SELECT 1 FROM public.societes s
      JOIN public.dossiers d ON d.societe_id = s.id
      WHERE s.id = annual_returns_roc.societe_id
        AND d.client_id = auth.uid()
    )
  );

-- =============================================================================
-- Index
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_actionnaires_societe ON public.actionnaires(societe_id);
CREATE INDEX IF NOT EXISTS idx_actionnaires_actif ON public.actionnaires(actif);
CREATE INDEX IF NOT EXISTS idx_administrateurs_societe ON public.administrateurs(societe_id);
CREATE INDEX IF NOT EXISTS idx_administrateurs_actif ON public.administrateurs(actif);
CREATE INDEX IF NOT EXISTS idx_annual_returns_societe ON public.annual_returns_roc(societe_id);
CREATE INDEX IF NOT EXISTS idx_annual_returns_annee ON public.annual_returns_roc(annee);
CREATE INDEX IF NOT EXISTS idx_annual_returns_statut ON public.annual_returns_roc(statut);
