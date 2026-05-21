-- ============================================================================
-- Migration 301 — Onboarding "Soldes d'ouverture" (journal AN automatique)
-- ============================================================================
--
-- Contexte :
--   Les migrations 291-300 ont corrigé un déséquilibre de 6 M MUR sur deux
--   sociétés clientes — causé par l'absence de saisie des soldes d'ouverture
--   lors de l'onboarding. Pour tout NOUVEAU client il manque l'étape
--   "soldes d'ouverture" (banques, clients, fournisseurs, immobilisations).
--
-- Objet :
--   1. Table `soldes_ouverture_saisie` (marker idempotence par société/exercice)
--   2. RPC `enregistrer_soldes_ouverture` :
--      - reçoit un JSONB de lignes (compte, nom_tiers, montant_mur, devise)
--      - génère les écritures équilibrées dans `ecritures_comptables_v2`
--        avec journal='AN', date = date_debut_exercice de la société
--      - contre-partie : 110 (Report à nouveau)
--      - retourne le nombre d'écritures créées + total débit/crédit
--   3. Idempotente : si un solde d'ouverture existe déjà pour (societe, exercice),
--      la RPC retourne le diff sans dupliquer.
--
-- Inspiration : pattern d'INSERT dans ecritures_comptables_v2 vu en mig 029
-- (generer_ecritures_paie), même conventions de colonnes (numero_compte,
-- nom_compte, libelle, description, debit_mur, credit_mur, journal, ref_folio).
--
-- IDEMPOTENTE.
-- ============================================================================

-- ── 1. Table de tracking des saisies de soldes d'ouverture ────────────────
CREATE TABLE IF NOT EXISTS public.soldes_ouverture_saisie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice TEXT NOT NULL,                  -- ex: '2025-2026'
  date_debut_exercice DATE NOT NULL,
  saisie_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saisie_par UUID REFERENCES auth.users(id),
  nb_lignes INTEGER DEFAULT 0,
  total_debit_mur NUMERIC(15,2) DEFAULT 0,
  total_credit_mur NUMERIC(15,2) DEFAULT 0,
  payload JSONB,                           -- snapshot du payload pour audit
  ecritures_ids UUID[],                    -- ids des écritures créées
  UNIQUE (societe_id, exercice)
);

CREATE INDEX IF NOT EXISTS idx_soldes_ouverture_saisie_societe
  ON public.soldes_ouverture_saisie(societe_id);

COMMENT ON TABLE public.soldes_ouverture_saisie IS
  'Marker idempotent de la saisie des soldes d''ouverture (journal AN). '
  'Une ligne par société et par exercice. Empêche les doublons d''écritures AN.';

ALTER TABLE public.soldes_ouverture_saisie ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'soldes_ouverture_saisie'
      AND policyname = 'soldes_ouverture_saisie_tenant_select'
  ) THEN
    CREATE POLICY soldes_ouverture_saisie_tenant_select
      ON public.soldes_ouverture_saisie
      FOR SELECT
      USING (
        -- accès via les helpers déjà installés (user_has_societe_access)
        EXISTS (
          SELECT 1 FROM public.societes s
          WHERE s.id = soldes_ouverture_saisie.societe_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'soldes_ouverture_saisie'
      AND policyname = 'soldes_ouverture_saisie_tenant_modify'
  ) THEN
    CREATE POLICY soldes_ouverture_saisie_tenant_modify
      ON public.soldes_ouverture_saisie
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ── 2. RPC : enregistre les soldes d'ouverture et génère les écritures AN ──
-- Signature :
--   p_societe_id UUID
--   p_exercice TEXT         (ex: '2025-2026')
--   p_lignes JSONB          (array : [{compte, nom_tiers, montant_mur,
--                                      devise_origine?, montant_origine?,
--                                      section}, ...])
--   p_user_id UUID          (saisie_par)
--   p_compte_contrepartie TEXT DEFAULT '110'  (Report à nouveau)
--   p_dry_run BOOLEAN DEFAULT FALSE
--
-- Retour : JSONB { status, nb_ecritures, total_debit, total_credit,
--                  saisie_id, deja_existante (bool), diff?, ecritures_ids }
--
-- Convention comptable PCM Mauritius :
--   - Actif (banques 512, clients 411, immo 2xx) : DÉBIT
--   - Passif (fournisseurs 401)                  : CRÉDIT
--   - Contre-partie : 110 Report à nouveau (équilibre du bilan d'ouverture)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enregistrer_soldes_ouverture(
  p_societe_id UUID,
  p_exercice TEXT,
  p_lignes JSONB,
  p_user_id UUID DEFAULT NULL,
  p_compte_contrepartie TEXT DEFAULT '110',
  p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_date_debut DATE;
  v_existing public.soldes_ouverture_saisie%ROWTYPE;
  v_ligne JSONB;
  v_compte TEXT;
  v_section TEXT;
  v_nom_tiers TEXT;
  v_montant NUMERIC(15,2);
  v_devise TEXT;
  v_montant_orig NUMERIC(15,4);
  v_total_debit NUMERIC(15,2) := 0;
  v_total_credit NUMERIC(15,2) := 0;
  v_nb INTEGER := 0;
  v_piece TEXT;
  v_libelle TEXT;
  v_description TEXT;
  v_ecr_id UUID;
  v_ecr_ids UUID[] := ARRAY[]::UUID[];
  v_saisie_id UUID;
  v_diff JSONB;
BEGIN
  -- ── 0. Sanity checks ──────────────────────────────────────────────────
  IF p_societe_id IS NULL THEN
    RAISE EXCEPTION 'societe_id requis';
  END IF;
  IF p_exercice IS NULL OR p_exercice = '' THEN
    RAISE EXCEPTION 'exercice requis (ex: 2025-2026)';
  END IF;
  IF p_lignes IS NULL OR jsonb_typeof(p_lignes) <> 'array' THEN
    RAISE EXCEPTION 'lignes doit être un tableau JSON';
  END IF;

  -- ── 1. Récupère la date_debut_exercice ────────────────────────────────
  SELECT date_debut_exercice INTO v_date_debut
    FROM public.societes WHERE id = p_societe_id;
  IF v_date_debut IS NULL THEN
    RAISE EXCEPTION 'Société % introuvable ou date_debut_exercice non renseignée', p_societe_id;
  END IF;

  -- ── 2. Idempotence : déjà saisi pour (societe, exercice) ? ─────────────
  SELECT * INTO v_existing
    FROM public.soldes_ouverture_saisie
    WHERE societe_id = p_societe_id AND exercice = p_exercice;

  IF FOUND THEN
    -- Calcul du diff : nb lignes / total débit / crédit demandés vs existant
    v_diff := jsonb_build_object(
      'nb_lignes_existantes', v_existing.nb_lignes,
      'nb_lignes_demandees', jsonb_array_length(p_lignes),
      'total_debit_existant', v_existing.total_debit_mur,
      'total_credit_existant', v_existing.total_credit_mur,
      'saisie_at', v_existing.saisie_at
    );
    RETURN jsonb_build_object(
      'status', 'deja_saisi',
      'deja_existante', true,
      'saisie_id', v_existing.id,
      'nb_ecritures', v_existing.nb_lignes,
      'total_debit', v_existing.total_debit_mur,
      'total_credit', v_existing.total_credit_mur,
      'ecritures_ids', v_existing.ecritures_ids,
      'diff', v_diff
    );
  END IF;

  -- ── 3. Numéro de pièce unique pour ce lot AN ──────────────────────────
  v_piece := 'AN-' || p_exercice || '-' || to_char(NOW(), 'YYYYMMDDHH24MISS');

  -- ── 4. Parcourt chaque ligne et insère l'écriture (sauf en dry run) ──
  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes)
  LOOP
    v_compte     := TRIM(COALESCE(v_ligne->>'compte', ''));
    v_section    := COALESCE(v_ligne->>'section', 'autre');
    v_nom_tiers  := COALESCE(v_ligne->>'nom_tiers', '');
    v_montant    := COALESCE((v_ligne->>'montant_mur')::NUMERIC, 0);
    v_devise     := NULLIF(v_ligne->>'devise_origine', '');
    v_montant_orig := NULLIF(v_ligne->>'montant_origine', '')::NUMERIC;

    -- Skip lignes vides
    IF v_compte = '' OR v_montant = 0 THEN
      CONTINUE;
    END IF;

    -- Détermine sens débit/crédit selon section
    -- (Actif → débit ; Passif → crédit)
    v_libelle := 'À-Nouveau ' || COALESCE(v_section, '') ||
                 CASE WHEN v_nom_tiers <> '' THEN ' — ' || v_nom_tiers ELSE '' END;
    v_description := v_libelle ||
                     CASE WHEN v_devise IS NOT NULL AND v_devise <> 'MUR'
                          THEN ' (' || v_devise || ' ' ||
                               COALESCE(v_montant_orig::TEXT, '?') || ')'
                          ELSE '' END;

    IF p_dry_run THEN
      v_nb := v_nb + 2;  -- ligne + contre-partie
      IF v_section IN ('banque', 'client', 'immobilisation') THEN
        v_total_debit := v_total_debit + v_montant;
        v_total_credit := v_total_credit + v_montant;
      ELSE
        v_total_credit := v_total_credit + v_montant;
        v_total_debit := v_total_debit + v_montant;
      END IF;
      CONTINUE;
    END IF;

    IF v_section IN ('banque', 'client', 'immobilisation') THEN
      -- ligne ACTIF : débit sur le compte, crédit sur contre-partie 110
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, date_ecriture, journal, ref_folio, numero_piece,
         numero_compte, nom_compte, libelle, description, debit_mur, credit_mur,
         exercice)
      VALUES (p_societe_id, v_date_debut, 'AN', v_piece, v_piece,
              v_compte, COALESCE(v_nom_tiers, v_compte), v_libelle, v_description,
              v_montant, 0, p_exercice)
      RETURNING id INTO v_ecr_id;
      v_ecr_ids := array_append(v_ecr_ids, v_ecr_id);

      INSERT INTO public.ecritures_comptables_v2
        (societe_id, date_ecriture, journal, ref_folio, numero_piece,
         numero_compte, nom_compte, libelle, description, debit_mur, credit_mur,
         exercice)
      VALUES (p_societe_id, v_date_debut, 'AN', v_piece, v_piece,
              p_compte_contrepartie, 'Report à nouveau (ouverture)',
              v_libelle, v_description,
              0, v_montant, p_exercice)
      RETURNING id INTO v_ecr_id;
      v_ecr_ids := array_append(v_ecr_ids, v_ecr_id);

      v_total_debit := v_total_debit + v_montant;
      v_total_credit := v_total_credit + v_montant;
      v_nb := v_nb + 2;

    ELSE
      -- ligne PASSIF (fournisseurs et autres) : crédit sur le compte,
      -- débit sur contre-partie 110
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, date_ecriture, journal, ref_folio, numero_piece,
         numero_compte, nom_compte, libelle, description, debit_mur, credit_mur,
         exercice)
      VALUES (p_societe_id, v_date_debut, 'AN', v_piece, v_piece,
              v_compte, COALESCE(v_nom_tiers, v_compte), v_libelle, v_description,
              0, v_montant, p_exercice)
      RETURNING id INTO v_ecr_id;
      v_ecr_ids := array_append(v_ecr_ids, v_ecr_id);

      INSERT INTO public.ecritures_comptables_v2
        (societe_id, date_ecriture, journal, ref_folio, numero_piece,
         numero_compte, nom_compte, libelle, description, debit_mur, credit_mur,
         exercice)
      VALUES (p_societe_id, v_date_debut, 'AN', v_piece, v_piece,
              p_compte_contrepartie, 'Report à nouveau (ouverture)',
              v_libelle, v_description,
              v_montant, 0, p_exercice)
      RETURNING id INTO v_ecr_id;
      v_ecr_ids := array_append(v_ecr_ids, v_ecr_id);

      v_total_debit := v_total_debit + v_montant;
      v_total_credit := v_total_credit + v_montant;
      v_nb := v_nb + 2;
    END IF;
  END LOOP;

  -- ── 5. Vérification d'équilibre (devrait toujours passer par construction) ─
  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'Déséquilibre AN: débit=% credit=% (diff=%)',
      v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
  END IF;

  -- ── 6. Enregistre le marker d'idempotence ─────────────────────────────
  IF NOT p_dry_run THEN
    INSERT INTO public.soldes_ouverture_saisie
      (societe_id, exercice, date_debut_exercice, saisie_par,
       nb_lignes, total_debit_mur, total_credit_mur, payload, ecritures_ids)
    VALUES
      (p_societe_id, p_exercice, v_date_debut, p_user_id,
       v_nb, v_total_debit, v_total_credit, p_lignes, v_ecr_ids)
    RETURNING id INTO v_saisie_id;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN p_dry_run THEN 'dry_run_ok' ELSE 'created' END,
    'deja_existante', false,
    'saisie_id', v_saisie_id,
    'nb_ecritures', v_nb,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit,
    'ecritures_ids', to_jsonb(v_ecr_ids),
    'journal', 'AN',
    'date_ecriture', v_date_debut,
    'piece', v_piece
  );
END $$;

COMMENT ON FUNCTION public.enregistrer_soldes_ouverture(
  UUID, TEXT, JSONB, UUID, TEXT, BOOLEAN
) IS
  'Enregistre les soldes d''ouverture d''une société pour un exercice donné. '
  'Génère des écritures équilibrées dans ecritures_comptables_v2 (journal AN) '
  'à la date_debut_exercice. Idempotente sur (societe_id, exercice).';

-- ============================================================================
-- FIN Migration 301
-- ============================================================================
