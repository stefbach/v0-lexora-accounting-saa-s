-- =============================================================================
-- Migration 019 — Nouveaux rôles + Rapprochement bancaire + Lettrage
-- =============================================================================

-- ============================================================
-- 1. Étendre les rôles dans la table profiles
-- ============================================================
-- Le champ role est TEXT dans profiles, on ajoute les nouveaux rôles
-- (pas de contrainte CHECK pour rester flexible)

-- Ajouter colonne permissions granulaires
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS societe_ids UUID[] DEFAULT '{}', -- sociétés accessibles pour ce user
  ADD COLUMN IF NOT EXISTS module_acces TEXT[] DEFAULT '{}'; -- modules autorisés

-- Index pour recherche par module
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ============================================================
-- 2. Table rapprochements_bancaires
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rapprochements_bancaires (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id          UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  compte_bancaire     VARCHAR(10) NOT NULL DEFAULT '512', -- compte PCM
  banque              VARCHAR(50),
  periode_debut       DATE NOT NULL,
  periode_fin         DATE NOT NULL,
  solde_releve        NUMERIC(15,2) NOT NULL DEFAULT 0,   -- solde selon relevé banque
  solde_comptable     NUMERIC(15,2) NOT NULL DEFAULT 0,   -- solde selon grand livre
  ecart               NUMERIC(15,2) GENERATED ALWAYS AS (solde_releve - solde_comptable) STORED,
  statut              VARCHAR(20) NOT NULL DEFAULT 'en_cours', -- en_cours | valide | ecart_justifie
  note                TEXT,
  valide_par          UUID REFERENCES public.profiles(id),
  valide_le           TIMESTAMPTZ,
  created_by          UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.rapprochements_bancaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rapprochement_auth" ON public.rapprochements_bancaires
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_rapproch_societe ON public.rapprochements_bancaires(societe_id);
CREATE INDEX IF NOT EXISTS idx_rapproch_periode ON public.rapprochements_bancaires(periode_debut, periode_fin);

-- ============================================================
-- 3. Table lignes_rapprochement : lier écritures ↔ relevé
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lignes_rapprochement (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rapprochement_id    UUID NOT NULL REFERENCES public.rapprochements_bancaires(id) ON DELETE CASCADE,
  type_ligne          VARCHAR(20) NOT NULL, -- 'ecriture' | 'releve'
  ecriture_id         UUID REFERENCES public.ecritures_comptables(id),
  -- Données relevé bancaire (si type='releve')
  date_releve         DATE,
  libelle_releve      TEXT,
  montant_releve      NUMERIC(15,2),
  sens_releve         CHAR(1), -- D ou C
  reference_banque    VARCHAR(100),
  -- Statut rapprochement de cette ligne
  statut              VARCHAR(20) NOT NULL DEFAULT 'non_rapproche', -- non_rapproche | rapproche | ecart
  ligne_liee_id       UUID REFERENCES public.lignes_rapprochement(id), -- ligne jumelle
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.lignes_rapprochement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lignes_rapproch_auth" ON public.lignes_rapprochement
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_lignes_rapproch ON public.lignes_rapprochement(rapprochement_id);
CREATE INDEX IF NOT EXISTS idx_lignes_statut ON public.lignes_rapprochement(statut);

-- ============================================================
-- 4. Lettrage des écritures comptables
-- ============================================================
-- Ajouter colonnes lettrage sur ecritures_comptables (si absentes)
ALTER TABLE public.ecritures_comptables
  ADD COLUMN IF NOT EXISTS lettre          VARCHAR(10),  -- code lettrage (A, B, C... ou AA, AB...)
  ADD COLUMN IF NOT EXISTS date_lettrage   DATE,
  ADD COLUMN IF NOT EXISTS lettrage_auto   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_ecritures_lettre ON public.ecritures_comptables(lettre)
  WHERE lettre IS NOT NULL;

-- ============================================================
-- 5. Fonction : lettrage automatique par montant/tiers
-- ============================================================
CREATE OR REPLACE FUNCTION public.lettrer_automatique(
  p_dossier_id UUID,
  p_compte     TEXT DEFAULT NULL  -- NULL = tous les comptes de tiers (4xx)
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_nb_lettres INTEGER := 0;
  v_lettre_code TEXT;
  v_seq INTEGER := 1;
  rec_debit RECORD;
  rec_credit RECORD;
BEGIN
  -- Générer des codes lettrage séquentiels (A, B, ..., Z, AA, AB, ...)
  FOR rec_debit IN
    SELECT e.id, e.compte, e.debit, e.credit
    FROM public.ecritures_comptables e
    WHERE e.dossier_id = p_dossier_id
      AND e.lettre IS NULL
      AND (p_compte IS NULL OR e.compte = p_compte)
      AND (e.compte LIKE '4%' OR e.compte LIKE '41%' OR e.compte LIKE '40%')
      AND e.debit > 0
    ORDER BY e.date_ecriture
  LOOP
    -- Chercher une écriture crédit du même montant sur le même compte
    SELECT ec.id INTO rec_credit
    FROM public.ecritures_comptables ec
    WHERE ec.dossier_id = p_dossier_id
      AND ec.lettre IS NULL
      AND ec.compte = rec_debit.compte
      AND ec.credit = rec_debit.debit
      AND ec.id != rec_debit.id
    ORDER BY ec.date_ecriture
    LIMIT 1;

    IF FOUND THEN
      -- Générer code lettrage
      v_lettre_code := CHR(64 + ((v_seq - 1) % 26 + 1));
      IF v_seq > 26 THEN
        v_lettre_code := CHR(64 + ((v_seq - 1) / 26)) || v_lettre_code;
      END IF;

      UPDATE public.ecritures_comptables
      SET lettre = v_lettre_code, date_lettrage = CURRENT_DATE, lettrage_auto = TRUE
      WHERE id IN (rec_debit.id, rec_credit.id);

      v_seq := v_seq + 1;
      v_nb_lettres := v_nb_lettres + 2;
    END IF;
  END LOOP;

  RETURN v_nb_lettres;
END;
$$;

-- ============================================================
-- 6. Vue : écritures non lettrées par compte
-- ============================================================
CREATE OR REPLACE VIEW public.vue_non_lettrees AS
SELECT
  e.dossier_id,
  e.compte,
  COUNT(*) AS nb_ecritures,
  SUM(e.debit) AS total_debit,
  SUM(e.credit) AS total_credit,
  SUM(e.debit) - SUM(e.credit) AS solde_non_lettre
FROM public.ecritures_comptables e
WHERE e.lettre IS NULL
  AND e.compte LIKE '4%'
GROUP BY e.dossier_id, e.compte
ORDER BY e.compte;

-- ============================================================
-- 7. Upload documents par les clients
-- ============================================================
-- Pas de changement schema — la table documents supporte déjà uploaded_by
-- On ajoute just une colonne source pour traçabilité
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS uploaded_by_role VARCHAR(30) DEFAULT 'comptable',
  ADD COLUMN IF NOT EXISTS client_note       TEXT,
  ADD COLUMN IF NOT EXISTS client_visible    BOOLEAN NOT NULL DEFAULT TRUE;

